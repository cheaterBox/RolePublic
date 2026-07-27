<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { Motion, AnimatePresence } from 'motion-v';
import { useDocumentsStore, type DocumentSummary, type DocumentFileEntry } from '../store/documents';
import { useSettingsStore } from '../store/settings';
import { useDialogStore } from '../store/dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import {
  ArrowLeft,
  Hammer,
  Download,
  Wand2,
  RotateCw,
  Loader2,
  X,
  FileCode,
  Terminal,
  FolderOpen,
  Plus,
  FolderPlus,
  Files,
  Save,
  PanelRight,
  Zap,
  Copy,
  Check,
  Star,
  Pencil,
  Hash,
} from '@lucide/vue';

import { Codemirror } from 'vue-codemirror';
import VuePdfEmbed from 'vue-pdf-embed';
import { latex, latexLanguage, autoCloseTags } from 'codemirror-lang-latex';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import FileTreeItem from './FileTreeItem.vue';

const props = defineProps<{ id: string }>();
const router = useRouter();
const settingsStore = useSettingsStore();
const documentsStore = useDocumentsStore();
const dialog = useDialogStore();

// Codemirror Extensions
const extensions = [
  latex(),
  latexLanguage,
  ...autoCloseTags,
  oneDark,
  EditorView.lineWrapping
];

// Types
interface FileItem {
  name: string;
  path: string;       // full rel_path within document
  isDir: boolean;
  children?: FileItem[];
  isOpen?: boolean;
}

// State
const docSummary = ref<DocumentSummary | null>(null);
const fileEntries = ref<DocumentFileEntry[]>([]);
const fileTree = ref<FileItem[]>([]);
const activeFilePath = ref<string | null>(null);   // active rel_path
const latexCode = ref('');
const contentMap = ref<Record<string, string>>({}); // in-memory file cache

const isLoadingDoc = ref(true);
const loadError = ref<string | null>(null);

const isSidebarVisible = ref(true);
const sidebarWidth = ref(240);
const isResizing = ref(false);

const isPreviewVisible = ref(true);
const previewWidth = ref(500);
const isResizingPreview = ref(false);
const splitPaneRef = ref<HTMLElement | null>(null);
const fileTreeContainerRef = ref<HTMLElement | null>(null);
const compilerContainerRef = ref<HTMLElement | null>(null);

const pdfUrl = ref<any>(null);
const pdfBytesBuffer = ref<Uint8Array | null>(null);
const isCompiling = ref(false);
const isFixing = ref(false);
const isRefining = ref(false);
const refinementInstruction = ref('');
const isDownloading = ref(false);
const compilationError = ref<string | null>(null);
const isCopyingError = ref(false);
const isDirty = ref(false);
const isProgrammaticChange = ref(false);
const isSaving = ref(false);

const handleCopyError = async () => {
  if (!compilationError.value) return;
  isCopyingError.value = true;
  try {
    await writeText(compilationError.value);
    setTimeout(() => { isCopyingError.value = false; }, 2000);
  } catch (err) {
    console.error('Failed to copy error:', err);
    isCopyingError.value = false;
  }
};
const editorContainer = ref<HTMLElement | null>(null);

const activeTooltip = ref<string | null>(null);

const isTitleEditing = ref(false);
const titleDraft = ref('');
const titleInput = ref<HTMLInputElement | null>(null);

const isDescExpanded = ref(false);

const workspaceName = computed(() => {
  if (!docSummary.value) return 'EXPLORER';
  return docSummary.value.title.toUpperCase() || 'EXPLORER';
});

// Save status
const saveStatus = computed(() => {
  if (isSaving.value) return 'Saving…';
  if (isCompiling.value) return 'Compiling…';
  if (isFixing.value) return 'Debugging…';
  if (isDirty.value) return 'Modified';
  return 'Saved';
});
const saveStatusClass = computed(() => {
  if (isSaving.value || isCompiling.value || isFixing.value) return 'status-busy';
  if (isDirty.value) return 'status-dirty';
  return 'status-saved';
});

// Workspace Management
const toggleSidebar = () => {
  isSidebarVisible.value = !isSidebarVisible.value;
};

const startResizing = (_e: MouseEvent) => {
  isResizing.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', stopResizing);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value || !splitPaneRef.value) return;
  const rect = splitPaneRef.value.getBoundingClientRect();
  const newWidth = e.clientX - rect.left;
  if (newWidth < 100) {
    isSidebarVisible.value = false;
    stopResizing();
    sidebarWidth.value = 240;
    return;
  }
  sidebarWidth.value = Math.max(180, Math.min(500, newWidth));
};

const stopResizing = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResizing);
};

const togglePreview = () => {
  isPreviewVisible.value = !isPreviewVisible.value;
};

const startResizingPreview = (_e: MouseEvent) => {
  isResizingPreview.value = true;
  document.addEventListener('mousemove', handlePreviewMouseMove);
  document.addEventListener('mouseup', stopResizingPreview);
};

