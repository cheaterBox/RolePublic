//! Cover Letters: same structure as Resumes.
//!
//! Routes mirror /api/resumes/* exactly so the frontend can reuse views.

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{
    CoverLetterDetail, CoverLetterItem, CreateCoverLetterRequest, TailorCoverLetterRequest,
    TailoredContent,
};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/cover_letters", get(list).post(create))
        .route("/cover_letters/tailor", post(tailor))
        .route(
            "/cover_letters/tailored/job/{job_id}/latest",
            get(get_latest_tailored),
        )
        .route(
            "/cover_letters/tailored/{id}",
            get(get_tailored).put(update_tailored),
        )
        .route(
            "/cover_letters/{id}",
            get(get_one).put(update).delete(delete_one),
        )
        .route("/cover_letters/{id}/usage", get(get_usage))
}

async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<CoverLetterItem>>> {
    Ok(Json(
        state.repo.list_cover_letters().await.map_err(internal)?,
    ))
}

async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<CoverLetterDetail>> {
    let detail = state
        .repo
        .get_cover_letter(&id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(detail))
}

async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateCoverLetterRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let id = state
        .repo
        .create_cover_letter(&req.name, &req.category, &req.latex_content)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "id": id })))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut req): Json<CoverLetterDetail>,
) -> AppResult<()> {
    req.id = id;
    state
        .repo
        .update_cover_letter(&req)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn delete_one(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state
        .repo
        .delete_cover_letter(&id)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn get_usage(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let count = state
        .repo
        .cover_letter_usage_count(&id)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "count": count })))
}

async fn tailor(
    State(state): State<AppState>,
    Json(req): Json<TailorCoverLetterRequest>,
) -> AppResult<Json<TailoredContent>> {
    let api_key = req.api_key.trim();
    if api_key.is_empty() {
        return Err(AppError::Validation("api_key is required".into()));
    }
    let base_latex = state
        .repo
        .get_cover_letter_latex(&req.base_cl_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let job = state
        .repo
        .get_job(&req.job_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let tailored_latex = crate::ai::tailor_latex_for_cover_letter(
        &req.provider,
        &req.model,
        api_key,
        None,
        &base_latex,
        &job.raw_jd,
        req.custom_instruction.as_deref(),
    )
    .await
    .map_err(AppError::Ai)?;

    let id = nanoid::nanoid!(10);
    state
        .repo
        .save_tailored_cover_letter(&id, &req.job_id, &req.base_cl_id, &tailored_latex)
        .await
        .map_err(internal)?;

    Ok(Json(TailoredContent {
        id,
        base_template_id: req.base_cl_id,
        content: tailored_latex,
    }))
}

async fn get_tailored(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<TailoredContent>> {
    let content = state
        .repo
        .get_tailored_cover_letter(&id)
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
        .update_tailored_cover_letter(&id, &body.content)
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
        .get_latest_tailored_cover_letter(&job_id)
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
