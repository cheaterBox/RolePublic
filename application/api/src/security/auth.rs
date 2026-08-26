//! Authentication & authorization subsystem.
//! Supports both stateless JWT user tokens and system master tokens.
//! Password hashing via Argon2id.

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{FromRequestParts, Request, State},
    http::{header, request::Parts, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::rngs::OsRng;
use std::sync::Arc;

use crate::config::AuthConfig;
use crate::models::{Claims, User};
use crate::state::AppState;

/// Authenticated user extracted from a request.
#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub role: String,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role.eq_ignore_ascii_case("admin")
    }
}

/// Extractor state for auth middleware.
#[derive(Clone)]
pub struct AuthState {
    pub config: Arc<AuthConfig>,
    pub master_key: Arc<crate::security::crypto::MasterKey>,
}

impl AuthState {
    pub fn new(config: AuthConfig, master_key: Arc<crate::security::crypto::MasterKey>) -> Self {
        Self {
            config: Arc::new(config),
            master_key,
        }
    }
}

// -----------------------------------------------------------------------------
// Password Hashing (Argon2id)
// -----------------------------------------------------------------------------

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Password hashing failed: {}", e))?;
    Ok(hash.to_string())
}

pub fn verify_password(hash: &str, password: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

// -----------------------------------------------------------------------------
// JWT Token Generation & Verification
// -----------------------------------------------------------------------------

pub fn create_jwt(user: &User, secret: &[u8]) -> Result<String, String> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(30))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        name: user.full_name.clone(),
        role: user.role.clone(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret),
    )
    .map_err(|e| format!("JWT generation failed: {}", e))
}

pub fn decode_jwt(token: &str, secret: &[u8]) -> Result<Claims, String> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret),
        &Validation::default(),
    )
    .map_err(|e| format!("Invalid or expired token: {}", e))?;

    Ok(token_data.claims)
}

// -----------------------------------------------------------------------------
// Axum Extractor: FromRequestParts for AuthUser
// -----------------------------------------------------------------------------

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "));

        let Some(provided) = token else {
            return Err(StatusCode::UNAUTHORIZED);
        };

        // 1. Check if it's the static master token (superadmin bypass)
        if constant_time_eq(
            provided.as_bytes(),
            state.config.auth.api_token.expose().as_bytes(),
        ) {
            return Ok(AuthUser {
                user_id: "system".to_string(),
                email: "admin@system.local".to_string(),
                name: "System Administrator".to_string(),
                role: "Admin".to_string(),
            });
        }

        // 2. Decode user JWT
        let claims = decode_jwt(provided, state.master_key.as_bytes())
            .map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(AuthUser {
            user_id: claims.sub,
            email: claims.email,
            name: claims.name,
            role: claims.role,
        })
    }
}

// -----------------------------------------------------------------------------
// Middleware: require_bearer_token
// -----------------------------------------------------------------------------

pub async fn require_bearer_token(
    State(state): State<AuthState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if !state.config.require_token {
        return Ok(next.run(req).await);
    }

    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    let Some(provided) = token else {
        return Err(StatusCode::UNAUTHORIZED);
    };

    // 1. Static master token check
    if constant_time_eq(
        provided.as_bytes(),
        state.config.api_token.expose().as_bytes(),
    ) {
        return Ok(next.run(req).await);
    }

    // 2. JWT token check
    if decode_jwt(provided, state.master_key.as_bytes()).is_ok() {
        return Ok(next.run(req).await);
    }

    Err(StatusCode::UNAUTHORIZED)
}

// -----------------------------------------------------------------------------
// Constant Time Equality
// -----------------------------------------------------------------------------

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn constant_time_eq_str(a: &str, b: &str) -> bool {
    constant_time_eq(a.as_bytes(), b.as_bytes())
}
