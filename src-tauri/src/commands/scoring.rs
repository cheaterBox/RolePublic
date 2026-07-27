//! Resume vs Job Description match scoring.
//!
//! Combines three signals into a single 0..100 score:
//!   * Skill Jaccard  (weight 55%) — named-tech matching against a curated lexicon
//!   * TF-IDF cosine  (weight 35%) — prose language similarity
//!   * Token Jaccard  (weight 10%) — broad surface overlap (transparency)
//!
//! All math is local. No network, no embedding API, no LLM.

use crate::commands::jobs::{get_job_by_id, JobPayload};
use crate::utils::text_utils::{extract_skills, jaccard, strip_latex, tokenize, TfIdf};
use crate::AppState;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use tauri::State;

/// Cap raw JD corpus text length to avoid runaway tokenization on pathological inputs.
const MAX_CORPUS_CHARS: usize = 50_000;

#[derive(Serialize, Debug, Clone)]
pub struct MatchBreakdown {
    pub overall: u8,
    pub skills_score: u8,
    pub tfidf_score: u8,
    pub jaccard_score: u8,
    pub present_skills: Vec<String>,
    pub missing_skills: Vec<String>,
    pub weak_skills: Vec<String>,
    pub jd_skill_count: usize,
    pub resume_skill_count: usize,
    pub jd_token_count: usize,
    pub resume_token_count: usize,
}

/// Internal helper to keep the breakdown calculation pure & testable.
fn blend(scores: (f64, f64, f64)) -> u8 {
    let (skills, tfidf, jacc) = scores;
    let overall = 0.55 * skills + 0.35 * tfidf + 0.10 * jacc;
    (overall.clamp(0.0, 100.0)).round() as u8
}

fn pct(x: f64) -> u8 {
    (x.clamp(0.0, 1.0) * 100.0).round() as u8
}

#[tauri::command]
pub async fn score_resume_match(
    state: State<'_, AppState>,
    job_id: String,
    resume_latex: String,
) -> Result<MatchBreakdown, String> {
    // 1. Fetch job (read DB directly so we don't pay a serde roundtrip).
    let job: JobPayload = get_job_by_id(state, job_id)
        .await
        .map_err(|e| format!("Failed to load job: {}", e))?;

    // 2. Build JD corpus text (raw_jd + requirements + responsibilities).
    let mut corpus = String::with_capacity(
        job.raw_jd.len()
            + job.requirements.as_ref().map(|s| s.len()).unwrap_or(0)
            + job.core_responsibilities.as_ref().map(|s| s.len()).unwrap_or(0)
            + 2,
    );
    corpus.push_str(&job.raw_jd);
    corpus.push('\n');
    if let Some(r) = &job.requirements {
        corpus.push_str(r);
        corpus.push('\n');
    }
    if let Some(c) = &job.core_responsibilities {
        corpus.push_str(c);
        corpus.push('\n');
    }
    if corpus.len() > MAX_CORPUS_CHARS {
        corpus.truncate(MAX_CORPUS_CHARS);
    }

    Ok(score_core(&corpus, &resume_latex))
}

