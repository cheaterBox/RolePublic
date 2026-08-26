//! Themes: built-in + custom themes for the frontend.
//!
//! Routes (all under `/api/themes`):
//! - GET    /themes              — list all
//! - POST   /themes              — save custom
//! - DELETE /themes/:id          — drop custom (built-ins are protected)
//! - GET    /themes/active       — fetch active
//! - POST   /themes/active       — set active

use axum::{
    extract::{Path, State},
    routing::{delete, get},
    Json, Router,
};

use crate::error::{AppError, AppResult};
use crate::models::{SaveActiveThemeRequest, SaveCustomThemeRequest, Theme};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/themes", get(list).post(save))
        .route("/themes/active", get(get_active).post(set_active))
        .route("/themes/{id}", delete(delete_one))
}

async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<Theme>>> {
    Ok(Json(state.repo.list_themes().await.map_err(internal)?))
}

async fn save(
    State(state): State<AppState>,
    Json(req): Json<SaveCustomThemeRequest>,
) -> AppResult<()> {
    state
        .repo
        .save_custom_theme(&req.id, &req.name, &req.config)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn delete_one(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<()> {
    state.repo.delete_theme(&id).await.map_err(internal)?;
    Ok(())
}

async fn get_active(State(state): State<AppState>) -> AppResult<Json<Option<Theme>>> {
    Ok(Json(state.repo.get_active_theme().await.map_err(internal)?))
}

async fn set_active(
    State(state): State<AppState>,
    Json(req): Json<SaveActiveThemeRequest>,
) -> AppResult<()> {
    state
        .repo
        .save_active_theme(&req.theme_id)
        .await
        .map_err(internal)?;
    Ok(())
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}
