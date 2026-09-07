<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { save, message, ask } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { copyToClipboard } from '../utils/clipboard';
import { Motion, AnimatePresence } from 'motion-v';
import { useSettingsStore } from '../store/settings';
import { useResumesStore } from '../store/resumes';
import { useCoverLettersStore } from '../store/cover_letters';
import { useHrMessagesStore } from '../store/hr_messages';
import { useDialogStore } from '../store/dialog';
import { useJobsStore, Job } from '../store/jobs';
import { useScoringStore } from '../store/scoring';
import CustomSelect from './CustomSelect.vue';
import VirtualizedPdfViewer from './VirtualizedPdfViewer.vue';
// Codemirror imports
import { Codemirror } from 'vue-codemirror';
import { latex, latexLanguage, autoCloseTags } from 'codemirror-lang-latex';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

import {
  ArrowLeft,
  Trash2,
  ExternalLink,
  Save,
  Hammer,
  Download,
  Wand2,
  Play,
  RotateCw,
  Loader2,
  Info,
  ListChecks,
  Settings,
  Briefcase,
  Layers,
  Activity,
  Mail,
  FileText,
  Columns,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Copy,
  Check,
} from '@lucide/vue';

interface TemplateItem {
  id: string;
  name: string;
}

interface TailoredContent {
  id: string;
  base_template_id: string;
  content: string;
}

const router = useRouter();
const settingsStore = useSettingsStore();
const resumesStore = useResumesStore();
const clStore = useCoverLettersStore();
const hrStore = useHrMessagesStore();
const dialog = useDialogStore();
const jobsStore = useJobsStore();
const scoringStore = useScoringStore();

const props = defineProps<{ id: string }>();

// Tracking tailored IDs
const tailoredResumeId = ref<string | null>(null);
const tailoredClId = ref<string | null>(null);

// Dirty State Tracking
const isResumeDirty = ref(false);
const isClDirty = ref(false);
const isHrDirty = ref(false);

const hasUnsavedChanges = computed(() => {
  if (activeMode.value === 'resume') return isResumeDirty.value;
  if (activeMode.value === 'cl') return isClDirty.value;
  return isHrDirty.value;
});

// Codemirror Extensions
const extensions = [
  latex(),
  latexLanguage,
  ...autoCloseTags,
  oneDark,
  EditorView.lineWrapping
];

// Tooltip State
const activeTooltip = ref<string | null>(null);

// Global State
const isLoading = ref(true);
const isGeneratingResume = ref(false);
const isGeneratingCl = ref(false);
const isGeneratingHr = ref(false);
const isGenerating = computed(() => {
  if (activeMode.value === 'resume') return isGeneratingResume.value;
  if (activeMode.value === 'cl') return isGeneratingCl.value;
  return isGeneratingHr.value;
});

const isCompilingResume = ref(false);
const isCompilingCl = ref(false);
const isCompilingPDF = computed(() => activeMode.value === 'resume' ? isCompilingResume.value : isCompilingCl.value);

const error = ref<string | null>(null);
const isBannerErrorCopied = ref(false);
const handleCopyBannerError = async () => {
  if (!error.value) return;
  const ok = await copyToClipboard(error.value);
  if (ok) {
    isBannerErrorCopied.value = true;
    setTimeout(() => { isBannerErrorCopied.value = false; }, 2000);
  }
};

const isCompErrorCopied = ref(false);
const handleCopyCompError = async () => {
  if (!activeCompError.value) return;
  const ok = await copyToClipboard(activeCompError.value);
  if (ok) {
    isCompErrorCopied.value = true;
    setTimeout(() => { isCompErrorCopied.value = false; }, 2000);
  }
};

const isScoringErrorCopied = ref(false);
const handleCopyScoringError = async () => {
  if (!scoringStore.error) return;
  const ok = await copyToClipboard(scoringStore.error);
  if (ok) {
    isScoringErrorCopied.value = true;
    setTimeout(() => { isScoringErrorCopied.value = false; }, 2000);
  }
};

const activeMode = ref<'resume' | 'cl' | 'hr'>('resume');
const jobDetails = ref<Job | null>(null);
const editorContainer = ref<HTMLElement | null>(null);

// Resume Specific State
const resumeSelectedId = ref<string | null>(null);
const resumeInstruction = ref('');
const resumeLatex = ref('');
const resumePdfUrl = ref<any>(null);
const resumePdfBytes = ref<Uint8Array | null>(null);
const resumeCompError = ref<string | null>(null);

// Cover Letter Specific State
const clSelectedId = ref<string | null>(null);
const clInstruction = ref('');
const clLatex = ref('');
const clPdfUrl = ref<any>(null);
const clPdfBytes = ref<Uint8Array | null>(null);
const clCompError = ref<string | null>(null);

// HR Specific State
const hrSelectedId = ref<string>('');
const hrInstruction = ref('');
const hrMessageContent = ref('');
const recruiterName = ref('');
const recruiterContact = ref('');
const isCopiedHr = ref(false);
const isRefiningHr = ref(false);

const hrCharCount = computed(() => hrMessageContent.value.length);
const hrWordCount = computed(() => {
  const text = hrMessageContent.value.trim();
  return text ? text.split(/\s+/).length : 0;
});
const isLinkedInSafe = computed(() => hrCharCount.value <= 200);

const applySelectedHrTemplate = (markDirty = true) => {
  if (!hrSelectedId.value) return;
  const tmpl = hrStore.templates.find(t => t.id === hrSelectedId.value);
  if (!tmpl) return;

  const comp = jobDetails.value?.company_name || 'the company';
  const role = jobDetails.value?.job_title || 'the open role';
  const rec = recruiterName.value.trim() || 'Hiring Manager';
  const cand = 'Candidate';

  let text = tmpl.content;
  text = text.replace(/\{recruiter_name\}/g, rec);
  text = text.replace(/\{company_name\}/g, comp);
  text = text.replace(/\{job_title\}/g, role);
  text = text.replace(/\{candidate_name\}/g, cand);

  hrMessageContent.value = text;
  if (markDirty) isHrDirty.value = true;
};

const copyHrMessage = async () => {
  if (!hrMessageContent.value) return;
  try {
    await writeText(hrMessageContent.value);
    isCopiedHr.value = true;
    setTimeout(() => { isCopiedHr.value = false; }, 2000);
  } catch (e) {
    console.error("Failed to copy HR message:", e);
  }
};

const openRecruiterContact = async () => {
  const contact = recruiterContact.value.trim();
  if (!contact) return;
  try {
    if (contact.includes('@') && !contact.startsWith('http')) {
      const subject = encodeURIComponent(`Regarding ${jobDetails.value?.job_title || 'the role'} at ${jobDetails.value?.company_name || 'your team'}`);
      const body = encodeURIComponent(hrMessageContent.value);
      await openUrl(`mailto:${contact}?subject=${subject}&body=${body}`);
    } else if (contact.startsWith('http://') || contact.startsWith('https://')) {
      await openUrl(contact);
    } else {
      await openUrl(`https://${contact}`);
    }
  } catch (e) {
    console.error('Failed to open recruiter contact:', e);
  }
};

const saveHrMessage = async (silent = false) => {
  try {
    await hrStore.saveTailoredMessage(props.id, hrMessageContent.value);
    isHrDirty.value = false;
    if (!silent) await message('HR message saved successfully.', { title: 'Success', kind: 'info' });
  } catch (err: any) {
    console.error("Save Error:", err);
    if (!silent) await message(`Failed to save changes: ${err.toString()}`, { title: 'Save Failed', kind: 'error' });
  }
};

const generateHrContent = async () => {
  if (!jobDetails.value) return;
  isGeneratingHr.value = true;
  error.value = null;
  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error("API Key not found. Please set it in Settings.");

    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    const baseTmpl = hrStore.templates.find(t => t.id === hrSelectedId.value);
    const baseText = hrMessageContent.value.trim() || (baseTmpl ? baseTmpl.content : '');
    if (!baseText) {
      throw new Error("Please select an HR template or enter an outreach message to tailor.");
    }

    const promptInstruction = `You are an elite career outreach messaging expert. Tailor the following outreach message specifically for this job and company.
Target Company: ${jobDetails.value.company_name}
Role Title: ${jobDetails.value.job_title}
Recruiter / Contact Name: ${recruiterName.value || 'Hiring Manager'}
Job Requirements & Overview:
${jobDetails.value.raw_jd?.slice(0, 1200) || jobDetails.value.core_responsibilities || ''}

Custom Guidance: ${hrInstruction.value || 'Make it persuasive, authentic, direct, and concise.'}

Mandatory Rules:
1. STRICT FACTUAL HONESTY: Do NOT invent, exaggerate, or fabricate any skills, tools, or experiences that the candidate does not have. Only reference genuine capabilities.
2. TONE & LENGTH: Keep the outreach authentic, direct, and concise. STRICTLY keep the message at or under 200 characters total (aim ~150-200). Front-load the hook, cut filler openers, one single call-to-action.
3. Output ONLY the final message text. No markdown fences, no explanatory preamble, no sign-off notes.
4. Replace all placeholders like {recruiter_name}, {company_name}, {job_title}, {candidate_name} with concrete, appropriate values.`;

    const tailored = await invoke<string>('refine_diagram_with_ai', {
      provider,
      model,
      apiKey,
      currentCode: baseText,
      instruction: promptInstruction,
      contentType: 'HR Outreach Message'
    });

    if (tailored && tailored.trim()) {
      hrMessageContent.value = tailored.trim();
      await hrStore.saveTailoredMessage(props.id, tailored.trim());
      isHrDirty.value = false;
    }
  } catch (err: any) {
    console.error("HR Tailoring Error:", err);
    error.value = `HR tailoring failed: ${err.toString()}`;
  } finally {
    isGeneratingHr.value = false;
  }
};