const handlePreviewMouseMove = (e: MouseEvent) => {
  if (!isResizingPreview.value || !splitPaneRef.value) return;
  const rect = splitPaneRef.value.getBoundingClientRect();
  const newWidth = rect.right - e.clientX;
  if (newWidth < 100) {
    isPreviewVisible.value = false;
    stopResizingPreview();
    previewWidth.value = 450;
    return;
  }
  const currentSidebar = isSidebarVisible.value ? sidebarWidth.value : 0;
  const minWidth = 180;
  const maxWidth = rect.width - currentSidebar - 180;
  previewWidth.value = Math.max(minWidth, Math.min(maxWidth, newWidth));
};

const stopResizingPreview = () => {
  isResizingPreview.value = false;
  document.removeEventListener('mousemove', handlePreviewMouseMove);
  document.removeEventListener('mouseup', stopResizingPreview);

  // Force vue-pdf-embed to re-render to the new pane width
  nextTick(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

// Back navigation
const goBackToList = () => {
  router.push('/documents');
};

// Star toggle
const toggleStar = async () => {
  if (!docSummary.value) return;
  try {
    await documentsStore.setStarred(docSummary.value.id, !docSummary.value.starred);
    docSummary.value = { ...docSummary.value, starred: !docSummary.value.starred };
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Could not update star');
  }
};

// Title editing
const startTitleEdit = () => {
  if (!docSummary.value) return;
  titleDraft.value = docSummary.value.title;
  isTitleEditing.value = true;
  nextTick(() => {
    titleInput.value?.focus();
    titleInput.value?.select();
  });
};

const cancelTitleEdit = () => {
  isTitleEditing.value = false;
};

const commitTitleEdit = async () => {
  if (!docSummary.value) return;
  const trimmed = titleDraft.value.trim();
  if (!trimmed) {
    await dialog.showAlert('Title cannot be empty.', 'Invalid Title');
    return;
  }
  if (trimmed === docSummary.value.title) {
    isTitleEditing.value = false;
    return;
  }
  try {
    await documentsStore.updateDocument(docSummary.value.id, { title: trimmed });
    docSummary.value = { ...docSummary.value, title: trimmed };
    isTitleEditing.value = false;
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Rename Failed');
  }
};

// Description toggle / edit (toggle expand)
const toggleDescExpanded = () => {
  isDescExpanded.value = !isDescExpanded.value;
};

const commitDescriptionEdit = async (newDesc: string) => {
  if (!docSummary.value) return;
  if (newDesc === docSummary.value.description) return;
  try {
    await documentsStore.updateDocument(docSummary.value.id, { description: newDesc });
    docSummary.value = { ...docSummary.value, description: newDesc };
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Description Update Failed');
  }
};

// Document loading
const loadDocument = async () => {
  isLoadingDoc.value = true;
  loadError.value = null;
  contentMap.value = {};
  fileTree.value = [];
  activeFilePath.value = null;
  latexCode.value = '';
  isDirty.value = false;
  pdfUrl.value = null;

  try {
    const doc = await documentsStore.getDocumentById(props.id);
    docSummary.value = doc;

    const files = await documentsStore.listFiles(props.id);
    fileEntries.value = files;
    fileTree.value = buildTree(files);

    // Auto-open the main file if set; else the first file.
    let target = doc.main_file;
    if (!target || !files.some((f) => f.rel_path === target)) {
      // Pick first non-template file (prefer .tex)
      const texFile = files.find((f) => f.rel_path.toLowerCase().endsWith('.tex'));
      target = texFile ? texFile.rel_path : (files[0]?.rel_path ?? null);
    }
    if (target) {
      await selectFile(target);
    }
  } catch (err: any) {
    console.error('Failed to load document:', err);
    loadError.value = err.toString();
  } finally {
    isLoadingDoc.value = false;
  }
};

// Persistence & Initialization
onMounted(async () => {
  await loadDocument();
});

onUnmounted(() => {
  if (isDirty.value && activeFilePath.value) {
    void saveActiveFile();
  }
});

const buildTree = (entries: DocumentFileEntry[]): FileItem[] => {
  const root: FileItem = { name: '', path: '', isDir: true, children: [], isOpen: true };
  const dirMap = new Map<string, FileItem>();
  dirMap.set('', root);

  const sorted = [...entries].sort((a, b) => a.rel_path.localeCompare(b.rel_path));
  for (const entry of sorted) {
    const parts = entry.rel_path.split('/');
    let parentPath = '';
    let parent = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const nextPath = parentPath ? `${parentPath}/${dirName}` : dirName;
      let dirNode = dirMap.get(nextPath);
      if (!dirNode) {
        dirNode = { name: dirName, path: nextPath, isDir: true, children: [], isOpen: true };
        parent.children!.push(dirNode);
        dirMap.set(nextPath, dirNode);
      }
      parent = dirNode;
      parentPath = nextPath;
    }

    const fileName = parts[parts.length - 1];
    if (fileName === '_folder.keep.txt') {
      // Empty folders are represented by a hidden marker file in the backend.
      // The folder node itself has already been created by the loop above.
      continue;
    }

    parent.children!.push({
      name: fileName,
      path: entry.rel_path,
      isDir: false,
    });
  }

  // Make directory delete operations target their marker when they contain no
  // visible files. This keeps the file-only persistence model transparent.
  const markerByDir = new Map<string, string>();
  for (const entry of entries) {
    if (entry.rel_path.endsWith('/_folder.keep.txt')) {
      markerByDir.set(entry.rel_path.slice(0, -'/_folder.keep.txt'.length), entry.rel_path);
    }
  }
  const sortRec = (items: FileItem[]) => {
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const it of items) {
      if (it.isDir) {
        if (markerByDir.has(it.path) && !it.children?.length) {
          it.path = markerByDir.get(it.path)!;
        }
        if (it.children) sortRec(it.children);
      }
    }
  };
  sortRec(root.children!);
  return root.children!;
};

