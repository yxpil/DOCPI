// 示例数据填充：直接操作数据库（幂等：保留初始管理员 admin，清空业务数据与其他用户）
// 用法：cargo run --bin seed
use rusqlite::Connection;

fn main() {
    let conn = docpi::db::open_connection();
    reset(&conn);
    seed(&conn);
    println!("示例数据已填充（管理员 admin / 工程师 dev1 已授权「前端」及「组件库」文件夹）");
}

fn reset(db: &Connection) {
    db.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    db.execute_batch(
        "DELETE FROM documents;
         DELETE FROM folders;
         DELETE FROM projects;
         DELETE FROM user_folder_permissions;
         DELETE FROM api_tokens;
         DELETE FROM uploads;
         DELETE FROM sessions;
         DELETE FROM users WHERE username != 'admin';",
    )
    .unwrap();
}

fn seed(db: &Connection) {
    let admin_id: i64 = db
        .query_row("SELECT id FROM users WHERE username = 'admin'", [], |r| r.get(0))
        .expect("初始管理员不存在");

    let ecom = insert_project(db, "电商平台", "电商系统开发文档公示");
    let mid = insert_project(db, "数据中台", "数据集成与治理平台");

    // 嵌套文件夹：电商平台 > 前端 > 组件库
    let fe = insert_folder(db, ecom, None, "前端");
    let fe_components = insert_folder(db, ecom, Some(fe), "组件库");
    let be = insert_folder(db, ecom, None, "后端");
    let dw = insert_folder(db, mid, None, "数据仓库");

    let quickstart = [
        "# 快速开始", "", "欢迎使用本系统。", "",
        "## 环境要求", "", "- Rust 工具链（rustc/cargo）", "- 现代浏览器", "",
        "## 安装步骤", "", "```bash", "cd server", "cargo build --release", "cargo run", "```", "",
        "> 提示：默认端口 4322，可用环境变量 PORT 覆盖。", "",
        "| 模块 | 说明 |", "| ---- | ---- |", "| 后端 | Rust + axum + SQLite |", "| 前端 | TypeScript + esbuild |",
    ]
    .join("\n");

    let component_guide = [
        "# 组件规范", "", "所有组件需遵循：", "",
        "1. 单一职责", "2. 命名清晰", "3. 含单元测试", "",
        "**强调**：提交前必须通过 lint 检查。",
    ]
    .join("\n");

    let api_design = [
        "# API 设计", "", "RESTful 风格，统一返回 JSON。", "",
        "```json", "{ \"code\": 0, \"data\": {} }", "```",
    ]
    .join("\n");

    let warehouse = [
        "# 数仓分层", "", "ODS -> DWD -> DWS -> ADS", "",
        "- ODS：原始层", "- DWD：明细层", "- DWS：汇总层", "- ADS：应用层",
    ]
    .join("\n");

    insert_doc(db, fe, "快速开始", &quickstart, "免费", "https://git.example.com/ecom/frontend.git", "https://docs.example.com/quickstart", admin_id);
    insert_doc(db, fe_components, "Button 组件", &component_guide, "", "", "", admin_id);
    insert_doc(db, be, "API 设计", &api_design, "¥99.00", "https://git.example.com/ecom/backend.git", "https://docs.example.com/api", admin_id);
    insert_doc(db, dw, "数仓分层", &warehouse, "¥199.00", "https://git.example.com/mid/warehouse.git", "", admin_id);

    // 演示工程师：dev1 / dev123456，仅授权「前端」「组件库」文件夹
    let dev_id: i64 = match db
        .query_row("SELECT id FROM users WHERE username = 'dev1'", [], |r| r.get(0))
    {
        Ok(id) => id,
        Err(_) => {
            db.execute(
                "INSERT INTO users (username, password_hash, display_name, role) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params!["dev1", docpi::security::hash_password("dev123456"), "张工", "engineer"],
            )
            .unwrap();
            db.last_insert_rowid()
        }
    };

    db.execute("DELETE FROM user_folder_permissions WHERE user_id = ?1", [dev_id]).unwrap();
    db.execute(
        "INSERT INTO user_folder_permissions (user_id, folder_id) VALUES (?1, ?2)",
        rusqlite::params![dev_id, fe],
    )
    .unwrap();
    db.execute(
        "INSERT INTO user_folder_permissions (user_id, folder_id) VALUES (?1, ?2)",
        rusqlite::params![dev_id, fe_components],
    )
    .unwrap();
}

fn insert_project(db: &Connection, name: &str, desc: &str) -> i64 {
    db.execute(
        "INSERT INTO projects (name, description) VALUES (?1, ?2)",
        rusqlite::params![name, desc],
    )
    .unwrap();
    db.last_insert_rowid()
}

fn insert_folder(db: &Connection, project_id: i64, parent_id: Option<i64>, name: &str) -> i64 {
    db.execute(
        "INSERT INTO folders (project_id, parent_id, name) VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, parent_id, name],
    )
    .unwrap();
    db.last_insert_rowid()
}

#[allow(clippy::too_many_arguments)]
fn insert_doc(
    db: &Connection,
    folder_id: i64,
    title: &str,
    content: &str,
    price: &str,
    repo_url: &str,
    link: &str,
    author_id: i64,
) -> i64 {
    db.execute(
        "INSERT INTO documents (folder_id, title, content, price, repo_url, link, author_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![folder_id, title, content, price, repo_url, link, author_id],
    )
    .unwrap();
    db.last_insert_rowid()
}
