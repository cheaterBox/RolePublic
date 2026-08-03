//! First-boot seedings.
//!
//! On a fresh database this module:
//! - Inserts an `extension_secret` (a 32-char nanoid) if absent.
//! - Upserts the 50+ built-in themes from `themes.toml`.
//!
//! Everything is idempotent: it can run on every boot without duplicating data.

use std::path::Path;

use crate::config::Config;
use crate::db::Repository;

/// Public entry point. Idempotent — safe to run on every boot.
pub async fn run_seedings(
    repo: &dyn Repository,
    _config: &Config,
) -> Result<(), crate::error::AppError> {
    seed_themes(repo).await?;
    Ok(())
}

/// Loads built-in themes from a TOML file shipped with the binary.
/// If the file is missing (development), seeds an empty list — themes can
/// still be created via the API.
async fn seed_themes(repo: &dyn Repository) -> Result<(), crate::error::AppError> {
    let themes_toml = match std::env::var("ROLETECT_THEMES_PATH") {
        Ok(p) => std::fs::read_to_string(Path::new(&p)).ok(),
        Err(_) => None,
    };

    let Some(content) = themes_toml else {
        // No themes file configured — skip silently.
        return Ok(());
    };

    let parsed: ThemesToml = match toml::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, "themes.toml is malformed; skipping seed");
            return Ok(());
        }
    };

    for theme in parsed.themes {
        if let Err(e) = repo
            .upsert_theme(&theme.id, &theme.name, &theme.config, true)
            .await
        {
            tracing::warn!(theme_id = %theme.id, error = ?e, "failed to upsert theme");
        }
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct ThemesToml {
    #[serde(default)]
    themes: Vec<ThemeEntry>,
}

#[derive(serde::Deserialize)]
struct ThemeEntry {
    id: String,
    name: String,
    config: String,
}
