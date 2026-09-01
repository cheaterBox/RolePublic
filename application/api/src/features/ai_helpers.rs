//! Shared helpers for AI endpoints: resolve api_key vault fallback, provider alias, custom_base_url.

use crate::error::AppError;
use crate::state::AppState;

/// Normalizes provider aliases (e.g. "claude" -> "anthropic").
pub fn normalize_provider(provider: &str) -> String {
    crate::ai::normalize_provider(provider)
}

/// Resolve api_key: if raw is "vault_key"/"use_saved_key"/empty, try decrypting from vault.
/// Otherwise return trimmed raw.
pub async fn resolve_api_key(state: &AppState, raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    let is_placeholder = trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("vault_key")
        || trimmed.eq_ignore_ascii_case("use_saved_key")
        || trimmed.eq_ignore_ascii_case("vault");

    if is_placeholder {
        if let Some(stored) = state
            .repo
            .get_encrypted_api_key()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?
        {
            let dec = crate::security::crypto::KeyDecryptor::new(&state.master_key);
            if let Some(plain) = dec.try_decrypt(&stored) {
                if !plain.trim().is_empty() {
                    return Ok(plain);
                }
            }
        }
        // Also fallback to app_settings key "ai_api_key" if present (legacy)
        if let Ok(val) = state.repo.get_setting("ai_api_key", "").await {
            if !val.trim().is_empty() && val != "vault_key" {
                return Ok(val);
            }
        }
        return Err(AppError::Validation(
            "api_key is required (no vault key configured)".into(),
        ));
    }
    Ok(trimmed.to_string())
}

/// Resolve custom_base_url: prefer explicit request value, else fallback to app_settings.
pub async fn resolve_base_url(state: &AppState, req_base: Option<&str>) -> Option<String> {
    if let Some(b) = req_base {
        let t = b.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    // fallback to stored setting
    if let Ok(val) = state.repo.get_setting("ai_custom_base_url", "").await {
        let t = val.trim().to_string();
        if !t.is_empty() {
            return Some(t);
        }
    }
    None
}

/// Resolve effective model: if custom model set in settings, prefer it when req model is default?
/// For now, just pass through but check for settings override when req model is placeholder.
/// Frontend now sends effective model, so this is just fallback.
pub async fn resolve_model(state: &AppState, req_model: &str) -> String {
    let trimmed = req_model.trim();
    if !trimmed.is_empty() {
        // if req_model is a generic placeholder and custom_model exists, prefer custom
        // but only if trimmed is empty fallback — keep simple: return req
        return trimmed.to_string();
    }
    if let Ok(val) = state.repo.get_setting("ai_custom_model", "").await {
        let t = val.trim().to_string();
        if !t.is_empty() {
            return t;
        }
    }
    trimmed.to_string()
}
