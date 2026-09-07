<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useOutreachStore, OutreachLead } from '../store/outreach';
import { useHrMessagesStore } from '../store/hr_messages';
import { useDialogStore } from '../store/dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { 
  Plus, 
  Send, 
  Search, 
  X, 
  Save, 
  RotateCw, 
  CheckSquare, 
  Square, 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  User, 
  Edit3
} from '@lucide/vue';
import { Motion, AnimatePresence } from 'motion-v';
import CustomSelect from './CustomSelect.vue';

const outreachStore = useOutreachStore();
const hrStore = useHrMessagesStore();
const dialog = useDialogStore();

// Tooltip State
const activeTooltip = ref<string | null>(null);

// Selection State
const isSelectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

// Search & Filter State
const searchQuery = ref('');
const statusFilter = ref<string>('ALL');

// Form & Editor State
const showForm = ref(false);
const editingLeadId = ref<string | null>(null);

const formName = ref('');
const formProfileUrl = ref('');
const formHeadline = ref('');
const formRawBio = ref('');
const formPosts = ref<string[]>(['', '']); // default 2 post slots
const formTemplateId = ref<string>('');
const formCharLimit = ref<number>(200);
const formCustomInstruction = ref('');
const formTailoredMessage = ref('');
const formStatus = ref<string>('Draft');

const isGenerating = ref(false);
const isSaving = ref(false);
const copiedId = ref<string | null>(null);
const formCopied = ref(false);

// Character Limit Presets
const PRESETS = [200, 250, 300, 500];

// Themed dropdown options (CustomSelect renders its own popup, so the
// option list follows the global theme instead of native OS styling)
const templateOptions = computed(() => [
  { value: '', label: '-- No base template (Tailor from scratch) --' },
  ...hrStore.templates.map(t => ({ value: t.id, label: `${t.name} (${t.category})` }))
]);

const statusOptions = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Connected', label: 'Connected' },
  { value: 'Replied', label: 'Replied' },
  { value: 'Archived', label: 'Archived' }
];

onMounted(async () => {
  await Promise.all([
    outreachStore.loadAllLeads(),
    hrStore.loadTemplates()
  ]);
});

// Filtered Leads
const filteredLeads = computed(() => {
  let list = outreachStore.leads;

  if (statusFilter.value !== 'ALL') {
    list = list.filter(l => l.status === statusFilter.value);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(l => 
      l.person_name.toLowerCase().includes(q) ||
      (l.headline && l.headline.toLowerCase().includes(q)) ||
      l.raw_bio.toLowerCase().includes(q) ||
      (l.tailored_message && l.tailored_message.toLowerCase().includes(q))
    );
  }

  return list;
});

// Selection helpers
const toggleSelection = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const toggleSelectAll = () => {
  if (selectedIds.value.size === filteredLeads.value.length) {
    selectedIds.value.clear();
  } else {
    selectedIds.value = new Set(filteredLeads.value.map(l => l.id));
  }
};

const exitSelectionMode = () => {
  isSelectionMode.value = false;
  selectedIds.value.clear();
};

const handleBatchDelete = async () => {
  if (selectedIds.value.size === 0) return;

  const count = selectedIds.value.size;
  const confirmed = await dialog.showConfirm(
    `Are you sure you want to delete ${count} outreach lead(s)? This action cannot be undone.`,
    'Delete Leads'
  );

  if (confirmed) {
    try {
      await outreachStore.deleteBatch(Array.from(selectedIds.value));
      selectedIds.value.clear();
      await dialog.showAlert('Leads deleted successfully.', 'Success');
    } catch (err: any) {
      console.error(err);
      await dialog.showAlert('Failed to delete selected leads.', 'Error');
    }
  }
};

// Form Management
const resetForm = () => {
  editingLeadId.value = null;
  formName.value = '';
  formProfileUrl.value = '';
  formHeadline.value = '';
  formRawBio.value = '';
  formPosts.value = ['', ''];
  formTemplateId.value = '';
  formCharLimit.value = 200;
  formCustomInstruction.value = '';
  formTailoredMessage.value = '';
  formStatus.value = 'Draft';
  formCopied.value = false;
};

