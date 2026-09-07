<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useHrMessagesStore, HrMessageTemplate } from '../store/hr_messages';
import { useDialogStore } from '../store/dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { copyToClipboard } from '../utils/clipboard';
import { 
  Plus, 
  Tag, 
  Calendar, 
  Hash, 
  MessageSquare, 
  X, 
  Save, 
  RotateCw, 
  CheckSquare, 
  Square, 
  Trash2,
  Settings2,
  Check,
  Copy,
  Edit2
} from '@lucide/vue';
import { Motion, AnimatePresence } from 'motion-v';

const hrStore = useHrMessagesStore();
const dialog = useDialogStore();

// Tooltip State
const activeTooltip = ref<string | null>(null);

// Selection State
const isSelectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

// Form State
const showNewForm = ref(false);
const editingTemplateId = ref<string | null>(null);
const formName = ref('');
const formCategory = ref('');
const formContent = ref('');
const isSaving = ref(false);
const copiedId = ref<string | null>(null);
const isErrorCopied = ref(false);
const handleCopyError = async () => {
  if (!hrStore.error) return;
  const ok = await copyToClipboard(hrStore.error);
  if (ok) {
    isErrorCopied.value = true;
    setTimeout(() => { isErrorCopied.value = false; }, 2000);
  }
};

onMounted(async () => {
  await hrStore.loadTemplates();
});

const toggleSelection = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const toggleSelectAll = () => {
  if (selectedIds.value.size === hrStore.templates.length) {
    selectedIds.value.clear();
  } else {
    selectedIds.value = new Set(hrStore.templates.map(t => t.id));
  }
};

const exitSelectionMode = () => {
  isSelectionMode.value = false;
  selectedIds.value.clear();
};

const handleBatchDelete = async () => {
  if (selectedIds.value.size === 0) return;
  
  const confirmed = await dialog.showConfirm(
    `Are you sure you want to delete ${selectedIds.value.size} templates? This action cannot be undone.`,
    'Delete Templates'
  );
  
  if (confirmed) {
    try {
      const ids = Array.from(selectedIds.value);
      for (const id of ids) {
        await hrStore.deleteTemplate(id);
      }
      selectedIds.value.clear();
      await dialog.showAlert('Templates deleted successfully.', 'Success');
    } catch (err: any) {
      console.error(err);
      await dialog.showAlert('Failed to delete some templates.', 'Error');
    }
  }
};

const toggleNewForm = () => {
  showNewForm.value = !showNewForm.value;
  if (!showNewForm.value) {
    editingTemplateId.value = null;
    formName.value = '';
    formCategory.value = '';
    formContent.value = '';
  }
};

