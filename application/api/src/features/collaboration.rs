//! Real-time multi-user document collaboration, RBAC, version history,
//! margin comments, and edit attribution (Overleaf-grade).

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tokio::sync::broadcast;

use crate::error::AppError;
use crate::models::{
    AddCollaboratorRequest, CollaboratorRole, CreateCommentRequest, CreateRevisionRequest,
    DocumentFileExport, ResolveCommentRequest, UpdateCollaboratorRoleRequest, UserPresence,
    WsClientMessage, WsServerMessage,
};
use crate::security::auth::AuthUser;
use crate::state::AppState;

/// In-memory broadcast hub per document for real-time WebSockets.
/// In production cluster, bridged with Redis Pub/Sub.
pub type DocBroadcastSender = broadcast::Sender<WsServerMessage>;

#[derive(Clone, Default)]
pub struct CollaborationHub {
    channels: Arc<tokio::sync::RwLock<HashMap<String, DocBroadcastSender>>>,
    presence: Arc<tokio::sync::RwLock<HashMap<String, HashMap<String, UserPresence>>>>,
}

impl CollaborationHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get_or_create_channel(&self, doc_id: &str) -> DocBroadcastSender {
        let mut channels = self.channels.write().await;
        if let Some(sender) = channels.get(doc_id) {
            sender.clone()
        } else {
            let (tx, _rx) = broadcast::channel(256);
            channels.insert(doc_id.to_string(), tx.clone());
            tx
        }
    }

    pub async fn update_presence(&self, doc_id: &str, p: UserPresence) -> Vec<UserPresence> {
        let mut presence_map = self.presence.write().await;
        let doc_presences = presence_map.entry(doc_id.to_string()).or_default();
        doc_presences.insert(p.user_id.clone(), p);
        doc_presences.values().cloned().collect()
    }

    pub async fn remove_presence(&self, doc_id: &str, user_id: &str) -> Vec<UserPresence> {
        let mut presence_map = self.presence.write().await;
        if let Some(doc_presences) = presence_map.get_mut(doc_id) {
            doc_presences.remove(user_id);
            doc_presences.values().cloned().collect()
        } else {
            Vec::new()
        }
    }
}

static GLOBAL_HUB: OnceLock<CollaborationHub> = OnceLock::new();

fn get_hub() -> &'static CollaborationHub {
    GLOBAL_HUB.get_or_init(CollaborationHub::new)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        // Collaborators & RBAC
        .route(
            "/documents/:id/collaborators",
            get(list_collaborators_handler).post(add_collaborator_handler),
        )
        .route(
            "/documents/:id/collaborators/:user_id",
            put(update_collaborator_role_handler).delete(remove_collaborator_handler),
        )
        // Checkpoint Revisions
        .route(
            "/documents/:id/revisions",
            get(list_revisions_handler).post(create_revision_handler),
        )
        .route(
            "/documents/:id/revisions/:rev_id/restore",
            post(restore_revision_handler),
        )
        // Granular Audit & Change History ("Who edited what")
        .route("/documents/:id/history", get(list_history_handler))
        .route(
            "/documents/:id/history/file",
            get(list_file_history_handler),
        )
        .route(
            "/documents/:id/files/write_tracked",
            post(write_file_tracked_handler),
        )
        // Margin Comments & Collaborative Review
        .route(
            "/documents/:id/comments",
            get(list_comments_handler).post(create_comment_handler),
        )
        .route(
            "/documents/:id/comments/:comment_id/resolve",
            put(resolve_comment_handler),
        )
        .route(
            "/documents/:id/comments/:comment_id",
            delete(delete_comment_handler),
        )
        // Real-Time WebSocket Gateway
        .route("/documents/:id/ws", get(ws_collaboration_handler))
}

// -----------------------------------------------------------------------------
// RBAC Permission Checks
// -----------------------------------------------------------------------------

async fn check_doc_access(
    state: &AppState,
    doc_id: &str,
    auth_user: &AuthUser,
    required_role: CollaboratorRole,
) -> Result<CollaboratorRole, AppError> {
    if auth_user.is_admin() {
        return Ok(CollaboratorRole::Owner);
    }

    let role = state
        .repo
        .get_user_doc_role(doc_id, &auth_user.user_id)
        .await?
        .unwrap_or(CollaboratorRole::Viewer);

    let allowed = match required_role {
        CollaboratorRole::Viewer => true,
        CollaboratorRole::Commenter => role.can_comment(),
        CollaboratorRole::Editor => role.can_edit(),
        CollaboratorRole::Admin => role.can_manage_collaborators(),
        CollaboratorRole::Owner => role.can_delete_document(),
    };

    if !allowed {
        return Err(AppError::Forbidden);
    }

    Ok(role)
}

// -----------------------------------------------------------------------------
// 1. Collaborators Handlers
// -----------------------------------------------------------------------------

