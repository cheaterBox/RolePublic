//! Database abstraction.
//!
//! The active backend is selected from `Config::db`. We expose a single
//! `Repository` trait that the application code uses; concrete impls
//! live in `db::sqlite` and `db::postgres`.
//!
//! Why a trait (and not `sqlx::Any`): SQLx's driver-agnostic `Any`
//! backend only supports runtime-agnostic *queries*, but the schema
//! initialization differs between SQLite and Postgres (different trigger
//! syntax, default-value semantics, etc.). A trait keeps the per-driver
//! quirks localized and gives us compile-time guarantees on each backend.

use crate::config::{Config, DbDriver};
use crate::models::*;
use async_trait::async_trait;
use thiserror::Error;

pub mod postgres;
pub mod schema_postgres;
pub mod schema_sqlite;
pub mod sqlite;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("migration failed: {0}")]
    Migration(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub type RepoResult<T> = Result<T, RepoError>;

/// Database-agnostic interface. Each backend implements this and the
/// dispatch is selected at startup.
#[async_trait]
pub trait Repository: Send + Sync {
    // ----- lifecycle -----
    async fn init_schema(&self) -> RepoResult<()>;
    async fn run_migrations(&self) -> RepoResult<()>;
    async fn ping(&self) -> RepoResult<()>;

    // ----- inbox -----
    async fn list_inbox(&self) -> RepoResult<Vec<InboxJob>>;
    async fn get_inbox(&self, id: &str) -> RepoResult<Option<InboxJob>>;
    async fn delete_inbox(&self, id: &str) -> RepoResult<()>;
    async fn delete_all_inbox(&self) -> RepoResult<()>;
    async fn mark_inbox_processed(&self, id: &str) -> RepoResult<()>;
    async fn get_extension_secret(&self) -> RepoResult<Option<String>>;
    async fn set_extension_secret(&self, secret: &str) -> RepoResult<()>;
    async fn get_active_server_port(&self) -> RepoResult<String>;
    async fn set_active_server_port(&self, port: &str) -> RepoResult<()>;
    async fn ingest_inbox(&self, url: Option<&str>, raw: &str) -> RepoResult<()>;

    // ----- jobs -----
    async fn list_jobs(&self) -> RepoResult<Vec<JobPayload>>;
    async fn get_job(&self, id: &str) -> RepoResult<Option<JobPayload>>;
    async fn save_job(&self, job: &JobPayload) -> RepoResult<()>;
    async fn delete_job(&self, id: &str) -> RepoResult<()>;
    async fn delete_jobs_batch(&self, ids: &[String]) -> RepoResult<()>;
    async fn delete_all_jobs(&self) -> RepoResult<()>;
    async fn update_job_status(
        &self,
        id: &str,
        status: &str,
        metadata: Option<&serde_json::Value>,
    ) -> RepoResult<()>;
    async fn update_job_metadata(&self, id: &str, field: &str, value: &str) -> RepoResult<()>;
    async fn get_job_raw_jd(
        &self,
        id: &str,
    ) -> RepoResult<Option<(String, Option<String>, Option<String>)>>;

    // ----- resumes -----
    async fn list_resumes(&self) -> RepoResult<Vec<ResumeItem>>;
    async fn get_resume(&self, id: &str) -> RepoResult<Option<ResumeDetail>>;
    async fn create_resume(
        &self,
        name: &str,
        category: &str,
        latex_content: &str,
    ) -> RepoResult<String>;
    async fn update_resume(&self, detail: &ResumeDetail) -> RepoResult<()>;
    async fn delete_resume(&self, id: &str) -> RepoResult<()>;
    async fn resume_usage_count(&self, id: &str) -> RepoResult<i64>;
    async fn get_resume_latex(&self, id: &str) -> RepoResult<Option<String>>;
    async fn save_tailored_resume(
        &self,
        id: &str,
        job_id: &str,
        base_resume_id: &str,
        content: &str,
    ) -> RepoResult<()>;
    async fn update_tailored_resume(&self, id: &str, content: &str) -> RepoResult<()>;
    async fn get_latest_tailored_resume(&self, job_id: &str)
        -> RepoResult<Option<TailoredContent>>;
    async fn get_tailored_resume(&self, id: &str) -> RepoResult<Option<TailoredContent>>;

    // ----- cover letters -----
    async fn list_cover_letters(&self) -> RepoResult<Vec<CoverLetterItem>>;
    async fn get_cover_letter(&self, id: &str) -> RepoResult<Option<CoverLetterDetail>>;
    async fn create_cover_letter(
        &self,
        name: &str,
        category: &str,
        latex_content: &str,
    ) -> RepoResult<String>;
    async fn update_cover_letter(&self, detail: &CoverLetterDetail) -> RepoResult<()>;
    async fn delete_cover_letter(&self, id: &str) -> RepoResult<()>;
    async fn cover_letter_usage_count(&self, id: &str) -> RepoResult<i64>;
    async fn get_cover_letter_latex(&self, id: &str) -> RepoResult<Option<String>>;
    async fn save_tailored_cover_letter(
        &self,
        id: &str,
        job_id: &str,
        base_cl_id: &str,
        content: &str,
    ) -> RepoResult<()>;
    async fn update_tailored_cover_letter(&self, id: &str, content: &str) -> RepoResult<()>;
    async fn get_latest_tailored_cover_letter(
        &self,
        job_id: &str,
    ) -> RepoResult<Option<TailoredContent>>;
    async fn get_tailored_cover_letter(&self, id: &str) -> RepoResult<Option<TailoredContent>>;

    // ----- downloads -----
    async fn list_downloads(&self) -> RepoResult<Vec<DownloadRecord>>;
    async fn record_download(
        &self,
        filename: &str,
        download_type: &str,
        job_id: Option<&str>,
        content_id: Option<&str>,
    ) -> RepoResult<()>;

    // ----- themes -----
    async fn list_themes(&self) -> RepoResult<Vec<Theme>>;
    async fn save_custom_theme(&self, id: &str, name: &str, config: &str) -> RepoResult<()>;
    async fn delete_theme(&self, id: &str) -> RepoResult<()>;
    async fn get_active_theme(&self) -> RepoResult<Option<Theme>>;
    async fn save_active_theme(&self, id: &str) -> RepoResult<()>;
    async fn upsert_theme(
        &self,
        id: &str,
        name: &str,
        config: &str,
        is_builtin: bool,
    ) -> RepoResult<()>;

    // ----- settings (key-value) -----
    async fn get_setting(&self, key: &str, default_value: &str) -> RepoResult<String>;
    async fn save_setting(&self, key: &str, value: &str) -> RepoResult<()>;

    // ----- AI config (encrypted key) -----
    async fn get_ai_config(&self) -> RepoResult<AiConfig>;
    async fn save_ai_config(
        &self,
        provider: &str,
        model: &str,
        encrypted_key: Option<&str>,
    ) -> RepoResult<()>;
    async fn get_encrypted_api_key(&self) -> RepoResult<Option<String>>;

    // ----- compiler -----
    async fn get_compiler_state(&self) -> RepoResult<CompilerState>;
    async fn save_compiler_state(&self, state: &CompilerState) -> RepoResult<()>;

    // ----- documents -----
    async fn list_documents(&self) -> RepoResult<Vec<DocumentSummary>>;
    async fn get_document(&self, id: &str) -> RepoResult<Option<DocumentSummary>>;
    async fn create_document(
        &self,
        title: &str,
        description: &str,
        tags: &str,
        starred: bool,
    ) -> RepoResult<String>;
    async fn update_document(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        tags: Option<&str>,
        starred: Option<bool>,
    ) -> RepoResult<()>;
    async fn delete_document(&self, id: &str) -> RepoResult<()>;
    async fn delete_documents_batch(&self, ids: &[String]) -> RepoResult<()>;
    async fn set_document_main_file(&self, id: &str, rel_path: Option<&str>) -> RepoResult<()>;
    async fn get_document_main_file(&self, id: &str) -> RepoResult<Option<String>>;

    async fn list_document_files(&self, doc_id: &str) -> RepoResult<Vec<DocumentFileEntry>>;
    async fn read_document_file(&self, doc_id: &str, rel_path: &str) -> RepoResult<Option<String>>;
    async fn write_document_file(
        &self,
        doc_id: &str,
        rel_path: &str,
        content: &str,
    ) -> RepoResult<()>;
    async fn delete_document_file(&self, doc_id: &str, rel_path: &str) -> RepoResult<()>;
    async fn rename_document_file(
        &self,
        doc_id: &str,
        old_path: &str,
        new_name: &str,
    ) -> RepoResult<()>;
    async fn document_file_exists(
        &self,
        doc_id: &str,
        parent_rel: Option<&str>,
        name: &str,
    ) -> RepoResult<bool>;

    // ----- users & auth -----
    async fn create_user(
        &self,
        email: &str,
        password_hash: &str,
        full_name: &str,
    ) -> RepoResult<User>;
    async fn get_user_by_email(&self, email: &str) -> RepoResult<Option<User>>;
    async fn get_user_by_id(&self, id: &str) -> RepoResult<Option<User>>;

    // ----- document collaborators (RBAC) -----
    async fn list_document_collaborators(
        &self,
        doc_id: &str,
    ) -> RepoResult<Vec<DocumentCollaboratorEntry>>;
    async fn add_document_collaborator(
        &self,
        doc_id: &str,
        user_id: &str,
        role: &str,
        invited_by: Option<&str>,
    ) -> RepoResult<()>;
    async fn update_document_collaborator_role(
        &self,
        doc_id: &str,
        user_id: &str,
        role: &str,
    ) -> RepoResult<()>;
    async fn remove_document_collaborator(&self, doc_id: &str, user_id: &str) -> RepoResult<()>;
    async fn get_user_doc_role(
        &self,
        doc_id: &str,
        user_id: &str,
    ) -> RepoResult<Option<CollaboratorRole>>;

    // ----- document revisions (checkpoints) -----
    async fn list_document_revisions(&self, doc_id: &str)
        -> RepoResult<Vec<DocumentRevisionEntry>>;
    async fn create_document_revision(
        &self,
        doc_id: &str,
        title: &str,
        created_by: Option<&str>,
    ) -> RepoResult<DocumentRevisionEntry>;
    async fn get_document_revision_snapshot(
        &self,
        doc_id: &str,
        revision_id: &str,
    ) -> RepoResult<Option<String>>;

    // ----- granular edit history & audit trail ("who edited what") -----
    async fn record_document_change(
        &self,
        params: crate::models::RecordChangeParams<'_>,
    ) -> RepoResult<()>;
    async fn list_document_changes(
        &self,
        doc_id: &str,
        limit: i64,
    ) -> RepoResult<Vec<DocumentChangeEntry>>;
    async fn list_file_changes(
        &self,
        doc_id: &str,
        rel_path: &str,
    ) -> RepoResult<Vec<DocumentChangeEntry>>;

    // ----- document margin comments & annotations -----
    async fn list_document_comments(
        &self,
        doc_id: &str,
        rel_path: Option<&str>,
    ) -> RepoResult<Vec<DocumentCommentEntry>>;
    async fn create_document_comment(
        &self,
        params: crate::models::CreateCommentParams<'_>,
    ) -> RepoResult<String>;
    async fn resolve_document_comment(
        &self,
        comment_id: &str,
        resolved: bool,
        resolved_by: Option<&str>,
    ) -> RepoResult<()>;
    async fn delete_document_comment(&self, comment_id: &str) -> RepoResult<()>;

    // ----- backup/export -----
    async fn export_all(&self) -> RepoResult<FullBackup>;
    async fn import_all(&self, backup: &FullBackup) -> RepoResult<()>;
}

/// Build the repository for the configured driver. Returns a `Box<dyn Repository>`
/// wrapped in an `Arc` for cheap cloning into `AppState`.
pub async fn build_repository(
    config: &Config,
) -> Result<std::sync::Arc<dyn Repository>, RepoError> {
    match config.db.driver {
        DbDriver::Sqlite => {
            let repo = sqlite::SqliteRepo::connect(&config.db).await?;
            repo.init_schema().await?;
            repo.run_migrations().await?;
            Ok(std::sync::Arc::new(repo))
        }
        DbDriver::Postgres => {
            let repo = postgres::PgRepo::connect(&config.db).await?;
            repo.init_schema().await?;
            repo.run_migrations().await?;
            Ok(std::sync::Arc::new(repo))
        }
    }
}
