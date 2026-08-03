//! Per-IP token-bucket rate limiter (in-memory).
//!
//! Defense in depth: prevents brute-forcing the bearer token. For a
//! multi-instance deployment, swap this for a Redis-backed limiter.

use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Debug)]
struct Bucket {
    tokens: f64,
    last_refill: Instant,
}

#[derive(Clone)]
pub struct RateLimiter {
    state: Arc<Mutex<HashMap<String, Bucket>>>,
    capacity: f64,
    refill_per_sec: f64,
}

impl RateLimiter {
    pub fn new(requests_per_minute: u32) -> Self {
        Self {
            state: Arc::new(Mutex::new(HashMap::new())),
            capacity: requests_per_minute as f64,
            refill_per_sec: requests_per_minute as f64 / 60.0,
        }
    }

    pub async fn try_consume(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut state = self.state.lock().await;
        let bucket = state.entry(key.to_string()).or_insert_with(|| Bucket {
            tokens: self.capacity,
            last_refill: now,
        });
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.refill_per_sec).min(self.capacity);
        bucket.last_refill = now;
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            true
        } else {
            false
        }
    }

    /// Periodic cleanup so the map doesn't grow unbounded.
    pub async fn cleanup(&self) {
        let mut state = self.state.lock().await;
        let now = Instant::now();
        state.retain(|_, b| now.duration_since(b.last_refill) < Duration::from_secs(300));
    }
}

pub async fn enforce(
    State(limiter): State<RateLimiter>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let key = addr.ip().to_string();
    if !limiter.try_consume(&key).await {
        tracing::debug!(ip = %key, "rate limit exceeded");
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    Ok(next.run(req).await)
}
