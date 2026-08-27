//! Postgres implementation of the [`Repository`] trait.
//!
//! Mirrors `db/sqlite.rs` one-for-one so a user's data (S3 backup JSON) is
//! indistinguishable between drivers. Differences from the SQLite impl:
//!
//! * Uses `$1, $2, ...` placeholder syntax.
//! * Uses `BOOLEAN` (not `INTEGER`) for boolean columns.
//! * Uses `TIMESTAMP` / `TEXT` interchangeably for date columns — we treat
//!   them as opaque strings, same as SQLite.

use super::schema_postgres::DDL;
use super::{RepoError, RepoResult, Repository};
use crate::config::DbConfig;
use crate::models::*;
use async_trait::async_trait;
use sqlx::{PgPool, Postgres, Row, Transaction};

pub struct PgRepo {
    pool: PgPool,
}

impl PgRepo {
    pub async fn connect(cfg: &DbConfig) -> RepoResult<Self> {
        let pool = sqlx::PgPool::connect(&cfg.url).await?;
        Ok(Self { pool })
    }

    async fn apply_ddl(&self) -> RepoResult<()> {
        let doc_starred_type: Option<String> = sqlx::query_scalar(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'starred'"
        )
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None);

        if let Some(t) = doc_starred_type {
            if t != "boolean" {
                sqlx::query("DROP INDEX IF EXISTS idx_documents_starred; ALTER TABLE documents ALTER COLUMN starred DROP DEFAULT; ALTER TABLE documents ALTER COLUMN starred TYPE BOOLEAN USING (starred::text IN ('1', 'true', 't')); ALTER TABLE documents ALTER COLUMN starred SET DEFAULT FALSE; CREATE INDEX IF NOT EXISTS idx_documents_starred ON documents(starred);")
                    .execute(&self.pool)
                    .await
                    .ok();
            }
        }

        // Ensure document_files.size_bytes is BIGINT
        sqlx::query("ALTER TABLE document_files ALTER COLUMN size_bytes TYPE BIGINT")
            .execute(&self.pool)
            .await
            .ok();

        // Ensure document_comments foreign keys are relaxed for local user IDs
        sqlx::raw_sql("ALTER TABLE document_comments DROP CONSTRAINT IF EXISTS document_comments_user_id_fkey; ALTER TABLE document_comments DROP CONSTRAINT IF EXISTS document_comments_resolved_by_fkey; ALTER TABLE document_collaborators DROP CONSTRAINT IF EXISTS document_collaborators_invited_by_fkey; ALTER TABLE document_revisions DROP CONSTRAINT IF EXISTS document_revisions_created_by_fkey; ALTER TABLE document_changes DROP CONSTRAINT IF EXISTS document_changes_user_id_fkey;")
            .execute(&self.pool)
            .await
            .ok();

        sqlx::raw_sql(DDL).execute(&self.pool).await?;
        Ok(())
    }
}

#[async_trait]
impl Repository for PgRepo {
    async fn init_schema(&self) -> RepoResult<()> {
        self.apply_ddl().await
    }

    async fn run_migrations(&self) -> RepoResult<()> {
        // PG: information_schema gives us the column list cheaply.
        let cols: Vec<String> = sqlx::query_scalar(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs'",
        )
        .fetch_all(&self.pool)
        .await?;

        let missing = [
            "reference_name",
            "reference_email",
            "social_link",
            "custom_instruction",
            "requirements",
            "core_responsibilities",
            "job_url",
            "salary",
            "applied_date",
            "interview_date",
            "offer_date",
            "rejected_date",
            "joining_date",
            "base_resume_id",
            "base_cl_id",
        ];
        for col in missing {
            if !cols.iter().any(|c| c == col) {
                let sql = format!("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS {} TEXT", col);
                sqlx::query(&sql).execute(&self.pool).await.ok();
            }
        }

        // Ensure documents.starred is BOOLEAN
        let doc_starred_type: Option<String> = sqlx::query_scalar(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'starred'"
        )
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None);

        if let Some(t) = doc_starred_type {
            if t != "boolean" {
                sqlx::query("ALTER TABLE documents ALTER COLUMN starred DROP DEFAULT, ALTER COLUMN starred TYPE BOOLEAN USING (starred::text IN ('1', 'true', 't')), ALTER COLUMN starred SET DEFAULT FALSE")
                    .execute(&self.pool)
                    .await
                    .ok();
            }
        }