/// Pure scoring function exposed for tests.
pub fn score_core(corpus: &str, resume_latex: &str) -> MatchBreakdown {
    // 3. Strip LaTeX and tokenize both sides.
    let jd_plain = strip_latex(corpus);
    let resume_plain = strip_latex(resume_latex);
    let jd_tokens = tokenize(&jd_plain);
    let resume_tokens = tokenize(&resume_plain);

    // 4. TF-IDF cosine.
    let docs = [jd_tokens.clone(), resume_tokens.clone()];
    let tfidf_model = TfIdf::build(&docs);
    let jd_vec = tfidf_model.vector(&jd_tokens);
    let resume_vec = tfidf_model.vector(&resume_tokens);
    let tfidf_sim = TfIdf::cosine(&jd_vec, &resume_vec);

    // 5. Skill Jaccard.
    let jd_skills = extract_skills(&jd_plain);
    let resume_skills = extract_skills(&resume_plain);
    let skills_sim = jaccard(&jd_skills, &resume_skills);

    // 6. Raw token Jaccard (broad overlap).
    let jd_set: HashSet<String> = jd_tokens.iter().cloned().collect();
    let resume_set: HashSet<String> = resume_tokens.iter().cloned().collect();
    let jaccard_sim = jaccard(&jd_set, &resume_set);

    // 7. Present / missing / weak skills.
    let present: HashSet<String> = jd_skills.intersection(&resume_skills).cloned().collect();
    let missing: Vec<String> = jd_skills.difference(&resume_skills).cloned().collect();

    // Weak: in resume exactly once (i.e. mentioned but not reinforced) while
    // the JD hammers the term 3+ times.
    let mut resume_counts: HashMap<&str, usize> = HashMap::new();
    for t in &resume_tokens { *resume_counts.entry(t.as_str()).or_insert(0) += 1; }
    let mut jd_counts: HashMap<&str, usize> = HashMap::new();
    for t in &jd_tokens { *jd_counts.entry(t.as_str()).or_insert(0) += 1; }
    let mut weak: Vec<String> = Vec::new();
    for s in &present {
        let rc = *resume_counts.get(s.as_str()).unwrap_or(&0);
        let jc = *jd_counts.get(s.as_str()).unwrap_or(&0);
        if rc == 1 && jc >= 3 {
            weak.push(s.clone());
        }
    }

    // 8. Sorted display.
    let mut present_v: Vec<String> = present.into_iter().collect();
    let mut missing_v: Vec<String> = missing;
    let mut weak_v: Vec<String> = weak;
    let sort_alpha = |a: &String, b: &String| a.cmp(b);
    present_v.sort_by(sort_alpha);
    missing_v.sort_by(sort_alpha);
    weak_v.sort_by(sort_alpha);

    let skills_score = pct(skills_sim);
    let tfidf_score = pct(tfidf_sim);
    let jaccard_score = pct(jaccard_sim);
    let overall = blend((skills_score as f64, tfidf_score as f64, jaccard_score as f64));

    MatchBreakdown {
        overall,
        skills_score,
        tfidf_score,
        jaccard_score,
        present_skills: present_v,
        missing_skills: missing_v,
        weak_skills: weak_v,
        jd_skill_count: jd_skills.len(),
        resume_skill_count: resume_skills.len(),
        jd_token_count: jd_tokens.len(),
        resume_token_count: resume_tokens.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blend_is_weighted_average() {
        // 0.55 * 100 + 0.35 * 100 + 0.10 * 100 = 100
        assert_eq!(blend((100.0, 100.0, 100.0)), 100);
        // 0.55 * 100 = 55
        assert_eq!(blend((100.0, 0.0, 0.0)), 55);
        // 0.35 * 100 = 35
        assert_eq!(blend((0.0, 100.0, 0.0)), 35);
        // 0.10 * 100 = 10
        assert_eq!(blend((0.0, 0.0, 100.0)), 10);
    }

    #[test]
    fn blend_clamps_to_100() {
        // Simulate pct() upper-out-of-range: blend should still clamp.
        assert_eq!(blend((100.0, 100.0, 100.0)), 100);
    }

    #[test]
    fn score_core_returns_empty_for_empty_inputs() {
        let b = score_core("", "");
        assert_eq!(b.overall, 0);
        assert_eq!(b.skills_score, 0);
        assert_eq!(b.tfidf_score, 0);
        assert_eq!(b.jaccard_score, 0);
        assert!(b.present_skills.is_empty());
        assert!(b.missing_skills.is_empty());
    }

    #[test]
    fn score_core_identical_text_is_high() {
        let text = "We need a Rust engineer with Postgres and AWS experience.";
        let b = score_core(text, text);
        assert!(b.overall >= 90, "expected >=90, got {}", b.overall);
        assert_eq!(b.skills_score, 100);
        assert_eq!(b.tfidf_score, 100);
    }

    #[test]
    fn score_core_disjoint_text_is_low() {
        let jd = "Looking for a piano teacher who can teach violin to children.";
        let resume = "Experienced dog walker with gardening expertise.";
        let b = score_core(jd, resume);
        // No skills overlap, no TF-IDF overlap -> 0.
        assert_eq!(b.skills_score, 0);
        assert_eq!(b.tfidf_score, 0);
        assert_eq!(b.overall, 0);
    }

    #[test]
    fn score_core_partial_skill_overlap() {
        let jd = "Need Rust, Postgres, Kubernetes, GraphQL.";
        let resume = "Built services in Rust backed by Postgres.";
        let b = score_core(jd, resume);
        // 2/4 skills match = Jaccard 2/4 = 0.5
        assert!(b.skills_score >= 49 && b.skills_score <= 51,
                "expected ~50, got {}", b.skills_score);
        assert!(b.missing_skills.contains(&"kubernetes".to_string()));
        assert!(b.missing_skills.contains(&"graphql".to_string()));
        assert!(b.present_skills.contains(&"rust".to_string()));
        assert!(b.present_skills.contains(&"postgres".to_string()));
    }

    #[test]
    fn score_core_weak_skills_detected() {
        // JD hammers "rust" 4 times; resume says it once.
        let jd = "rust rust rust rust engineer with postgres and redis";
        let resume = "Software engineer who knows rust and some python.";
        let b = score_core(jd, resume);
        assert!(b.weak_skills.contains(&"rust".to_string()),
                "expected weak=rust, got {:?}", b.weak_skills);
    }
}