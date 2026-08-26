// 认证中间件：从 Cookie / Bearer / ?token= 加载用户 + 权限判断 + axum 提取器
use axum::extract::FromRequestParts;
use axum::http::header;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::collections::HashSet;
use std::sync::MutexGuard;
use rusqlite::Connection;

use crate::config::COOKIE_NAME;
use crate::security::hash_token;
use crate::state::AppState;

/// 登录用户信息
#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub via: String, // "session" 或 "api_token"
    pub api_folder_id: Option<i64>,
}

/// 统一错误响应：`{"error": "..."}`
#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl ApiError {
    pub fn unauthorized() -> Self {
        ApiError(StatusCode::UNAUTHORIZED, "未登录，无法执行此操作".into())
    }
    pub fn forbidden(msg: &str) -> Self {
        ApiError(StatusCode::FORBIDDEN, msg.into())
    }
    pub fn bad_request(msg: &str) -> Self {
        ApiError(StatusCode::BAD_REQUEST, msg.into())
    }
    pub fn not_found(msg: &str) -> Self {
        ApiError(StatusCode::NOT_FOUND, msg.into())
    }
}

/// 便捷：从 JSON body 取字符串字段
pub fn str_field(body: &serde_json::Value, key: &str) -> String {
    body.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// 便捷：从 JSON body 取字符串字段（不 trim，用于 markdown 正文等）
pub fn raw_field(body: &serde_json::Value, key: &str) -> String {
    body.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn lock(db: &crate::state::Db) -> MutexGuard<'_, Connection> {
    db.lock().expect("数据库锁已污染")
}

/// 从请求中提取登录身份（Cookie / Bearer / ?token=）
fn load_user(parts: &Parts, state: &AppState) -> Option<AuthUser> {
    let mut raw_token: Option<String> = None;

    if let Some(cookie_header) = parts.headers.get(header::COOKIE) {
        if let Ok(s) = cookie_header.to_str() {
            for pair in s.split(';') {
                let pair = pair.trim();
                if let Some(idx) = pair.find('=') {
                    if &pair[..idx] == COOKIE_NAME {
                        raw_token = Some(pair[idx + 1..].to_string());
                        break;
                    }
                }
            }
        }
    }

    if raw_token.is_none() {
        if let Some(auth) = parts.headers.get(header::AUTHORIZATION) {
            if let Ok(s) = auth.to_str() {
                if let Some(stripped) = s.strip_prefix("Bearer ") {
                    raw_token = Some(stripped.to_string());
                }
            }
        }
    }

    if raw_token.is_none() {
        if let Some(query) = parts.uri.query() {
            for pair in query.split('&') {
                if let Some(idx) = pair.find('=') {
                    if &pair[..idx] == "token" {
                        raw_token = Some(pair[idx + 1..].to_string());
                        break;
                    }
                }
            }
        }
    }

    let token = raw_token?;
    user_by_session_token(&token, state).or_else(|| user_by_api_token(&token, state))
}

fn expired(expires_at: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(expires_at, "%Y-%m-%d %H:%M:%S")
        .map(|dt| dt < chrono::Local::now().naive_local())
        .unwrap_or(false)
}

fn user_by_session_token(token: &str, state: &AppState) -> Option<AuthUser> {
    let db = lock(&state.db);
    let row = db
        .query_row(
            "SELECT u.id, u.username, u.display_name, u.role, s.expires_at
             FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1",
            [token],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )
        .ok()?;
    let (id, username, display_name, role, expires_at) = row;
    if expired(&expires_at) {
        let _ = db.execute("DELETE FROM sessions WHERE token = ?1", [token]);
        return None;
    }
    Some(AuthUser {
        id,
        username,
        display_name,
        role,
        via: "session".into(),
        api_folder_id: None,
    })
}

fn user_by_api_token(token: &str, state: &AppState) -> Option<AuthUser> {
    let hash = hash_token(token);
    let db = lock(&state.db);
    let row = db
        .query_row(
            "SELECT u.id, u.username, u.display_name, u.role, a.folder_id, a.expires_at
             FROM api_tokens a JOIN users u ON u.id = a.user_id WHERE a.token_hash = ?1",
            [&hash],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .ok()?;
    let (id, username, display_name, role, folder_id, expires_at) = row;
    if let Some(exp) = &expires_at {
        if expired(exp) {
            return None;
        }
    }
    Some(AuthUser {
        id,
        username,
        display_name,
        role,
        via: "api_token".into(),
        api_folder_id: folder_id,
    })
}

/// 提取器：可选登录
pub struct OptionalAuth(pub Option<AuthUser>);

impl FromRequestParts<AppState> for OptionalAuth {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        Ok(OptionalAuth(load_user(parts, state)))
    }
}

/// 提取器：必须登录
pub struct Auth(pub AuthUser);

impl FromRequestParts<AppState> for Auth {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        match load_user(parts, state) {
            Some(u) => Ok(Auth(u)),
            None => Err(ApiError::unauthorized()),
        }
    }
}

