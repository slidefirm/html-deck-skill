#!/usr/bin/env node
/* 從「簡報素材工坊」抽出背景風格、配色與 icon 骨架，產生 runtime/workshop.js 與 runtime/catalog.json。
   素材工坊是原稿；這裡只是它的投影副本，不要手改產生檔。

   用法：node scripts/sync-workshop.mjs "<簡報素材工坊資料夾>"            重新產生
        node scripts/sync-workshop.mjs "<簡報素材工坊資料夾>" --check    只比對，不寫檔 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(here, '..', 'runtime');
const args = process.argv.slice(2);
const check = args.includes('--check');
const src = args.find(a => !a.startsWith('--'));
if (!src) {
  console.error('請指定素材工坊資料夾，例如：node scripts/sync-workshop.mjs "C:/.../簡報素材工坊"');
  process.exit(2);
}

const read = f => fs.readFileSync(path.join(src, f), 'utf8').replace(/\r\n/g, '\n');
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function between(text, startRe, endRe, label) {
  const a = text.search(startRe);
  if (a < 0) throw new Error(`找不到起點：${label}。素材工坊的程式結構可能改過，請更新 sync-workshop.mjs 的定位規則。`);
  const rest = text.slice(a);
  const b = rest.search(endRe);
  if (b < 0) throw new Error(`找不到終點：${label}。素材工坊的程式結構可能改過，請更新 sync-workshop.mjs 的定位規則。`);
  return rest.slice(0, b).replace(/\s+$/, '');
}

const core = read('core.js'), bg = read('bg.js'), icons = read('icons.js');

const utils = between(core, /\/\* ---- 顏色 ---- \*\//, /\/\* ---- 提示/, 'core.js 顏色與亂數工具');
const ramp = between(bg, /^  const ramp = /m, /\n/, 'bg.js ramp');
const pals = between(bg, /^  const PALS = \[/m, /^  const state = \{/m, 'bg.js PALS');
const styles = between(bg, /^  const STYLES = \{/m, /^  \/\* -+ 疊加/m, 'bg.js STYLES');
const lib = between(icons, /^  const LIB = \[/m, /^  const CATS = /m, 'icons.js LIB');
const toPath = between(icons, /^  function toPath\(/m, /^  \/\* 24 單位座標內的圖形內容 \*\//m, 'icons.js toPath');

const js = `/* 自動產生，請勿手改。
   來源：簡報素材工坊（core.js ${sha(core)}、bg.js ${sha(bg)}、icons.js ${sha(icons)}）
   產生方式：node scripts/sync-workshop.mjs "<簡報素材工坊資料夾>" */
'use strict';
const WORKSHOP = (() => {
  const W = 1920, H = 1080, TAU = Math.PI * 2;

${utils}

  const low = Object.assign(document.createElement('canvas'), { width: 384, height: 216 });
  const lctx = low.getContext('2d');
  const pts = new Float32Array(8);
${ramp}

${pals}

${styles}

${lib}

${toPath}

  return { W, H, TAU, hex2rgb, mix, rgba, lum, onColor, mulberry32, pick, num, PALS, STYLES, LIB, toPath };
})();
`;

/* 目錄檔：給 build 驗證與 Agent 挑選用，不必讀 JS 就知道有哪些可選 */
const PALS = new Function(`${pals}\n return PALS;`)();
const LIB = new Function(`${lib}\n return LIB;`)();
const styleNames = [...styles.matchAll(/^    (\w+): \{\n      name: '([^']+)'/gm)].map(m => ({ id: m[1], name: m[2] }));
if (!styleNames.length) throw new Error('沒有解析到任何背景風格，請檢查 bg.js 的 STYLES 結構。');

const catalog = {
  note: '自動產生，請勿手改。由 scripts/sync-workshop.mjs 從簡報素材工坊產生。',
  backgrounds: styleNames,
  palettes: PALS.map(p => ({ id: p.id, name: p.name, bg: p.bg, c: p.c })),
  icons: LIB.map(i => ({ id: i.id, name: i.name, cat: i.cat, tags: i.tags })),
};
const json = JSON.stringify(catalog, null, 2) + '\n';

const outJs = path.join(runtime, 'workshop.js'), outJson = path.join(runtime, 'catalog.json');
if (check) {
  const same = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null;
  const stale = [same(outJs) !== js && 'runtime/workshop.js', same(outJson) !== json && 'runtime/catalog.json'].filter(Boolean);
  if (stale.length) { console.error('與素材工坊不同步：' + stale.join('、')); process.exit(1); }
  console.log('與素材工坊同步。');
} else {
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(outJs, js);
  fs.writeFileSync(outJson, json);
  console.log(`已產生 runtime/workshop.js 與 runtime/catalog.json：背景 ${styleNames.length} 種、配色 ${PALS.length} 組、icon ${LIB.length} 個。`);
}
