//! Roletect VPS API.
//!
//! Module layout (feature-based):
//!
//! ```text
//! bootstrap    — app wiring & startup
//! config       — typed env loading + SecretString
//! telemetry    — tracing + redaction
//! error        — AppError → JSON response
//! models       — DTOs (wire format)
//! db           — Repository trait + per-driver impls
//! security     — auth, crypto, rate limit
//! ai           — LLM provider dispatch
//! features/
//!   inbox/, jobs/, resumes/, cover_letters/,
//!   documents/, themes/, settings/, compiler/,
//!   downloads/, pdf/, scoring/, data/, cloud/
//! ```
//!
//! SECURITY INVARIANTS:
//! - No secret (API key, token, password) appears in any log line, error
//!   response, or panic message.
//! - All secret comparison uses constant-time equality.
//! - All secrets in memory are zeroized on drop.

pub mod ai;
pub mod bootstrap;
pub mod config;
pub mod db;
pub mod error;
pub mod features;
pub mod models;
pub mod security;
pub mod seed;
pub mod state;
pub mod telemetry;

pub use error::{AppError, AppResult};
pub use state::AppState;