        // Ensure extension_secret exists
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM app_settings WHERE key = 'extension_secret'")
                .fetch_one(&self.pool)
                .await
                .unwrap_or(0);
        if exists == 0 {
            let secret = nanoid::nanoid!(32);
            sqlx::query("INSERT INTO app_settings (key, value) VALUES ('extension_secret', $1)")
                .bind(&secret)
                .execute(&self.pool)
                .await
                .ok();
        }
        Ok(())
    }

    async fn ping(&self) -> RepoResult<()> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    // ===== Inbox =====
    async fn list_inbox(&self) -> RepoResult<Vec<InboxJob>> {
        let rows = sqlx::query(
            "SELECT id, url, raw_description, status, created_at::text AS created_at
             FROM inbox_jobs ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|r| {
                Ok(InboxJob {
                    id: r.try_get("id")?,
                    url: r.try_get("url")?,
                    raw_description: r.try_get("raw_description")?,
                    status: r.try_get("status")?,
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    async fn get_inbox(&self, id: &str) -> RepoResult<Option<InboxJob>> {
        let row = sqlx::query(
            "SELECT id, url, raw_description, status, created_at::text AS created_at
             FROM inbox_jobs WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| InboxJob {
            id: r.try_get("id").unwrap_or_default(),
            url: r.try_get("url").ok(),
            raw_description: r.try_get("raw_description").unwrap_or_default(),
            status: r.try_get("status").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        }))
    }

    async fn delete_inbox(&self, id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM inbox_jobs WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_all_inbox(&self) -> RepoResult<()> {
        sqlx::query("DELETE FROM inbox_jobs")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn mark_inbox_processed(&self, id: &str) -> RepoResult<()> {
        sqlx::query("UPDATE inbox_jobs SET status = 'Processed' WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_extension_secret(&self) -> RepoResult<Option<String>> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = 'extension_secret'")
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.and_then(|r| r.try_get("value").ok()))
    }

    async fn set_extension_secret(&self, secret: &str) -> RepoResult<()> {
        sqlx::query("UPDATE app_settings SET value = $1 WHERE key = 'extension_secret'")
            .bind(secret)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_active_server_port(&self) -> RepoResult<String> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = 'active_server_port'")
            .fetch_optional(&self.pool)
            .await?;
        Ok(row
            .and_then(|r| r.try_get::<String, _>("value").ok())
            .unwrap_or_else(|| "8080".into()))
    }

    async fn set_active_server_port(&self, port: &str) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO app_settings (key, value) VALUES ('active_server_port', $1)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(port)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn ingest_inbox(&self, url: Option<&str>, raw: &str) -> RepoResult<()> {
        let id = nanoid::nanoid!(10);
        sqlx::query(
            "INSERT INTO inbox_jobs (id, url, raw_description, status) VALUES ($1, $2, $3, 'Pending')",
        )
        .bind(&id)
        .bind(url)
        .bind(raw)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ===== Jobs =====
    async fn list_jobs(&self) -> RepoResult<Vec<JobPayload>> {
        let rows = sqlx::query(
            "SELECT id, company_name, job_title, work_model, employment_type,
                    status, raw_jd, requirements, core_responsibilities,
                    custom_instruction, reference_name, reference_email, social_link, job_url,
                    base_resume_id, base_cl_id, salary,
                    applied_date, interview_date, offer_date, rejected_date, joining_date,
                    created_at::text AS created_at, updated_at::text AS updated_at
             FROM jobs ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(map_job_row).collect()
    }

    async fn get_job(&self, id: &str) -> RepoResult<Option<JobPayload>> {
        let row = sqlx::query(
            "SELECT id, company_name, job_title, work_model, employment_type,
                    status, raw_jd, requirements, core_responsibilities,
                    custom_instruction, reference_name, reference_email, social_link, job_url,
                    base_resume_id, base_cl_id, salary,
                    applied_date, interview_date, offer_date, rejected_date, joining_date,
                    created_at::text AS created_at, updated_at::text AS updated_at
             FROM jobs WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        match row {
            None => Ok(None),
            Some(r) => Ok(Some(map_job_row(r)?)),
        }
    }

    async fn save_job(&self, job: &JobPayload) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO jobs (
                id, company_name, job_title, work_model, employment_type,
                status, raw_jd, requirements, core_responsibilities,
                custom_instruction, reference_name, reference_email, social_link, job_url,
                base_resume_id, base_cl_id, salary,
                applied_date, interview_date, offer_date, rejected_date, joining_date
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)",
        )
        .bind(&job.id)
        .bind(&job.company_name)
        .bind(&job.job_title)
        .bind(&job.work_model)
        .bind(&job.employment_type)
        .bind(&job.status)
        .bind(&job.raw_jd)
        .bind(&job.requirements)
        .bind(&job.core_responsibilities)
        .bind(&job.custom_instruction)
        .bind(&job.reference_name)
        .bind(&job.reference_email)
        .bind(&job.social_link)
        .bind(&job.job_url)
        .bind(&job.base_resume_id)
        .bind(&job.base_cl_id)
        .bind(&job.salary)
        .bind(&job.applied_date)
        .bind(&job.interview_date)
        .bind(&job.offer_date)
        .bind(&job.rejected_date)
        .bind(&job.joining_date)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_job(&self, id: &str) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM downloads WHERE job_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM tailored_cover_letters WHERE job_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM tailored_resumes WHERE job_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM jobs WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn delete_jobs_batch(&self, ids: &[String]) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        for id in ids {
            sqlx::query("DELETE FROM tailored_resumes WHERE job_id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("DELETE FROM tailored_cover_letters WHERE job_id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("DELETE FROM jobs WHERE id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn delete_all_jobs(&self) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM tailored_resumes")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM tailored_cover_letters")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM downloads")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM jobs").execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn update_job_status(
        &self,
        id: &str,
        status: &str,
        metadata: Option<&serde_json::Value>,
    ) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("UPDATE jobs SET status = $1 WHERE id = $2")
            .bind(status)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if let Some(meta) = metadata {
            if let Some(obj) = meta.as_object() {
                for (k, v) in obj {
                    let value = v.as_str().unwrap_or_default();
                    if matches!(
                        k.as_str(),
                        "applied_date"
                            | "interview_date"
                            | "offer_date"
                            | "rejected_date"
                            | "joining_date"
                            | "salary"
                            | "reference_name"
                            | "reference_email"
                            | "social_link"
                            | "custom_instruction"
                    ) {
                        // Whitelist of allowed metadata columns — safe interpolation
                        // because both the column name and the matcher are constants.
                        let col = match k.as_str() {
                            "applied_date" => "applied_date",
                            "interview_date" => "interview_date",
                            "offer_date" => "offer_date",
                            "rejected_date" => "rejected_date",
                            "joining_date" => "joining_date",
                            "salary" => "salary",
                            "reference_name" => "reference_name",
                            "reference_email" => "reference_email",
                            "social_link" => "social_link",
                            "custom_instruction" => "custom_instruction",
                            _ => unreachable!(),
                        };
                        let sql = format!("UPDATE jobs SET {} = $1 WHERE id = $2", col);
                        sqlx::query(&sql)
                            .bind(value)
                            .bind(id)
                            .execute(&mut *tx)
                            .await
                            .ok();
                    }
                }
            }
        }
        tx.commit().await?;
        Ok(())
    }

    async fn update_job_metadata(&self, id: &str, field: &str, value: &str) -> RepoResult<()> {
        // Map whitelisted API names to actual column names to make this safe to interpolate.
        let col = match field {
            "applied_date" => Some("applied_date"),
            "interview_date" => Some("interview_date"),
            "offer_date" => Some("offer_date"),
            "rejected_date" => Some("rejected_date"),
            "joining_date" => Some("joining_date"),
            "salary" => Some("salary"),
            "reference_name" => Some("reference_name"),
            "reference_email" => Some("reference_email"),
            "social_link" => Some("social_link"),
            "custom_instruction" => Some("custom_instruction"),
            _ => None,
        };
        let col =
            col.ok_or_else(|| RepoError::Invalid(format!("field '{}' is not editable", field)))?;
        let sql = format!("UPDATE jobs SET {} = $1 WHERE id = $2", col);
        sqlx::query(&sql)
            .bind(value)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_job_raw_jd(
        &self,
        id: &str,
    ) -> RepoResult<Option<(String, Option<String>, Option<String>)>> {
        let row = sqlx::query(
            "SELECT raw_jd, requirements, core_responsibilities FROM jobs WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| {
            (
                r.try_get("raw_jd").unwrap_or_default(),
                r.try_get("requirements").ok(),
                r.try_get("core_responsibilities").ok(),
            )
        }))
    }

    // ===== Resumes =====
    async fn list_resumes(&self) -> RepoResult<Vec<ResumeItem>> {
        let rows = sqlx::query(
            "SELECT id, name, category, created_at::text AS created_at, updated_at::text AS updated_at
             FROM base_resumes ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|r| {
                Ok(ResumeItem {
                    id: r.try_get("id")?,
                    name: r.try_get("name")?,
                    category: r.try_get("category")?,
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect()
    }

    async fn get_resume(&self, id: &str) -> RepoResult<Option<ResumeDetail>> {
        let row = sqlx::query(
            "SELECT id, name, category, latex_content, created_at::text AS created_at, updated_at::text AS updated_at
             FROM base_resumes WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| ResumeDetail {
            id: r.try_get("id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            category: r.try_get("category").unwrap_or_default(),
            latex_content: r.try_get("latex_content").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            updated_at: r.try_get("updated_at").unwrap_or_default(),
        }))
    }

    async fn create_resume(
        &self,
        name: &str,
        category: &str,
        latex_content: &str,
    ) -> RepoResult<String> {
        let id = nanoid::nanoid!(10);
        sqlx::query(
            "INSERT INTO base_resumes (id, name, category, latex_content) VALUES ($1, $2, $3, $4)",
        )
        .bind(&id)
        .bind(name)
        .bind(category)
        .bind(latex_content)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    async fn update_resume(&self, detail: &ResumeDetail) -> RepoResult<()> {
        sqlx::query(
            "UPDATE base_resumes SET name = $1, category = $2, latex_content = $3 WHERE id = $4",
        )
        .bind(&detail.name)
        .bind(&detail.category)
        .bind(&detail.latex_content)
        .bind(&detail.id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_resume(&self, id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM base_resumes WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn resume_usage_count(&self, id: &str) -> RepoResult<i64> {
        let n: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tailored_resumes WHERE base_resume_id = $1")
                .bind(id)
                .fetch_one(&self.pool)
                .await?;
        Ok(n)
    }

    async fn get_resume_latex(&self, id: &str) -> RepoResult<Option<String>> {
        let row = sqlx::query("SELECT latex_content FROM base_resumes WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("latex_content").ok()))
    }

    async fn save_tailored_resume(
        &self,
        id: &str,
        job_id: &str,
        base_resume_id: &str,
        content: &str,
    ) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO tailored_resumes (id, job_id, base_resume_id, final_latex_content, is_active)
             VALUES ($1, $2, $3, $4, TRUE)",
        )
        .bind(id).bind(job_id).bind(base_resume_id).bind(content)
        .execute(&mut *tx).await?;
        sqlx::query("UPDATE jobs SET base_resume_id = $1 WHERE id = $2")
            .bind(base_resume_id)
            .bind(job_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn update_tailored_resume(&self, id: &str, content: &str) -> RepoResult<()> {
        sqlx::query("UPDATE tailored_resumes SET final_latex_content = $1 WHERE id = $2")
            .bind(content)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_latest_tailored_resume(
        &self,
        job_id: &str,
    ) -> RepoResult<Option<TailoredContent>> {
        let row = sqlx::query(
            "SELECT id, base_resume_id, final_latex_content FROM tailored_resumes
             WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(job_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| TailoredContent {
            id: r.try_get("id").unwrap_or_default(),
            base_template_id: r.try_get("base_resume_id").unwrap_or_default(),
            content: r.try_get("final_latex_content").unwrap_or_default(),
        }))
    }

    async fn get_tailored_resume(&self, id: &str) -> RepoResult<Option<TailoredContent>> {
        let row = sqlx::query(
            "SELECT id, base_resume_id, final_latex_content FROM tailored_resumes WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| TailoredContent {
            id: r.try_get("id").unwrap_or_default(),
            base_template_id: r.try_get("base_resume_id").unwrap_or_default(),
            content: r.try_get("final_latex_content").unwrap_or_default(),
        }))
    }

    // ===== Cover Letters =====
    async fn list_cover_letters(&self) -> RepoResult<Vec<CoverLetterItem>> {
        let rows = sqlx::query(
            "SELECT id, name, category, created_at::text AS created_at, updated_at::text AS updated_at
             FROM base_cover_letters ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|r| {
                Ok(CoverLetterItem {
                    id: r.try_get("id")?,
                    name: r.try_get("name")?,
                    category: r.try_get("category")?,
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect()
    }

    async fn get_cover_letter(&self, id: &str) -> RepoResult<Option<CoverLetterDetail>> {
        let row = sqlx::query(
            "SELECT id, name, category, latex_content, created_at::text AS created_at, updated_at::text AS updated_at
             FROM base_cover_letters WHERE id = $1",
        )
        .bind(id).fetch_optional(&self.pool).await?;
        Ok(row.map(|r| CoverLetterDetail {
            id: r.try_get("id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            category: r.try_get("category").unwrap_or_default(),
            latex_content: r.try_get("latex_content").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            updated_at: r.try_get("updated_at").unwrap_or_default(),
        }))
    }

    async fn create_cover_letter(
        &self,
        name: &str,
        category: &str,
        latex_content: &str,
    ) -> RepoResult<String> {
        let id = nanoid::nanoid!(15);
        sqlx::query("INSERT INTO base_cover_letters (id, name, category, latex_content) VALUES ($1, $2, $3, $4)")
            .bind(&id).bind(name).bind(category).bind(latex_content)
            .execute(&self.pool).await?;
        Ok(id)
    }

    async fn update_cover_letter(&self, detail: &CoverLetterDetail) -> RepoResult<()> {
        sqlx::query("UPDATE base_cover_letters SET name = $1, category = $2, latex_content = $3 WHERE id = $4")
            .bind(&detail.name).bind(&detail.category).bind(&detail.latex_content).bind(&detail.id)
            .execute(&self.pool).await?;
        Ok(())
    }

    async fn delete_cover_letter(&self, id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM base_cover_letters WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn cover_letter_usage_count(&self, id: &str) -> RepoResult<i64> {
        let n: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tailored_cover_letters WHERE base_cl_id = $1")
                .bind(id)
                .fetch_one(&self.pool)
                .await?;
        Ok(n)
    }

    async fn get_cover_letter_latex(&self, id: &str) -> RepoResult<Option<String>> {
        let row = sqlx::query("SELECT latex_content FROM base_cover_letters WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("latex_content").ok()))
    }

    async fn save_tailored_cover_letter(
        &self,
        id: &str,
        job_id: &str,
        base_cl_id: &str,
        content: &str,
    ) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO tailored_cover_letters (id, job_id, base_cl_id, final_latex_content, is_active)
             VALUES ($1, $2, $3, $4, TRUE)",
        )
        .bind(id).bind(job_id).bind(base_cl_id).bind(content)
        .execute(&mut *tx).await?;
        sqlx::query("UPDATE jobs SET base_cl_id = $1 WHERE id = $2")
            .bind(base_cl_id)
            .bind(job_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn update_tailored_cover_letter(&self, id: &str, content: &str) -> RepoResult<()> {
        sqlx::query("UPDATE tailored_cover_letters SET final_latex_content = $1 WHERE id = $2")
            .bind(content)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_latest_tailored_cover_letter(
        &self,
        job_id: &str,
    ) -> RepoResult<Option<TailoredContent>> {
        let row = sqlx::query(
            "SELECT id, base_cl_id, final_latex_content FROM tailored_cover_letters
             WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(job_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| TailoredContent {
            id: r.try_get("id").unwrap_or_default(),
            base_template_id: r.try_get("base_cl_id").unwrap_or_default(),
            content: r.try_get("final_latex_content").unwrap_or_default(),
        }))
    }

    async fn get_tailored_cover_letter(&self, id: &str) -> RepoResult<Option<TailoredContent>> {
        let row = sqlx::query(
            "SELECT id, base_cl_id, final_latex_content FROM tailored_cover_letters WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| TailoredContent {
            id: r.try_get("id").unwrap_or_default(),
            base_template_id: r.try_get("base_cl_id").unwrap_or_default(),
            content: r.try_get("final_latex_content").unwrap_or_default(),
        }))
    }

    // ===== Downloads =====
    async fn list_downloads(&self) -> RepoResult<Vec<DownloadRecord>> {
        let rows = sqlx::query(
            "SELECT id, filename, download_type, job_id, content_id, created_at::text AS created_at
             FROM downloads ORDER BY created_at DESC LIMIT 50",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|r| {
                Ok(DownloadRecord {
                    id: r.try_get("id")?,
                    filename: r.try_get("filename")?,
                    download_type: r.try_get("download_type")?,
                    job_id: r.try_get("job_id").ok(),
                    content_id: r.try_get("content_id").ok(),
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    async fn record_download(
        &self,
        filename: &str,
        download_type: &str,
        job_id: Option<&str>,
        content_id: Option<&str>,
    ) -> RepoResult<()> {
        let id = nanoid::nanoid!(10);
        sqlx::query("INSERT INTO downloads (id, filename, download_type, job_id, content_id) VALUES ($1, $2, $3, $4, $5)")
            .bind(&id).bind(filename).bind(download_type).bind(job_id).bind(content_id)
            .execute(&self.pool).await?;
        Ok(())
    }

    // ===== Themes =====
    async fn list_themes(&self) -> RepoResult<Vec<Theme>> {
        let rows = sqlx::query(
            "SELECT id, name, config, is_builtin FROM themes ORDER BY is_builtin DESC, created_at DESC",
        )
        .fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|r| {
                Ok(Theme {
                    id: r.try_get("id")?,
                    name: r.try_get("name")?,
                    config: r.try_get("config")?,
                    is_builtin: r.try_get::<bool, _>("is_builtin").unwrap_or(false),
                })
            })
            .collect()
    }

    async fn save_custom_theme(&self, id: &str, name: &str, config: &str) -> RepoResult<()> {
        sqlx::query("INSERT INTO themes (id, name, config, is_builtin) VALUES ($1, $2, $3, FALSE)")
            .bind(id)
            .bind(name)
            .bind(config)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_theme(&self, id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM themes WHERE id = $1 AND is_builtin = FALSE")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_active_theme(&self) -> RepoResult<Option<Theme>> {
        let row = sqlx::query(
            "SELECT t.id, t.name, t.config, t.is_builtin FROM themes t
             JOIN app_settings s ON s.value = t.id
             WHERE s.key = 'active_theme_id'",
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| Theme {
            id: r.try_get("id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            config: r.try_get("config").unwrap_or_default(),
            is_builtin: r.try_get::<bool, _>("is_builtin").unwrap_or(false),
        }))
    }

    async fn save_active_theme(&self, id: &str) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO app_settings (key, value) VALUES ('active_theme_id', $1)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn upsert_theme(
        &self,
        id: &str,
        name: &str,
        config: &str,
        is_builtin: bool,
    ) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO themes (id, name, config, is_builtin) VALUES ($1, $2, $3, $4)
             ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, config = EXCLUDED.config, is_builtin = EXCLUDED.is_builtin
             ON CONFLICT(name) DO UPDATE SET id = EXCLUDED.id, config = EXCLUDED.config, is_builtin = EXCLUDED.is_builtin",
        )
        .bind(id).bind(name).bind(config).bind(is_builtin)
        .execute(&self.pool).await?;
        Ok(())
    }

    // ===== Settings (key-value) =====
    async fn get_setting(&self, key: &str, default_value: &str) -> RepoResult<String> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row
            .and_then(|r| r.try_get::<String, _>("value").ok())
            .unwrap_or_else(|| default_value.into()))
    }

    async fn save_setting(&self, key: &str, value: &str) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO app_settings (key, value) VALUES ($1, $2)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ===== AI Config =====
    async fn get_ai_config(&self) -> RepoResult<AiConfig> {
        let provider: String =
            sqlx::query_scalar("SELECT value FROM app_settings WHERE key = 'ai_provider'")
                .fetch_optional(&self.pool)
                .await?
                .unwrap_or_else(|| "openai".into());
        let model: String =
            sqlx::query_scalar("SELECT value FROM app_settings WHERE key = 'ai_model'")
                .fetch_optional(&self.pool)
                .await?
                .unwrap_or_else(|| "gpt-4o".into());
        let has_key: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = 'ai_api_key')",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(AiConfig {
            provider,
            model,
            has_key,
        })
    }

    async fn save_ai_config(
        &self,
        provider: &str,
        model: &str,
        encrypted_key: Option<&str>,
    ) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        Self::upsert_kv_tx(&mut tx, "ai_provider", provider).await?;
        Self::upsert_kv_tx(&mut tx, "ai_model", model).await?;
        if let Some(key) = encrypted_key {
            if !key.is_empty() {
                Self::upsert_kv_tx(&mut tx, "ai_api_key", key).await?;
            }
        }
        tx.commit().await?;
        Ok(())
    }

    async fn get_encrypted_api_key(&self) -> RepoResult<Option<String>> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = 'ai_api_key'")
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("value").ok()))
    }

    // ===== Compiler =====
    async fn get_compiler_state(&self) -> RepoResult<CompilerState> {
        let row = sqlx::query("SELECT latex_content FROM compiler_state WHERE id = 1")
            .fetch_optional(&self.pool)
            .await?;
        Ok(CompilerState {
            latex_content: row
                .and_then(|r| r.try_get::<String, _>("latex_content").ok())
                .unwrap_or_default(),
        })
    }

    async fn save_compiler_state(&self, state: &CompilerState) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO compiler_state (id, latex_content, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET latex_content = EXCLUDED.latex_content, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&state.latex_content).execute(&self.pool).await?;
        Ok(())
    }

    // ===== Documents =====
    async fn list_documents(&self) -> RepoResult<Vec<DocumentSummary>> {
        let rows = sqlx::query(
            "SELECT id, title, description, tags, starred, main_file, last_compiled_at, compile_status,
                    created_at::text AS created_at, updated_at::text AS updated_at
             FROM documents ORDER BY updated_at DESC",
        ).fetch_all(&self.pool).await?;
        rows.into_iter().map(map_document_row).collect()
    }

    async fn get_document(&self, id: &str) -> RepoResult<Option<DocumentSummary>> {
        let row = sqlx::query(
            "SELECT id, title, description, tags, starred, main_file, last_compiled_at, compile_status,
                    created_at::text AS created_at, updated_at::text AS updated_at
             FROM documents WHERE id = $1",
        ).bind(id).fetch_optional(&self.pool).await?;
        match row {
            None => Ok(None),
            Some(r) => Ok(Some(map_document_row(r)?)),
        }
    }

    async fn create_document(
        &self,
        title: &str,
        description: &str,
        tags: &str,
        starred: bool,
    ) -> RepoResult<String> {
        let id = nanoid::nanoid!(10);
        sqlx::query(
            "INSERT INTO documents (id, title, description, tags, starred) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&id).bind(title).bind(description).bind(tags).bind(starred)
        .execute(&self.pool).await?;
        Ok(id)
    }

    async fn update_document(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        tags: Option<&str>,
        starred: Option<bool>,
    ) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        if let Some(t) = title {
            sqlx::query("UPDATE documents SET title = $1 WHERE id = $2")
                .bind(t)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(d) = description {
            sqlx::query("UPDATE documents SET description = $1 WHERE id = $2")
                .bind(d)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(t) = tags {
            sqlx::query("UPDATE documents SET tags = $1 WHERE id = $2")
                .bind(t)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(s) = starred {
            sqlx::query("UPDATE documents SET starred = $1 WHERE id = $2")
                .bind(s)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn delete_document(&self, id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM documents WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_documents_batch(&self, ids: &[String]) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;
        for id in ids {
            sqlx::query("DELETE FROM documents WHERE id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn set_document_main_file(&self, id: &str, rel_path: Option<&str>) -> RepoResult<()> {
        sqlx::query("UPDATE documents SET main_file = $1 WHERE id = $2")
            .bind(rel_path)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_document_main_file(&self, id: &str) -> RepoResult<Option<String>> {
        let row = sqlx::query("SELECT main_file FROM documents WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<Option<String>, _>("main_file").ok().flatten()))
    }

    async fn list_document_files(&self, doc_id: &str) -> RepoResult<Vec<DocumentFileEntry>> {
        let rows = sqlx::query(
            "SELECT rel_path, size_bytes, updated_at::text AS updated_at FROM document_files WHERE doc_id = $1 ORDER BY rel_path",
        ).bind(doc_id).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|r| {
                Ok(DocumentFileEntry {
                    rel_path: r.try_get("rel_path")?,
                    size_bytes: r
                        .try_get::<i64, _>("size_bytes")
                        .or_else(|_| r.try_get::<i32, _>("size_bytes").map(|v| v as i64))
                        .unwrap_or(0) as u64,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect()
    }

    async fn read_document_file(&self, doc_id: &str, rel_path: &str) -> RepoResult<Option<String>> {
        let row =
            sqlx::query("SELECT content FROM document_files WHERE doc_id = $1 AND rel_path = $2")
                .bind(doc_id)
                .bind(rel_path)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("content").ok()))
    }

    async fn write_document_file(
        &self,
        doc_id: &str,
        rel_path: &str,
        content: &str,
    ) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO document_files (doc_id, rel_path, content, size_bytes) VALUES ($1, $2, $3, $4)
             ON CONFLICT(doc_id, rel_path) DO UPDATE SET content = EXCLUDED.content, size_bytes = EXCLUDED.size_bytes, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(doc_id).bind(rel_path).bind(content).bind(content.len() as i64)
        .execute(&self.pool).await?;
        Ok(())
    }

    async fn delete_document_file(&self, doc_id: &str, rel_path: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM document_files WHERE doc_id = $1 AND rel_path = $2")
            .bind(doc_id)
            .bind(rel_path)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn rename_document_file(
        &self,
        doc_id: &str,
        old_path: &str,
        new_name: &str,
    ) -> RepoResult<()> {
        let new_path = if let Some(idx) = old_path.rfind('/') {
            format!("{}/{}", &old_path[..idx], new_name)
        } else {
            new_name.to_string()
        };
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE document_files SET rel_path = $1, updated_at = CURRENT_TIMESTAMP
             WHERE doc_id = $2 AND rel_path = $3",
        )
        .bind(&new_path)
        .bind(doc_id)
        .bind(old_path)
        .execute(&mut *tx)
        .await?;
        let prefix = format!("{}/", old_path);
        let descendants = sqlx::query(
            "SELECT rel_path FROM document_files WHERE doc_id = $1 AND rel_path LIKE $2",
        )
        .bind(doc_id)
        .bind(format!("{}%", prefix))
        .fetch_all(&mut *tx)
        .await?;
        for d in descendants {
            let p: String = d.try_get("rel_path").unwrap_or_default();
            let replaced = format!("{}{}", new_path, &p[old_path.len()..]);
            sqlx::query("UPDATE document_files SET rel_path = $1, updated_at = CURRENT_TIMESTAMP WHERE doc_id = $2 AND rel_path = $3")
                .bind(&replaced).bind(doc_id).bind(&p).execute(&mut *tx).await?;
        }
        if let Some(main) = self.get_document_main_file(doc_id).await? {
            if main == old_path {
                self.set_document_main_file(doc_id, Some(&new_path)).await?;
            } else if main.starts_with(&prefix) {
                let replaced = format!("{}{}", new_path, &main[old_path.len()..]);
                self.set_document_main_file(doc_id, Some(&replaced)).await?;
            }
        }
        tx.commit().await?;
        Ok(())
    }

    async fn document_file_exists(
        &self,
        doc_id: &str,
        parent_rel: Option<&str>,
        name: &str,
    ) -> RepoResult<bool> {
        let path = match parent_rel {
            Some(p) if !p.is_empty() => format!("{}/{}", p, name),
            _ => name.to_string(),
        };
        let n: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM document_files WHERE doc_id = $1 AND rel_path = $2",
        )
        .bind(doc_id)
        .bind(&path)
        .fetch_one(&self.pool)
        .await?;
        Ok(n > 0)
    }

    // ===== Backup / Export =====
    async fn export_all(&self) -> RepoResult<FullBackup> {
        let settings = sqlx::query("SELECT key, value FROM app_settings")
            .fetch_all(&self.pool)
            .await?;
        let app_settings: Vec<SettingExport> = settings
            .into_iter()
            .filter_map(|r| {
                let key: String = r.try_get("key").ok()?;
                let value: String = r.try_get("value").ok()?;
                if is_sensitive_key(&key) {
                    None
                } else {
                    Some(SettingExport { key, value })
                }
            })
            .collect();

        let resume_rows = sqlx::query(
            "SELECT id, name, category, latex_content, created_at::text AS created_at, updated_at::text AS updated_at
             FROM base_resumes",
        )
        .fetch_all(&self.pool)
        .await?;
        let base_resumes: Vec<ResumeDetail> = resume_rows
            .into_iter()
            .map(|r| {
                Ok::<ResumeDetail, sqlx::Error>(ResumeDetail {
                    id: r.try_get("id")?,
                    name: r.try_get("name")?,
                    category: r.try_get("category")?,
                    latex_content: r.try_get("latex_content")?,
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let cl_rows = sqlx::query(
            "SELECT id, name, category, latex_content, created_at::text AS created_at, updated_at::text AS updated_at
             FROM base_cover_letters",
        )
        .fetch_all(&self.pool)
        .await?;
        let base_cover_letters: Vec<CoverLetterDetail> = cl_rows
            .into_iter()
            .map(|r| {
                Ok::<CoverLetterDetail, sqlx::Error>(CoverLetterDetail {
                    id: r.try_get("id")?,
                    name: r.try_get("name")?,
                    category: r.try_get("category")?,
                    latex_content: r.try_get("latex_content")?,
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let jobs = self.list_jobs().await?;

        let tailored_resume_rows = sqlx::query(
            "SELECT id, job_id, base_resume_id, final_latex_content, is_active,
                    created_at::text AS created_at, updated_at::text AS updated_at
             FROM tailored_resumes",
        )
        .fetch_all(&self.pool)
        .await?;
        let tailored_resumes: Vec<TailoredResumeExport> = tailored_resume_rows
            .into_iter()
            .map(|r| {
                Ok::<TailoredResumeExport, sqlx::Error>(TailoredResumeExport {
                    id: r.try_get("id")?,
                    job_id: r.try_get("job_id")?,
                    base_resume_id: r.try_get("base_resume_id")?,
                    final_latex_content: r.try_get("final_latex_content")?,
                    is_active: r.try_get::<bool, _>("is_active").unwrap_or(true),
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let tailored_cl_rows = sqlx::query(
            "SELECT id, job_id, base_cl_id, final_latex_content, is_active,
                    created_at::text AS created_at, updated_at::text AS updated_at
             FROM tailored_cover_letters",
        )
        .fetch_all(&self.pool)
        .await?;
        let tailored_cover_letters: Vec<TailoredCoverLetterExport> = tailored_cl_rows
            .into_iter()
            .map(|r| {
                Ok::<TailoredCoverLetterExport, sqlx::Error>(TailoredCoverLetterExport {
                    id: r.try_get("id")?,
                    job_id: r.try_get("job_id")?,
                    base_cl_id: r.try_get("base_cl_id")?,
                    final_latex_content: r.try_get("final_latex_content")?,
                    is_active: r.try_get::<bool, _>("is_active").unwrap_or(true),
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let compiler_state: Option<String> =
            sqlx::query_scalar("SELECT latex_content FROM compiler_state WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;

        let downloads = self.list_downloads().await?;

        let theme_rows = sqlx::query(
            "SELECT id, name, config, is_builtin, created_at::text AS created_at FROM themes",
        )
        .fetch_all(&self.pool)
        .await?;
        let themes: Vec<ThemeExport> = theme_rows
            .into_iter()
            .map(|r| {
                Ok::<ThemeExport, sqlx::Error>(ThemeExport {
                    id: r.try_get("id")?,
                    name: r.try_get("name")?,
                    config: r.try_get("config")?,
                    is_builtin: r.try_get::<bool, _>("is_builtin").unwrap_or(false),
                    created_at: r.try_get("created_at").ok(),
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let inbox_jobs = self.list_inbox().await?;
        let documents = self.list_documents().await?;

        let df_rows = sqlx::query(
            "SELECT doc_id, rel_path, content, size_bytes, updated_at::text AS updated_at FROM document_files",
        )
        .fetch_all(&self.pool)
        .await?;
        let document_files: Vec<DocumentFileExport> = df_rows
            .into_iter()
            .map(|r| {
                Ok::<DocumentFileExport, sqlx::Error>(DocumentFileExport {
                    doc_id: r.try_get("doc_id")?,
                    rel_path: r.try_get("rel_path")?,
                    content: r.try_get("content")?,
                    size_bytes: r
                        .try_get::<i64, _>("size_bytes")
                        .or_else(|_| r.try_get::<i32, _>("size_bytes").map(|v| v as i64))
                        .unwrap_or(0),
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(FullBackup {
            version: Some(1),
            exported_at: chrono::Local::now().to_rfc3339(),
            jobs,
            base_resumes,
            base_cover_letters,
            tailored_resumes,
            tailored_cover_letters,
            downloads,
            themes,
            app_settings,
            inbox_jobs,
            compiler_state,
            documents,
            document_files,
        })
    }

    async fn import_all(&self, backup: &FullBackup) -> RepoResult<()> {
        let mut tx = self.pool.begin().await?;

        // Pre-snapshot local sensitive settings
        let sensitive_rows = sqlx::query("SELECT key, value FROM app_settings")
            .fetch_all(&mut *tx)
            .await?;
        let sensitive_snapshot: Vec<(String, String)> = sensitive_rows
            .into_iter()
            .filter_map(|r| {
                let k: String = r.try_get("key").ok()?;
                let v: String = r.try_get("value").ok()?;
                if is_sensitive_key(&k) {
                    Some((k, v))
                } else {
                    None
                }
            })
            .collect();

        // Clear existing rows (children first for foreign key integrity)
        sqlx::query("DELETE FROM document_files")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM documents")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM inbox_jobs")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM tailored_resumes")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM tailored_cover_letters")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM downloads")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM jobs").execute(&mut *tx).await?;
        sqlx::query("DELETE FROM base_resumes")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM base_cover_letters")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM themes WHERE is_builtin = FALSE")
            .execute(&mut *tx)
            .await?;

        // 1. Settings (filter out any incoming sensitive keys)
        for s in &backup.app_settings {
            if is_sensitive_key(&s.key) {
                continue;
            }
            Self::upsert_kv_tx(&mut tx, &s.key, &s.value).await?;
        }

        // 2. Base Resumes
        for r in &backup.base_resumes {
            sqlx::query(
                "INSERT INTO base_resumes (id, name, category, latex_content, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp)
                 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, latex_content=EXCLUDED.latex_content, updated_at=EXCLUDED.updated_at",
            )
            .bind(&r.id).bind(&r.name).bind(&r.category).bind(&r.latex_content)
            .bind(&r.created_at).bind(&r.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // 2b. Base Cover Letters
        for r in &backup.base_cover_letters {
            sqlx::query(
                "INSERT INTO base_cover_letters (id, name, category, latex_content, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp)
                 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, latex_content=EXCLUDED.latex_content, updated_at=EXCLUDED.updated_at",
            )
            .bind(&r.id).bind(&r.name).bind(&r.category).bind(&r.latex_content)
            .bind(&r.created_at).bind(&r.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // 3. Jobs
        for j in &backup.jobs {
            sqlx::query(
                "INSERT INTO jobs (id, company_name, job_title, work_model, employment_type, status, raw_jd,
                    requirements, core_responsibilities, custom_instruction, reference_name, reference_email,
                    social_link, job_url, base_resume_id, base_cl_id, salary, applied_date, interview_date,
                    offer_date, rejected_date, joining_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::timestamp, $24::timestamp)
                 ON CONFLICT(id) DO UPDATE SET company_name=EXCLUDED.company_name, job_title=EXCLUDED.job_title, work_model=EXCLUDED.work_model,
                    employment_type=EXCLUDED.employment_type, status=EXCLUDED.status, raw_jd=EXCLUDED.raw_jd, requirements=EXCLUDED.requirements,
                    core_responsibilities=EXCLUDED.core_responsibilities, custom_instruction=EXCLUDED.custom_instruction, reference_name=EXCLUDED.reference_name,
                    reference_email=EXCLUDED.reference_email, social_link=EXCLUDED.social_link, job_url=EXCLUDED.job_url, base_resume_id=EXCLUDED.base_resume_id,
                    base_cl_id=EXCLUDED.base_cl_id, salary=EXCLUDED.salary, applied_date=EXCLUDED.applied_date, interview_date=EXCLUDED.interview_date,
                    offer_date=EXCLUDED.offer_date, rejected_date=EXCLUDED.rejected_date, joining_date=EXCLUDED.joining_date, updated_at=EXCLUDED.updated_at",
            )
            .bind(&j.id).bind(&j.company_name).bind(&j.job_title).bind(&j.work_model).bind(&j.employment_type)
            .bind(&j.status).bind(&j.raw_jd).bind(&j.requirements).bind(&j.core_responsibilities)
            .bind(&j.custom_instruction).bind(&j.reference_name).bind(&j.reference_email).bind(&j.social_link)
            .bind(&j.job_url).bind(&j.base_resume_id).bind(&j.base_cl_id).bind(&j.salary)
            .bind(&j.applied_date).bind(&j.interview_date).bind(&j.offer_date).bind(&j.rejected_date)
            .bind(&j.joining_date).bind(&j.created_at).bind(&j.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // 4. Tailored Resumes
        for t in &backup.tailored_resumes {
            sqlx::query(
                "INSERT INTO tailored_resumes (id, job_id, base_resume_id, final_latex_content, is_active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp)
                 ON CONFLICT(id) DO UPDATE SET final_latex_content=EXCLUDED.final_latex_content, is_active=EXCLUDED.is_active, updated_at=EXCLUDED.updated_at",
            )
            .bind(&t.id).bind(&t.job_id).bind(&t.base_resume_id).bind(&t.final_latex_content)
            .bind(t.is_active).bind(&t.created_at).bind(&t.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // 4b. Tailored Cover Letters
        for t in &backup.tailored_cover_letters {
            sqlx::query(
                "INSERT INTO tailored_cover_letters (id, job_id, base_cl_id, final_latex_content, is_active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp)
                 ON CONFLICT(id) DO UPDATE SET final_latex_content=EXCLUDED.final_latex_content, is_active=EXCLUDED.is_active, updated_at=EXCLUDED.updated_at",
            )
            .bind(&t.id).bind(&t.job_id).bind(&t.base_cl_id).bind(&t.final_latex_content)
            .bind(t.is_active).bind(&t.created_at).bind(&t.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // 5. Compiler State
        if let Some(content) = &backup.compiler_state {
            sqlx::query(
                "INSERT INTO compiler_state (id, latex_content, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET latex_content = EXCLUDED.latex_content, updated_at = CURRENT_TIMESTAMP",
            )
            .bind(content).execute(&mut *tx).await.ok();
        }

        // 6. Downloads
        for d in &backup.downloads {
            sqlx::query(
                "INSERT INTO downloads (id, filename, download_type, job_id, content_id, created_at) VALUES ($1, $2, $3, $4, $5, $6::timestamp)
                 ON CONFLICT(id) DO NOTHING",
            )
            .bind(&d.id).bind(&d.filename).bind(&d.download_type).bind(&d.job_id).bind(&d.content_id).bind(&d.created_at)
            .execute(&mut *tx).await.ok();
        }

        // 7. Custom Themes
        for t in &backup.themes {
            if t.is_builtin {
                continue;
            }
            sqlx::query(
                "INSERT INTO themes (id, name, config, is_builtin) VALUES ($1, $2, $3, FALSE)
                 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, config=EXCLUDED.config",
            )
            .bind(&t.id)
            .bind(&t.name)
            .bind(&t.config)
            .execute(&mut *tx)
            .await
            .ok();
        }

        // 8. Inbox Jobs
        for j in &backup.inbox_jobs {
            sqlx::query(
                "INSERT INTO inbox_jobs (id, url, raw_description, status, created_at) VALUES ($1, $2, $3, $4, $5::timestamp)
                 ON CONFLICT(id) DO UPDATE SET url=EXCLUDED.url, raw_description=EXCLUDED.raw_description, status=EXCLUDED.status",
            )
            .bind(&j.id).bind(&j.url).bind(&j.raw_description).bind(&j.status).bind(&j.created_at)
            .execute(&mut *tx).await.ok();
        }

        // 9. Documents
        for d in &backup.documents {
            sqlx::query(
                "INSERT INTO documents (id, title, description, tags, starred, main_file, last_compiled_at, compile_status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamp, $10::timestamp)
                 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, tags=EXCLUDED.tags, starred=EXCLUDED.starred,
                    main_file=EXCLUDED.main_file, last_compiled_at=EXCLUDED.last_compiled_at, compile_status=EXCLUDED.compile_status, updated_at=EXCLUDED.updated_at",
            )
            .bind(&d.id).bind(&d.title).bind(&d.description).bind(&d.tags).bind(d.starred)
            .bind(&d.main_file).bind(&d.last_compiled_at).bind(&d.compile_status).bind(&d.created_at).bind(&d.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // 10. Document Files
        for f in &backup.document_files {
            sqlx::query(
                "INSERT INTO document_files (doc_id, rel_path, content, size_bytes, updated_at) VALUES ($1, $2, $3, $4, $5::timestamp)
                 ON CONFLICT(doc_id, rel_path) DO NOTHING",
            )
            .bind(&f.doc_id).bind(&f.rel_path).bind(&f.content).bind(f.size_bytes).bind(&f.updated_at)
            .execute(&mut *tx).await.ok();
        }

        // Restore local sensitive settings
        for (k, v) in &sensitive_snapshot {
            Self::upsert_kv_tx(&mut tx, k, v).await?;
        }

        tx.commit().await?;
        Ok(())
    }

    // =========================================================================
    // Users & Authentication
    // =========================================================================

    async fn create_user(
        &self,
        email: &str,
        password_hash: &str,
        full_name: &str,
    ) -> RepoResult<User> {
        let id = nanoid::nanoid!(16);
        let row = sqlx::query(
            "INSERT INTO users (id, email, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4, 'User')
             RETURNING id, email, password_hash, full_name, avatar_url, role,
                       to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at,
                       to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as updated_at",
        )
        .bind(&id)
        .bind(email)
        .bind(password_hash)
        .bind(full_name)
        .fetch_one(&self.pool)
        .await?;

        Ok(User {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            password_hash: row.try_get("password_hash")?,
            full_name: row.try_get("full_name")?,
            avatar_url: row.try_get("avatar_url").ok(),
            role: row.try_get("role")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }

    async fn get_user_by_email(&self, email: &str) -> RepoResult<Option<User>> {
        let row = sqlx::query(
            "SELECT id, email, password_hash, full_name, avatar_url, role,
                    to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as updated_at
             FROM users WHERE lower(email) = lower($1)",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| User {
            id: r.try_get("id").unwrap_or_default(),
            email: r.try_get("email").unwrap_or_default(),
            password_hash: r.try_get("password_hash").unwrap_or_default(),
            full_name: r.try_get("full_name").unwrap_or_default(),
            avatar_url: r.try_get("avatar_url").ok(),
            role: r.try_get("role").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            updated_at: r.try_get("updated_at").unwrap_or_default(),
        }))
    }

    async fn get_user_by_id(&self, id: &str) -> RepoResult<Option<User>> {
        let row = sqlx::query(
            "SELECT id, email, password_hash, full_name, avatar_url, role,
                    to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as updated_at
             FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| User {
            id: r.try_get("id").unwrap_or_default(),
            email: r.try_get("email").unwrap_or_default(),
            password_hash: r.try_get("password_hash").unwrap_or_default(),
            full_name: r.try_get("full_name").unwrap_or_default(),
            avatar_url: r.try_get("avatar_url").ok(),
            role: r.try_get("role").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            updated_at: r.try_get("updated_at").unwrap_or_default(),
        }))
    }

    // =========================================================================
    // Document Collaborators (RBAC)
    // =========================================================================

    async fn list_document_collaborators(
        &self,
        doc_id: &str,
    ) -> RepoResult<Vec<DocumentCollaboratorEntry>> {
        let rows = sqlx::query(
            "SELECT c.id, c.doc_id, c.user_id, u.email, u.full_name, u.avatar_url, c.role, c.invited_by,
                    to_char(c.created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at
             FROM document_collaborators c
             JOIN users u ON c.user_id = u.id
             WHERE c.doc_id = $1
             ORDER BY c.created_at ASC",
        )
        .bind(doc_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|r| {
                Ok(DocumentCollaboratorEntry {
                    id: r.try_get("id")?,
                    doc_id: r.try_get("doc_id")?,
                    user_id: r.try_get("user_id")?,
                    email: r.try_get("email")?,
                    full_name: r.try_get("full_name")?,
                    avatar_url: r.try_get("avatar_url").ok(),
                    role: r.try_get("role")?,
                    invited_by: r.try_get("invited_by").ok(),
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    async fn add_document_collaborator(
        &self,
        doc_id: &str,
        user_id: &str,
        role: &str,
        invited_by: Option<&str>,
    ) -> RepoResult<()> {
        let id = nanoid::nanoid!(16);
        sqlx::query(
            "INSERT INTO document_collaborators (id, doc_id, user_id, role, invited_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT(doc_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(id)
        .bind(doc_id)
        .bind(user_id)
        .bind(role)
        .bind(invited_by)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn update_document_collaborator_role(
        &self,
        doc_id: &str,
        user_id: &str,
        role: &str,
    ) -> RepoResult<()> {
        sqlx::query(
            "UPDATE document_collaborators SET role = $1, updated_at = CURRENT_TIMESTAMP
             WHERE doc_id = $2 AND user_id = $3",
        )
        .bind(role)
        .bind(doc_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn remove_document_collaborator(&self, doc_id: &str, user_id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM document_collaborators WHERE doc_id = $1 AND user_id = $2")
            .bind(doc_id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_user_doc_role(
        &self,
        doc_id: &str,
        user_id: &str,
    ) -> RepoResult<Option<CollaboratorRole>> {
        let role_str: Option<String> = sqlx::query_scalar(
            "SELECT role FROM document_collaborators WHERE doc_id = $1 AND user_id = $2",
        )
        .bind(doc_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(role_str.as_deref().map(CollaboratorRole::parse))
    }

    // =========================================================================
    // Document Revisions (Checkpoints & Snapshots)
    // =========================================================================

    async fn list_document_revisions(
        &self,
        doc_id: &str,
    ) -> RepoResult<Vec<DocumentRevisionEntry>> {
        let rows = sqlx::query(
            "SELECT r.id, r.doc_id, r.version_number, r.title, u.full_name as created_by_name,
                    to_char(r.created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at
             FROM document_revisions r
             LEFT JOIN users u ON r.created_by = u.id
             WHERE r.doc_id = $1
             ORDER BY r.version_number DESC",
        )
        .bind(doc_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|r| {
                Ok(DocumentRevisionEntry {
                    id: r.try_get("id")?,
                    doc_id: r.try_get("doc_id")?,
                    version_number: r.try_get("version_number")?,
                    title: r.try_get("title")?,
                    created_by_name: r.try_get("created_by_name").ok(),
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    async fn create_document_revision(
        &self,
        doc_id: &str,
        title: &str,
        created_by: Option<&str>,
    ) -> RepoResult<DocumentRevisionEntry> {
        let id = nanoid::nanoid!(16);
        let next_ver: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM document_revisions WHERE doc_id = $1",
        )
        .bind(doc_id)
        .fetch_one(&self.pool)
        .await?;

        let files = self.list_document_files(doc_id).await?;
        let mut file_exports = Vec::new();
        for f in files {
            if let Some(content) = self.read_document_file(doc_id, &f.rel_path).await? {
                file_exports.push(DocumentFileExport {
                    doc_id: doc_id.to_string(),
                    rel_path: f.rel_path,
                    content,
                    size_bytes: f.size_bytes as i64,
                    updated_at: f.updated_at,
                });
            }
        }
        let snapshot = serde_json::to_string(&file_exports).unwrap_or_else(|_| "[]".to_string());

        let row = sqlx::query(
            "INSERT INTO document_revisions (id, doc_id, version_number, title, snapshot, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, doc_id, version_number, title,
                       to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at",
        )
        .bind(&id)
        .bind(doc_id)
        .bind(next_ver)
        .bind(title)
        .bind(&snapshot)
        .bind(created_by)
        .fetch_one(&self.pool)
        .await?;

        let creator_name: Option<String> = if let Some(uid) = created_by {
            sqlx::query_scalar("SELECT full_name FROM users WHERE id = $1")
                .bind(uid)
                .fetch_optional(&self.pool)
                .await?
        } else {
            None
        };

        Ok(DocumentRevisionEntry {
            id: row.try_get("id")?,
            doc_id: row.try_get("doc_id")?,
            version_number: row.try_get("version_number")?,
            title: row.try_get("title")?,
            created_by_name: creator_name,
            created_at: row.try_get("created_at")?,
        })
    }

    async fn get_document_revision_snapshot(
        &self,
        doc_id: &str,
        revision_id: &str,
    ) -> RepoResult<Option<String>> {
        let snap: Option<String> = sqlx::query_scalar(
            "SELECT snapshot FROM document_revisions WHERE doc_id = $1 AND (id = $2 OR version_number = CAST(NULLIF($2, '') AS INTEGER))",
        )
        .bind(doc_id)
        .bind(revision_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(snap)
    }

    // =========================================================================
    // Granular Edit History & Audit ("Who edited what")
    // =========================================================================

    async fn record_document_change(
        &self,
        params: crate::models::RecordChangeParams<'_>,
    ) -> RepoResult<()> {
        let id = nanoid::nanoid!(16);
        sqlx::query(
            "INSERT INTO document_changes (id, doc_id, rel_path, user_id, user_name, change_type, diff_patch, summary)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(id)
        .bind(params.doc_id)
        .bind(params.rel_path)
        .bind(params.user_id)
        .bind(params.user_name)
        .bind(params.change_type)
        .bind(params.diff_patch)
        .bind(params.summary)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_document_changes(
        &self,
        doc_id: &str,
        limit: i64,
    ) -> RepoResult<Vec<DocumentChangeEntry>> {
        let rows = sqlx::query(
            "SELECT id, doc_id, rel_path, user_id, user_name, change_type, diff_patch, summary,
                    to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at
             FROM document_changes
             WHERE doc_id = $1
             ORDER BY created_at DESC
             LIMIT $2",
        )
        .bind(doc_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|r| {
                Ok(DocumentChangeEntry {
                    id: r.try_get("id")?,
                    doc_id: r.try_get("doc_id")?,
                    rel_path: r.try_get("rel_path")?,
                    user_id: r.try_get("user_id").ok(),
                    user_name: r.try_get("user_name")?,
                    change_type: r.try_get("change_type")?,
                    diff_patch: r.try_get("diff_patch")?,
                    summary: r.try_get("summary").ok(),
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    async fn list_file_changes(
        &self,
        doc_id: &str,
        rel_path: &str,
    ) -> RepoResult<Vec<DocumentChangeEntry>> {
        let rows = sqlx::query(
            "SELECT id, doc_id, rel_path, user_id, user_name, change_type, diff_patch, summary,
                    to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at
             FROM document_changes
             WHERE doc_id = $1 AND rel_path = $2
             ORDER BY created_at DESC
             LIMIT 100",
        )
        .bind(doc_id)
        .bind(rel_path)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|r| {
                Ok(DocumentChangeEntry {
                    id: r.try_get("id")?,
                    doc_id: r.try_get("doc_id")?,
                    rel_path: r.try_get("rel_path")?,
                    user_id: r.try_get("user_id").ok(),
                    user_name: r.try_get("user_name")?,
                    change_type: r.try_get("change_type")?,
                    diff_patch: r.try_get("diff_patch")?,
                    summary: r.try_get("summary").ok(),
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    // =========================================================================
    // Document Margin Comments & Annotations
    // =========================================================================

    async fn list_document_comments(
        &self,
        doc_id: &str,
        rel_path: Option<&str>,
    ) -> RepoResult<Vec<DocumentCommentEntry>> {
        let sql = if rel_path.is_some() {
            "SELECT id, doc_id, rel_path, user_id, user_name, line_number, selected_text, content, resolved, resolved_by,
                    to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as updated_at
             FROM document_comments
             WHERE doc_id = $1 AND rel_path = $2
             ORDER BY line_number ASC, created_at ASC"
        } else {
            "SELECT id, doc_id, rel_path, user_id, user_name, line_number, selected_text, content, resolved, resolved_by,
                    to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as updated_at
             FROM document_comments
             WHERE doc_id = $1
             ORDER BY rel_path ASC, line_number ASC, created_at ASC"
        };

        let mut q = sqlx::query(sql).bind(doc_id);
        if let Some(rp) = rel_path {
            q = q.bind(rp);
        }
        let rows = q.fetch_all(&self.pool).await?;

        rows.into_iter()
            .map(|r| {
                Ok(DocumentCommentEntry {
                    id: r.try_get("id")?,
                    doc_id: r.try_get("doc_id")?,
                    rel_path: r.try_get("rel_path")?,
                    user_id: r.try_get("user_id").ok(),
                    user_name: r.try_get("user_name")?,
                    line_number: r.try_get("line_number")?,
                    selected_text: r.try_get("selected_text").ok(),
                    content: r.try_get("content")?,
                    resolved: r.try_get("resolved")?,
                    resolved_by: r.try_get("resolved_by").ok(),
                    created_at: r.try_get("created_at")?,
                    updated_at: r.try_get("updated_at")?,
                })
            })
            .collect()
    }

    async fn create_document_comment(
        &self,
        params: crate::models::CreateCommentParams<'_>,
    ) -> RepoResult<String> {
        let id = nanoid::nanoid!(16);
        sqlx::query(
            "INSERT INTO document_comments (id, doc_id, rel_path, user_id, user_name, line_number, selected_text, content, resolved)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)",
        )
        .bind(&id)
        .bind(params.doc_id)
        .bind(params.rel_path)
        .bind(params.user_id)
        .bind(params.user_name)
        .bind(params.line_number)
        .bind(params.selected_text)
        .bind(params.content)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    async fn resolve_document_comment(
        &self,
        comment_id: &str,
        resolved: bool,
        resolved_by: Option<&str>,
    ) -> RepoResult<()> {
        sqlx::query(
            "UPDATE document_comments SET resolved = $1, resolved_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3",
        )
        .bind(resolved)
        .bind(resolved_by)
        .bind(comment_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_document_comment(&self, comment_id: &str) -> RepoResult<()> {
        sqlx::query("DELETE FROM document_comments WHERE id = $1")
            .bind(comment_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

// ===== helpers =====
impl PgRepo {
    async fn upsert_kv_tx(
        tx: &mut Transaction<'_, Postgres>,
        key: &str,
        value: &str,
    ) -> RepoResult<()> {
        sqlx::query(
            "INSERT INTO app_settings (key, value) VALUES ($1, $2)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(value)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }
}

fn map_job_row(r: sqlx::postgres::PgRow) -> RepoResult<JobPayload> {
    Ok(JobPayload {
        id: r.try_get("id")?,
        company_name: r.try_get("company_name")?,
        job_title: r.try_get("job_title")?,
        work_model: r.try_get("work_model")?,
        employment_type: r.try_get("employment_type")?,
        status: r.try_get("status")?,
        raw_jd: r.try_get("raw_jd")?,
        requirements: r.try_get("requirements").ok(),
        core_responsibilities: r.try_get("core_responsibilities").ok(),
        custom_instruction: r.try_get("custom_instruction").ok(),
        reference_name: r.try_get("reference_name").ok(),
        reference_email: r.try_get("reference_email").ok(),
        social_link: r.try_get("social_link").ok(),
        job_url: r.try_get("job_url").ok(),
        base_resume_id: r.try_get("base_resume_id").ok(),
        base_cl_id: r.try_get("base_cl_id").ok(),
        salary: r.try_get("salary").ok(),
        applied_date: r.try_get("applied_date").ok(),
        interview_date: r.try_get("interview_date").ok(),
        offer_date: r.try_get("offer_date").ok(),
        rejected_date: r.try_get("rejected_date").ok(),
        joining_date: r.try_get("joining_date").ok(),
        created_at: r.try_get("created_at").ok(),
        updated_at: r.try_get("updated_at").ok(),
    })
}

fn map_document_row(r: sqlx::postgres::PgRow) -> RepoResult<DocumentSummary> {
    Ok(DocumentSummary {
        id: r.try_get("id")?,
        title: r.try_get("title")?,
        description: r.try_get("description")?,
        tags: r.try_get("tags")?,
        starred: r.try_get::<bool, _>("starred").unwrap_or(false),
        main_file: r.try_get("main_file").ok(),
        last_compiled_at: r.try_get("last_compiled_at").ok(),
        compile_status: r.try_get("compile_status").ok(),
        created_at: r.try_get("created_at")?,
        updated_at: r.try_get("updated_at")?,
    })
}
