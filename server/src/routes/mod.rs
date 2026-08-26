// 路由聚合
mod auth;
mod projects;
mod settings;
mod upload;

use axum::Router;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    auth::router()
        .merge(settings::router())
        .merge(upload::router())
        .merge(projects::router())
}