/// 提取器：必须管理员
pub struct AdminAuth(pub AuthUser);

impl FromRequestParts<AppState> for AdminAuth {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        match load_user(parts, state) {
            Some(u) if u.role == "admin" => Ok(AdminAuth(u)),
            Some(_) => Err(ApiError::forbidden("需要管理员权限")),
            None => Err(ApiError::unauthorized()),
        }
    }
}

/// 判断用户是否可编辑某文件夹（含祖先继承）
pub fn can_edit_folder(state: &AppState, user_id: i64, folder_id: i64) -> bool {
    let db = lock(&state.db);
    let role: Option<String> = db
        .query_row("SELECT role FROM users WHERE id = ?1", [user_id], |r| r.get(0))
        .ok();
    if let Some(r) = role {
        if r == "admin" {
            return true;
        }
    }
    let mut cur = folder_id;
    let mut seen = HashSet::new();
    while cur != 0 && seen.insert(cur) {
        let has: bool = db
            .query_row(
                "SELECT 1 FROM user_folder_permissions WHERE user_id = ?1 AND folder_id = ?2",
                rusqlite::params![user_id, cur],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if has {
            return true;
        }
        let parent: Option<i64> = db
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [cur], |r| r.get(0))
            .ok()
            .flatten();
        match parent {
            Some(p) => cur = p,
            None => break,
        }
    }
    false
}

/// ancestor_id 是否为 folder_id 的祖先或自身
pub fn is_descendant_or_self(state: &AppState, ancestor_id: i64, folder_id: i64) -> bool {
    let db = lock(&state.db);
    let mut cur = folder_id;
    let mut seen = HashSet::new();
    while cur != 0 && seen.insert(cur) {
        if cur == ancestor_id {
            return true;
        }
        let parent: Option<i64> = db
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [cur], |r| r.get(0))
            .ok()
            .flatten();
        match parent {
            Some(p) => cur = p,
            None => break,
        }
    }
    false
}

/// API token 编辑权限：绑定文件夹时限定在该文件夹及后代；否则继承创建者权限
pub fn can_api_token_edit(state: &AppState, user: &AuthUser, folder_id: i64) -> bool {
    if let Some(afid) = user.api_folder_id {
        return is_descendant_or_self(state, afid, folder_id);
    }
    if user.role == "admin" {
        return true;
    }
    can_edit_folder(state, user.id, folder_id)
}

/// 写权限：API token 走 token 规则，管理员全开，否则按文件夹授权
pub fn can_write(state: &AppState, user: &AuthUser, folder_id: i64) -> bool {
    if user.via == "api_token" {
        return can_api_token_edit(state, user, folder_id);
    }
    if user.role == "admin" {
        return true;
    }
    can_edit_folder(state, user.id, folder_id)
}
