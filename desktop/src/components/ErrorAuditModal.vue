<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Motion, AnimatePresence } from 'motion-v';
import { AlertTriangle, X } from '@lucide/vue';
import { useErrorAuditStore } from '../store/error_audit';
import ErrorAuditViewer from './ErrorAuditViewer.vue';

const errorStore = useErrorAuditStore();

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && errorStore.isViewerOpen) {
    errorStore.closeViewer();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <AnimatePresence>
    <div
      v-if="errorStore.isViewerOpen"
      key="error-audit-modal"
      class="audit-modal-backdrop"
      @click.self="errorStore.closeViewer()"
    >
      <Motion
        :initial="{ opacity: 0, scale: 0.95, y: 15 }"
        :animate="{ opacity: 1, scale: 1, y: 0 }"
        :exit="{ opacity: 0, scale: 0.95, y: 15 }"
        :transition="{ duration: 0.2, ease: 'easeOut' }"
        class="audit-modal-container"
      >
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title-group">
            <div class="icon-circle">
              <AlertTriangle :size="18" class="header-icon" />
            </div>
            <div>
              <h3 class="modal-title">System Error Audit Trail</h3>
              <p class="modal-subtitle">
                Time-by-time error ledger capturing creating, compiling, fetching, and AI tasks.
              </p>
            </div>
          </div>

          <button
            type="button"
            class="close-modal-btn"
            title="Close (Esc)"
            @click="errorStore.closeViewer()"
          >
            <X :size="18" />
          </button>
        </div>

        <!-- Modal Body with ErrorAuditViewer -->
        <div class="modal-body">
          <ErrorAuditViewer />
        </div>
      </Motion>
    </div>
  </AnimatePresence>
</template>

<style scoped>
.audit-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100001;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.audit-modal-container {
  width: 100%;
  max-width: 960px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--surface-soft);
  border: 1px solid var(--warning);
}

.header-icon {
  color: var(--warning);
}

.modal-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--ink);
}

.modal-subtitle {
  margin: 2px 0 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}

.close-modal-btn {
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-modal-btn:hover {
  background: var(--surface);
  border-color: var(--line);
  color: var(--ink);
}

.modal-body {
  padding: 16px 20px 20px 20px;
  overflow-y: auto;
  flex: 1;
}
</style>
