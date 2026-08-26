// 项目 / 文件夹 / 文档 / 搜索路由
use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::auth::{str_field, AdminAuth, ApiError, Auth, OptionalAuth};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{id}", axum::routing::put(update_project).delete(delete_project))
        .route("/projects/{pid}/folders", get(list_folders).post(create_folder))
        .route("/folders/{id}", axum::routing::put(update_folder).delete(delete_folder))
        .route("/folders/{id}/children", get(list_children))
        .route("/folders/{id}/documents", get(list_documents).post(create_document))
        .route("/documents/{id}", get(get_document).put(update_document).delete(delete_document))
        .route("/search", get(search))
}

// ============ 项目 ============
async fn list_projects(State(state): State<AppState>, OptionalAuth(_user): OptionalAuth) -> Json<Value> {
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id, name, description, created_at FROM projects ORDER BY id ASC")
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "description": r.get::<_, String>(2)?,
                "created_at": r.get::<_, String>(3)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(rows))
}

async fn create_project(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let name = str_field(&body, "name");
    if name.is_empty() {
        return Err(ApiError::bad_request("项目名称不能为空"));
    }
    let description = crate::auth::raw_field(&body, "description");
    let db = state.db.lock().unwrap();
    match db.execute(
        "INSERT INTO projects (name, description) VALUES (?1, ?2)",
        rusqlite::params![name, description],
    ) {
        Ok(_) => Ok(Json(json!({ "id": db.last_insert_rowid() }))),
        Err(e) if e.to_string().contains("UNIQUE") => Err(ApiError::bad_request("项目名称已存在")),
        Err(e) => Err(ApiError::bad_request(&e.to_string())),
    }
}

async fn update_project(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let exists: bool = db
        .query_row("SELECT 1 FROM projects WHERE id = ?1", [id], |_| Ok(true))
        .unwrap_or(false);
    if !exists {
        return Err(ApiError::not_found("项目不存在"));
    }
    let name = str_field(&body, "name");
    if name.is_empty() {
        return Err(ApiError::bad_request("项目名称不能为空"));
    }
    let description = crate::auth::raw_field(&body, "description");
    match db.execute(
        "UPDATE projects SET name = ?, description = ? WHERE id = ?",
        rusqlite::params![name, description, id],
    ) {
        Ok(_) => Ok(Json(json!({ "ok": true }))),
        Err(e) if e.to_string().contains("UNIQUE") => Err(ApiError::bad_request("项目名称已存在")),
        Err(e) => Err(ApiError::bad_request(&e.to_string())),
    }
}

async fn delete_project(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

// ============ 文件夹 ============
async fn list_folders(
    State(state): State<AppState>,
    OptionalAuth(_user): OptionalAuth,
    Path(pid): Path<i64>,
) -> Json<Value> {
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT id, project_id, parent_id, name, created_at FROM folders WHERE project_id = ?1 ORDER BY id ASC",
        )
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([pid], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "project_id": r.get::<_, i64>(1)?,
                "parent_id": r.get::<_, Option<i64>>(2)?,
                "name": r.get::<_, String>(3)?,
                "created_at": r.get::<_, String>(4)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(rows))
}

async fn list_children(
    State(state): State<AppState>,
    OptionalAuth(_user): OptionalAuth,
    Path(id): Path<i64>,
) -> Json<Value> {
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id, project_id, parent_id, name FROM folders WHERE parent_id = ?1 ORDER BY id ASC")
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "project_id": r.get::<_, i64>(1)?,
                "parent_id": r.get::<_, Option<i64>>(2)?,
                "name": r.get::<_, String>(3)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(rows))
}

async fn create_folder(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(pid): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let name = str_field(&body, "name");
    if name.is_empty() {
        return Err(ApiError::bad_request("文件夹名称不能为空"));
    }
    let parent_id = body
        .get("parent_id")
        .and_then(|v| v.as_i64())
        .filter(|v| *v > 0);
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO folders (project_id, parent_id, name) VALUES (?1, ?2, ?3)",
        rusqlite::params![pid, parent_id, name],
    )
    .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "id": db.last_insert_rowid() })))
}

