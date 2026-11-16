#!/usr/bin/env node
/* 把 deck 內容表（JSON）做成一個可以直接打開、可以編輯的單檔 HTML。
   用法：node scripts/build.mjs <deck.json> [-o <輸出.html>] [--light]
   流程：驗證內容表 → 用無頭瀏覽器自動排版並檢查 → 把排好的每一頁烘焙成固定位置的物件
        → 裝進播放器外殼，內嵌編輯器與 PPTX 匯出（原始檔在 editor/）。
   --light：不烘焙，只輸出「打開時才自動排版」的中間檔（沒有編輯器，除錯用，不要交付）。
   內容表有錯就不產檔，並用白話指出是哪一頁、哪個欄位；排版檢查有錯誤時仍會產檔，但結束碼是 1。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';
import { loadEditor, assemble, FONT_LINK } from './lib/shell.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(here, '..', 'runtime');
const args = process.argv.slice(2);
const li = args.indexOf('--light');
const light = li >= 0 && !!args.splice(li, 1);
const oi = args.indexOf('-o');
const outArg = oi >= 0 ? args.splice(oi, 2)[1] : null;
const input = args[0];
if (!input) {
  console.error('用法：node scripts/build.mjs <deck.json> [-o <輸出.html>] [--light]');
  process.exit(2);
}

const catalog = JSON.parse(fs.readFileSync(path.join(runtime, 'catalog.json'), 'utf8'));
const ICONS = new Set(catalog.icons.map(i => i.id));
const PALETTES = new Set(catalog.palettes.map(p => p.id));
const BGS = new Set([...catalog.backgrounds.map(b => b.id), 'none']);

let deck;
try {
  deck = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^﻿/, ''));
} catch (e) {
  console.error(`讀不懂 ${input}：${e.message}`);
  process.exit(1);
}

/* ---------------- 驗證 ---------------- */
const errors = [], warns = [];
const isText = v => typeof v === 'string' && v.trim() !== '';
const HEX = /^#[0-9A-Fa-f]{6}$/;
const oneOf = (where, key, v, list) => { if (v != null && !list.includes(v)) errors.push(`${where}：${key} 是「${v}」，只能是 ${list.join('、')}`); };
const known = (where, obj, keys) => { for (const k of Object.keys(obj || {})) if (!keys.includes(k)) warns.push(`${where}：不認得欄位「${k}」，會被忽略（可用欄位：${keys.join('、')}）`); };

const SCRIMS = ['none', 'content', 'left', 'right', 'top', 'bottom', 'center', 'veil'];
const BG_KEYS = ['style', 'seed', 'vary', 'density', 'strength', 'scrim', 'veil', 'rest', 'cover', 'limit', 'grain', 'animate', 'loop', 'phase'];
function checkBg(where, bg) {
  if (bg == null) return;
  known(where, bg, BG_KEYS);
  oneOf(where, 'style', bg.style, [...BGS]);
  oneOf(where, 'scrim', bg.scrim, SCRIMS);
  for (const k of ['density', 'strength', 'veil', 'rest', 'cover', 'phase']) if (bg[k] != null && !(bg[k] >= 0 && bg[k] <= 1)) errors.push(`${where}：${k} 要介於 0 到 1`);
}

if (!deck || typeof deck !== 'object' || !Array.isArray(deck.slides) || !deck.slides.length) errors.push('內容表最外層要有 slides 陣列，而且至少一頁');
known('最外層', deck, ['title', 'theme', 'background', 'footer', 'slides']);

const theme = deck.theme || {};
known('theme', theme, ['palette', 'font', 'radius', 'icon', 'surface']);
if (typeof theme.palette === 'string') { if (!PALETTES.has(theme.palette)) errors.push(`theme.palette 是「${theme.palette}」，可用配色：${[...PALETTES].join('、')}`); }
else if (theme.palette != null) {
  const p = theme.palette;
  if (!HEX.test(p.bg || '') || !Array.isArray(p.c) || p.c.length !== 3 || !p.c.every(c => HEX.test(c)))
    errors.push('自訂 theme.palette 的格式是 {"bg":"#RRGGBB","c":["#深","#中","#淺"]}');
}
oneOf('theme', 'font', theme.font, ['sans', 'serif']);
oneOf('theme', 'icon', theme.icon, ['duo', 'line', 'offset']);
oneOf('theme', 'surface', theme.surface, ['auto', 'tint', 'solid', 'outline', 'none']);
checkBg('background', deck.background);

