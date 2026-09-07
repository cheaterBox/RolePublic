import { invoke } from '@tauri-apps/api/core';

export type ErrorTaskType =
  | 'compiling'
  | 'creating'
  | 'fetching'
  | 'ai_tailoring'
  | 'ai_refining'
  | 'ai_fixing'
  | 'saving'
  | 'deleting'
  | 's3_backup'
  | 'network'
  | 'general';

/**
 * Record an application error into the persistent SQLite error_audit_logs table.
 * Fails safely without throwing so telemetry never crashes the app.
 */
export async function recordAppError(
  task_type: ErrorTaskType | string,
  error_type: string,
  message: string,
  details?: string | null,
  source?: string | null
): Promise<void> {
  try {
    const sanitizedMsg = typeof message === 'string' ? message : JSON.stringify(message);
    const sanitizedDetails = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
    const sanitizedSource = source ? String(source) : null;

    await invoke('record_error_log', {
      taskType: task_type,
      errorType: error_type,
      message: sanitizedMsg,
      details: sanitizedDetails,
      source: sanitizedSource,
    });
  } catch (err) {
    console.warn('[ErrorLogger] Failed to write error audit entry to SQLite:', err);
  }
}