const openNewForm = () => {
  resetForm();
  showForm.value = true;
};

const closeForm = () => {
  showForm.value = false;
  resetForm();
};

const editLead = (lead: OutreachLead) => {
  editingLeadId.value = lead.id;
  formName.value = lead.person_name;
  formProfileUrl.value = lead.profile_url;
  formHeadline.value = lead.headline || '';
  formRawBio.value = lead.raw_bio;
  formPosts.value = lead.recent_posts && lead.recent_posts.length > 0 
    ? [...lead.recent_posts] 
    : ['', ''];
  formTemplateId.value = lead.template_id || '';
  formCharLimit.value = lead.char_limit || 200;
  formTailoredMessage.value = lead.tailored_message || '';
  formStatus.value = lead.status || 'Draft';
  formCustomInstruction.value = '';
  showForm.value = true;
};

const addPostSlot = () => {
  if (formPosts.value.length < 3) {
    formPosts.value.push('');
  }
};

const removePostSlot = (index: number) => {
  if (formPosts.value.length > 1) {
    formPosts.value.splice(index, 1);
  } else {
    formPosts.value[0] = '';
  }
};

const setCharLimit = (limit: number) => {
  formCharLimit.value = limit;
};

// AI Tailoring
const generateMessage = async () => {
  if (!formName.value.trim()) {
    await dialog.showAlert('Please provide the person\'s name.', 'Validation Error');
    return;
  }
  if (!formRawBio.value.trim()) {
    await dialog.showAlert('Please paste the person\'s profile bio or summary.', 'Validation Error');
    return;
  }

  isGenerating.value = true;
  try {
    const validPosts = formPosts.value.map(p => p.trim()).filter(p => p.length > 0);

    const tailored = await outreachStore.generateTailoredMessage({
      leadId: editingLeadId.value || undefined,
      personName: formName.value.trim(),
      profileUrl: formProfileUrl.value.trim(),
      headline: formHeadline.value.trim() || undefined,
      rawBio: formRawBio.value.trim(),
      recentPosts: validPosts,
      templateId: formTemplateId.value || undefined,
      charLimit: formCharLimit.value || 200,
      customInstruction: formCustomInstruction.value.trim() || undefined,
    });

    formTailoredMessage.value = tailored;
  } catch (err: any) {
    console.error('Error generating tailored outreach:', err);
    await dialog.showAlert(err?.message || 'Failed to tailor outreach message.', 'Generation Error');
  } finally {
    isGenerating.value = false;
  }
};

// Save Lead
const handleSave = async () => {
  if (!formName.value.trim()) {
    await dialog.showAlert('Please enter the person\'s name.', 'Validation Error');
    return;
  }
  if (!formProfileUrl.value.trim()) {
    await dialog.showAlert('Please enter the profile URL.', 'Validation Error');
    return;
  }

  isSaving.value = true;
  try {
    const validPosts = formPosts.value.map(p => p.trim()).filter(p => p.length > 0);

    await outreachStore.saveLead({
      id: editingLeadId.value || undefined,
      personName: formName.value.trim(),
      profileUrl: formProfileUrl.value.trim(),
      headline: formHeadline.value.trim() || undefined,
      rawBio: formRawBio.value.trim(),
      recentPosts: validPosts,
      templateId: formTemplateId.value || undefined,
      charLimit: formCharLimit.value || 200,
      tailoredMessage: formTailoredMessage.value.trim() || undefined,
      status: formStatus.value || 'Draft',
    });

    await dialog.showAlert('Outreach lead saved successfully.', 'Success');
    closeForm();
  } catch (err: any) {
    console.error('Error saving lead:', err);
    await dialog.showAlert('Failed to save outreach lead.', 'Error');
  } finally {
    isSaving.value = false;
  }
};

