use crate::AppState;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HrTemplateItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrTemplateArgs {
    pub name: String,
    pub category: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHrTemplateArgs {
    pub id: String,
    pub name: String,
    pub category: String,
    pub content: String,
}

#[tauri::command]
pub fn get_all_hr_templates(state: State<'_, AppState>) -> Result<Vec<HrTemplateItem>, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let mut stmt = conn
            .prepare("SELECT id, name, category, content, created_at, updated_at FROM hr_templates ORDER BY created_at DESC")
            .map_err(|e| format!("Query prepare error: {}", e))?;

        let templates = stmt
            .query_map([], |row| {
                Ok(HrTemplateItem {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row collection error: {}", e))?;

        Ok(templates)
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn get_hr_template_by_id(
    state: State<'_, AppState>,
    id: String,
) -> Result<HrTemplateItem, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let mut stmt = conn
            .prepare("SELECT id, name, category, content, created_at, updated_at FROM hr_templates WHERE id = ?1")
            .map_err(|e| format!("Query prepare error: {}", e))?;

        let template = stmt
            .query_row([id], |row| {
                Ok(HrTemplateItem {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| format!("HR template not found: {}", e))?;

        Ok(template)
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn create_hr_template(
    state: State<'_, AppState>,
    args: CreateHrTemplateArgs,
) -> Result<String, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        let template_id = format!("hr-tmpl-{}", nanoid!(10));

        conn.execute(
            "INSERT INTO hr_templates (id, name, category, content) VALUES (?1, ?2, ?3, ?4)",
            [&template_id, &args.name, &args.category, &args.content],
        )
        .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(template_id)
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn update_hr_template(
    state: State<'_, AppState>,
    args: UpdateHrTemplateArgs,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        conn.execute(
            "UPDATE hr_templates SET name = ?1, category = ?2, content = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
            [&args.name, &args.category, &args.content, &args.id],
        )
        .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(())
    } else {
        Err("Database connection lost".to_string())
    }
}

#[tauri::command]
pub fn delete_hr_template(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;

    if let Some(conn) = db_guard.as_mut() {
        conn.execute("DELETE FROM hr_templates WHERE id = ?1", [&id])
            .map_err(|e| format!("Database error: {}", e))?;

        state.mark_dirty();
        Ok(())
    } else {
        Err("Database connection lost".to_string())
    }
}
