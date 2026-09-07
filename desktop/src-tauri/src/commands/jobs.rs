use crate::ai::{self};
use crate::commands::TailoredContent;
use crate::AppState;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Debug)]
pub struct JobPayload {
    pub id: String,
    pub company_name: String,
    pub job_title: String,
    pub work_model: String,
    pub employment_type: String,
    pub status: String,
    pub raw_jd: String,
    #[serde(default)]
    pub requirements: Option<String>,
    #[serde(default)]
    pub core_responsibilities: Option<String>,
    #[serde(default)]
    pub custom_instruction: Option<String>,
    #[serde(default)]
    pub reference_name: Option<String>,
    #[serde(default)]
    pub reference_email: Option<String>,
    #[serde(default)]
    pub social_link: Option<String>,
    #[serde(default)]
    pub job_url: Option<String>,
    #[serde(default)]
    pub base_resume_id: Option<String>,
    #[serde(default)]
    pub base_cl_id: Option<String>,
    #[serde(default)]
    pub salary: Option<String>,
    #[serde(default)]
    pub applied_date: Option<String>,
    #[serde(default)]
    pub interview_date: Option<String>,
    #[serde(default)]
    pub offer_date: Option<String>,
    #[serde(default)]
    pub rejected_date: Option<String>,
    #[serde(default)]
    pub joining_date: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// System + user prompts for job parsing. Owned by the jobs section —
/// `ai` is transport only and must never hardcode prompt wording.
fn parse_job_prompts(
    raw_jd: &str,
    job_url: Option<&str>,
) -> Result<(String, String, String), String> {
    let input_text = raw_jd.trim();
    let url = job_url.unwrap_or("").trim();

    if input_text.is_empty() && url.is_empty() {
        return Err("Either a job description or a URL must be provided.".to_string());
    }

    // System prompt explaining the dual capability
    let system_prompt = "You are an expert job details extractor.

TASK:
- If a RAW DESCRIPTION is provided below, extract details from that text.
- If ONLY a URL is provided, crawl/fetch the content from that URL and extract details.
- If BOTH are provided, PRIORITIZE the manual RAW DESCRIPTION for extraction.

VALIDATION:
- Be permissive: If the text looks like a job posting (even if short or partial), set 'is_valid_job' to true.
- ONLY set 'is_valid_job' to false if the content is clearly NOT a job (e.g., just a login page, cookie consent, or site navigation).
- Try your best to fullfill the requirements,responsibilities fileds even if the description is brief or incomplete.

Output the results in the requested structured format."
        .to_string();

    let user_prompt = if !input_text.is_empty() {
        format!(
            "RAW DESCRIPTION:\n{}\n\n(Optional URL for reference: {})",
            input_text, url
        )
    } else {
        format!("PLEASE FETCH AND PARSE THIS URL: {}", url)
    };

    let raw_description = if !input_text.is_empty() {
        input_text.to_string()
    } else {
        format!("Source URL: {}", url)
    };

    Ok((system_prompt, user_prompt, raw_description))
}

#[tauri::command]
pub async fn parse_job(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    api_key: String,
    raw_jd: String,
    job_url: Option<String>,
) -> Result<ai::JobParseResult, String> {
    let (system_prompt, user_prompt, raw_description) =
        parse_job_prompts(&raw_jd, job_url.as_deref())?;
    let custom_base_url = crate::commands::settings::get_custom_base_url(&state, &provider).await;
    let details: ai::JobDetails = ai::extract_job_details(
        &provider,
        &model,
        &api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Parsing",
    )
    .await?;

    if !details.is_valid_job {
        return Err("The content provided (or the URL) does not appear to contain a valid job description. Please ensure the link is public or paste the description manually.".to_string());
    }

    Ok(ai::JobParseResult {
        details,
        raw_description,
    })
}

#[tauri::command]
pub async fn save_job(state: State<'_, AppState>, payload: JobPayload) -> Result<String, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    conn.execute(
        "INSERT INTO jobs (
            id, company_name, job_title, work_model, employment_type, 
            status, raw_jd, requirements, core_responsibilities,
            custom_instruction, reference_name, 
            reference_email, social_link, job_url,
            base_resume_id, base_cl_id, salary,
            applied_date, interview_date, offer_date, rejected_date, joining_date
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        rusqlite::params![
            &payload.id,
            &payload.company_name,
            &payload.job_title,
            &payload.work_model,
            &payload.employment_type,
            &payload.status,
            &payload.raw_jd,
            &payload.requirements,
            &payload.core_responsibilities,
            &payload.custom_instruction,
            &payload.reference_name,
            &payload.reference_email,
            &payload.social_link,
            &payload.job_url,
            &payload.base_resume_id,
            &payload.base_cl_id,
            &payload.salary,
            &payload.applied_date,
            &payload.interview_date,
            &payload.offer_date,
            &payload.rejected_date,
            &payload.joining_date,
        ],
    )
    .map_err(|e| format!("Database error: {}", e))?;

