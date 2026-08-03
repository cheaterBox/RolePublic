//! Downloads: history of compiled outputs.

use axum::{extract::State, routing::get, Json, Router};

use crate::error::{AppError, AppResult};
use crate::models::{DownloadRecord, RecordDownloadRequest};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/downloads", get(list).post(record))
}

async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<DownloadRecord>>> {
    Ok(Json(state.repo.list_downloads().await.map_err(internal)?))
}

async fn record(
    State(state): State<AppState>,
    Json(req): Json<RecordDownloadRequest>,
) -> AppResult<()> {
    state
        .repo
        .record_download(
            &req.filename,
            &req.download_type,
            req.job_id.as_deref(),
            req.content_id.as_deref(),
        )
        .await
        .map_err(internal)?;
    Ok(())
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}