const handleDeleteLead = async (lead: OutreachLead) => {
  const confirmed = await dialog.showConfirm(
    `Are you sure you want to delete lead for "${lead.person_name}"?`,
    'Delete Lead'
  );

  if (confirmed) {
    try {
      await outreachStore.deleteLead(lead.id);
    } catch (err: any) {
      console.error(err);
      await dialog.showAlert('Failed to delete lead.', 'Error');
    }
  }
};

const copyText = async (text: string, leadId?: string) => {
  if (!text) return;
  try {
    await writeText(text);
    if (leadId) {
      copiedId.value = leadId;
      setTimeout(() => { copiedId.value = null; }, 2000);
    } else {
      formCopied.value = true;
      setTimeout(() => { formCopied.value = false; }, 2000);
    }
  } catch (err) {
    console.error('Failed to copy text:', err);
  }
};

const openProfile = (url: string) => {
  if (!url) return;
  openUrl(url).catch((err: any) => console.error('Failed to open profile URL:', err));
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Sent': return 'status-sent';
    case 'Connected': return 'status-connected';
    case 'Replied': return 'status-replied';
    case 'Archived': return 'status-archived';
    default: return 'status-draft';
  }
};

const characterCount = computed(() => formTailoredMessage.value.length);

const characterCountClass = computed(() => {
  const limit = formCharLimit.value;
  const count = characterCount.value;
  if (count === 0) return '';
  if (count <= limit) return 'count-safe';
  return 'count-danger';
});
</script>

