//! Data: full-database export / import (S3 round-trip).
//!
//! SECURITY: the AI API key is excluded from exports. Encrypted-at-rest keys
//! never leave this machine.

use axum::{
    extract::State,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};

use crate::error::{AppError, AppResult};
use crate::models::FullBackup;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/data/export", get(export))
        .route("/data/import", post(import))
}

async fn export(State(state): State<AppState>) -> AppResult<Response> {
    let backup = state.repo.export_all().await.map_err(internal)?;
    let body = serde_json::to_vec(&backup)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize: {}", e)))?;

    let mut resp = (StatusCode::OK, body).into_response();
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    resp.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"roletect-backup.json\""),
    );
    Ok(resp)
}

async fn import(
    State(state): State<AppState>,
    Json(body): Json<FullBackup>,
) -> AppResult<Json<serde_json::Value>> {
    state.repo.import_all(&body).await.map_err(internal)?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}
