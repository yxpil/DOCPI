// 站点设置：公开读取 + 管理员更新
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::auth::{AdminAuth, ApiError, OptionalAuth};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/settings", get(get_settings).put(put_settings))
}

async fn get_settings(
    State(state): State<AppState>,
    OptionalAuth(user): OptionalAuth,
) -> Json<Value> {
    let rows: Vec<(String, String)> = {
        let db = state.db.lock().unwrap();
        let mut stmt = db.prepare("SELECT key, value FROM settings").unwrap();
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };
    let mut out = serde_json::Map::new();
    for (k, v) in rows {
        out.insert(k, Value::String(v));
    }
    out.insert(
        "_isAdmin".into(),
        Value::Bool(user.map(|u| u.role == "admin").unwrap_or(false)),
    );
    Json(Value::Object(out))
}

async fn put_settings(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    {
        let db = state.db.lock().unwrap();
        for key in ["site_name", "site_desc"] {
            if let Some(v) = body.get(key).and_then(|v| v.as_str()) {
                db.execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [key, v],
                )
                .map_err(|e| ApiError::bad_request(&e.to_string()))?;
            }
        }
    }
    Ok(Json(json!({ "ok": true })))
}