const refineHrWithAi = async () => {
  const instruction = refinementInstruction.value.trim();
  if (!hrMessageContent.value || !instruction || isRefiningHr.value) return;
  isRefiningHr.value = true;
  error.value = null;
  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error("API Key not found. Please set it in Settings.");

    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    const refined = await invoke<string>('refine_diagram_with_ai', {
      provider,
      model,
      apiKey,
      currentCode: hrMessageContent.value,
      instruction: `Refine this outreach message according to this instruction: "${instruction}". Mandatory rule: strictly factual, do NOT invent or fabricate skills or background the candidate does not have. Return ONLY the revised raw message text with no markdown formatting, quotes, or code fences.`,
      contentType: 'HR Outreach Message'
    });

    if (refined && refined.trim()) {
      hrMessageContent.value = refined.trim();
      refinementInstruction.value = '';
      isHrDirty.value = true;
    }
  } catch (err: any) {
    console.error("HR Refine Error:", err);
    error.value = `AI Refinement failed: ${err.toString()}`;
  } finally {
    isRefiningHr.value = false;
  }
};

// Common Editor/Preview State (Active)
const isDownloading = ref(false);
const isFixingResume = ref(false);
const isFixingCl = ref(false);
const isFixing = computed(() => activeMode.value === 'resume' ? isFixingResume.value : isFixingCl.value);

const isRefiningResume = ref(false);
const isRefiningCl = ref(false);
const isRefining = computed(() => {
  if (activeMode.value === 'resume') return isRefiningResume.value;
  if (activeMode.value === 'cl') return isRefiningCl.value;
  return isRefiningHr.value;
});

const refinementInstruction = ref('');

const isResumeCompiled = ref(false);
const isClCompiled = ref(false);

// Compare State
const isComparing = ref(false);
const basePdfUrl = ref<any>(null);
const isCompilingBase = ref(false);

// Match Scoring State
type ScoreSource = 'tailored' | 'base';
const scoreSource = ref<ScoreSource>('tailored');
const showMatchPanel = ref(false);

async function runMatchScore() {
    if (scoringStore.isScoring) return;
    showMatchPanel.value = true;
    let latex = '';
    if (scoreSource.value === 'base') {
        const id = activeMode.value === 'resume' ? resumeSelectedId.value : clSelectedId.value;
        if (!id) {
            await dialog.showAlert('Pick a base template first.', 'No template selected');
            return;
        }
        if (activeMode.value === 'resume') {
            const r = await resumesStore.getResumeById(id);
            latex = r.latex_content || '';
        } else {
            const c = await clStore.getCoverLetterById(id);
            latex = c.latex_content || '';
        }
    } else {
        latex = activeLatex.value || '';
    }
    if (!latex.trim()) {
        await dialog.showAlert('Nothing to score — content is empty.', 'Empty content');
        return;
    }
    await scoringStore.score(props.id, latex);
}

const toggleCompare = async () => {
  isComparing.value = !isComparing.value;
  if (isComparing.value && !basePdfUrl.value) {
    isCompilingBase.value = true;
    try {
      const baseId = activeMode.value === 'resume' ? resumeSelectedId.value : clSelectedId.value;
      if (!baseId) throw new Error("No base template selected");

      let baseLatex = '';
      if (activeMode.value === 'resume') {
        const r = await resumesStore.getResumeById(baseId);
        baseLatex = r.latex_content || '';
      } else {
        const c = await clStore.getCoverLetterById(baseId);
        baseLatex = c.latex_content || '';
      }
      
      const baseFilename = activeMode.value === 'resume' ? 'base_resume_compiled_roletect.pdf' : 'base_cover_letter_compiled_roletect.pdf';
      await invoke<number[]>('compile_resume_to_pdf', { 
        latexCode: baseLatex,
        filename: baseFilename
      });
      
      const port = await invoke<string>('get_setting', { key: 'active_server_port', defaultValue: '1420' });
      basePdfUrl.value = {
        url: `http://127.0.0.1:${port}/static-pdf/${baseFilename}?cache-bust=${Date.now()}`,
        disableRange: false,
        disableStream: false,
        rangeChunkSize: 1024 * 1024
      };
    } catch (err: any) {
      console.error("Failed to compile base PDF:", err);
      isComparing.value = false;
      error.value = `Compare Error: ${err.toString()}`;
    } finally {
      isCompilingBase.value = false;
    }
  }
};

// Resizer State
const previewWidth = ref(450);
const isResizingPreview = ref(false);
const splitPaneRef = ref<HTMLElement | null>(null);

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
    previewWidth.value = 100;
    return;
  }
  const minWidth = 100;
  const maxWidth = rect.width - 200; // leave space for editor
  previewWidth.value = Math.max(minWidth, Math.min(maxWidth, newWidth));
};

const stopResizingPreview = () => {
  isResizingPreview.value = false;
  document.removeEventListener('mousemove', handlePreviewMouseMove);
  document.removeEventListener('mouseup', stopResizingPreview);
  nextTick(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

// Computed bindings for active mode
const activeLatex = computed({
  get: () => {
    if (activeMode.value === 'resume') return resumeLatex.value;
    if (activeMode.value === 'cl') return clLatex.value;
    return '';
  },
  set: (val) => {
    if (activeMode.value === 'resume') resumeLatex.value = val;
    else if (activeMode.value === 'cl') clLatex.value = val;
  }
});

const activePdfUrl = computed(() => {
  if (activeMode.value === 'resume') return resumePdfUrl.value;
  if (activeMode.value === 'cl') return clPdfUrl.value;
  return null;
});

const activeCompError = computed({
  get: () => {
    if (activeMode.value === 'resume') return resumeCompError.value;
    if (activeMode.value === 'cl') return clCompError.value;
    return null;
  },
  set: (val) => {
    if (activeMode.value === 'resume') resumeCompError.value = val;
    else if (activeMode.value === 'cl') clCompError.value = val;
  }
});

const activePdfBytes = computed(() => {
  if (activeMode.value === 'resume') return resumePdfBytes.value;
  if (activeMode.value === 'cl') return clPdfBytes.value;
  return null;
});

// Match Score helpers
const matchColor = (score: number): string => {
    if (score >= 75) return 'var(--accent)';       // green
    if (score >= 50) return '#f5a623';              // amber
    return '#e94560';                                // red
};
const matchLabel = (score: number): string => {
    if (score >= 75) return 'Strong match';
    if (score >= 50) return 'Decent match';
    if (score >= 25) return 'Weak match';
    return 'Poor match';
};

// Template data
const standardResumes = ref<TemplateItem[]>([]);
const standardCls = ref<TemplateItem[]>([]);
const isLoadingTemplates = ref(false);

// Helper to parse JSON fields safely
const parseJsonField = (field: string | undefined | null): string[] => {
  if (!field) return [];
  try {
    return JSON.parse(field);
  } catch (e) {
    // Fallback for legacy data that was saved as newline-separated strings
    return field.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  }
};

// Load job details and base templates on mount
onMounted(async () => {
  try {
    // 1. Fetch job details from backend
    jobDetails.value = await jobsStore.getJobById(props.id);
    resumeInstruction.value = jobDetails.value.custom_instruction || '';
    clInstruction.value = jobDetails.value.custom_instruction || '';
    if (jobDetails.value.reference_name) recruiterName.value = jobDetails.value.reference_name;
    if (jobDetails.value.reference_email || jobDetails.value.social_link) {
      recruiterContact.value = jobDetails.value.reference_email || jobDetails.value.social_link || '';
    }
    
    // 2. Load templates
    isLoadingTemplates.value = true;
    
    // Resume Templates
    await resumesStore.loadAllResumes();
    const withResumeContent: TemplateItem[] = [];
    for (const r of resumesStore.resumes) {
      const detail = await resumesStore.getResumeById(r.id);
      if (detail.latex_content && detail.latex_content.trim().length > 0) {
        withResumeContent.push({ id: r.id, name: r.name });
      }
    }
    standardResumes.value = withResumeContent;
    if (standardResumes.value.length > 0) resumeSelectedId.value = standardResumes.value[0].id;

    // Cover Letter Templates
    await clStore.loadAllCoverLetters();
    const withClContent: TemplateItem[] = [];
    for (const c of clStore.coverLetters) {
      const detail = await clStore.getCoverLetterById(c.id);
      if (detail.latex_content && detail.latex_content.trim().length > 0) {
        withClContent.push({ id: c.id, name: c.name });
      }
    }
    standardCls.value = withClContent;
    if (standardCls.value.length > 0) clSelectedId.value = standardCls.value[0].id;

    isLoadingTemplates.value = false;

    // 3. Fetch latest tailored content
    const latestResume = await invoke<TailoredContent | null>('get_latest_tailored_resume', { jobId: props.id });
    if (latestResume) {
      resumeLatex.value = latestResume.content;
      tailoredResumeId.value = latestResume.id;
      resumeSelectedId.value = latestResume.base_template_id;
    }

    const latestCl = await invoke<TailoredContent | null>('get_latest_tailored_cover_letter', { jobId: props.id });
    if (latestCl) {
      clLatex.value = latestCl.content;
      tailoredClId.value = latestCl.id;
      clSelectedId.value = latestCl.base_template_id;
    }

    // 4. Setup HR templates and load tailored HR message
    await hrStore.loadTemplates();
    if (hrStore.templates.length > 0) {
      hrSelectedId.value = hrStore.templates[0].id;
    }
    const savedHr = await hrStore.getTailoredMessage(props.id);
    if (savedHr && savedHr.trim()) {
      hrMessageContent.value = savedHr;
    } else if (hrStore.templates.length > 0) {
      applySelectedHrTemplate(false);
    }

    // Initialize dirty state tracking after initial load
    setTimeout(() => {
      watch(resumeLatex, () => { isResumeDirty.value = true; });
      watch(clLatex, () => { isClDirty.value = true; });
      watch(hrMessageContent, () => { isHrDirty.value = true; });
    }, 500);

  } catch (err: any) {
    error.value = err.toString();
    isLoadingTemplates.value = false;
  } finally {
    isLoading.value = false;
  }
});

import { onUnmounted } from 'vue';
onUnmounted(() => {
  isResumeCompiled.value = false;
  isClCompiled.value = false;
  resumePdfUrl.value = null;
  clPdfUrl.value = null;
});

// Trigger AI Generation
const generateContent = async () => {
  const targetMode = activeMode.value;
  if (targetMode === 'hr') {
    await generateHrContent();
    return;
  }
  const isResume = targetMode === 'resume';
  const selectedTemplate = isResume ? resumeSelectedId.value : clSelectedId.value;
  
  if (!jobDetails.value || !selectedTemplate) return;
  
  if (isResume) isGeneratingResume.value = true;
  else isGeneratingCl.value = true;
  
  error.value = null;
  
  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error("API Key not found. Please set it in Settings.");
    
    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    if (isResume) {
      const tailoredId = await invoke<string>('tailor_resume', {
        provider,
        model,
        apiKey,
        jobId: props.id,
        baseResumeId: selectedTemplate,
        customInstruction: resumeInstruction.value || null,
      });
      tailoredResumeId.value = tailoredId;
      resumeLatex.value = await invoke<string>('get_tailored_resume', { id: tailoredId });
      isResumeDirty.value = false;
    } else {
      const tailoredId = await invoke<string>('tailor_cover_letter', {
        provider,
        model,
        apiKey,
        jobId: props.id,
        baseClId: selectedTemplate,
        customInstruction: clInstruction.value || null,
      });
      tailoredClId.value = tailoredId;
      clLatex.value = await invoke<string>('get_tailored_cover_letter', { id: tailoredId });
      isClDirty.value = false;
    }
  } catch (err: any) {
    console.error("Tailoring Error:", err);
    error.value = err.toString();
  } finally {
    if (isResume) isGeneratingResume.value = false;
    else isGeneratingCl.value = false;
  }
};

const refineWithAi = async () => {
  const targetMode = activeMode.value;
  if (targetMode === 'hr') {
    await refineHrWithAi();
    return;
  }
  const currentLatex = targetMode === 'resume' ? resumeLatex.value : clLatex.value;
  const instruction = refinementInstruction.value.trim();
  const isCurrentlyRefining = targetMode === 'resume' ? isRefiningResume.value : isRefiningCl.value;
  
  if (!currentLatex || !instruction || isCurrentlyRefining) return;
  
  if (targetMode === 'resume') isRefiningResume.value = true;
  else isRefiningCl.value = true;
  
  error.value = null;

  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error("API Key not found. Please set it in Settings.");

    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    const refinedCode = await invoke<string>('refine_latex_with_ai', {
      provider,
      model,
      apiKey,
      currentLatex: currentLatex,
      instruction: instruction
    });

    if (targetMode === 'resume') resumeLatex.value = refinedCode;
    else clLatex.value = refinedCode;
    
    refinementInstruction.value = '';
    error.value = `AI has refined the ${targetMode}. Re-compiling...`;
    
    await doCompilePdf(targetMode);
  } catch (err: any) {
    console.error("AI Refinement Error:", err);
    error.value = `AI Refinement failed: ${err.toString()}`;
  } finally {
    if (targetMode === 'resume') isRefiningResume.value = false;
    else isRefiningCl.value = false;
  }
};

