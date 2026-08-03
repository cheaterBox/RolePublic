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
    let api_key = req.api_key.trim();
    if api_key.is_empty() {
        return Err(AppError::Validation("api_key is required".into()));
    }

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
        &req.provider,
        &req.model,
        api_key,
        None,
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
