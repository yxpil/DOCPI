// 认证相关路由：验证码 / 登录 / 登出 / 资料 / API token / 用户管理 / 权限分配
use axum::extract::{Path, State};
use axum::http::header;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{Connection, ToSql};
use serde_json::{json, Value};

use crate::auth::{str_field, AdminAuth, ApiError, Auth, OptionalAuth};
use crate::config;
use crate::security;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/captcha", get(captcha))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me).put(update_me))
        .route("/auth/me/avatar", axum::routing::put(update_avatar))
        .route("/auth/api-tokens", get(list_tokens).post(create_token))
        .route("/auth/api-tokens/{id}", axum::routing::delete(delete_token))
        .route("/auth/users", get(list_users).post(create_user))
        .route("/auth/users/{id}", axum::routing::put(update_user).delete(delete_user))
        .route("/auth/users/{id}/folders", get(user_folders).put(set_user_folders))
        .route("/auth/my-folders", get(my_folders))
}

/// 按 id 读取公开用户信息
fn fetch_user_json(db: &Connection, id: i64) -> Option<Value> {
    db.query_row(
        "SELECT id, username, display_name, role, email, phone, qq, avatar, created_at
         FROM users WHERE id = ?1",
        [id],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "username": r.get::<_, String>(1)?,
                "display_name": r.get::<_, String>(2)?,
                "role": r.get::<_, String>(3)?,
                "email": r.get::<_, String>(4)?,
                "phone": r.get::<_, String>(5)?,
                "qq": r.get::<_, String>(6)?,
                "avatar": r.get::<_, String>(7)?,
                "created_at": r.get::<_, String>(8)?,
            }))
        },
    )
    .ok()
}

// ============ 验证码 ============
async fn captcha(State(state): State<AppState>) -> Json<Value> {
    let (id, image) = state.captcha.issue();
    Json(json!({ "id": id, "image": image }))
}

// ============ 登录 / 登出 ============
async fn login(State(state): State<AppState>, Json(body): Json<Value>) -> Result<Response, ApiError> {
    let username = str_field(&body, "username");
    let password = body.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let captcha_id = str_field(&body, "captcha_id");
    let captcha_answer = str_field(&body, "captcha");

    if !config::captcha_disabled() {
        if !state.captcha.verify(&captcha_id, &captcha_answer) {
            return Err(ApiError::bad_request("验证码错误或已过期"));
        }
    }

    let user = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT id, username, password_hash, display_name, role, email, phone, qq, avatar, created_at
             FROM users WHERE username = ?1",
            [&username],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, String>(8)?,
                    r.get::<_, String>(9)?,
                ))
            },
        )
        .ok()
    };

    let user = match user {
        Some(u) => u,
        None => return Err(ApiError(StatusCode::UNAUTHORIZED, "用户名或密码错误".into())),
    };

    if !security::verify_password(&password, &user.2) {
        return Err(ApiError(StatusCode::UNAUTHORIZED, "用户名或密码错误".into()));
    }

    let token = security::generate_token(32);
    let expires_at = security::now_local_plus(config::SESSION_TTL_MS);
    {
        let db = state.db.lock().unwrap();
        db.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![token, user.0, expires_at],
        )
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    }

    let user_json = json!({
        "id": user.0,
        "username": user.1,
        "display_name": user.3,
        "role": user.4,
        "email": user.5,
        "phone": user.6,
        "qq": user.7,
        "avatar": user.8,
        "created_at": user.9,
    });

    let cookie_value = format!(
        "{}={}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        config::COOKIE_NAME,
        token,
        config::SESSION_TTL_MS / 1000
    );
    let mut resp = Json(json!({ "token": token, "user": user_json })).into_response();
    resp.headers_mut().insert(
        header::SET_COOKIE,
        header::HeaderValue::from_str(&cookie_value).expect("cookie 非法"),
    );
    Ok(resp)
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut token: Option<String> = None;
    if let Some(auth) = headers.get(header::AUTHORIZATION) {
        if let Ok(s) = auth.to_str() {
            if let Some(stripped) = s.strip_prefix("Bearer ") {
                token = Some(stripped.to_string());
            }
        }
    }
    if token.is_none() {
        if let Some(cookie) = headers.get(header::COOKIE) {
            if let Ok(s) = cookie.to_str() {
                for pair in s.split(';') {
                    let pair = pair.trim();
                    if let Some(idx) = pair.find('=') {
                        if &pair[..idx] == config::COOKIE_NAME {
                            token = Some(pair[idx + 1..].to_string());
                        }
                    }
                }
            }
        }
    }
    if let Some(t) = token {
        if let Ok(db) = state.db.lock() {
            let _ = db.execute("DELETE FROM sessions WHERE token = ?1", [&t]);
        }
    }
    let mut resp = Json(json!({ "ok": true })).into_response();
    resp.headers_mut().insert(
        header::SET_COOKIE,
        header::HeaderValue::from_static("docpi_session=; Path=/; Max-Age=0"),
    );
    resp
}

