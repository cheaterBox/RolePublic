//! Typed configuration loaded from environment variables.
//!
//! SECURITY: Secrets are wrapped in `SecretString` which prevents accidental
//! logging. The struct NEVER implements `Display`/`Debug` to print raw values.

use std::env;
use std::fmt;
use std::path::PathBuf;

/// A wrapper around a secret string that prevents accidental logging or display.
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SecretString(***REDACTED***)")
    }
}

impl From<String> for SecretString {
    fn from(s: String) -> Self {
        Self(s)
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: String,
    pub db: DbConfig,
    pub auth: AuthConfig,
    pub data_dir: PathBuf,
    pub tectonic_cache_dir: PathBuf,
    pub s3: Option<S3Config>,
    pub log_format: LogFormat,
    pub request_body_limit: usize,
    pub rate_limit_rpm: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DbDriver {
    Sqlite,
    Postgres,
}

impl DbDriver {
    pub fn parse(s: &str) -> Result<Self, ConfigError> {
        match s.trim().to_lowercase().as_str() {
            "sqlite" | "sqlite3" => Ok(DbDriver::Sqlite),
            "postgres" | "postgresql" | "pg" => Ok(DbDriver::Postgres),
            other => Err(ConfigError::Invalid(format!(
                "DB_DRIVER '{}' is invalid. Use 'sqlite' or 'postgres'.",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DbConfig {
    pub driver: DbDriver,
    /// The full SQLx connection URL. For sqlite, this is `sqlite:///path/to.db`
    /// or `sqlite::memory:`. For postgres, `postgres://user:pass@host/db`.
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// Bearer token required for all `/api/*` routes except `/health`,
    /// `/inbox/ingest`, and `/static/*`.
    pub api_token: SecretString,
    /// Whether to require the API token on `/api/*` routes.
    pub require_token: bool,
}

#[derive(Debug, Clone)]
pub struct S3Config {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: SecretString,
    pub secret_key: SecretString,
    pub force_path_style: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Json,
    Pretty,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Missing required env var: {0}")]
    Missing(&'static str),
    #[error("Invalid value: {0}")]
    Invalid(String),
}

impl Config {
    /// Load and validate configuration from environment.
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());

        let driver_str = env::var("DB_DRIVER").unwrap_or_else(|_| "sqlite".into());
        let driver = DbDriver::parse(&driver_str)?;
        let max_connections = env::var("DB_MAX_CONNECTIONS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10);

        let url = match driver {
            DbDriver::Sqlite => {
                let default_path = if std::path::Path::new("/.dockerenv").exists() {
                    "/data/roletect.db"
                } else {
                    "./data/roletect.db"
                };
                let path = env::var("DATABASE_URL").unwrap_or_else(|_| default_path.into());
                if path.starts_with("sqlite:") || path.starts_with("sqlite://") {
                    path
                } else {
                    format!("sqlite://{}", path)
                }
            }
            DbDriver::Postgres => env::var("DATABASE_URL").map_err(|_| {
                ConfigError::Missing("DATABASE_URL (required when DB_DRIVER=postgres)")
            })?,
        };

        let api_token = env::var("ROLETECT_API_TOKEN")
            .map_err(|_| ConfigError::Missing("ROLETECT_API_TOKEN"))?;
        if api_token.len() < 16 {
            return Err(ConfigError::Invalid(
                "ROLETECT_API_TOKEN must be at least 16 characters".into(),
            ));
        }

        let data_dir = PathBuf::from(env::var("ROLETECT_DATA_DIR").unwrap_or_else(|_| {
            if std::path::Path::new("/.dockerenv").exists() {
                "/data".into()
            } else {
                "./data".into()
            }
        }));
        let tectonic_cache_dir = PathBuf::from(
            env::var("TECTONIC_CACHE_DIR")
                .unwrap_or_else(|_| format!("{}/tectonic-cache", data_dir.display())),
        );

        let s3 = if env::var("S3_BUCKET").is_ok() {
            Some(S3Config {
                endpoint: env::var("S3_ENDPOINT").unwrap_or_default(),
                region: env::var("S3_REGION").unwrap_or_else(|_| "auto".into()),
                bucket: env::var("S3_BUCKET").map_err(|_| ConfigError::Missing("S3_BUCKET"))?,
                access_key: env::var("S3_ACCESS_KEY")
                    .map_err(|_| ConfigError::Missing("S3_ACCESS_KEY"))?
                    .into(),
                secret_key: env::var("S3_SECRET_KEY")
                    .map_err(|_| ConfigError::Missing("S3_SECRET_KEY"))?
                    .into(),
                force_path_style: env::var("S3_FORCE_PATH_STYLE")
                    .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
                    .unwrap_or(false),
            })
        } else {
            None
        };

        let log_format = match env::var("LOG_FORMAT").as_deref() {
            Ok("pretty") => LogFormat::Pretty,
            _ => LogFormat::Json,
        };

        let request_body_limit = env::var("REQUEST_BODY_LIMIT_BYTES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10 * 1024 * 1024); // 10 MB default

        let rate_limit_rpm = env::var("RATE_LIMIT_RPM")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(120);

        Ok(Self {
            bind_addr,
            db: DbConfig {
                driver,
                url,
                max_connections,
            },
            auth: AuthConfig {
                api_token: api_token.into(),
                require_token: true,
            },
            data_dir,
            tectonic_cache_dir,
            s3,
            log_format,
            request_body_limit,
            rate_limit_rpm,
        })
    }
}