const refreshFileTree = async () => {
  try {
    const files = await documentsStore.listFiles(props.id);
    fileEntries.value = files;
    fileTree.value = buildTree(files);
  } catch (err) {
    console.error('Failed to refresh tree:', err);
  }
};

const selectFile = async (relPath: string) => {
  if (!relPath) return;
  if (isDirty.value && activeFilePath.value && activeFilePath.value !== relPath) {
    await saveActiveFile();
  }

  try {
    // Read from in-memory cache if available, otherwise from backend.
    let content: string;
    if (Object.prototype.hasOwnProperty.call(contentMap.value, relPath)) {
      content = contentMap.value[relPath];
    } else {
      content = await documentsStore.readFile(props.id, relPath);
      contentMap.value[relPath] = content;
    }
    isProgrammaticChange.value = true;
    latexCode.value = content;
    activeFilePath.value = relPath;
    isDirty.value = false;
    pdfUrl.value = null; // Reset preview for new file
  } catch (err: any) {
    await dialog.showAlert(`Failed to open file: ${err.message || err.toString()}`, 'Read Error');
  }
};

const saveActiveFile = async () => {
  if (!activeFilePath.value) return;
  isSaving.value = true;
  try {
    await documentsStore.writeFile(props.id, activeFilePath.value, latexCode.value);
    contentMap.value[activeFilePath.value] = latexCode.value;
    isDirty.value = false;
  } catch (err: any) {
    console.error('Failed to save file:', err);
    await dialog.showAlert(`Save failed: ${err.message || err.toString()}`, 'Write Error');
  } finally {
    isSaving.value = false;
  }
};

const createNewFile = async (parent: FileItem | null = null) => {
  const parentRel = parent?.path ?? null;
  const fileName = await dialog.showPrompt('Enter file name (e.g. main.tex):', '', 'New File');
  if (!fileName) return;

  // Auto-append .tex if no extension provided
  const finalName = fileName.includes('.') ? fileName : `${fileName}.tex`;

  const isTex = finalName.toLowerCase().endsWith('.tex');
  const initialContent = isTex
    ? '\\documentclass{article}\n\\begin{document}\n\nStart writing here...\n\n\\end{document}'
    : '';

  try {
    await documentsStore.createFile(props.id, parentRel, finalName, initialContent);
    await refreshFileTree();
    contentMap.value[parentRel ? `${parentRel}/${finalName}` : finalName] = initialContent;
    await selectFile(parentRel ? `${parentRel}/${finalName}` : finalName);
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Failed to create file');
  }
};

const createNewFolder = async (parent: FileItem | null = null) => {
  const folderName = await dialog.showPrompt('Enter folder name:', '', 'New Folder');
  if (!folderName) return;

  const parentRel = parent?.path ?? null;
  // The backend stores files (not empty directories), so anchor the new folder
  // with a small text placeholder that remains portable through backups.
  const placeholderName = '_folder.keep.txt';
  try {
    await documentsStore.createFile(props.id, parentRel, placeholderName, '');
    await refreshFileTree();
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Failed to create folder');
  }
};

const deleteItem = async (item: FileItem) => {
  if (!item.path) return;
  const confirmed = await dialog.showConfirm(
    `Are you sure you want to delete "${item.name}"?`,
    'Delete Item',
  );
  if (!confirmed) return;

  try {
    if (item.isDir) {
      // Recursively delete children first, then the directory's marker.
      const collectPaths = (node: FileItem): string[] => {
        const out: string[] = [];
        const walk = (n: FileItem) => {
          for (const c of n.children || []) walk(c);
          if (!n.isDir && n.path && !n.path.endsWith('_folder.keep.txt')) {
            out.push(n.path);
          }
        };
        walk(node);
        return out;
      };
      const childPaths = collectPaths(item);
      for (const p of childPaths) {
        await documentsStore.deleteFile(props.id, p);
      }
      // Now delete the folder marker (which is what item.path holds).
      await documentsStore.deleteFile(props.id, item.path);
    } else {
      await documentsStore.deleteFile(props.id, item.path);
    }

    // Clear active file if deleted
    if (activeFilePath.value === item.path || (activeFilePath.value && activeFilePath.value.startsWith(item.path + '/'))) {
      activeFilePath.value = null;
      latexCode.value = '';
      isDirty.value = false;
      pdfUrl.value = null;
      delete contentMap.value[item.path];
    }

    // Refresh local document summary (main_file may have been unset).
    const doc = await documentsStore.getDocumentById(props.id);
    docSummary.value = doc;

    await refreshFileTree();
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Failed to delete item');
  }
};