// ============ 个人资料 ============
async fn me(State(state): State<AppState>, OptionalAuth(user): OptionalAuth) -> Json<Value> {
    match user {
        Some(u) => {
            let db = state.db.lock().unwrap();
            Json(fetch_user_json(&db, u.id).unwrap_or(Value::Null))
        }
        None => Json(Value::Null),
    }
}

async fn update_me(
    State(state): State<AppState>,
    Auth(user): Auth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let ok_fields = ["display_name", "email", "phone", "qq"];
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<String> = Vec::new();
    for f in ok_fields {
        if let Some(v) = body.get(f).and_then(|v| v.as_str()) {
            sets.push(format!("{f} = ?"));
            vals.push(v.trim().to_string());
        }
    }
    if let Some(pw) = body.get("password").and_then(|v| v.as_str()) {
        if !pw.is_empty() {
            sets.push("password_hash = ?".to_string());
            vals.push(security::hash_password(pw));
        }
    }
    if sets.is_empty() {
        return Err(ApiError::bad_request("无有效字段"));
    }
    sets.push("updated_at = datetime('now','localtime')".to_string());
    let sql = format!("UPDATE users SET {} WHERE id = ?", sets.join(", "));

    let mut params: Vec<Box<dyn ToSql>> = vals
        .into_iter()
        .map(|v| Box::new(v) as Box<dyn ToSql>)
        .collect();
    params.push(Box::new(user.id) as Box<dyn ToSql>);

    let updated = {
        let db = state.db.lock().unwrap();
        db.execute(&sql, rusqlite::params_from_iter(params))
            .map_err(|e| ApiError::bad_request(&e.to_string()))?;
        fetch_user_json(&db, user.id)
    };

    Ok(Json(updated.unwrap_or(Value::Null)))
}

async fn update_avatar(
    State(state): State<AppState>,
    Auth(user): Auth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let data_url = body.get("avatar").and_then(|v| v.as_str()).unwrap_or("");
    if !data_url.starts_with("data:image/") {
        return Err(ApiError::bad_request("仅支持图片 base64"));
    }
    let base64_part = data_url.split(',').nth(1).unwrap_or("");
    let buf = STANDARD
        .decode(base64_part)
        .map_err(|_| ApiError::bad_request("无效的 base64"))?;
    if buf.len() > config::MAX_AVATAR_BYTES {
        return Err(ApiError::bad_request("头像图片过大"));
    }

    let updated = {
        let db = state.db.lock().unwrap();
        db.execute(
            "UPDATE users SET avatar = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            rusqlite::params![data_url, user.id],
        )
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
        fetch_user_json(&db, user.id)
    };

    Ok(Json(updated.unwrap_or(Value::Null)))
}

