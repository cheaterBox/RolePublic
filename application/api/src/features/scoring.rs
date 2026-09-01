//! Scoring: AI-evaluated resume↔job fit score.

use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{ScoreResumeRequest, ScoreResumeResult};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/scoring/score", post(score))
}

async fn score(
    State(state): State<AppState>,
    Json(req): Json<ScoreResumeRequest>,
) -> AppResult<Json<ScoreResumeResult>> {
    let api_key = crate::features::ai_helpers::resolve_api_key(&state, &req.api_key).await?;
    let provider = crate::features::ai_helpers::normalize_provider(&req.provider);
    let model = crate::features::ai_helpers::resolve_model(&state, &req.model).await;
    let base_url =
        crate::features::ai_helpers::resolve_base_url(&state, req.custom_base_url.as_deref()).await;

    let resume = state
        .repo
        .get_resume(&req.resume_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let job = state
        .repo
        .get_job(&req.job_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let result = crate::ai::score_resume_against_job(
        &provider,
        &model,
        &api_key,
        base_url.as_deref(),
        &resume.latex_content,
        &job.raw_jd,
    )
    .await
    .map_err(AppError::Ai)?;

    Ok(Json(result))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(Deserialize)]
struct _Unused {}
