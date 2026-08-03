//! Canonical Postgres DDL.
//!
//! Triggers use a shared `roletect_set_updated_at()` function. The schema
//! produces the same column names and FK relationships as the SQLite DDL.
//! Type differences: SQLite uses INTEGER for booleans; Postgres uses BOOLEAN.
//! JSON values are stored as TEXT on both sides.

pub const DDL: &str = r#"
-- Trigger helper
CREATE OR REPLACE FUNCTION roletect_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. App Settings
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
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DROP TRIGGER IF EXISTS update_base_resumes_modtime ON base_resumes;
CREATE TRIGGER update_base_resumes_modtime
    BEFORE UPDATE ON base_resumes
    FOR EACH ROW EXECUTE PROCEDURE roletect_set_updated_at();

-- 2b. Base Cover Letters
CREATE TABLE IF NOT EXISTS base_cover_letters (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    latex_content TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DROP TRIGGER IF EXISTS update_base_cover_letters_modtime ON base_cover_letters;
CREATE TRIGGER update_base_cover_letters_modtime
    BEFORE UPDATE ON base_cover_letters
    FOR EACH ROW EXECUTE PROCEDURE roletect_set_updated_at();

-- 3. Jobs
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
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (base_resume_id) REFERENCES base_resumes(id),
    FOREIGN KEY (base_cl_id)     REFERENCES base_cover_letters(id)
);
DROP TRIGGER IF EXISTS update_jobs_modtime ON jobs;
CREATE TRIGGER update_jobs_modtime
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE PROCEDURE roletect_set_updated_at();

-- 4. Tailored Resumes
CREATE TABLE IF NOT EXISTS tailored_resumes (
    id                  TEXT PRIMARY KEY,
    job_id              TEXT NOT NULL,
    base_resume_id      TEXT NOT NULL,
    final_latex_content TEXT NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id)         REFERENCES jobs(id),
    FOREIGN KEY (base_resume_id) REFERENCES base_resumes(id)
);
DROP TRIGGER IF EXISTS update_tailored_resumes_modtime ON tailored_resumes;
CREATE TRIGGER update_tailored_resumes_modtime
    BEFORE UPDATE ON tailored_resumes
    FOR EACH ROW EXECUTE PROCEDURE roletect_set_updated_at();

-- 4b. Tailored Cover Letters
CREATE TABLE IF NOT EXISTS tailored_cover_letters (
    id                  TEXT PRIMARY KEY,
    job_id              TEXT NOT NULL,
    base_cl_id          TEXT NOT NULL,
    final_latex_content TEXT NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id)     REFERENCES jobs(id),
    FOREIGN KEY (base_cl_id) REFERENCES base_cover_letters(id)
);
DROP TRIGGER IF EXISTS update_tailored_cover_letters_modtime ON tailored_cover_letters;
CREATE TRIGGER update_tailored_cover_letters_modtime
    BEFORE UPDATE ON tailored_cover_letters
    FOR EACH ROW EXECUTE PROCEDURE roletect_set_updated_at();

-- 5. Compiler State
CREATE TABLE IF NOT EXISTS compiler_state (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    latex_content TEXT NOT NULL,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Downloads
CREATE TABLE IF NOT EXISTS downloads (
    id            TEXT PRIMARY KEY,
    filename      TEXT NOT NULL,
    download_type TEXT NOT NULL,
    job_id        TEXT,
    content_id    TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- 7. Themes
CREATE TABLE IF NOT EXISTS themes (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    config     TEXT NOT NULL,
    is_builtin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Inbox Jobs
CREATE TABLE IF NOT EXISTS inbox_jobs (
    id              TEXT PRIMARY KEY,
    url             TEXT,
    raw_description TEXT NOT NULL,
    status          TEXT DEFAULT 'Pending',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Documents
CREATE TABLE IF NOT EXISTS documents (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    tags             TEXT NOT NULL DEFAULT '',
    starred          INTEGER NOT NULL DEFAULT 0,
    main_file        TEXT,
    last_compiled_at TEXT,
    compile_status   TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DROP TRIGGER IF EXISTS update_documents_modtime ON documents;
CREATE TRIGGER update_documents_modtime
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE PROCEDURE roletect_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_documents_starred ON documents(starred) WHERE starred = 1;

-- 10. Document Files
CREATE TABLE IF NOT EXISTS document_files (
    doc_id     TEXT NOT NULL,
    rel_path   TEXT NOT NULL,
    content    TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (doc_id, rel_path),
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_files_doc ON document_files(doc_id);
"#;