const doSaveLatexContent = async (targetMode: 'resume' | 'cl', silent = false) => {
  try {
    if (targetMode === 'resume') {
      await invoke('update_tailored_resume', {
        jobId: props.id,
        baseResumeId: resumeSelectedId.value,
        latexContent: resumeLatex.value
      });
      isResumeDirty.value = false;
    } else {
      await invoke('update_tailored_cover_letter', {
        jobId: props.id,
        baseClId: clSelectedId.value,
        latexContent: clLatex.value
      });
      isClDirty.value = false;
    }
    if (!silent) await message('Content saved successfully.', { title: 'Success', kind: 'info' });
  } catch (err: any) {
    console.error("Save Error:", err);
    if (!silent) await message(`Failed to save changes: ${err.toString()}`, { title: 'Save Failed', kind: 'error' });
  }
};

const saveLatexContent = async (silent = false) => {
  const isSilent = typeof silent === 'boolean' ? silent : false;
  if (activeMode.value === 'hr') {
    await saveHrMessage(isSilent);
    return;
  }
  await doSaveLatexContent(activeMode.value, isSilent);
};

const doCompilePdf = async (targetMode: 'resume' | 'cl') => {
  const currentLatex = targetMode === 'resume' ? resumeLatex.value : clLatex.value;
  if (!currentLatex) return;
  
  if (targetMode === 'resume') isCompilingResume.value = true;
  else isCompilingCl.value = true;
  
  error.value = null;
  if (targetMode === 'resume') resumeCompError.value = null;
  else clCompError.value = null;
  
  try {
    const pdfFilename = targetMode === 'resume' ? 'resume_compiled_roletect.pdf' : 'cover_compiled_roletect.pdf';
    const pdfBytes = await invoke<number[]>('compile_resume_to_pdf', { 
      latexCode: currentLatex,
      filename: pdfFilename
    });
    
    const bytes = new Uint8Array(pdfBytes);
    
    // Fetch port from DB
    const port = await invoke<string>('get_setting', { key: 'active_server_port', defaultValue: '1420' });
    const sourceObj = {
      url: `http://127.0.0.1:${port}/static-pdf/${pdfFilename}?cache-bust=${Date.now()}`,
      disableRange: false,
      disableStream: false,
      rangeChunkSize: 1024 * 1024 // 1MB chunks
    };
    
    if (targetMode === 'resume') {
      resumePdfBytes.value = bytes;
      resumePdfUrl.value = sourceObj;
      isResumeCompiled.value = true;
    } else {
      clPdfBytes.value = bytes;
      clPdfUrl.value = sourceObj;
      isClCompiled.value = true;
    }

    await doSaveLatexContent(targetMode, true); // Silent save after successful compilation
  } catch (err: any) {
    console.error("PDF Compilation Error:", err);
    if (targetMode === 'resume') resumeCompError.value = err.toString();
    else clCompError.value = err.toString();
    error.value = "LaTeX Compilation Failed. You can try 'AI Fix' or manually edit and Save.";
  } finally {
    if (targetMode === 'resume') isCompilingResume.value = false;
    else isCompilingCl.value = false;
  }
};

const compilePdf = () => {
  if (activeMode.value === 'hr') return;
  return doCompilePdf(activeMode.value);
};

const onPdfError = (err: any) => {
  console.error("PDF Rendering Error:", err);
  const errMsg = "Frontend Rendering Error: Failed to stream or parse PDF chunks from the backend. " + (err.message || err.toString());
  if (activeMode.value === 'resume') {
    resumeCompError.value = errMsg;
  } else {
    clCompError.value = errMsg;
  }
};

const handleTabSwitch = async (mode: 'resume' | 'cl' | 'hr') => {
  if (activeMode.value === mode) return;
  
  if (hasUnsavedChanges.value) {
    const label = activeMode.value === 'resume' ? 'resume' : activeMode.value === 'cl' ? 'cover letter' : 'HR outreach message';
    const confirmed = await ask(
      `You have unsaved changes in your tailored ${label}. Are you sure you want to switch tabs? Changes will be lost unless saved.`,
      { title: 'Unsaved Changes', kind: 'warning' }
    );
    if (!confirmed) return;
  }
  
  isComparing.value = false;
  basePdfUrl.value = null;
  
  isResumeCompiled.value = false;
  resumePdfUrl.value = null;
  resumePdfBytes.value = null;
  isClCompiled.value = false;
  clPdfUrl.value = null;
  clPdfBytes.value = null;
  
  activeMode.value = mode;

  if (mode === 'hr' && !hrMessageContent.value) {
    const saved = await hrStore.getTailoredMessage(props.id);
    if (saved && saved.trim()) {
      hrMessageContent.value = saved;
    } else {
      applySelectedHrTemplate(false);
    }
  }
};

const fixWithAi = async () => {
  if (activeMode.value === 'hr') return;
  const targetMode = activeMode.value;
  const currentLatex = targetMode === 'resume' ? resumeLatex.value : clLatex.value;
  const currentCompError = targetMode === 'resume' ? resumeCompError.value : clCompError.value;
  const isCurrentlyFixing = targetMode === 'resume' ? isFixingResume.value : isFixingCl.value;

  if (!currentLatex || !currentCompError || isCurrentlyFixing) return;
  
  if (targetMode === 'resume') isFixingResume.value = true;
  else isFixingCl.value = true;
  
  error.value = null;

  try {
    const apiKey = await settingsStore.getDecryptedKey();
    if (!apiKey) throw new Error("API Key not found. Please set it in Settings.");

    const provider = settingsStore.selectedAiProvider;
    const model = settingsStore.selectedAiModel;

    const fixedCode = await invoke<string>('fix_latex_with_ai', {
      provider,
      model,
      apiKey,
      brokenLatex: currentLatex,
      errorLogs: currentCompError
    });

    if (targetMode === 'resume') resumeLatex.value = fixedCode;
    else clLatex.value = fixedCode;
    
    error.value = "AI has suggested a fix. Trying to re-compile...";
    await doCompilePdf(targetMode);
  } catch (err: any) {
    console.error("AI Fix Error:", err);
    error.value = `AI Fix failed: ${err.toString()}`;
  } finally {
    if (targetMode === 'resume') isFixingResume.value = false;
    else isFixingCl.value = false;
  }
};

