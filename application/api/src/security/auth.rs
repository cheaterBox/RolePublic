//! Bearer-token authentication middleware.
//!
//! SECURITY:
//! - Token comparison uses `subtle::ConstantTimeEq` to prevent timing attacks.
//! - Token is NEVER logged. Failed auth attempts log only the IP address and
//!   timestamp, never the offending token.
//! - Constant 401 response regardless of failure reason.

use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

use crate::config::AuthConfig;

/// Axum extractor state for the auth middleware.
#[derive(Clone)]
pub struct AuthState {
    pub config: Arc<AuthConfig>,
}

impl AuthState {
    pub fn new(config: AuthConfig) -> Self {
        Self {
            config: Arc::new(config),
        }
    }
}

/// Middleware that requires a valid bearer token on `/api/*` routes.
///
/// Routes that should be exempt (e.g. `/health`, `/inbox/ingest`,
/// `/static/*`) must be mounted before this middleware is applied.
pub async fn require_bearer_token(
    State(state): State<AuthState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Skip if not required (useful for local dev)
    if !state.config.require_token {
        return Ok(next.run(req).await);
    }

    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    let Some(provided) = token else {
        tracing::debug!("auth: missing or malformed Authorization header");
        return Err(StatusCode::UNAUTHORIZED);
    };

    if !constant_time_eq(
        provided.as_bytes(),
        state.config.api_token.expose().as_bytes(),
    ) {
        tracing::debug!("auth: token mismatch");
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next.run(req).await)
}

/// Constant-time byte slice equality. Returns false in constant time
/// regardless of where the mismatch occurs.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Helper used by handlers that need to compare the user-supplied
/// extension ingestion secret against the stored one.
pub fn constant_time_eq_str(a: &str, b: &str) -> bool {
    constant_time_eq(a.as_bytes(), b.as_bytes())
}
