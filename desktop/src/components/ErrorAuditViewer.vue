<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckCircle2,
  X,
  Clock,
  Terminal,
  Bug
} from '@lucide/vue';
import { useErrorAuditStore, ErrorAuditLog } from '../store/error_audit';
import { useDialogStore } from '../store/dialog';
import { copyToClipboard } from '../utils/clipboard';

const props = defineProps<{
  compact?: boolean;
}>();

const errorStore = useErrorAuditStore();
const dialog = useDialogStore();

const expandedLogIds = ref<Record<string, boolean>>({});
const copiedLogId = ref<string | null>(null);
const isCopyingAll = ref(false);
const hasCopiedAll = ref(false);
const testCreatedFeedback = ref(false);

onMounted(async () => {
  await errorStore.loadLogs();
  await errorStore.loadStats();
});

const selectTask = async (task: string) => {
  errorStore.selectedTaskFilter = task;
  await errorStore.loadLogs();
};

const handleSelectErrorType = async () => {
  await errorStore.loadLogs();
};

let searchTimeout: any = null;
const handleSearchInput = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    errorStore.loadLogs();
  }, 250);
};

const toggleExpand = (id: string) => {
  expandedLogIds.value[id] = !expandedLogIds.value[id];
};

const handleRefresh = async () => {
  await errorStore.loadLogs();
  await errorStore.loadStats();
};

const handleCopyLog = async (log: ErrorAuditLog) => {
  const ok = await errorStore.copyLog(log);
  if (ok) {
    copiedLogId.value = log.id;
    setTimeout(() => {
      if (copiedLogId.value === log.id) copiedLogId.value = null;
    }, 2000);
  }
};

const handleCopyDetails = async (details: string, logId: string) => {
  const ok = await copyToClipboard(details);
  if (ok) {
    copiedLogId.value = `${logId}-details`;
    setTimeout(() => {
      if (copiedLogId.value === `${logId}-details`) copiedLogId.value = null;
    }, 2000);
  }
};

const handleCopyAll = async () => {
  if (errorStore.filteredLogs.length === 0) {
    await dialog.showAlert('There are currently no error logs under the selected filter to copy.', 'Nothing to Copy');
    return;
  }
  isCopyingAll.value = true;
  try {
    const ok = await errorStore.copyAllFiltered();
    if (ok) {
      hasCopiedAll.value = true;
      setTimeout(() => {
        hasCopiedAll.value = false;
      }, 2000);
    }
  } finally {
    isCopyingAll.value = false;
  }
};

const handleClear = async () => {
  if (errorStore.logs.length === 0) {
    await dialog.showAlert('There are currently no error audit logs to clear.', 'No Error Logs');
    return;
  }
  const taskLabel = errorStore.selectedTaskFilter !== 'all' ? ` for task "${errorStore.selectedTaskFilter}"` : ' all';
  const confirmed = await dialog.showConfirm(
    `Are you sure you want to clear${taskLabel} error audit records? This action cannot be undone.`,
    'Clear Error Audit Logs'
  );
  if (confirmed) {
    await errorStore.clearLogs(errorStore.selectedTaskFilter);
  }
};

const handleDeleteSingle = async (id: string) => {
  await errorStore.deleteLog(id);
  delete expandedLogIds.value[id];
};

const handleLogTestError = async () => {
  const tasks = ['compiling', 'creating', 'fetching', 'ai_tailoring', 's3_backup'] as const;
  const t = tasks[Math.floor(Math.random() * tasks.length)];
  await errorStore.recordLog(
    t,
    t === 'compiling' ? 'TectonicCompilationError' : (t === 'ai_tailoring' ? 'AiError' : 'DatabaseError'),
    `Diagnostic test audit entry for [${t}] task.`,
    `Diagnostic Output Trace:\nTimestamp: ${new Date().toISOString()}\nOperation: Diagnostic Verification\nDetails: Test exception simulated successfully.`,
    'ErrorAuditViewer.vue'
  );
  await errorStore.loadLogs();
  testCreatedFeedback.value = true;
  setTimeout(() => {
    testCreatedFeedback.value = false;
  }, 2000);
};