<template>
  <div class="outreach-container">
    <!-- Header -->
    <div class="page-header">
      <div class="header-main">
        <div class="header-icon-box">
          <Send :size="24" class="header-icon" />
        </div>
        <div>
          <h2>Direct Outreach</h2>
          <p class="subtitle">
            Hyper-personalized, factually honest executive outreach tailored from profiles and posts with strict character limits.
          </p>
        </div>
      </div>

      <div class="actions">
        <template v-if="!isSelectionMode">
          <!-- Selection Mode Button -->
          <div 
            v-if="outreachStore.leads.length > 0"
            class="btn-tooltip-wrapper" 
            @mouseenter="activeTooltip = 'select-mode'" 
            @mouseleave="activeTooltip = null"
          >
            <button class="btn-action" @click="isSelectionMode = true">
              <CheckSquare :size="16" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'select-mode'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                :transition="{ duration: 0.15 }"
                class="floating-message tooltip-top"
              >
                Select Multiple
              </Motion>
            </AnimatePresence>
          </div>

          <!-- Refresh Button -->
          <div class="btn-tooltip-wrapper" @mouseenter="activeTooltip = 'refresh'" @mouseleave="activeTooltip = null">
            <button class="btn-action" @click="outreachStore.loadAllLeads">
              <RotateCw :size="16" :class="{ 'spinner': outreachStore.isLoading }" />
            </button>
            <AnimatePresence>
              <Motion
                v-if="activeTooltip === 'refresh'"
                :initial="{ opacity: 0, y: 5, scale: 0.9 }"
                :animate="{ opacity: 1, y: 0, scale: 1 }"
                :exit="{ opacity: 0, y: 5, scale: 0.9 }"
                :transition="{ duration: 0.15 }"
                class="floating-message tooltip-top"
              >
                Refresh Leads
              </Motion>
            </AnimatePresence>
          </div>

          <!-- New Lead Button -->
          <button class="btn-primary" @click="openNewForm">
            <Plus :size="16" />
            <span>New Lead</span>
          </button>
        </template>

        <!-- Selection Mode Actions -->
        <template v-else>
          <button class="btn-action select-all-btn" @click="toggleSelectAll">
            <component :is="selectedIds.size === filteredLeads.length ? CheckSquare : Square" :size="16" />
            <span>{{ selectedIds.size === filteredLeads.length ? 'Deselect All' : 'Select All' }}</span>
          </button>

          <button 
            class="btn-action btn-danger" 
            :disabled="selectedIds.size === 0" 
            @click="handleBatchDelete"
          >
            <Trash2 :size="16" />
            <span>Delete ({{ selectedIds.size }})</span>
          </button>

          <button class="btn-action" @click="exitSelectionMode">
            <X :size="16" />
            <span>Cancel</span>
          </button>
        </template>
      </div>
    </div>

    <!-- Filters & Search Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <Search :size="15" class="search-icon" />
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search by name, headline, bio..." 
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">
          <X :size="13" />
        </button>
      </div>

      <div class="status-filters">
        <button 
          v-for="st in ['ALL', 'Draft', 'Sent', 'Connected', 'Replied', 'Archived']" 
          :key="st"
          class="filter-pill"
          :class="{ active: statusFilter === st }"
          @click="statusFilter = st"
        >
          {{ st }}
        </button>
      </div>
    </div>

    <!-- Sliding Inline Creator & Editor Form -->
    <AnimatePresence>
      <Motion
        v-if="showForm"
        :initial="{ opacity: 0, height: 0, y: -10 }"
        :animate="{ opacity: 1, height: 'auto', y: 0 }"
        :exit="{ opacity: 0, height: 0, y: -10 }"
        :transition="{ duration: 0.22, ease: 'easeOut' }"
        class="form-wrapper"
      >
        <div class="form-card">
          <div class="form-header">
            <div class="form-title">
              <Sparkles :size="18" class="sparkle-icon" />
              <span>{{ editingLeadId ? 'Edit Outreach Lead' : 'Tailor Direct Outreach' }}</span>
            </div>
            <button class="icon-btn-close" @click="closeForm">
              <X :size="18" />
            </button>
          </div>

          <div class="form-grid">
            <!-- Left Column: Recipient Data & Bio -->
            <div class="form-col">
              <div class="field-group">
                <label class="field-label">Person Name <span class="required">*</span></label>
                <input 
                  v-model="formName" 
                  type="text" 
                  placeholder="e.g. Alex Mercer" 
                  class="text-input" 
                />
              </div>

              <div class="field-group">
                <label class="field-label">Profile URL <span class="required">*</span></label>
                <div class="input-with-action">
                  <input 
                    v-model="formProfileUrl" 
                    type="url" 
                    placeholder="https://linkedin.com/in/alex-mercer" 
                    class="text-input" 
                  />
                  <button 
                    v-if="formProfileUrl" 
                    type="button" 
                    class="field-action-btn"
                    title="Open Link in Browser"
                    @click="openProfile(formProfileUrl)"
                  >
                    <ExternalLink :size="14" />
                  </button>
                </div>
              </div>

              <div class="field-group">
                <label class="field-label">Headline / Title</label>
                <input 
                  v-model="formHeadline" 
                  type="text" 
                  placeholder="e.g. Engineering Lead at Stripe | ex-Google" 
                  class="text-input" 
                />
              </div>

              <div class="field-group">
                <label class="field-label">
                  Profile Bio / Raw Summary <span class="required">*</span>
                  <span class="label-hint">Paste their About section or summary</span>
                </label>
                <textarea 
                  v-model="formRawBio" 
                  rows="4" 
                  placeholder="Paste their LinkedIn 'About', summary, or career background details here..." 
                  class="text-area"
                ></textarea>
              </div>

              <!-- Recent Posts (2-3 posts) -->
              <div class="field-group posts-group">
                <div class="label-row">
                  <label class="field-label">
                    Recent Posts / Insights ({{ formPosts.length }}/3)
                    <span class="label-hint">AI references these authentic topics</span>
                  </label>
                  <button 
                    v-if="formPosts.length < 3" 
                    type="button" 
                    class="btn-add-post" 
                    @click="addPostSlot"
                  >
                    <Plus :size="12" /> Add Post
                  </button>
                </div>

                <div v-for="(_, index) in formPosts" :key="index" class="post-slot">
                  <div class="post-slot-header">
                    <span class="post-slot-tag">Post #{{ index + 1 }}</span>
                    <button 
                      v-if="formPosts.length > 1" 
                      type="button" 
                      class="btn-remove-post" 
                      @click="removePostSlot(index)"
                      title="Remove post"
                    >
                      <X :size="12" />
                    </button>
                  </div>
                  <textarea 
                    v-model="formPosts[index]" 
                    rows="2" 
                    :placeholder="`Paste text from recent post #${index + 1}...`" 
                    class="text-area post-textarea"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- Right Column: Settings, Generator & Result -->
            <div class="form-col">
              <!-- HR Base Template Dropdown -->
              <div class="field-group">
                <label class="field-label">Base HR Message Template (Optional)</label>
                <CustomSelect
                  v-model="formTemplateId"
                  :options="templateOptions"
                  class="select-input"
                />
              </div>

              <!-- Strict Character Limit Selection -->
              <div class="field-group">
                <div class="label-row">
                  <label class="field-label">
                    Strict Character Limit <span class="required">*</span>
                  </label>
                  <span class="limit-badge">{{ formCharLimit }} chars max</span>
                </div>
                
                <div class="limit-buttons-bar">
                  <button 
                    v-for="preset in PRESETS" 
                    :key="preset"
                    type="button"
                    class="btn-preset"
                    :class="{ active: formCharLimit === preset }"
                    @click="setCharLimit(preset)"
                  >
                    {{ preset }}
                    <span v-if="preset === 200" class="default-badge">Def</span>
                  </button>

                  <div class="custom-limit-box">
                    <span class="custom-limit-label">Custom:</span>
                    <input 
                      v-model.number="formCharLimit" 
                      type="number" 
                      min="50" 
                      max="2000" 
                      step="10" 
                      class="custom-limit-input"
                    />
                  </div>
                </div>
              </div>

              <!-- Custom Instructions -->
              <div class="field-group">
                <label class="field-label">Special Directives (Optional)</label>
                <input 
                  v-model="formCustomInstruction" 
                  type="text" 
                  placeholder="e.g. Mention that I loved their podcast on distributed systems" 
                  class="text-input" 
                />
              </div>

              <!-- AI Tailor Action Button -->
              <div class="tailor-action-bar">
                <button 
                  type="button" 
                  class="btn-tailor-ai" 
                  :disabled="isGenerating || !formName || !formRawBio"
                  @click="generateMessage"
                >
                  <Sparkles :size="16" :class="{ 'spinner': isGenerating }" />
                  <span>{{ isGenerating ? 'Crafting Tailored Outreach...' : 'Tailor Message with AI' }}</span>
                </button>
              </div>

              <!-- Result Message Area -->
              <div class="field-group result-group">
                <div class="label-row">
                  <label class="field-label">Tailored Outreach Message</label>
                  <div class="counter-box" :class="characterCountClass">
                    {{ characterCount }} / {{ formCharLimit }} chars
                  </div>
                </div>

                <textarea 
                  v-model="formTailoredMessage" 
                  rows="6" 
                  placeholder="Generated outreach message will appear here. You can also edit it directly..." 
                  class="text-area result-textarea"
                ></textarea>

                <div class="result-actions">
                  <button 
                    type="button" 
                    class="btn-result-action" 
                    :disabled="!formTailoredMessage"
                    @click="copyText(formTailoredMessage)"
                  >
                    <component :is="formCopied ? Check : Copy" :size="14" />
                    <span>{{ formCopied ? 'Copied!' : 'Copy to Clipboard' }}</span>
                  </button>

                  <div class="status-selector-box">
                    <label class="status-label">Status:</label>
                    <CustomSelect
                      v-model="formStatus"
                      :options="statusOptions"
                      class="select-status"
                    />
                  </div>
                </div>
              </div>

              <!-- Form Submit Actions -->
              <div class="form-actions">
                <button type="button" class="btn-cancel" @click="closeForm">Cancel</button>
                <button 
                  type="button" 
                  class="btn-save" 
                  :disabled="isSaving || !formName || !formProfileUrl"
                  @click="handleSave"
                >
                  <Save :size="16" />
                  <span>{{ isSaving ? 'Saving...' : 'Save Lead' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Motion>
    </AnimatePresence>

    <!-- Empty State -->
    <div v-if="filteredLeads.length === 0 && !outreachStore.isLoading" class="empty-state">
      <div class="empty-icon-box">
        <Send :size="32" class="empty-icon" />
      </div>
      <h3>{{ searchQuery || statusFilter !== 'ALL' ? 'No matching leads found' : 'No outreach leads yet' }}</h3>
      <p>
        {{ searchQuery || statusFilter !== 'ALL' 
          ? 'Try adjusting your search query or status filter.' 
          : 'Paste a recruiter or hiring manager\'s profile info and recent posts to craft tailored, character-constrained outreach messages.' 
        }}
      </p>
      <button v-if="!searchQuery && statusFilter === 'ALL'" class="btn-primary empty-btn" @click="openNewForm">
        <Plus :size="16" />
        <span>Create First Outreach Lead</span>
      </button>
    </div>

    <!-- Leads Grid -->
    <div v-else class="leads-grid">
      <div 
        v-for="lead in filteredLeads" 
        :key="lead.id" 
        class="lead-card"
        :class="{ 'is-selected': selectedIds.has(lead.id) }"
        @click="isSelectionMode ? toggleSelection(lead.id) : null"
      >
        <!-- Selection Checkbox Overlay -->
        <div v-if="isSelectionMode" class="selection-box">
          <component 
            :is="selectedIds.has(lead.id) ? CheckSquare : Square" 
            :size="18" 
            :class="{ 'selected-icon': selectedIds.has(lead.id) }"
          />
        </div>

        <div class="lead-card-header">
          <div class="person-identity">
            <div class="avatar-dot">
              <User :size="14" />
            </div>
            <div class="identity-text">
              <h4 class="person-name">{{ lead.person_name }}</h4>
              <p v-if="lead.headline" class="person-headline">{{ lead.headline }}</p>
            </div>
          </div>

          <div class="header-badges">
            <span class="status-pill" :class="getStatusClass(lead.status)">
              {{ lead.status }}
            </span>
            <button 
              type="button" 
              class="icon-link-btn" 
              title="Open Profile URL" 
              @click.stop="openProfile(lead.profile_url)"
            >
              <ExternalLink :size="13" />
            </button>
          </div>
        </div>

        <!-- Meta info row -->
        <div class="lead-meta-row">
          <span class="meta-tag">
            Limit: {{ lead.char_limit }} chars
          </span>
          <span v-if="lead.recent_posts && lead.recent_posts.length > 0" class="meta-tag">
            {{ lead.recent_posts.length }} post{{ lead.recent_posts.length > 1 ? 's' : '' }} attached
          </span>
          <span v-if="lead.tailored_message" class="meta-tag length-tag">
            Msg: {{ lead.tailored_message.length }} chars
          </span>
        </div>

        <!-- Tailored Message Preview -->
        <div class="message-preview-box">
          <p v-if="lead.tailored_message" class="preview-text">
            {{ lead.tailored_message }}
          </p>
          <p v-else class="no-message-text">
            No tailored message generated yet. Click Edit to tailor.
          </p>
        </div>

        <!-- Card Footer Actions -->
        <div class="lead-card-footer" @click.stop>
          <div class="footer-left">
            <button 
              v-if="lead.tailored_message" 
              type="button" 
              class="card-btn copy-btn"
              @click="copyText(lead.tailored_message, lead.id)"
            >
              <component :is="copiedId === lead.id ? Check : Copy" :size="13" />
              <span>{{ copiedId === lead.id ? 'Copied' : 'Copy' }}</span>
            </button>
          </div>

          <div class="footer-right">
            <button type="button" class="card-btn edit-btn" @click="editLead(lead)">
              <Edit3 :size="13" />
              <span>Edit / Tailor</span>
            </button>
            <button type="button" class="card-btn delete-btn" @click="handleDeleteLead(lead)">
              <Trash2 :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.outreach-container {
  padding: 40px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg, 12px);
  background: var(--surface-soft);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.header-icon {
  color: var(--accent);
}

h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 4px 0;
  letter-spacing: -0.01em;
}

.subtitle {
  font-size: 0.85rem;
  color: var(--muted);
  margin: 0;
  max-width: 650px;
  line-height: 1.4;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-tooltip-wrapper {
  position: relative;
  display: flex;
}

.btn-primary, .btn-action {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-md, 8px);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  padding: 0 16px;
  background: var(--accent);
  color: #fff;
  border: none;
}

.btn-primary:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

.btn-action {
  padding: 0 12px;
  background: var(--surface-soft);
  color: var(--ink);
  border: 1px solid var(--line);
}

.btn-action:hover {
  border-color: var(--muted);
  background: var(--surface);
}

.btn-danger {
  color: var(--warning);
  border-color: rgba(248, 81, 73, 0.3);
}

.btn-danger:hover {
  background: rgba(248, 81, 73, 0.1);
  border-color: var(--warning);
}

.btn-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Tooltip */
.floating-message {
  position: absolute;
  background: var(--accent);
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-top {
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%);
}

.tooltip-top::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--accent);
}

