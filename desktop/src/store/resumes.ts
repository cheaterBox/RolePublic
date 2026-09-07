import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import { 
  BaseResume, 
  ResumeDetail, 
  ResumeListSchema, 
  ResumeDetailSchema, 
  safeValidate, 
  validateOrThrow 
} from '../schemas';
import { recordAppError } from '../utils/error_logger';

export type { BaseResume, ResumeDetail };

export const useResumesStore = defineStore('resumes', () => {
  const resumes = ref<BaseResume[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const loadAllResumes = async () => {
    isLoading.value = true;
    error.value = null;
    
    try {
      const raw = await invoke('get_all_resumes');
      resumes.value = safeValidate(ResumeListSchema, raw, [], 'loadAllResumes');
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', 'Failed to load resumes list', err.toString(), 'loadAllResumes');
    } finally {
      isLoading.value = false;
    }
  };

  const getResumeById = async (resumeId: string): Promise<ResumeDetail> => {
    try {
      const raw = await invoke('get_resume_by_id', { resumeId });
      return validateOrThrow(ResumeDetailSchema, raw, `getResumeById(${resumeId})`);
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', `Failed to load resume ${resumeId}`, err.toString(), 'getResumeById');
      throw err;
    }
  };

  const createNewResume = async (name: string, category: string, latex_content: string): Promise<string> => {
    isLoading.value = true;
    error.value = null;
    
    try {
      const resumeId = await invoke<string>('create_new_resume', {
        args: { name, category, latexContent: latex_content }
      });
      await loadAllResumes(); // Refresh list
      return resumeId;
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('creating', 'ResumeCreationError', `Failed to create resume "${name}"`, err.toString(), 'createNewResume');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const updateResume = async (resumeId: string, name: string, category: string, latex_content: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    
    try {
      await invoke('update_resume', {
        args: { resumeId, name, category, latexContent: latex_content }
      });
      await loadAllResumes(); // Refresh list
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteResume = async (resumeId: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;

    try {
      await invoke('delete_resume', { args: { resumeId } });
      await loadAllResumes();
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    resumes,
    isLoading,
    error,
    loadAllResumes,
    getResumeById,
    createNewResume,
    updateResume,
    deleteResume
  };
});