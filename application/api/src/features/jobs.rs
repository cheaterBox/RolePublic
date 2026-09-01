//! Jobs: the core entity — one row per job application.
//!
//! Routes (all under `/api/jobs`):
//! - GET    /jobs                — list all
//! - GET    /jobs/:id            — fetch single
//! - POST   /jobs                — create / upsert
//! - DELETE /jobs/:id            — drop (and cascade children)
//! - DELETE /jobs/batch          — drop multiple
//! - DELETE /jobs/all            — drop everything
//! - POST   /jobs/:id/status     — update status (+ optional metadata)
//! - POST   /jobs/:id/metadata   — update a single metadata field
//! - GET    /jobs/:id/jd         — fetch raw JD + structured fields

use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::models::JobPayload;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/jobs", get(list_jobs).post(save_job))
        .route("/jobs/all", delete(delete_all))
        .route("/jobs/batch", post(delete_batch))
        .route("/jobs/parse", post(parse_jd))
        .route("/jobs/{id}", get(get_job).delete(delete_job))
        .route("/jobs/{id}/status", post(update_status))
        .route("/jobs/{id}/metadata", post(update_metadata))
        .route("/jobs/{id}/jd", get(get_jd))
}

async fn list_jobs(State(state): State<AppState>) -> AppResult<Json<Vec<JobPayload>>> {
    Ok(Json(state.repo.list_jobs().await.map_err(internal)?))
}

async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<JobPayload>> {
    let job = state
        .repo
        .get_job(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(job))
}

async fn save_job(State(state): State<AppState>, Json(job): Json<JobPayload>) -> AppResult<()> {
    if job.id.is_empty() {
        return Err(AppError::Validation("job.id is required".into()));
    }
    state.repo.save_job(&job).await.map_err(internal)?;
    Ok(())
}

async fn delete_job(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state.repo.delete_job(&id).await.map_err(internal)?;
    Ok(())
}

async fn delete_batch(
    State(state): State<AppState>,
    Json(body): Json<BatchDeleteRequest>,
) -> AppResult<()> {
    state
        .repo
        .delete_jobs_batch(&body.ids)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn delete_all(State(state): State<AppState>) -> AppResult<()> {
    state.repo.delete_all_jobs().await.map_err(internal)?;
    Ok(())
}

async fn update_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> AppResult<()> {
    state
        .repo
        .update_job_status(&id, &body.status, body.metadata.as_ref())
        .await
        .map_err(internal)?;
    Ok(())
}

async fn update_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateMetadataRequest>,
) -> AppResult<()> {
    state
        .repo
        .update_job_metadata(&id, &body.field, &body.value)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn get_jd(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let row = state
        .repo
        .get_job_raw_jd(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(serde_json::json!({
        "raw_jd": row.0,
        "requirements": row.1,
        "core_responsibilities": row.2,
    })))
}

async fn parse_jd(
    State(state): State<AppState>,
    Json(req): Json<ParseRequest>,
) -> AppResult<Json<crate::ai::JobParseResult>> {
    let api_key = crate::features::ai_helpers::resolve_api_key(&state, &req.api_key).await?;
    let provider = crate::features::ai_helpers::normalize_provider(&req.provider);
    let model = crate::features::ai_helpers::resolve_model(&state, &req.model).await;
    let base_url =
        crate::features::ai_helpers::resolve_base_url(&state, req.custom_base_url.as_deref()).await;
    let result = crate::ai::parse_job_description(
        &provider,
        &model,
        &api_key,
        base_url.as_deref(),
        &req.raw_jd,
        req.job_url.as_deref(),
    )
    .await
    .map_err(crate::error::AppError::Ai)?;
    Ok(Json(result))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(Deserialize)]
struct BatchDeleteRequest {
    ids: Vec<String>,
}

#[derive(Deserialize)]
struct UpdateStatusRequest {
    status: String,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Deserialize)]
struct UpdateMetadataRequest {
    field: String,
    value: String,
}

#[derive(Deserialize)]
struct ParseRequest {
    provider: String,
    model: String,
    api_key: String,
    raw_jd: String,
    #[serde(default)]
    job_url: Option<String>,
    #[serde(default)]
    custom_base_url: Option<String>,
}
