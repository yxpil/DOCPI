// 前端构建：用 esbuild 将 frontend/src/*.ts 转译为 public/js/*.js（ES module，保留模块结构）
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
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

console.log('✔ frontend build 完成 → public/js/');