const downloadPdf = async () => {
  if (!activePdfBytes.value) return;
  isDownloading.value = true;
  
  try {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    
    const typeLabel = activeMode.value === 'resume' ? 'resume' : 'cover_letter';
    const defaultName = `${typeLabel}_${timestamp}.pdf`;

    const filePath = await save({
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      defaultPath: defaultName
    });

    if (filePath) {
      await writeFile(filePath, activePdfBytes.value);
      
      const filename = filePath.split(/[/\\]/).pop() || defaultName;
      const downloadType = activeMode.value === 'resume' ? 'tailored_resume' : 'tailored_cover_letter';
      const contentId = activeMode.value === 'resume' ? tailoredResumeId.value : tailoredClId.value;

      await invoke('record_download', {
        filename,
        downloadType,
        jobId: jobDetails.value?.id,
        contentId: contentId || null
      });

      await message('PDF saved successfully.', { title: 'Success', kind: 'info' });
    }
  } catch (err: any) {
    console.error("Download Error:", err);
    error.value = `Failed to save PDF: ${err.toString()}`;
  } finally {
    isDownloading.value = false;
  }
};

const openJobUrl = async () => {
  if (jobDetails.value?.job_url) {
    try {
      await openUrl(jobDetails.value.job_url);
    } catch (err: any) {
      console.error("Failed to open URL:", err);
      error.value = `Failed to open URL: ${err.toString()}`;
    }
  }
};

const goBack = () => router.push('/');

const updateStatus = async (newStatus: string) => {
  if (jobDetails.value?.status === newStatus) return;

  let metadata: Record<string, string> = {};
  const today = new Date().toISOString().split('T')[0];

  try {
    let datePrompt = '';
    let metaKey = '';

    if (newStatus === 'Applied') {
      datePrompt = 'Select application date:';
      metaKey = 'applied_date';
    } else if (newStatus === 'Interviewing') {
      datePrompt = 'Select interview date:';
      metaKey = 'interview_date';
    } else if (newStatus === 'Offer') {
      datePrompt = 'Select offer received date:';
      metaKey = 'offer_date';
      await dialog.showAlert('Amazing! You received an offer. You can add the salary details in the job info section.', 'Offer Received');
    } else if (newStatus === 'Rejected') {
      datePrompt = 'Select rejection date:';
      metaKey = 'rejected_date';
    } else if (newStatus === 'Joined') {
      datePrompt = 'Select start date:';
      metaKey = 'joining_date';
    }

    if (metaKey) {
      const result = await dialog.showDatePicker(datePrompt, today, 'Record Milestone');
      if (result === null) return; // User cancelled
      metadata[metaKey] = result;
    }

    await jobsStore.updateJobStatus(props.id, newStatus, Object.keys(metadata).length > 0 ? metadata : undefined);
    
    // Refresh local data
    jobDetails.value = await jobsStore.getJobById(props.id);
  } catch (err: any) {
    error.value = `Failed to update status: ${err.toString()}`;
  }
};

const editSalary = async () => {
  const result = await dialog.showPrompt('Enter the salary (e.g. $120k/yr):', jobDetails.value?.salary || '', 'Update Salary');

  if (result !== null) {
    try {
      await jobsStore.updateJobMetadata(props.id, 'salary', result);
      jobDetails.value = await jobsStore.getJobById(props.id);
    } catch (err: any) {
      error.value = `Failed to update salary: ${err.toString()}`;
    }
  }
};

const deleteJob = async () => {
  const confirmed = await dialog.showConfirm('Are you sure you want to delete this job application? This action cannot be undone.', 'Confirm Deletion');

  if (!confirmed) return;
  
  try {
    await jobsStore.deleteJob(props.id);
    router.push('/jobs');
  } catch (err: any) {
    error.value = err.toString();
  }
};
</script>

