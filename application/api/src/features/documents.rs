//! Documents: multi-file LaTeX workspaces.
//!
//! Routes (all under `/api/documents`):
//! - GET    /documents                          — list
//! - POST   /documents                          — create doc
//! - GET    /documents/:id                      — fetch metadata
//! - PUT    /documents/:id                      — update metadata
//! - DELETE /documents/:id                      — drop doc (cascades files)
//! - DELETE /documents/batch                    — drop multiple
//! - POST   /documents/:id/main                 — set main file
//! - GET    /documents/:id/main                 — get main file
//! - GET    /documents/:id/files                — list files
//! - POST   /documents/:id/files/read           — read file content
//! - POST   /documents/:id/files/write          — write/create file
//! - POST   /documents/:id/files/create         — create empty file
//! - POST   /documents/:id/files/delete         — delete file
//! - POST   /documents/:id/files/rename         — rename file

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{
    CreateDocumentRequest, DocumentFileEntry, DocumentSummary, UpdateDocumentRequest,
};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/documents", get(list).post(create))
        .route("/documents/batch", post(delete_batch))
        .route("/documents/{id}/main", get(get_main).post(set_main))
        .route("/documents/{id}/files", get(list_files))
        .route("/documents/{id}/files/read", post(read_file))
        .route("/documents/{id}/files/write", post(write_file))
        .route("/documents/{id}/files/create", post(create_file))
        .route("/documents/{id}/files/delete", post(delete_file))
        .route("/documents/{id}/files/rename", post(rename_file))
        .route("/documents/{id}/files/exists", post(file_exists))
        .route(
            "/documents/{id}",
            get(get_one).put(update_one).delete(delete_one),
        )
}

async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<DocumentSummary>>> {
    Ok(Json(state.repo.list_documents().await.map_err(internal)?))
}

async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<DocumentSummary>> {
    let doc = state
        .repo
        .get_document(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(doc))
}

async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateDocumentRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let id = state
        .repo
        .create_document(
            &req.title,
            req.description.as_deref().unwrap_or(""),
            req.tags.as_deref().unwrap_or(""),
            req.starred.unwrap_or(false),
        )
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "id": id })))
}

async fn update_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDocumentRequest>,
) -> AppResult<()> {
    state
        .repo
        .update_document(
            &id,
            req.title.as_deref(),
            req.description.as_deref(),
            req.tags.as_deref(),
            req.starred,
        )
        .await
        .map_err(internal)?;
    Ok(())
}

async fn delete_one(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state.repo.delete_document(&id).await.map_err(internal)?;
    Ok(())
}

async fn delete_batch(
    State(state): State<AppState>,
    Json(body): Json<BatchDeleteRequest>,
) -> AppResult<()> {
    state
        .repo
        .delete_documents_batch(&body.ids)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn set_main(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SetMainRequest>,
) -> AppResult<()> {
    state
        .repo
        .set_document_main_file(&id, body.rel_path.as_deref())
        .await
        .map_err(internal)?;
    Ok(())
}

async fn get_main(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let main = state
        .repo
        .get_document_main_file(&id)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "rel_path": main })))
}

async fn list_files(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<DocumentFileEntry>>> {
    Ok(Json(
        state
            .repo
            .list_document_files(&id)
            .await
            .map_err(internal)?,
    ))
}

async fn read_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RelPathRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let content = state
        .repo
        .read_document_file(&id, &body.rel_path)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(serde_json::json!({ "content": content })))
}

async fn write_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<WriteFileRequest>,
) -> AppResult<()> {
    state
        .repo
        .write_document_file(&id, &body.rel_path, &body.content)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn create_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateFileRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    let exists = state
        .repo
        .document_file_exists(&id, body.parent_rel.as_deref(), name)
        .await
        .map_err(internal)?;
    if exists {
        return Err(AppError::Conflict(format!(
            "file '{}' already exists",
            name
        )));
    }
    let path = match body.parent_rel.as_deref() {
        Some(p) if !p.is_empty() => format!("{}/{}", p, name),
        _ => name.to_string(),
    };
    let content = body.content.unwrap_or_default();
    state
        .repo
        .write_document_file(&id, &path, &content)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "rel_path": path })))
}

async fn delete_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RelPathRequest>,
) -> AppResult<()> {
    state
        .repo
        .delete_document_file(&id, &body.rel_path)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn rename_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RenameRequest>,
) -> AppResult<Json<serde_json::Value>> {
    state
        .repo
        .rename_document_file(&id, &body.rel_path, &body.new_name)
        .await
        .map_err(internal)?;
    let new_path = if let Some(idx) = body.rel_path.rfind('/') {
        format!("{}/{}", &body.rel_path[..idx], body.new_name)
    } else {
        body.new_name.clone()
    };
    Ok(Json(serde_json::json!({ "rel_path": new_path })))
}

async fn file_exists(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FileExistsRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let exists = state
        .repo
        .document_file_exists(&id, body.parent_rel.as_deref(), &body.name)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "exists": exists })))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(Deserialize)]
struct BatchDeleteRequest {
    ids: Vec<String>,
}

#[derive(Deserialize)]
struct SetMainRequest {
    #[serde(default)]
    rel_path: Option<String>,
}

#[derive(Deserialize)]
struct RelPathRequest {
    rel_path: String,
}

#[derive(Deserialize)]
struct WriteFileRequest {
    rel_path: String,
    content: String,
}

#[derive(Deserialize)]
struct CreateFileRequest {
    #[serde(default)]
    parent_rel: Option<String>,
    name: String,
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct RenameRequest {
    rel_path: String,
    new_name: String,
}

#[derive(Deserialize)]
struct FileExistsRequest {
    #[serde(default)]
    parent_rel: Option<String>,
    name: String,
}
