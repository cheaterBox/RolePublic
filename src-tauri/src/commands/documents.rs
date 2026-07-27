use crate::AppState;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

const MAX_FILENAME_LEN: usize = 100;
const MAX_REL_PATH_LEN: usize = 256;
/// File extensions eligible for backup. Binary assets are excluded.
pub const TEXT_BACKUP_EXTENSIONS: &[&str] = &["tex", "bib", "cls", "sty", "md", "mmd", "txt", "cfg"];

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: String,
    pub starred: bool,
    pub main_file: Option<String>,
    pub last_compiled_at: Option<String>,
    pub compile_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentDetail {
    #[serde(flatten)]
    pub summary: DocumentSummary,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentFileEntry {
    pub rel_path: String,
    pub size_bytes: i64,
    pub updated_at: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentArgs {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub starred: Option<bool>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentArgs {
    pub doc_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub starred: Option<bool>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReadDocumentFileArgs {
    pub doc_id: String,
    pub rel_path: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WriteDocumentFileArgs {
    pub doc_id: String,
    pub rel_path: String,
    pub content: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentFileArgs {
    pub doc_id: String,
    pub parent_rel: Option<String>,
    pub name: String,
    pub content: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocumentFileArgs {
    pub doc_id: String,
    pub rel_path: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RenameDocumentFileArgs {
    pub doc_id: String,
    pub rel_path: String,
    pub new_name: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetDocumentMainFileArgs {
    pub doc_id: String,
    pub rel_path: Option<String>,
}

fn now_rfc3339() -> String {
    chrono::Local::now().to_rfc3339()
}

fn is_safe_name(name: &str) -> bool {
    if name.is_empty() || name.len() > MAX_FILENAME_LEN {
        return false;
    }
    if name.starts_with('.') {
        return false;
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return false;
    }
    if name == "." || name == ".." || name.contains("..") {
        return false;
    }
    true
}

/// Normalize a user-provided rel_path into a strict POSIX path. Returns Err on
/// any traversal attempt, absolute path, or disallowed character.
fn normalize_rel_path(rel_path: &str) -> Result<String, String> {
    if rel_path.is_empty() {
        return Err("Path is empty".to_string());
    }
    if rel_path.len() > MAX_REL_PATH_LEN {
        return Err(format!("Path exceeds {} characters", MAX_REL_PATH_LEN));
    }
    if rel_path.contains('\0') {
        return Err("Path contains a null byte".to_string());
    }
    let normalized = rel_path.replace('\\', "/");
    let absolute = Path::new(&normalized);
    if absolute.is_absolute() {
        return Err("Absolute paths are not allowed".to_string());
    }
    // Block Windows-style drive prefixes even on Unix (defense-in-depth).
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        return Err("Drive-letter paths are not allowed".to_string());
    }
    for component in Path::new(&normalized).components() {
        let s = component.as_os_str().to_string_lossy().to_string();
        if s == ".." {
            return Err("Path traversal ('..') is not allowed".to_string());
        }
        if s == "." && normalized != "." {
            return Err("Invalid '.' component".to_string());
        }
    }
    Ok(normalized)
}

fn documents_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("documents");
    Ok(dir)
}

fn document_dir(app: &AppHandle, doc_id: &str) -> Result<PathBuf, String> {
    if doc_id.is_empty() || doc_id.len() > 64 {
        return Err("Invalid document id".to_string());
    }
    Ok(documents_root(app)?.join(doc_id))
}

/// Resolve a safe absolute file path for a given document + rel_path. Verifies
/// the canonicalized path stays inside the document directory.
fn safe_document_file_path(app: &AppHandle, doc_id: &str, rel_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_rel_path(rel_path)?;
    let root = document_dir(app, doc_id)?;
    let candidate = root.join(&normalized);

    // If the file (or any ancestor) exists, canonicalize and verify containment.
    if candidate.exists() {
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize {}: {}", candidate.display(), e))?;
        if !canonical.starts_with(&root) {
            return Err(format!(
                "Resolved path escapes document directory: {}",
                candidate.display()
            ));
        }
        return Ok(canonical);
    }

    // For non-existing targets (write), confirm no '..' components already
    // failed in normalize_rel_path, and that the parent path stays inside root.
    let parent = candidate
        .parent()
        .ok_or_else(|| format!("Invalid parent for {}", candidate.display()))?;
    if !parent.starts_with(&root) {
        return Err(format!(
            "Parent path escapes document directory: {}",
            parent.display()
        ));
    }
    Ok(candidate)
}

fn scaffold_main_tex(title: &str) -> String {
    format!(
        "% Generated by Roletect for document: {}\n\\documentclass[11pt]{{article}}\n\\usepackage[margin=1in]{{geometry}}\n\\title{{{}}}\n\\author{{Your Name}}\n\\begin{{document}}\n\\maketitle\n\\section{{Introduction}}\nEdit me!\n\\end{{document}}\n",
        title, title
    )
}

fn summary_from_row(row: &rusqlite::Row<'_>) -> Result<DocumentSummary, rusqlite::Error> {
    Ok(DocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        tags: row.get(3)?,
        starred: row.get::<_, i64>(4)? != 0,
        main_file: row.get(5)?,
        last_compiled_at: row.get(6)?,
        compile_status: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

const DOCUMENT_SELECT: &str = "SELECT id, title, description, tags, starred, main_file, last_compiled_at, compile_status, created_at, updated_at FROM documents";

#[tauri::command]
pub fn get_all_documents(state: State<'_, AppState>) -> Result<Vec<DocumentSummary>, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    let mut stmt = conn
        .prepare(&format!("{} ORDER BY starred DESC, updated_at DESC", DOCUMENT_SELECT))
        .map_err(|e| e.to_string())?;
    let docs = stmt
        .query_map([], summary_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(docs)
}

#[tauri::command]
pub fn get_document_by_id(state: State<'_, AppState>, doc_id: String) -> Result<DocumentSummary, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    let mut stmt = conn
        .prepare(&format!("{} WHERE id = ?1", DOCUMENT_SELECT))
        .map_err(|e| e.to_string())?;
    let summary = stmt
        .query_row([&doc_id], summary_from_row)
        .map_err(|e| format!("Document not found: {}", e))?;
    Ok(summary)
}

#[tauri::command]
pub async fn create_new_document(
    app: AppHandle,
    state: State<'_, AppState>,
    args: CreateDocumentArgs,
) -> Result<String, String> {
    let title = args.title.trim();
    if title.is_empty() {
        return Err("Title is required".to_string());
    }

    let doc_id = nanoid::nanoid!(10);
    let doc_dir = document_dir(&app, &doc_id)?;
    std::fs::create_dir_all(&doc_dir)
        .map_err(|e| format!("Failed to create document directory: {}", e))?;

    let main_tex = scaffold_main_tex(title);
    let main_path = doc_dir.join("main.tex");
    std::fs::write(&main_path, &main_tex)
        .map_err(|e| format!("Failed to write main.tex: {}", e))?;

    let now = now_rfc3339();
    let description = args.description.unwrap_or_default();
    let tags = args.tags.unwrap_or_default();
    let starred = args.starred.unwrap_or(false);

    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        conn.execute(
            "INSERT INTO documents (id, title, description, tags, starred, main_file, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, 'main.tex', ?6, ?6)",
            rusqlite::params![&doc_id, title, &description, &tags, starred as i64, &now],
        )
        .map_err(|e| format!("Failed to insert document: {}", e))?;

        conn.execute(
            "INSERT INTO document_files (doc_id, rel_path, content, size_bytes, updated_at) \
             VALUES (?1, 'main.tex', ?2, ?3, ?4)",
            rusqlite::params![&doc_id, &main_tex, main_tex.len() as i64, &now],
        )
        .map_err(|e| format!("Failed to insert main file: {}", e))?;
    }

    state.mark_dirty();
    Ok(doc_id)
}

#[tauri::command]
pub fn update_document(state: State<'_, AppState>, args: UpdateDocumentArgs) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;

    // Verify the document exists.
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM documents WHERE id = ?1",
            [&args.doc_id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(false);
    if !exists {
        return Err(format!("Document not found: {}", args.doc_id));
    }

    let mut sets: Vec<String> = Vec::new();
    let mut params_dyn: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(t) = args.title.as_ref() {
        let trimmed = t.trim();
        if trimmed.is_empty() {
            return Err("Title cannot be empty".to_string());
        }
        sets.push("title = ?".to_string());
        params_dyn.push(Box::new(trimmed.to_string()));
    }
    if let Some(d) = args.description.as_ref() {
        sets.push("description = ?".to_string());
        params_dyn.push(Box::new(d.clone()));
    }
    if let Some(t) = args.tags.as_ref() {
        sets.push("tags = ?".to_string());
        params_dyn.push(Box::new(t.clone()));
    }
    if let Some(s) = args.starred {
        sets.push("starred = ?".to_string());
        params_dyn.push(Box::new(s as i64));
    }

    if sets.is_empty() {
        return Ok(()); // nothing to update
    }

    let sql = format!("UPDATE documents SET {} WHERE id = ?", sets.join(", "));
    params_dyn.push(Box::new(args.doc_id.clone()));

    let refs: Vec<&dyn rusqlite::ToSql> = params_dyn.iter().map(|b| b.as_ref()).collect();
    conn.execute(&sql, refs.as_slice())
        .map_err(|e| format!("Failed to update document: {}", e))?;

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub fn set_document_starred(state: State<'_, AppState>, doc_id: String, starred: bool) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    conn.execute(
        "UPDATE documents SET starred = ?1 WHERE id = ?2",
        rusqlite::params![starred as i64, &doc_id],
    )
    .map_err(|e| format!("Failed to update starred: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_document(
    app: AppHandle,
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<(), String> {
    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        // document_files cascades via FK
        conn.execute("DELETE FROM documents WHERE id = ?1", [&doc_id])
            .map_err(|e| format!("Failed to delete document: {}", e))?;
    }

    // Best-effort disk cleanup. Errors here are non-fatal.
    let dir = document_dir(&app, &doc_id)?;
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn delete_documents_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in &ids {
            tx.execute("DELETE FROM documents WHERE id = ?1", [id])
                .map_err(|e| format!("Failed to delete {}: {}", id, e))?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    for id in &ids {
        let dir = document_dir(&app, id)?;
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }

    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub fn list_document_files(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<Vec<DocumentFileEntry>, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    let mut stmt = conn
        .prepare("SELECT rel_path, size_bytes, updated_at FROM document_files WHERE doc_id = ?1 ORDER BY rel_path ASC")
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([&doc_id], |row| {
            Ok(DocumentFileEntry {
                rel_path: row.get(0)?,
                size_bytes: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(entries)
}

#[tauri::command]
pub fn read_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    args: ReadDocumentFileArgs,
) -> Result<String, String> {
    // Prefer disk for live edits; fall back to DB row.
    let path = safe_document_file_path(&app, &args.doc_id, &args.rel_path)?;
    if path.is_file() {
        let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        return match String::from_utf8(bytes) {
            Ok(s) => Ok(s),
            Err(_) => Err(format!("File '{}' is not valid UTF-8", args.rel_path)),
        };
    }

    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    let content: Option<String> = conn
        .query_row(
            "SELECT content FROM document_files WHERE doc_id = ?1 AND rel_path = ?2",
            rusqlite::params![&args.doc_id, &args.rel_path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    content.ok_or_else(|| format!("File '{}' not found", args.rel_path))
}

#[tauri::command]
pub async fn write_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    args: WriteDocumentFileArgs,
) -> Result<(), String> {
    if !is_safe_name(
        Path::new(&args.rel_path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(""),
    ) {
        return Err(format!("Invalid file name: {}", args.rel_path));
    }
    // Reject binary content.
    if std::str::from_utf8(args.content.as_bytes()).is_err() {
        return Err("File content must be valid UTF-8 text".to_string());
    }

    let target = safe_document_file_path(&app, &args.doc_id, &args.rel_path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
    }

    // Atomic write: temp file + rename.
    let tmp = target.with_extension(
        match target.extension().and_then(|s| s.to_str()) {
            Some(ext) => format!("{}.tmp", ext),
            None => "tmp".to_string(),
        },
    );
    std::fs::write(&tmp, args.content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("Failed to commit file: {}", e))?;

    let size = args.content.len() as i64;
    let now = now_rfc3339();

    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        conn.execute(
            "INSERT INTO document_files (doc_id, rel_path, content, size_bytes, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(doc_id, rel_path) DO UPDATE SET \
                content = excluded.content, \
                size_bytes = excluded.size_bytes, \
                updated_at = excluded.updated_at",
            rusqlite::params![&args.doc_id, &args.rel_path, &args.content, size, &now],
        )
        .map_err(|e| format!("Failed to upsert file: {}", e))?;
    }
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn create_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    args: CreateDocumentFileArgs,
) -> Result<(), String> {
    if !is_safe_name(&args.name) {
        return Err(format!("Invalid file name: {}", args.name));
    }
    let parent_rel = args
        .parent_rel
        .as_deref()
        .map(|p| normalize_rel_path(p))
        .transpose()?
        .unwrap_or_default();
    let rel_path = if parent_rel.is_empty() {
        args.name.clone()
    } else {
        format!("{}/{}", parent_rel.trim_end_matches('/'), args.name)
    };
    let rel_path = normalize_rel_path(&rel_path)?;

    let target = safe_document_file_path(&app, &args.doc_id, &rel_path)?;
    if target.exists() {
        return Err(format!("File already exists: {}", rel_path));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
    }
    let content = args.content.unwrap_or_default();
    std::fs::write(&target, content.as_bytes())
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let now = now_rfc3339();
    let size = content.len() as i64;
    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        conn.execute(
            "INSERT INTO document_files (doc_id, rel_path, content, size_bytes, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&args.doc_id, &rel_path, &content, size, &now],
        )
        .map_err(|e| format!("Failed to insert file: {}", e))?;
    }
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn delete_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    args: DeleteDocumentFileArgs,
) -> Result<(), String> {
    let target = safe_document_file_path(&app, &args.doc_id, &args.rel_path)?;
    if target.is_file() {
        std::fs::remove_file(&target).map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        conn.execute(
            "DELETE FROM document_files WHERE doc_id = ?1 AND rel_path = ?2",
            rusqlite::params![&args.doc_id, &args.rel_path],
        )
        .map_err(|e| format!("Failed to delete file row: {}", e))?;

        // If the file was the main file, unset it.
        conn.execute(
            "UPDATE documents SET main_file = NULL WHERE id = ?1 AND main_file = ?2",
            rusqlite::params![&args.doc_id, &args.rel_path],
        )
        .map_err(|e| format!("Failed to clear main_file: {}", e))?;
    }
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub async fn rename_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    args: RenameDocumentFileArgs,
) -> Result<(), String> {
    if !is_safe_name(&args.new_name) {
        return Err(format!("Invalid file name: {}", args.new_name));
    }
    let normalized_old = normalize_rel_path(&args.rel_path)?;
    let parent_rel = Path::new(&normalized_old)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or("");
    let parent_rel = if parent_rel.is_empty() {
        String::new()
    } else {
        parent_rel.to_string()
    };
    let new_rel = if parent_rel.is_empty() {
        args.new_name.clone()
    } else {
        format!("{}/{}", parent_rel, args.new_name)
    };
    let new_rel = normalize_rel_path(&new_rel)?;
    if new_rel == normalized_old {
        return Ok(());
    }

    let old_path = safe_document_file_path(&app, &args.doc_id, &normalized_old)?;
    let new_path = safe_document_file_path(&app, &args.doc_id, &new_rel)?;
    if new_path.exists() {
        return Err(format!("Target file already exists: {}", new_rel));
    }

    if old_path.is_file() {
        if let Some(parent) = new_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
        }
        std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename: {}", e))?;
    }

    let now = now_rfc3339();
    {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        // Move row by re-insert with new key + delete old. We cannot use UPDATE
        // for the PK directly, so copy content from the old row.
        let mut stmt = conn
            .prepare(
                "SELECT content, size_bytes FROM document_files WHERE doc_id = ?1 AND rel_path = ?2",
            )
            .map_err(|e| e.to_string())?;
        let row: Option<(String, i64)> = stmt
            .query_row(rusqlite::params![&args.doc_id, &normalized_old], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some((content, size)) = row {
            conn.execute(
                "INSERT INTO document_files (doc_id, rel_path, content, size_bytes, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![&args.doc_id, &new_rel, &content, size, &now],
            )
            .map_err(|e| format!("Failed to insert renamed row: {}", e))?;
            conn.execute(
                "DELETE FROM document_files WHERE doc_id = ?1 AND rel_path = ?2",
                rusqlite::params![&args.doc_id, &normalized_old],
            )
            .map_err(|e| format!("Failed to delete old row: {}", e))?;
        }

        // If this was the main file, update the documents row.
        conn.execute(
            "UPDATE documents SET main_file = ?1 WHERE id = ?2 AND main_file = ?3",
            rusqlite::params![&new_rel, &args.doc_id, &normalized_old],
        )
        .map_err(|e| format!("Failed to update main_file: {}", e))?;
    }
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub fn set_document_main_file(
    state: State<'_, AppState>,
    args: SetDocumentMainFileArgs,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    match args.rel_path {
        Some(p) => {
            let normalized = normalize_rel_path(&p)?;
            conn.execute(
                "UPDATE documents SET main_file = ?1 WHERE id = ?2",
                rusqlite::params![&normalized, &args.doc_id],
            )
            .map_err(|e| format!("Failed to set main_file: {}", e))?;
        }
        None => {
            conn.execute(
                "UPDATE documents SET main_file = NULL WHERE id = ?1",
                [&args.doc_id],
            )
            .map_err(|e| format!("Failed to clear main_file: {}", e))?;
        }
    }
    state.mark_dirty();
    Ok(())
}

#[tauri::command]
pub fn get_document_main_file(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<Option<String>, String> {
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    let main: Option<String> = conn
        .query_row(
            "SELECT main_file FROM documents WHERE id = ?1",
            [&doc_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    Ok(main)
}

#[tauri::command]
pub async fn compile_document_to_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<Vec<u8>, String> {
    // 1. Look up main_file (and verify doc exists).
    let main_file: Option<String> = {
        let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
        let conn = db_guard.as_mut().ok_or("Database connection lost")?;
        conn.query_row(
            "SELECT main_file FROM documents WHERE id = ?1",
            [&doc_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
    };

    let main_file = main_file.ok_or_else(|| {
        "No main file is set for this document. Set one in the file tree.".to_string()
    })?;

    let workspace = document_dir(&app, &doc_id)?;
    if !workspace.is_dir() {
        return Err(format!(
            "Document directory missing on disk: {}",
            workspace.display()
        ));
    }

    // 2. Try compile. Use a per-document filename so concurrent docs (and the
    // standalone Compiler) don't clobber a shared `output.pdf`.
    let output_name = format!("document_{}.pdf", doc_id);
    let result = crate::commands::pdf::compile_workspace_to_pdf_inner(
        app.clone(),
        workspace.to_string_lossy().to_string(),
        main_file.clone(),
        Some(output_name),
    )
    .await;

    // 3. Record status.
    let now = now_rfc3339();
    let mut db_guard = state.db.lock().map_err(|e| format!("Mutex error: {}", e))?;
    let conn = db_guard.as_mut().ok_or("Database connection lost")?;
    match &result {
        Ok(_) => {
            conn.execute(
                "UPDATE documents SET last_compiled_at = ?1, compile_status = 'success' WHERE id = ?2",
                rusqlite::params![&now, &doc_id],
            )
            .map_err(|e| format!("Failed to record compile status: {}", e))?;
        }
        Err(_) => {
            conn.execute(
                "UPDATE documents SET last_compiled_at = ?1, compile_status = 'error' WHERE id = ?2",
                rusqlite::params![&now, &doc_id],
            )
            .map_err(|e| format!("Failed to record compile status: {}", e))?;
        }
    }
    state.mark_dirty();
    result
}

/// Returns true when the file's extension is one we keep in backups.
pub fn is_text_extension(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    TEXT_BACKUP_EXTENSIONS.iter().any(|t| *t == ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_name_rejects_traversal() {
        assert!(!is_safe_name(".."));
        assert!(!is_safe_name("../escape"));
        assert!(!is_safe_name("foo/../bar"));
        assert!(!is_safe_name("foo/bar"));
        assert!(!is_safe_name("foo\\bar"));
        assert!(!is_safe_name(".hidden"));
        assert!(!is_safe_name(""));
    }

    #[test]
    fn safe_name_accepts_normal() {
        assert!(is_safe_name("main.tex"));
        assert!(is_safe_name("chapter1.tex"));
        assert!(is_safe_name("refs.bib"));
        assert!(is_safe_name("diagram.mmd"));
    }

    #[test]
    fn normalize_rel_path_blocks_absolute() {
        assert!(normalize_rel_path("/etc/passwd").is_err());
        assert!(normalize_rel_path("C:\\Windows").is_err());
    }

    #[test]
    fn normalize_rel_path_blocks_traversal() {
        assert!(normalize_rel_path("../foo").is_err());
        assert!(normalize_rel_path("a/../../b").is_err());
        assert!(normalize_rel_path("a/../b").is_err());
    }

    #[test]
    fn normalize_rel_path_accepts_normal() {
        assert_eq!(normalize_rel_path("main.tex").unwrap(), "main.tex");
        assert_eq!(normalize_rel_path("chapters/intro.tex").unwrap(), "chapters/intro.tex");
        assert_eq!(normalize_rel_path("a\\b.tex").unwrap(), "a/b.tex");
    }

    #[test]
    fn text_extension_filter() {
        assert!(is_text_extension("foo.tex"));
        assert!(is_text_extension("foo.bib"));
        assert!(is_text_extension("foo.cls"));
        assert!(is_text_extension("a/b.tex"));
        assert!(!is_text_extension("foo.png"));
        assert!(!is_text_extension("foo.jpg"));
        assert!(!is_text_extension("foo.pdf"));
        assert!(!is_text_extension("foo"));
    }
}