const openEditForm = (template: HrMessageTemplate) => {
  editingTemplateId.value = template.id;
  formName.value = template.name;
  formCategory.value = template.category;
  formContent.value = template.content;
  showNewForm.value = true;
  const el = document.querySelector('.hr-container');
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleSaveTemplate = async () => {
  if (!formName.value.trim() || !formCategory.value.trim() || !formContent.value.trim()) {
    await dialog.showAlert('Please provide a template name, category, and message content.', 'Validation');
    return;
  }
  
  isSaving.value = true;
  try {
    if (editingTemplateId.value) {
      await hrStore.updateTemplate(
        editingTemplateId.value,
        formName.value.trim(),
        formCategory.value.trim(),
        formContent.value.trim()
      );
    } else {
      await hrStore.createTemplate(
        formName.value.trim(),
        formCategory.value.trim(),
        formContent.value.trim()
      );
    }
    showNewForm.value = false;
    editingTemplateId.value = null;
    formName.value = '';
    formCategory.value = '';
    formContent.value = '';
  } catch (err: any) {
    console.error(err);
    await dialog.showAlert(`Failed to save template: ${err.message || err}`, 'Error');
  } finally {
    isSaving.value = false;
  }
};

const handleDeleteSingle = async (template: HrMessageTemplate) => {
  const confirmed = await dialog.showConfirm(
    `Are you sure you want to delete the template "${template.name}"? This action cannot be undone.`,
    'Delete Template'
  );
  if (confirmed) {
    await hrStore.deleteTemplate(template.id);
  }
};

const handleCopy = async (template: HrMessageTemplate) => {
  try {
    await writeText(template.content);
    copiedId.value = template.id;
    setTimeout(() => {
      if (copiedId.value === template.id) copiedId.value = null;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy HR message:', e);
  }
};

const insertVariable = (variable: string) => {
  formContent.value += variable;
};
</script>

<template>
  <div class="hr-container">
    <header class="page-header">
      <div class="title-group">
        <h1>HR Message Templates</h1>
        <p class="subtitle" v-if="!isSelectionMode">Your blueprint collection for outreach and recruiter messages.</p>
        <p class="subtitle selection-hint" v-else>Click items to select/deselect them.</p>
      </div>
      
      <div class="header-actions">
        <!-- Default Actions -->
        <template v-if="!isSelectionMode">
          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'selection-mode'" @mouseleave="activeTooltip = null">
            <button class="btn-icon" :class="{ 'active': isSelectionMode }" @click="isSelectionMode = true">
              <Settings2 :size="16" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'selection-mode'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                class="floating-message tooltip-bottom-left"
              >
                Selection Mode
              </Motion>
            </AnimatePresence>
          </div>
          
          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'new-template'" @mouseleave="activeTooltip = null">
            <button class="btn-icon btn-icon-primary" @click="toggleNewForm">
              <Plus :size="18" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'new-template'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                class="floating-message tooltip-bottom-left"
              >
                {{ showNewForm ? 'Close Form' : 'Add Base Template' }}
              </Motion>
            </AnimatePresence>
          </div>
        </template>

        <!-- Selection Mode Actions -->
        <template v-else>
          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'select-all'" @mouseleave="activeTooltip = null">
            <button class="btn-icon" @click="toggleSelectAll">
              <Check :size="16" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'select-all'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                class="floating-message tooltip-bottom-left"
              >
                {{ selectedIds.size === hrStore.templates.length ? 'Unselect All' : 'Select All' }}
              </Motion>
            </AnimatePresence>
          </div>

          <div class="btn-tooltip-wrapper" v-if="selectedIds.size > 0" @mouseenter="activeTooltip = 'delete-batch'" @mouseleave="activeTooltip = null">
            <button class="btn-icon btn-icon-danger" @click="handleBatchDelete">
              <Trash2 :size="16" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'delete-batch'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                class="floating-message tooltip-bottom-left"
              >
                Delete Selected ({{ selectedIds.size }})
              </Motion>
            </AnimatePresence>
          </div>

          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'exit-selection'" @mouseleave="activeTooltip = null">
            <button class="btn-icon btn-icon-primary" @click="exitSelectionMode">
              <X :size="16" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'exit-selection'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                class="floating-message tooltip-bottom-left"
              >
                Done
              </Motion>
            </AnimatePresence>
          </div>
        </template>
      </div>
    </header>

    <div v-if="hrStore.error" class="error-banner">
      <span>{{ hrStore.error }}</span>
      <div class="banner-actions">
        <button class="banner-copy-btn" @click="handleCopyError" :title="isErrorCopied ? 'Copied!' : 'Copy Error'">
          <Check v-if="isErrorCopied" :size="13" />
          <Copy v-else :size="13" />
          <span>{{ isErrorCopied ? 'Copied!' : 'Copy' }}</span>
        </button>
        <button class="banner-close-btn" @click="hrStore.error = null" title="Dismiss">✕</button>
      </div>
    </div>

    <transition name="slide-down">
      <div v-if="showNewForm" class="form-card">
        <div class="form-header">
          <h3>{{ editingTemplateId ? 'Edit Template' : 'Create New Template' }}</h3>
          <button class="close-btn" @click="toggleNewForm"><X :size="18" /></button>
        </div>
        
        <div class="form-grid">
          <div class="form-group">
            <label>Template Name</label>
            <input 
              v-model="formName" 
              type="text" 
              placeholder="e.g., LinkedIn Connection Request"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>Category</label>
            <input 
              v-model="formCategory" 
              type="text" 
              placeholder="e.g., Outreach, LinkedIn, Follow-Up"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-group content-form-group">
          <div class="content-header-row">
            <label>Message Content</label>
            <div class="var-pills-row">
              <span class="var-pills-label">Insert variable:</span>
              <button type="button" class="var-pill-btn" @click="insertVariable('{recruiter_name}')">{recruiter_name}</button>
              <button type="button" class="var-pill-btn" @click="insertVariable('{company_name}')">{company_name}</button>
              <button type="button" class="var-pill-btn" @click="insertVariable('{job_title}')">{job_title}</button>
              <button type="button" class="var-pill-btn" @click="insertVariable('{candidate_name}')">{candidate_name}</button>
            </div>
          </div>
          <textarea 
            v-model="formContent" 
            rows="6" 
            placeholder="Write your message template here..."
            class="form-textarea"
          ></textarea>
        </div>

        <div class="form-actions">
          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'save-template'" @mouseleave="activeTooltip = null">
            <button class="btn-save" @click="handleSaveTemplate" :disabled="isSaving || !formName || !formCategory || !formContent">
              <RotateCw v-if="isSaving" :size="16" class="spinner" />
              <Save v-else :size="16" />
              <span>{{ isSaving ? 'Saving...' : (editingTemplateId ? 'Save Changes' : 'Initialize Template') }}</span>
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'save-template'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                :transition="{ duration: 0.15 }"
                class="floating-message tooltip-top-left"
              >
                {{ editingTemplateId ? 'Update template' : 'Create and Save' }}
              </Motion>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </transition>

    <div v-if="hrStore.isLoading" class="loading-state">
      Accessing blueprint vault...
    </div>

    <div v-else-if="hrStore.templates.length === 0" class="empty-state">
      <MessageSquare :size="48" class="empty-icon" />
      <h3>No templates found</h3>
      <p>Create your first base HR message template to start outreach.</p>
      <div class="btn-tooltip-wrapper" style="margin: 0 auto;" @mouseenter="activeTooltip = 'init-first'" @mouseleave="activeTooltip = null">
        <button class="btn-primary" @click="toggleNewForm">
          <Plus :size="18" />
          <span>Initialize First Template</span>
        </button>
        <AnimatePresence>
          <Motion
            v-if="activeTooltip === 'init-first'"
            :initial="{ opacity: 0, y: 5, scale: 0.9 }"
            :animate="{ opacity: 1, y: 0, scale: 1 }"
            :exit="{ opacity: 0, y: 5, scale: 0.9 }"
            :transition="{ duration: 0.15 }"
            class="floating-message tooltip-top"
          >
            Start Your Collection
          </Motion>
        </AnimatePresence>
      </div>
    </div>

    <div v-else class="resumes-grid">
      <div 
        v-for="template in hrStore.templates" 
        :key="template.id"
        class="resume-card"
        :class="{ 'selected': selectedIds.has(template.id) }"
        @click="isSelectionMode ? toggleSelection(template.id) : openEditForm(template)"
      >
        <div class="resume-card-top">
          <div class="selection-overlay" @click.stop="toggleSelection(template.id)">
            <CheckSquare v-if="selectedIds.has(template.id)" :size="20" class="select-icon active" />
            <Square v-else :size="20" class="select-icon" />
          </div>
          
          <div class="category-badge">
            <Tag :size="12" /> {{ template.category }}
          </div>
        </div>

        <h3 class="resume-name">{{ template.name }}</h3>

        <p class="template-content-preview">{{ template.content }}</p>
        
        <div class="resume-meta">
          <div class="meta-item">
            <Calendar :size="14" />
            <span>{{ new Date(template.created_at).toLocaleDateString() }}</span>
          </div>
          <div class="meta-item id-meta">
            <Hash :size="14" />
            <span>{{ template.content.length }} chars</span>
          </div>
        </div>

        <div class="card-footer">
          <div class="card-footer-actions">
            <button class="card-action-btn" @click.stop="handleCopy(template)" :title="copiedId === template.id ? 'Copied!' : 'Copy to clipboard'">
              <Check v-if="copiedId === template.id" :size="14" class="copied-check" />
              <Copy v-else :size="14" />
              <span :class="{ 'copied-check': copiedId === template.id }">{{ copiedId === template.id ? 'Copied' : 'Copy' }}</span>
            </button>
            <button class="card-action-btn" @click.stop="openEditForm(template)" title="Edit Template">
              <Edit2 :size="14" />
              <span>Edit</span>
            </button>
            <button class="card-action-btn delete-action" @click.stop="handleDeleteSingle(template)" title="Delete Template">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hr-container {
  padding: 40px;
  max-width: 1200px;
  margin: 0 auto;
  overflow-y: auto;
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.title-group h1 {
  font-size: 2rem;
  margin: 0 0 8px 0;
  color: var(--ink);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.subtitle {
  color: var(--muted);
  margin: 0;
  font-size: 0.95rem;
}

.selection-hint {
  color: var(--accent);
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  cursor: pointer;
  transition: 0.2s;
  background: var(--surface-soft);
  color: var(--ink);
  border: 1px solid var(--line);
  padding: 0;
}

.btn-icon:hover { background: var(--surface); border-color: var(--accent); }
.btn-icon.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

.btn-icon-primary {
  background: var(--accent);
  color: white;
  border: none;
}

.btn-icon-danger {
  background: transparent;
  color: var(--warning);
  border: 1px solid var(--warning);
}
.btn-icon-danger:hover { background: var(--warning); color: white; }

.btn-primary {
  background: var(--accent);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(11, 123, 107, 0.2); }

.btn-tooltip-wrapper {
  position: relative;
  display: flex;
}

.error-banner {
  background: var(--surface-soft);
  border: 1px solid var(--warning);
  border-radius: 12px;
  padding: 10px 16px;
  margin-bottom: 24px;
  color: var(--warning);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.banner-copy-btn {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.banner-copy-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.banner-close-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
}

.banner-close-btn:hover {
  color: var(--ink);
}

.form-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 32px;
  margin-bottom: 40px;
  box-shadow: var(--shadow);
  max-width: 100%;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.form-header h3 { margin: 0; font-size: 1.25rem; color: var(--ink); }

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  transition: 0.2s;
}

.close-btn:hover { color: var(--ink); }

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}

.form-group { display: flex; flex-direction: column; gap: 8px; }

.form-group label {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--accent);
  letter-spacing: 0.05em;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  font-size: 1rem;
  outline: none;
  transition: 0.2s;
}

.form-input:focus {
  border-color: var(--accent);
}

.content-form-group {
  margin-bottom: 24px;
}

.content-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.var-pills-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.var-pills-label {
  font-size: 0.72rem;
  color: var(--muted);
}

.var-pill-btn {
  background: var(--surface-soft);
  border: 1px solid var(--line);
  color: var(--accent);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-family: monospace;
  cursor: pointer;
  transition: 0.15s;
}

.var-pill-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.form-textarea {
  width: 100%;
  padding: 12px 16px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  font-size: 0.95rem;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  transition: 0.2s;
  resize: vertical;
}

.form-textarea:focus {
  border-color: var(--accent);
}

.form-actions { display: flex; justify-content: flex-end; }

.btn-save {
  background: var(--accent);
  color: white;
  border: none;
  padding: 12px 32px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 180px;
  white-space: nowrap;
}

.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.resumes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  padding-bottom: 40px;
}

.resume-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.resume-card.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.resume-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent);
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
}

