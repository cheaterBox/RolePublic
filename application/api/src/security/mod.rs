//! Security middleware and helpers.
//!
//! This module is the only place that touches secrets. Components:
//!
//! - `auth.rs`       — bearer-token middleware. Token comparison uses
//!   constant-time equality. Token is NEVER logged.
//! - `crypto.rs`     — AES-GCM encryption for at-rest API keys in the DB.
//!   Master key derived from ROLETECT_API_TOKEN via Argon2.
//! - `rate_limit.rs` — per-IP token bucket (in-memory). Defends against
//!   brute-force auth attempts.
//!
//! SECURITY INVARIANTS:
//! - No secret ever appears in a log line, error response, or panic message.
//! - All secret comparison uses constant-time equality.
//! - All secrets are zeroized when dropped.

pub mod auth;
pub mod crypto;
pub mod rate_limit;

pub use auth::{require_bearer_token, AuthState};
pub use crypto::{KeyDecryptor, KeyEncryptor, MasterKey};
pub use rate_limit::RateLimiter;