const COMMON = ['type', 'background', 'notes'];
const SPEC = {
  cover: ['eyebrow', 'title', 'subtitle', 'meta', 'align'],
  statement: ['kind', 'number', 'eyebrow', 'text', 'sub', 'by', 'meta', 'align'],
  points: ['eyebrow', 'title', 'lead', 'item', 'arrange', 'surface', 'highlight', 'items', 'takeaway', 'align'],
  compare: ['eyebrow', 'title', 'lead', 'left', 'right', 'highlight', 'marks', 'takeaway'],
};
const ITEM_KINDS = ['icon', 'number', 'bullet', 'image', 'block', 'metric'];

(deck.slides || []).forEach((s, i) => {
  const w = `第 ${i + 1} 頁`;
  if (!s || !SPEC[s.type]) { errors.push(`${w}：type 是「${s && s.type}」，只能是 ${Object.keys(SPEC).join('、')}`); return; }
  known(`${w}（${s.type}）`, s, [...COMMON, ...SPEC[s.type]]);
  checkBg(`${w} 的 background`, s.background);
  oneOf(w, 'align', s.align, ['left', 'center']);

  if (s.type === 'cover') {
    if (!isText(s.title)) errors.push(`${w}：封面需要 title`);
  } else if (s.type === 'statement') {
    if (!isText(s.text)) errors.push(`${w}：statement 需要 text（那一句要讓觀眾記住的話）`);
    oneOf(w, 'kind', s.kind, ['section', 'quote', 'closing']);
  } else if (s.type === 'points') {
    if (!isText(s.title)) errors.push(`${w}：需要 title`);
    oneOf(w, 'item', s.item, ITEM_KINDS);
    oneOf(w, 'arrange', s.arrange, ['auto', 'columns', 'rows', 'split']);
    oneOf(w, 'surface', s.surface, ['auto', 'tint', 'solid', 'outline', 'none']);
    const kind = s.item || 'icon';
    if (kind === 'bullet' && s.arrange === 'columns') warns.push(`${w}：列點（bullet）排成橫排不好讀，建議用 rows 或 split`);
    if (!Array.isArray(s.items) || s.items.length < 2 || s.items.length > 6) {
      errors.push(`${w}：items 要有 2 到 6 項（現在 ${Array.isArray(s.items) ? s.items.length : 0} 項）。超過 6 項請拆頁`);
    } else {
      if (s.highlight != null && !(Number.isInteger(s.highlight) && s.highlight >= 1 && s.highlight <= s.items.length))
        errors.push(`${w}：highlight 要是 1 到 ${s.items.length} 的整數（強調第幾項）`);
      s.items.forEach((it, j) => {
        const iw = `${w} 第 ${j + 1} 項`;
        known(iw, it, ['title', 'body', 'icon', 'value', 'image', 'alt']);
        if (!isText(it.title)) errors.push(`${iw}：需要 title`);
        if (kind === 'icon' && !ICONS.has(it.icon)) errors.push(`${iw}：icon「${it.icon ?? ''}」不在圖庫裡。可用清單見 runtime/catalog.json`);
        if (kind === 'metric' && !isText(String(it.value ?? ''))) errors.push(`${iw}：metric 需要 value（例如 "72%"）`);
      });
    }
  } else if (s.type === 'compare') {
    if (!isText(s.title)) errors.push(`${w}：需要 title`);
    oneOf(w, 'highlight', s.highlight, ['left', 'right', 'none']);
    oneOf(w, 'marks', s.marks, ['cross-check', 'dot', 'none']);
    for (const side of ['left', 'right']) {
      const d = s[side];
      if (!d || !isText(d.head) || !Array.isArray(d.rows) || d.rows.length < 1 || d.rows.length > 6 || !d.rows.every(isText))
        errors.push(`${w}：${side} 需要 head 與 1 到 6 列 rows（每列一句話）`);
    }
  }
});

