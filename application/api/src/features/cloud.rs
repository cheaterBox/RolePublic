//! Cloud: S3 backup sync.
//!
//! Push/pull the local `FullBackup` blob to/from an S3-compatible bucket.
//! Credentials are read from env (encrypted at config load) and NEVER logged.

use aws_sdk_s3 as s3;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use serde::{Deserialize, Serialize};

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/cloud/test", post(test_connection))
        .route("/cloud/upload", post(upload))
        .route("/cloud/list", get(list))
        .route("/cloud/download", post(download))
}

#[derive(Debug, Serialize)]
pub struct BackupEntry {
    pub key: String,
    pub size: i64,
    pub last_modified: String,
}

fn build_client(state: &AppState) -> AppResult<s3::Client> {
    let s3cfg = state
        .config
        .s3
        .as_ref()
        .ok_or_else(|| AppError::Validation("S3 not configured (set S3_BUCKET etc.)".into()))?;

    let creds = Credentials::new(
        s3cfg.access_key.expose(),
        s3cfg.secret_key.expose(),
        None,
        None,
        "roletect",
    );

    let cfg = s3::config::Builder::new()
        .endpoint_url(s3cfg.endpoint.clone())
        .region(Region::new(s3cfg.region.clone()))
        .credentials_provider(creds)
        .force_path_style(s3cfg.force_path_style)
        .behavior_version(s3::config::BehaviorVersion::latest())
        .build();

    Ok(s3::Client::from_conf(cfg))
}

fn bucket(state: &AppState) -> AppResult<&str> {
    Ok(&state
        .config
        .s3
        .as_ref()
        .ok_or_else(|| AppError::Validation("S3 not configured".into()))?
        .bucket)
}

async fn test_connection(State(state): State<AppState>) -> AppResult<Json<serde_json::Value>> {
    let client = build_client(&state)?;
    let bucket = bucket(&state)?;
    client
        .head_bucket()
        .bucket(bucket)
        .send()
        .await
        .map_err(|e| AppError::External(format!("S3 connection failed: {}", e)))?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

async fn upload(State(state): State<AppState>) -> AppResult<Json<serde_json::Value>> {
    let backup = state.repo.export_all().await.map_err(internal)?;
    let body = serde_json::to_vec(&backup)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize: {}", e)))?;

    let client = build_client(&state)?;
    let bucket = bucket(&state)?;
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let key = format!("roletect_{}.json", timestamp);

    client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .body(ByteStream::from(body))
        .content_type("application/json")
        .send()
        .await
        .map_err(|e| AppError::External(format!("S3 upload: {}", e)))?;

    Ok(Json(serde_json::json!({ "key": key })))
}

async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<BackupEntry>>> {
    let client = build_client(&state)?;
    let bucket = bucket(&state)?;

    let response = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix("roletect_")
        .send()
        .await
        .map_err(|e| AppError::External(format!("S3 list: {}", e)))?;

    let mut entries: Vec<BackupEntry> = response
        .contents()
        .iter()
        .filter_map(|obj| {
            let key = obj.key()?.to_string();
            let size = obj.size().unwrap_or(0);
            let last_modified = obj
                .last_modified()
                .map(|t| {
                    t.fmt(aws_sdk_s3::primitives::DateTimeFormat::DateTime)
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            Some(BackupEntry {
                key,
                size,
                last_modified,
            })
        })
        .collect();
    entries.sort_by(|a, b| b.key.cmp(&a.key));
    entries.truncate(50);
    Ok(Json(entries))
}

#[derive(Deserialize)]
struct DownloadRequest {
    key: String,
}

#[derive(Serialize)]
struct DownloadResponse {
    backup: crate::models::FullBackup,
}

async fn download(
    State(state): State<AppState>,
    Json(req): Json<DownloadRequest>,
) -> AppResult<Json<DownloadResponse>> {
    let client = build_client(&state)?;
    let bucket = bucket(&state)?;

    let response = client
        .get_object()
        .bucket(bucket)
        .key(&req.key)
        .send()
        .await
        .map_err(|e| AppError::External(format!("S3 download: {}", e)))?;

    let bytes = response
        .body
        .collect()
        .await
        .map_err(|e| AppError::External(format!("S3 read: {}", e)))?
        .into_bytes()
        .to_vec();

    let backup: crate::models::FullBackup = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::Validation(format!("backup is not valid JSON: {}", e)))?;

    Ok(Json(DownloadResponse { backup }))
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}