const handleExportJson = () => {
  const json = errorStore.exportAsJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roletect-error-audit-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const formatTime = (timeStr: string): string => {
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return timeStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${Math.max(0, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  } catch {
    return timeStr;
  }
};

const getTaskBadgeClass = (task: string): string => {
  switch (task.toLowerCase()) {
    case 'compiling':
      return 'badge-task-compiling';
    case 'creating':
      return 'badge-task-creating';
    case 'fetching':
      return 'badge-task-fetching';
    case 'ai_tailoring':
    case 'ai_refining':
    case 'ai_fixing':
      return 'badge-task-ai';
    case 'saving':
      return 'badge-task-saving';
    case 'deleting':
      return 'badge-task-deleting';
    case 's3_backup':
      return 'badge-task-backup';
    default:
      return 'badge-task-general';
  }
};
</script>

<template>
  <div class="error-audit-wrapper" :class="{ 'compact-mode': props.compact }">
    <!-- Audit Header Toolbar -->
    <div class="audit-toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <Search :size="15" class="search-icon" />
          <input
            v-model="errorStore.searchQuery"
            type="text"
            placeholder="Search errors, details, tasks..."
            @input="handleSearchInput"
          />
          <button
            v-if="errorStore.searchQuery"
            class="clear-search-btn"
            @click="errorStore.searchQuery = ''; errorStore.loadLogs()"
          >
            <X :size="13" />
          </button>
        </div>

        <div class="filter-dropdown-wrapper">
          <Filter :size="14" class="filter-icon" />
          <select
            v-model="errorStore.selectedErrorTypeFilter"
            class="filter-select"
            @change="handleSelectErrorType"
          >
            <option value="all">All Error Types</option>
            <option value="TectonicCompilationError">Tectonic Compilation</option>
            <option value="AiError">AI Generation</option>
            <option value="DatabaseError">Database</option>
            <option value="FileSystemError">Filesystem</option>
            <option value="NetworkError">Network / S3</option>
            <option value="ValidationError">Validation</option>
            <option value="GeneralError">General</option>
          </select>
        </div>
      </div>

      <div class="toolbar-right">
        <button
          type="button"
          class="audit-btn secondary"
          :disabled="errorStore.isLoading"
          title="Refresh error logs from SQLite"
          @click="handleRefresh"
        >
          <RefreshCw :size="14" :class="{ 'spin-anim': errorStore.isLoading }" />
          <span>Refresh</span>
        </button>

        <button
          type="button"
          class="audit-btn secondary"
          :disabled="isCopyingAll"
          title="Copy all currently filtered errors"
          @click="handleCopyAll"
        >
          <component :is="hasCopiedAll ? Check : Copy" :size="14" />
          <span>{{ hasCopiedAll ? 'Copied All!' : 'Copy Filtered' }}</span>
        </button>

        <button
          type="button"
          class="audit-btn secondary"
          title="Export logs as JSON file"
          @click="handleExportJson"
        >
          <Download :size="14" />
          <span>Export JSON</span>
        </button>

        <button
          type="button"
          class="audit-btn secondary"
          title="Record a simulated error task to verify the audit ledger"
          @click="handleLogTestError"
        >
          <Bug :size="14" />
          <span>{{ testCreatedFeedback ? 'Test Logged!' : 'Test Log' }}</span>
        </button>

        <button
          type="button"
          class="audit-btn danger"
          title="Clear error audit records"
          @click="handleClear"
        >
          <Trash2 :size="14" />
          <span>Clear Logs</span>
        </button>
      </div>
    </div>

    <!-- Task Type Filter Pills -->
    <div class="task-filter-pills">
      <button
        v-for="task in errorStore.availableTaskTypes"
        :key="task"
        type="button"
        class="task-pill"
        :class="{ active: errorStore.selectedTaskFilter === task }"
        @click="selectTask(task)"
      >
        <span class="pill-label">{{ task.replace('_', ' ') }}</span>
        <span class="pill-count">
          {{ task === 'all' ? errorStore.stats.total : (errorStore.stats.by_task[task] || 0) }}
        </span>
      </button>
    </div>

    <!-- Audit Log Entries List -->
    <div class="audit-list-container">
      <div v-if="errorStore.isLoading && errorStore.logs.length === 0" class="audit-empty-state">
        <RefreshCw :size="24" class="spin-anim" />
        <p>Loading error audit logs...</p>
      </div>

      <div v-else-if="errorStore.filteredLogs.length === 0" class="audit-empty-state clean">
        <CheckCircle2 :size="32" class="clean-icon" />
        <h4>Zero Errors Logged</h4>
        <p v-if="errorStore.searchQuery || errorStore.selectedTaskFilter !== 'all' || errorStore.selectedErrorTypeFilter !== 'all'">
          No errors match the selected filter criteria.
        </p>
        <p v-else>
          All operations (compiling, creating, fetching, AI tasks) have executed cleanly.
        </p>
      </div>

      <div v-else class="audit-entries">
        <div
          v-for="log in errorStore.filteredLogs"
          :key="log.id"
          class="audit-card"
          :class="{ expanded: !!expandedLogIds[log.id] }"
        >
          <div class="audit-card-main">
            <button
              v-if="log.details"
              type="button"
              class="expand-btn"
              :title="expandedLogIds[log.id] ? 'Collapse details' : 'Expand details'"
              @click="toggleExpand(log.id)"
            >
              <component :is="expandedLogIds[log.id] ? ChevronDown : ChevronRight" :size="16" />
            </button>
            <div v-else class="expand-placeholder"></div>

            <div class="card-content-area">
              <div class="card-header-line">
                <div class="badges-row">
                  <span class="task-badge" :class="getTaskBadgeClass(log.task_type)">
                    {{ log.task_type.replace('_', ' ') }}
                  </span>
                  <span class="error-type-tag">
                    {{ log.error_type }}
                  </span>
                  <span v-if="log.source" class="source-tag" :title="`Origin: ${log.source}`">
                    <Terminal :size="11" /> {{ log.source }}
                  </span>
                </div>

                <div class="meta-row">
                  <span class="time-stamp" :title="log.created_at">
                    <Clock :size="12" /> {{ formatTime(log.created_at) }}
                  </span>
                </div>
              </div>

              <!-- Primary Error Message (Always Selectable & Copiable) -->
              <div class="card-message select-text">
                <AlertTriangle :size="15" class="warn-icon" />
                <span class="msg-text">{{ log.message }}</span>
              </div>
            </div>

            <!-- Action buttons per error -->
            <div class="card-actions">
              <button
                type="button"
                class="card-action-btn copy-btn"
                :title="copiedLogId === log.id ? 'Copied to clipboard' : 'Copy error summary'"
                @click="handleCopyLog(log)"
              >
                <component :is="copiedLogId === log.id ? Check : Copy" :size="14" />
                <span v-if="copiedLogId === log.id" class="copy-feedback">Copied!</span>
              </button>

              <button
                type="button"
                class="card-action-btn delete-btn"
                title="Delete this log record"
                @click="handleDeleteSingle(log.id)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>

          <!-- Expandable Details Section -->
          <div v-if="expandedLogIds[log.id] && log.details" class="audit-card-details">
            <div class="details-header">
              <span class="details-title">Detailed Diagnostic Output / Stack:</span>
              <button
                type="button"
                class="copy-details-btn"
                @click="handleCopyDetails(log.details, log.id)"
              >
                <component :is="copiedLogId === `${log.id}-details` ? Check : Copy" :size="12" />
                <span>{{ copiedLogId === `${log.id}-details` ? 'Copied Details!' : 'Copy Details' }}</span>
              </button>
            </div>
            <pre class="details-pre select-text"><code>{{ log.details }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-audit-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  color: var(--ink);
}

.audit-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 260px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 360px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 8px;
}

.search-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.search-box input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--ink);
  font-size: 0.82rem;
  padding: 6px 6px;
  outline: none;
}

