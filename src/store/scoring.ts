import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export interface MatchBreakdown {
    overall: number;
    skills_score: number;
    tfidf_score: number;
    jaccard_score: number;
    present_skills: string[];
    missing_skills: string[];
    weak_skills: string[];
    jd_skill_count: number;
    resume_skill_count: number;
    jd_token_count: number;
    resume_token_count: number;
}

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
            const result = await invoke<MatchBreakdown>('score_resume_match', {
                jobId,
                resumeLatex,
            });
            lastBreakdown.value = result;
            return result;
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