<template>
  <div class="workspace" v-if="!isLoading">
    <header class="workspace-header">
      <div class="header-left">
        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'back'" @mouseleave="activeTooltip = null">
          <button class="back-btn" @click="goBack"><ArrowLeft :size="16" /></button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'back'"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="flying-message header-tooltip"
            >
              Back to List
            </Motion>
          </AnimatePresence>
        </div>
        <div class="job-info">
          <h1 class="title">{{ jobDetails?.job_title }}</h1>
          <span class="company">{{ jobDetails?.company_name }}</span>
          <div class="btn-tooltip-wrapper" v-if="jobDetails?.job_url" @mouseenter="activeTooltip = 'job-link'" @mouseleave="activeTooltip = null">
            <button class="link-btn" @click="openJobUrl"><ExternalLink :size="14" /></button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'job-link'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                :transition="{ duration: 0.15 }"
                class="flying-message header-tooltip"
              >
                Open Job Link
              </Motion>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'delete-job'" @mouseleave="activeTooltip = null">
          <button class="delete-btn" @click="deleteJob"><Trash2 :size="16" /></button>
          <AnimatePresence>
            <Motion
              v-if="activeTooltip === 'delete-job'"
              :initial="{ opacity: 0, y: 5, scale: 0.9 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: 5, scale: 0.9 }"
              :transition="{ duration: 0.15 }"
              class="flying-message header-tooltip delete-tooltip"
            >
              Delete Application
            </Motion>
          </AnimatePresence>
        </div>
      </div>
    </header>

    <AnimatePresence>
      <Motion
        v-if="error"
        :initial="{ height: 0, opacity: 0 }"
        :animate="{ height: 'auto', opacity: 1 }"
        :exit="{ height: 0, opacity: 0 }"
        class="error-banner"
      >
        <span class="error-banner-text">{{ error }}</span>
        <div class="banner-actions">
          <button class="banner-copy-btn" @click="handleCopyBannerError" :title="isBannerErrorCopied ? 'Copied!' : 'Copy Error'">
            <Check v-if="isBannerErrorCopied" :size="13" />
            <Copy v-else :size="13" />
          </button>
          <button class="banner-close-btn" @click="error = null" title="Dismiss">✕</button>
        </div>
      </Motion>
    </AnimatePresence>

    <div class="split-view">
      <aside class="panel info-panel">
        <div class="section">
          <div class="section-header-icon" @mouseenter="activeTooltip = 'info-sec'" @mouseleave="activeTooltip = null">
            <Info :size="16" />
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'info-sec'"
                :initial="{ opacity: 0, x: 5, scale: 0.9 }"
                :animate="{ opacity: 1, x: 12, scale: 1 }"
                :exit="{ opacity: 0, x: 5, scale: 0.9 }"
                class="flying-message sidebar-tooltip"
              >
                Information
              </Motion>
            </AnimatePresence>
          </div>
          <div class="meta-grid">
            <div class="meta-icon-wrapper" @mouseenter="activeTooltip = 'work-model'" @mouseleave="activeTooltip = null">
              <Briefcase :size="14" />
              <AnimatePresence>
                <Motion v-if="activeTooltip === 'work-model'" class="flying-message sidebar-tooltip" :initial="{ opacity: 0, x: 5 }" :animate="{ opacity: 1, x: 12 }">Work Model</Motion>
              </AnimatePresence>
            </div>
            <span class="value">{{ jobDetails?.work_model }}</span>
            
            <div class="meta-icon-wrapper" @mouseenter="activeTooltip = 'emp-type'" @mouseleave="activeTooltip = null">
              <Layers :size="14" />
              <AnimatePresence>
                <Motion v-if="activeTooltip === 'emp-type'" class="flying-message sidebar-tooltip" :initial="{ opacity: 0, x: 5 }" :animate="{ opacity: 1, x: 12 }">Employment Type</Motion>
              </AnimatePresence>
            </div>
            <span class="value">{{ jobDetails?.employment_type }}</span>
            
            <div class="meta-icon-wrapper" @mouseenter="activeTooltip = 'status-meta'" @mouseleave="activeTooltip = null">
              <Activity :size="14" />
              <AnimatePresence>
                <Motion v-if="activeTooltip === 'status-meta'" class="flying-message sidebar-tooltip" :initial="{ opacity: 0, x: 5 }" :animate="{ opacity: 1, x: 12 }">Application Status</Motion>
              </AnimatePresence>
            </div>
            <CustomSelect 
              :model-value="jobDetails?.status" 
              @change="updateStatus"
              :options="['Drafting', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Joined'].map(s => ({ value: s, label: s }))"
              style="width: 140px;"
            />
          </div>

          <!-- Milestones Section (Context Aware) -->
          <div class="milestones-section" v-if="jobDetails?.status !== 'Drafting'">
            <!-- Show Applied Date only if Applied -->
            <div class="milestone-row" v-if="jobDetails?.status === 'Applied' && jobDetails?.applied_date">
              <span class="milestone-label">Applied On</span>
              <span class="milestone-value">{{ jobDetails.applied_date }}</span>
            </div>

            <!-- Show Interview Date only if Interviewing -->
            <div class="milestone-row" v-if="jobDetails?.status === 'Interviewing' && jobDetails?.interview_date">
              <span class="milestone-label">Interview On</span>
              <span class="milestone-value">{{ jobDetails.interview_date }}</span>
            </div>

            <!-- Show Offer Date only if Offer Recv -->
            <div class="milestone-row" v-if="jobDetails?.status === 'Offer' && jobDetails?.offer_date">
              <span class="milestone-label">Offer Recv</span>
              <span class="milestone-value">{{ jobDetails.offer_date }}</span>
            </div>

            <!-- Show Rejected Date only if Rejected -->
            <div class="milestone-row" v-if="jobDetails?.status === 'Rejected' && jobDetails?.rejected_date">
              <span class="milestone-label">Rejected On</span>
              <span class="milestone-value">{{ jobDetails.rejected_date }}</span>
            </div>

            <!-- Show Start Date only if Joined -->
            <div class="milestone-row" v-if="jobDetails?.status === 'Joined' && jobDetails?.joining_date">
              <span class="milestone-label">Start Date</span>
              <span class="milestone-value">{{ jobDetails.joining_date }}</span>
            </div>

            <!-- Salary (Shown for Offer or Joined) -->
            <div class="milestone-row" v-if="jobDetails?.status === 'Offer' || jobDetails?.status === 'Joined'">
              <span class="milestone-label">Salary</span>
              <button 
                v-if="jobDetails?.salary" 
                class="salary-badge" 
                @click="editSalary"
                title="Click to edit salary"
              >
                {{ jobDetails.salary }}
              </button>
              <button 
                v-else
                class="edit-salary-btn" 
                @click="editSalary"
              >
                + Add Salary
              </button>
            </div>
          </div>
        </div>

        <div class="section scroll-section" v-if="jobDetails?.requirements">
          <div class="section-header-icon" @mouseenter="activeTooltip = 'req-sec'" @mouseleave="activeTooltip = null">
            <ListChecks :size="16" />
            <AnimatePresence>
              <Motion v-if="activeTooltip === 'req-sec'" class="flying-message sidebar-tooltip" :initial="{ opacity: 0, x: 5 }" :animate="{ opacity: 1, x: 12 }">Requirements</Motion>
            </AnimatePresence>
          </div>
          <ul class="tight-list">
            <li v-for="req in parseJsonField(jobDetails.requirements)" :key="req">{{ req }}</li>
          </ul>
        </div>

        <div class="section scroll-section" v-if="jobDetails?.core_responsibilities">
          <div class="section-header-icon" @mouseenter="activeTooltip = 'resp-sec'" @mouseleave="activeTooltip = null">
            <Briefcase :size="16" />
            <AnimatePresence>
              <Motion v-if="activeTooltip === 'resp-sec'" class="flying-message sidebar-tooltip" :initial="{ opacity: 0, x: 5 }" :animate="{ opacity: 1, x: 12 }">Responsibilities</Motion>
            </AnimatePresence>
          </div>
          <ul class="tight-list">
            <li v-for="resp in parseJsonField(jobDetails.core_responsibilities)" :key="resp">{{ resp }}</li>
          </ul>
        </div>

        <div class="section footer-section">
          <div class="section-header-icon" @mouseenter="activeTooltip = 'config-sec'" @mouseleave="activeTooltip = null">
            <Settings :size="16" />
            <AnimatePresence>
              <Motion v-if="activeTooltip === 'config-sec'" class="flying-message sidebar-tooltip" :initial="{ opacity: 0, x: 5 }" :animate="{ opacity: 1, x: 12 }">Configuration ({{ activeMode === 'resume' ? 'Resume' : activeMode === 'cl' ? 'CL' : 'HR Message' }})</Motion>
            </AnimatePresence>
          </div>
          
          <div class="form-group">
            <label>Base Template</label>
            <CustomSelect 
              v-if="activeMode === 'resume'" 
              v-model="resumeSelectedId" 
              :options="standardResumes.map(r => ({ value: r.id, label: r.name }))" 
            />
            <CustomSelect 
              v-else-if="activeMode === 'cl'" 
              v-model="clSelectedId" 
              :options="standardCls.map(c => ({ value: c.id, label: c.name }))" 
            />
            <CustomSelect 
              v-else 
              v-model="hrSelectedId" 
              :options="hrStore.templates.map(t => ({ value: t.id, label: t.name }))" 
              @update:model-value="() => applySelectedHrTemplate(true)"
            />
          </div>

          <template v-if="activeMode === 'hr'">
            <div class="form-group">
              <label>Recruiter / Contact Name</label>
              <input 
                v-model="recruiterName" 
                type="text" 
                class="form-input-compact" 
                placeholder="e.g. Sarah Jenkins or Hiring Team"
                @change="() => applySelectedHrTemplate(true)"
              />
            </div>
            <div class="form-group">
              <label>Recruiter Email / Profile Link</label>
              <input 
                v-model="recruiterContact" 
                type="text" 
                class="form-input-compact" 
                placeholder="e.g. recruiter@company.com or linkedin.com/in/..."
              />
            </div>
          </template>

          <div class="form-group">
            <label>{{ activeMode === 'hr' ? 'Outreach Guidance' : 'Tailor Logic' }}</label>
            <textarea 
              v-if="activeMode === 'resume'"
              v-model="resumeInstruction" 
              class="compact-textarea" 
              placeholder="Resume tailoring rules..."
            ></textarea>
            <textarea 
              v-else-if="activeMode === 'cl'"
              v-model="clInstruction" 
              class="compact-textarea" 
              placeholder="Cover letter rules..."
            ></textarea>
            <textarea 
              v-else
              v-model="hrInstruction" 
              class="compact-textarea" 
              placeholder="Outreach instructions (e.g. emphasize Vue/Rust, keep under 200 chars)..."
            ></textarea>
          </div>

          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'run-intelligence'" @mouseleave="activeTooltip = null">
            <button class="btn-accent w-full" @click="generateContent" :disabled="isGenerating || (activeMode === 'resume' ? !resumeSelectedId : activeMode === 'cl' ? !clSelectedId : !hrSelectedId)">
              <Play v-if="!isGenerating" :size="14" />
              <RotateCw v-else :size="14" class="spinner" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'run-intelligence'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                :transition="{ duration: 0.15 }"
                class="flying-message info-tooltip"
              >
                {{ isGenerating ? (activeMode === 'hr' ? 'Crafting Outreach...' : 'Tailoring...') : (activeMode === 'hr' ? 'Tailor HR Message' : 'Run Intelligence') }}
              </Motion>
            </AnimatePresence>
          </div>
        </div>
      </aside>

      <div class="panel main-panel">
        <div class="panel-tabs">
          <div class="left-tabs">
            <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'resume-mode'" @mouseleave="activeTooltip = null">
              <button 
                class="tab-btn-mode" 
                :class="{ active: activeMode === 'resume' }" 
                @click="handleTabSwitch('resume')"
              >
                <FileText :size="14" />
                <span>RESUME</span>
              </button>
              <AnimatePresence>
                <Motion v-if="activeTooltip === 'resume-mode'" class="flying-message tab-tooltip" :initial="{ opacity: 0, y: 5 }" :animate="{ opacity: 1, y: 0 }">Resume Workspace</Motion>
              </AnimatePresence>
            </div>
            <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'cl-mode'" @mouseleave="activeTooltip = null">
              <button 
                class="tab-btn-mode" 
                :class="{ active: activeMode === 'cl' }" 
                @click="handleTabSwitch('cl')"
              >
                <Mail :size="14" />
                <span>COVER LETTER</span>
              </button>
              <AnimatePresence>
                <Motion v-if="activeTooltip === 'cl-mode'" class="flying-message tab-tooltip" :initial="{ opacity: 0, y: 5 }" :animate="{ opacity: 1, y: 0 }">Cover Letter Workspace</Motion>
              </AnimatePresence>
            </div>
            <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'hr-mode'" @mouseleave="activeTooltip = null">
              <button 
                class="tab-btn-mode" 
                :class="{ active: activeMode === 'hr' }" 
                @click="handleTabSwitch('hr')"
              >
                <MessageSquare :size="14" />
                <span>HR MESSAGES</span>
              </button>
              <AnimatePresence>
                <Motion v-if="activeTooltip === 'hr-mode'" class="flying-message tab-tooltip" :initial="{ opacity: 0, y: 5 }" :animate="{ opacity: 1, y: 0 }">HR Outreach Workspace</Motion>
              </AnimatePresence>
            </div>
            <div class="divider"></div>
            <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'save-content'" @mouseleave="activeTooltip = null">
              <button class="tab-btn" @click="saveLatexContent(false)"><Save :size="14" /></button>
              <AnimatePresence>
                <Motion
                  v-if="activeTooltip === 'save-content'"
                  :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                  :animate="{ opacity: 1, y: 0, scale: 1 }"
                  :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                  :transition="{ duration: 0.15 }"
                  class="flying-message tab-tooltip"
                >
                  Save {{ activeMode === 'hr' ? 'HR Message' : 'LaTeX' }}
                </Motion>
              </AnimatePresence>
            </div>
          </div>
          <div class="right-tabs">
            <template v-if="activeMode === 'hr'">
              <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'copy-hr'" @mouseleave="activeTooltip = null">
                <button class="tab-btn" :class="{ 'accent-btn': isCopiedHr }" @click="copyHrMessage" :disabled="!hrMessageContent">
                  <Check v-if="isCopiedHr" :size="14" />
                  <Copy v-else :size="14" />
                </button>
                <AnimatePresence>
                  <Motion
                    v-if="activeTooltip === 'copy-hr'"
                    :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                    :transition="{ duration: 0.15 }"
                    class="flying-message tab-tooltip"
                  >
                    {{ isCopiedHr ? 'Copied!' : 'Copy to Clipboard' }}
                  </Motion>
                </AnimatePresence>
              </div>

              <div v-if="recruiterContact" class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'reachout'" @mouseleave="activeTooltip = null">
                <button class="tab-btn" @click="openRecruiterContact">
                  <ExternalLink :size="14" />
                </button>
                <AnimatePresence>
                  <Motion
                    v-if="activeTooltip === 'reachout'"
                    :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                    :transition="{ duration: 0.15 }"
                    class="flying-message tab-tooltip"
                  >
                    Open Contact ({{ recruiterContact.includes('@') ? 'Email' : 'Link' }})
                  </Motion>
                </AnimatePresence>
              </div>
            </template>

            <template v-else>
              <AnimatePresence>
                <div class="btn-tooltip-wrapper" v-if="activeCompError" @mouseenter="activeTooltip = 'ai-fix'" @mouseleave="activeTooltip = null">
                  <Motion
                    :initial="{ scale: 0.9, opacity: 0 }"
                    :animate="{ scale: 1, opacity: 1 }"
                    class="tab-btn ai-btn"
                    @click="fixWithAi"
                    :disabled="isFixing"
                  >
                    <Wand2 :size="14" />
                  </Motion>
                  <AnimatePresence>
                    <Motion
                      v-if="activeTooltip === 'ai-fix'"
                      :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                      :animate="{ opacity: 1, y: 0, scale: 1 }"
                      :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                      :transition="{ duration: 0.15 }"
                      class="flying-message tab-tooltip"
                    >
                      AI Debug & Fix
                    </Motion>
                  </AnimatePresence>
                </div>
              </AnimatePresence>
              <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'build-pdf'" @mouseleave="activeTooltip = null">
                <button class="tab-btn accent-btn" @click="compilePdf" :disabled="!activeLatex || isCompilingPDF">
                  <Hammer v-if="!isCompilingPDF" :size="14" />
                  <RotateCw v-else :size="14" class="spinner" />
                </button>
                <AnimatePresence>
                  <Motion
                    v-if="activeTooltip === 'build-pdf'"
                    :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                    :transition="{ duration: 0.15 }"
                    class="flying-message tab-tooltip"
                  >
                    Compile PDF
                  </Motion>
                </AnimatePresence>
              </div>
              <div class="btn-tooltip-wrapper" v-if="activeMode === 'resume' ? isResumeCompiled : isClCompiled" @mouseenter="activeTooltip = 'compare'" @mouseleave="activeTooltip = null">
                <button class="tab-btn" :class="{ 'active': isComparing }" @click="toggleCompare" :disabled="isCompilingBase">
                  <Columns v-if="!isCompilingBase && !isComparing" :size="14" />
                  <FileText v-else-if="!isCompilingBase && isComparing" :size="14" />
                  <RotateCw v-else :size="14" class="spinner" />
                </button>
                <AnimatePresence>
                  <Motion
                    v-if="activeTooltip === 'compare'"
                    :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                    :transition="{ duration: 0.15 }"
                    class="flying-message tab-tooltip"
                  >
                    {{ isComparing ? 'Exit Compare' : 'Compare with Base' }}
                  </Motion>
                </AnimatePresence>
              </div>
              <div class="btn-tooltip-wrapper" v-if="activePdfBytes" @mouseenter="activeTooltip = 'export-pdf'" @mouseleave="activeTooltip = null">
                <button class="tab-btn" @click="downloadPdf" :disabled="isDownloading">
                  <Download v-if="!isDownloading" :size="14" />
                  <RotateCw v-else :size="14" class="spinner" />
                </button>
                <AnimatePresence>
                  <Motion
                    v-if="activeTooltip === 'export-pdf'"
                    :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                    :transition="{ duration: 0.15 }"
                    class="flying-message tab-tooltip"
                  >
                    Download PDF
                  </Motion>
                </AnimatePresence>
              </div>
              <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'match-score'" @mouseleave="activeTooltip = null">
                <button class="tab-btn" :class="{ 'active': showMatchPanel }" @click="runMatchScore" :disabled="scoringStore.isScoring">
                  <Gauge v-if="!scoringStore.isScoring" :size="14" />
                  <RotateCw v-else :size="14" class="spinner" />
                </button>
                <AnimatePresence>
                  <Motion
                    v-if="activeTooltip === 'match-score'"
                    :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                    :animate="{ opacity: 1, y: 0, scale: 1 }"
                    :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                    :transition="{ duration: 0.15 }"
                    class="flying-message tab-tooltip"
                  >
                    Match Score
                  </Motion>
                </AnimatePresence>
              </div>
            </template>
          </div>
        </div>

        <AnimatePresence>
          <Motion
            v-if="showMatchPanel"
            :initial="{ height: 0, opacity: 0 }"
            :animate="{ height: 'auto', opacity: 1 }"
            :exit="{ height: 0, opacity: 0 }"
            :transition="{ duration: 0.2 }"
            class="match-panel-wrapper"
          >
            <div class="match-panel">
              <header class="match-panel-header">
                <div class="match-panel-title">
                  <Gauge :size="14" />
                  <span>Resume Match Score</span>
                  <span v-if="scoringStore.lastBreakdown" class="match-source-toggle">
                    <button
                      class="seg-btn"
                      :class="{ active: scoreSource === 'tailored' }"
                      @click="scoreSource = 'tailored'"
                    >Tailored</button>
                    <button
                      class="seg-btn"
                      :class="{ active: scoreSource === 'base' }"
                      @click="scoreSource = 'base'"
                    >Base</button>
                  </span>
                </div>
                <div class="match-panel-actions">
                  <button class="link-btn" @click="runMatchScore" :disabled="scoringStore.isScoring">
                    <RotateCw v-if="scoringStore.isScoring" :size="12" class="spinner" />
                    <span v-else>Re-score</span>
                  </button>
                  <button class="link-btn" @click="showMatchPanel = false">Close</button>
                </div>
              </header>

              <!-- Empty / loading state -->
              <div v-if="scoringStore.isScoring && !scoringStore.lastBreakdown" class="match-empty">
                Analyzing resume...
              </div>
              <div v-else-if="!scoringStore.lastBreakdown" class="match-empty">
                Click <strong>Re-score</strong> to analyze this resume against the job description.
              </div>

              <!-- Error state -->
              <div v-else-if="scoringStore.error" class="match-error">
                <div class="match-error-content">
                  <AlertTriangle :size="14" />
                  <span>{{ scoringStore.error }}</span>
                </div>
                <button
                  type="button"
                  class="copy-err-inline-btn"
                  @click="handleCopyScoringError"
                  :title="isScoringErrorCopied ? 'Copied!' : 'Copy Error'"
                >
                  <Check v-if="isScoringErrorCopied" :size="12" />
                  <Copy v-else :size="12" />
                  <span>{{ isScoringErrorCopied ? 'Copied!' : 'Copy' }}</span>
                </button>
              </div>

              <!-- Breakdown -->
              <div v-else class="match-body">
                <div class="match-hero">
                  <div
                    class="match-score-circle"
                    :style="{ color: matchColor(scoringStore.lastBreakdown.overall), borderColor: matchColor(scoringStore.lastBreakdown.overall) }"
                  >
                    {{ scoringStore.lastBreakdown.overall }}
                  </div>
                  <div class="match-score-label">
                    <strong>{{ matchLabel(scoringStore.lastBreakdown.overall) }}</strong>
                    <span>
                      {{ scoringStore.lastBreakdown.present_skills.length }} of {{ scoringStore.lastBreakdown.jd_skill_count }}
                      required skills present
                    </span>
                  </div>
                </div>

                <div class="match-bars">
                  <div class="match-bar">
                    <span>Skills</span>
                    <div class="bar"><div class="fill" :style="{ width: scoringStore.lastBreakdown.skills_score + '%', background: matchColor(scoringStore.lastBreakdown.skills_score) }"></div></div>
                    <strong>{{ scoringStore.lastBreakdown.skills_score }}%</strong>
                  </div>
                  <div class="match-bar">
                    <span>TF-IDF</span>
                    <div class="bar"><div class="fill" :style="{ width: scoringStore.lastBreakdown.tfidf_score + '%', background: matchColor(scoringStore.lastBreakdown.tfidf_score) }"></div></div>
                    <strong>{{ scoringStore.lastBreakdown.tfidf_score }}%</strong>
                  </div>
                  <div class="match-bar">
                    <span>Jaccard</span>
                    <div class="bar"><div class="fill" :style="{ width: scoringStore.lastBreakdown.jaccard_score + '%', background: matchColor(scoringStore.lastBreakdown.jaccard_score) }"></div></div>
                    <strong>{{ scoringStore.lastBreakdown.jaccard_score }}%</strong>
                  </div>
                </div>

                <div v-if="scoringStore.lastBreakdown.missing_skills.length" class="match-section">
                  <div class="match-section-title">
                    <XCircle :size="12" />
                    Missing skills ({{ scoringStore.lastBreakdown.missing_skills.length }})
                  </div>
                  <div class="match-chips">
                    <span class="match-chip chip-missing" v-for="s in scoringStore.lastBreakdown.missing_skills" :key="`m-${s}`">{{ s }}</span>
                  </div>
                </div>

                <div v-if="scoringStore.lastBreakdown.weak_skills.length" class="match-section">
                  <div class="match-section-title">
                    <AlertTriangle :size="12" />
                    Weak skills ({{ scoringStore.lastBreakdown.weak_skills.length }})
                    <small>present but mentioned only once in resume while the JD hammers them 3+ times</small>
                  </div>
                  <div class="match-chips">
                    <span class="match-chip chip-weak" v-for="s in scoringStore.lastBreakdown.weak_skills" :key="`w-${s}`">{{ s }}</span>
                  </div>
                </div>

                <div v-if="scoringStore.lastBreakdown.present_skills.length" class="match-section">
                  <div class="match-section-title">
                    <CheckCircle2 :size="12" />
                    Present skills ({{ scoringStore.lastBreakdown.present_skills.length }})
                  </div>
                  <div class="match-chips">
                    <span class="match-chip chip-present" v-for="s in scoringStore.lastBreakdown.present_skills" :key="`p-${s}`">{{ s }}</span>
                  </div>
                </div>

                <footer class="match-footer">
                  {{ scoringStore.lastBreakdown.jd_token_count }} JD tokens analyzed ·
                  {{ scoringStore.lastBreakdown.resume_token_count }} resume tokens analyzed ·
                  local-only scoring, no data sent off-device
                </footer>
              </div>
            </div>
          </Motion>
        </AnimatePresence>

        <AnimatePresence>
          <Motion
            v-if="activeCompError && activeMode !== 'hr'"
            :initial="{ height: 0 }"
            :animate="{ height: 'auto' }"
            :exit="{ height: 0 }"
            class="error-log"
          >
            <header>
              <div class="error-log-title">
                <span>COMPILATION ERROR</span>
              </div>
              <div class="error-log-actions">
                <button
                  type="button"
                  class="action-btn-inline"
                  @click="handleCopyCompError"
                  :title="isCompErrorCopied ? 'Copied!' : 'Copy Error'"
                >
                  <Check v-if="isCompErrorCopied" :size="13" />
                  <Copy v-else :size="13" />
                  <span>{{ isCompErrorCopied ? 'Copied!' : 'Copy' }}</span>
                </button>
                <button @click="activeCompError = null" title="Close">✕</button>
              </div>
            </header>
            <pre>{{ activeCompError }}</pre>
          </Motion>
        </AnimatePresence>

        <!-- HR Message Workspace -->
        <div v-if="activeMode === 'hr'" class="hr-workspace">
          <!-- AI Loading Overlay -->
          <AnimatePresence>
            <Motion
              v-if="isGeneratingHr || isRefiningHr"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :exit="{ opacity: 0 }"
              class="loading-overlay"
            >
              <div class="loader-content">
                <RotateCw :size="32" class="spinner" />
                <h3>{{ isGeneratingHr ? 'TAILORING HR OUTREACH...' : 'REFINING MESSAGE...' }}</h3>
              </div>
            </Motion>
          </AnimatePresence>

          <!-- HR Toolbar strip -->
          <div class="hr-editor-bar">
            <div class="hr-meta-tags">
              <span class="hr-badge-stat">
                <strong>{{ hrCharCount }}</strong> chars
              </span>
              <span class="hr-badge-stat">
                <strong>{{ hrWordCount }}</strong> words
              </span>
              <span 
                class="hr-badge-pill" 
                :class="isLinkedInSafe ? 'pill-safe' : 'pill-warn'"
              >
                {{ isLinkedInSafe ? '✓ Fits LinkedIn Note (≤ 200)' : '⚠️ Exceeds 200 Chars' }}
              </span>
              <span v-if="recruiterContact" class="hr-badge-contact" @click="openRecruiterContact" title="Click to open link or email">
                <ExternalLink :size="12" />
                {{ recruiterContact }}
              </span>
            </div>

            <div class="hr-actions">
              <button class="hr-action-btn" :class="{ 'copied': isCopiedHr }" @click="copyHrMessage">
                <Check v-if="isCopiedHr" :size="14" />
                <Copy v-else :size="14" />
                <span>{{ isCopiedHr ? 'Copied!' : 'Copy to Clipboard' }}</span>
              </button>

              <button v-if="recruiterContact" class="hr-action-btn btn-send" @click="openRecruiterContact">
                <ExternalLink :size="14" />
                <span>{{ recruiterContact.includes('@') ? 'Open Mail' : 'Open Link' }}</span>
              </button>
            </div>
          </div>

          <!-- Editor Body -->
          <div class="hr-textarea-container">
            <textarea
              v-model="hrMessageContent"
              class="hr-message-editor"
              placeholder="Type or tailor your message to recruiters or hiring managers here..."
              spellcheck="true"
            ></textarea>
          </div>

          <!-- Bottom Refinement Bar for HR -->
          <div class="hr-refine-bottom">
            <div class="hr-refine-input-group">
              <input
                v-model="refinementInstruction"
                type="text"
                class="hr-refine-input"
                placeholder="Ask AI to refine this message (e.g. 'Make it shorter and punchier', 'Emphasize leadership experience')..."
                @keyup.enter="refineHrWithAi"
              />
              <button class="hr-refine-btn" @click="refineHrWithAi" :disabled="isRefiningHr || !refinementInstruction.trim()">
                <Loader2 v-if="isRefiningHr" :size="14" class="spinner" />
                <span v-else>Refine</span>
              </button>
            </div>
          </div>
        </div>

        <!-- LaTeX & PDF Workspace -->
        <div v-else class="split-pane" ref="splitPaneRef" :class="{ 'is-resizing': isResizingPreview }">
          
          <!-- Base PDF Viewer (Compare Mode) -->
          <div v-if="isComparing" class="pdf-viewer base-pdf-viewer" style="flex: 1; border-right: 1px solid var(--line); display: flex; flex-direction: column; overflow-y: auto;">
            <div class="compare-header" style="padding: 8px; text-align: center; font-size: 0.8rem; font-weight: 800; background: var(--surface-soft); border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: center; gap: 8px;">
              BASE TEMPLATE
              <RotateCw v-if="!basePdfUrl && isCompilingBase" :size="14" class="spinner" />
            </div>
            <VirtualizedPdfViewer v-if="basePdfUrl" :source="basePdfUrl" />
          </div>

          <!-- Code Editor -->
          <div v-show="!isComparing" class="editor-container" ref="editorContainer">
            <!-- AI Loading Overlay (Scoped to the editor so it doesn't block tabs) -->
            <AnimatePresence>
              <Motion
                v-if="isGenerating || isFixing"
                :initial="{ opacity: 0 }"
                :animate="{ opacity: 1 }"
                :exit="{ opacity: 0 }"
                class="loading-overlay"
              >
                <div class="loader-content">
                  <RotateCw :size="32" class="spinner" />
                  <h3>{{ isGenerating ? (activeMode === 'resume' ? 'TAILORING RESUME...' : 'CRAFTING COVER LETTER...') : 'DEBUGGING...' }}</h3>
                </div>
              </Motion>
            </AnimatePresence>
            <codemirror
              v-if="activeMode === 'resume'"
              v-model="resumeLatex"
              placeholder="Tailored Resume LaTeX content will appear here..."
              :style="{ height: '100%' }"
              :autofocus="true"
              :indent-with-tab="true"
              :tab-size="2"
              :extensions="extensions"
              class="latex-editor-cm"
            />
            <codemirror
              v-else
              v-model="clLatex"
              placeholder="Tailored Cover Letter LaTeX content will appear here..."
              :style="{ height: '100%' }"
              :autofocus="true"
              :indent-with-tab="true"
              :tab-size="2"
              :extensions="extensions"
              class="latex-editor-cm"
            />
          </div>

          <AnimatePresence>
            <Motion 
              v-if="activeLatex && (isComparing || activePdfUrl)"
              class="refinement-bar"
              drag
              :drag-constraints="splitPaneRef || undefined"
              :drag-elastic="0.1"
              :initial="{ opacity: 0, y: -10, x: '-50%' }"
              :animate="{ opacity: 1, y: 0, x: '-50%' }"
              :exit="{ opacity: 0, y: -10, x: '-50%' }"
              style="z-index: 100; position: absolute; left: 50%; top: 20px;"
            >
              <input 
                v-model="refinementInstruction" 
                :placeholder="`Refine tailored ${activeMode === 'resume' ? 'resume' : 'cover letter'}...`"
                @keyup.enter="refineWithAi"
              />
              <button @click="refineWithAi" :disabled="isRefining">
                <Loader2 v-if="isRefining" :size="14" class="spinner" />
                <span v-else>→</span>
              </button>
            </Motion>
          </AnimatePresence>

          <div v-if="activePdfUrl && (activeMode === 'resume' ? isResumeCompiled : isClCompiled) && !isComparing" class="preview-resizer" @mousedown="startResizingPreview"></div>

          <div v-if="activePdfUrl && (activeMode === 'resume' ? isResumeCompiled : isClCompiled)" class="pdf-viewer tailored-pdf-viewer" :style="isComparing ? { flex: 1, width: 'auto' } : { width: previewWidth + 'px', flex: 'none' }">
            <div v-if="isComparing" class="compare-header" style="padding: 8px; text-align: center; font-size: 0.8rem; font-weight: 800; background: var(--surface-soft); border-bottom: 1px solid var(--line); color: var(--accent);">TAILORED VERSION</div>
            <VirtualizedPdfViewer :key="isComparing.toString()" :source="activePdfUrl" @error="onPdfError" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.workspace-header {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-accent);
  border-bottom: 1px solid var(--line);
}

