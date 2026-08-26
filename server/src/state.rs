// 应用共享状态
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use crate::captcha::CaptchaStore;

pub type Db = Arc<Mutex<Connection>>;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub captcha: CaptchaStore,
}
