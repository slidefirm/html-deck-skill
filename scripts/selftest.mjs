#!/usr/bin/env node
/* html-deck 的自我測試：改過 runtime、bake 或 build 之後跑一次。
   用法：node scripts/selftest.mjs [<deck.json> ...]
   沒給內容表就用 examples/demo.deck.json。全部通過結束碼 0，否則 1。

   第一部分（每一份內容表）：烘焙不跑版
     同一份內容表分別產生中間檔（瀏覽器自動排版）與成品（烘焙後內嵌編輯器），
     成品裡每個物件的位置要跟自動排版時一樣（差距 2px 以內），而且 check 零錯誤（沒有多斷行、沒有跑出畫面）。
   第二部分（只用第一份內容表）：編輯器真的能用
     用真的滑鼠與鍵盤事件：選取卡片、拖動、復原、進入卡片內層、改字、
     存檔（把系統的存檔視窗換成假的，攔下寫出的內容）後重新打開，確認修改都還在、編輯器照常啟動，
     建立 PPTX 匯出資料、切換投影模式。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, NEXT_FRAME } from './lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const decks = process.argv.slice(2);
if (!decks.length) decks.push(path.join(here, '..', 'examples', 'demo.deck.json'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'html-deck-selftest-'));
const node = (script, ...a) => execFileSync(process.execPath, [path.join(here, script), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let failed = 0, passed = 0;
function ok(cond, name, detail = '') {
  cond ? passed++ : failed++;
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? '　' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const b = await launch();
const { send, run, open, pageErrors } = b;
/* 有未儲存的修改時離開頁面會跳出確認視窗：測試裡一律按「離開」 */
const leave = () => b.once('Page.javascriptDialogOpening').then(() => { send('Page.handleJavaScriptDialog', { accept: true }); leave(); });
leave();
const READY = `new Promise(r => { const t = setInterval(() => { if (document.documentElement.dataset.layoutReady === 'true') { clearInterval(t); r(true); } }, 50); setTimeout(() => { clearInterval(t); r(false); }, 20000); })`;
const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' && !o.down ? 0 : 1, clickCount: 1 });
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(200); };
async function drag(x0, y0, x1, y1) {
  await mouse('mouseMoved', x0, y0);
  await mouse('mousePressed', x0, y0);
  for (let s = 1; s <= 8; s++) { await mouse('mouseMoved', x0 + (x1 - x0) * s / 8, y0 + (y1 - y0) * s / 8, { down: true }); await sleep(15); }
  await mouse('mouseReleased', x1, y1);
  await sleep(250);
}
async function key(k, code, vk) {
  for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });
  await sleep(200);
}
const json = js => run(`Promise.resolve(${js}).then(v => JSON.stringify(v ?? null))`).then(JSON.parse);   // 同步、非同步的結果都能取回
const rectOf = sel => json(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);

/* 量位置：都換算成 1920×1080 的畫面座標 */
const LIGHT_BOXES = `(() => Deck.slides.map(sl => { const sr = sl.el.getBoundingClientRect(), k = sr.width / 1920;
  return [...sl.el.querySelectorAll('[data-obj]')].filter(n => n.getClientRects().length && (n.textContent.trim() || n.querySelector('svg, img') || getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)'))
    .map(n => { const r = n.getBoundingClientRect(); return [(r.left - sr.left) / k, (r.top - sr.top) / k, r.width / k, r.height / k]; }); }))()`;
const BAKED_BOXES = `(async () => { const out = [];
  for (const [i, s] of SlidePlayer.getSlides().entries()) { SlidePlayer.setSlide(i); await ${NEXT_FRAME};
    const sr = s.getBoundingClientRect(), k = sr.width / 1920;
    out.push([...s.querySelectorAll('.content > .el')].filter(n => !n.matches('.hd-footer, .hd-page-no')).map(n => { const r = n.getBoundingClientRect();
      return { m: n.dataset.editStructure === 'module', b: [(r.left - sr.left) / k, (r.top - sr.top) / k, r.width / k, r.height / k] }; })); }
  SlidePlayer.setSlide(0); return out; })()`;

