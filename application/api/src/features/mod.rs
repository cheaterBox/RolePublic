//! Feature modules.
//!
//! Each module exposes a `routes(router) -> Router` function that the
//! `bootstrap` layer mounts under the `/api/*` prefix.

pub mod auth;
pub mod cloud;
pub mod collaboration;
pub mod compiler;
pub mod cover_letters;
pub mod data;
pub mod documents;
pub mod downloads;
pub mod inbox;
pub mod jobs;
pub mod pdf;
pub mod resumes;
pub mod scoring;
pub mod settings;
pub mod themes;

use axum::Router;

/// Aggregates all protected feature routers.
pub fn all_routes() -> Router<crate::AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .merge(cloud::routes())
        .merge(collaboration::routes())
        .merge(compiler::routes())
        .merge(cover_letters::routes())
        .merge(data::routes())
        .merge(documents::routes())
        .merge(downloads::routes())
        .merge(inbox::routes())
        .merge(jobs::routes())
        .merge(pdf::routes())
        .merge(resumes::routes())
        .merge(scoring::routes())
        .merge(settings::routes())
        .merge(themes::routes())
}

/// Public routes that do not require an existing Bearer token (register, login).
pub fn public_auth_routes() -> Router<crate::AppState> {
    auth::routes()
}
