# DOCPI 测试说明

- 测试完成：是（2026-10-04）
- 测试日期：2026-10-04
- 测试内容：单元：escapeHtml XSS 转义、canEditFolder 文件夹权限判定；注入：<script>/onerror 事件属性载荷
- 运行命令：cd frontend && npm test
- 测试框架：Vitest + jsdom
- 模型：豆包（Doubao）生成


DOCPI = Rust 服务端（`server/`）+ TypeScript 前端（`frontend/`）。本次在 **frontend** 补 Vitest 单测。

## 运行方式

```bash
cd frontend
npm install
npm test
```

## 测了什么

测试目录：`frontend/tests/`（Vitest + jsdom）
- `ui.test.ts` —— `escapeHtml` XSS 转义：`< > &` 被实体化；
  - **注入防护**：`<script>alert(1)</script>`、`"><img src=x onerror=...>` 等载荷中的尖括号被转义为 `&lt; &gt;`，无法解析成可执行标签/事件属性。
- `auth.test.ts` —— `canEditFolder` 权限判定：未登录拒绝、管理员放行、`myFolders.all` 全库放行、按 `folder_ids` 白名单精确授权（越权文件夹拒绝）。

## 原有测试覆盖
- `scripts/test.js`：端到端集成脚本（登录/验证码/项目/文件夹/文档/搜索/文件夹继承授权/API Token/上传/级联删除），需先启动 Rust 服务，未纳入本 npm test。

## 预期结果

```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

> Rust 服务端未在本环境 `cargo test`（无构建依赖）；前端纯逻辑已用 jsdom 直接单测。
