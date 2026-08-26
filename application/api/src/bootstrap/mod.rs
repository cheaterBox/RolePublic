//! Application bootstrap: wires config, telemetry, repository, master key,
//! router, middleware, and graceful shutdown into a running server.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::db::Repository;
use crate::error::AppError;
use crate::features;
use crate::security::crypto::load_or_create_master;
use crate::security::rate_limit::{enforce, RateLimiter};
use crate::security::{require_bearer_token, AuthState};
use crate::state::AppState;
use crate::telemetry;

/// Build the `AppState`. Loads the master key, builds the repository,
/// and runs initial schema + migrations.
pub async fn build_state(config: Config) -> Result<AppState, AppError> {
    // Derive master key from API token. This is what encrypts AI keys at rest.
    let master_key = load_or_create_master(&config.data_dir, config.auth.api_token.expose())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("master key setup failed: {}", e)))?;

    let repo: Arc<dyn Repository> = crate::db::build_repository(&config)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("db init failed: {}", e)))?;

    // Seed built-in themes + extension secret on first boot.
    crate::seed::run_seedings(repo.as_ref(), &config)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("seed failed: {}", e)))?;

    Ok(AppState {
        config: Arc::new(config),
        repo,
        master_key: Arc::new(master_key),
    })
}

/// Build the Axum router with all middleware applied.
pub fn build_router(state: AppState) -> Router {
    let auth_state = AuthState::new(state.config.auth.clone(), state.master_key.clone());
    let rate_limiter = RateLimiter::new(state.config.rate_limit_rpm);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .max_age(Duration::from_secs(3600));

    // Public health endpoint (no auth, no rate limit).
    let health = Router::new().route("/health", axum::routing::get(health_handler));

    // Public auth endpoints (/api/auth/register, /api/auth/login)
    let public_auth = Router::new()
        .route(
            "/auth/register",
            axum::routing::post(crate::features::auth::register_handler_pub),
        )
        .route(
            "/auth/login",
            axum::routing::post(crate::features::auth::login_handler_pub),
        );

    // Protected /api/* endpoints.
    let protected_api = features::all_routes()
        .layer(axum::middleware::from_fn_with_state(
            auth_state.clone(),
            require_bearer_token,
        ))
        .layer(axum::middleware::from_fn_with_state(
            rate_limiter.clone(),
            enforce,
        ));

    let api_router = public_auth.merge(protected_api);

    Router::new()
        .merge(health)
        .nest("/api", api_router)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

async fn health_handler() -> &'static str {
    "ok"
}

/// Run the server until Ctrl-C. Cleans up rate-limiter on shutdown.
pub async fn run(config: Config) -> Result<(), AppError> {
    telemetry::init();
    let bind_addr: SocketAddr = config
        .bind_addr
        .parse()
        .map_err(|_| AppError::Internal(anyhow::anyhow!("invalid BIND_ADDR")))?;

    tracing::info!(addr = %bind_addr, "roletect_api starting");

    let state = build_state(config).await?;
    let router = build_router(state);

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .map_err(AppError::Io)?;
    tracing::info!(addr = %bind_addr, "listening");

    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("server error: {}", e)))?;

    tracing::info!("shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        let mut sig = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        sig.recv().await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
    tracing::info!("shutdown signal received");
}
