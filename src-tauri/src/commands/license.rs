//! Lemon Squeezy license verification API commands.
//!
//! Note: Sensitive license credentials (license key, instance ID, validation timestamps)
//! are stored in the OS-level encrypted Stronghold keyring via the frontend settings store,
//! keeping them strictly out of unencrypted SQLite databases.

use serde::{Deserialize, Serialize};

// Build-time constants — never hardcode these in source.
// Set LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_PRODUCT_ID in your CI secrets.
const _LS_STORE_ID: &str = env!("LS_STORE_ID");
const _LS_PRODUCT_ID: &str = env!("LS_PRODUCT_ID");

const LS_API_BASE: &str = env!("LS_API_BASE");

#[inline]
fn activate_url() -> String {
    format!("{LS_API_BASE}/activate")
}

#[inline]
fn validate_url() -> String {
    format!("{LS_API_BASE}/validate")
}

#[inline]
fn deactivate_url() -> String {
    format!("{LS_API_BASE}/deactivate")
}

/// Generous 120-second timeout to handle slow mobile tethering/satellite connections
const HTTP_TIMEOUT_SECS: u64 = 120;

// ─── Response DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LicenseStatus {
    pub activated: bool,
    pub valid: bool,
    /// "active" | "inactive" | "expired" | "disabled" | "none"
    pub status: String,
    pub trial: bool,
    pub trial_ends_at: Option<String>,
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub license_key: Option<String>,
    pub instance_id: Option<String>,
}

#[derive(Deserialize, Debug)]
struct LsLicenseMeta {
    status: String,
    #[serde(default)]
    is_trial: bool,
    expires_at: Option<String>,
}

#[derive(Deserialize, Debug)]
struct LsCustomer {
    name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize, Debug)]
struct LsMeta {
    customer_name: Option<String>,
    customer_email: Option<String>,
}

#[derive(Deserialize, Debug)]
struct LsInstance {
    id: String,
}

#[derive(Deserialize, Debug)]
struct LsActivateResponse {
    activated: Option<bool>,
    error: Option<String>,
    license_key: Option<LsLicenseMeta>,
    instance: Option<LsInstance>,
    customer: Option<LsCustomer>,
    meta: Option<LsMeta>,
    trial_ends_at: Option<String>,
}

#[derive(Deserialize, Debug)]
struct LsValidateResponse {
    valid: Option<bool>,
    #[allow(dead_code)]
    error: Option<String>,
    license_key: Option<LsLicenseMeta>,
    #[allow(dead_code)]
    instance: Option<LsInstance>,
    customer: Option<LsCustomer>,
    meta: Option<LsMeta>,
    trial_ends_at: Option<String>,
}

#[derive(Deserialize, Debug)]
struct LsDeactivateResponse {
    deactivated: Option<bool>,
    error: Option<String>,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Activate a Lemon Squeezy license key for this machine.
#[tauri::command]
pub async fn activate_license_api(license_key: String) -> Result<LicenseStatus, String> {
    let license_key = license_key.trim().to_string();
    if license_key.is_empty() {
        return Err("License key cannot be empty.".into());
    }

    // Uniquely identify this device; fall back to a random ID in sandboxed envs.
    let machine_id = machine_uid::get().unwrap_or_else(|_| nanoid::nanoid!(16));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .post(activate_url())
        .header("Accept", "application/json")
        .form(&[
            ("license_key", license_key.as_str()),
            ("instance_name", machine_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let data: LsActivateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse activation response: {e}"))?;

    if let Some(ref err) = data.error {
        return Err(err.clone());
    }
    if data.activated != Some(true) {
        return Err("License activation failed. Please verify your key.".into());
    }

    let instance_id = data
        .instance
        .as_ref()
        .map(|i| i.id.clone())
        .ok_or("Activation response missing instance ID.")?;

    let lk_meta = data
        .license_key
        .as_ref()
        .ok_or("Activation response missing license metadata.")?;

    let customer_name = data
        .customer
        .as_ref()
        .and_then(|c| c.name.clone())
        .or_else(|| data.meta.as_ref().and_then(|m| m.customer_name.clone()));

    let customer_email = data
        .customer
        .as_ref()
        .and_then(|c| c.email.clone())
        .or_else(|| data.meta.as_ref().and_then(|m| m.customer_email.clone()));

    let trial_ends_at = data.trial_ends_at.or_else(|| lk_meta.expires_at.clone());

    Ok(LicenseStatus {
        activated: true,
        valid: true,
        status: lk_meta.status.clone(),
        trial: lk_meta.is_trial,
        trial_ends_at,
        customer_name,
        customer_email,
        license_key: Some(license_key),
        instance_id: Some(instance_id),
    })
}

/// Validate an already-activated license key and instance with Lemon Squeezy.
#[tauri::command]
pub async fn validate_license_api(
    license_key: String,
    instance_id: String,
) -> Result<LicenseStatus, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let lk = license_key.trim().to_string();
    let iid = instance_id.trim().to_string();

    let resp = client
        .post(validate_url())
        .header("Accept", "application/json")
        .form(&[("license_key", lk.as_str()), ("instance_id", iid.as_str())])
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let data: LsValidateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse validation response: {e}"))?;

    let valid = data.valid == Some(true);
    let lk_meta = data.license_key.as_ref();

    let customer_name = data
        .customer
        .as_ref()
        .and_then(|c| c.name.clone())
        .or_else(|| data.meta.as_ref().and_then(|m| m.customer_name.clone()));

    let customer_email = data
        .customer
        .as_ref()
        .and_then(|c| c.email.clone())
        .or_else(|| data.meta.as_ref().and_then(|m| m.customer_email.clone()));

    let trial_ends_at = data
        .trial_ends_at
        .or_else(|| lk_meta.and_then(|m| m.expires_at.clone()));

    Ok(LicenseStatus {
        activated: true,
        valid,
        status: lk_meta
            .map(|m| m.status.clone())
            .unwrap_or_else(|| "unknown".into()),
        trial: lk_meta.map(|m| m.is_trial).unwrap_or(false),
        trial_ends_at,
        customer_name,
        customer_email,
        license_key: Some(lk),
        instance_id: Some(iid),
    })
}

/// Deactivate a license instance on Lemon Squeezy and verify server confirmation.
#[tauri::command]
pub async fn deactivate_license_api(
    license_key: String,
    instance_id: String,
) -> Result<bool, String> {
    let lk = license_key.trim().to_string();
    let iid = instance_id.trim().to_string();

    if lk.is_empty() || iid.is_empty() {
        return Err("Missing license key or instance ID for deactivation.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .post(deactivate_url())
        .header("Accept", "application/json")
        .form(&[("license_key", lk.as_str()), ("instance_id", iid.as_str())])
        .send()
        .await
        .map_err(|e| format!("Network error connecting to Lemon Squeezy: {e}"))?;

    let data: LsDeactivateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Lemon Squeezy response: {e}"))?;

    if let Some(ref err) = data.error {
        return Err(format!("Lemon Squeezy error: {err}"));
    }

    if data.deactivated == Some(true) {
        Ok(true)
    } else {
        Err("Lemon Squeezy was unable to deactivate this instance.".into())
    }
}
