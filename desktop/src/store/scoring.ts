import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import { 
    MatchBreakdown, 
    MatchBreakdownSchema, 
    safeValidate 
} from '../schemas';

export type { MatchBreakdown };

export const useScoringStore = defineStore('scoring', () => {
    const lastBreakdown = ref<MatchBreakdown | null>(null);
    const isScoring = ref(false);
    const error = ref<string | null>(null);

    /**
     * Score a resume against a job. The resume LaTeX is passed as a string
     * so callers can choose to score either the base template or the
     * currently-tailored content without needing extra DB roundtrips.
     */
    async function score(jobId: string, resumeLatex: string): Promise<MatchBreakdown | null> {
        isScoring.value = true;
        error.value = null;
        try {
            const raw = await invoke('score_resume_match', {
                jobId,
                resumeLatex,
            });
            const validated = safeValidate(MatchBreakdownSchema, raw, null as any, 'score_resume_match');
            lastBreakdown.value = validated;
            return validated;
        } catch (err: any) {
            error.value = err?.toString() ?? 'Scoring failed';
            return null;
        } finally {
            isScoring.value = false;
        }
    }

    function clear() {
        lastBreakdown.value = null;
        error.value = null;
    }

    return { lastBreakdown, isScoring, error, score, clear };
});