#!/usr/bin/env node
/* 用系統的 Chrome 或 Edge（無頭模式）打開簡報，逐頁檢查並截圖。不需要安裝任何 npm 套件。
   用法：node scripts/check.mjs <簡報.html> [--shots <截圖資料夾>] [--json <報告.json>]
   成品（build.mjs 預設產出、內嵌編輯器）：確認編輯器與 PPTX 匯出元件有啟動、沒有頁面執行錯誤，
     每段文字的行數與烘焙時相同（沒有多斷行）、物件沒有跑出畫面、卡片裡的文字沒有超出卡片。
     排版本身的檢查（溢出、字級下限、對比、過空）在 build.mjs 烘焙前就做過了。
   中間檔（build.mjs --light）：內容溢出、字級下限、超出安全邊界、文字重疊、文字與背景對比、版面過空。
   有任何「錯誤」就以結束碼 1 結束。 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, NEXT_FRAME } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const shots = opt('--shots'), jsonOut = opt('--json');
const file = args[0];
if (!file || !fs.existsSync(file)) {
  console.error('用法：node scripts/check.mjs <簡報.html> [--shots <截圖資料夾>] [--json <報告.json>]');
  process.exit(2);
}

/* 成品的檢查：等播放器外殼排完，再逐頁看 */
const BAKED_AUDIT = `(async () => {
  await new Promise(r => { const t = setInterval(() => { if (document.documentElement.dataset.layoutReady === 'true') { clearInterval(t); r(); } }, 50); setTimeout(() => { clearInterval(t); r(); }, 20000); });
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const lines = n => { const range = document.createRange(), tops = []; range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 0.5 && !tops.some(t => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
    return tops.length; };
  const name = n => '「' + n.textContent.trim().slice(0, 14) + '」';
  const slides = window.SlidePlayer ? SlidePlayer.getSlides() : [], out = [];
  for (let i = 0; i < slides.length; i++) {
    SlidePlayer.setSlide(i);
    await frame();
    const s = slides[i], sr = s.getBoundingClientRect(), issues = [];
    for (const n of s.querySelectorAll('[data-hd-lines]')) {
      const want = +n.dataset.hdLines, got = lines(n);
      if (got > want) issues.push({ level: 'error', code: 'REWRAPPED', msg: name(n) + '排版時是 ' + want + ' 行，成品變成 ' + got + ' 行' });
    }
    for (const n of s.querySelectorAll('.el')) {
      const r = n.getBoundingClientRect();
      if (r.width && (r.left < sr.left - 1 || r.top < sr.top - 1 || r.right > sr.right + 1 || r.bottom > sr.bottom + 1))
        issues.push({ level: 'error', code: 'OUT_OF_BOUNDS', msg: (n.textContent.trim() ? name(n) : '物件 ' + n.className) + '超出畫面' });
    }
    for (const m of s.querySelectorAll('.el[data-edit-structure="module"]')) {
      const mr = m.getBoundingClientRect();
      for (const n of m.querySelectorAll('[data-edit-layer="text"],[data-edit-layer="metric"]')) {
        const r = n.getBoundingClientRect();
        if (r.bottom > mr.bottom + 2 || r.right > mr.right + 2) issues.push({ level: 'error', code: 'OVERFLOW', msg: name(n) + '超出所在的卡片' });
      }
    }
    out.push({ slide: i + 1, type: (s.dataset.layoutId || '').replace('html-deck-', ''), baked: true, issues });
  }
  SlidePlayer.setSlide(0);
  const d = document.documentElement.dataset;
  return JSON.stringify({ slides: out, ready: d.layoutReady === 'true', editor: typeof window.EditMode === 'object', pptx: !!window.__pptxBrowserRuntimeReady, adjusted: +d.aiOrphanAdjusted || 0 });
})()`;