.clear-search-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.clear-search-btn:hover {
  color: var(--ink);
}

.filter-dropdown-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 8px;
}

.filter-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.filter-select {
  background: transparent;
  border: none;
  color: var(--ink);
  font-size: 0.8rem;
  outline: none;
  cursor: pointer;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.audit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  transition: all 0.15s ease;
}

.audit-btn:hover:not(:disabled) {
  background: var(--surface);
  border-color: var(--accent);
}

.audit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.audit-btn.danger {
  color: var(--warning);
  border-color: rgba(239, 68, 68, 0.3);
}

.audit-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--warning);
}

.task-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0;
}

.task-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  text-transform: capitalize;
  transition: all 0.15s ease;
}

.task-pill:hover {
  color: var(--ink);
  border-color: var(--accent);
}

.task-pill.active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}

.pill-count {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 10px;
  font-size: 0.7rem;
  background: var(--bg);
  color: var(--ink);
}

.task-pill.active .pill-count {
  background: var(--surface-soft);
  color: var(--ink);
}

.audit-list-container {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
}

.audit-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
  gap: 10px;
  color: var(--muted);
}

.audit-empty-state.clean {
  color: var(--ink);
}

.clean-icon {
  color: var(--accent);
}

.audit-entries {
  display: flex;
  flex-direction: column;
  divide-y: 1px solid var(--line);
}

