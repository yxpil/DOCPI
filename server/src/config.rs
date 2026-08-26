// 配置：与 Node 版 config.js 对齐，支持环境变量覆盖
use std::env;
use std::path::PathBuf;

/// DocPI 根目录（server/ 的上级目录）
pub fn root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("server/ 应在 DocPI 根目录下")
        .to_path_buf()
}

pub fn data_dir() -> PathBuf {
    env::var("DOCPI_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root_dir().join("data"))
}

pub fn public_dir() -> PathBuf {
    env::var("DOCPI_PUBLIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root_dir().join("public"))
}

pub fn upload_dir() -> PathBuf {
    env::var("DOCPI_UPLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| public_dir().join("uploads"))
}

pub fn port() -> u16 {
    env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000)
}

/// 初始管理员账号（默认 admin/admin，可用环境变量覆盖）
pub fn admin_username() -> String {
    env::var("ADMIN_USERNAME").unwrap_or_else(|_| "admin".to_string())
}

pub fn admin_password() -> String {
    env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "admin".to_string())
}

/// 会话有效期 7 天
pub const SESSION_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// API token 默认有效期 1 年
pub const API_TOKEN_TTL_MS: i64 = 365 * 24 * 60 * 60 * 1000;

pub const COOKIE_NAME: &str = "docpi_session";

/// 验证码有效期 5 分钟
pub const CAPTCHA_TTL_MS: i64 = 5 * 60 * 1000;

/// 上传限制 20MB / 头像 2MB
pub const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_AVATAR_BYTES: usize = 2 * 1024 * 1024;

/// 测试模式：DOCPI_DISABLE_CAPTCHA=1 时跳过登录验证码
pub fn captcha_disabled() -> bool {
    env::var("DOCPI_DISABLE_CAPTCHA").map(|v| v == "1").unwrap_or(false)
}