async function main(b) {
  const { send, run, open, viewport, pageErrors } = b;
  await open(file);
  const baked = await run(`!!(document.getElementById('stage') && document.documentElement.dataset.generator === 'html-deck')`);
  if (!baked && await run('typeof Deck') !== 'object') throw new Error('這個檔案不是 html-deck 產生的簡報');
  let report;
  if (baked) {
    const r = JSON.parse(await run(BAKED_AUDIT));
    report = r.slides;
    if (!r.ready) pageErrors.push('播放器外殼沒有完成排版（layoutReady 沒有出現）');
    if (!r.editor) pageErrors.push('編輯器沒有啟動（找不到 EditMode）');
    if (!r.pptx) pageErrors.push('PPTX 匯出元件沒有就緒');
    if (r.adjusted) console.log(`提醒  播放器外殼為了避免行尾落單，自動把 ${r.adjusted} 段文字的字級調小了一點`);
  } else {
    await run('Deck.ready.then(() => true)');
    report = JSON.parse(await run('JSON.stringify(Deck.audit())'));
  }

  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    if (baked) await run(`EditMode.toggle(false); ${NEXT_FRAME}`);                             // 切到投影模式，畫面才是完整的一頁
    const names = [];
    for (let i = 0; i < report.length; i++) {
      await run(`${baked ? 'SlidePlayer.setSlide' : 'Deck.go'}(${i}); ${NEXT_FRAME}`);
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 0.5 } });
      const name = `slide-${String(i + 1).padStart(2, '0')}.jpg`;
      fs.writeFileSync(path.join(shots, name), Buffer.from(data, 'base64'));
      names.push(name);
    }
    /* 總覽圖：每張 8 頁，兩欄 */
    for (let p = 0; p * 8 < names.length; p++) {
      const part = names.slice(p * 8, p * 8 + 8), rows = Math.ceil(part.length / 2);
      const sheet = path.join(shots, `_sheet-${p + 1}.html`);
      fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222;display:grid;grid-template-columns:960px 960px}img{display:block;width:960px;height:540px;outline:2px solid #222;outline-offset:-1px}</style>${part.map(n => `<img src="${n}">`).join('')}`);
      await viewport(1920, rows * 540);
      await open(sheet);
      await run(`Promise.all([...document.images].map(i => i.decode())).then(() => ${NEXT_FRAME})`);
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
      fs.writeFileSync(path.join(shots, `sheet-${p + 1}.jpg`), Buffer.from(data, 'base64'));
      fs.rmSync(sheet);
    }
  }

  /* ---------------- 回報 ---------------- */
  let errors = 0, warns = 0;
  for (const s of report) {
    const bad = s.issues.filter(x => x.level === 'error').length, soft = s.issues.length - bad;
    errors += bad; warns += soft;
    const shape = [s.type, s.item, s.arrange && `${s.arrange}×${s.cols}`].filter(Boolean).join(' / ');
    const state = s.baked ? '' : `字級第 ${s.tier + 1} 級  版面使用 ${Math.round(s.fill * 100)}%`;
    console.log(`${bad ? '✗' : soft ? '!' : '✓'} 第 ${String(s.slide).padStart(2)} 頁  ${shape.padEnd(34)} ${state}`);
    for (const x of s.issues) console.log(`    ${x.level === 'error' ? '錯誤' : '提醒'} ${x.code}：${x.msg}`);
  }
  for (const e of pageErrors) { errors++; console.log(`✗ 頁面執行錯誤：${e}`); }
  console.log(`\n共 ${report.length} 頁：${errors} 個錯誤、${warns} 個提醒${shots ? `；截圖在 ${shots}` : ''}`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ file: path.basename(file), errors, warns, pageErrors, slides: report }, null, 2) + '\n');
  return errors ? 1 : 0;
}

let browser;
try {
  browser = await launch();
  process.exitCode = await main(browser);
} catch (err) {
  console.error('檢查失敗：' + err.message);
  process.exitCode = 2;
} finally {
  if (browser) browser.close();
}
