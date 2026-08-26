// 数据库：建表 + 索引 + 默认设置 + 初始管理员
use std::fs;
use rusqlite::Connection;
use crate::config;
use crate::security::hash_password;
use crate::state::Db;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'engineer',
  email         TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  qq            TEXT DEFAULT '',
  avatar        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL,
  parent_id   INTEGER,
  name        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id   INTEGER NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  price       TEXT DEFAULT '',
  repo_url    TEXT DEFAULT '',
  link        TEXT DEFAULT '',
  author_id   INTEGER,
  updated_by  INTEGER,
  created_at  TEXT DEFAULT (datetime('now','localtime')),
  updated_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  folder_id  INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_folder_permissions (
  user_id     INTEGER NOT NULL,
  folder_id   INTEGER NOT NULL,
  PRIMARY KEY (user_id, folder_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS uploads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,
  filename      TEXT NOT NULL,
  original_name TEXT DEFAULT '',
  mime_type     TEXT DEFAULT '',
  size          INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
"#;

const INDEXES: &str = r#"
CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_author ON documents(author_id);
CREATE INDEX IF NOT EXISTS idx_ufp_user ON user_folder_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_apitokens_user ON api_tokens(user_id);
"#;

/// 打开数据库连接并完成初始化（建表 + 索引 + 默认设置 + 初始管理员）
pub fn open_connection() -> Connection {
    let dir = config::data_dir();
    fs::create_dir_all(&dir).expect("无法创建 data 目录");
    let conn = Connection::open(dir.join("docpi.db")).expect("无法打开数据库");
    conn.execute_batch("PRAGMA journal_mode = WAL;").expect("设置 WAL 失败");
    conn.execute_batch(SCHEMA).expect("建表失败");
    conn.execute_batch(INDEXES).expect("建索引失败");

    // 默认站点设置
    let defaults = [("site_name", "DocPI"), ("site_desc", "开发文档公示平台")];
    for (k, v) in defaults {
        let exists: bool = conn
            .query_row("SELECT 1 FROM settings WHERE key = ?1", [k], |_| Ok(true))
            .unwrap_or(false);
        if !exists {
            conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", [k, v])
                .expect("写入默认设置失败");
        }
    }

    // 初始管理员
    let username = config::admin_username();
    let exists: Option<i64> = conn
        .query_row("SELECT id FROM users WHERE username = ?1", [&username], |r| r.get(0))
        .ok();
    if exists.is_none() {
        let password = config::admin_password();
        conn.execute(
            "INSERT INTO users (username, password_hash, display_name, role) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![username, hash_password(&password), "系统管理员", "admin"],
        )
        .expect("创建初始管理员失败");
        println!("[db] 已创建初始管理员账号: {}", config::admin_username());
    }

    conn
}

/// 初始化数据库，返回共享连接
pub fn init_db() -> Db {
    std::sync::Arc::new(std::sync::Mutex::new(open_connection()))
}
