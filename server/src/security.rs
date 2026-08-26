// 安全：密码哈希（scrypt）、token 生成、时间格式
use chrono::{Duration, Local};
use rand::RngCore;
use scrypt::{scrypt, Params};
use sha2::{Digest, Sha256};

// 与 Node crypto.scryptSync 默认参数一致：N=2^14, r=8, p=1, 输出 64 字节
fn scrypt_params() -> Params {
    Params::new(14, 8, 1, 64).expect("scrypt 参数非法")
}

/// 生成密码哈希：`<salt_hex>:<hash_hex>`
pub fn hash_password(password: &str) -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut out = [0u8; 64];
    scrypt(password.as_bytes(), &salt, &scrypt_params(), &mut out).expect("scrypt 失败");
    format!("{}:{}", hex::encode(salt), hex::encode(out))
}

/// 校验密码（常量时间比较）
pub fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split(':').collect();
    if parts.len() != 2 {
        return false;
    }
    let salt = match hex::decode(parts[0]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let expected = match hex::decode(parts[1]) {
        Ok(h) => h,
        Err(_) => return false,
    };
    let mut out = vec![0u8; expected.len()];
    if scrypt(password.as_bytes(), &salt, &scrypt_params(), &mut out).is_err() {
        return false;
    }
    if out.len() != expected.len() {
        return false;
    }
    out.iter()
        .zip(expected.iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

/// 生成随机 hex token
pub fn generate_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

/// 会话/API token 的 SHA-256 哈希（存库用散列）
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// 本地时间字符串 `YYYY-MM-DD HH:MM:SS`
pub fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 当前时间 + 毫秒偏移，输出本地时间字符串
pub fn now_local_plus(ms: i64) -> String {
    (Local::now() + Duration::milliseconds(ms))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}