const renameItem = async (item: FileItem) => {
  if (!item.path) return;
  if (item.isDir) {
    await dialog.showAlert(
      'Renaming folders is not supported in this version. Create a new folder and move files into it.',
      'Rename Folder',
    );
    return;
  }
  const newName = await dialog.showPrompt('Enter new name:', item.name, 'Rename');
  if (!newName || newName === item.name) return;

  try {
    await documentsStore.renameFile(props.id, item.path, newName);
    await refreshFileTree();
    // Update active path if we renamed the active file.
    if (activeFilePath.value === item.path) {
      const parent = item.path.includes('/')
        ? item.path.substring(0, item.path.lastIndexOf('/'))
        : '';
      const newPath = parent ? `${parent}/${newName}` : newName;
      activeFilePath.value = newPath;
      contentMap.value[newPath] = contentMap.value[item.path];
      delete contentMap.value[item.path];
    }
    const doc = await documentsStore.getDocumentById(props.id);
    docSummary.value = doc;
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Failed to rename');
  }
};

const setMainFile = async (relPath: string) => {
  if (!docSummary.value) return;
  try {
    // Toggle off if clicking current main file
    const newPath = docSummary.value.main_file === relPath ? null : relPath;
    await documentsStore.setMainFile(docSummary.value.id, newPath);
    docSummary.value = { ...docSummary.value, main_file: newPath };
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Failed to set main file');
  }
};

const toggleFolder = (item: FileItem) => {
  item.isOpen = !item.isOpen;
};

// Auto-save & Compile logic
watch(latexCode, () => {
  if (isProgrammaticChange.value) {
    isProgrammaticChange.value = false;
    return;
  }
  isDirty.value = true;
});

const handleBlur = async () => {
  if (isDirty.value) {
    if (settingsStore.isAutoCompileEnabled) {
      // compilePdf internally calls and awaits saveActiveFile()
      await compilePdf();
    } else {
      await saveActiveFile();
    }
  }
};

// AI Refinement
const refineWithAi = async () => {
  if (!latexCode.value || !refinementInstruction.value.trim() || isRefining.value) return;

  isRefining.value = true;
  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error('API Key not found. Please set it in Settings.');

    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    const refinedCode = await invoke<string>('refine_latex_with_ai', {
      provider,
      model,
      apiKey,
      currentLatex: latexCode.value,
      instruction: refinementInstruction.value.trim(),
    });

    latexCode.value = refinedCode;
    refinementInstruction.value = '';
    await saveActiveFile();
    await compilePdf();
  } catch (err: any) {
    console.error('AI Refinement Error:', err);
    await dialog.showAlert(err.toString(), 'AI Refinement Failed');
  } finally {
    isRefining.value = false;
  }
};

// Compile PDF
const compilePdf = async () => {
  if (!docSummary.value) return;
  if (!docSummary.value.main_file) {
    await dialog.showAlert(
      'No main file is set. Right-click a .tex file in the tree and choose "Set as Main File".',
      'No Main File',
    );
    return;
  }

  isCompiling.value = true;
  compilationError.value = null;

  try {
    // Bulletproof: Force save before compile so the disk is in sync with the editor
    await saveActiveFile();

    const pdfBytes = await documentsStore.compile(docSummary.value.id);

    pdfBytesBuffer.value = pdfBytes;

    // Fetch port from DB
    const port = await invoke<string>('get_setting', {
      key: 'active_server_port',
      default_value: '1420',
    });

    pdfUrl.value = {
      url: `http://127.0.0.1:${port}/static-pdf/document_${docSummary.value.id}.pdf?cache-bust=${Date.now()}`,
      disableRange: false,
      disableStream: false,
      rangeChunkSize: 1024 * 1024,
    };

    compilationError.value = null;

    // Refresh summary to pick up last_compiled_at + compile_status.
    const doc = await documentsStore.getDocumentById(docSummary.value.id);
    docSummary.value = doc;
  } catch (err: any) {
    console.error('Compilation Error:', err);
    compilationError.value = err.message || err.toString();
    const doc = await documentsStore.getDocumentById(docSummary.value.id);
    docSummary.value = doc;
  } finally {
    isCompiling.value = false;
  }
};

const onPdfError = (err: any) => {
  console.error('PDF Rendering Error:', err);
  compilationError.value =
    'Frontend Rendering Error: Failed to stream or parse PDF chunks from the backend. ' +
    (err.message || err.toString());
};

// AI Fix
const fixWithAi = async () => {
  if (!latexCode.value || !compilationError.value || isFixing.value) return;

  isFixing.value = true;
  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error('API Key not found. Please set it in Settings.');

    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    const fixedCode = await invoke<string>('fix_latex_with_ai', {
      provider,
      model,
      apiKey,
      brokenLatex: latexCode.value,
      errorLogs: compilationError.value,
    });

    latexCode.value = fixedCode;
    compilationError.value = null;
    await saveActiveFile();
    await compilePdf();
  } catch (err: any) {
    console.error('AI Fix Error:', err);
    await dialog.showAlert(err.toString(), 'AI Fix Failed');
  } finally {
    isFixing.value = false;
  }
};