    state.mark_dirty();
    Ok(payload.id)
}

#[tauri::command]
pub async fn get_job_by_id(state: State<'_, AppState>, id: String) -> Result<JobPayload, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, company_name, job_title, work_model, employment_type, 
                status, raw_jd, requirements, core_responsibilities,
                custom_instruction, reference_name, 
                reference_email, social_link, job_url,
                base_resume_id, base_cl_id,
                salary, applied_date, interview_date, offer_date, rejected_date, joining_date,
                created_at, updated_at
         FROM jobs WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let job = stmt
        .query_row([&id], |row| {
            Ok(JobPayload {
                id: row.get(0)?,
                company_name: row.get(1)?,
                job_title: row.get(2)?,
                work_model: row.get(3)?,
                employment_type: row.get(4)?,
                status: row.get(5)?,
                raw_jd: row.get(6)?,
                requirements: row.get(7)?,
                core_responsibilities: row.get(8)?,
                custom_instruction: row.get(9)?,
                reference_name: row.get(10)?,
                reference_email: row.get(11)?,
                social_link: row.get(12)?,
                job_url: row.get(13)?,
                base_resume_id: row.get::<_, Option<String>>(14)?,
                base_cl_id: row.get::<_, Option<String>>(15)?,
                salary: row.get(16)?,
                applied_date: row.get(17)?,
                interview_date: row.get(18)?,
                offer_date: row.get(19)?,
                rejected_date: row.get(20)?,
                joining_date: row.get(21)?,
                created_at: Some(row.get(22)?),
                updated_at: Some(row.get(23)?),
            })
        })
        .map_err(|e| format!("Job not found: {}", e))?;

    Ok(job)
}

#[tauri::command]
pub async fn get_all_jobs(state: State<'_, AppState>) -> Result<Vec<JobPayload>, String> {
    state
        .with_db(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, company_name, job_title, work_model, employment_type, 
                    status, raw_jd, requirements, core_responsibilities,
                    custom_instruction, reference_name, 
                    reference_email, social_link, job_url,
                    base_resume_id, base_cl_id,
                    salary, applied_date, interview_date, offer_date, rejected_date, joining_date,
                    created_at, updated_at
             FROM jobs ORDER BY created_at DESC",
                )
                .map_err(|e| e.to_string())?;

            let job_iter = stmt
                .query_map([], |row| {
                    Ok(JobPayload {
                        id: row.get(0)?,
                        company_name: row.get(1)?,
                        job_title: row.get(2)?,
                        work_model: row.get(3)?,
                        employment_type: row.get(4)?,
                        status: row.get(5)?,
                        raw_jd: row.get(6)?,
                        requirements: row.get(7)?,
                        core_responsibilities: row.get(8)?,
                        custom_instruction: row.get(9)?,
                        reference_name: row.get(10)?,
                        reference_email: row.get(11)?,
                        social_link: row.get(12)?,
                        job_url: row.get(13)?,
                        base_resume_id: row.get::<_, Option<String>>(14)?,
                        base_cl_id: row.get::<_, Option<String>>(15)?,
                        salary: row.get(16)?,
                        applied_date: row.get(17)?,
                        interview_date: row.get(18)?,
                        offer_date: row.get(19)?,
                        rejected_date: row.get(20)?,
                        joining_date: row.get(21)?,
                        created_at: Some(row.get(22)?),
                        updated_at: Some(row.get(23)?),
                    })
                })
                .map_err(|e| e.to_string())?;

            let mut jobs = Vec::new();
            for job in job_iter {
                jobs.push(job.map_err(|e| e.to_string())?);
            }
            Ok(jobs)
        })
        .await
}

