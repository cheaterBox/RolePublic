<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDocumentsStore, type DocumentSummary } from '../store/documents';
import { useDialogStore } from '../store/dialog';
import { Motion, AnimatePresence } from 'motion-v';
import CustomSelect from './CustomSelect.vue';
import {
  Plus,
  Star,
  Trash2,
  Search,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  RefreshCw,
  File,
  Hash,
  Check,
} from '@lucide/vue';

const router = useRouter();
const documentsStore = useDocumentsStore();
const dialog = useDialogStore();

// Tooltip state
const activeTooltip = ref<string | null>(null);

// UI state
const search = ref('');
const sortMode = ref<'recent' | 'starred' | 'title'>('recent');
const showCreateForm = ref(false);
const isSelectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const isSubmitting = ref(false);

// Create form
const newTitle = ref('');
const newDescription = ref('');
const newTags = ref('');

const filteredDocs = computed(() => {
  const list = documentsStore.documents ?? [];
  const q = search.value.trim().toLowerCase();
  let result = q
    ? list.filter((d) =>
        (d.title + ' ' + (d.description ?? '') + ' ' + (d.tags ?? ''))
          .toLowerCase()
          .includes(q),
      )
    : list;

  const sorted = [...result];
  if (sortMode.value === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortMode.value === 'starred') {
    sorted.sort((a, b) => {
      if (a.starred === b.starred) {
        return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
      }
      return a.starred ? -1 : 1;
    });
  } else {
    sorted.sort(
      (a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? '') ||
        (a.starred === b.starred ? 0 : a.starred ? -1 : 1),
    );
  }
  return sorted;
});

const refreshData = async () => {
  await documentsStore.loadAllDocuments();
};

onMounted(refreshData);
watch(() => router.currentRoute.value.fullPath, async (path) => {
  if (path === '/documents') await refreshData();
});

const navigateToDoc = (id: string) => {
  router.push(`/document/${id}`);
};

const toggleStar = async (e: MouseEvent, doc: DocumentSummary) => {
  e.stopPropagation();
  try {
    await documentsStore.setStarred(doc.id, !doc.starred);
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Could not update star');
  }
};

const toggleSelection = (e: MouseEvent, id: string) => {
  e.stopPropagation();
  if (!isSelectionMode.value) return;
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedIds.value = s;
};

const startSelection = (e: MouseEvent, id: string) => {
  e.stopPropagation();
  isSelectionMode.value = true;
  selectedIds.value = new Set([id]);
};

const exitSelection = () => {
  isSelectionMode.value = false;
  selectedIds.value = new Set();
};

const batchDelete = async () => {
  if (selectedIds.value.size === 0) return;
  const confirmed = await dialog.showConfirm(
    `Delete ${selectedIds.value.size} document(s) and all their files? This cannot be undone.`,
    'Delete Documents',
  );
  if (!confirmed) return;

  isSubmitting.value = true;
  try {
    await documentsStore.deleteDocumentsBatch(Array.from(selectedIds.value));
    exitSelection();
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Delete Failed');
  } finally {
    isSubmitting.value = false;
  }
};

const submitCreate = async () => {
  const title = newTitle.value.trim();
  if (!title) {
    await dialog.showAlert('Title is required.', 'Create Document');
    return;
  }
  isSubmitting.value = true;
  try {
    const id = await documentsStore.createDocument({
      title,
      description: newDescription.value.trim(),
      tags: newTags.value.trim(),
    });
    showCreateForm.value = false;
    newTitle.value = '';
    newDescription.value = '';
    newTags.value = '';
    router.push(`/document/${id}`);
  } catch (err: any) {
    await dialog.showAlert(err.toString(), 'Create Failed');
  } finally {
    isSubmitting.value = false;
  }
};

const formatRelative = (s: string | null) => {
  if (!s) return 'Never compiled';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const diff = Date.now() - d.getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
};


</script>