.header-left { display: flex; align-items: center; gap: 12px; }
.back-btn { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1.2rem; padding: 0 4px; }
.back-btn:hover { color: var(--ink); }

.job-info { display: flex; align-items: center; gap: 8px; }
.title { font-size: 0.8rem; font-weight: 600; color: var(--ink); margin: 0; }
.company { font-size: 0.8rem; color: var(--muted); }
.link-btn { background: none; border: none; cursor: pointer; padding: 2px; font-size: 0.8rem; opacity: 0.7; }
.link-btn:hover { opacity: 1; }

.header-actions { display: flex; gap: 8px; }
.delete-btn { background: none; border: none; color: var(--warning); font-size: 0.7rem; font-weight: 600; cursor: pointer; text-transform: uppercase; }

.error-banner {
  background: var(--warning);
  color: var(--surface);
  padding: 6px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 500;
  z-index: 10;
  gap: 8px;
}

.error-banner-text {
  flex: 1;
  word-break: break-word;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.banner-copy-btn,
.banner-close-btn {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
  border-radius: 4px;
  padding: 2px 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.banner-copy-btn:hover,
.banner-close-btn:hover {
  background: rgba(0, 0, 0, 0.35);
}

.split-view {
  flex: 1;
  display: flex;
  min-height: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-header-icon {
  color: var(--accent);
  margin-bottom: 12px;
  display: flex;
  position: relative;
  cursor: help;
}

.meta-icon-wrapper {
  color: var(--muted);
  display: flex;
  align-items: center;
  position: relative;
  cursor: help;
}

.sidebar-tooltip {
  left: 100%;
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
  margin-left: 12px;
  z-index: 2000;
}

.sidebar-tooltip::after {
  top: 50%;
  right: 100%;
  left: auto;
  bottom: auto;
  transform: translateY(-50%);
  border-top-color: transparent;
  border-right-color: var(--accent);
}

.info-panel {
  width: 260px;
  background: var(--bg-accent);
  border-right: 1px solid var(--line);
  padding: 12px;
  gap: 20px;
  overflow-y: auto;
}

.section h3 {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--muted);
  letter-spacing: 0.05em;
  margin: 0 0 8px 0;
}

.meta-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 6px;
  font-size: 0.75rem;
}
.meta-grid .label { color: var(--muted); }
.meta-grid .value { color: var(--ink); font-weight: 500; }

.tight-list {
  padding-left: 12px;
  margin: 0;
  font-size: 0.75rem;
  color: var(--ink);
  opacity: 0.85;
}
.tight-list li { margin-bottom: 4px; }

.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 0.65rem; color: var(--muted); margin-bottom: 4px; }