.resume-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.selection-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  transition: 0.2s;
}

.select-icon.active {
  color: var(--accent);
}

.category-badge {
  padding: 4px 10px;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}

.resume-name {
  font-size: 1.25rem;
  margin: 0 0 12px 0;
  color: var(--ink);
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-content-preview {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--muted);
  margin: 0 0 16px 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  flex: 1;
}

.resume-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.8rem;
}

.id-meta { font-family: monospace; opacity: 0.7; }

.card-footer {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.card-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.card-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: 0.15s;
}

.card-action-btn:hover {
  color: var(--ink);
  background: var(--surface);
  border-color: var(--accent);
}

.card-action-btn.delete-action:hover {
  color: var(--warning);
  border-color: var(--warning);
}

.copied-check {
  color: var(--accent);
}

.loading-state, .empty-state {
  text-align: center;
  padding: 80px 0;
  color: var(--muted);
}

.empty-icon { margin-bottom: 16px; opacity: 0.3; color: var(--muted); }
.empty-state h3 { color: var(--ink); margin-bottom: 8px; }
.empty-state p { margin-bottom: 24px; }
.empty-state .btn-primary { margin: 0 auto; }

/* Transitions */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease-out; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-20px); }

@media (max-width: 768px) {
  .hr-container { padding: 16px; }
  .page-header { flex-direction: column; gap: 16px; align-items: stretch; margin-bottom: 20px; }
  .header-actions { justify-content: space-between; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