<template>
  <div class="documents-container">
    <header class="header">
      <div class="header-left">
        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'create';" @mouseleave="activeTooltip = null;">
          <button class="btn-primary" @click="showCreateForm = true">
            <Plus :size="18" />
          </button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'create'"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="flying-message tooltip-bottom-right"
            >
              New Document
            </Motion>
          </AnimatePresence>
        </div>
        <div class="header-meta">
          <h2>DOCUMENTS</h2>
          <span class="subtitle">Overleaf-style multi-file LaTeX workspaces, backed up with your data</span>
        </div>
      </div>

      <div class="header-right">
        <div class="search-wrap">
          <Search :size="14" class="search-icon" />
          <input v-model="search" class="native-input" placeholder="Search…" />
        </div>
        <div class="sort-wrap">
          <CustomSelect
            v-model="sortMode"
            :options="[
              { value: 'recent', label: 'Recent' },
              { value: 'starred', label: 'Starred' },
              { value: 'title', label: 'Title (A→Z)' },
            ]"
            placement="bottom"
          />
        </div>
        <button
          v-if="!isSelectionMode && documentsStore.documents.length > 0"
          class="btn-ghost"
          @click="isSelectionMode = true"
        >
          Select
        </button>
        <div v-if="isSelectionMode" class="selection-bar">
          <span class="selection-count">{{ selectedIds.size }} selected</span>
          <button class="btn-danger" :disabled="selectedIds.size === 0 || isSubmitting" @click="batchDelete">
            <Trash2 :size="14" />
          </button>
          <button class="btn-ghost" @click="exitSelection">
            <X :size="14" />
          </button>
        </div>
      </div>
    </header>

    <div class="content">
      <div v-if="documentsStore.isLoading && documentsStore.documents.length === 0" class="loading">
        <RefreshCw :size="20" class="spinner" />
        <span>Loading documents…</span>
      </div>

      <div
        v-else-if="filteredDocs.length === 0 && documentsStore.documents.length === 0"
        class="empty"
      >
        <FileText :size="48" class="empty-icon" />
        <h3>No documents yet</h3>
        <p>Create your first document to start writing LaTeX in an Overleaf-style workspace.</p>
        <button class="btn-primary big" @click="showCreateForm = true">
          <Plus :size="18" />
          <span>Create your first document</span>
        </button>
      </div>

      <div v-else-if="filteredDocs.length === 0" class="empty compact">
        <p>No documents match your search.</p>
      </div>

      <div v-else class="grid">
        <Motion
          v-for="(doc, idx) in filteredDocs"
          :key="doc.id"
          :initial="{ opacity: 0, y: 12 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.2, delay: idx * 0.02 }"
          :class="['card', { selected: isSelectionMode && selectedIds.has(doc.id) }]"
          @click="isSelectionMode ? toggleSelection($event, doc.id) : navigateToDoc(doc.id)"
          @contextmenu.prevent="startSelection($event, doc.id)"
        >
          <div class="card-top">
            <button
              class="star-btn"
              :class="{ starred: doc.starred }"
              @click="toggleStar($event, doc)"
              :aria-label="doc.starred ? 'Unstar' : 'Star'"
            >
              <Star :size="14" :fill="doc.starred ? 'var(--accent)' : 'none'" />
            </button>
            <span
              v-if="doc.compile_status === 'success'"
              class="status-pill success"
            >
              <CheckCircle2 :size="10" />
              Compiled
            </span>
            <span
              v-else-if="doc.compile_status === 'error'"
              class="status-pill error"
            >
              <AlertCircle :size="10" />
              Error
            </span>
            <span v-else class="status-pill muted">
              <File :size="10" />
              Never built
            </span>
          </div>

          <h3 class="card-title">{{ doc.title }}</h3>
          <p v-if="doc.description" class="card-desc">{{ doc.description }}</p>
          <p v-else class="card-desc empty-line">No description</p>

          <div v-if="doc.tags" class="card-tags">
            <span v-for="tag in doc.tags.split(',').map((t) => t.trim()).filter(Boolean)" :key="tag" class="tag">
              <Hash :size="10" />
              {{ tag }}
            </span>
          </div>

          <footer class="card-footer">
            <span class="meta">
              <Clock :size="11" />
              {{ formatRelative(doc.last_compiled_at) }}
            </span>
            <span v-if="doc.main_file" class="meta mono truncate">
              <File :size="11" />
              {{ doc.main_file }}
            </span>
          </footer>
        </Motion>
      </div>
    </div>

    <!-- Create Document Modal -->
    <AnimatePresence>
      <Motion
        v-if="showCreateForm"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        class="modal-overlay"
        @click.self="showCreateForm = false"
      >
        <Motion
          :initial="{ opacity: 0, scale: 0.95, y: 20 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :exit="{ opacity: 0, scale: 0.95, y: 20 }"
          :transition="{ type: 'spring', damping: 25, stiffness: 300 }"
          class="modal-card"
        >
          <div class="modal-head">
            <div>
              <h2>Create Document</h2>
              <p>Multi-file LaTeX workspace with live PDF preview.</p>
            </div>
            <button class="close-btn" @click="showCreateForm = false">
              <X :size="16" />
            </button>
          </div>
          <div class="modal-body">
            <label class="field-label">Title</label>
            <input
              v-model="newTitle"
              class="native-input"
              placeholder="e.g. Research Paper"
              autofocus
              @keyup.enter="submitCreate"
            />
            <label class="field-label">Description (optional)</label>
            <textarea
              v-model="newDescription"
              class="native-textarea"
              placeholder="What is this document about?"
              rows="3"
            />
            <label class="field-label">Tags (comma separated)</label>
            <input
              v-model="newTags"
              class="native-input"
              placeholder="e.g. thesis, draft"
            />
            <div class="info-banner">
              <AlertCircle :size="14" />
              <div>
                <strong>Heads up:</strong>
                Text files (.tex, .bib, .cls, .sty, .md, .mmd, .txt, .cfg) are included in
                your local and S3 backups. Binary figures (PNG, JPG, PDF) are not — keep those backed up separately.
              </div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn-cancel" @click="showCreateForm = false">Cancel</button>
            <button class="btn-confirm" :disabled="isSubmitting || !newTitle.trim()" @click="submitCreate">
              <Check v-if="!isSubmitting" :size="14" />
              <RefreshCw v-else :size="14" class="spinner" />
              <span>Create</span>
            </button>
          </div>
        </Motion>
      </Motion>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.documents-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-accent);
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: filter 0.2s ease;
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary.big {
  width: auto;
  padding: 0 16px;
  height: 42px;
  gap: 8px;
  font-weight: 700;
  font-size: 0.85rem;
}