#[tauri::command]
pub async fn delete_job(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    tx.execute("DELETE FROM downloads WHERE job_id = ?1", [&id])
        .map_err(|e| format!("Database error (downloads): {}", e))?;

    tx.execute(
        "DELETE FROM tailored_cover_letters WHERE job_id = ?1",
        [&id],
    )
    .map_err(|e| format!("Database error (tailored_cover_letters): {}", e))?;

    tx.execute("DELETE FROM tailored_resumes WHERE job_id = ?1", [&id])
        .map_err(|e| format!("Database error (tailored_resumes): {}", e))?;

    tx.execute("DELETE FROM jobs WHERE id = ?1", [&id])
        .map_err(|e| format!("Database error (jobs): {}", e))?;

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn delete_jobs_batch(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    for id in ids {
        tx.execute("DELETE FROM downloads WHERE job_id = ?1", [&id])
            .map_err(|e| format!("Database error (downloads): {}", e))?;

        tx.execute(
            "DELETE FROM tailored_cover_letters WHERE job_id = ?1",
            [&id],
        )
        .map_err(|e| format!("Database error (tailored_cover_letters): {}", e))?;

        tx.execute("DELETE FROM tailored_resumes WHERE job_id = ?1", [&id])
            .map_err(|e| format!("Database error (tailored_resumes): {}", e))?;

        tx.execute("DELETE FROM jobs WHERE id = ?1", [&id])
            .map_err(|e| format!("Database error (jobs): {}", e))?;
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn delete_all_jobs(state: State<'_, AppState>) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    tx.execute("DELETE FROM downloads", [])
        .map_err(|e| format!("Database error (downloads): {}", e))?;

    tx.execute("DELETE FROM tailored_cover_letters", [])
        .map_err(|e| format!("Database error (tailored_cover_letters): {}", e))?;

    tx.execute("DELETE FROM tailored_resumes", [])
        .map_err(|e| format!("Database error (tailored_resumes): {}", e))?;

    tx.execute("DELETE FROM jobs", [])
        .map_err(|e| format!("Database error (jobs): {}", e))?;

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn update_job_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
    metadata: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("UPDATE jobs SET status = ?1 WHERE id = ?2", [&status, &id])
        .map_err(|e| format!("Database error (status): {}", e))?;

    if let Some(meta) = metadata {
        for (key, value) in meta {
            // Validate keys to prevent SQL injection or invalid column updates
            let column = match key.as_str() {
                "salary" => "salary",
                "applied_date" => "applied_date",
                "interview_date" => "interview_date",
                "offer_date" => "offer_date",
                "rejected_date" => "rejected_date",
                "joining_date" => "joining_date",
                _ => continue,
            };

            let sql = format!("UPDATE jobs SET {} = ?1 WHERE id = ?2", column);
            tx.execute(&sql, [&value, &id])
                .map_err(|e| format!("Database error ({}): {}", key, e))?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn update_job_metadata(
    state: State<'_, AppState>,
    id: String,
    field: String,
    value: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let column = match field.as_str() {
        "salary" => "salary",
        "applied_date" => "applied_date",
        "interview_date" => "interview_date",
        "offer_date" => "offer_date",
        "rejected_date" => "rejected_date",
        "joining_date" => "joining_date",
        _ => return Err(format!("Invalid metadata field: {}", field)),
    };

    let sql = format!("UPDATE jobs SET {} = ?1 WHERE id = ?2", column);
    conn.execute(&sql, [&value, &id])
        .map_err(|e| format!("Database error: {}", e))?;

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn update_tailored_resume(
    state: State<'_, AppState>,
    job_id: String,
    base_resume_id: Option<String>,
    latex_content: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. Update tailored_resumes
    let rows_affected = tx
        .execute(
            "UPDATE tailored_resumes SET final_latex_content = ?1, updated_at = CURRENT_TIMESTAMP 
         WHERE job_id = ?2",
            [&latex_content, &job_id],
        )
        .map_err(|e| format!("Database error (update): {}", e))?;

    if rows_affected == 0 {
        if let Some(base_id) = base_resume_id.clone() {
            let id = nanoid!(10);
            tx.execute(
                "INSERT INTO tailored_resumes (id, job_id, base_resume_id, final_latex_content, is_active)
                 VALUES (?1, ?2, ?3, ?4, 1)",
                [&id, &job_id, &base_id, &latex_content],
            )
            .map_err(|e| format!("Database error (insert): {}", e))?;
        } else {
            return Err("No tailored resume found to update. Please generate one first or select a template to initialize.".to_string());
        }
    }

    // 2. Update jobs table to reflect which base resume is being used
    if let Some(base_id) = base_resume_id {
        tx.execute(
            "UPDATE jobs SET base_resume_id = ?1 WHERE id = ?2",
            [&base_id, &job_id],
        )
        .map_err(|e| format!("Database error (jobs update): {}", e))?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn get_tailored_resume(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let mut stmt = conn
        .prepare("SELECT final_latex_content FROM tailored_resumes WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let content: String = stmt
        .query_row([&id], |row| row.get(0))
        .map_err(|_| "Tailored resume not found".to_string())?;

    Ok(content)
}

#[tauri::command]
pub async fn get_latest_tailored_resume(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<Option<TailoredContent>, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, base_resume_id, final_latex_content FROM tailored_resumes 
         WHERE job_id = ?1 
         ORDER BY created_at DESC LIMIT 1",
        )
        .map_err(|e| e.to_string())?;

    let result: Option<TailoredContent> = match stmt.query_row([&job_id], |row| {
        Ok(TailoredContent {
            id: row.get(0)?,
            base_template_id: row.get(1)?,
            content: row.get(2)?,
        })
    }) {
        Ok(v) => Some(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e.to_string()),
    };

    Ok(result)
}

#[tauri::command]
pub async fn tailor_resume(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    api_key: String,
    job_id: String,
    base_resume_id: String,
    custom_instruction: Option<String>,
) -> Result<String, String> {
    // 1. Fetch job and resume data
    let (raw_job_content, requirements, core_responsibilities, base_latex) = {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

        if let Some(conn) = db_guard.as_mut() {
            let mut stmt = conn
                .prepare(
                    "SELECT raw_jd, requirements, core_responsibilities FROM jobs WHERE id = ?1",
                )
                .map_err(|e| format!("Query prepare error: {}", e))?;

            let (raw_job, reqs, resps): (String, Option<String>, Option<String>) = stmt
                .query_row([&job_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .map_err(|_| format!("Job not found: {}", job_id))?;

            let mut stmt = conn
                .prepare("SELECT latex_content FROM base_resumes WHERE id = ?1")
                .map_err(|e| format!("Query prepare error: {}", e))?;

            let latex: String = stmt
                .query_row([&base_resume_id], |row| row.get(0))
                .map_err(|_| format!("Base resume not found: {}", base_resume_id))?;

            (raw_job, reqs, resps, latex)
        } else {
            return Err("Database connection lost".to_string());
        }
    };

    // 2. Prepare context
    let job_context = format!(
        "Job Description: {}\nRequirements: {}\nResponsibilities: {}",
        raw_job_content,
        requirements.unwrap_or_default(),
        core_responsibilities.unwrap_or_default()
    );

    // 3. Call AI (prompts owned here; `ai` is transport only)
    let system_prompt = format!(
        r#"You are an expert resume tailoring AI. Your task is to take a base LaTeX resume template and tailor it to match a specific job description.

MANDATORY RULES:
1. STRICT FACTUAL HONESTY (ZERO INVENTED SKILLS / NO HALLUCINATIONS):
   - You MUST NEVER lie, exaggerate, fabricate, or invent any skills, tools, programming languages, technologies, work experiences, metrics, or credentials that the candidate does not have in their base resume.
   - If the job description requires a skill or requirement that the candidate does NOT possess in the base resume, you MUST NOT insert it or claim the candidate has it.
   - Only highlight, prioritize, and reframe the candidate's genuine existing skills and experiences that authentically overlap with the job description.

2. EXACT PAGE BUDGET & LENGTH PRESERVATION:
   - The tailored output MUST have the EXACT SAME number of pages as the base LaTeX template.
   - If the base resume is a 1-page document, the tailored version MUST strictly fit on 1 page and NEVER spill onto a 2nd page.
   - If the base resume is a 2-page document, the tailored version MUST fit within 2 pages.
   - Maintain the same bullet counts, paragraph lengths, vertical spacing, and character density as the base resume to prevent any page overflow.

3. PRESERVE STRUCTURE & COMPILABILITY:
   - Only modify resume textual content, NOT the overall document structure, preamble, package imports, margins, or LaTeX commands unless strictly necessary for content.
   - Keep all original sections, layouts, and visual formatting intact.
   - Output ONLY valid, compilable LaTeX code with no markdown, no explanations, and no code fences.

{}

If custom instructions are provided, prioritize them while strictly maintaining honesty and page budget constraints."#,
        crate::commands::pdf::TECTONIC_LATEX_CRATE_RULES
    );

    let user_prompt = format!(
        r#"Base LaTeX Resume:
{}

Job Description:
{}

{}

Please tailor the resume to match the job description.
REMINDER:
- Do NOT invent or add skills/experiences the candidate lacks.
- The tailored LaTeX resume MUST fit on the exact same number of pages as the base template.
Return only the modified LaTeX code."#,
        base_latex,
        job_context,
        custom_instruction
            .map(|ci| format!("Custom Instructions:\n{}", ci))
            .unwrap_or_default()
    );

    let custom_base_url = crate::commands::settings::get_custom_base_url(&state, &provider).await;
    let tailored_latex = match ai::complete(
        &provider,
        &model,
        &api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Tailoring",
    )
    .await
    {
        Ok(t) => t,
        Err(e) => {
            let _ = crate::commands::error_logs::record_error_log_state(
                &state,
                "ai_tailoring",
                "AiError",
                "Failed to tailor resume with AI",
                Some(&e),
                Some("tailor_resume"),
            );
            return Err(e);
        }
    };

    // 4. Save to database
    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

        if let Some(conn) = db_guard.as_mut() {
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            let tailored_id = nanoid!(10);

            tx.execute(
                "INSERT INTO tailored_resumes (id, job_id, base_resume_id, final_latex_content, is_active)
                 VALUES (?1, ?2, ?3, ?4, 1)",
                [
                    &tailored_id,
                    &job_id,
                    &base_resume_id,
                    &tailored_latex,
                ],
            ).map_err(|e| format!("Database error (insert tailored): {}", e))?;

            tx.execute(
                "UPDATE jobs SET base_resume_id = ?1 WHERE id = ?2",
                [&base_resume_id, &job_id],
            )
            .map_err(|e| format!("Database error (update job): {}", e))?;

            tx.commit().map_err(|e| e.to_string())?;
            state.mark_dirty();
            Ok(tailored_id)
        } else {
            Err("Database connection lost".to_string())
        }
    }
}