.audit-card {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  transition: background 0.15s ease;
}

.audit-card:hover {
  background: var(--surface);
}

.audit-card-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
}

.expand-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  margin-top: 2px;
}

.expand-btn:hover {
  color: var(--ink);
}

.expand-placeholder {
  width: 20px;
  flex-shrink: 0;
}

.card-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.card-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.badges-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.task-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 4px;
}

.badge-task-compiling {
  background: var(--surface-soft);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.badge-task-creating {
  background: var(--surface-soft);
  color: var(--accent);
  border: 1px solid var(--accent);
}

.badge-task-fetching {
  background: var(--surface-soft);
  color: var(--accent);
  border: 1px solid var(--line);
}

.badge-task-ai {
  background: var(--surface-soft);
  color: var(--accent);
  border: 1px solid var(--accent);
}

.badge-task-saving {
  background: var(--surface-soft);
  color: var(--warning);
  border: 1px solid var(--line);
}

.badge-task-deleting {
  background: var(--surface-soft);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.badge-task-backup {
  background: var(--surface-soft);
  color: var(--muted);
  border: 1px solid var(--line);
}

.badge-task-general {
  background: var(--surface-soft);
  color: var(--muted);
  border: 1px solid var(--line);
}

.error-type-tag {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 1px 6px;
  border-radius: 4px;
}

.source-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-family: monospace;
  color: var(--muted);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-stamp {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--muted);
}

.card-message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--ink);
  word-break: break-word;
}

.warn-icon {
  color: var(--warning);
  flex-shrink: 0;
  margin-top: 2px;
}

.msg-text {
  user-select: text !important;
  -webkit-user-select: text !important;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.card-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.card-action-btn:hover {
  background: var(--bg);
  border-color: var(--line);
  color: var(--ink);
}

.card-action-btn.delete-btn:hover {
  color: var(--warning);
  border-color: rgba(239, 68, 68, 0.3);
}

.copy-feedback {
  font-size: 0.72rem;
  color: var(--accent);
  font-weight: 500;
}

.audit-card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 12px 38px;
  background: rgba(0, 0, 0, 0.08);
  border-top: 1px dashed var(--line);
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.details-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.copy-details-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-details-btn:hover {
  border-color: var(--accent);
}

.details-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--line);
  max-height: 260px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.select-text {
  user-select: text !important;
  -webkit-user-select: text !important;
}
</style>
