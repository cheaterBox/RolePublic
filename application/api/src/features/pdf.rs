//! PDF: LaTeX → PDF compilation using Tectonic.
//!
//! Routes (all under `/api/pdf`):
//! - POST /pdf/compile           — compile raw LaTeX, return PDF bytes
//! - POST /pdf/refine            — AI refines current LaTeX
//! - POST /pdf/fix               — AI fixes broken LaTeX
//! - POST /pdf/compile-document  — compile a multi-file document by ID

use axum::{
    body::Bytes,
    extract::State,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use std::fmt::Arguments;
use tectonic::driver::{OutputFormat, ProcessingSessionBuilder};
use tectonic::status::{MessageKind, StatusBackend};

use crate::error::{AppError, AppResult};
use crate::models::{
    CompileDocumentRequest, CompileLatexRequest, FixLatexRequest, RefineLatexRequest,
};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/pdf/compile", post(compile_latex))
        .route("/pdf/compile-document", post(compile_document))
        .route("/pdf/refine", post(refine_latex))
        .route("/pdf/fix", post(fix_latex))
}

/// Tectonic status backend that captures all output (errors, warnings, notes).
struct CapturingStatusBackend {
    logs: String,
}

impl CapturingStatusBackend {
    fn new() -> Self {
        Self {
            logs: String::new(),
        }
    }
}

impl StatusBackend for CapturingStatusBackend {
    fn report(&mut self, kind: MessageKind, args: Arguments, err: Option<&anyhow::Error>) {
        let prefix = match kind {
            MessageKind::Error => "error: ",
            MessageKind::Warning => "warning: ",
            MessageKind::Note => "note: ",
        };
        self.logs.push_str(prefix);
        self.logs.push_str(&format!("{}", args));
        if let Some(e) = err {
            self.logs.push_str(&format!(" (detail: {})", e));
        }
        self.logs.push('\n');
    }

    fn dump_error_logs(&mut self, logs: &[u8]) {
        if let Ok(s) = std::str::from_utf8(logs) {
            self.logs.push_str("--- Underlying Error Logs ---\n");
            self.logs.push_str(s);
            self.logs.push('\n');
        }
    }
}

/// Compile a raw LaTeX string to a PDF, returning the bytes.
async fn compile_latex(
    State(state): State<AppState>,
    Json(req): Json<CompileLatexRequest>,
) -> AppResult<Response> {
    if req.latex_content.trim().is_empty() {
        return Err(AppError::Validation("latex_content is required".into()));
    }
    let latex = req.latex_content;
    let cache_dir = state.config.tectonic_cache_dir.clone();
    let filename = req.filename;
    let bytes = tokio::task::spawn_blocking(move || compile_string(latex, cache_dir))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("join error: {}", e)))?
        .map_err(AppError::LaTeX)?;
    Ok(pdf_response(bytes, filename.as_deref()))
}

async fn refine_latex(Json(req): Json<RefineLatexRequest>) -> AppResult<Json<serde_json::Value>> {
    let api_key = req.api_key.trim();
    if api_key.is_empty() {
        return Err(AppError::Validation("api_key is required".into()));
    }
    let result = crate::ai::refine_tailored_resume(
        &req.provider,
        &req.model,
        api_key,
        None,
        &req.current_latex,
        &req.instruction,
    )
    .await
    .map_err(AppError::Ai)?;
    Ok(Json(serde_json::json!({ "latex": result })))
}

async fn fix_latex(Json(req): Json<FixLatexRequest>) -> AppResult<Json<serde_json::Value>> {
    let api_key = req.api_key.trim();
    if api_key.is_empty() {
        return Err(AppError::Validation("api_key is required".into()));
    }
    let result = crate::ai::fix_latex_errors(
        &req.provider,
        &req.model,
        api_key,
        None,
        &req.broken_latex,
        &req.error_logs,
    )
    .await
    .map_err(AppError::Ai)?;
    Ok(Json(serde_json::json!({ "latex": result })))
}

/// Compile a multi-file document by reading files from the DB and feeding them
/// to Tectonic via a temp directory.
async fn compile_document(
    State(state): State<AppState>,
    Json(req): Json<CompileDocumentRequest>,
) -> AppResult<Response> {
    let doc = state
        .repo
        .get_document(&req.doc_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let main_rel = doc
        .main_file
        .clone()
        .unwrap_or_else(|| "main.tex".to_string());

    // Stage all files into a temp directory.
    let files = state
        .repo
        .list_document_files(&req.doc_id)
        .await
        .map_err(internal)?;

    let temp_dir = std::env::temp_dir().join(format!("roletect-doc-{}", nanoid::nanoid!(10)));
    std::fs::create_dir_all(&temp_dir).map_err(AppError::Io)?;

    for entry in &files {
        let content = state
            .repo
            .read_document_file(&req.doc_id, &entry.rel_path)
            .await
            .map_err(internal)?
            .ok_or(AppError::NotFound)?;
        let path = temp_dir.join(&entry.rel_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(AppError::Io)?;
        }
        std::fs::write(&path, &content).map_err(AppError::Io)?;
    }

    let main_path = temp_dir.join(&main_rel);
    if !main_path.is_file() {
        return Err(AppError::Validation(format!(
            "main file '{}' not staged",
            main_rel
        )));
    }

    let cache_dir = state.config.tectonic_cache_dir.clone();
    let bytes = tokio::task::spawn_blocking(move || compile_workspace(main_path, cache_dir))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("join error: {}", e)))?
        .map_err(AppError::LaTeX)?;

    let _ = std::fs::remove_dir_all(&temp_dir);

    let filename = format!("{}.pdf", doc.title.replace(['/', '\\', ' '], "_"));
    Ok(pdf_response(bytes, Some(&filename)))
}

