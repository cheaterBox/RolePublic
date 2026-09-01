//! Resumes: base templates + tailored outputs.
//!
//! Routes:
//! - GET    /api/resumes                          — list
//! - POST   /api/resumes                          — create
//! - GET    /api/resumes/:id                      — fetch detail
//! - PUT    /api/resumes/:id                      — update
//! - DELETE /api/resumes/:id                      — drop
//! - GET    /api/resumes/:id/usage                — usage count
//! - POST   /api/resumes/tailor                   — AI tailor a base resume to a job
//! - PUT    /api/resumes/tailored/:id             — update tailored content
//! - GET    /api/resumes/tailored/job/:job_id/latest — latest tailored for job

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{
    CreateResumeRequest, ResumeDetail, ResumeItem, TailorResumeRequest, TailoredContent,
};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/resumes", get(list_resumes).post(create_resume))
        .route("/resumes/tailor", post(tailor_resume))
        .route(
            "/resumes/tailored/job/{job_id}/latest",
            get(get_latest_tailored),
        )
        .route(
            "/resumes/tailored/{id}",
            get(get_tailored).put(update_tailored),
        )
        .route(
            "/resumes/{id}",
            get(get_resume).put(update_resume).delete(delete_resume),
        )
        .route("/resumes/{id}/usage", get(get_usage))
}

async fn list_resumes(State(state): State<AppState>) -> AppResult<Json<Vec<ResumeItem>>> {
    Ok(Json(state.repo.list_resumes().await.map_err(internal)?))
}

async fn get_resume(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<ResumeDetail>> {
    let detail = state
        .repo
        .get_resume(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(detail))
}

async fn create_resume(
    State(state): State<AppState>,
    Json(req): Json<CreateResumeRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let id = state
        .repo
        .create_resume(&req.name, &req.category, &req.latex_content)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "id": id })))
}

async fn update_resume(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut req): Json<ResumeDetail>,
) -> AppResult<()> {
    // URL id takes precedence over body.id to prevent mismatches.
    req.id = id;
    state.repo.update_resume(&req).await.map_err(internal)?;
    Ok(())
}

async fn delete_resume(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state.repo.delete_resume(&id).await.map_err(internal)?;
    Ok(())
}

async fn get_usage(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let count = state.repo.resume_usage_count(&id).await.map_err(internal)?;
    Ok(Json(serde_json::json!({ "count": count })))
}

async fn tailor_resume(
    State(state): State<AppState>,
    Json(req): Json<TailorResumeRequest>,
) -> AppResult<Json<TailoredContent>> {
    let api_key = crate::features::ai_helpers::resolve_api_key(&state, &req.api_key).await?;
    let provider = crate::features::ai_helpers::normalize_provider(&req.provider);
    let model = crate::features::ai_helpers::resolve_model(&state, &req.model).await;
    let base_url =
        crate::features::ai_helpers::resolve_base_url(&state, req.custom_base_url.as_deref()).await;
    let base_latex = state
        .repo
        .get_resume_latex(&req.base_resume_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let job = state
        .repo
        .get_job(&req.job_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let tailored_latex = crate::ai::tailor_latex_for_job(
        &provider,
        &model,
        &api_key,
        base_url.as_deref(),
        &base_latex,
        &job.raw_jd,
        req.custom_instruction.as_deref(),
    )
    .await
    .map_err(AppError::Ai)?;

    let id = nanoid::nanoid!(10);
    state
        .repo
        .save_tailored_resume(&id, &req.job_id, &req.base_resume_id, &tailored_latex)
        .await
        .map_err(internal)?;

    Ok(Json(TailoredContent {
        id,
        base_template_id: req.base_resume_id,
        content: tailored_latex,
    }))
}

async fn get_tailored(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<TailoredContent>> {
    let content = state
        .repo
        .get_tailored_resume(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(content))
}

async fn update_tailored(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateTailoredRequest>,
) -> AppResult<()> {
    state
        .repo
        .update_tailored_resume(&id, &body.content)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn get_latest_tailored(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> AppResult<Json<TailoredContent>> {
    let content = state
        .repo
        .get_latest_tailored_resume(&job_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(content))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(Deserialize)]
struct UpdateTailoredRequest {
    content: String,
}