// Download PDF
const downloadPdf = async () => {
  if (!pdfBytesBuffer.value || !docSummary.value) return;
  isDownloading.value = true;

  try {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const defaultName =
      (activeFilePath.value
        ? activeFilePath.value.split(/[/\\]/).pop()?.replace(/\.tex$/i, '.pdf')
        : null) || `${docSummary.value.title.replace(/[^a-z0-9-_]/gi, '_')}_${timestamp}.pdf`;

    const filePath = await save({
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      defaultPath: defaultName,
    });

    if (filePath) {
      await writeFile(filePath, pdfBytesBuffer.value);
      const filename = filePath.split(/[/\\]/).pop() || defaultName;
      await invoke('record_download', {
        filename,
        downloadType: 'document',
        jobId: null,
        contentId: docSummary.value.id,
      });
      await dialog.showAlert('PDF downloaded successfully.', 'Success');
    }
  } catch (err: any) {
    console.error('Download Error:', err);
    await dialog.showAlert(err.toString(), 'Download Failed');
  } finally {
    isDownloading.value = false;
  }
};

const activeFileName = computed(() => {
  if (!activeFilePath.value) return 'unsaved.tex';
  return activeFilePath.value.split(/[/\\]/).pop() || 'file.tex';
});

const tagList = computed(() => {
  if (!docSummary.value?.tags) return [] as string[];
  return docSummary.value.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
});
</script>

