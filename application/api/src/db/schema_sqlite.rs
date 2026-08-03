//! Canonical SQLite DDL for the Roletect schema.
//!
//! This is the SOURCE OF TRUTH for the VPS in SQLite mode and matches the
//! desktop app's schema (src-tauri/src/db.rs) byte-for-byte at the column
//! level. S3 backups (single JSON blob) round-trip cleanly as long as both
//! sides produce the same column names and types.

pub const DDL: &str = r#"
-- 1. App Settings (key-value)
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 2. Base Resumes
CREATE TABLE IF NOT EXISTS base_resumes (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    latex_content TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS update_base_resumes_modtime
    AFTER UPDATE ON base_resumes
    BEGIN UPDATE base_resumes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- 2b. Base Cover Letters
CREATE TABLE IF NOT EXISTS base_cover_letters (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    latex_content TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS update_base_cover_letters_modtime
    AFTER UPDATE ON base_cover_letters
    BEGIN UPDATE base_cover_letters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- 3. Jobs (Flexible Schema)
CREATE TABLE IF NOT EXISTS jobs (
    id                    TEXT PRIMARY KEY,
    company_name          TEXT NOT NULL,
    job_title             TEXT NOT NULL,
    work_model            TEXT DEFAULT 'Remote',
    employment_type       TEXT DEFAULT 'Full-time',
    status                TEXT NOT NULL DEFAULT 'Drafting',
    raw_jd                TEXT NOT NULL,
    requirements          TEXT,
    core_responsibilities TEXT,
    custom_instruction    TEXT,
    reference_name        TEXT,
    reference_email       TEXT,
    social_link           TEXT,
    job_url               TEXT,
    base_resume_id        TEXT,
    base_cl_id            TEXT,
    salary                TEXT,
    applied_date          TEXT,
    interview_date        TEXT,
    offer_date            TEXT,
    rejected_date         TEXT,
    joining_date          TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (base_resume_id) REFERENCES base_resumes(id),
    FOREIGN KEY (base_cl_id)     REFERENCES base_cover_letters(id)
);
CREATE TRIGGER IF NOT EXISTS update_jobs_modtime
    AFTER UPDATE ON jobs
    BEGIN UPDATE jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- 4. Tailored Resumes
CREATE TABLE IF NOT EXISTS tailored_resumes (
    id                  TEXT PRIMARY KEY,
    job_id              TEXT NOT NULL,
    base_resume_id      TEXT NOT NULL,
    final_latex_content TEXT NOT NULL,
    is_active           INTEGER DEFAULT 1,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id)         REFERENCES jobs(id),
    FOREIGN KEY (base_resume_id) REFERENCES base_resumes(id)
);
CREATE TRIGGER IF NOT EXISTS update_tailored_resumes_modtime
    AFTER UPDATE ON tailored_resumes
    BEGIN UPDATE tailored_resumes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- 4b. Tailored Cover Letters
CREATE TABLE IF NOT EXISTS tailored_cover_letters (
    id                  TEXT PRIMARY KEY,
    job_id              TEXT NOT NULL,
    base_cl_id          TEXT NOT NULL,
    final_latex_content TEXT NOT NULL,
    is_active           INTEGER DEFAULT 1,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id)     REFERENCES jobs(id),
    FOREIGN KEY (base_cl_id) REFERENCES base_cover_letters(id)
);
CREATE TRIGGER IF NOT EXISTS update_tailored_cover_letters_modtime
    AFTER UPDATE ON tailored_cover_letters
    BEGIN UPDATE tailored_cover_letters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- 5. Compiler State
CREATE TABLE IF NOT EXISTS compiler_state (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    latex_content TEXT NOT NULL,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Downloads
CREATE TABLE IF NOT EXISTS downloads (
    id            TEXT PRIMARY KEY,
    filename      TEXT NOT NULL,
    download_type TEXT NOT NULL,
    job_id        TEXT,
    content_id    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- 7. Themes
CREATE TABLE IF NOT EXISTS themes (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    config     TEXT NOT NULL,
    is_builtin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Inbox Jobs
CREATE TABLE IF NOT EXISTS inbox_jobs (
    id              TEXT PRIMARY KEY,
    url             TEXT,
    raw_description TEXT NOT NULL,
    status          TEXT DEFAULT 'Pending',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Documents (multi-file workspaces)
CREATE TABLE IF NOT EXISTS documents (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    tags             TEXT NOT NULL DEFAULT '',
    starred          INTEGER NOT NULL DEFAULT 0,
    main_file        TEXT,
    last_compiled_at TEXT,
    compile_status   TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS update_documents_modtime
    AFTER UPDATE ON documents
    BEGIN UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
CREATE INDEX IF NOT EXISTS idx_documents_starred ON documents(starred) WHERE starred = 1;

-- 10. Document Files
CREATE TABLE IF NOT EXISTS document_files (
    doc_id     TEXT NOT NULL,
    rel_path   TEXT NOT NULL,
    content    TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (doc_id, rel_path),
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_files_doc ON document_files(doc_id);
"#;
