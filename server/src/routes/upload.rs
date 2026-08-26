// 文件上传（base64）+ 上传列表
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

use crate::auth::{ApiError, Auth};
use crate::config;
use crate::security::generate_token;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/upload", axum::routing::post(upload))
        .route("/uploads", get(list_uploads))
}

async fn upload(
    State(state): State<AppState>,
    Auth(user): Auth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let original_name = body
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("file")
        .to_string();
    let mime = body
        .get("mime")
        .and_then(|v| v.as_str())
        .unwrap_or("application/octet-stream")
        .to_string();
    let b64 = body
        .get("data")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::bad_request("无文件数据"))?;

    let buf = STANDARD
        .decode(b64)
        .map_err(|_| ApiError::bad_request("无效 base64"))?;
    if buf.is_empty() {
        return Err(ApiError::bad_request("空文件"));
    }
    if buf.len() > config::MAX_UPLOAD_BYTES {
        return Err(ApiError::bad_request("文件过大（>20MB）"));
    }

    // 安全文件名：随机名 + 原扩展名（仅保留字母数字）
    let ext: String = Path::new(&original_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            e.chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .take(10)
                .collect::<String>()
        })
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let filename = format!("{}{}", generate_token(16), ext);

    fs::create_dir_all(config::upload_dir()).map_err(|e| ApiError::bad_request(&e.to_string()))?;
    let dest = config::upload_dir().join(&filename);
    fs::write(&dest, &buf).map_err(|e| ApiError::bad_request(&e.to_string()))?;

    let id = {
        let db = state.db.lock().unwrap();
        db.execute(
            "INSERT INTO uploads (user_id, filename, original_name, mime_type, size) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![user.id, filename, original_name, mime, buf.len()],
        )
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
        db.last_insert_rowid()
    };

    Ok(Json(json!({
        "id": id,
        "url": format!("/uploads/{filename}"),
        "original_name": original_name,
        "mime_type": mime,
        "size": buf.len(),
    })))
}

async fn list_uploads(State(state): State<AppState>, Auth(user): Auth) -> Json<Value> {
    let rows: Vec<Value> = {
        let db = state.db.lock().unwrap();
        let sql = if user.role == "admin" {
            "SELECT id, filename, original_name, mime_type, size, created_at, user_id
             FROM uploads ORDER BY id DESC LIMIT 200"
        } else {
            "SELECT id, filename, original_name, mime_type, size, created_at, user_id
             FROM uploads WHERE user_id = ?1 ORDER BY id DESC LIMIT 200"
        };
        let mut stmt = db.prepare(sql).unwrap();
        let mapper = |r: &rusqlite::Row| -> rusqlite::Result<Value> {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "filename": r.get::<_, String>(1)?,
                "original_name": r.get::<_, String>(2)?,
                "mime_type": r.get::<_, String>(3)?,
                "size": r.get::<_, i64>(4)?,
                "created_at": r.get::<_, String>(5)?,
                "user_id": r.get::<_, Option<i64>>(6)?,
                "url": format!("/uploads/{}", r.get::<_, String>(1)?),
            }))
        };
        let iter = if user.role == "admin" {
            stmt.query_map([], mapper)
        } else {
            stmt.query_map([user.id], mapper)
        };
        iter.unwrap().filter_map(|r| r.ok()).collect()
    };
    Json(Value::Array(rows))
}