<template>
  <div class="compiler-container" ref="compilerContainerRef">
    <header class="compiler-header">
      <div class="header-left">
        <button class="toggle-sidebar-btn" @click="goBackToList" title="Back to Documents">
          <ArrowLeft :size="18" />
        </button>
        <button class="toggle-sidebar-btn" @click="toggleSidebar" title="Toggle Sidebar">
          <PanelRight :size="18" class="rot-180" />
        </button>
        <button class="toggle-sidebar-btn" @click="togglePreview" title="Toggle PDF Preview">
          <PanelRight :size="18" />
        </button>
        <Files :size="20" class="header-icon" />
        <div v-if="!isTitleEditing" class="title-display" @dblclick="startTitleEdit" :title="docSummary?.title">
          <h1>{{ docSummary?.title || 'Loading...' }}</h1>
          <button class="title-edit-btn" @click="startTitleEdit" title="Rename"><Pencil :size="12" /></button>
        </div>
        <div v-else class="title-edit">
          <input
            ref="titleInput"
            v-model="titleDraft"
            class="title-input"
            @keyup.enter="commitTitleEdit"
            @keyup.escape="cancelTitleEdit"
            @blur="commitTitleEdit"
          />
        </div>
        <button
          v-if="docSummary"
          class="star-btn"
          :class="{ starred: docSummary.starred }"
          @click="toggleStar"
          :title="docSummary.starred ? 'Unstar' : 'Star'"
        >
          <Star :size="14" :fill="docSummary.starred ? 'currentColor' : 'none'" />
        </button>
        <span :class="['save-status-pill', saveStatusClass]">{{ saveStatus }}</span>
      </div>

      <div class="header-actions">
        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'auto-compile'" @mouseleave="activeTooltip = null">
          <button
            class="action-btn auto-compile-btn"
            :class="{ active: settingsStore.isAutoCompileEnabled }"
            @click="settingsStore.setAutoCompile(!settingsStore.isAutoCompileEnabled)"
          >
            <Zap :size="16" />
          </button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'auto-compile'"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="floating-message tooltip-bottom-left"
            >
              {{ settingsStore.isAutoCompileEnabled ? 'Auto Compile: Enabled' : 'Auto Compile: Disabled' }}
            </Motion>
          </AnimatePresence>
        </div>

        <div class="divider-v"></div>

        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'save'" @mouseleave="activeTooltip = null">
          <button
            v-if="isDirty"
            class="action-btn save-btn"
            @click="saveActiveFile"
          >
            <Save :size="16" />
          </button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'save' && isDirty"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="floating-message tooltip-bottom-left"
            >
              Save Changes
            </Motion>
          </AnimatePresence>
        </div>

        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'ai-fix'" @mouseleave="activeTooltip = null">
          <button
            v-if="compilationError"
            class="action-btn ai-btn"
            @click="fixWithAi"
            :disabled="isFixing"
          >
            <Wand2 :size="16" />
          </button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'ai-fix' && compilationError"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="floating-message tooltip-bottom-left"
            >
              Fix with AI
            </Motion>
          </AnimatePresence>
        </div>

        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'compile'" @mouseleave="activeTooltip = null">
          <button
            class="action-btn compile-btn"
            @click="compilePdf"
            :disabled="isCompiling || !docSummary?.main_file"
            title="Compile LaTeX"
          >
            <Hammer :size="16" />
          </button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'compile'"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="floating-message tooltip-bottom-left"
            >
              Compile LaTeX
            </Motion>
          </AnimatePresence>
        </div>

        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'download'" @mouseleave="activeTooltip = null">
          <button
            v-if="pdfUrl"
            class="action-btn download-btn"
            @click="downloadPdf"
            :disabled="isDownloading"
            title="Download PDF"
          >
            <Download :size="16" />
          </button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'download' && pdfUrl"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="floating-message tooltip-bottom-left"
            >
              Download PDF
            </Motion>
          </AnimatePresence>
        </div>
      </div>
    </header>

    <!-- Description / metadata strip -->
    <div v-if="docSummary" class="metadata-strip">
      <div class="metadata-row">
        <div v-if="docSummary.description || isDescExpanded" class="description-block">
          <p
            v-if="!isDescExpanded && docSummary.description"
            class="description-text collapsed"
            @click="toggleDescExpanded"
          >
            {{ docSummary.description }}
          </p>
          <textarea
            v-else
            class="description-input"
            :value="docSummary.description"
            placeholder="Add a description…"
            @blur="(e) => { commitDescriptionEdit((e.target as HTMLTextAreaElement).value); toggleDescExpanded(); }"
            @keyup.escape="toggleDescExpanded"
          />
        </div>
        <button v-if="docSummary.description && !isDescExpanded" class="show-more-btn" @click="toggleDescExpanded">Show more</button>
        <button v-else-if="!docSummary.description" class="show-more-btn" @click="toggleDescExpanded">+ Add description</button>
        <div v-if="tagList.length" class="tags-row">
          <Hash v-for="tag in tagList" :key="tag" :size="11" class="tag-hash" />
          <span v-for="tag in tagList" :key="`t-${tag}`" class="tag-pill">{{ tag }}</span>
        </div>
      </div>
    </div>

    <main class="compiler-main">
      <div class="split-pane" ref="splitPaneRef" :class="{ 'is-resizing': isResizing || isResizingPreview }">
        <!-- Sidebar File Explorer -->
        <aside v-if="isSidebarVisible" class="workspace-sidebar" :style="{ width: sidebarWidth + 'px' }">
          <div class="sidebar-header">
            <div class="sidebar-header-top" :title="docSummary?.title || 'Document'">
              <div class="workspace-name-row">
                <FolderOpen :size="14" class="workspace-folder-icon" />
                <span class="workspace-title">{{ workspaceName }}</span>
              </div>
              <span v-if="docSummary?.main_file" class="workspace-path-subtext">main: {{ docSummary.main_file }}</span>
            </div>
            <div class="sidebar-header-tools">
              <button class="header-tool-btn" @click="refreshFileTree" title="Refresh"><RotateCw :size="14" /></button>
              <button class="header-tool-btn" @click="createNewFile()" title="New File"><Plus :size="14" /></button>
              <button class="header-tool-btn" @click="createNewFolder()" title="New Folder"><FolderPlus :size="14" /></button>
            </div>
          </div>

          <div v-if="isLoadingDoc" class="sidebar-empty">
            <RotateCw :size="24" class="spinner" />
            <p>Loading document…</p>
          </div>

          <div v-else-if="loadError" class="sidebar-empty">
            <p class="error-text">{{ loadError }}</p>
            <button class="btn-primary-sm" @click="loadDocument">Retry</button>
          </div>

          <div v-else-if="fileTree.length === 0" class="sidebar-empty">
            <FolderOpen :size="32" />
            <p>No files yet</p>
            <div class="empty-actions">
              <button class="btn-primary-sm" @click="createNewFile()">New File</button>
            </div>
          </div>

          <div v-else class="file-tree" ref="fileTreeContainerRef">
            <FileTreeItem
              v-for="item in fileTree"
              :key="item.path"
              :item="item"
              :active-file-path="activeFilePath"
              :main-file-path="docSummary?.main_file"
              :on-toggle="toggleFolder"
              :on-select="(it: FileItem) => selectFile(it.path)"
              :on-set-main="(p: string) => setMainFile(p)"
              :on-create-file="createNewFile"
              :on-create-folder="createNewFolder"
              :on-delete="deleteItem"
              :on-rename="renameItem"
            />
          </div>
        </aside>

        <!-- Sidebar Resizer -->
        <div v-if="isSidebarVisible" class="sidebar-resizer" @mousedown="startResizing"></div>

        <!-- Editor Section -->
        <section class="editor-section">
          <div class="pane-header">
            <div class="pane-header-left">
              <FileCode :size="14" />
              <span>{{ activeFileName }}</span>
              <span v-if="isDirty" class="dirty-indicator">●</span>
            </div>
            <div class="pane-header-actions" v-if="activeFilePath">
              <button
                @click="saveActiveFile"
                class="save-icon-btn"
                :class="{ dirty: isDirty }"
                title="Save Changes"
              >
                <Save :size="14" />
              </button>
            </div>
          </div>
          <div class="editor-relative-wrapper" ref="editorContainer">
            <codemirror
              v-model="latexCode"
              placeholder="Select a file or start typing here..."
              :style="{ height: '100%' }"
              :autofocus="false"
              :indent-with-tab="true"
              :tab-size="2"
              :extensions="extensions"
              @blur="handleBlur"
              class="latex-editor-cm"
            />
          </div>
        </section>

        <!-- Preview Resizer -->
        <div v-if="isPreviewVisible" class="preview-resizer" @mousedown="startResizingPreview"></div>

        <!-- Preview Section -->
        <section v-if="isPreviewVisible" class="preview-section" :style="{ width: previewWidth + 'px', flex: 'none' }">
          <!-- Loading Overlay (Scoped to Preview) -->
          <AnimatePresence>
            <Motion
              v-if="isCompiling || isFixing"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :exit="{ opacity: 0 }"
              class="loading-overlay"
            >
              <div class="loader-content">
                <RotateCw :size="32" class="spinner" />
                <h3>{{ isFixing ? 'DEBUGGING...' : 'COMPILING...' }}</h3>
              </div>
            </Motion>
          </AnimatePresence>

          <div class="pane-header">
            <Terminal :size="14" />
            <span>PDF PREVIEW</span>
          </div>
          <div v-if="pdfUrl" class="pdf-viewer">
            <VuePdfEmbed :source="pdfUrl" class="pdf-embed-component" @error="onPdfError" />
          </div>
          <div v-else class="empty-preview">
            <div class="placeholder-content">
              <Hammer :size="48" />
              <h3 v-if="!docSummary?.main_file">No main file set</h3>
              <h3 v-else>No PDF generated</h3>
              <p v-if="!docSummary?.main_file">Right-click a .tex file in the tree and choose "Set as Main File".</p>
              <p v-else>Click "Compile" to generate a preview of your LaTeX code.</p>
            </div>
          </div>
        </section>
      </div>

      <!-- Error Console -->
      <AnimatePresence>
        <Motion
          v-if="compilationError"
          :initial="{ y: 100, opacity: 0 }"
          :animate="{ y: 0, opacity: 1 }"
          :exit="{ y: 100, opacity: 0 }"
          class="error-console"
        >
          <div class="console-header">
            <div class="title">
              <X :size="14" class="error-icon" />
              <span>COMPILATION ERROR</span>
            </div>
            <div class="console-actions">
              <button class="action-btn-inline" @click="handleCopyError" :title="isCopyingError ? 'Copied!' : 'Copy to Clipboard'">
                <Check v-if="isCopyingError" :size="14" class="success-icon" />
                <Copy v-else :size="14" />
              </button>
              <button class="action-btn-inline close-btn" @click="compilationError = null">
                <X :size="14" />
              </button>
            </div>
          </div>
          <div class="error-logs-container">
            <pre class="error-logs">{{ compilationError }}</pre>
          </div>
        </Motion>
      </AnimatePresence>
    </main>

    <!-- Floating Refinement AI Bar (Draggable across entire workspace) -->
    <AnimatePresence>
      <Motion
        v-if="latexCode"
        class="refinement-bar"
        drag
        :drag-constraints="compilerContainerRef || undefined"
        :drag-elastic="0.05"
        :initial="{ opacity: 0, y: -10, x: '-50%' }"
        :animate="{ opacity: 1, y: 0, x: '-50%' }"
        :exit="{ opacity: 0, y: -10, x: '-50%' }"
      >
        <input
          v-model="refinementInstruction"
          placeholder="Refine code (e.g. 'Add a table of contents')..."
          @keyup.enter="refineWithAi"
        />
        <button @click="refineWithAi" :disabled="isRefining">
          <Loader2 v-if="isRefining" :size="14" class="spinner" />
          <span v-else>→</span>
        </button>
      </Motion>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.compiler-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.compiler-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-accent);
  border-bottom: 1px solid var(--line);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.title-display {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.title-display h1 {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.title-edit-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.title-display:hover .title-edit-btn {
  opacity: 1;
}

.title-edit-btn:hover {
  color: var(--ink);
  background: var(--surface-soft);
}

.title-edit {
  display: flex;
  align-items: center;
}

.title-input {
  background: var(--surface);
  border: 1px solid var(--accent);
  color: var(--ink);
  font-size: 0.95rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  width: 280px;
}

.star-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: 0.15s;
}

.star-btn:hover {
  background: var(--surface-soft);
  color: var(--warning);
}

.star-btn.starred {
  color: var(--warning);
}

.save-status-pill {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.status-saved {
  background: var(--accent-soft);
  color: var(--accent);
}

.status-dirty {
  background: rgba(255, 196, 0, 0.15);
  color: #ffc400;
}

.status-busy {
  background: var(--surface-soft);
  color: var(--muted);
}

.toggle-sidebar-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: 0.15s;
}

.toggle-sidebar-btn:hover {
  background: var(--surface-soft);
  color: var(--ink);
}

.rot-180 {
  transform: rotate(180deg);
}

.header-icon {
  color: var(--accent);
}

.divider-v {
  width: 1px;
  height: 20px;
  background: var(--line);
  margin: 0 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-compile-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.2s;
  border: 1px solid var(--line);
  background: var(--surface-soft);
  color: var(--ink);
}

.action-btn:hover:not(:disabled) {
  border-color: var(--muted);
  background: var(--surface);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.compile-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.compile-btn:hover:not(:disabled) {
  opacity: 0.9;
  background: var(--accent);
}

.save-btn {
  border-color: var(--accent-soft);
  background: var(--accent-soft);
  color: var(--accent);
}

.save-btn:hover:not(:disabled) {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.ai-btn {
  color: #a371f7;
  border-color: rgba(163, 113, 247, 0.3);
}

.ai-btn:hover:not(:disabled) {
  background: rgba(163, 113, 247, 0.1);
  border-color: #a371f7;
}

.btn-tooltip-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.flying-message {
  position: absolute;
  background: var(--surface-soft);
  color: var(--ink);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--line);
}

/* Metadata strip below header */
.metadata-strip {
  padding: 6px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  font-size: 0.75rem;
  color: var(--muted);
}

.metadata-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.description-block {
  flex: 1;
  min-width: 0;
}

.description-text {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  color: var(--muted);
}

.description-text:hover {
  color: var(--ink);
}

.description-input {
  width: 100%;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-family: inherit;
  resize: vertical;
  min-height: 28px;
  outline: none;
}

.show-more-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.show-more-btn:hover {
  background: var(--accent-soft);
}

.tags-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-hash {
  color: var(--muted);
  display: none;
}

.tag-pill {
  font-size: 0.65rem;
  background: var(--surface-soft);
  color: var(--muted);
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.compiler-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.split-pane {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.split-pane.is-resizing object {
  pointer-events: none !important;
}

.split-pane.is-resizing {
  user-select: none !important;
  cursor: col-resize !important;
}

.workspace-sidebar {
  background: var(--bg-accent);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 180px;
  max-width: 500px;
}

.sidebar-resizer,
.preview-resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  z-index: 10;
  margin-left: -2px;
  margin-right: -2px;
}

.sidebar-resizer:hover,
.sidebar-resizer:active,
.preview-resizer:hover,
.preview-resizer:active {
  background: var(--accent);
}

.sidebar-header {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding: 8px 10px 6px 10px;
  gap: 6px;
}

.sidebar-header-top {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.workspace-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.workspace-folder-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.workspace-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--ink);
  letter-spacing: 0.03em;
}

.workspace-path-subtext {
  font-size: 0.6rem;
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}

.sidebar-header-tools {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--line-soft, rgba(255, 255, 255, 0.05));
}

.header-tool-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.header-tool-btn:hover {
  background: var(--surface-soft);
  color: var(--ink);
}

.sidebar-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  gap: 12px;
  padding: 20px;
  text-align: center;
}

