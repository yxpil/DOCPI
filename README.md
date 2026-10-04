# DocPI · 开发文档公示软件

一个本地运行的开发文档公示系统，三级层级结构 **项目 → 文件夹（可嵌套）→ 文档**，支持 Markdown 渲染、全文搜索、左右分栏布局、登录鉴权与文件夹级权限控制，数据存储在 SQLite。

## 功能特性

- 📁 **三级结构**：项目 (Project) → 文件夹 (Folder，支持任意嵌套) → 文档 (Document)
- 📝 **Markdown 支持**：标题、列表、代码块、表格、引用、图片等完整渲染
- 🔍 **全文搜索**：可搜索文档标题、正文、价格、仓库地址、文件夹名、项目名
- 🖥️ **左右布局**：左侧树形导航 + 搜索，右侧文档查看/编辑
- 🔐 **登录鉴权**：账号密码登录 + 图形验证码，会话 7 天有效
- 👥 **权限控制**：管理员/工程师角色，文件夹级授权（含祖先继承），API Token 供 AI 调用
- 🗄️ **SQLite 存储**：`rusqlite`（bundled，零外部依赖），WAL 模式
- ♻️ **级联删除**：删除项目/文件夹时自动删除其下所有内容
- 🖼️ **文件上传**：base64 上传，支持头像与附件

## 技术栈

- **后端**：Rust + [axum](https://github.com/tokio-rs/axum) + [rusqlite](https://github.com/rusqlite/rusqlite)（bundled SQLite）
- **前端**：TypeScript + 原生 ES Module（无框架）+ `marked.js`（Markdown）+ Tailwind（CDN）
- **构建**：前端用 [esbuild](https://esbuild.github.io/) 转译

## 目录结构

```
DocPI/
├── server/                # Rust 后端
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs        # 入口：axum 服务 + 静态前端
│       ├── lib.rs         # 库根
│       ├── config.rs      # 配置（环境变量覆盖）
│       ├── db.rs          # 建表 + 初始管理员
│       ├── security.rs    # scrypt 密码哈希、token
│       ├── captcha.rs     # 图形验证码（点阵字体 PNG）
│       ├── auth.rs        # 登录态提取 + 权限判断
│       ├── state.rs       # 共享状态
│       ├── routes/        # auth / projects / settings / upload 路由
│       └── bin/seed.rs    # 示例数据填充
├── frontend/              # TypeScript 前端源码 + esbuild 构建
│   ├── src/*.ts
│   ├── build.mjs
│   ├── tsconfig.json
│   └── package.json
├── public/                # 前端静态资源（Rust 直接 serve，js/ 由 frontend 构建产出）
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── vendor/
├── scripts/test.js        # 接口自动化测试（41 项断言，Node 运行）
├── data/                  # SQLite 数据库（自动创建，已 gitignore）
└── .gitignore
```

## 运行方法

### 后端（Rust）

```powershell
cd server
cargo build --release   # 或 cargo run（debug）
cargo run
```

浏览器打开 **http://localhost:4322** 即可使用。

> 依赖说明：`rusqlite` 的 `bundled` 特性会编译 SQLite C 源码，需要 C 编译器。
> Windows 上若使用 MSVC 工具链需安装 Visual Studio Build Tools；若已装 MinGW 可直接用 GNU 工具链：
> `rustup toolchain install stable-x86_64-pc-windows-gnu`。

### 前端（TypeScript，仅修改前端时需要）

前端已构建好并提交在 `public/js/`，直接运行后端即可。如需修改前端源码：

```powershell
cd frontend
npm install
npm run build      # esbuild 将 src/*.ts 转译到 ../public/js/
npm run typecheck  # tsc 类型检查
```

### 填充示例数据

```powershell
cd server
cargo run --bin seed
```

填充后可用演示账号登录：

| 账号 | 密码 | 角色 |
| ---- | ---- | ---- |
| admin | admin | 管理员 |
| dev1 | dev123456 | 工程师（仅授权「前端」「组件库」文件夹） |

## 环境变量

| 变量 | 默认值 | 说明 |
| ---- | ---- | ---- |
| `PORT` | `4322` | 服务端口 |
| `ADMIN_USERNAME` | `admin` | 初始管理员用户名 |
| `ADMIN_PASSWORD` | `admin` | 初始管理员密码（**生产环境务必修改**） |
| `DOCPI_DATA_DIR` | `./data` | SQLite 数据目录 |
| `DOCPI_PUBLIC_DIR` | `./public` | 静态资源目录 |
| `DOCPI_UPLOAD_DIR` | `./public/uploads` | 上传目录 |
| `DOCPI_DISABLE_CAPTCHA` | 空 | 设为 `1` 时跳过登录验证码（测试用） |

## 运行测试

```powershell
# 先以禁用验证码模式启动服务
$env:DOCPI_DISABLE_CAPTCHA="1"
cargo run

# 另开终端运行测试（需 Node ≥ 18）
node scripts/test.js
```

## API 接口

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/api/auth/captcha` | 签发验证码 |
| POST | `/api/auth/login` | 登录（返回 token） |
| POST | `/api/auth/logout` | 登出 |
| GET/PUT | `/api/auth/me` | 当前用户资料 |
| PUT | `/api/auth/me/avatar` | 上传头像（base64） |
| GET/POST | `/api/auth/api-tokens` | API Token 列表 / 创建 |
| DELETE | `/api/auth/api-tokens/{id}` | 删除 Token |
| GET/POST | `/api/auth/users` | 用户列表 / 新建（管理员） |
| PUT/DELETE | `/api/auth/users/{id}` | 修改 / 删除用户（管理员） |
| GET/PUT | `/api/auth/users/{id}/folders` | 用户文件夹授权（管理员） |
| GET | `/api/auth/my-folders` | 我的可编辑文件夹 |
| GET/PUT | `/api/settings` | 站点设置 |
| POST | `/api/upload` | 上传文件（base64） |
| GET | `/api/uploads` | 上传列表 |
| GET/POST | `/api/projects` | 项目列表 / 新建 |
| PUT/DELETE | `/api/projects/{id}` | 修改 / 删除项目 |
| GET/POST | `/api/projects/{pid}/folders` | 项目下文件夹 / 新建 |
| PUT/DELETE | `/api/folders/{id}` | 修改 / 删除文件夹 |
| GET | `/api/folders/{id}/children` | 子文件夹 |
| GET/POST | `/api/folders/{id}/documents` | 文档列表 / 新建 |
| GET/PUT/DELETE | `/api/documents/{id}` | 读取 / 更新 / 删除文档 |
| GET | `/api/search?q=` | 全文搜索 |

---

<div align="center">

<a href="https://github.com/yxpil/DOCPI">
  <img width="100%" src="https://alittlecatgirlpanel.yxp.hk/card?repo=yxpil/DOCPI" alt="gh-card · yxpil/DOCPI" />
</a>

<sub>Powered by <a href="https://alittlecatgirlpanel.yxp.hk"><b>gh-card</b></a> · 粉色手写体 README 仓库名片</sub>

</div>
