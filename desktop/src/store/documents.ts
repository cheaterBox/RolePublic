import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import { 
  DocumentSummary, 
  DocumentFileEntry, 
  DocumentListSchema, 
  DocumentSummarySchema, 
  DocumentFileListSchema, 
  safeValidate, 
  validateOrThrow 
} from '../schemas';
import { recordAppError } from '../utils/error_logger';

export const TEXT_BACKUP_EXTENSIONS = ['tex', 'bib', 'cls', 'sty', 'md', 'mmd', 'txt', 'cfg'];

export type { DocumentSummary, DocumentFileEntry };

export const useDocumentsStore = defineStore('documents', () => {
  const documents = ref<DocumentSummary[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const loadAllDocuments = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const raw = await invoke('get_all_documents');
      documents.value = safeValidate(DocumentListSchema, raw, [], 'get_all_documents');
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('fetching', 'DatabaseError', 'Failed to load documents list', err.toString(), 'loadAllDocuments');
    } finally {
      isLoading.value = false;
    }
  };

  const getDocumentById = async (docId: string): Promise<DocumentSummary> => {
    try {
      const raw = await invoke('get_document_by_id', { docId });
      return validateOrThrow(DocumentSummarySchema, raw, 'get_document_by_id');
    } catch (err: any) {
      recordAppError('fetching', 'DatabaseError', `Failed to load document ${docId}`, err.toString(), 'getDocumentById');
      throw err;
    }
  };

  const createDocument = async (payload: {
    title: string;
    description?: string;
    tags?: string;
    starred?: boolean;
  }): Promise<string> => {
    isLoading.value = true;
    error.value = null;
    try {
      const args = {
        title: payload.title,
        description: payload.description ?? '',
        tags: payload.tags ?? '',
        starred: payload.starred ?? false,
      };
      const id = await invoke<string>('create_new_document', { args });
      await loadAllDocuments();
      return id;
    } catch (err: any) {
      error.value = err.toString();
      recordAppError('creating', 'DocumentCreationError', `Failed to create document "${payload.title}"`, err.toString(), 'createDocument');
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const updateDocument = async (docId: string, patch: {
    title?: string;
    description?: string;
    tags?: string;
    starred?: boolean;
  }) => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('update_document', {
        args: {
          docId,
          title: patch.title,
          description: patch.description,
          tags: patch.tags,
          starred: patch.starred,
        },
      });
      await loadAllDocuments();
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const setStarred = async (docId: string, starred: boolean) => {
    try {
      await invoke('set_document_starred', { docId, starred });
      const idx = documents.value.findIndex((d) => d.id === docId);
      if (idx !== -1) {
        documents.value[idx] = { ...documents.value[idx], starred };
      }
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    }
  };

  const deleteDocument = async (docId: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('delete_document', { docId });
      await loadAllDocuments();
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteDocumentsBatch = async (ids: string[]) => {
    isLoading.value = true;
    error.value = null;
    try {
      await invoke('delete_documents_batch', { ids });
      await loadAllDocuments();
    } catch (err: any) {
      error.value = err.toString();
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const listFiles = async (docId: string): Promise<DocumentFileEntry[]> => {
    const raw = await invoke('list_document_files', { docId });
    return safeValidate(DocumentFileListSchema, raw, [], 'list_document_files');
  };

  const readFile = async (docId: string, relPath: string): Promise<string> => {
    return await invoke<string>('read_document_file', {
      args: { docId, relPath },
    });
  };

  const writeFile = async (docId: string, relPath: string, content: string) => {
    await invoke('write_document_file', {
      args: { docId, relPath, content },
    });
  };

  const createFile = async (docId: string, parentRel: string | null, name: string, content: string = '') => {
    await invoke('create_document_file', {
      args: {
        docId,
        parentRel: parentRel || undefined,
        name,
        content,
      },
    });
  };

  const deleteFile = async (docId: string, relPath: string) => {
    await invoke('delete_document_file', {
      args: { docId, relPath },
    });
  };

  const renameFile = async (docId: string, relPath: string, newName: string) => {
    await invoke('rename_document_file', {
      args: { docId, relPath, newName },
    });
  };

  const setMainFile = async (docId: string, relPath: string | null) => {
    await invoke('set_document_main_file', {
      args: { docId, relPath },
    });
    await loadAllDocuments();
  };

  const getMainFile = async (docId: string): Promise<string | null> => {
    return await invoke<string | null>('get_document_main_file', { docId });
  };

  const compile = async (docId: string): Promise<Uint8Array> => {
    const bytes = await invoke<number[]>('compile_document_to_pdf', { docId });
    return new Uint8Array(bytes);
  };

  return {
    documents,
    isLoading,
    error,
    loadAllDocuments,
    getDocumentById,
    createDocument,
    updateDocument,
    setStarred,
    deleteDocument,
    deleteDocumentsBatch,
    listFiles,
    readFile,
    writeFile,
    createFile,
    deleteFile,
    renameFile,
    setMainFile,
    getMainFile,
    compile,
  };
});
