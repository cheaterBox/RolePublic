<script setup lang="ts">
import { ref } from 'vue';
import { ScrollText, Bug } from '@lucide/vue';
import ErrorAuditViewer from './ErrorAuditViewer.vue';
import { useErrorAuditStore } from '../store/error_audit';
import { recordAppError } from '../utils/error_logger';

const errorStore = useErrorAuditStore();
const isGeneratingTest = ref(false);
const testFeedback = ref(false);

const handleTriggerTestError = async () => {
  isGeneratingTest.value = true;
  try {
    const tasks = ['compiling', 'creating', 'fetching', 'ai_tailoring', 's3_backup'] as const;
    const randomTask = tasks[Math.floor(Math.random() * tasks.length)];
    await recordAppError(
      randomTask,
      randomTask === 'compiling' ? 'TectonicCompilationError' : (randomTask === 'ai_tailoring' ? 'AiError' : 'DatabaseError'),
      `Diagnostic simulated audit entry for [${randomTask}] task.`,
      `--- Diagnostic Trace ---\nTimestamp: ${new Date().toISOString()}\nStack: Simulated error generated from Audit Logs tab.\nEnvironment: Tectonic 0.17.0 (external-harfbuzz)\nStatus: Handled gracefully.`,
      'ErrorAuditTab.vue'
    );
    await errorStore.loadLogs();
    testFeedback.value = true;
    setTimeout(() => {
      testFeedback.value = false;
    }, 2500);
  } finally {
    isGeneratingTest.value = false;
  }
};
</script>

<template>
  <div class="audit-tab-page">
    <!-- Header -->
    <div class="audit-page-header">
      <div class="header-left">
        <div class="header-icon-box">
          <ScrollText :size="22" class="header-icon" />
        </div>
        <div>
          <h2>Error Audit Logs</h2>
          <p class="subtitle">
            Time-by-time system ledger capturing creating, compiling, fetching, and AI task diagnostics.
          </p>
        </div>
      </div>

      <div class="header-right">
        <button
          type="button"
          class="test-log-btn"
          :disabled="isGeneratingTest"
          title="Create a simulated error record to verify audit logging and filtering"
          @click="handleTriggerTestError"
        >
          <Bug :size="14" />
          <span>{{ testFeedback ? 'Test Error Recorded!' : 'Simulate Test Error' }}</span>
        </button>
      </div>
    </div>

    <!-- Main Audit Viewer Container -->
    <div class="audit-viewer-card">
      <ErrorAuditViewer />
    </div>
  </div>
</template>

<style scoped>
.audit-tab-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
  color: var(--ink);
  background: var(--bg);
}

.audit-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--accent);
}

.header-left h2 {
  font-size: 1.35rem;
  font-weight: 700;
  margin: 0;
  color: var(--ink);
}

.subtitle {
  font-size: 0.82rem;
  color: var(--muted);
  margin: 2px 0 0 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.test-log-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px dashed var(--line);
  background: var(--surface);
  color: var(--ink);
  transition: all 0.15s ease;
}

.test-log-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg);
}

.audit-viewer-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  box-shadow: var(--shadow);
}
</style>
