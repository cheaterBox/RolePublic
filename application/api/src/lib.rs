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

#[cfg(test)]
mod tests {
    use super::models::*;

    #[test]
    fn test_sensitive_key_filtering() {
        assert!(is_sensitive_key("openai_api_key"));
        assert!(is_sensitive_key("s3_access_key"));
        assert!(is_sensitive_key("s3_secret_key"));
        assert!(is_sensitive_key("s3_bucket"));
        assert!(is_sensitive_key("aws_region"));
        assert!(is_sensitive_key("extension_secret"));
        assert!(is_sensitive_key("active_server_port"));
        assert!(is_sensitive_key("gemini_api_key"));
        assert!(is_sensitive_key("auth_token"));
        assert!(is_sensitive_key("admin_password"));

        assert!(!is_sensitive_key("active_theme"));
        assert!(!is_sensitive_key("theme"));
        assert!(!is_sensitive_key("editor_font_size"));
        assert!(!is_sensitive_key("latex_workspace_path"));
    }

    #[test]
    fn test_cross_backup_compatibility() {
        let tauri_mock_json = r##"{
            "exported_at": "2026-08-27T01:50:00+00:00",
            "jobs": [
                {
                    "id": "job_1",
                    "company_name": "Acme Corp",
                    "job_title": "Staff Rust Engineer",
                    "work_model": "Remote",
                    "employment_type": "Full-time",
                    "status": "Applied",
                    "raw_jd": "Build scalable distributed systems.",
                    "created_at": "2026-08-27T01:00:00Z",
                    "updated_at": "2026-08-27T01:00:00Z"
                }
            ],
            "base_resumes": [
                {
                    "id": "res_1",
                    "name": "Backend Master",
                    "category": "Software",
                    "latex_content": "\\documentclass{article}\\begin{document}Hello\\end{document}",
                    "created_at": "2026-08-27T01:00:00Z",
                    "updated_at": "2026-08-27T01:00:00Z"
                }
            ],
            "base_cover_letters": [],
            "tailored_resumes": [
                {
                    "id": "tr_1",
                    "job_id": "job_1",
                    "base_resume_id": "res_1",
                    "final_latex_content": "\\documentclass{article}Tailored\\end{document}",
                    "is_active": true,
                    "created_at": "2026-08-27T01:00:00Z",
                    "updated_at": "2026-08-27T01:00:00Z"
                }
            ],
            "tailored_cover_letters": [],
            "downloads": [],
            "themes": [
                {
                    "id": "dark_matrix",
                    "name": "Dark Matrix",
                    "config": "{\"primary\":\"#00ff00\"}",
                    "is_builtin": false,
                    "created_at": "2026-08-27T01:00:00Z"
                }
            ],
            "app_settings": [
                {
                    "key": "active_theme",
                    "value": "dark_matrix"
                }
            ],
            "inbox_jobs": [],
            "compiler_state": "\\documentclass{article}\\begin{document}Scratch\\end{document}",
            "documents": [
                {
                    "id": "doc_1",
                    "title": "Distributed Systems Paper",
                    "description": "Paper notes",
                    "tags": "research,latex",
                    "starred": true,
                    "main_file": "main.tex",
                    "last_compiled_at": null,
                    "compile_status": null,
                    "created_at": "2026-08-27T01:00:00Z",
                    "updated_at": "2026-08-27T01:00:00Z"
                }
            ],
            "document_files": [
                {
                    "doc_id": "doc_1",
                    "rel_path": "main.tex",
                    "content": "\\section{Intro}",
                    "size_bytes": 15,
                    "updated_at": "2026-08-27T01:00:00Z"
                }
            ]
        }"##;

        // Verify deserialization into Axum FullBackup struct
        let parsed: FullBackup = serde_json::from_str(tauri_mock_json)
            .expect("Failed to deserialize Tauri desktop backup JSON into Axum FullBackup");

        assert_eq!(parsed.exported_at, "2026-08-27T01:50:00+00:00");
        assert_eq!(parsed.jobs.len(), 1);
        assert_eq!(parsed.jobs[0].company_name, "Acme Corp");
        assert_eq!(parsed.base_resumes.len(), 1);
        assert_eq!(parsed.tailored_resumes.len(), 1);
        assert_eq!(parsed.tailored_resumes[0].base_resume_id, "res_1");
        assert_eq!(parsed.themes.len(), 1);
        assert_eq!(parsed.app_settings.len(), 1);
        assert_eq!(parsed.app_settings[0].key, "active_theme");
        assert_eq!(parsed.app_settings[0].value, "dark_matrix");
        assert_eq!(
            parsed.compiler_state.as_deref(),
            Some("\\documentclass{article}\\begin{document}Scratch\\end{document}")
        );
        assert_eq!(parsed.documents.len(), 1);
        assert_eq!(parsed.document_files.len(), 1);
        assert_eq!(parsed.document_files[0].rel_path, "main.tex");

        // Verify roundtrip serialization back to JSON
        let serialized = serde_json::to_string(&parsed).expect("Failed to serialize FullBackup");
        let reparsed: FullBackup = serde_json::from_str(&serialized).expect("Roundtrip failed");
        assert_eq!(reparsed.exported_at, parsed.exported_at);
        assert_eq!(reparsed.jobs[0].id, "job_1");
        assert_eq!(reparsed.app_settings[0].key, "active_theme");
    }
}
