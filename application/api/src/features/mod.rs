//! Feature modules.
//!
//! Each module exposes a `routes(router) -> Router` function that the
//! `bootstrap` layer mounts under the `/api/*` prefix. Features are
//! self-contained: they own their DTOs, services, and route handlers.
//!
//! Cross-feature dependencies go through the `AppState` (repository,
//! master key, config) — features never reach into each other's modules.

pub mod cloud;
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

/// Aggregates all feature routers. The caller (bootstrap) is responsible
/// for adding the auth + rate-limit middleware layers.
pub fn all_routes() -> Router<crate::AppState> {
    Router::new()
        .merge(cloud::routes())
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
