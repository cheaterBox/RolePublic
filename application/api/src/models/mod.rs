//! Data Transfer Objects (DTOs) for the API.
//!
//! These types are the wire format. They are intentionally separate from
//! internal domain types so the wire format can evolve without touching
//! business logic.
//!
//! SECURITY: All DTOs implement `Serialize` only — they cannot accidentally
//! expose a `Debug` impl that prints a secret, because no secret field exists
//! in any DTO. Internal services return `SecretString` for sensitive values.

use serde::{Deserialize, Serialize};

// ===========================================================================
// Inbox
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InboxJob {
    pub id: String,
    pub url: Option<String>,
    pub raw_description: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IngestPayload {
    pub url: Option<String>,
    pub raw_description: String,
    pub secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtensionConfig {
    pub secret: String,
    pub port: String,
}

// ===========================================================================
// Jobs
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobPayload {
    pub id: String,
    pub company_name: String,
    pub job_title: String,
    pub work_model: String,
    pub employment_type: String,
    pub status: String,
    pub raw_jd: String,
    #[serde(default)]
    pub requirements: Option<String>,
    #[serde(default)]
    pub core_responsibilities: Option<String>,
    #[serde(default)]
    pub custom_instruction: Option<String>,
    #[serde(default)]
    pub reference_name: Option<String>,
    #[serde(default)]
    pub reference_email: Option<String>,
    #[serde(default)]
    pub social_link: Option<String>,
    #[serde(default)]
    pub job_url: Option<String>,
    #[serde(default)]
    pub base_resume_id: Option<String>,
    #[serde(default)]
    pub base_cl_id: Option<String>,
    #[serde(default)]
    pub salary: Option<String>,
    #[serde(default)]
    pub applied_date: Option<String>,
    #[serde(default)]
    pub interview_date: Option<String>,
    #[serde(default)]
    pub offer_date: Option<String>,
    #[serde(default)]
    pub rejected_date: Option<String>,
    #[serde(default)]
    pub joining_date: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, schemars::JsonSchema)]
pub struct JobDetails {
    pub is_valid_job: bool,
    pub job_title: String,
    pub company_name: String,
    pub work_model: String,
    pub employment_type: String,
    pub requirements: Vec<String>,
    pub core_responsibilities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobParseResult {
    pub details: JobDetails,
    pub raw_description: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseJobRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub raw_jd: String,
    #[serde(default)]
    pub job_url: Option<String>,
}

// ===========================================================================
// Resumes
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResumeItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResumeDetail {
    pub id: String,
    pub name: String,
    pub category: String,
    pub latex_content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateResumeRequest {
    pub name: String,
    pub category: String,
    pub latex_content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TailorResumeRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub job_id: String,
    pub base_resume_id: String,
    #[serde(default)]
    pub custom_instruction: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TailoredContent {
    pub id: String,
    pub base_template_id: String,
    pub content: String,
}

// ===========================================================================
// Cover Letters
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CoverLetterItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CoverLetterDetail {
    pub id: String,
    pub name: String,
    pub category: String,
    pub latex_content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCoverLetterRequest {
    pub name: String,
    pub category: String,
    pub latex_content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TailorCoverLetterRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub job_id: String,
    pub base_cl_id: String,
    #[serde(default)]
    pub custom_instruction: Option<String>,
}

// ===========================================================================
// Downloads
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadRecord {
    pub id: String,
    pub filename: String,
    pub download_type: String,
    pub job_id: Option<String>,
    pub content_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecordDownloadRequest {
    pub filename: String,
    pub download_type: String,
    #[serde(default)]
    pub job_id: Option<String>,
    #[serde(default)]
    pub content_id: Option<String>,
}

// ===========================================================================
// Themes
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Theme {
    pub id: String,
    pub name: String,
    pub config: String,
    pub is_builtin: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveCustomThemeRequest {
    pub id: String,
    pub name: String,
    pub config: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveActiveThemeRequest {
    pub theme_id: String,
}

// ===========================================================================
// Settings (key-value + AI config)
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub has_key: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveAiConfigRequest {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub api_key: Option<String>,
}

// Generic key-value setting (NOT for AI config which has its own type).
#[derive(Debug, Serialize, Deserialize)]
pub struct SaveSettingRequest {
    pub key: String,
    pub value: String,
}

// ===========================================================================
// Compiler
// ===========================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CompilerState {
    pub latex_content: String,
}

// ===========================================================================
// PDF
// ===========================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileLatexRequest {
    pub latex_content: String,
    #[serde(default)]
    pub filename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefineLatexRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub current_latex: String,
    pub instruction: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FixLatexRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub broken_latex: String,
    pub error_logs: String,
}

// ===========================================================================
// Documents (multi-file LaTeX workspaces)
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: String,
    pub starred: bool,
    pub main_file: Option<String>,
    pub last_compiled_at: Option<String>,
    pub compile_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentFileEntry {
    pub rel_path: String,
    pub size_bytes: u64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDocumentRequest {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub starred: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateDocumentRequest {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub starred: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListFilesRequest {
    pub doc_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileRequest {
    pub doc_id: String,
    pub rel_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteFileRequest {
    pub doc_id: String,
    pub rel_path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFileRequest {
    pub doc_id: String,
    #[serde(default)]
    pub parent_rel: Option<String>,
    pub name: String,
    #[serde(default)]
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteFileRequest {
    pub doc_id: String,
    pub rel_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameFileRequest {
    pub doc_id: String,
    pub rel_path: String,
    pub new_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetMainFileRequest {
    pub doc_id: String,
    #[serde(default)]
    pub rel_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileDocumentRequest {
    pub doc_id: String,
}

// ===========================================================================
// Scoring
// ===========================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ScoreResumeRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub resume_id: String,
    pub job_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScoreResumeResult {
    pub score: u32,
    pub reasoning: String,
    pub missing_keywords: Vec<String>,
    pub matched_keywords: Vec<String>,
}

// ===========================================================================
// Full backup (S3 round-trip)
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct FullBackup {
    pub version: u32,
    pub created_at: String,
    pub app_settings: Vec<(String, String)>,
    pub base_resumes: Vec<ResumeDetail>,
    pub base_cover_letters: Vec<CoverLetterDetail>,
    pub jobs: Vec<JobPayload>,
    pub tailored_resumes: Vec<TailoredRow>,
    pub tailored_cover_letters: Vec<TailoredRow>,
    pub compiler_state: Option<CompilerState>,
    pub downloads: Vec<DownloadRecord>,
    pub themes: Vec<Theme>,
    pub inbox_jobs: Vec<InboxJob>,
    pub documents: Vec<DocumentSummary>,
    pub document_files: Vec<DocumentFileRow>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TailoredRow {
    pub id: String,
    pub job_id: String,
    pub base_resume_id: String,
    pub base_cl_id: String,
    pub final_latex_content: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentFileRow {
    pub doc_id: String,
    pub rel_path: String,
    pub content: String,
    pub size_bytes: u64,
    pub updated_at: String,
}