async fn update_folder(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    let exists: bool = db
        .query_row("SELECT 1 FROM folders WHERE id = ?1", [id], |_| Ok(true))
        .unwrap_or(false);
    if !exists {
        return Err(ApiError::not_found("文件夹不存在"));
    }
    let name = str_field(&body, "name");
    if name.is_empty() {
        return Err(ApiError::bad_request("文件夹名称不能为空"));
    }
    db.execute("UPDATE folders SET name = ?1 WHERE id = ?2", rusqlite::params![name, id])
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

async fn delete_folder(
    State(state): State<AppState>,
    _admin: AdminAuth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM folders WHERE id = ?1", [id])
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

// ============ 文档 ============
async fn list_documents(
    State(state): State<AppState>,
    OptionalAuth(_user): OptionalAuth,
    Path(id): Path<i64>,
) -> Json<Value> {
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT d.id, d.title, d.updated_at, d.price, d.repo_url, d.link,
                    d.author_id, u.display_name, u.username
             FROM documents d LEFT JOIN users u ON u.id = d.author_id
             WHERE d.folder_id = ?1 ORDER BY d.updated_at DESC, d.id ASC",
        )
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "updated_at": r.get::<_, String>(2)?,
                "price": r.get::<_, String>(3)?,
                "repo_url": r.get::<_, String>(4)?,
                "link": r.get::<_, String>(5)?,
                "author_id": r.get::<_, Option<i64>>(6)?,
                "author_name": r.get::<_, Option<String>>(7)?,
                "author_username": r.get::<_, Option<String>>(8)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(rows))
}

async fn get_document(
    State(state): State<AppState>,
    OptionalAuth(user): OptionalAuth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let (mut doc, folder_id) = {
        let db = state.db.lock().unwrap();
        let row = db.query_row(
            "SELECT d.id, d.folder_id, d.title, d.content, d.price, d.repo_url, d.link,
                    d.author_id, d.updated_by, d.created_at, d.updated_at,
                    a.display_name AS author_name, a.username AS author_username,
                    b.display_name AS updater_name, b.username AS updater_username
             FROM documents d
             LEFT JOIN users a ON a.id = d.author_id
             LEFT JOIN users b ON b.id = d.updated_by
             WHERE d.id = ?1",
            [id],
            |r| {
                Ok((
                    json!({
                        "id": r.get::<_, i64>(0)?,
                        "folder_id": r.get::<_, i64>(1)?,
                        "title": r.get::<_, String>(2)?,
                        "content": r.get::<_, String>(3)?,
                        "price": r.get::<_, String>(4)?,
                        "repo_url": r.get::<_, String>(5)?,
                        "link": r.get::<_, String>(6)?,
                        "author_id": r.get::<_, Option<i64>>(7)?,
                        "updated_by": r.get::<_, Option<i64>>(8)?,
                        "created_at": r.get::<_, String>(9)?,
                        "updated_at": r.get::<_, String>(10)?,
                        "author_name": r.get::<_, Option<String>>(11)?,
                        "author_username": r.get::<_, Option<String>>(12)?,
                        "updater_name": r.get::<_, Option<String>>(13)?,
                        "updater_username": r.get::<_, Option<String>>(14)?,
                    }),
                    r.get::<_, i64>(1)?,
                ))
            },
        );
        match row {
            Ok(x) => x,
            Err(_) => return Err(ApiError::not_found("文档不存在")),
        }
    };

    let editable = match &user {
        Some(u) => {
            if u.via == "api_token" {
                crate::auth::can_api_token_edit(&state, u, folder_id)
            } else if u.role == "admin" {
                true
            } else {
                crate::auth::can_edit_folder(&state, u.id, folder_id)
            }
        }
        None => false,
    };
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("editable".into(), Value::Bool(editable));
    }
    Ok(Json(doc))
}

