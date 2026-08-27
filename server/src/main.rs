// DocPI 后端入口：axum 服务 + 静态前端
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Json, Router};
use serde_json::json;
use tower_http::services::{ServeDir, ServeFile};

#[tokio::main]
async fn main() {
    let db = docpi::db::init_db();
    let state = docpi::state::AppState {
        db,
        captcha: docpi::captcha::CaptchaStore::new(),
    };

    let api_router = docpi::routes::router().fallback(api_not_found);

    let public_dir = docpi::config::public_dir();
    // 静态文件未找到时返回 404.html（同时保留 404 状态码）
    let static_service = ServeDir::new(&public_dir)
        .append_index_html_on_directories(true)
        .not_found_service(ServeFile::new(public_dir.join("404.html")));

    let app: Router = Router::new()
        .nest("/api", api_router)
        .fallback_service(static_service)
        .with_state(state);

    let port = docpi::config::port();
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("端口绑定失败");
    println!("DocPI 已启动: http://localhost:{port}");
    axum::serve(listener, app).await.expect("服务异常退出");
}

/// 未匹配的 /api/* 返回 404 JSON
async fn api_not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "接口不存在" })))
}