async fn list_collaborators_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Viewer).await?;
    let collaborators = state.repo.list_document_collaborators(&doc_id).await?;
    Ok(Json(collaborators))
}

async fn add_collaborator_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Json(req): Json<AddCollaboratorRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Admin).await?;

    let target_user = state
        .repo
        .get_user_by_email(req.email.trim())
        .await?
        .ok_or(AppError::NotFound)?;

    let role = CollaboratorRole::parse(&req.role);
    state
        .repo
        .add_document_collaborator(
            &doc_id,
            &target_user.id,
            role.as_str(),
            Some(&auth_user.user_id),
        )
        .await?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "ok": true }))))
}

async fn update_collaborator_role_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path((doc_id, user_id)): Path<(String, String)>,
    Json(req): Json<UpdateCollaboratorRoleRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Admin).await?;
    let role = CollaboratorRole::parse(&req.role);
    state
        .repo
        .update_document_collaborator_role(&doc_id, &user_id, role.as_str())
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn remove_collaborator_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path((doc_id, user_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Admin).await?;
    state
        .repo
        .remove_document_collaborator(&doc_id, &user_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// -----------------------------------------------------------------------------
// 2. Checkpoint Revisions Handlers
// -----------------------------------------------------------------------------

async fn list_revisions_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Viewer).await?;
    let revisions = state.repo.list_document_revisions(&doc_id).await?;
    Ok(Json(revisions))
}

async fn create_revision_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Json(req): Json<CreateRevisionRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Editor).await?;
    let rev = state
        .repo
        .create_document_revision(&doc_id, req.title.trim(), Some(&auth_user.user_id))
        .await?;
    Ok((StatusCode::CREATED, Json(rev)))
}

async fn restore_revision_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path((doc_id, rev_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Editor).await?;

    let snap_str = state
        .repo
        .get_document_revision_snapshot(&doc_id, &rev_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let files: Vec<DocumentFileExport> = serde_json::from_str(&snap_str)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Corrupt revision snapshot: {}", e)))?;

    for f in &files {
        state
            .repo
            .write_document_file(&doc_id, &f.rel_path, &f.content)
            .await?;
    }

    state
        .repo
        .record_document_change(crate::models::RecordChangeParams {
            doc_id: &doc_id,
            rel_path: "all",
            user_id: Some(&auth_user.user_id),
            user_name: &auth_user.name,
            change_type: "RestoreRevision",
            diff_patch: &format!("Restored revision snapshot {}", rev_id),
            summary: Some(&format!("Restored snapshot {}", rev_id)),
        })
        .await?;

    Ok(Json(
        serde_json::json!({ "ok": true, "restored_files": files.len() }),
    ))
}

// -----------------------------------------------------------------------------
// 3. Granular History & Edit Attribution ("Who edited what")
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
}

async fn list_history_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Query(q): Query<HistoryQuery>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Viewer).await?;
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let changes = state.repo.list_document_changes(&doc_id, limit).await?;
    Ok(Json(changes))
}

#[derive(Debug, Deserialize)]
pub struct FileHistoryQuery {
    pub path: String,
}

async fn list_file_history_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Query(q): Query<FileHistoryQuery>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Viewer).await?;
    let changes = state.repo.list_file_changes(&doc_id, &q.path).await?;
    Ok(Json(changes))
}

#[derive(Debug, Deserialize)]
pub struct WriteTrackedFileRequest {
    pub rel_path: String,
    pub content: String,
    pub summary: Option<String>,
}

async fn write_file_tracked_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Json(req): Json<WriteTrackedFileRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Editor).await?;

    // 1. Read existing content for diff computation
    let old_content = state
        .repo
        .read_document_file(&doc_id, &req.rel_path)
        .await?
        .unwrap_or_default();

    // 2. Compute unified diff using `similar`
    let diff = similar::TextDiff::from_lines(&old_content, &req.content);
    let diff_patch = diff
        .unified_diff()
        .context_radius(2)
        .header("a", "b")
        .to_string();

    // 3. Write new content to storage
    state
        .repo
        .write_document_file(&doc_id, &req.rel_path, &req.content)
        .await?;

    // 4. If changes occurred, record the change entry with user attribution
    if !diff_patch.is_empty() {
        let change_type = if old_content.is_empty() {
            "FileCreate"
        } else {
            "Edit"
        };

        state
            .repo
            .record_document_change(crate::models::RecordChangeParams {
                doc_id: &doc_id,
                rel_path: &req.rel_path,
                user_id: Some(&auth_user.user_id),
                user_name: &auth_user.name,
                change_type,
                diff_patch: &diff_patch,
                summary: req.summary.as_deref(),
            })
            .await?;

        // 5. Broadcast to active WebSocket collaborators
        let hub = get_hub();
        let tx = hub.get_or_create_channel(&doc_id).await;
        let _ = tx.send(WsServerMessage::FileUpdated {
            rel_path: req.rel_path.clone(),
            user_id: auth_user.user_id.clone(),
            user_name: auth_user.name.clone(),
            diff_patch,
        });
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

// -----------------------------------------------------------------------------
// 4. Margin Comments & Collaborative Review Handlers
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CommentQuery {
    pub rel_path: Option<String>,
}

async fn list_comments_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Query(q): Query<CommentQuery>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Viewer).await?;
    let comments = state
        .repo
        .list_document_comments(&doc_id, q.rel_path.as_deref())
        .await?;
    Ok(Json(comments))
}

