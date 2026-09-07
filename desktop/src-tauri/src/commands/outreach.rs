use crate::ai;
use crate::AppState;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OutreachLeadItem {
    pub id: String,
    pub person_name: String,
    pub profile_url: String,
    pub headline: Option<String>,
    pub raw_bio: String,
    pub recent_posts: Vec<String>,
    pub template_id: Option<String>,
    pub char_limit: i64,
    pub tailored_message: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OutreachLeadInput {
    pub id: Option<String>,
    pub person_name: String,
    pub profile_url: String,
    pub headline: Option<String>,
    pub raw_bio: String,
    pub recent_posts: Vec<String>,
    pub template_id: Option<String>,
    pub char_limit: i64,
    pub tailored_message: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TailorOutreachArgs {
    pub lead_id: Option<String>,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub person_name: String,
    pub profile_url: String,
    pub headline: Option<String>,
    pub raw_bio: String,
    pub recent_posts: Vec<String>,
    pub template_id: Option<String>,
    pub char_limit: usize,
    pub custom_instruction: Option<String>,
}

#[tauri::command]
pub fn get_all_outreach_leads(state: State<'_, AppState>) -> Result<Vec<OutreachLeadItem>, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let mut stmt = conn
            .prepare(
                "SELECT id, person_name, profile_url, headline, raw_bio, recent_posts, 
                        template_id, char_limit, tailored_message, status, created_at, updated_at 
                 FROM outreach_leads 
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| format!("Query prepare error: {}", e))?;

        let leads = stmt
            .query_map([], |row| {
                let posts_raw: String = row.get::<_, Option<String>>(5)?.unwrap_or_default();
                let recent_posts: Vec<String> =
                    serde_json::from_str(&posts_raw).unwrap_or_default();

                Ok(OutreachLeadItem {
                    id: row.get(0)?,
                    person_name: row.get(1)?,
                    profile_url: row.get(2)?,
                    headline: row.get(3)?,
                    raw_bio: row.get(4)?,
                    recent_posts,
                    template_id: row.get(6)?,
                    char_limit: row.get(7)?,
                    tailored_message: row.get(8)?,
                    status: row
                        .get::<_, Option<String>>(9)?
                        .unwrap_or_else(|| "Draft".to_string()),
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row collection error: {}", e))?;

        Ok(leads)
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn get_outreach_lead_by_id(
    state: State<'_, AppState>,
    id: String,
) -> Result<OutreachLeadItem, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let mut stmt = conn
            .prepare(
                "SELECT id, person_name, profile_url, headline, raw_bio, recent_posts, 
                        template_id, char_limit, tailored_message, status, created_at, updated_at 
                 FROM outreach_leads 
                 WHERE id = ?1",
            )
            .map_err(|e| format!("Query prepare error: {}", e))?;

        let lead = stmt
            .query_row([id], |row| {
                let posts_raw: String = row.get::<_, Option<String>>(5)?.unwrap_or_default();
                let recent_posts: Vec<String> =
                    serde_json::from_str(&posts_raw).unwrap_or_default();

                Ok(OutreachLeadItem {
                    id: row.get(0)?,
                    person_name: row.get(1)?,
                    profile_url: row.get(2)?,
                    headline: row.get(3)?,
                    raw_bio: row.get(4)?,
                    recent_posts,
                    template_id: row.get(6)?,
                    char_limit: row.get(7)?,
                    tailored_message: row.get(8)?,
                    status: row
                        .get::<_, Option<String>>(9)?
                        .unwrap_or_else(|| "Draft".to_string()),
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })
            .map_err(|e| format!("Outreach lead not found: {}", e))?;

        Ok(lead)
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn save_outreach_lead(
    state: State<'_, AppState>,
    lead: OutreachLeadInput,
) -> Result<String, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let posts_json =
            serde_json::to_string(&lead.recent_posts).unwrap_or_else(|_| "[]".to_string());
        let lead_id = lead.id.unwrap_or_else(|| format!("lead-{}", nanoid!(10)));
        let status = lead.status.unwrap_or_else(|| "Draft".to_string());

        conn.execute(
            "INSERT INTO outreach_leads (
                id, person_name, profile_url, headline, raw_bio, recent_posts, 
                template_id, char_limit, tailored_message, status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET 
                person_name=excluded.person_name,
                profile_url=excluded.profile_url,
                headline=excluded.headline,
                raw_bio=excluded.raw_bio,
                recent_posts=excluded.recent_posts,
                template_id=excluded.template_id,
                char_limit=excluded.char_limit,
                tailored_message=excluded.tailored_message,
                status=excluded.status,
                updated_at=CURRENT_TIMESTAMP",
            rusqlite::params![
                &lead_id,
                &lead.person_name,
                &lead.profile_url,
                &lead.headline,
                &lead.raw_bio,
                &posts_json,
                &lead.template_id,
                &lead.char_limit,
                &lead.tailored_message,
                &status,
            ],
        )
        .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(lead_id)
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn update_outreach_lead_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        conn.execute(
            "UPDATE outreach_leads SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            [&status, &id],
        )
        .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(())
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn delete_outreach_lead(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        conn.execute("DELETE FROM outreach_leads WHERE id = ?1", [&id])
            .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(())
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn delete_outreach_leads_batch(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM outreach_leads WHERE id IN ({})", placeholders);

        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();

        conn.execute(&sql, rusqlite::params_from_iter(params))
            .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(())
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub async fn tailor_outreach_message(
    state: State<'_, AppState>,
    args: TailorOutreachArgs,
) -> Result<String, String> {
    // 1. Fetch template content if template_id was supplied
    let base_template_content = if let Some(tmpl_id) = &args.template_id {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        if let Some(conn) = db_guard.as_mut() {
            // Try hr_templates table first
            let tmpl_content: Option<String> = conn
                .query_row(
                    "SELECT content FROM hr_templates WHERE id = ?1",
                    [tmpl_id],
                    |row| row.get(0),
                )
                .ok();
            tmpl_content
        } else {
            None
        }
    } else {
        None
    };

    // 2. Resolve custom base URL if configured for this provider
    let custom_base_url =
        crate::commands::settings::get_custom_base_url(&state, &args.provider).await;

    // 3. Build prompts (owned here; `ai` is transport only) and call AI
    let char_limit_val = if args.char_limit == 0 {
        200
    } else {
        args.char_limit
    };

    let system_prompt = format!(
        r#"You are an elite, highly authentic executive outreach copywriter. Your goal is to write a personalized, compelling, and respectful direct outreach message (e.g. for LinkedIn InMail, connection request, Twitter DM, or email) to a specific professional.

MANDATORY RULES:
1. STRICT HARD CHARACTER LIMIT:
   - The final generated message MUST STRICTLY be at or under {} characters total (including all spaces, letters, numbers, and punctuation).
   - Do NOT write more than {} characters under any condition. Be concise, punchy, and make every single character count.
2. STRICT FACTUAL HONESTY (ZERO INVENTED SKILLS / NO HALLUCINATIONS):
   - NEVER lie, fabricate, or invent skills, achievements, companies, past interactions, or mutual connections.
   - Base any common ground honestly on what is provided in the recipient's bio/posts or candidate's authentic background.
3. AUTHENTIC PERSONALIZATION & ENGAGEMENT:
   - Mention or react to a specific topic or thought from their recent posts or profile bio to demonstrate you actually paid attention to their work.
   - If a base HR message template is provided, use it as the foundational voice, intent, and structure, tailoring it specifically around this person's background.
   - Include a low-friction, natural question or call-to-action (e.g., asking for 5 mins, feedback, or connecting).
   - Avoid generic corporate clichés like "Hope you are doing well", "I stumbled upon your profile", or "I was impressed by your journey".
4. OUTPUT FORMAT:
   - Output ONLY the final message text ready to send, as plain raw text.
   - Do NOT include subject lines, greetings labels like 'Subject:', markdown quotes, or commentary.
   - NEVER emit LaTeX commands, LaTeX environments, code fences, or surrounding quotation marks — plain message text only.
5. BREVITY CRAFT (short notes get read; long ones get skipped):
   - Front-load the hook: the first line must earn the open — name the specific thing about THEIR work, not yourself.
   - Cut throat-clearing openers ("Hope you're well", "I came across your profile", "Allow me to introduce myself").
   - One idea per sentence, ONE single low-friction call-to-action, zero restated filler.
   - Every character must earn its place: prefer a tighter message over padding up to the limit."#,
        char_limit_val, char_limit_val
    );

    let posts_formatted = if args.recent_posts.is_empty() {
        "No recent posts provided.".to_string()
    } else {
        args.recent_posts
            .iter()
            .enumerate()
            .map(|(i, post)| format!("Post #{}:\n{}", i + 1, post.trim()))
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    let user_prompt = format!(
        r#"RECIPIENT INFORMATION:
- Name: {}
- Profile URL: {}
- Headline: {}
- Profile Bio / Summary:
{}

RECIPIENT'S RECENT POSTS:
{}

{}

{}

CRITICAL CONSTRAINT: The message MUST strictly be {} characters or less.
Generate the tailored outreach message now:"#,
        args.person_name,
        args.profile_url,
        args.headline.as_deref().unwrap_or("N/A"),
        args.raw_bio,
        posts_formatted,
        base_template_content
            .filter(|t| !t.trim().is_empty())
            .map(|t| format!("BASE HR TEMPLATE TO ADAPT:\n{}", t))
            .unwrap_or_default(),
        args.custom_instruction
            .as_deref()
            .filter(|c| !c.trim().is_empty())
            .map(|c| format!("USER CUSTOM INSTRUCTION:\n{}", c))
            .unwrap_or_default(),
        char_limit_val
    );

    let raw_result = ai::complete(
        &args.provider,
        &args.model,
        &args.api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Outreach",
    )
    .await?;

    let mut tailored_message = raw_result.trim().to_string();
    if (tailored_message.starts_with('"') && tailored_message.ends_with('"'))
        || (tailored_message.starts_with('\'') && tailored_message.ends_with('\''))
    {
        tailored_message = tailored_message[1..tailored_message.len() - 1]
            .trim()
            .to_string();
    }
    if tailored_message.starts_with("```") && tailored_message.ends_with("```") {
        let lines: Vec<&str> = tailored_message.lines().collect();
        if lines.len() >= 2 {
            tailored_message = lines[1..lines.len() - 1].join("\n").trim().to_string();
        }
    }

    if tailored_message.chars().count() > char_limit_val {
        let truncated: String = tailored_message.chars().take(char_limit_val).collect();
        if let Some(boundary) =
            truncated.rfind(|c: char| c.is_whitespace() || c == '.' || c == '!' || c == '?')
        {
            if boundary > char_limit_val * 6 / 10 {
                let mut clean = truncated[..boundary].trim_end().to_string();
                if !clean.ends_with('.') && !clean.ends_with('?') && !clean.ends_with('!') {
                    clean.push('.');
                }
                tailored_message = clean;
            } else {
                tailored_message = truncated;
            }
        } else {
            tailored_message = truncated;
        }
    }

    // 4. If lead_id was provided, update the tailored_message column in database
    if let Some(lead_id) = &args.lead_id {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        if let Some(conn) = db_guard.as_mut() {
            let _ = conn.execute(
                "UPDATE outreach_leads SET tailored_message = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                [&tailored_message, lead_id],
            );
            state.mark_dirty();
        }
    }

    Ok(tailored_message)
}
