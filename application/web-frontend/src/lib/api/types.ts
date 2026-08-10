/**
 * Wire DTOs — mirror of api/src/models/mod.rs
 * Keep this file in sync with the Rust source. No secrets, no transforms.
 */

// Inbox
export type InboxJob = {
  id: string;
  url: string | null;
  raw_description: string;
  status: string;
  created_at: string;
};

export type IngestPayload = {
  url?: string | null;
  raw_description: string;
  secret: string;
};

export type ExtensionConfig = {
  secret: string;
  port: string;
};

// Jobs
export type JobPayload = {
  id: string;
  company_name: string;
  job_title: string;
  work_model: string;
  employment_type: string;
  status: string;
  raw_jd: string;
  requirements?: string | null;
  core_responsibilities?: string | null;
  custom_instruction?: string | null;
  reference_name?: string | null;
  reference_email?: string | null;
  social_link?: string | null;
  job_url?: string | null;
  base_resume_id?: string | null;
  base_cl_id?: string | null;
  salary?: string | null;
  applied_date?: string | null;
  interview_date?: string | null;
  offer_date?: string | null;
  rejected_date?: string | null;
  joining_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type JobDetails = {
  is_valid_job: boolean;
  job_title: string;
  company_name: string;
  work_model: string;
  employment_type: string;
  requirements: string[];
  core_responsibilities: string[];
};

export type JobParseResult = {
  details: JobDetails;
  raw_description: string;
};

export type ParseJobRequest = {
  provider: string;
  model: string;
  api_key: string;
  raw_jd: string;
  job_url?: string | null;
};

// Resumes
export type ResumeItem = {
  id: string;
  name: string;
  category: string;
  created_at: string;
  updated_at: string;
};

export type ResumeDetail = {
  id: string;
  name: string;
  category: string;
  latex_content: string;
  created_at: string;
  updated_at: string;
};

export type CreateResumeRequest = {
  name: string;
  category: string;
  latex_content: string;
};

export type TailorResumeRequest = {
  provider: string;
  model: string;
  api_key: string;
  job_id: string;
  base_resume_id: string;
  custom_instruction?: string | null;
};

export type TailoredContent = {
  id: string;
  base_template_id: string;
  content: string;
};

// Cover Letters
export type CoverLetterItem = {
  id: string;
  name: string;
  category: string;
  created_at: string;
  updated_at: string;
};

export type CoverLetterDetail = {
  id: string;
  name: string;
  category: string;
  latex_content: string;
  created_at: string;
  updated_at: string;
};

export type CreateCoverLetterRequest = {
  name: string;
  category: string;
  latex_content: string;
};

export type TailorCoverLetterRequest = {
  provider: string;
  model: string;
  api_key: string;
  job_id: string;
  base_cl_id: string;
  custom_instruction?: string | null;
};

// Downloads
export type DownloadRecord = {
  id: string;
  filename: string;
  download_type: string;
  job_id: string | null;
  content_id: string | null;
  created_at: string;
};

export type RecordDownloadRequest = {
  filename: string;
  download_type: string;
  job_id?: string | null;
  content_id?: string | null;
};

// Themes
export type Theme = {
  id: string;
  name: string;
  config: string;
  is_builtin: boolean;
};

export type SaveCustomThemeRequest = {
  id: string;
  name: string;
  config: string;
};

export type SaveActiveThemeRequest = {
  theme_id: string;
};

// Settings
export type AiConfig = {
  provider: string;
  model: string;
  has_key: boolean;
};

export type SaveAiConfigRequest = {
  provider: string;
  model: string;
  api_key?: string | null;
};

export type SaveSettingRequest = {
  key: string;
  value: string;
};

// Compiler
export type CompilerState = {
  latex_content: string;
};

// PDF
export type CompileLatexRequest = {
  latex_content: string;
  filename?: string | null;
};

export type RefineLatexRequest = {
  provider: string;
  model: string;
  api_key: string;
  current_latex: string;
  instruction: string;
};

export type FixLatexRequest = {
  provider: string;
  model: string;
  api_key: string;
  broken_latex: string;
  error_logs: string;
};

// Documents
export type DocumentSummary = {
  id: string;
  title: string;
  description: string;
  tags: string;
  starred: boolean;
  main_file: string | null;
  last_compiled_at: string | null;
  compile_status: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentFileEntry = {
  rel_path: string;
  size_bytes: number;
  updated_at: string;
};

export type CreateDocumentRequest = {
  title: string;
  description?: string | null;
  tags?: string | null;
  starred?: boolean | null;
};

export type UpdateDocumentRequest = {
  id: string;
  title?: string | null;
  description?: string | null;
  tags?: string | null;
  starred?: boolean | null;
};

export type CompileDocumentRequest = {
  doc_id: string;
};

// Scoring
export type ScoreResumeRequest = {
  provider: string;
  model: string;
  api_key: string;
  resume_id: string;
  job_id: string;
};

export type ScoreResumeResult = {
  score: number;
  reasoning: string;
  missing_keywords: string[];
  matched_keywords: string[];
};

// Backup
export type FullBackup = {
  version: number;
  created_at: string;
  app_settings: [string, string][];
  base_resumes: ResumeDetail[];
  base_cover_letters: CoverLetterDetail[];
  jobs: JobPayload[];
  tailored_resumes: TailoredRow[];
  tailored_cover_letters: TailoredRow[];
  compiler_state: CompilerState | null;
  downloads: DownloadRecord[];
  themes: Theme[];
  inbox_jobs: InboxJob[];
  documents: DocumentSummary[];
  document_files: DocumentFileRow[];
};

export type TailoredRow = {
  id: string;
  job_id: string;
  base_resume_id: string;
  base_cl_id: string;
  final_latex_content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DocumentFileRow = {
  doc_id: string;
  rel_path: string;
  content: string;
  size_bytes: number;
  updated_at: string;
};

// Generic API error shape — matches api/src/error.rs
export type ApiErrorBody = {
  error: string;
  message: string;
  details?: unknown;
};