/* 連續三頁長得一樣，就提醒換一種內容型態或排列 */
const sig = s => s && s.type === 'points' ? `${s.item || 'icon'}/${s.arrange || 'auto'}` : null;
for (let i = 2; i < (deck.slides || []).length; i++) {
  const a = sig(deck.slides[i]);
  if (a && a === sig(deck.slides[i - 1]) && a === sig(deck.slides[i - 2]))
    warns.push(`第 ${i - 1} 到 ${i + 1} 頁連續三頁都是 ${a}，建議換一種 item 或 arrange`);
}

for (const m of warns) console.warn('提醒  ' + m);
if (errors.length) {
  for (const m of errors) console.error('錯誤  ' + m);
  console.error(`\n內容表有 ${errors.length} 個錯誤，沒有產生 HTML。`);
  process.exit(1);
}

/* ---------------- 輸出 ---------------- */
const rd = f => fs.readFileSync(path.join(runtime, f), 'utf8').replace(/\r\n/g, '\n');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* 內容表要放進 <script> 裡：把 < 與兩個特殊換行字元改成跳脫寫法，避免提早結束標籤 */
const BS = String.fromCharCode(92), LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const data = JSON.stringify(deck).split(String.fromCharCode(60)).join(BS + "u003c").split(LS).join(BS + "u2028").split(PS).join(BS + "u2029");
const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="html-deck">
<title>${esc(deck.title || '簡報')}</title>
${FONT_LINK}<style>
${rd('deck.css')}</style>
</head>
<body>
<div id="deck"></div>
<script type="application/json" id="deck-data">${data}</script>
<script>
${rd('workshop.js')}</script>
<script>
${rd('deck.js')}</script>
<script>Deck.mount('#deck');</script>
</body>
</html>
`;

const out = outArg || input.replace(/(\.deck)?\.json$/i, '') + '.html';
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const size = t => (t.length > 1e6 ? (t.length / 1048576).toFixed(1) + ' MB' : Math.round(t.length / 1024) + ' KB');
const done = (t, bad) => console.log(`已產生 ${out}（${deck.slides.length} 頁，${size(t)}）${warns.length ? `，${warns.length} 個提醒` : ''}${bad ? `，排版檢查有 ${bad} 個錯誤` : ''}`);

if (light) {
  fs.writeFileSync(out, html);
  done(html);
} else {
  /* 自動排版要靠瀏覽器：把輕量版寫到暫存檔，用無頭瀏覽器打開、檢查，再把排好的結果烘焙出來 */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'html-deck-build-'));
  const mid = path.join(tmp, 'layout.html');
  let browser, bad = 0;
  try {
    const editor = loadEditor();
    fs.writeFileSync(mid, html);
    browser = await launch();
    await browser.open(mid);
    await browser.run('Deck.ready.then(() => document.fonts.ready).then(() => true)');
    const report = JSON.parse(await browser.run('JSON.stringify(Deck.audit())'));
    for (const s of report) for (const x of s.issues) {
      if (x.level === 'error') bad++;
      console.log(`${x.level === 'error' ? '錯誤' : '提醒'}  第 ${s.slide} 頁 ${x.code}：${x.msg}`);
    }
    await browser.run(fs.readFileSync(path.join(runtime, 'bake.js'), 'utf8') + '\n;window.DeckBake = DeckBake; true');
    const baked = JSON.parse(await browser.run('DeckBake.run().then(JSON.stringify)'));
    for (const e of browser.pageErrors) { bad++; console.log('錯誤  頁面執行錯誤：' + e); }
    const text = assemble({ title: deck.title || '簡報', baked, editor });
    fs.writeFileSync(out, text);
    done(text, bad);
  } catch (e) {
    console.error('產檔失敗：' + e.message);
    process.exitCode = 2;
  } finally {
    if (browser) browser.close();
    setTimeout(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }, 500);
  }
  if (bad && !process.exitCode) process.exitCode = 1;
}
