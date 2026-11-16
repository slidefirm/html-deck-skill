/* 啟動系統的 Chrome 或 Edge（無頭模式），用它內建的遠端除錯通道操作頁面。
   只用 Node 22 內建的 fetch 與 WebSocket，不需要安裝任何 npm 套件。check 與 selftest 共用。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function findBrowser() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    process.env.BROWSER_EXECUTABLE,
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].filter(Boolean).find(p => fs.existsSync(p));
}

export const NEXT_FRAME = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))';

/* 回傳 { send, run, once, open, viewport, pageErrors, close }
   send(method, params)：送一個除錯指令；run(js)：在頁面裡執行並取回結果；open(file)：打開本機檔案並等它載入完成 */
export async function launch({ width = 1920, height = 1080 } = {}) {
  const exe = findBrowser();
  if (!exe) throw new Error('找不到 Chrome 或 Edge。請安裝其中一個，或把瀏覽器執行檔路徑設到環境變數 BROWSER_EXECUTABLE。');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'html-deck-'));
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-device-scale-factor=1', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let ws;
  const close = () => {
    try { ws && ws.close(); } catch {}
    try { proc.kill(); } catch {}
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }, 300);
  };

  try {
    const wsUrl = await new Promise((res, rej) => {
      let buf = '';
      proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) res(m[1]); });
      proc.on('exit', code => rej(new Error(`瀏覽器提前結束（代碼 ${code}）`)));
      setTimeout(() => rej(new Error('瀏覽器啟動逾時')), 30000);
    });
    /* 瀏覽器剛印出通道位址時，偶爾還沒準備好接受連線：失敗就稍等再試 */
    let targets;
    for (let i = 0; !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/list`)).json(); }
      catch (e) { if (i >= 5) throw e; await new Promise(r => setTimeout(r, 300)); }
    }
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('連不上瀏覽器')); });
  } catch (e) {
    close();
    throw e;
  }

  let id = 0;
  const pending = new Map(), waiters = new Map(), pageErrors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const w = waiters.get(m.method);
    if (w) { waiters.delete(m.method); w(m.params); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const once = method => new Promise(res => waiters.set(method, res));
  const run = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const open = async file => {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: pathToFileURL(path.resolve(file)).href });
    await loaded;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await viewport(width, height);
  return { send, run, once, open, viewport, pageErrors, close };
}
