/* 把烘焙好的頁面裝進播放器外殼，並內嵌編輯器與 PPTX 匯出元件。
   這四樣東西是這個 Skill 自己的原始檔，放在 editor/：
     player.css、player.js   播放器外殼（縮圖欄、工具列、投影模式）
     edit-mode.js            編輯器
     pptx-runtime.js         匯出可編輯 PPTX（PptxGenJS 加上轉換程式）
   三支程式合計約 1 MB，每一份成品都要帶著，所以先用 gzip 壓過再內嵌（約剩三分之一），
   打開時由瀏覽器內建的 DecompressionStream 解開、依序執行。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const EDITOR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'editor');
const read = name => { const f = path.join(EDITOR, name); if (!fs.existsSync(f)) throw new Error('缺少編輯器元件：' + f); return fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const q = s => esc(s).replace(/"/g, '&quot;');

export function loadEditor() {
  const editMode = read('edit-mode.js');
  return { css: read('player.css'), player: read('player.js'), editMode, pptx: read('pptx-runtime.js'), sha: crypto.createHash('sha256').update(editMode).digest('hex') };
}

/* 三支程式用一個不會出現在程式裡的字元隔開，一起壓縮。執行順序不能換：外殼 → PPTX → 編輯器 */
const SEP = String.fromCharCode(0);
const pack = e => zlib.gzipSync([e.player, e.pptx, e.editMode].join(SEP), { level: 9 }).toString('base64');
/* 解開後一支一支放進 <script> 執行再移除：不用 eval，存檔時也不會把解開的程式多存一份 */
const LOADER = `(async () => {
  const fail = m => { document.body.insertAdjacentHTML('afterbegin', '<p style="position:fixed;inset:0;z-index:999;margin:0;padding:48px;background:#111;color:#fff;font:20px/1.6 system-ui,sans-serif">' + m + '</p>'); };
  if (typeof DecompressionStream !== 'function') return fail('這個瀏覽器太舊，無法開啟這份簡報。請改用新版的 Chrome、Edge、Safari 或 Firefox。');
  try {
    const raw = atob(document.getElementById('hd-pack').textContent), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    for (const code of text.split(String.fromCharCode(0))) { const s = document.createElement('script'); s.textContent = code; document.head.appendChild(s); s.remove(); }
  } catch (e) { fail('簡報的程式載入失敗：' + e.message); }
})();`;

const FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  + '<link rel="stylesheet" data-font-system="google-fonts-css2" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;600;700;800;900&amp;family=Noto+Serif+TC:wght@300;400;500;600;700;800;900&amp;family=Roboto+Mono:wght@300;400;500;600;700&amp;display=swap">\n';
export { FONT_LINK };

/* 成品自己的樣式：只有外殼需要的基本規則。每個物件的位置與樣子都已經寫在 inline style 裡 */
const baseCss = b => `:root{--bg:${b.bg};--text:${b.ink};--primary:${b.ink};--accent:${b.accent};--font-body:${b.font};--font-heading:${b.font};--font-display:${b.font};--font-mono:"Roboto Mono","Noto Sans TC",ui-monospace,Consolas,monospace}
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000;font-family:var(--font-body)}
#stage{width:1920px;height:1080px}
.slide{position:absolute;inset:0;width:1920px;height:1080px;display:none;overflow:hidden;background-color:var(--bg);background-size:cover;background-position:center;color:var(--text);-webkit-font-smoothing:antialiased;user-select:none}
.slide.active{display:block}
.content{position:absolute;left:96px;top:96px;width:1728px;height:888px}
.el{position:absolute;overflow:hidden;margin:0;padding:0;border:0;border-radius:0;background:transparent;line-height:1.2}
.el[data-edit-fit="text"],.el[data-edit-structure="module"]{overflow:visible}
.el [data-edit-layer]{position:absolute;margin:0;padding:0;font-style:normal}
.el svg{display:block;width:100%;height:100%}
img.el,.el img{display:block}
`;

export function assemble({ title, baked, editor }) {
  const n = baked.slides.length;
  const slides = baked.slides.map((s, i) => `<section class="slide${i ? '' : ' active'}" id="s${i + 1}" data-index="${i}" data-page-number="${i + 1}" data-page-count="${n}" data-layout-id="html-deck-${q(s.type)}" data-production-family="html-deck" data-pptx-background-image="true" style="background-color:${q(s.color)};background-image:url(${s.bg})"><div class="content" data-content-area="true">
${s.html}
</div></section>`).join('\n');
  return `<!doctype html>
<html lang="zh-Hant" data-generator="html-deck" data-ai-font-floor="36" data-ai-font-floor-applied="true" data-edit-mode-sha256="${editor.sha}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="html-deck">
<title>${esc(title)}</title>
${FONT_LINK}<style>
${baseCss(baked)}${editor.css}</style>
</head>
<body><div id="player" class="editor-shell" data-ui-mode="edit"><aside id="slideRail" data-editor-chrome="true" aria-label="投影片縮圖"><div id="slideRailHeader"><strong>投影片</strong><span>拖曳縮圖<br>調整頁序</span><button id="slideRailToggle" type="button" aria-expanded="true" aria-label="收合投影片縮圖" title="收合投影片縮圖"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button></div><div id="slideThumbList"></div></aside><div id="canvasBox"><main id="stage">${slides}</main></div>
<div id="bar" class="show editor-active"><div id="barInner"></div></div>
<div id="hint" aria-hidden="true"></div></div>
<script type="application/gzip" id="hd-pack" data-pptx-browser-runtime-embedded="true" data-edit-mode-embedded="true">${pack(editor)}</script>
<script>${LOADER}</script></body></html>
`;
}