// ============ API Token ============
async fn list_tokens(State(state): State<AppState>, Auth(user): Auth) -> Json<Value> {
    let db = state.db.lock().unwrap();
    let rows: Vec<Value> = if user.role == "admin" {
        let mut stmt = db
            .prepare(
                "SELECT a.id, a.name, a.folder_id, a.created_at, a.expires_at, u.username
                 FROM api_tokens a JOIN users u ON u.id = a.user_id ORDER BY a.id DESC",
            )
            .unwrap();
        stmt.query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "folder_id": r.get::<_, Option<i64>>(2)?,
                "created_at": r.get::<_, String>(3)?,
                "expires_at": r.get::<_, Option<String>>(4)?,
                "username": r.get::<_, String>(5)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    } else {
        let mut stmt = db
            .prepare(
                "SELECT id, name, folder_id, created_at, expires_at
                 FROM api_tokens WHERE user_id = ?1 ORDER BY id DESC",
            )
            .unwrap();
        stmt.query_map([user.id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "folder_id": r.get::<_, Option<i64>>(2)?,
                "created_at": r.get::<_, String>(3)?,
                "expires_at": r.get::<_, Option<String>>(4)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };
    Json(Value::Array(rows))
}

async fn create_token(
    State(state): State<AppState>,
    Auth(user): Auth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let name = {
        let n = str_field(&body, "name");
        if n.is_empty() {
            "未命名".to_string()
        } else {
            n
        }
    };
    let folder_id = body
        .get("folder_id")
        .and_then(|v| v.as_i64())
        .filter(|v| *v > 0);
    let raw = format!("dpi_{}", security::generate_token(24));
    let expires_at = security::now_local_plus(config::API_TOKEN_TTL_MS);
    let created_at = security::now_local();

    let id = {
        let db = state.db.lock().unwrap();
        db.execute(
            "INSERT INTO api_tokens (user_id, name, token_hash, folder_id, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![user.id, name, security::hash_token(&raw), folder_id, expires_at],
        )
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
        db.last_insert_rowid()
    };

    Ok(Json(json!({
        "id": id,
        "token": raw,
        "name": name,
        "folder_id": folder_id,
        "created_at": created_at,
        "expires_at": expires_at,
    })))
}

async fn delete_token(
    State(state): State<AppState>,
    Auth(user): Auth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let owner: Option<i64> = db
        .query_row("SELECT user_id FROM api_tokens WHERE id = ?1", [id], |r| r.get(0))
        .ok();
    match owner {
        None => Err(ApiError::not_found("token 不存在")),
        Some(uid) if user.role != "admin" && uid != user.id => Err(ApiError::forbidden("无权限")),
        _ => {
            db.execute("DELETE FROM api_tokens WHERE id = ?1", [id])
                .map_err(|e| ApiError::bad_request(&e.to_string()))?;
            Ok(Json(json!({ "ok": true })))
        }
    }
}

// ============ 用户管理（管理员） ============
async fn list_users(State(state): State<AppState>, _admin: AdminAuth) -> Json<Value> {
    let db = state.db.lock().unwrap();
    let admin_username = config::admin_username();
    let mut stmt = db
        .prepare(
            "SELECT id, username, display_name, role, email, phone, qq, avatar, created_at
             FROM users ORDER BY id ASC",
        )
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            let username: String = r.get(1)?;
            let protected = username == admin_username;
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "username": username,
                "display_name": r.get::<_, String>(2)?,
                "role": r.get::<_, String>(3)?,
                "email": r.get::<_, String>(4)?,
                "phone": r.get::<_, String>(5)?,
                "qq": r.get::<_, String>(6)?,
                "avatar": r.get::<_, String>(7)?,
                "created_at": r.get::<_, String>(8)?,
                "protected": protected,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(rows))
}

async fn create_user(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let username = str_field(&body, "username");
    let password = body.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let display_name = str_field(&body, "display_name");
    let role = if body.get("role").and_then(|v| v.as_str()) == Some("admin") {
        "admin"
    } else {
        "engineer"
    };
    if username.is_empty() || password.is_empty() {
        return Err(ApiError::bad_request("用户名和密码不能为空"));
    }
    let email = crate::auth::raw_field(&body, "email");
    let phone = crate::auth::raw_field(&body, "phone");
    let qq = crate::auth::raw_field(&body, "qq");
    let hash = security::hash_password(&password);

    let db = state.db.lock().unwrap();
    let result = db.execute(
        "INSERT INTO users (username, password_hash, display_name, role, email, phone, qq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![username, hash, display_name, role, email, phone, qq],
    );
    match result {
        Ok(_) => Ok(Json(json!({ "id": db.last_insert_rowid() }))),
        Err(e) if e.to_string().contains("UNIQUE") => Err(ApiError::bad_request("用户名已存在")),
        Err(e) => Err(ApiError::bad_request(&e.to_string())),
    }
}

async fn update_user(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let cur: Option<(String, String, String)> = db
        .query_row(
            "SELECT username, display_name, role FROM users WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let (username, cur_display, cur_role) = match cur {
        Some(c) => c,
        None => return Err(ApiError::not_found("用户不存在")),
    };

    let role = if body.get("role").and_then(|v| v.as_str()) == Some("admin") {
        "admin"
    } else {
        "engineer"
    };
    if username == config::admin_username() && role != "admin" {
        return Err(ApiError::bad_request("不能降级初始管理员"));
    }

    let display_name = body
        .get("display_name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or(cur_display);
    let email = match body.get("email") {
        Some(v) => v.as_str().unwrap_or("").to_string(),
        None => {
            db.query_row("SELECT email FROM users WHERE id = ?1", [id], |r| r.get::<_, String>(0))
                .unwrap_or_default()
        }
    };
    let phone = match body.get("phone") {
        Some(v) => v.as_str().unwrap_or("").to_string(),
        None => db
            .query_row("SELECT phone FROM users WHERE id = ?1", [id], |r| r.get::<_, String>(0))
            .unwrap_or_default(),
    };
    let qq = match body.get("qq") {
        Some(v) => v.as_str().unwrap_or("").to_string(),
        None => db
            .query_row("SELECT qq FROM users WHERE id = ?1", [id], |r| r.get::<_, String>(0))
            .unwrap_or_default(),
    };
    let password_hash = match body.get("password").and_then(|v| v.as_str()) {
        Some(pw) if !pw.is_empty() => security::hash_password(pw),
        _ => db
            .query_row("SELECT password_hash FROM users WHERE id = ?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .unwrap_or_default(),
    };

    db.execute(
        "UPDATE users SET display_name=?, role=?, password_hash=?, email=?, phone=?, qq=?, updated_at=datetime('now','localtime') WHERE id=?",
        rusqlite::params![display_name, role, password_hash, email, phone, qq, id],
    )
    .map_err(|e| ApiError::bad_request(&e.to_string()))?;

    let _ = cur_role; // 保留旧角色（未用到）
    Ok(Json(json!({ "ok": true })))
}

async fn delete_user(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let username: Option<String> = db
        .query_row("SELECT username FROM users WHERE id = ?1", [id], |r| r.get(0))
        .ok();
    match username {
        None => Err(ApiError::not_found("用户不存在")),
        Some(u) if u == config::admin_username() => Err(ApiError::bad_request("不能删除初始管理员")),
        _ => {
            db.execute("DELETE FROM users WHERE id = ?1", [id])
                .map_err(|e| ApiError::bad_request(&e.to_string()))?;
            Ok(Json(json!({ "ok": true })))
        }
    }
}

// ============ 权限分配（管理员） ============
async fn user_folders(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let exists: bool = db
        .query_row("SELECT 1 FROM users WHERE id = ?1", [id], |_| Ok(true))
        .unwrap_or(false);
    if !exists {
        return Err(ApiError::not_found("用户不存在"));
    }
    let folders: Vec<i64> = {
        let mut stmt = db
            .prepare("SELECT folder_id FROM user_folder_permissions WHERE user_id = ?1")
            .unwrap();
        stmt.query_map([id], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };
    Ok(Json(json!(folders)))
}

async fn set_user_folders(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let exists: bool = db
        .query_row("SELECT 1 FROM users WHERE id = ?1", [id], |_| Ok(true))
        .unwrap_or(false);
    if !exists {
        return Err(ApiError::not_found("用户不存在"));
    }
    let folder_ids: Vec<i64> = body
        .get("folder_ids")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_i64()).collect())
        .unwrap_or_default();

    db.execute("DELETE FROM user_folder_permissions WHERE user_id = ?1", [id])
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    for fid in &folder_ids {
        let fexists: bool = db
            .query_row("SELECT 1 FROM folders WHERE id = ?1", [fid], |_| Ok(true))
            .unwrap_or(false);
        if fexists {
            db.execute(
                "INSERT OR IGNORE INTO user_folder_permissions (user_id, folder_id) VALUES (?1, ?2)",
                rusqlite::params![id, fid],
            )
            .map_err(|e| ApiError::bad_request(&e.to_string()))?;
        }
    }
    Ok(Json(json!({ "ok": true, "granted": folder_ids })))
}

// ============ 我的可编辑文件夹 ============
async fn my_folders(State(state): State<AppState>, Auth(user): Auth) -> Json<Value> {
    if user.role == "admin" {
        return Json(json!({ "all": true, "folder_ids": [] }));
    }
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT folder_id FROM user_folder_permissions WHERE user_id = ?1")
        .unwrap();
    let folders: Vec<i64> = stmt
        .query_map([user.id], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(json!({ "all": false, "folder_ids": folders }))
}
