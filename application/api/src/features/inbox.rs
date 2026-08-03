//! Inbox: jobs ingested from the browser extension.
//!
//! Routes:
//! - GET    /api/inbox              — list all inbox jobs
//! - GET    /api/inbox/:id          — fetch single
//! - DELETE /api/inbox/:id          — drop one
//! - DELETE /api/inbox/all          — drop all
//! - POST   /api/inbox/ingest       — extension endpoint (requires extension secret)
//! - POST   /api/inbox/:id/process  — mark processed

use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{InboxJob, IngestPayload};
use crate::security::auth::constant_time_eq_str;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/inbox", get(list_inbox))
        .route("/inbox/all", delete(delete_all_inbox))
        .route("/inbox/ingest", post(ingest))
        .route("/inbox/:id", get(get_inbox).delete(delete_inbox))
        .route("/inbox/:id/process", post(mark_processed))
}

async fn list_inbox(State(state): State<AppState>) -> AppResult<Json<Vec<InboxJob>>> {
    let items = state.repo.list_inbox().await.map_err(internal)?;
    Ok(Json(items))
}

async fn get_inbox(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<InboxJob>> {
    let item = state
        .repo
        .get_inbox(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(item))
}

async fn delete_inbox(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state.repo.delete_inbox(&id).await.map_err(internal)?;
    Ok(())
}

async fn delete_all_inbox(State(state): State<AppState>) -> AppResult<()> {
    state.repo.delete_all_inbox().await.map_err(internal)?;
    Ok(())
}

async fn mark_processed(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state
        .repo
        .mark_inbox_processed(&id)
        .await
        .map_err(internal)?;
    Ok(())
}

/// Extension ingestion endpoint.
///
/// Auth: separate secret (NOT the API token) shared with the browser extension.
/// Constant-time comparison to prevent timing attacks.
async fn ingest(
    State(state): State<AppState>,
    Json(payload): Json<IngestPayload>,
) -> AppResult<Json<serde_json::Value>> {
    let stored = state
        .repo
        .get_extension_secret()
        .await
        .map_err(internal)?
        .ok_or(AppError::Internal(anyhow::anyhow!(
            "extension secret not initialized"
        )))?;

    if !constant_time_eq_str(&payload.secret, &stored) {
        tracing::debug!("ingest: extension secret mismatch");
        return Err(AppError::Unauthorized);
    }

    state
        .repo
        .ingest_inbox(payload.url.as_deref(), &payload.raw_description)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(Deserialize)]
struct _Empty {}
