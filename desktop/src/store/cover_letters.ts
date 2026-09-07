import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import { 
  BaseCoverLetter, 
  CoverLetterDetail, 
  CoverLetterListSchema, 
  CoverLetterDetailSchema, 
  safeValidate, 
  validateOrThrow 
} from '../schemas';
import { recordAppError } from '../utils/error_logger';

export type { BaseCoverLetter, CoverLetterDetail };

export const useCoverLettersStore = defineStore('cover_letters', () => {
  const coverLetters = ref<BaseCoverLetter[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const loadAllCoverLetters = async () => {
    isLoading.value = true;
    error.value = null;
    
    try {
      const raw = await invoke('get_all_cover_letters');
      coverLetters.value = safeValidate(CoverLetterListSchema, raw, [], 'loadAllCoverLetters');
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', 'Failed to load cover letters list', err.toString(), 'loadAllCoverLetters');
    } finally {
      isLoading.value = false;
    }
  };

  const getCoverLetterById = async (clId: string): Promise<CoverLetterDetail> => {
    try {
      const raw = await invoke('get_cover_letter_by_id', { clId });
      return validateOrThrow(CoverLetterDetailSchema, raw, `getCoverLetterById(${clId})`);
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', `Failed to load cover letter ${clId}`, err.toString(), 'getCoverLetterById');
      throw err;
    }
  };

  const createNewCoverLetter = async (name: string, category: string, latex_content: string): Promise<string> => {
    isLoading.value = true;
    error.value = null;
    
    try {
      const clId = await invoke<string>('create_new_cover_letter', {
        args: { name, category, latexContent: latex_content }
      });
      await loadAllCoverLetters(); // Refresh list
      return clId;
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('creating', 'CoverLetterCreationError', `Failed to create cover letter "${name}"`, err.toString(), 'createNewCoverLetter');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const updateCoverLetter = async (clId: string, name: string, category: string, latex_content: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    
    try {
      await invoke('update_cover_letter', {
        args: { clId, name, category, latexContent: latex_content }
      });
      await loadAllCoverLetters(); // Refresh list
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteCoverLetter = async (clId: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;

    try {
      await invoke('delete_cover_letter', { args: { clId } });
      await loadAllCoverLetters();
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    coverLetters,
    isLoading,
    error,
    loadAllCoverLetters,
    getCoverLetterById,
    createNewCoverLetter,
    updateCoverLetter,
    deleteCoverLetter
  };
});
