//! Authentication endpoints: register, login, me.

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};

use crate::error::AppError;
use crate::models::{AuthResponse, LoginRequest, RegisterRequest, UserSummary};
use crate::security::auth::{create_jwt, hash_password, verify_password, AuthUser};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    protected_routes()
}

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register_handler_pub))
        .route("/login", post(login_handler_pub))
}

pub fn protected_routes() -> Router<AppState> {
    Router::new().route("/me", get(me_handler))
}

pub async fn register_handler_pub(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<impl IntoResponse, AppError> {
    let email = req.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(AppError::BadRequest("Valid email is required".to_string()));
    }
    if req.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }
    let full_name = req.full_name.trim();
    if full_name.is_empty() {
        return Err(AppError::BadRequest("Full name is required".to_string()));
    }

    let password_hash =
        hash_password(&req.password).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    let user = if let Some(existing) = state.repo.get_user_by_email(&email).await? {
        state
            .repo
            .update_user_credentials(&existing.id, &password_hash, full_name)
            .await?;
        state
            .repo
            .get_user_by_id(&existing.id)
            .await?
            .unwrap_or(existing)
    } else {
        state
            .repo
            .create_user(&email, &password_hash, full_name)
            .await?
    };

    let token = create_jwt(&user, state.master_key.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token,
            user: UserSummary {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                avatar_url: user.avatar_url,
                role: user.role,
            },
        }),
    ))
}

pub async fn login_handler_pub(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let email = req.email.trim().to_lowercase();
    let user = state
        .repo
        .get_user_by_email(&email)
        .await?
        .ok_or_else(|| AppError::Unauthorized)?;

    if !verify_password(&user.password_hash, &req.password) {
        return Err(AppError::Unauthorized);
    }

    let token = create_jwt(&user, state.master_key.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    Ok(Json(AuthResponse {
        token,
        user: UserSummary {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            role: user.role,
        },
    }))
}

async fn me_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(user) = state.repo.get_user_by_id(&auth_user.user_id).await? {
        Ok(Json(UserSummary {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            role: user.role,
        }))
    } else {
        Ok(Json(UserSummary {
            id: auth_user.user_id,
            email: auth_user.email,
            full_name: auth_user.name,
            avatar_url: None,
            role: auth_user.role,
        }))
    }
}
