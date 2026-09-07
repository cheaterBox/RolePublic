import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  ErrorAuditLog,
  ErrorAuditLogListSchema,
  ErrorLogStats,
  ErrorLogStatsSchema,
  safeValidate
} from '../schemas';
import { copyToClipboard } from '../utils/clipboard';

export type { ErrorAuditLog, ErrorLogStats };

export const useErrorAuditStore = defineStore('error_audit', () => {
  const logs = ref<ErrorAuditLog[]>([]);
  const stats = ref<ErrorLogStats>({ total: 0, by_task: {} });
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const isViewerOpen = ref(false);

  // Active filters
  const selectedTaskFilter = ref<string>('all');
  const selectedErrorTypeFilter = ref<string>('all');
  const searchQuery = ref<string>('');

  const filteredLogs = computed(() => {
    let result = logs.value;
    if (selectedTaskFilter.value && selectedTaskFilter.value !== 'all') {
      result = result.filter(l => l.task_type.toLowerCase() === selectedTaskFilter.value.toLowerCase());
    }
    if (selectedErrorTypeFilter.value && selectedErrorTypeFilter.value !== 'all') {
      result = result.filter(l => l.error_type.toLowerCase() === selectedErrorTypeFilter.value.toLowerCase());
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      result = result.filter(l =>
        l.message.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.source && l.source.toLowerCase().includes(q)) ||
        l.error_type.toLowerCase().includes(q) ||
        l.task_type.toLowerCase().includes(q)
      );
    }
    return result;
  });

  const availableTaskTypes = computed(() => {
    const list = ['all', 'compiling', 'creating', 'fetching', 'ai_tailoring', 'ai_refining', 'ai_fixing', 'saving', 'deleting', 's3_backup', 'network', 'general'];
    // Also include any tasks seen in stats that might not be in the default list
    if (stats.value.by_task) {
      for (const t of Object.keys(stats.value.by_task)) {
        if (!list.includes(t)) list.push(t);
      }
    }
    return list;
  });

  const loadLogs = async (limit: number = 300, offset: number = 0) => {
    isLoading.value = true;
    error.value = null;
    try {
      const taskParam = selectedTaskFilter.value === 'all' ? null : selectedTaskFilter.value;
      const errorParam = selectedErrorTypeFilter.value === 'all' ? null : selectedErrorTypeFilter.value;
      const searchParam = searchQuery.value.trim() ? searchQuery.value.trim() : null;

      const raw = await invoke<any[]>('get_error_logs', {
        taskType: taskParam,
        errorType: errorParam,
        searchQuery: searchParam,
        limit,
        offset,
      });

      logs.value = safeValidate(ErrorAuditLogListSchema, raw, [], 'get_error_logs');
      await loadStats();
    } catch (err: any) {
      error.value = err?.message || String(err);
      console.warn('Failed to load error audit logs:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const loadStats = async () => {
    try {
      const rawStats = await invoke<any>('get_error_log_stats');
      stats.value = safeValidate(ErrorLogStatsSchema, rawStats, { total: 0, by_task: {} }, 'get_error_log_stats');
    } catch (err) {
      console.warn('Failed to load error log stats:', err);
    }
  };

  const recordLog = async (
    task_type: string,
    error_type: string,
    message: string,
    details?: string | null,
    source?: string | null
  ) => {
    try {
      const raw = await invoke<any>('record_error_log', {
        taskType: task_type,
        errorType: error_type,
        message,
        details: details || null,
        source: source || null,
      });
      if (raw && raw.id) {
        logs.value.unshift(raw);
        await loadStats();
      }
    } catch (err) {
      console.warn('Failed to record error log:', err);
    }
  };

  const deleteLog = async (id: string) => {
    try {
      await invoke('delete_error_log', { id });
      logs.value = logs.value.filter(l => l.id !== id);
      await loadStats();
      return true;
    } catch (err: any) {
      error.value = err?.message || String(err);
      return false;
    }
  };

  const deleteLogsBatch = async (ids: string[]) => {
    try {
      await invoke('delete_error_logs_batch', { ids });
      logs.value = logs.value.filter(l => !ids.includes(l.id));
      await loadStats();
      return true;
    } catch (err: any) {
      error.value = err?.message || String(err);
      return false;
    }
  };

  const clearLogs = async (task_type?: string) => {
    try {
      const targetTask = task_type && task_type !== 'all' ? task_type : null;
      await invoke('clear_error_logs', { taskType: targetTask });
      if (targetTask) {
        logs.value = logs.value.filter(l => l.task_type.toLowerCase() !== targetTask.toLowerCase());
      } else {
        logs.value = [];
      }
      await loadStats();
      return true;
    } catch (err: any) {
      error.value = err?.message || String(err);
      return false;
    }
  };

  const formatLogForCopy = (log: ErrorAuditLog): string => {
    return [
      `=== Error Audit Log [${log.created_at}] ===`,
      `Task: ${log.task_type}`,
      `Error Type: ${log.error_type}`,
      `Source: ${log.source || 'Unknown'}`,
      `Message: ${log.message}`,
      log.details ? `\n--- Details ---\n${log.details}` : '',
    ].filter(Boolean).join('\n');
  };

  const copyLog = async (log: ErrorAuditLog): Promise<boolean> => {
    const text = formatLogForCopy(log);
    return await copyToClipboard(text);
  };

  const copyAllFiltered = async (): Promise<boolean> => {
    if (filteredLogs.value.length === 0) return false;
    const allFormatted = filteredLogs.value.map(formatLogForCopy).join('\n\n' + '='.repeat(40) + '\n\n');
    return await copyToClipboard(allFormatted);
  };

  const exportAsJson = (): string => {
    return JSON.stringify(filteredLogs.value, null, 2);
  };

  const openViewer = (taskType?: string) => {
    if (taskType) {
      selectedTaskFilter.value = taskType;
    }
    isViewerOpen.value = true;
    loadLogs();
  };

  const closeViewer = () => {
    isViewerOpen.value = false;
  };

  return {
    logs,
    filteredLogs,
    stats,
    isLoading,
    error,
    isViewerOpen,
    selectedTaskFilter,
    selectedErrorTypeFilter,
    searchQuery,
    availableTaskTypes,
    loadLogs,
    loadStats,
    recordLog,
    deleteLog,
    deleteLogsBatch,
    clearLogs,
    copyLog,
    copyAllFiltered,
    exportAsJson,
    formatLogForCopy,
    openViewer,
    closeViewer,
  };
});