.btn-ghost {
  background: var(--surface-soft);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 0 14px;
  height: 34px;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.15s;
}
.btn-ghost:hover {
  border-color: var(--muted);
}

.btn-danger {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--warning);
  border: 1px solid var(--warning);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-danger:hover:not(:disabled) {
  background: var(--warning);
  color: white;
}

.header-meta h2 {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
  letter-spacing: 0.04em;
}
.subtitle {
  display: block;
  font-size: 0.7rem;
  color: var(--muted);
  margin-top: 2px;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 10px;
  color: var(--muted);
}
.search-wrap .native-input {
  padding-left: 30px;
  font-size: 0.8rem;
  height: 34px;
  width: 200px;
}
.sort-wrap {
  width: 160px;
}
.sort-wrap :deep(.custom-select-trigger) {
  height: 34px;
  padding: 6px 12px;
  font-size: 0.8rem;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--accent-soft);
}
.selection-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent);
  padding: 0 6px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  height: 100%;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  color: var(--muted);
  gap: 12px;
}
.empty.compact {
  height: auto;
  padding: 40px;
}
.empty-icon {
  color: var(--muted);
  opacity: 0.5;
}
.empty h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}
.empty p {
  font-size: 0.85rem;
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.15s ease;
  position: relative;
}
.card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.card.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.star-btn {
  background: none;
  border: none;
  color: var(--muted);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
}
.star-btn.starred {
  color: var(--accent);
}
.star-btn:hover {
  color: var(--accent);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 100px;
  font-size: 0.6rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.status-pill.success {
  background: var(--accent-soft);
  color: var(--accent);
}
.status-pill.error {
  background: rgba(248, 81, 73, 0.15);
  color: var(--warning);
}
.status-pill.muted {
  background: var(--surface-soft);
  color: var(--muted);
}

.card-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-desc {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
.card-desc.empty-line {
  opacity: 0.5;
  font-style: italic;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.65rem;
  color: var(--muted);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 0.7rem;
  color: var(--muted);
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mono {
  font-family: 'JetBrains Mono', monospace;
}
.truncate {
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-card {
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 20px 0 20px;
}
.modal-head h2 {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
}
.modal-head p {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 4px 0 0;
}
.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
}
.close-btn:hover {
  background: var(--surface-soft);
}
.modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 8px;
}
.native-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  color: var(--ink);
  font-size: 0.85rem;
  outline: none;
  font-family: inherit;
  resize: vertical;
}
.native-textarea:focus {
  border-color: var(--accent);
}
.native-input:focus {
  border-color: var(--accent);
}
.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(58, 134, 255, 0.1);
  border: 1px solid rgba(58, 134, 255, 0.2);
  border-radius: var(--radius-md);
  margin-top: 12px;
  font-size: 0.75rem;
  color: var(--ink);
  line-height: 1.4;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 20px 20px;
  border-top: 1px solid var(--line);
}
.btn-cancel {
  background: var(--surface-soft);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-confirm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-tooltip-wrapper {
  position: relative;
  display: flex;
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
.flying-message::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--surface-soft);
}
.tooltip-bottom-right {
  top: calc(100% + 8px);
  left: 0;
}
.tooltip-bottom-right::after {
  left: 16px;
  transform: none;
}

.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .search-wrap .native-input {
    width: 140px;
  }
}
</style>
