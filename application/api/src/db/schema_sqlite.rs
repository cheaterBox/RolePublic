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

-- 11. Users
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    avatar_url    TEXT,
    role          TEXT NOT NULL DEFAULT 'User',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS update_users_modtime
    AFTER UPDATE ON users
    BEGIN UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 12. Document Collaborators (RBAC: Owner, Admin, Editor, Commenter, Viewer)
CREATE TABLE IF NOT EXISTS document_collaborators (
    id         TEXT PRIMARY KEY,
    doc_id     TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'Editor',
    invited_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (doc_id, user_id),
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_collab_doc ON document_collaborators(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_collab_user ON document_collaborators(user_id);

-- 13. Document Revisions (Checkpoints & Snapshots)
CREATE TABLE IF NOT EXISTS document_revisions (
    id             TEXT PRIMARY KEY,
    doc_id         TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    title          TEXT NOT NULL,
    snapshot       TEXT NOT NULL,
    created_by     TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (doc_id, version_number),
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_rev_doc ON document_revisions(doc_id);

-- 14. Document Changes (Granular Audit & Who Edited What)
CREATE TABLE IF NOT EXISTS document_changes (
    id          TEXT PRIMARY KEY,
    doc_id      TEXT NOT NULL,
    rel_path    TEXT NOT NULL,
    user_id     TEXT,
    user_name   TEXT NOT NULL DEFAULT 'Anonymous',
    change_type TEXT NOT NULL DEFAULT 'Edit',
    diff_patch  TEXT NOT NULL,
    summary     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_changes_doc ON document_changes(doc_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_changes_file ON document_changes(doc_id, rel_path);

-- 15. Document Margin Comments & Collaborative Review
CREATE TABLE IF NOT EXISTS document_comments (
    id            TEXT PRIMARY KEY,
    doc_id        TEXT NOT NULL,
    rel_path      TEXT NOT NULL,
    user_id       TEXT,
    user_name     TEXT NOT NULL,
    line_number   INTEGER NOT NULL,
    selected_text TEXT,
    content       TEXT NOT NULL,
    resolved      INTEGER DEFAULT 0,
    resolved_by   TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_comments_doc ON document_comments(doc_id);
"#;