.sidebar-empty p {
  font-size: 0.75rem;
  margin: 0;
}

.error-text {
  color: var(--warning);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem !important;
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-primary-sm {
  background: var(--accent);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.file-tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  padding: 8px 0;
}

.editor-section,
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.preview-section {
  border-left: 1px solid var(--line);
}

.pane-header {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-accent);
  border-bottom: 1px solid var(--line);
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--muted);
  letter-spacing: 0.05em;
}

.pane-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pane-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.save-icon-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.save-icon-btn:hover {
  background: var(--surface-soft);
  color: var(--ink);
}

.save-icon-btn.dirty {
  color: var(--accent);
}

.save-icon-btn.dirty:hover {
  background: var(--accent-soft);
}

.dirty-indicator {
  color: var(--accent);
  font-size: 10px;
  margin-left: -4px;
  text-shadow: 0 0 8px var(--accent);
  animation: pulse-dirty 2s infinite;
}

@keyframes pulse-dirty {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

.editor-relative-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #282c34;
}

.latex-editor-cm {
  flex: 1;
  width: 100%;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
}

:deep(.cm-editor) {
  height: 100%;
  outline: none !important;
}

:deep(.cm-content) {
  padding: 20px 0;
}

:deep(.cm-gutters) {
  background-color: #282c34 !important;
  border-right: 1px solid #3e4451 !important;
  color: #abb2bf !important;
}

