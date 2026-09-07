import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import { 
  HrMessageTemplate, 
  HrMessageTemplateListSchema, 
  safeValidate 
} from '../schemas';

export type { HrMessageTemplate };

const SETTINGS_KEY = 'hr_message_templates';

export const useHrMessagesStore = defineStore('hr_messages', () => {
  const templates = ref<HrMessageTemplate[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const loadTemplates = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      let custom: HrMessageTemplate[] = [];
      try {
        const raw = await invoke<any[]>('get_all_hr_templates');
        if (raw && Array.isArray(raw) && raw.length > 0) {
          custom = safeValidate(HrMessageTemplateListSchema, raw, [], 'custom HR templates');
        } else {
          // Fallback check in app_settings for any legacy data
          const legacyRaw = await invoke<string>('get_setting', {
            key: SETTINGS_KEY,
            defaultValue: '[]'
          });
          if (legacyRaw && legacyRaw.trim()) {
            const parsed = JSON.parse(legacyRaw);
            custom = safeValidate(HrMessageTemplateListSchema, parsed, [], 'legacy HR templates');
          }
        }
      } catch (e) {
        console.warn('Failed to load HR templates from Rust command, trying fallback:', e);
        try {
          const legacyRaw = await invoke<string>('get_setting', {
            key: SETTINGS_KEY,
            defaultValue: '[]'
          });
          if (legacyRaw && legacyRaw.trim()) {
            const parsed = JSON.parse(legacyRaw);
            custom = safeValidate(HrMessageTemplateListSchema, parsed, [], 'legacy HR templates');
          }
        } catch {}
      }

      templates.value = custom;
    } catch (err: any) {
      error.value = err.toString();
    } finally {
      isLoading.value = false;
    }
  };

  const createTemplate = async (name: string, category: string, content: string): Promise<string> => {
    try {
      const id = await invoke<string>('create_hr_template', {
        args: {
          name,
          category: category || 'Outreach',
          content
        }
      });
      await loadTemplates();
      return id;
    } catch (err: any) {
      console.error('Failed to create HR template:', err);
      // Fallback local creation
      const fallbackId = `hr-tmpl-${Date.now()}`;
      templates.value.push({
        id: fallbackId,
        name,
        category: category || 'Outreach',
        content,
        is_builtin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return fallbackId;
    }
  };

  const updateTemplate = async (id: string, name: string, category: string, content: string): Promise<void> => {
    try {
      await invoke('update_hr_template', {
        args: {
          id,
          name,
          category,
          content
        }
      });
      await loadTemplates();
    } catch (err: any) {
      console.error('Failed to update HR template:', err);
      const idx = templates.value.findIndex(t => t.id === id);
      if (idx !== -1) {
        templates.value[idx] = {
          ...templates.value[idx],
          name,
          category,
          content,
          updated_at: new Date().toISOString()
        };
      }
    }
  };

  const deleteTemplate = async (id: string): Promise<void> => {
    try {
      await invoke('delete_hr_template', { id });
      templates.value = templates.value.filter(t => t.id !== id);
    } catch (err: any) {
      console.error('Failed to delete HR template:', err);
      templates.value = templates.value.filter(t => t.id !== id);
    }
  };

  const getTemplateById = (id: string): HrMessageTemplate | undefined => {
    return templates.value.find(t => t.id === id);
  };

  // Tailored HR messages associated with specific jobs
  const saveTailoredMessage = async (jobId: string, content: string): Promise<void> => {
    try {
      await invoke('save_setting', {
        key: `tailored_hr_message:${jobId}`,
        value: content
      });
    } catch (err: any) {
      console.error('Failed to save tailored HR message:', err);
    }
  };

  const getTailoredMessage = async (jobId: string): Promise<string> => {
    try {
      return await invoke<string>('get_setting', {
        key: `tailored_hr_message:${jobId}`,
        defaultValue: ''
      });
    } catch {
      return '';
    }
  };

  return {
    templates,
    isLoading,
    error,
    loadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateById,
    saveTailoredMessage,
    getTailoredMessage
  };
});
