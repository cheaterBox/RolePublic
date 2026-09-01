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
    #[serde(default)]
    pub custom_base_url: Option<String>,
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
    #[serde(default)]
    pub custom_base_url: Option<String>,
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
    #[serde(default)]
    pub custom_base_url: Option<String>,
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
    #[serde(alias = "prompt", alias = "instruction")]
    pub instruction: String,
    #[serde(default)]
    pub custom_base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FixLatexRequest {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub broken_latex: String,
    pub error_logs: String,
    #[serde(default)]
    pub custom_base_url: Option<String>,
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
    #[serde(default)]
    pub custom_base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScoreResumeResult {
    pub score: u32,
    pub reasoning: String,
    pub missing_keywords: Vec<String>,
    pub matched_keywords: Vec<String>,
}

// ===========================================================================
// Full backup (Canonical Cross-Backup Schema: Tauri Desktop <-> Axum VPS <-> S3)
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct SettingExport {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TailoredResumeExport {
    pub id: String,
    pub job_id: String,
    pub base_resume_id: String,
    pub final_latex_content: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TailoredCoverLetterExport {
    pub id: String,
    pub job_id: String,
    pub base_cl_id: String,
    pub final_latex_content: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ThemeExport {
    pub id: String,
    pub name: String,
    pub config: String,
    pub is_builtin: bool,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct DocumentFileExport {
    pub doc_id: String,
    pub rel_path: String,
    pub content: String,
    pub size_bytes: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct FullBackup {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    #[serde(alias = "created_at")]
    pub exported_at: String,
    pub jobs: Vec<JobPayload>,
    pub base_resumes: Vec<ResumeDetail>,
    pub base_cover_letters: Vec<CoverLetterDetail>,
    pub tailored_resumes: Vec<TailoredResumeExport>,
    pub tailored_cover_letters: Vec<TailoredCoverLetterExport>,
    pub downloads: Vec<DownloadRecord>,
    pub themes: Vec<ThemeExport>,
    pub app_settings: Vec<SettingExport>,
    pub inbox_jobs: Vec<InboxJob>,
    pub compiler_state: Option<String>,
    #[serde(default)]
    pub documents: Vec<DocumentSummary>,
    #[serde(default)]
    pub document_files: Vec<DocumentFileExport>,
}

pub const SENSITIVE_EXACT_KEYS: &[&str] = &[
    "extension_secret",
    "active_server_port",
    "ai_provider",
    "ai_model",
];

pub const SENSITIVE_PREFIXES: &[&str] = &["s3_", "aws_", "cloud_"];

pub const SENSITIVE_SUBSTRINGS: &[&str] = &[
    "api_key",
    "secret",
    "token",
    "password",
    "credential",
    "bucket",
    "custom_base_url",
    "custom_model",
];

pub fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    if SENSITIVE_EXACT_KEYS.iter().any(|k| lower == *k) {
        return true;
    }
    if SENSITIVE_PREFIXES.iter().any(|p| lower.starts_with(p)) {
        return true;
    }
    if SENSITIVE_SUBSTRINGS.iter().any(|s| lower.contains(s)) {
        return true;
    }
    false
}

// ===========================================================================
// Multi-User Authentication & Identity Models
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: String,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub full_name: String,
    pub avatar_url: Option<String>,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSummary {
    pub id: String,
    pub email: String,
    pub full_name: String,
    pub avatar_url: Option<String>,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub full_name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserSummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user_id
    pub email: String,
    pub name: String,
    pub role: String,
    pub exp: usize, // expiration timestamp (seconds)
}

// ===========================================================================
// Document RBAC & Multi-User Collaboration Models
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum CollaboratorRole {
    Owner,
    Admin,
    Editor,
    Commenter,
    Viewer,
}

impl CollaboratorRole {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "owner" => Self::Owner,
            "admin" => Self::Admin,
            "commenter" => Self::Commenter,
            "viewer" => Self::Viewer,
            _ => Self::Editor,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Owner => "Owner",
            Self::Admin => "Admin",
            Self::Editor => "Editor",
            Self::Commenter => "Commenter",
            Self::Viewer => "Viewer",
        }
    }

    pub fn can_edit(&self) -> bool {
        matches!(self, Self::Owner | Self::Admin | Self::Editor)
    }

    pub fn can_comment(&self) -> bool {
        matches!(
            self,
            Self::Owner | Self::Admin | Self::Editor | Self::Commenter
        )
    }

    pub fn can_manage_collaborators(&self) -> bool {
        matches!(self, Self::Owner | Self::Admin)
    }

    pub fn can_delete_document(&self) -> bool {
        matches!(self, Self::Owner)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentCollaboratorEntry {
    pub id: String,
    pub doc_id: String,
    pub user_id: String,
    pub email: String,
    pub full_name: String,
    pub avatar_url: Option<String>,
    pub role: String,
    pub invited_by: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AddCollaboratorRequest {
    pub email: String,
    #[serde(default = "default_collaborator_role")]
    pub role: String,
}

fn default_collaborator_role() -> String {
    "Editor".to_string()
}

#[derive(Debug, Deserialize)]
pub struct UpdateCollaboratorRoleRequest {
    pub role: String,
}

// ===========================================================================
// Granular Edit History & Checkpoint Revisions ("Who edited what")
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentRevisionEntry {
    pub id: String,
    pub doc_id: String,
    pub version_number: i64,
    pub title: String,
    pub created_by_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRevisionRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentChangeEntry {
    pub id: String,
    pub doc_id: String,
    pub rel_path: String,
    pub user_id: Option<String>,
    pub user_name: String,
    pub change_type: String,
    pub diff_patch: String,
    pub summary: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileDiffHunk {
    pub line_number: usize,
    pub line_type: String, // "added" | "removed" | "context"
    pub content: String,
}

// ===========================================================================
// Document Comments & Collaborative Annotations
// ===========================================================================

#[derive(Debug, Clone)]
pub struct RecordChangeParams<'a> {
    pub doc_id: &'a str,
    pub rel_path: &'a str,
    pub user_id: Option<&'a str>,
    pub user_name: &'a str,
    pub change_type: &'a str,
    pub diff_patch: &'a str,
    pub summary: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub struct CreateCommentParams<'a> {
    pub doc_id: &'a str,
    pub rel_path: &'a str,
    pub user_id: Option<&'a str>,
    pub user_name: &'a str,
    pub line_number: i64,
    pub selected_text: Option<&'a str>,
    pub content: &'a str,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentCommentEntry {
    pub id: String,
    pub doc_id: String,
    pub rel_path: String,
    pub user_id: Option<String>,
    pub user_name: String,
    pub line_number: i64,
    pub selected_text: Option<String>,
    pub content: String,
    pub resolved: bool,
    pub resolved_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub rel_path: String,
    pub line_number: i64,
    pub selected_text: Option<String>,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ResolveCommentRequest {
    pub resolved: bool,
}

// ===========================================================================
// Real-Time Presence & Cursor Tracking
// ===========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CursorPosition {
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserPresence {
    pub user_id: String,
    pub user_name: String,
    pub avatar_url: Option<String>,
    pub color: String,
    pub active_file: Option<String>,
    pub cursor: Option<CursorPosition>,
    pub last_seen_epoch_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum WsClientMessage {
    #[serde(rename = "presence")]
    Presence {
        active_file: Option<String>,
        cursor: Option<CursorPosition>,
    },
    #[serde(rename = "file_change")]
    FileChange { rel_path: String, content: String },
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum WsServerMessage {
    #[serde(rename = "presence_list")]
    PresenceList { users: Vec<UserPresence> },
    #[serde(rename = "user_joined")]
    UserJoined { presence: UserPresence },
    #[serde(rename = "user_moved")]
    UserMoved {
        user_id: String,
        active_file: Option<String>,
        cursor: Option<CursorPosition>,
    },
    #[serde(rename = "user_left")]
    UserLeft { user_id: String },
    #[serde(rename = "file_updated")]
    FileUpdated {
        rel_path: String,
        user_id: String,
        user_name: String,
        diff_patch: String,
    },
    #[serde(rename = "pong")]
    Pong,
}
