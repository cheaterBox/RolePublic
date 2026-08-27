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
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::models::{InboxJob, IngestPayload};
use crate::security::auth::constant_time_eq_str;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/inbox", get(list_inbox))
        .route("/inbox/all", delete(delete_all_inbox))
        .route("/inbox/ingest", post(ingest))
        .route("/inbox/{id}", get(get_inbox).delete(delete_inbox))
        .route("/inbox/{id}/process", post(mark_processed))
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
///
/// Response shape mirrors the embedded Tauri Axum server in `src-tauri/src/server.rs`
/// so the same browser extension works against either target.
#[derive(Serialize, Deserialize, Debug)]
pub struct ExtensionResponse {
    pub status: String,
    pub message: String,
}

/// Public re-export of the ingest handler so `bootstrap/mod.rs` can mount it at
/// the root path (no `/api` prefix) to match the desktop's embedded server.
pub async fn public_ingest(
    State(state): State<AppState>,
    Json(payload): Json<IngestPayload>,
) -> (StatusCode, Json<ExtensionResponse>) {
    let stored = match state.repo.get_extension_secret().await {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExtensionResponse {
                    status: "error".to_string(),
                    message: "extension secret not initialized".to_string(),
                }),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExtensionResponse {
                    status: "error".to_string(),
                    message: format!("Database error: {}", e),
                }),
            );
        }
    };

    if !constant_time_eq_str(&payload.secret, &stored) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ExtensionResponse {
                status: "error".to_string(),
                message: "Invalid secret key".to_string(),
            }),
        );
    }

    match state
        .repo
        .ingest_inbox(payload.url.as_deref(), &payload.raw_description)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(ExtensionResponse {
                status: "success".to_string(),
                message: "Job ingested into vault".to_string(),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ExtensionResponse {
                status: "error".to_string(),
                message: format!("Database error: {}", e),
            }),
        ),
    }
}

/// `/api/inbox/ingest` — protected by bearer token, used by the web frontend.
async fn ingest(
    State(state): State<AppState>,
    Json(payload): Json<IngestPayload>,
) -> AppResult<Json<Value>> {
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
    Ok(Json(json!({ "status": "ok" })))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(Deserialize)]
struct _Empty {}
