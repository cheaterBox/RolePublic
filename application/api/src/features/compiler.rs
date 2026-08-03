//! Compiler: shared editor state for LaTeX documents.
//!
//! Single-row "current document" state so editors stay in sync.

use axum::{extract::State, routing::get, Json, Router};

use crate::error::{AppError, AppResult};
use crate::models::CompilerState;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/compiler/state", get(get_state).post(save_state))
}

async fn get_state(State(state): State<AppState>) -> AppResult<Json<CompilerState>> {
    let s = state.repo.get_compiler_state().await.map_err(internal)?;
    Ok(Json(s))
}

async fn save_state(
    State(state): State<AppState>,
    Json(req): Json<CompilerState>,
) -> AppResult<()> {
    state
        .repo
        .save_compiler_state(&req)
        .await
        .map_err(internal)?;
    Ok(())
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}