.compact-select, .compact-textarea {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 0.75rem;
  padding: 6px;
  outline: none;
}

.status-select {
  font-weight: 700;
  color: var(--accent);
}

.status-select option {
  background: var(--bg-accent);
  color: var(--ink);
  font-weight: normal;
}

.milestones-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.milestone-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.7rem;
}

.milestone-label {
  color: var(--muted);
  font-weight: 600;
  text-transform: uppercase;
}

.milestone-value {
  color: var(--accent);
  font-weight: 700;
}

.salary-badge {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
}

.edit-salary-btn {
  background: none;
  border: 1px dashed var(--line);
  color: var(--muted);
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.edit-salary-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.compact-textarea { height: 60px; resize: none; }

.btn-accent {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-accent:disabled { opacity: 0.5; }

.btn-tooltip-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.flying-message {
  position: absolute;
  bottom: 140%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.flying-message::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--accent);
}

.header-tooltip { bottom: auto; top: 140%; }
.header-tooltip::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: var(--accent); }
.delete-tooltip { background: var(--warning); left: auto; right: 0; transform: none; }
.delete-tooltip::after { border-bottom-color: var(--warning); left: auto; right: 8px; transform: none; }

.tab-tooltip { bottom: 140%; left: 50%; }
.info-tooltip { bottom: 140%; left: 50%; }