/* Filter & Search Bar */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 260px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--muted);
}

.search-input {
  width: 100%;
  height: 36px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md, 8px);
  padding: 0 32px 0 34px;
  font-size: 0.8rem;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--accent);
}

.clear-search {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
}

.status-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-pill {
  padding: 6px 12px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 16px;
  font-size: 0.75rem;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-pill:hover {
  color: var(--ink);
  border-color: var(--muted);
}

.filter-pill.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
}

/* Form Card */
.form-wrapper {
  margin-bottom: 32px;
  overflow: hidden;
}

.form-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg, 12px);
  padding: 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.form-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
}

.sparkle-icon {
  color: var(--accent);
}

.icon-btn-close {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.15s;
}

.icon-btn-close:hover {
  color: var(--ink);
  background: var(--surface-soft);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.field-group {
  margin-bottom: 16px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 6px;
}

.required {
  color: var(--warning);
}

.label-hint {
  font-weight: 400;
  color: var(--muted);
  margin-left: 6px;
  font-size: 0.7rem;
}

.text-input, .select-input, .text-area {
  width: 100%;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-md, 8px);
  padding: 9px 12px;
  font-size: 0.8rem;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s ease;
  font-family: inherit;
}

.text-input:focus, .select-input:focus, .text-area:focus {
  border-color: var(--accent);
}

