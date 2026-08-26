//! Application error type.
//!
//! All errors that escape to the HTTP boundary are converted to a
//! sanitized JSON response. Internal details are NEVER leaked to clients.
//! Sensitive data (API keys, tokens, S3 credentials) is stripped from
//! any error message before display.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Resource not found")]
    NotFound,

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("External service error: {0}")]
    External(String),

    #[error("Database error")] // Internal message hidden from clients
    Database(#[from] sqlx::Error),

    #[error("AI provider error")] // Internal message hidden
    Ai(String),

    #[error("LaTeX compilation failed: {0}")]
    LaTeX(String),

    #[error("IO error")] // Internal hidden
    Io(#[from] std::io::Error),

    #[error("Internal error")] // Never expose details
    Internal(#[from] anyhow::Error),
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<serde_json::Value>,
}

impl AppError {
    fn status(&self) -> StatusCode {
        match self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::External(_) => StatusCode::BAD_GATEWAY,
            AppError::LaTeX(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::Ai(_) => StatusCode::BAD_GATEWAY,
            AppError::Database(_) | AppError::Io(_) | AppError::Internal(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    fn public_code(&self) -> &'static str {
        match self {
            AppError::NotFound => "not_found",
            AppError::BadRequest(_) => "bad_request",
            AppError::Unauthorized => "unauthorized",
            AppError::Forbidden => "forbidden",
            AppError::Conflict(_) => "conflict",
            AppError::Validation(_) => "validation_error",
            AppError::External(_) => "external_service_error",
            AppError::LaTeX(_) => "latex_compilation_error",
            AppError::Ai(_) => "ai_provider_error",
            AppError::Database(_) => "internal_error",
            AppError::Io(_) => "internal_error",
            AppError::Internal(_) => "internal_error",
        }
    }

    /// The user-facing message. NEVER includes raw SQL, file paths, secrets,
    /// or stack traces.
    fn public_message(&self) -> String {
        match self {
            AppError::NotFound => "The requested resource was not found.".into(),
            AppError::BadRequest(msg) | AppError::Validation(msg) => scrub(msg),
            AppError::Unauthorized => "Authentication required.".into(),
            AppError::Forbidden => "You don't have permission to perform this action.".into(),
            AppError::Conflict(msg) => scrub(msg),
            AppError::External(msg) => scrub(msg),
            AppError::LaTeX(msg) => scrub(msg),
            AppError::Ai(msg) => {
                tracing::warn!(error = %scrub(msg), "AI provider error");
                "AI provider returned an error. Check your API key and try again.".into()
            }
            AppError::Database(e) => {
                tracing::error!(error = ?e, "Database error");
                "An internal database error occurred.".into()
            }
            AppError::Io(e) => {
                tracing::error!(error = ?e, "IO error");
                "An internal I/O error occurred.".into()
            }
            AppError::Internal(e) => {
                tracing::error!(error = ?e, "Internal error");
                "An internal server error occurred.".into()
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        let body = ErrorBody {
            error: self.public_code(),
            message: self.public_message(),
            details: None,
        };

        // Log full error server-side, but never include in response
        if status.is_server_error() {
            tracing::error!(error = ?self, "request failed");
        } else {
            tracing::debug!(error = ?self, "request rejected");
        }

        (status, Json(body)).into_response()
    }
}

impl From<crate::db::RepoError> for AppError {
    fn from(e: crate::db::RepoError) -> Self {
        match e {
            crate::db::RepoError::NotFound => AppError::NotFound,
            crate::db::RepoError::Conflict(msg) => AppError::Conflict(msg),
            crate::db::RepoError::Invalid(msg) => AppError::Validation(msg),
            other => AppError::Internal(anyhow::anyhow!(other)),
        }
    }
}

impl From<rusqlite_like::Error> for AppError {
    fn from(_: rusqlite_like::Error) -> Self {
        AppError::Internal(anyhow::anyhow!("driver-specific error"))
    }
}

/// Strip patterns that might leak credentials or internal paths.
fn scrub(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for word in s.split_whitespace() {
        let lower = word.to_lowercase();
        if lower.contains("api_key")
            || lower.contains("apikey")
            || lower.contains("token")
            || lower.contains("password")
            || lower.contains("secret")
            || lower.contains("access_key")
            || lower.contains("secret_key")
        {
            out.push_str("***REDACTED*** ");
        } else if word.starts_with('/') && word.len() > 20 {
            // Looks like a filesystem path
            out.push_str("***PATH*** ");
        } else {
            out.push_str(word);
            out.push(' ');
        }
    }
    out.trim().to_string()
}

/// Convenience Result type.
pub type AppResult<T> = Result<T, AppError>;

pub mod rusqlite_like {
    use thiserror::Error;
    #[derive(Debug, Error)]
    pub enum Error {}
}