.right-tabs .tab-tooltip {
  left: auto;
  right: 0;
  transform: none;
}

.right-tabs .tab-tooltip::after {
  left: auto;
  right: 14px;
  transform: none;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.panel-tabs {
  height: 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-accent);
  padding: 0 4px;
  border-bottom: 1px solid var(--line);
}

.left-tabs, .right-tabs { display: flex; align-items: center; }

.tab {
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ink);
  background: var(--bg);
  border: none;
  border-top: 1px solid var(--accent);
}

.tab-btn-mode {
  height: 32px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: 0.2s;
  letter-spacing: 0.05em;
  position: relative;
}

.tab-btn-mode.active {
  color: var(--ink);
  background: var(--bg);
}

.tab-btn-mode.active::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--accent);
}

.tab-btn-mode:hover:not(.active) {
  color: var(--ink);
  background: var(--surface-soft);
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--line);
  margin: 0 8px;
}

.tab-btn {
  padding: 0 10px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: 0.15s;
}
.tab-btn:hover { color: var(--ink); }

.accent-btn { color: var(--accent); }
.ai-btn { color: #a371f7; }

.error-log {
  background: var(--bg);
  border-bottom: 1px solid var(--warning);
  max-height: 200px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.error-log header {
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.65rem;
  color: var(--warning);
  font-weight: 700;
  background: var(--surface-soft);
  border-bottom: 1px solid var(--line);
}
.error-log-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.error-log-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.error-log-actions button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  padding: 2px 4px;
  transition: all 0.2s;
}
.error-log-actions button:hover {
  color: var(--ink);
}
.error-log pre {
  margin: 0;
  padding: 8px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--warning);
  overflow: auto;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.editor-container {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  background: #282c34; /* One Dark background */
}

.split-pane {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.split-pane.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.preview-resizer {
  width: 4px;
  background: var(--bg-accent);
  cursor: col-resize;
  transition: background 0.2s;
  z-index: 10;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
}

.preview-resizer:hover, .preview-resizer:active {
  background: var(--accent);
}

.latex-editor-cm {
  flex: 1;
  width: 100%;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
}

:deep(.cm-editor) {
  height: 100%;
  outline: none !important;
}

:deep(.cm-scroller) {
  font-family: inherit;
}

:deep(.cm-content) {
  padding: 16px 0;
}

:deep(.cm-gutters) {
  background-color: #282c34 !important;
  border-right: 1px solid #3e4451 !important;
  color: #abb2bf !important;
}

.refinement-bar {
  position: absolute;
  top: 16px;
  left: 50%;
  width: 440px;
  background: var(--surface-soft);
  border: 1px solid var(--accent-soft);
  border-radius: 20px;
  display: flex;
  padding: 4px 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  z-index: 20;
  cursor: grab;
  touch-action: none;
}

.refinement-bar:active {
  cursor: grabbing;
}

.refinement-bar input {
  flex: 1;
  background: none;
  border: none;
  color: var(--ink);
  font-size: 0.8rem;
  padding: 6px 0;
  outline: none;
}

.refinement-bar button {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 1rem;
  cursor: pointer;
}

.pdf-viewer {
  flex: 1;
  display: block;
  background: var(--bg);
  position: relative;
  overflow: auto; /* Enable scrolling for vue-pdf-embed */
}

.pdf-embed-component {
  width: 100%;
  height: 100%;
  display: block;
  background: white;
}

.w-full { width: 100%; }

@media (max-width: 960px) {
  .info-panel { display: none; }
  .workspace-header { height: 44px; }
}

/* Match Score Panel */
.match-panel-wrapper {
  overflow: hidden;
  border-bottom: 1px solid var(--line);
  background: var(--surface-soft, var(--bg-accent));
}

.match-panel {
  padding: 12px 16px;
  font-size: 0.85rem;
  color: var(--ink);
}

.match-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.match-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: var(--accent);
}

.match-source-toggle {
  display: flex;
  gap: 0;
  background: var(--bg);
  padding: 2px;
  border-radius: 6px;
  border: 1px solid var(--line);
  margin-left: 8px;
  text-transform: none;
  letter-spacing: 0;
}

.seg-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
}

.seg-btn.active {
  background: var(--accent);
  color: white;
}

.match-panel-actions {
  display: flex;
  gap: 12px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}

.link-btn:hover { text-decoration: underline; }

.link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.match-empty, .match-error {
  padding: 16px 8px;
  color: var(--muted);
  text-align: center;
  font-size: 0.85rem;
}

.match-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--warning);
  background: var(--surface-soft);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  margin: 8px 0;
}

.match-error-content {
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.match-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.match-hero {
  display: flex;
  align-items: center;
  gap: 18px;
}

.match-score-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.match-score-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
}

.match-score-label strong {
  font-size: 1rem;
  letter-spacing: 0.02em;
}

.match-score-label span {
  color: var(--muted);
  font-size: 0.78rem;
}

.match-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-bar {
  display: grid;
  grid-template-columns: 60px 1fr 48px;
  align-items: center;
  gap: 10px;
  font-size: 0.75rem;
}

.match-bar .bar {
  height: 8px;
  background: var(--line);
  border-radius: 4px;
  overflow: hidden;
}

.match-bar .fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}

.match-bar strong {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.match-section {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.match-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 6px;
}

.match-section-title small {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.68rem;
  color: var(--muted);
  margin-left: 6px;
}

.match-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.match-chip {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
  text-transform: lowercase;
}

.match-chip.chip-present {
  background: rgba(46, 204, 113, 0.12);
  color: #2ecc71;
  border-color: rgba(46, 204, 113, 0.3);
}

.match-chip.chip-missing {
  background: rgba(233, 69, 96, 0.12);
  color: #e94560;
  border-color: rgba(233, 69, 96, 0.3);
}

.match-chip.chip-weak {
  background: rgba(245, 166, 35, 0.12);
  color: #f5a623;
  border-color: rgba(245, 166, 35, 0.3);
}

.match-footer {
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 0.7rem;
  color: var(--muted);
  font-style: italic;
}

.tab-btn.active {
  color: var(--accent);
}

.form-input-compact {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 0.75rem;
  padding: 6px;
  outline: none;
}
.form-input-compact:focus {
  border-color: var(--accent);
}

.hr-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  background: var(--bg);
  flex: 1;
  min-height: 0;
}

.hr-editor-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-accent);
  border-bottom: 1px solid var(--line);
  gap: 12px;
  flex-wrap: wrap;
}

.hr-meta-tags {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hr-badge-stat {
  font-size: 0.75rem;
  color: var(--muted);
}
.hr-badge-stat strong {
  color: var(--ink);
  font-weight: 700;
}

.hr-badge-pill {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pill-safe {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid var(--accent);
}

.pill-warn {
  background: rgba(248, 81, 73, 0.15);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.hr-badge-contact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--accent);
  cursor: pointer;
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--line);
}
.hr-badge-contact:hover {
  text-decoration: underline;
}

.hr-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hr-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s ease;
}

.hr-action-btn:hover {
  background: var(--surface-soft);
  border-color: var(--accent);
}

.hr-action-btn.copied {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}

.btn-send {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.btn-send:hover {
  opacity: 0.9;
}

.hr-textarea-container {
  flex: 1;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.hr-message-editor {
  width: 100%;
  height: 100%;
  resize: none;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
  font-size: 0.88rem;
  line-height: 1.6;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.hr-message-editor:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.hr-refine-bottom {
  padding: 12px 16px;
  background: var(--bg-accent);
  border-top: 1px solid var(--line);
}

.hr-refine-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hr-refine-input {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.8rem;
  color: var(--ink);
  outline: none;
}
.hr-refine-input:focus {
  border-color: var(--accent);
}

.hr-refine-btn {
  padding: 8px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 80px;
}
.hr-refine-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