.input-with-action {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-action .text-input {
  padding-right: 36px;
}

.field-action-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
}

.field-action-btn:hover {
  color: var(--accent);
}

.text-area {
  resize: vertical;
  line-height: 1.4;
}

/* Post slots */
.posts-group {
  margin-top: 20px;
}

.btn-add-post {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.btn-add-post:hover {
  border-color: var(--accent);
}

.post-slot {
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-md, 8px);
  padding: 8px 10px;
  margin-bottom: 10px;
}

.post-slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.post-slot-tag {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted);
}

.btn-remove-post {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
}

.btn-remove-post:hover {
  color: var(--warning);
}

.post-textarea {
  background: var(--surface);
  border: 1px solid var(--line);
}

/* Character Limit Buttons Bar */
.limit-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 8px;
  border-radius: 10px;
}

.limit-buttons-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-preset {
  position: relative;
  padding: 6px 12px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-preset:hover {
  border-color: var(--muted);
}

.btn-preset.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.default-badge {
  font-size: 0.6rem;
  background: var(--accent);
  color: white;
  padding: 1px 4px;
  border-radius: 4px;
  text-transform: uppercase;
}

.custom-limit-box {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.custom-limit-label {
  font-size: 0.7rem;
  color: var(--muted);
}

.custom-limit-input {
  width: 70px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 0.75rem;
  color: var(--ink);
  outline: none;
}

.custom-limit-input:focus {
  border-color: var(--accent);
}

/* Tailor AI action */
.tailor-action-bar {
  margin: 16px 0;
}

.btn-tailor-ai {
  width: 100%;
  height: 42px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.85rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-tailor-ai:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.btn-tailor-ai:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Result Area */
.result-group {
  margin-top: 10px;
}

.counter-box {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--muted);
  font-family: monospace;
}

.count-safe {
  color: var(--accent);
}

.count-danger {
  color: var(--warning);
}

.result-textarea {
  border-color: var(--accent);
  background: var(--surface);
  line-height: 1.5;
  font-size: 0.85rem;
}

.result-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-result-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-result-action:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-result-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.status-selector-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 0.75rem;
  color: var(--muted);
}

.select-status {
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
  color: var(--ink);
  outline: none;
}

/* CustomSelect root is full-width by default; constrain it inside the
   inline status row so it sizes like the old native select */
.status-selector-box .custom-select-container {
  width: auto;
  min-width: 132px;
}

/* Form Footer Actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.btn-cancel {
  padding: 8px 16px;
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-md, 8px);
  color: var(--muted);
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-cancel:hover {
  color: var(--ink);
  border-color: var(--muted);
}

.btn-save {
  padding: 8px 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.8rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.92;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: var(--radius-lg, 12px);
  margin-top: 16px;
}

.empty-icon-box {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px auto;
  color: var(--muted);
}

.empty-state h3 {
  font-size: 1.1rem;
  color: var(--ink);
  margin: 0 0 8px 0;
}

.empty-state p {
  font-size: 0.85rem;
  color: var(--muted);
  max-width: 480px;
  margin: 0 auto 20px auto;
  line-height: 1.4;
}

.empty-btn {
  margin: 0 auto;
}

/* Leads Grid */
.leads-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.lead-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg, 12px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  transition: all 0.15s ease;
}