async fn create_comment_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Json(req): Json<CreateCommentRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_doc_access(&state, &doc_id, &auth_user, CollaboratorRole::Commenter).await?;

    let comment_id = state
        .repo
        .create_document_comment(crate::models::CreateCommentParams {
            doc_id: &doc_id,
            rel_path: &req.rel_path,
            user_id: Some(&auth_user.user_id),
            user_name: &auth_user.name,
            line_number: req.line_number,
            selected_text: req.selected_text.as_deref(),
            content: &req.content,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": comment_id, "ok": true })),
    ))
}

async fn resolve_comment_handler(
    auth_user: AuthUser,
    State(state): State<AppState>,
    Path((_doc_id, comment_id)): Path<(String, String)>,
    Json(req): Json<ResolveCommentRequest>,
) -> Result<impl IntoResponse, AppError> {
    state
        .repo
        .resolve_document_comment(&comment_id, req.resolved, Some(&auth_user.user_id))
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_comment_handler(
    _auth_user: AuthUser,
    State(state): State<AppState>,
    Path((_doc_id, comment_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    state.repo.delete_document_comment(&comment_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// -----------------------------------------------------------------------------
// 5. Real-Time WebSocket Presence & Collaboration Gateway
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    pub token: Option<String>,
}

async fn ws_collaboration_handler(
    ws: WebSocketUpgrade,
    Path(doc_id): Path<String>,
    Query(q): Query<WsAuthQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let token = q.token.unwrap_or_default();
    let auth_user = if crate::security::auth::constant_time_eq(
        token.as_bytes(),
        state.config.auth.api_token.expose().as_bytes(),
    ) {
        AuthUser {
            user_id: "admin".to_string(),
            email: "admin@system.local".to_string(),
            name: "Admin".to_string(),
            role: "Admin".to_string(),
        }
    } else if let Ok(claims) =
        crate::security::auth::decode_jwt(&token, state.master_key.as_bytes())
    {
        AuthUser {
            user_id: claims.sub,
            email: claims.email,
            name: claims.name,
            role: claims.role,
        }
    } else {
        return Err(AppError::Unauthorized);
    };

    Ok(ws.on_upgrade(move |socket| handle_collaboration_socket(socket, doc_id, auth_user)))
}

async fn handle_collaboration_socket(socket: WebSocket, doc_id: String, user: AuthUser) {
    let hub = get_hub();
    let tx = hub.get_or_create_channel(&doc_id).await;
    let mut rx = tx.subscribe();

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Assign color by user_id hash
    let colors = [
        "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4",
    ];
    let color_idx = (user.user_id.bytes().map(|b| b as usize).sum::<usize>()) % colors.len();
    let user_color = colors[color_idx].to_string();

    let presence = UserPresence {
        user_id: user.user_id.clone(),
        user_name: user.name.clone(),
        avatar_url: None,
        color: user_color,
        active_file: None,
        cursor: None,
        last_seen_epoch_ms: chrono::Utc::now().timestamp_millis() as u64,
    };

    // Broadcast user joined
    let all_presence = hub.update_presence(&doc_id, presence.clone()).await;
    let _ = tx.send(WsServerMessage::UserJoined { presence });

    // Send full current presence list to newly connected user
    if let Ok(json) = serde_json::to_string(&WsServerMessage::PresenceList {
        users: all_presence,
    }) {
        let _ = ws_sender.send(Message::Text(json.into())).await;
    }

    let user_id = user.user_id.clone();
    let doc_id_clone = doc_id.clone();
    let tx_clone = tx.clone();

    // Forward broadcast events to WebSocket client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if ws_sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Receive events from WebSocket client
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(client_msg) = serde_json::from_str::<WsClientMessage>(&text) {
                    match client_msg {
                        WsClientMessage::Presence {
                            active_file,
                            cursor,
                        } => {
                            let _ = tx_clone.send(WsServerMessage::UserMoved {
                                user_id: user_id.clone(),
                                active_file,
                                cursor,
                            });
                        }
                        WsClientMessage::Ping => {
                            let _ = tx_clone.send(WsServerMessage::Pong);
                        }
                        _ => {}
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // User disconnected: broadcast leave and cleanup presence
    hub.remove_presence(&doc_id_clone, &user.user_id).await;
    let _ = tx.send(WsServerMessage::UserLeft {
        user_id: user.user_id,
    });
}
