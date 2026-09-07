import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settings';

import { 
  Job, 
  JobSchema, 
  JobListSchema, 
  JobParseResultSchema, 
  safeValidate, 
  validateOrThrow 
} from '../schemas';
import { recordAppError } from '../utils/error_logger';

export type { Job };

export const useJobsStore = defineStore('jobs', () => {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const settingsStore = useSettingsStore();

  const generateId = () => {
    return Math.random().toString(36).substring(2, 12);
  };

  const parseNewJob = async (rawJd: string, jobUrl: string = ''): Promise<string> => {
    isLoading.value = true;
    error.value = null;

    try {
      await settingsStore.loadSettings();
      const apiKey = await settingsStore.getDecryptedKey();
      
      if (!apiKey) {
        const msg = "API Key not found. Please go to Settings and enter your AI API key first.";
        error.value = msg;
        throw new Error(msg);
      }

      const provider = settingsStore.selectedAiProvider;
      const model = settingsStore.selectedAiModel;

      // 1. Parse Job via AI and strictly validate structure
      const rawResult = await invoke('parse_job', { 
        provider,
        model,
        apiKey, 
        rawJd,
        jobUrl: jobUrl.trim() || null
      });

      const parsed = validateOrThrow(JobParseResultSchema, rawResult, 'parse_job response');
      const details = parsed.details;
      const finalRawJd = parsed.raw_description || rawJd;

      // 2. Augment Data on Frontend and validate payload with Zod
      const jobPayload: Job = JobSchema.parse({
        id: generateId(),
        company_name: details.company_name,
        job_title: details.job_title,
        work_model: details.work_model,
        employment_type: details.employment_type,
        status: 'Drafting',
        raw_jd: finalRawJd.trim(),
        requirements: JSON.stringify(details.requirements || []),
        core_responsibilities: JSON.stringify(details.core_responsibilities || []),
        custom_instruction: '',
        reference_name: '',
        reference_email: '',
        social_link: '',
        job_url: jobUrl.trim()
      });

      // 3. Save to Rust backend
      const savedId: string = await invoke('save_job', { 
        payload: jobPayload 
      });

      return savedId; 
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('creating', 'JobCreationError', 'Failed to save job', err.toString(), 'saveJob');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const loadAllJobs = async (): Promise<Job[]> => {
    isLoading.value = true;
    error.value = null;
    try {
      const rawJobs = await invoke('get_all_jobs');
      return safeValidate(JobListSchema, rawJobs, [], 'loadAllJobs');
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', 'Failed to load jobs list', err.toString(), 'loadAllJobs');
      return [];
    } finally {
      isLoading.value = false;
    }
  };

  const getJobById = async (id: string): Promise<Job> => {
    isLoading.value = true;
    error.value = null;
    try {
      const rawJob = await invoke('get_job_by_id', { id });
      return validateOrThrow(JobSchema, rawJob, `getJobById(${id})`);
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', `Failed to load job ${id}`, err.toString(), 'getJobById');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteJob = async (id: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('delete_job', { id });
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('deleting', 'DatabaseError', `Failed to delete job ${id}`, err.toString(), 'deleteJob');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteJobsBatch = async (ids: string[]): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('delete_jobs_batch', { ids });
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('deleting', 'DatabaseError', `Failed to delete ${ids.length} jobs`, err.toString(), 'deleteJobsBatch');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteAllJobs = async (): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('delete_all_jobs');
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const updateJobStatus = async (id: string, status: string, metadata?: Record<string, string>): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('update_job_status', { id, status, metadata });
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const updateJobMetadata = async (id: string, field: string, value: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('update_job_metadata', { id, field, value });
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  return { isLoading, error, parseNewJob, loadAllJobs, getJobById, deleteJob, deleteJobsBatch, deleteAllJobs, updateJobStatus, updateJobMetadata };
  });