.lead-card:hover {
  border-color: var(--muted);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}

.lead-card.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.selection-box {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--muted);
  cursor: pointer;
  z-index: 10;
}

.selected-icon {
  color: var(--accent);
}

.lead-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.person-identity {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.avatar-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  flex-shrink: 0;
}

.identity-text {
  min-width: 0;
}

.person-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.person-headline {
  font-size: 0.75rem;
  color: var(--muted);
  margin: 2px 0 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-pill {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 12px;
  letter-spacing: 0.05em;
}

.status-draft {
  background: var(--surface-soft);
  color: var(--muted);
  border: 1px solid var(--line);
}

.status-sent {
  background: rgba(9, 105, 218, 0.15);
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.3);
}

.status-connected {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid var(--accent);
}

.status-replied {
  background: rgba(210, 153, 34, 0.15);
  color: #e3b341;
  border: 1px solid rgba(227, 179, 65, 0.3);
}

.status-archived {
  background: var(--surface-soft);
  color: var(--muted);
  opacity: 0.7;
}

.icon-link-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
}

.icon-link-btn:hover {
  color: var(--accent);
}

.lead-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.meta-tag {
  font-size: 0.65rem;
  color: var(--muted);
  background: var(--surface-soft);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--line);
}

.length-tag {
  font-family: monospace;
  color: var(--accent);
}

.message-preview-box {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-md, 8px);
  padding: 10px 12px;
  margin-bottom: 14px;
  flex: 1;
}

.preview-text {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--ink);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.no-message-text {
  font-size: 0.75rem;
  color: var(--muted);
  font-style: italic;
  margin: 0;
}

.lead-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.footer-left, .footer-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.12s;
}

.card-btn:hover {
  border-color: var(--muted);
}

.copy-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.edit-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.delete-btn:hover {
  border-color: var(--warning);
  color: var(--warning);
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