.refinement-bar {
  position: absolute;
  top: 50px;
  left: 50%;
  width: 90%;
  max-width: 440px;
  background: var(--surface-soft);
  border: 1px solid var(--accent-soft);
  border-radius: 20px;
  display: flex;
  padding: 4px 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  cursor: grab;
}

.refinement-bar:active {
  cursor: grabbing;
}

.refinement-bar input {
  flex: 1;
  background: none;
  border: none;
  color: var(--ink);
  font-size: 0.75rem;
  padding: 8px 0;
  outline: none;
  cursor: text;
}

.refinement-bar button {
  background: var(--accent);
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  margin-left: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  align-self: center;
}

.refinement-bar button .spinner {
  color: white !important;
}

.pdf-viewer {
  flex: 1;
  display: block;
  background: var(--bg);
  position: relative;
  overflow: auto;
}

.pdf-embed-component {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: white;
}

.empty-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-accent);
  color: var(--muted);
  text-align: center;
  padding: 40px;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 300px;
}

.placeholder-content h3 {
  font-size: 1rem;
  color: var(--ink);
  margin: 0;
}

.error-console {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  max-height: 40%;
  background: var(--surface);
  border-top: 2px solid var(--warning);
  display: flex;
  flex-direction: column;
  z-index: 50;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.3);
}

.console-header {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-accent);
  border-bottom: 1px solid var(--line);
}

.console-actions {
  display: flex;
  gap: 8px;
}

.action-btn-inline {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: 0.15s;
}

.action-btn-inline:hover {
  background: var(--surface-soft);
  color: var(--ink);
}

.success-icon {
  color: var(--accent);
}

.close-btn:hover {
  color: var(--warning);
}

.error-logs-container {
  flex: 1;
  overflow-y: auto;
  background: var(--bg);
}

.error-logs {
  margin: 0;
  padding: 16px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: var(--ink);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.loading-overlay {
  position: absolute;
  top: 32px;
  left: 0;
  width: 100%;
  height: calc(100% - 32px);
  background: rgba(13, 17, 23, 0.9);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loader-content h3 {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.1em;
  margin: 0;
}

.spinner {
  color: var(--accent);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1024px) {
  .workspace-sidebar {
    width: 200px;
  }
}

@media (max-width: 768px) {
  .split-pane {
    flex-direction: column;
  }

  .workspace-sidebar {
    width: 100%;
    height: 200px;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }

  .editor-section {
    border-right: none;
    border-bottom: 1px solid var(--line);
  }

  .title-display h1 {
    max-width: 140px;
  }
}
</style>