try {
  /* ---------------- 第一部分：烘焙不跑版 ---------------- */
  let first = null;
  for (const [di, d] of decks.entries()) {
    const name = path.basename(d), light = path.join(tmp, `light-${di}.html`), baked = path.join(tmp, `deck-${di}.html`);
    node('build.mjs', d, '-o', light, '--light');
    let buildOk = true;
    try { node('build.mjs', d, '-o', baked); } catch (e) { buildOk = false; console.log(String(e.stdout || e.message).trim()); }
    ok(buildOk, `${name}：排版檢查零錯誤並產出成品`);
    if (!first) first = baked;
    await open(light);
    await run('Deck.ready.then(() => document.fonts.ready).then(() => true)');
    const want = await json(LIGHT_BOXES);
    await open(baked);
    ok(await run(READY), `${name}：播放器外殼完成排版`);
    const got = await json(BAKED_BOXES);
    let worst = 0, where = '', count = true;
    want.forEach((objs, i) => {
      if (objs.length !== got[i].length) { count = false; where = `第 ${i + 1} 頁：自動排版 ${objs.length} 個物件，成品 ${got[i].length} 個`; return; }
      objs.forEach((w, j) => {
        const g = got[i][j];
        /* 群組比整個框；單獨的文字框會收到貼著字，所以只比上緣，左右只要求落在原本的框裡 */
        const dev = g.m ? Math.max(...w.map((v, q) => Math.abs(v - g.b[q]))) : Math.max(Math.abs(w[1] - g.b[1]), w[0] - g.b[0], g.b[0] + g.b[2] - (w[0] + w[2]) - 3);
        if (dev > worst) { worst = dev; where = `第 ${i + 1} 頁第 ${j + 1} 個物件`; }
      });
    });
    ok(count, `${name}：成品的物件數量與自動排版相同`, count ? '' : where);
    ok(count && worst <= 2, `${name}：成品每個物件的位置與自動排版相同`, `最大差距 ${worst.toFixed(1)}px${worst > 2 ? '（' + where + '）' : ''}`);
    let checkOut = '', checkOk = true;
    try { checkOut = node('check.mjs', baked); } catch (e) { checkOk = false; checkOut = String(e.stdout || e.message); }
    ok(checkOk, `${name}：check 零錯誤（沒有多斷行、沒有跑出畫面）`, checkOk ? '' : checkOut.trim().split('\n').filter(l => /錯誤|✗/.test(l)).slice(0, 4).join(' / '));
  }

  /* ---------------- 第二部分：編輯器真的能用 ---------------- */
  await open(first);
  await run(READY);
  const info = await json(`({ editor: typeof window.EditMode, thumbs: document.querySelectorAll('.slide-thumb').length, slides: SlidePlayer.getSlides().length,
    bar: document.getElementById('bar').innerText, shell: document.getElementById('player').classList.contains('editor-shell'), pptx: !!window.__pptxBrowserRuntimeReady })`);
  ok(info.editor === 'object' && info.shell, '打開就是編輯模式，編輯器已啟動');
  ok(info.thumbs === info.slides && info.slides > 0, '左側縮圖欄每一頁都有', `${info.thumbs} / ${info.slides}`);
  ok(/新增物件/.test(info.bar) && /投影片設定/.test(info.bar) && /存檔/.test(info.bar), '工具列有新增物件、投影片設定、存檔');
  ok(info.pptx, 'PPTX 匯出元件就緒');

  /* 找一頁有卡片的 */
  const page = await run(`SlidePlayer.getSlides().findIndex(s => s.querySelector('.el.hd-item[data-edit-structure="module"] [data-edit-layer="text"]'))`);
  await run(`SlidePlayer.setSlide(${page}); ${NEXT_FRAME}`);
  await sleep(300);
  const CARD = '.slide.active .el.hd-item[data-edit-structure="module"]', TITLE = CARD + ' [data-edit-layer="text"]';
  const c0 = await rectOf(CARD);
  await click(c0.cx, c0.y + c0.h - 14);
  const frame = await rectOf('#edit-selection-frame');
  ok(frame && Math.abs(frame.w - c0.w) < 12 && Math.abs(frame.h - c0.h) < 12, '點卡片：選到整張卡片（選取框與卡片一樣大）', frame ? `${Math.round(frame.w)}×${Math.round(frame.h)}` : '沒有選取框');
  const first0 = await rectOf(TITLE);
  await drag(c0.cx, c0.y + c0.h - 14, c0.cx + 80, c0.y + c0.h - 14 + 50);
  const c1 = await rectOf(CARD), first1 = await rectOf(TITLE);
  ok(Math.abs(c1.x - c0.x - 80) < 6 && Math.abs(c1.y - c0.y - 50) < 6, '拖動卡片：卡片跟著滑鼠走', `移動 ${Math.round(c1.x - c0.x)}, ${Math.round(c1.y - c0.y)}`);
  ok(Math.abs((first1.x - first0.x) - (c1.x - c0.x)) < 1 && Math.abs((first1.y - first0.y) - (c1.y - c0.y)) < 1, '卡片裡的文字跟著卡片一起移動');
  await run('EditMode.undo(); true');
  await sleep(250);
  const c2 = await rectOf(CARD);
  ok(Math.abs(c2.x - c0.x) < 1 && Math.abs(c2.y - c0.y) < 1, '復原：卡片回到原位');
  await run('EditMode.redo(); true');
  await sleep(250);
  const c3 = await rectOf(CARD);
  ok(Math.abs(c3.x - c1.x) < 1 && Math.abs(c3.y - c1.y) < 1, '重做：卡片回到拖動後的位置');

  /* 進入卡片內層改字 */
  const btn = await json(`(() => { const n = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '編輯群組內物件'); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, off: n.disabled }; })()`);
  ok(btn && !btn.off, '選到卡片時，「編輯群組內物件」按鈕可以按');
  await click(btn.x, btn.y);
  const t0 = await rectOf(TITLE);
  await click(t0.cx, t0.cy);
  const frame2 = await rectOf('#edit-selection-frame');
  ok(frame2 && frame2.w < c1.w - 20 && Math.abs(frame2.x - t0.x) < 16, '進入卡片後點標題：只選到標題');
  await click(t0.cx, t0.cy);
  ok(await run(`!!(document.activeElement && document.activeElement.isContentEditable)`), '再點一次：進入文字編輯');
  const before = await run(`document.querySelector(${JSON.stringify(TITLE)}).textContent`);
  await send('Input.insertText', { text: '測試' });
  await sleep(200);
  const after = await run(`document.querySelector(${JSON.stringify(TITLE)}).textContent`);
  ok(after.length === before.length + 2 && after.includes('測試'), '直接打字：文字改了', after);
  await key('Escape', 'Escape', 27);

  /* 存檔：把系統的存檔視窗換成假的，攔下編輯器寫出的內容 */
  await run(`window.__saved = null; window.showSaveFilePicker = async () => ({ name: 'saved.html', kind: 'file',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted', isSameEntry: async () => false,
    createWritable: async () => ({ write: async d => { window.__saved = typeof d === 'string' ? d : await new Response(d).text(); }, close: async () => {} }),
    getFile: async () => new File([window.__saved || ''], 'saved.html', { type: 'text/html' }) }); true`);
  const result = await json(`EditMode.export()`);
  const saved = await run('window.__saved');
  ok(result && result.saved && typeof saved === 'string' && saved.length > 100000, '另存新檔：編輯器寫出完整的 HTML', saved ? `${(saved.length / 1048576).toFixed(1)} MB` : JSON.stringify(result));
  const savedFile = path.join(tmp, 'saved.html');
  fs.writeFileSync(savedFile, saved || '');
  await open(savedFile);
  ok(await run(READY), '存檔後重新打開：播放器外殼完成排版');
  await run(`SlidePlayer.setSlide(${page}); ${NEXT_FRAME}`);
  await sleep(300);
  const c4 = await rectOf(CARD);
  ok(c4 && Math.abs(c4.x - c1.x) < 1.5 && Math.abs(c4.y - c1.y) < 1.5 && Math.abs(c4.w - c1.w) < 1.5, '重新打開：卡片在拖動後的位置', c4 ? `差 ${Math.abs(c4.x - c1.x).toFixed(1)}, ${Math.abs(c4.y - c1.y).toFixed(1)}` : '');
  ok(await run(`document.querySelector(${JSON.stringify(TITLE)}).textContent`) === after, '重新打開：改過的文字還在');
  ok(await run(`typeof window.EditMode === 'object' && document.querySelectorAll('.slide-thumb').length === SlidePlayer.getSlides().length`), '重新打開：編輯器與縮圖欄照常啟動');
  const again = await rectOf(CARD);
  await click(again.cx, again.y + again.h - 14);
  await drag(again.cx, again.y + again.h - 14, again.cx - 40, again.y + again.h - 14);
  const c5 = await rectOf(CARD);
  ok(Math.abs(c5.x - again.x + 40) < 6, '重新打開後還能繼續拖動');

  /* 換預設字體：各字體的英數字寬度不同，原本一行的文字不能因此被擠成兩行 */
  const LINES = `(async () => { const out = [];
    const lines = n => { const range = document.createRange(), tops = []; range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0.5 && !tops.some(t => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top); return tops.length; };
    for (const [i, s] of SlidePlayer.getSlides().entries()) { SlidePlayer.setSlide(i); await ${NEXT_FRAME};
      for (const n of s.querySelectorAll('[data-hd-lines]')) out.push([i + 1, n.textContent.trim().slice(0, 12), lines(n)]); }
    SlidePlayer.setSlide(${page}); return out; })()`;
  const lines0 = await json(LINES);
  const family = await run(`(async () => {
    const sel = document.getElementById('edit-deck-font-family-select'), opt = sel && [...sel.options].find(o => o.textContent.includes('Serif'));
    if (!opt) return '';
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const name = opt.value.split(',')[0];
    try { await Promise.all([400, 700, 800, 900].map(w => document.fonts.load(w + ' 40px ' + name, '示範Aa1'))); } catch (e) {}
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 600));
    return getComputedStyle(document.querySelector('.slide.active .el[data-edit-fit="text"]')).fontFamily;
  })()`);
  ok(/Serif/.test(family), '投影片設定換預設字體：文字套用了新字體', family.slice(0, 40));
  const lines1 = await json(LINES);
  const broken = lines1.filter((x, i) => lines0[i][2] <= 1 && x[2] > 1);
  ok(lines1.length === lines0.length && !broken.length, '換字體後，原本一行的文字仍是一行', broken.length ? broken.slice(0, 3).map(x => `第 ${x[0]} 頁「${x[1]}」`).join('、') : `${lines1.length} 段`);

  /* PPTX 匯出資料 */
  const pptx = await json(`EditMode.buildPptxManifest().then(m => ({ n: m.slides.length, bg: m.slides.filter(s => s.backgroundImage && String(s.backgroundImage.dataUrl).startsWith('data:image/')).length, jpeg: m.slides.filter(s => s.backgroundImage && String(s.backgroundImage.dataUrl).startsWith('data:image/jpeg')).length, empty: m.slides.filter(s => !s.elements.length).length }))`);
  ok(pptx.n === info.slides && pptx.bg === pptx.n && pptx.empty === 0, '匯出 PPTX：每一頁都有背景圖與可編輯物件', `${pptx.n} 頁、${pptx.bg} 張背景`);
  ok(pptx.jpeg === pptx.n, '匯出 PPTX：背景已從 WebP 轉成 JPEG（舊版 PowerPoint 也打得開）', `${pptx.jpeg} / ${pptx.n}`);

  /* 投影模式 */
  await run('EditMode.toggle(false); true');
  await sleep(300);
  const stage = await rectOf('#canvasBox');
  ok(!(await run(`document.getElementById('player').classList.contains('editor-shell')`)) && stage.w > 1900, '切到投影模式：工具列收起、投影片放滿畫面', `${Math.round(stage.w)}×${Math.round(stage.h)}`);
  await key('ArrowRight', 'ArrowRight', 39);
  ok(await run('SlidePlayer.getCurrentIndex()') === page + 1, '投影模式按右鍵換頁');
  await key('Escape', 'Escape', 27);
  await sleep(300);
  ok(await run(`document.getElementById('player').classList.contains('editor-shell')`), '按 Esc 回到編輯模式');

  ok(pageErrors.length === 0, '整個過程沒有頁面執行錯誤', pageErrors.slice(0, 2).join(' / '));
} catch (e) {
  failed++;
  console.log('✗ 測試中斷：' + (e.stack || e.message));
} finally {
  b.close();
  setTimeout(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }, 500);
}
console.log(`\n${passed} 項通過、${failed} 項失敗`);
process.exitCode = failed ? 1 : 0;
