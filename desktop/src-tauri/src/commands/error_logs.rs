use crate::AppState;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{command, AppHandle, Manager, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ErrorAuditLog {
    pub id: String,
    pub task_type: String, // compiling, creating, fetching, ai_tailoring, ai_refining, ai_fixing, saving, deleting, s3_backup, network, general
    pub error_type: String, // TectonicCompilationError, AiError, DatabaseError, FileSystemError, NetworkError, ValidationError, SystemError
    pub message: String,
    pub details: Option<String>,
    pub source: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ErrorLogStats {
    pub total: u64,
    pub by_task: HashMap<String, u64>,
}

/// Helper function to record an error log directly using an existing SQLite connection.
pub fn record_error_log_direct(
    conn: &Connection,
    task_type: &str,
    error_type: &str,
    message: &str,
    details: Option<&str>,
    source: Option<&str>,
) -> Result<ErrorAuditLog, String> {
    let id = nanoid::nanoid!();
    let sanitized_msg = message.trim();
    let sanitized_details = details.map(|d| d.trim()).filter(|d| !d.is_empty());
    let sanitized_source = source.map(|s| s.trim()).filter(|s| !s.is_empty());

    conn.execute(
        "INSERT INTO error_audit_logs (id, task_type, error_type, message, details, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
        params![
            &id,
            task_type,
            error_type,
            sanitized_msg,
            sanitized_details,
            sanitized_source,
        ],
    )
    .map_err(|e| format!("Failed to insert error audit log: {}", e))?;

    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM error_audit_logs WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

    Ok(ErrorAuditLog {
        id,
        task_type: task_type.to_string(),
        error_type: error_type.to_string(),
        message: sanitized_msg.to_string(),
        details: sanitized_details.map(|d| d.to_string()),
        source: sanitized_source.map(|s| s.to_string()),
        created_at,
    })
}

/// Helper function to record an error log directly from AppState.
pub fn record_error_log_state(
    state: &AppState,
    task_type: &str,
    error_type: &str,
    message: &str,
    details: Option<&str>,
    source: Option<&str>,
) -> Result<ErrorAuditLog, String> {
    let mut db_guard = state
        .db
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection is closed")?;
    record_error_log_direct(conn, task_type, error_type, message, details, source)
}

/// Helper function to record an error log from an AppHandle.
pub fn record_error_log_app(
    app: &AppHandle,
    task_type: &str,
    error_type: &str,
    message: &str,
    details: Option<&str>,
    source: Option<&str>,
) -> Result<ErrorAuditLog, String> {
    if let Some(state) = app.try_state::<AppState>() {
        record_error_log_state(&state, task_type, error_type, message, details, source)
    } else {
        Err("Could not retrieve AppState from AppHandle".to_string())
    }
}

/// Tauri command to record an error log from the frontend or backend.
#[command]
pub async fn record_error_log(
    state: State<'_, AppState>,
    task_type: String,
    error_type: String,
    message: String,
    details: Option<String>,
    source: Option<String>,
) -> Result<ErrorAuditLog, String> {
    record_error_log_state(
        &state,
        &task_type,
        &error_type,
        &message,
        details.as_deref(),
        source.as_deref(),
    )
}

/// Tauri command to fetch error logs with filtering, search, and pagination.
#[command]
pub async fn get_error_logs(
    state: State<'_, AppState>,
    task_type: Option<String>,
    error_type: Option<String>,
    search_query: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<ErrorAuditLog>, String> {
    let mut db_guard = state
        .db
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection is closed")?;

    let mut conditions = Vec::new();
    let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(t) = task_type {
        let t_trimmed = t.trim();
        if !t_trimmed.is_empty() && !t_trimmed.eq_ignore_ascii_case("all") {
            conditions.push("task_type = ?");
            query_params.push(Box::new(t_trimmed.to_string()));
        }
    }

    if let Some(e) = error_type {
        let e_trimmed = e.trim();
        if !e_trimmed.is_empty() && !e_trimmed.eq_ignore_ascii_case("all") {
            conditions.push("error_type = ?");
            query_params.push(Box::new(e_trimmed.to_string()));
        }
    }

    if let Some(q) = search_query {
        let q_trimmed = q.trim();
        if !q_trimmed.is_empty() {
            let pattern = format!("%{}%", q_trimmed);
            conditions.push("(message LIKE ? OR details LIKE ? OR source LIKE ?)");
            query_params.push(Box::new(pattern.clone()));
            query_params.push(Box::new(pattern.clone()));
            query_params.push(Box::new(pattern));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let limit_val = limit.unwrap_or(200);
    let offset_val = offset.unwrap_or(0);

    let sql = format!(
        "SELECT id, task_type, error_type, message, details, source, created_at
         FROM error_audit_logs
         {}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?",
        where_clause
    );

    query_params.push(Box::new(limit_val));
    query_params.push(Box::new(offset_val));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = query_params.iter().map(|b| b.as_ref()).collect();

    let logs = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(ErrorAuditLog {
                id: row.get(0)?,
                task_type: row.get(1)?,
                error_type: row.get(2)?,
                message: row.get(3)?,
                details: row.get(4)?,
                source: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(logs)
}

/// Tauri command to get error logs statistics (counts by task type and total).
#[command]
pub async fn get_error_log_stats(state: State<'_, AppState>) -> Result<ErrorLogStats, String> {
    let mut db_guard = state
        .db
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection is closed")?;

    let total: u64 = conn
        .query_row("SELECT COUNT(*) FROM error_audit_logs", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|v| v.max(0) as u64)
        .unwrap_or(0);

    let mut by_task = HashMap::new();
    if let Ok(mut stmt) =
        conn.prepare("SELECT task_type, COUNT(*) FROM error_audit_logs GROUP BY task_type")
    {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }) {
            for item in rows.flatten() {
                by_task.insert(item.0, item.1.max(0) as u64);
            }
        }
    }

    Ok(ErrorLogStats { total, by_task })
}

/// Tauri command to delete a single error log.
#[command]
pub async fn delete_error_log(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut db_guard = state
        .db
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection is closed")?;

    conn.execute("DELETE FROM error_audit_logs WHERE id = ?1", [&id])
        .map_err(|e| format!("Failed to delete error audit log: {}", e))?;

    Ok(())
}

/// Tauri command to delete multiple error logs in a batch.
#[command]
pub async fn delete_error_logs_batch(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let mut db_guard = state
        .db
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection is closed")?;

    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "DELETE FROM error_audit_logs WHERE id IN ({})",
        placeholders.join(",")
    );

    let params: Vec<&dyn rusqlite::ToSql> =
        ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();

    conn.execute(&sql, params.as_slice())
        .map_err(|e| format!("Failed to delete error audit logs batch: {}", e))?;

    Ok(())
}

/// Tauri command to clear error logs (optionally filtered by task_type).
#[command]
pub async fn clear_error_logs(
    state: State<'_, AppState>,
    task_type: Option<String>,
) -> Result<(), String> {
    let mut db_guard = state
        .db
        .lock()
        .map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection is closed")?;

    if let Some(t) = task_type {
        let t_trimmed = t.trim();
        if !t_trimmed.is_empty() && !t_trimmed.eq_ignore_ascii_case("all") {
            conn.execute(
                "DELETE FROM error_audit_logs WHERE task_type = ?1",
                [&t_trimmed],
            )
            .map_err(|e| format!("Failed to clear error logs for task: {}", e))?;
            return Ok(());
        }
    }

    conn.execute("DELETE FROM error_audit_logs", [])
        .map_err(|e| format!("Failed to clear error audit logs: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_logs_table_and_query() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE error_audit_logs (
                id TEXT PRIMARY KEY,
                task_type TEXT NOT NULL,
                error_type TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT,
                source TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        let logged = record_error_log_direct(
            &conn,
            "compiling",
            "TectonicCompilationError",
            "LaTeX compilation test error",
            Some("Fatal error on line 42"),
            Some("test_source"),
        )
        .unwrap();

        assert_eq!(logged.task_type, "compiling");
        assert_eq!(logged.error_type, "TectonicCompilationError");
        assert_eq!(logged.message, "LaTeX compilation test error");

        // Test querying
        let mut stmt = conn
            .prepare("SELECT id, task_type, error_type, message, details, source, created_at FROM error_audit_logs WHERE task_type = ?1")
            .unwrap();
        let logs: Vec<ErrorAuditLog> = stmt
            .query_map(["compiling"], |row| {
                Ok(ErrorAuditLog {
                    id: row.get(0)?,
                    task_type: row.get(1)?,
                    error_type: row.get(2)?,
                    message: row.get(3)?,
                    details: row.get(4)?,
                    source: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, logged.id);
    }
}
