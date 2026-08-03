//! Roletect VPS API entry point.
//!
//! Reads `Config` from the environment and starts the Axum server.
//! Configuration is intentionally minimal here — all wiring lives in
//! `bootstrap`.

use roletect_api::{bootstrap, config::Config};

#[tokio::main]
async fn main() {
    // Load .env if present (development convenience). No-op in containers.
    let _ = dotenvy::dotenv();

    let config = match Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            // Use eprintln so the error reaches the operator even if
            // tracing isn't initialized yet.
            eprintln!("fatal: {}", e);
            std::process::exit(1);
        }
    };

    if let Err(e) = bootstrap::run(config).await {
        tracing::error!(error = ?e, "fatal");
        std::process::exit(1);
    }
}
