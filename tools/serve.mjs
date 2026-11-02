#!/usr/bin/env node
/**
 * 零依赖静态服务器：让“身体探索局”和本地 BodyVista 离线运行。
 *
 *   node tools/serve.mjs [目录] [--port 8765] [--no-open]
 *
 * 浏览器不允许 file:// 页面加载 ES 模块和 fetch 本地模型，
 * 所以 3D 人体必须通过 http://127.0.0.1 打开。这个脚本只监听本机，
 * 不联网、不安装任何依赖。
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let rootArg = '.';
let portArg = 0;
const shouldOpen = !args.includes('--no-open');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') { portArg = Number(args[++i]); continue; }
  if (args[i] === '--no-open') continue;
  if (!args[i].startsWith('--')) rootArg = args[i];
}
const root = resolve(rootArg);
const startPort = Number(process.env.PORT || portArg || 8765);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, status, message, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(message);
}

async function resolvePath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  const filePath = normalize(join(root, pathname));
  if (filePath !== root && !filePath.startsWith(root + sep)) return null;
  let info = await stat(filePath).catch(() => null);
  if (info && info.isDirectory()) {
    const indexPath = join(filePath, 'index.html');
    const indexInfo = await stat(indexPath).catch(() => null);
    if (!indexInfo) return null;
    return { filePath: indexPath, info: indexInfo };
  }
  return info ? { filePath, info } : null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  const found = await resolvePath(req.url || '/');
  if (!found) return send(res, 404, 'Not found');
  const ext = extname(found.filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' || ext === '.json'
    ? 'no-cache'
    : 'public, max-age=3600';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': found.info.size,
    'Cache-Control': cache,
    'Accept-Ranges': 'none'
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(found.filePath).on('error', () => res.destroy()).pipe(res);
});

function openBrowser(url) {
  if (!shouldOpen) return;
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* 打开失败不影响服务器运行，手动访问控制台地址即可 */
  }
}

function listen(port, attempt = 0) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < 20) return listen(port + 1, attempt + 1);
    console.error('无法启动本地服务器：', error.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log('');
    console.log('  身体探索局 · 离线课程已启动');
    console.log('  ' + url);
    console.log('');
    console.log('  按 Ctrl+C 停止。');
    openBrowser(url);
  });
}

listen(startPort);