async fn create_document(
    State(state): State<AppState>,
    Auth(user): Auth,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let fid = id;
    if !crate::auth::can_write(&state, &user, fid) {
        return Err(ApiError::forbidden("无权限在该文件夹下创建文档"));
    }
    let title = str_field(&body, "title");
    if title.is_empty() {
        return Err(ApiError::bad_request("文档标题不能为空"));
    }
    let content = crate::auth::raw_field(&body, "content");
    let price = crate::auth::raw_field(&body, "price");
    let repo_url = crate::auth::raw_field(&body, "repo_url");
    let link = crate::auth::raw_field(&body, "link");

    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO documents (folder_id, title, content, price, repo_url, link, author_id, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![fid, title, content, price, repo_url, link, user.id, user.id],
    )
    .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "id": db.last_insert_rowid() })))
}

async fn update_document(
    State(state): State<AppState>,
    Auth(user): Auth,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let folder_id = {
        let db = state.db.lock().unwrap();
        db.query_row("SELECT folder_id FROM documents WHERE id = ?1", [id], |r| {
            r.get::<_, i64>(0)
        })
        .ok()
    };
    let folder_id = match folder_id {
        Some(f) => f,
        None => return Err(ApiError::not_found("文档不存在")),
    };
    if !crate::auth::can_write(&state, &user, folder_id) {
        return Err(ApiError::forbidden("无权限修改该文件夹的文档"));
    }
    let title = str_field(&body, "title");
    if title.is_empty() {
        return Err(ApiError::bad_request("文档标题不能为空"));
    }
    let content = crate::auth::raw_field(&body, "content");
    let price = crate::auth::raw_field(&body, "price");
    let repo_url = crate::auth::raw_field(&body, "repo_url");
    let link = crate::auth::raw_field(&body, "link");

    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE documents SET title=?, content=?, price=?, repo_url=?, link=?, updated_by=?, updated_at=datetime('now','localtime') WHERE id=?",
        rusqlite::params![title, content, price, repo_url, link, user.id, id],
    )
    .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

async fn delete_document(
    State(state): State<AppState>,
    Auth(user): Auth,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let folder_id = {
        let db = state.db.lock().unwrap();
        db.query_row("SELECT folder_id FROM documents WHERE id = ?1", [id], |r| {
            r.get::<_, i64>(0)
        })
        .ok()
    };
    let folder_id = match folder_id {
        Some(f) => f,
        None => return Err(ApiError::not_found("文档不存在")),
    };
    if !crate::auth::can_write(&state, &user, folder_id) {
        return Err(ApiError::forbidden("无权限删除该文件夹的文档"));
    }
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM documents WHERE id = ?1", [id])
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

// ============ 搜索 ============
async fn search(
    State(state): State<AppState>,
    OptionalAuth(_user): OptionalAuth,
    Query(q): Query<HashMap<String, String>>,
) -> Json<Value> {
    let q = q.get("q").map(|s| s.trim().to_string()).unwrap_or_default();
    if q.is_empty() {
        return Json(Value::Array(vec![]));
    }
    let like = format!("%{}%", q);
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT d.id, d.title, d.content, d.price, d.repo_url, d.link,
                    f.name AS folder_name, f.id AS folder_id,
                    p.name AS project_name, p.id AS project_id,
                    u.display_name AS author_name, u.username AS author_username
             FROM documents d
             JOIN folders f ON f.id = d.folder_id
             JOIN projects p ON p.id = f.project_id
             LEFT JOIN users u ON u.id = d.author_id
             WHERE d.title LIKE ?1 OR d.content LIKE ?1 OR d.price LIKE ?1
                OR d.repo_url LIKE ?1 OR d.link LIKE ?1 OR f.name LIKE ?1 OR p.name LIKE ?1
             ORDER BY d.updated_at DESC LIMIT 100",
        )
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([&like], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "content": r.get::<_, String>(2)?,
                "price": r.get::<_, String>(3)?,
                "repo_url": r.get::<_, String>(4)?,
                "link": r.get::<_, String>(5)?,
                "folder_name": r.get::<_, String>(6)?,
                "folder_id": r.get::<_, i64>(7)?,
                "project_name": r.get::<_, String>(8)?,
                "project_id": r.get::<_, i64>(9)?,
                "author_name": r.get::<_, Option<String>>(10)?,
                "author_username": r.get::<_, Option<String>>(11)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(rows))
}