fn compile_string(latex: String, cache_dir: std::path::PathBuf) -> Result<Vec<u8>, String> {
    let handle = std::thread::Builder::new()
        .name("tectonic-compiler".into())
        .stack_size(100 * 1024 * 1024)
        .spawn(move || run_tectonic_string(&latex, &cache_dir))
        .map_err(|e| format!("Failed to spawn compiler thread: {}", e))?;
    handle
        .join()
        .map_err(|_| "Compiler thread panicked".to_string())?
}

fn run_tectonic_string(latex: &str, cache_dir: &std::path::Path) -> Result<Vec<u8>, String> {
    let mut status = CapturingStatusBackend::new();

    let config_loader = tectonic::config::PersistentConfig::default();
    let bundle = config_loader
        .default_bundle(false)
        .map_err(|e| format!("Failed to load Tectonic bundle: {}", e))?;
    let format_cache_path = config_loader
        .format_cache_path()
        .map_err(|e| format!("Failed to get format cache path: {}", e))?;

    let temp_output_dir = std::env::temp_dir().join(format!("roletect-{}", nanoid::nanoid!(10)));
    std::fs::create_dir_all(&temp_output_dir)
        .map_err(|e| format!("Failed to create temp output dir: {}", e))?;

    let mut sb = ProcessingSessionBuilder::default();
    let _ = cache_dir; // Format cache is configured by tectonic; cache_dir is reserved for future use.

    sb.bundle(bundle)
        .primary_input_buffer(latex.as_bytes())
        .tex_input_name("texput")
        .filesystem_root(std::env::temp_dir())
        .output_dir(&temp_output_dir)
        .format_cache_path(format_cache_path)
        .format_name("latex")
        .output_format(OutputFormat::Pdf)
        .build_date(std::time::SystemTime::now());

    let mut sess = sb.create(&mut status).map_err(|e| {
        format!(
            "Failed to create Tectonic session: {}\nLogs:{}",
            e, status.logs
        )
    })?;

    sess.run(&mut status)
        .map_err(|e| format!("Compilation failed: {}\nLogs:{}", e, status.logs))?;

    let pdf_path = temp_output_dir.join("texput.pdf");
    if pdf_path.exists() {
        let bytes = std::fs::read(&pdf_path).map_err(|e| format!("Failed to read PDF: {}", e))?;
        let _ = std::fs::remove_dir_all(&temp_output_dir);
        Ok(bytes)
    } else {
        let _ = std::fs::remove_dir_all(&temp_output_dir);
        Err(format!("PDF not produced.\nLogs:{}", status.logs))
    }
}

fn compile_workspace(
    main_path: std::path::PathBuf,
    cache_dir: std::path::PathBuf,
) -> Result<Vec<u8>, String> {
    let handle = std::thread::Builder::new()
        .name("tectonic-workspace".into())
        .stack_size(100 * 1024 * 1024)
        .spawn(move || run_tectonic_workspace(&main_path, &cache_dir))
        .map_err(|e| format!("Failed to spawn compiler thread: {}", e))?;
    handle
        .join()
        .map_err(|_| "Compiler thread panicked".to_string())?
}

fn run_tectonic_workspace(
    main_path: &std::path::Path,
    _cache_dir: &std::path::Path,
) -> Result<Vec<u8>, String> {
    let mut status = CapturingStatusBackend::new();
    let config_loader = tectonic::config::PersistentConfig::default();
    let bundle = config_loader
        .default_bundle(false)
        .map_err(|e| format!("Failed to load bundle: {}", e))?;
    let format_cache_path = config_loader
        .format_cache_path()
        .map_err(|e| format!("Failed to get format cache path: {}", e))?;

    let temp_output_dir = std::env::temp_dir().join(format!("roletect-{}", nanoid::nanoid!(10)));
    std::fs::create_dir_all(&temp_output_dir).map_err(|e| format!("temp dir: {}", e))?;

    let mut sb = ProcessingSessionBuilder::default();
    sb.bundle(bundle)
        .primary_input_path(main_path)
        .tex_input_name("texput.tex")
        .filesystem_root(main_path.parent().unwrap_or(main_path))
        .output_dir(&temp_output_dir)
        .format_cache_path(format_cache_path)
        .format_name("latex")
        .output_format(OutputFormat::Pdf);

    let mut sess = sb
        .create(&mut status)
        .map_err(|e| format!("Session: {}\nLogs:{}", e, status.logs))?;
    sess.run(&mut status)
        .map_err(|e| format!("Compilation: {}\nLogs:{}", e, status.logs))?;

    let pdf = temp_output_dir.join("texput.pdf");
    if pdf.exists() {
        let bytes = std::fs::read(&pdf).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&temp_output_dir);
        Ok(bytes)
    } else {
        let _ = std::fs::remove_dir_all(&temp_output_dir);
        Err(format!("PDF missing.\nLogs:{}", status.logs))
    }
}

fn pdf_response(bytes: Vec<u8>, filename: Option<&str>) -> Response {
    let name = filename.unwrap_or("output.pdf").to_string();
    let mut resp = (StatusCode::OK, Bytes::from(bytes)).into_response();
    let disposition = format!(r#"attachment; filename="{}.pdf""#, name);
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    resp.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).unwrap_or(HeaderValue::from_static("attachment")),
    );
    resp
}

fn internal<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Internal(anyhow::anyhow!("{}", e))
}
