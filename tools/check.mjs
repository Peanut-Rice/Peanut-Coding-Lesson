#!/usr/bin/env node
/**
 * 作品自检 · 零依赖
 *
 *   node tools/check.mjs
 *
 * 这套作品的全部卖点是「单文件、完全离线」，所以这里主要盯三件事：
 * 1. 页面不许再悄悄发起网络请求（字体 CDN、图片外链、脚本 CDN）；
 * 2. 每页都有 title / description / 唯一的 h1，链接都能点开；
 * 3. 文件体积别失控。
 *
 * 只需要 Node 18+，不需要安装任何依赖。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* 只允许出现在正文里的外部链接（说明性文字，不加载资源） */
const ALLOWED_LINKS = [/^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/];

/* 单页体积上限（KB）：拉布布内联了 Three.js，单独放宽 */
const SIZE_LIMITS = { default: 300, '拉布布3D：柔软怪物.html': 1100 };

const problems = [];
const warnings = [];
const fail = (page, msg) => problems.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

/** 取标签里的属性值。文件名里有撇号（Peanut's …），不能用 [^"'] 一把抓 */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : undefined;
}

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

for (const page of pages) {
  const raw = readFileSync(join(ROOT, page), 'utf8');
  const kb = Math.round(statSync(join(ROOT, page)).size / 1024);

  /* ---- 1. 外部资源 ---- */
  const resourceTags = [...raw.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*>/gi)];
  for (const [tag] of resourceTags) {
    // <link rel="canonical"> 之类只是元信息，浏览器不会去下载
    if (/^<link/i.test(tag)) {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      if (/(canonical|alternate|author|license|me)/.test(rel)) continue;
    }
    const url = attr(tag, 'src') || attr(tag, 'href');
    if (url && /^https?:\/\//i.test(url)) fail(page, `外部资源: ${url.slice(0, 70)}`);
  }
  for (const m of raw.matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)/gi)) {
    fail(page, `CSS 里的外部资源: ${m[1].slice(0, 70)}`);
  }

  /* ---- 2. 正文外链（只提醒，不拦） ---- */
  for (const m of raw.matchAll(/<a\b[^>]*>/gi)) {
    const url = attr(m[0], 'href');
    if (url && /^https?:\/\//i.test(url) && !ALLOWED_LINKS.some((re) => re.test(url))) {
      warn(page, `正文外链: ${url.slice(0, 70)}`);
    }
  }

  /* ---- 3. head 里的基本信息 ---- */
  if (!/<html[^>]*\blang\s*=/i.test(raw)) fail(page, '缺少 <html lang>');
  if (!/<meta\s+name=["']description["'][^>]*content=["'][^"']+["']/i.test(raw)) fail(page, '缺少 meta description');
  const title = (raw.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  if (!title || !title.trim()) fail(page, '缺少 <title>');

  /* ---- 4. 标题层级 ---- */
  const h1 = [...raw.matchAll(/<h1\b/gi)].length;
  if (h1 === 0) fail(page, '没有 h1');
  else if (h1 > 1) warn(page, `有 ${h1} 个 h1`);

  /* ---- 5. 本地链接 ---- */
  const localHrefs = new Set(
    [...raw.matchAll(/<a\b[^>]*>/gi)]
      .map((m) => attr(m[0], 'href'))
      .filter(Boolean)
      .filter((h) => !/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(h))
      .map((h) => decodeURI(h.split('#')[0]))
      .filter(Boolean)
  );
  for (const href of localHrefs) {
    if (!existsSync(join(ROOT, href))) fail(page, `链接指向不存在的文件: ${href}`);
  }

  /* ---- 6. 图片 ---- */
  for (const [tag] of raw.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/i.test(tag)) warn(page, `图片缺 alt: ${tag.slice(0, 60)}`);
    const src = attr(tag, 'src');
    if (src && !/^(?:data:|https?:)/i.test(src) && !existsSync(join(ROOT, decodeURI(src)))) {
      fail(page, `图片不存在: ${src}`);
    }
  }

  /* ---- 7. 体积 ---- */
  const limit = SIZE_LIMITS[page] ?? SIZE_LIMITS.default;
  if (kb > limit) warn(page, `页面 ${kb}KB，超过建议上限 ${limit}KB`);
}

/* ---- 输出 ---- */
const line = (s) => console.log(s);
line(`\n检查了 ${pages.length} 个页面：${pages.join('、')}\n`);

if (problems.length) {
  line(`✗ ${problems.length} 个问题`);
  for (const p of problems) line(`  · ${p}`);
} else {
  line('✓ 没有发现问题');
}
if (warnings.length) {
  line(`\n⚠ ${warnings.length} 条提醒（不阻塞）`);
  for (const w of warnings) line(`  · ${w}`);
}
line('');
process.exit(problems.length ? 1 : 0);
