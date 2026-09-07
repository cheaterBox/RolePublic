import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { 
  OutreachLead, 
  OutreachLeadSchema, 
  OutreachLeadListSchema, 
  safeValidate 
} from '../schemas';
import { useSettingsStore } from './settings';

export type { OutreachLead };

export interface TailorOutreachPayload {
  leadId?: string;
  personName: string;
  profileUrl: string;
  headline?: string;
  rawBio: string;
  recentPosts: string[];
  templateId?: string;
  charLimit: number;
  customInstruction?: string;
}

export const useOutreachStore = defineStore('outreach', () => {
  const leads = ref<OutreachLead[]>([]);
  const activeLead = ref<OutreachLead | null>(null);
  const isLoading = ref(false);
  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  const loadAllLeads = async (): Promise<OutreachLead[]> => {
    isLoading.value = true;
    error.value = null;
    try {
      const raw = await invoke<any[]>('get_all_outreach_leads');
      const validated = safeValidate(OutreachLeadListSchema, raw, [], 'outreach leads');
      leads.value = validated;
      return validated;
    } catch (err: any) {
      console.error('Failed to load outreach leads:', err);
      error.value = err?.message || err?.toString() || 'Failed to load leads';
      return [];
    } finally {
      isLoading.value = false;
    }
  };

  const getLeadById = async (id: string): Promise<OutreachLead | null> => {
    try {
      const raw = await invoke<any>('get_outreach_lead_by_id', { id });
      const validated = safeValidate(OutreachLeadSchema, raw, null as any, `lead ${id}`);
      if (validated) {
        activeLead.value = validated;
      }
      return validated;
    } catch (err: any) {
      console.error(`Failed to get lead ${id}:`, err);
      return null;
    }
  };

  const saveLead = async (lead: {
    id?: string;
    personName: string;
    profileUrl: string;
    headline?: string;
    rawBio: string;
    recentPosts: string[];
    templateId?: string;
    charLimit: number;
    tailoredMessage?: string;
    status?: string;
  }): Promise<string> => {
    try {
      const id = await invoke<string>('save_outreach_lead', {
        lead: {
          id: lead.id || null,
          personName: lead.personName,
          profileUrl: lead.profileUrl,
          headline: lead.headline || null,
          rawBio: lead.rawBio,
          recentPosts: lead.recentPosts,
          templateId: lead.templateId || null,
          charLimit: lead.charLimit || 200,
          tailoredMessage: lead.tailoredMessage || null,
          status: lead.status || 'Draft',
        }
      });
      await loadAllLeads();
      return id;
    } catch (err: any) {
      console.error('Failed to save outreach lead:', err);
      throw err;
    }
  };

  const updateStatus = async (id: string, status: string): Promise<void> => {
    try {
      await invoke('update_outreach_lead_status', { id, status });
      const item = leads.value.find(l => l.id === id);
      if (item) {
        item.status = status;
      }
    } catch (err: any) {
      console.error(`Failed to update status for lead ${id}:`, err);
      throw err;
    }
  };

  const deleteLead = async (id: string): Promise<void> => {
    try {
      await invoke('delete_outreach_lead', { id });
      leads.value = leads.value.filter(l => l.id !== id);
      if (activeLead.value?.id === id) {
        activeLead.value = null;
      }
    } catch (err: any) {
      console.error(`Failed to delete lead ${id}:`, err);
      throw err;
    }
  };

  const deleteBatch = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    try {
      await invoke('delete_outreach_leads_batch', { ids });
      leads.value = leads.value.filter(l => !ids.includes(l.id));
      if (activeLead.value && ids.includes(activeLead.value.id)) {
        activeLead.value = null;
      }
    } catch (err: any) {
      console.error('Failed to batch delete leads:', err);
      throw err;
    }
  };

  const generateTailoredMessage = async (payload: TailorOutreachPayload): Promise<string> => {
    isGenerating.value = true;
    error.value = null;
    try {
      const settingsStore = useSettingsStore();
      const provider = settingsStore.selectedAiProvider;
      const model = settingsStore.selectedAiModel;
      // Vault keys are stored as `ai_api_key_<provider>` — use the shared
      // accessor like every other caller. The old `${provider}_api_key`
      // lookup always missed, sending an empty key (DeepSeek 401).
      const apiKey = (await settingsStore.getDecryptedKey()) || '';

      const tailoredMessage = await invoke<string>('tailor_outreach_message', {
        args: {
          leadId: payload.leadId || null,
          provider,
          model,
          apiKey,
          personName: payload.personName,
          profileUrl: payload.profileUrl,
          headline: payload.headline || null,
          rawBio: payload.rawBio,
          recentPosts: payload.recentPosts,
          templateId: payload.templateId || null,
          charLimit: payload.charLimit || 200,
          customInstruction: payload.customInstruction || null,
        }
      });

      return tailoredMessage;
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Outreach tailoring failed';
      error.value = msg;
      throw new Error(msg);
    } finally {
      isGenerating.value = false;
    }
  };

  return {
    leads,
    activeLead,
    isLoading,
    isGenerating,
    error,
    loadAllLeads,
    getLeadById,
    saveLead,
    updateStatus,
    deleteLead,
    deleteBatch,
    generateTailoredMessage,
  };
});
