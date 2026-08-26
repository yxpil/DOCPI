// 前端构建：用 esbuild 将 frontend/src/*.ts 转译为 public/js/*.js（ES module，保留模块结构）
// 构建后自动给所有模块引用和入口加缓存版本号（?v=时间戳），避免浏览器缓存旧 JS
import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');
const entries = readdirSync(srcDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((f) => join(srcDir, f));

await build({
  entryPoints: entries,
  outdir: join(__dirname, '..', 'public', 'js'),
  format: 'esm',
  target: 'es2020',
  sourcemap: true,
  charset: 'utf8',
  bundle: false,
  logLevel: 'info',
});

// ===== 缓存版本号（每次构建都变，浏览器强制刷新）=====
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const jsDir = join(__dirname, '..', 'public', 'js');
for (const f of readdirSync(jsDir)) {
  if (!f.endsWith('.js')) continue;
  const p = join(jsDir, f);
  let c = readFileSync(p, 'utf8');
  // 静态导入: from "./x.js"
  c = c.replace(/(from ")(\.\/[A-Za-z0-9_-]+\.js)(")/g, `$1$2?v=${stamp}$3`);
  // 动态导入: import("./x.js")
  c = c.replace(/(import\()(")(\.\/[A-Za-z0-9_-]+\.js)("\))/g, `$1$2$3?v=${stamp}$4`);
  writeFileSync(p, c);
}
// index.html 入口 main.js 也加版本
const htmlPath = join(__dirname, '..', 'public', 'index.html');
const html = readFileSync(htmlPath, 'utf8').replace('src="js/main.js"', `src="js/main.js?v=${stamp}"`);
writeFileSync(htmlPath, html);

console.log(`✔ frontend build 完成 → public/js/（缓存版本 v${stamp}）`);
