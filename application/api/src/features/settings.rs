//! Settings: key-value plus AI provider config.
//!
//! AI config is special: the API key is encrypted at rest with the master key.
//! On read, the API returns only `has_key: bool` — never the key itself.
//! On write, the user-supplied plaintext key is encrypted before storage.

use axum::{extract::State, routing::get, Json, Router};
use base64::{engine::general_purpose::STANDARD as B64, Engine};

use crate::error::{AppError, AppResult};
use crate::models::{AiConfig, SaveAiConfigRequest, SaveSettingRequest};
use crate::security::crypto::{KeyDecryptor, KeyEncryptor};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/settings/ai", get(get_ai).post(save_ai))
        .route("/settings", get(get_setting).post(save_setting))
        .route("/settings/server/active-port", get(get_port))
        .route("/settings/extension/secret", get(get_extension_secret))
}

async fn get_ai(State(state): State<AppState>) -> AppResult<Json<AiConfig>> {
    let cfg = state.repo.get_ai_config().await.map_err(internal)?;
    Ok(Json(cfg))
}

async fn save_ai(
    State(state): State<AppState>,
    Json(req): Json<SaveAiConfigRequest>,
) -> AppResult<()> {
    // Encrypt the API key before storing. Empty / missing key preserves the existing value.
    let encrypted = req
        .api_key
        .as_deref()
        .map(|k| k.trim())
        .filter(|k| !k.is_empty())
        .map(|k| {
            let enc = KeyEncryptor::new(&state.master_key);
            enc.encrypt(k)
        })
        .transpose()
        .map_err(|_| AppError::Internal(anyhow::anyhow!("encryption failed")))?;

    state
        .repo
        .save_ai_config(&req.provider, &req.model, encrypted.as_deref())
        .await
        .map_err(internal)?;
    Ok(())
}

async fn get_setting(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<GetSettingParams>,
) -> AppResult<Json<serde_json::Value>> {
    let value = state
        .repo
        .get_setting(&params.key, &params.default)
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "value": value })))
}

async fn save_setting(
    State(state): State<AppState>,
    Json(req): Json<SaveSettingRequest>,
) -> AppResult<()> {
    state
        .repo
        .save_setting(&req.key, &req.value)
        .await
        .map_err(internal)?;
    Ok(())
}

async fn get_port(State(state): State<AppState>) -> AppResult<Json<serde_json::Value>> {
    let port = state
        .repo
        .get_active_server_port()
        .await
        .map_err(internal)?;
    Ok(Json(serde_json::json!({ "port": port })))
}

async fn get_extension_secret(State(state): State<AppState>) -> AppResult<Json<serde_json::Value>> {
    let secret = state
        .repo
        .get_extension_secret()
        .await
        .map_err(internal)?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("extension secret missing")))?;
    Ok(Json(serde_json::json!({ "secret": secret })))
}

/// Helper used by other modules that need to decrypt the AI key for a session.
#[allow(dead_code)]
pub async fn decrypt_api_key(state: &AppState) -> Option<String> {
    let stored = state.repo.get_encrypted_api_key().await.ok().flatten()?;
    let dec = KeyDecryptor::new(&state.master_key);
    dec.try_decrypt(&stored)
}

/// Helper to encrypt arbitrary plaintext using the master key.
#[allow(dead_code)]
pub fn encrypt_value(state: &AppState, plaintext: &str) -> Result<String, AppError> {
    let enc = KeyEncryptor::new(&state.master_key);
    enc.encrypt(plaintext)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("encrypt failed")))
}

/// Helper to decode base64 (used by cloud feature for S3 secrets).
#[allow(dead_code)]
pub fn decode_b64(s: &str) -> Result<Vec<u8>, AppError> {
    B64.decode(s)
        .map_err(|_| AppError::Validation("invalid base64".into()))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}

#[derive(serde::Deserialize)]
struct GetSettingParams {
    key: String,
    #[serde(default)]
    default: String,
}
