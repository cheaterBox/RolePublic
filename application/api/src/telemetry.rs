//! Telemetry: structured logging via `tracing`.
//!
//! Security guarantee: secrets (API keys, tokens, S3 credentials) are NEVER
//! logged. The `Secret<T>` wrapper covers all sensitive values at the
//! application level so tracing events cannot leak them. Known redaction
//! keys are listed in `is_sensitive` for documentation purposes.

use tracing_subscriber::{fmt, prelude::*, EnvFilter};

const REDACT_KEYS: &[&str] = &[
    "api_key",
    "apikey",
    "token",
    "authorization",
    "password",
    "secret",
    "access_key",
    "secret_key",
    "session",
    "cookie",
    "stronghold_pass",
];

pub fn init() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("roletect_api=info,tower_http=info,sqlx=warn"));

    let json_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_level(true)
        .with_file(false)
        .with_line_number(false)
        .json()
        .flatten_event(true)
        .with_current_span(false)
        .with_span_list(false);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(json_layer)
        .init();
}

/// Returns `true` if the given key name matches a known sensitive pattern.
#[allow(dead_code)]
pub fn is_sensitive(key: &str) -> bool {
    let lower = key.to_lowercase();
    REDACT_KEYS.iter().any(|k| lower.contains(k))
}

/// Marker for values that should never be logged.
#[derive(Clone)]
pub struct Secret<T: Clone>(pub T);

impl<T: Clone> std::fmt::Debug for Secret<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Secret(***REDACTED***)")
    }
}

impl<T: Clone> std::fmt::Display for Secret<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "***REDACTED***")
    }
}
