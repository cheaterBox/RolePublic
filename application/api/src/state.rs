//! Shared application state, injected into every Axum handler via the
//! `State<AppState>` extractor.
//!
//! `AppState` is `Clone`-cheap (Arc-wrapped internals). Features MUST
//! take `State<AppState>` rather than reaching for globals.

use std::sync::Arc;

use crate::config::Config;
use crate::db::Repository;
use crate::security::crypto::MasterKey;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub repo: Arc<dyn Repository>,
    /// Master key derived from `ROLETECT_API_TOKEN`. Used to encrypt
    /// at-rest AI API keys.
    pub master_key: Arc<MasterKey>,
}
