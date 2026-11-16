'use strict';
/* html-deck runtime：把 deck 內容表（JSON）排成 1920×1080 投影片。
   版面交給瀏覽器的排版引擎；這支程式只做四件事：
   1. 依內容建立語意 DOM（不寫任何座標）
   2. 逐級嘗試「排列 × 字級」，挑出放得下的最大一級
   3. 用素材工坊的引擎畫背景與 icon
   4. 播放，以及逐頁檢查（溢出、字級下限、出界、重疊、對比） */

const Deck = (() => {
  const { W, H, mix, rgba, lum, onColor, mulberry32, hex2rgb, PALS, STYLES, LIB, toPath } = WORKSHOP;
  const FLOOR = 36;                 // 內容文字的字級下限（px）
  const FONTS = {
    sans: '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',
    serif: '"Noto Serif TC","Songti TC","PMingLiU",serif',
  };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  /* 文字節點：data-text 供檢查與烘焙辨認 */
  function text(tag, cls, value) {
    if (value == null || String(value).trim() === '') return null;
    const el = h(tag, { class: cls, 'data-text': true });
    el.textContent = String(value);
    return el;
  }
  /* 物件：data-obj 是代號。烘焙時每個物件會變成編輯器裡的一個物件（單獨的文字、圖形，或一個群組） */
  function obj(el, id) {
    if (el) el.setAttribute('data-obj', id);
    return el;
  }

  /* ---------------- 主題 ---------------- */
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* 把顏色往墨色推，直到它當文字用時讀得清楚 */
  function legible(color, bg, ink, min) {
    let c = color;
    for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = mix(c, ink, 0.14);
    return c;
  }

  /* 色塊上的文字色：沿用素材工坊的判斷；對比不夠時才換成另一個 */
  function inkOn(fill) {
    const a = onColor(fill), b = a === '#FFFFFF' ? '#191919' : '#FFFFFF';
    return contrast(a, fill) >= 3.6 || contrast(a, fill) >= contrast(b, fill) ? a : b;
  }

  function resolveTheme(theme = {}) {
    const p = theme.palette && typeof theme.palette === 'object' ? theme.palette
      : PALS.find(x => x.id === theme.palette) || PALS[0];
    const bg = p.bg, dark = lum(bg) < 0.3;
    const ink = dark ? '#FFFFFF' : '#191919';
    const accent = dark ? p.c[2] : p.c[0];                 // 與底色反差最大的那一色
    const tint = mix(accent, bg, dark ? 0.74 : 0.84);
    return {
      pal: { bg, c: p.c }, dark, accent, bg, ink,
      icon: theme.icon || 'duo',
      surface: theme.surface || 'auto',
      vars: {
        '--bg': bg, '--ink': ink,
        '--ink2': mix(ink, bg, 0.26), '--ink3': mix(ink, bg, 0.46),
        '--line': mix(ink, bg, 0.8), '--soft': mix(ink, bg, 0.93),
        '--accent': accent, '--accent2': p.c[1], '--on': inkOn(accent),
        '--accent-ink': legible(accent, tint, ink, 3.8),      // 強調色當文字用：在淡色卡片上也要讀得清楚
        '--tint': tint,
        '--radius': (theme.radius ?? 20) + 'px',
        '--font': FONTS[theme.font] || FONTS.sans,
      },
    };
  }

  /* ---------------- 背景（素材工坊引擎）---------------- */
  const models = new Map(), CELL = 20;
  let grain = null;

  function grainPattern(ctx) {
    if (grain) return grain;
    const g = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const x = g.getContext('2d'), d = x.createImageData(256, 256), rng = mulberry32(7);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = d.data[i + 1] = d.data[i + 2] = (rng() * 255) | 0;
      d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return (grain = ctx.createPattern(g, 'repeat'));
  }

  /* 文字留白：把背景往底色蓋回去，讓字有地方站 */
  function drawScrim(ctx, bg, mode, veil) {
    let g;
    if (mode === 'veil') { ctx.fillStyle = rgba(bg, veil); ctx.fillRect(0, 0, W, H); return; }
    if (mode === 'left') g = ctx.createLinearGradient(0, 0, W * 0.94, 0);
    else if (mode === 'right') g = ctx.createLinearGradient(W, 0, W * 0.06, 0);
    else if (mode === 'bottom') g = ctx.createLinearGradient(0, H, 0, H * 0.12);
    else if (mode === 'top') g = ctx.createLinearGradient(0, 0, 0, H * 0.88);
    else if (mode === 'center') g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    else return;
    /* 文字會站的那一段幾乎蓋滿，之後才快速淡出；素材工坊原本的漸層太早變淡，長標題的尾端會壓在圖案上 */
    g.addColorStop(0, rgba(bg, 0.97));
    g.addColorStop(0.62, rgba(bg, 0.9));
    g.addColorStop(0.8, rgba(bg, 0.55));
    g.addColorStop(1, rgba(bg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function modelOf(o) {
    const key = `${o.style}|${o.seed}|${o.density}`;
    let m = models.get(key);
    if (!m) {
      if (models.size >= 8) models.delete(models.keys().next().value);      // 每頁種子不同，只留最近用到的幾個
      models.set(key, (m = STYLES[o.style].build(mulberry32(o.seed), o)));
    }
    return m;
  }

  /* 這張紋理本身哪裡比較重：畫一張小圖，量四個角落各自偏離底色多少。回傳 [[左上, 右上], [左下, 右下]] */
  const weights = new Map();
  function weightOf(o) {
    const key = `${o.style}|${o.seed}|${o.density}|${o.strength}`;
    let e = weights.get(key);
    if (e) return e;
    const cw = W / CELL, ch = H / CELL;
    const c = h('canvas', { width: cw, height: ch }), x = c.getContext('2d', { willReadFrequently: true });
    x.scale(1 / CELL, 1 / CELL);
    STYLES[o.style].draw(x, o.phase, modelOf(o), o.pal, o);
    const d = x.getImageData(0, 0, cw, ch).data, bg = hex2rgb(o.pal.bg);
    e = [[0, 0], [0, 0]];
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
      const i = (py * cw + px) * 4;
      e[py < ch / 2 ? 0 : 1][px < cw / 2 ? 0 : 1] += Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    }
    weights.set(key, e);
    return e;
  }

  /* 紋理比底色亮（或暗）太多時，整張先往底色壓淡。
     不這樣做的話，深色底配亮色紋理，內容區被遮罩壓回深色，露出紋理的地方卻很亮，兩邊落差大到像硬貼上去的。
     量的是紋理最重那一角「平均每個像素偏離底色多少」（0 到 255）；線條類紋理本來就輕，不會被動到。 */
  function toneOf(o) {
    if (o.tone != null) return o.tone;
    const e = weightOf(o), cells = (W / CELL / 2) * (H / CELL / 2) * 3;
    o.heavy = Math.max(e[0][0], e[0][1], e[1][0], e[1][1]) / cells;
    return (o.tone = Math.max(0.2, Math.min(1, o.limit / o.heavy)));
  }

  /* 依內容位置做的遮罩：內容底下把背景蓋淡，空的地方保留紋理，
     紋理最濃的地方放在離內容最遠的那個角落或邊——也就是讓背景的重量落在版面重心的另一側。
     遮罩用很小的畫布（每格 20px）畫，放大後邊緣自然變柔。 */
  function buildScrim(sl) {
    const o = sl.bg, sr = sl.el.getBoundingClientRect(), k = sr.width / W, boxes = [];
    const add = r => { if (r.width && r.height) boxes.push({ x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }); };
    const range = document.createRange();
    for (const n of sl.el.querySelectorAll('[data-text], .mark, .mk, .rule, .bar, .arrow, .bignum, .quote-mark, .item, .col, .chrome span')) {
      const cs = getComputedStyle(n), solid = (parseRgb(cs.backgroundColor) || [0, 0, 0, 0])[3] > 0 || parseFloat(cs.borderTopWidth) > 0;
      if (n.hasAttribute('data-text')) {
        /* 文字只算每一行實際佔到的寬度：標題短的時候，右邊空著的地方可以留給紋理 */
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) add(r);
        if (solid) add(n.getBoundingClientRect());
      } else if (solid || !n.matches('.item, .col')) add(n.getBoundingClientRect());
    }
    const chrome = sl.el.querySelector('.chrome');
    if (chrome) {                                         // 頁尾整條一起淡化，中間才不會露出一條亮帶
      const top = (chrome.getBoundingClientRect().top - sr.top) / k;
      boxes.push({ x: 0, y: top, w: W, h: H - top });
    }
    const c = h('canvas', { width: W / CELL, height: H / CELL }), x = c.getContext('2d');
    x.scale(1 / CELL, 1 / CELL);
    x.fillStyle = rgba(o.pal.bg, o.rest);                 // 先整面淡化到「空白處」的程度
    x.fillRect(0, 0, W, H);
    /* 找離所有內容最遠的角落或邊，在那裡把淡化挖掉，讓紋理露出來 */
    const far = (px, py, b) => Math.hypot(Math.max(b.x - px, 0, px - b.x - b.w), Math.max(b.y - py, 0, py - b.y - b.h));
    let best = null;
    for (const [px, py] of [[W, 0], [W, H], [0, H], [0, 0], [W, H / 2], [W / 2, H], [W / 2, 0], [0, H / 2]]) {
      const d = boxes.length ? Math.min(...boxes.map(b => far(px, py, b))) : W;
      if (!best || d > best.d + 1) best = { px, py, d };
    }
    const r = Math.max(760, Math.min(1350, best.d * 2.6));
    const g = x.createRadialGradient(best.px, best.py, 0, best.px, best.py, r);
    g.addColorStop(0, 'rgba(0,0,0,0.97)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.78)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    /* 內容底下再蓋回去：由外往內疊六層，另外畫在一張小畫布上，再換掉原本那一塊的淡化程度。
       這樣內容底下不論離紋理遠近，都剛好蓋到 cover 這麼多——不蓋到全滿，字的後面還看得到淡淡的紋理。
       最後整張縮小再放大一次，讓遮罩變成一整片柔和的範圍，而不是一個個看得出方形的暗影 */
    const m = h('canvas', { width: W / CELL, height: H / CELL }), mx = m.getContext('2d');
    mx.scale(1 / CELL, 1 / CELL);
    mx.fillStyle = o.pal.bg;
    mx.globalAlpha = 0.36;
    for (let e = 170; e >= 95; e -= 15) for (const b of boxes) mx.fillRect(b.x - e, b.y - e, b.w + e * 2, b.h + e * 2);
    x.drawImage(m, 0, 0, W, H);                           // 目前是 destination-out：先把內容底下原本的淡化拿掉
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = Math.min(1, o.cover / 0.93);          // 六層疊起來最濃是 0.93
    x.drawImage(m, 0, 0, W, H);
    sl.focus = { x: best.px, y: best.py };
    /* 把紋理最重的那一角轉到這個空的角落：四種鏡射各算一次，挑落在這裡的紋理最多的；差不多就不翻 */
    const e = weightOf(o), cols = best.px === 0 ? [0] : best.px === W ? [1] : [0, 1], rows = best.py === 0 ? [0] : best.py === H ? [1] : [0, 1];
    let pick = { fx: false, fy: false, v: -1 };
    for (const fy of [false, true]) for (const fx of [false, true]) {
      let v = 0;
      for (const ry of rows) for (const cx of cols) v += e[fy ? 1 - ry : ry][fx ? 1 - cx : cx];
      if (v > pick.v * 1.08) pick = { fx, fy, v };
    }
    o.flipX = pick.fx;
    o.flipY = pick.fy;
    const soft = h('canvas', { width: 16, height: 9 }), y = soft.getContext('2d');
    y.imageSmoothingQuality = 'high';
    y.drawImage(c, 0, 0, 16, 9);
    return soft;
  }

  function paintBg(canvas, o, t, scrim) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const st = STYLES[o.style];
    if (!st) { ctx.fillStyle = o.pal.bg; ctx.fillRect(0, 0, W, H); return; }
    ctx.save();
    if (o.flipX) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    if (o.flipY) { ctx.translate(0, H); ctx.scale(1, -1); }
    st.draw(ctx, t, modelOf(o), o.pal, o);
    ctx.restore();
    const tone = toneOf(o);
    if (tone < 1) { ctx.fillStyle = rgba(o.pal.bg, 1 - tone); ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
    if (o.scrim === 'content' && scrim) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(scrim, 0, 0, W, H);
    } else drawScrim(ctx, o.pal.bg, o.scrim === 'content' ? 'veil' : o.scrim, o.veil);
    if (o.grain) {
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = grainPattern(ctx);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* 封面與過場的文字位置固定，用方向性的漸層；其他頁面依內容位置決定 */
  function defaultScrim(s) {
    if (s.type === 'cover' || s.type === 'statement') return alignOf(s) === 'center' ? 'center' : 'left';
    return 'content';
  }
  function bgOptions(deck, s, theme, i) {
    const o = Object.assign({ style: 'contour', seed: 20261112, density: 0.5, strength: 0.6, grain: true, animate: false, loop: 20, phase: 0, veil: 0.8, rest: 0.6, cover: 0.8, vary: true },
      deck.background, s.background);
    if (!o.scrim) o.scrim = defaultScrim(s);
    /* 紋理平均偏離底色的上限：內容頁 30、封面與過場可以重一點。實測等高線約 7、星網約 1、流光 47 到 62、階梯與波浪超過 90 */
    if (o.limit == null) o.limit = s.type === 'cover' || s.type === 'statement' ? 50 : 30;
    /* 每頁換一個種子，紋理才不會每頁一模一樣；該頁自己指定了 seed 就照它的 */
    if (o.vary && !(s.background && s.background.seed != null)) o.seed += i * 7919;
    o.pal = theme.pal;
    return o;
  }

  /* ---------------- icon（素材工坊骨架）---------------- */
  function iconSvg(id, style) {
    const ic = LIB.find(i => i.id === id);
    if (!ic) return null;
    const k = 0.6, els = ic.els.map(e => toPath(e, k));
    let out = '';
    if (style === 'duo') for (const e of els) if (e.fill) out += `<path d="${e.d}" fill="var(--ic2,currentColor)" fill-opacity="0.3"/>`;
    if (style === 'offset') for (const e of els) if (e.fill) out += `<path d="${e.d}" fill="var(--ic2,currentColor)" transform="translate(1.7 1.7)"/>`;
    for (const e of els) out += `<path d="${e.d}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${out}</svg>`;
  }
  const MARK = {
    cross: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 24h34M28 11l13 13-13 13" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------------- 字級階梯：由大到小，挑放得下的最大一級 ---------------- */
  const row = (keys, rows) => rows.map(r => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
  const TIERS = {
    //                 標題 副標 間距
    cover: row(['t', 'l', 'g'], [[136, 52, 44], [120, 48, 40], [104, 44, 36], [92, 42, 32], [80, 40, 28], [68, 36, 24]]),
    statement: row(['t', 'l', 'g'], [[112, 48, 44], [100, 44, 40], [88, 42, 36], [76, 40, 32], [66, 38, 28], [56, 36, 24]]),
    //                 標題 引言 項目標題 內文 大數字 圖示 編號 間距 內距 橫向間距
    points: row(['t', 'l', 'i', 'b', 'm', 'k', 'n', 'g', 'p', 'hg'], [
      [80, 46, 64, 48, 168, 136, 120, 48, 60, 56],
      [80, 44, 56, 44, 148, 120, 108, 44, 54, 52],
      [80, 44, 50, 40, 128, 104, 96, 40, 48, 48],
      [72, 42, 46, 38, 112, 96, 88, 36, 44, 44],
      [64, 40, 42, 36, 100, 88, 80, 32, 40, 40],
      [58, 38, 40, 36, 88, 80, 72, 28, 36, 36],
      [52, 36, 38, 36, 76, 72, 64, 24, 32, 32],
      [46, 36, 36, 36, 64, 64, 56, 20, 28, 28],
    ]),
    //                 標題 引言 欄標題 列文字 間距 內距 列距
    compare: row(['t', 'l', 'i', 'b', 'g', 'p', 'rg'], [
      [80, 46, 60, 48, 48, 64, 36], [80, 44, 54, 44, 44, 58, 32],
      [72, 42, 48, 40, 40, 52, 30], [64, 40, 44, 38, 36, 46, 26], [58, 38, 42, 36, 32, 42, 22],
      [52, 36, 40, 36, 28, 38, 18], [46, 36, 38, 36, 24, 32, 14], [46, 36, 36, 36, 20, 28, 10],
    ]),
  };
  const applyTier = (el, tier) => { for (const k in tier) el.style.setProperty('--' + k, tier[k] + 'px'); };

  /* ---------------- 各骨架的 DOM ---------------- */
  const alignOf = s => s.align || (s.type === 'statement' && s.kind === 'closing' ? 'center' : 'left');

  function metaList(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return h('ul', { class: 'meta' }, list.map((m, i) => text('li', null, m)));
  }

  function buildCover(s) {
    return h('div', { class: 'frame' }, h('div', { class: 'stack' },
      obj(text('p', 'eyebrow', s.eyebrow), 'eyebrow'),
      obj(text('h1', 'title', s.title), 'title'),
      obj(h('div', { class: 'rule', 'aria-hidden': 'true' }), 'rule'),
      obj(text('p', 'subtitle', s.subtitle), 'subtitle'),
      obj(metaList(s.meta), 'meta')));
  }

  function buildStatement(s) {
    const kind = s.kind || 'section';
    return h('div', { class: 'frame' }, h('div', { class: 'stack' },
      kind === 'section' && s.number ? obj(h('div', { class: 'bignum', 'aria-hidden': 'true' }, String(s.number)), 'number') : null,
      kind === 'quote' ? obj(h('div', { class: 'quote-mark', 'aria-hidden': 'true' }, '“'), 'quote-mark') : null,
      obj(text('p', 'eyebrow', s.eyebrow), 'eyebrow'),
      obj(text('h2', 'title', s.text), 'title'),
      kind !== 'quote' ? obj(h('div', { class: 'rule', 'aria-hidden': 'true' }), 'rule') : null,
      obj(text('p', 'subtitle', s.sub), 'subtitle'),
      obj(text('p', 'by', s.by), 'by'),
      obj(metaList(s.meta), 'meta')));
  }

  function head(s) {
    return h('header', { class: 'head' },
      s.eyebrow ? null : obj(h('div', { class: 'bar', 'aria-hidden': 'true' }), 'bar'),
      obj(text('p', 'eyebrow', s.eyebrow), 'eyebrow'),
      obj(text('h2', 'title', s.title), 'title'),
      obj(text('p', 'lead', s.lead), 'lead'));
  }

  function markFor(kind, it, j, theme, issues) {
    if (kind === 'icon') {
      const svg = iconSvg(it.icon, theme.icon);
      if (!svg) issues.push({ level: 'warn', code: 'UNKNOWN_ICON', msg: `第 ${j + 1} 項的 icon「${it.icon ?? ''}」不在圖庫裡，已改用預設圖示` });
      return h('div', { class: 'mark ic', html: svg || iconSvg('star', theme.icon) });
    }
    if (kind === 'number') return h('div', { class: 'mark num', 'aria-hidden': 'true' }, String(j + 1).padStart(2, '0'));
    if (kind === 'bullet') return h('div', { class: 'mark dot', 'aria-hidden': 'true' });
    if (kind === 'metric') return h('div', { class: 'mark val', 'data-text': true }, String(it.value ?? ''));
    if (kind === 'image') {
      return h('div', { class: 'mark img' }, it.image
        ? h('img', { src: it.image, alt: it.alt || it.title || '' })
        : h('div', { class: 'ph', html: iconSvg('image', 'line') }));
    }
    return null;                      // block：整個色塊就是視覺，不需要另外的記號
  }

  function buildPoints(s, theme, issues) {
    const kind = s.item || 'icon', n = s.items.length;
    const items = s.items.map((it, j) => {
      const li = h('li', { class: 'item' + (s.highlight === j + 1 ? ' hl' : ''), 'data-kind': kind, 'data-obj': `item-${j + 1}` },
        markFor(kind, it, j, theme, issues),
        h('div', { class: 'txt' },
          text('h3', 'it-title', it.title),
          text('p', 'it-body', it.body)));
      if (kind === 'block' && !s.highlight) {     // 沒指定強調時，用同一色相由淺到深表達順序
        const fill = n > 1 ? mix(mix(theme.accent, theme.bg, 0.45), theme.accent, j / (n - 1)) : theme.accent;
        li.style.setProperty('--fill', fill);
        li.style.setProperty('--on-fill', inkOn(fill));
      }
      return li;
    });
    return h('div', { class: 'frame' },
      head(s),
      h('div', { class: 'body' }, h('ul', { class: 'items' }, items)),
      obj(text('p', 'takeaway', s.takeaway), 'takeaway'));
  }

  function buildCompare(s) {
    const hl = s.highlight || 'right', marks = s.marks || 'cross-check';
    const col = (side, d) => h('div', { class: 'col ' + (hl === side ? 'hl' : hl === 'none' ? 'plain' : 'dim'), 'data-obj': 'col-' + side },
      text('h3', 'col-head', d.head),
      h('ul', null, (d.rows || []).map(r => h('li', null,
        marks === 'none' ? null : h('span', { class: 'mk', html: marks === 'dot' ? '' : MARK[side === 'left' ? 'cross' : 'check'] }),
        text('span', 'row', r)))));
    return h('div', { class: 'frame' },
      head(s),
      h('div', { class: 'body' }, h('div', { class: 'cmp', 'data-marks': marks },
        col('left', s.left || {}),
        obj(h('div', { class: 'arrow', 'aria-hidden': 'true', html: MARK.arrow }), 'arrow'),
        col('right', s.right || {}))),
      obj(text('p', 'takeaway', s.takeaway), 'takeaway'));
  }

  /* ---------------- 自動排版：排列 × 字級 ---------------- */
  /* 放不放得下。置中都用 auto margin，所以放不下時只會往下、往右溢出，量得到 */
  function overflows(el) {
    const f = el.querySelector('.frame');
    if (f.scrollHeight > f.clientHeight + 1 || f.scrollWidth > f.clientWidth + 1) return true;
    for (const n of el.querySelectorAll('.item, .col, .mark.val, [data-text]')) if (n.scrollWidth > n.clientWidth + 1) return true;
    return false;
  }

  /* 一主題 N 重點可以用的排列。順序代表偏好；最後挑「字級最大」的那一個 */
  function pointCandidates(s) {
    const n = s.items.length, kind = s.item || 'icon';
    const avg = s.items.reduce((a, it) => a + String(it.body || '').length, 0) / n;
    const cols = {
      columns: n <= 3 ? [n] : n === 4 ? [4, 2] : [3],
      rows: n <= 3 ? [1] : n === 4 ? [1, 2] : [2, 1],
      split: [1],
    };
    let order = avg > 34 ? ['rows', 'split', 'columns'] : ['columns', 'split', 'rows'];
    if (kind === 'bullet') order = ['rows', 'split'];
    if (kind === 'image' || kind === 'metric' || kind === 'block') order = ['columns', 'rows', 'split'];
    if (s.arrange && s.arrange !== 'auto') order = [s.arrange];
    return order.flatMap(a => (cols[a] || [1]).map(c => ({ arrange: a, cols: c })));
  }

  /* 卡片底的樣式會跟著排列改變：例如編號在橫排是「上緣一條線」，在直列是整條淡色底 */
  function surfaceFor(s, theme, arrange) {
    const want = s.surface && s.surface !== 'auto' ? s.surface : theme.surface !== 'auto' ? theme.surface : null;
    const kind = s.item || 'icon';
    if (kind === 'bullet') return 'none';
    if (kind === 'block') return s.highlight ? 'tint' : 'solid';
    if (want) return want;
    if (kind === 'image') return 'none';
    if (kind === 'number') return arrange === 'columns' ? 'rule' : 'tint';
    return 'tint';
  }

  function applyCandidate(sl, c) {
    const el = sl.el;
    el.dataset.arrange = c.arrange;
    el.style.setProperty('--cols', c.cols);
    el.style.removeProperty('--minh');
    const surf = surfaceFor(sl.data, sl.theme, c.arrange);
    for (const it of el.querySelectorAll('.item')) it.dataset.surface = it.classList.contains('hl') ? 'solid' : surf;
  }

  function fitSlide(sl) {
    const el = sl.el, tiers = TIERS[sl.data.type];
    const cands = sl.data.type === 'points' ? pointCandidates(sl.data) : [null];
    let best = null;
    for (const c of cands) {
      if (c) applyCandidate(sl, c);
      for (let t = 0; t < tiers.length; t++) {
        applyTier(el, tiers[t]);
        if (!overflows(el)) { if (!best || t < best.t) best = { c, t }; break; }
      }
      if (best && best.t === 0) break;
    }
    const pick = best || { c: cands[0], t: tiers.length - 1 };
    /* 封面與過場的標題如果「差一點點」就能排成一行，寧可小一兩級，也不要從詞的中間斷成兩行 */
    if (best && !pick.c) {
      const title = el.querySelector('.title');
      const lines = () => Math.round(title.offsetHeight / parseFloat(getComputedStyle(title).lineHeight));
      applyTier(el, tiers[pick.t]);
      const manual = title && title.textContent.includes(String.fromCharCode(10));   // 作者自己指定了斷行
      if (title && !manual && lines() === 2) {
        for (let t = pick.t + 1; t <= Math.min(pick.t + 2, tiers.length - 1); t++) {
          applyTier(el, tiers[t]);
          if (lines() === 1 && !overflows(el)) { pick.t = t; break; }
        }
      }
    }
    if (pick.c) applyCandidate(sl, pick.c);
    applyTier(el, tiers[pick.t]);
    el.dataset.tier = pick.t;
    el.dataset.fit = best ? 'ok' : 'overflow';

    /* 單排卡片內容偏少時，給卡片一個最低高度，避免整頁只有一條薄薄的橫帶 */
    if (best && pick.c && pick.c.arrange === 'columns' && pick.c.cols === sl.data.items.length) {
      const body = el.querySelector('.body'), items = el.querySelector('.items');
      const want = Math.round(body.clientHeight * 0.66);
      if (items.offsetHeight < want) {
        el.style.setProperty('--minh', want + 'px');
        if (overflows(el)) el.style.removeProperty('--minh');
      }
    }
    const f = el.querySelector('.frame');
    const hOf = k => (k.classList.contains('body') ? k.firstElementChild.offsetHeight : k.offsetHeight);
    const kids = [...f.children];
    const used = el.dataset.arrange === 'split'
      ? Math.max(...kids.filter(k => !k.classList.contains('takeaway')).map(hOf)) + kids.filter(k => k.classList.contains('takeaway')).reduce((a, k) => a + k.offsetHeight, 0)
      : kids.reduce((a, k) => a + hOf(k), 0);
    sl.fill = +(used / f.clientHeight).toFixed(2);
  }

  function layoutSlide(sl) {
    sl.scrim = null;
    if (TIERS[sl.data.type]) fitSlide(sl);
  }

  /* ---------------- 建立整份簡報 ---------------- */
  let root, stage, slides = [], cur = 0, raf = 0, t0 = 0, deck, theme, readyResolve;
  const ready = new Promise(r => (readyResolve = r));
  const BUILD = { cover: buildCover, statement: buildStatement, points: buildPoints, compare: buildCompare };

  function makeSlide(i) {
    const s = deck.slides[i], issues = [];
    const build = BUILD[s.type];
    const frame = build ? build(s, theme, issues)
      : (issues.push({ level: 'error', code: 'UNKNOWN_TYPE', msg: `不認得的骨架類型「${s.type}」` }), h('div', { class: 'frame' }));
    const canvas = h('canvas', { class: 'bg', width: W, height: H, 'aria-hidden': 'true' });
    const chrome = s.type === 'cover' ? null : h('div', { class: 'chrome' },
      h('span', null, deck.footer || ''), h('span', null, `${i + 1} / ${deck.slides.length}`));
    const el = h('section', {
      class: 'slide', 'data-type': s.type, 'data-kind': s.kind || (s.type === 'statement' ? 'section' : null),
      'data-item': s.type === 'points' ? (s.item || 'icon') : null,
      'data-align': s.type === 'cover' || s.type === 'statement' ? alignOf(s) : s.align || null,
      'data-count': s.items ? s.items.length : null,
      'data-terse': s.items && s.items.every(it => !String(it.body || '').trim()) ? true : null,
    }, canvas, frame, chrome);
    return { el, canvas, data: s, theme, issues, bg: bgOptions(deck, s, theme, i), scrim: null, painted: false, fill: 0 };
  }

  function mount(target = '#deck', data) {
    deck = data || JSON.parse(document.getElementById('deck-data').textContent);
    theme = resolveTheme(deck.theme);
    root = typeof target === 'string' ? document.querySelector(target) : target;
    root.classList.add('deck');
    if (/[?&]debug\b/.test(location.search)) root.classList.add('debug');
    for (const k in theme.vars) root.style.setProperty(k, theme.vars[k]);
    stage = h('div', { class: 'stage' });
    slides = deck.slides.map((_, i) => { const sl = makeSlide(i); stage.append(sl.el); return sl; });
    root.replaceChildren(stage, h('div', { class: 'hud', 'aria-hidden': 'true' }));
    document.title = deck.title || document.title;

    scale();
    addEventListener('resize', scale);
    addEventListener('keydown', onKey);
    addEventListener('hashchange', () => go(fromHash()));
    addEventListener('beforeprint', () => slides.forEach((_, i) => paint(i)));
    stage.addEventListener('click', e => go(cur + (e.clientX < innerWidth * 0.3 ? -1 : 1)));

    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      slides.forEach(layoutSlide);
      go(fromHash());
      readyResolve();
    });
    return ready;
  }

  const fromHash = () => Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1);

  function scale() {
    const k = Math.max(0.05, Math.min(innerWidth / W, innerHeight / H));
    stage.style.transform = `translate(${(innerWidth - W * k) / 2}px, ${(innerHeight - H * k) / 2}px) scale(${k})`;
  }

  function paint(i, t) {
    const sl = slides[i];
    if (sl.bg.scrim === 'content' && !sl.scrim) sl.scrim = buildScrim(sl);
    paintBg(sl.canvas, sl.bg, t ?? sl.bg.phase, sl.scrim);
    sl.painted = true;
  }
  function release(i) {
    const sl = slides[i];
    if (!sl.painted) return;
    sl.canvas.width = W;                 // 重設畫布，釋放沒在看的那幾頁的記憶體
    sl.painted = false;
  }

  function go(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((sl, j) => {
      sl.el.classList.toggle('on', j === cur);
      if (Math.abs(j - cur) > 1) release(j);
    });
    paint(cur);
    if (location.hash !== '#' + (cur + 1)) history.replaceState(null, '', '#' + (cur + 1));
    cancelAnimationFrame(raf);
    raf = 0;
    if (slides[cur].bg.animate) { t0 = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function tick(now) {
    const o = slides[cur].bg;
    paint(cur, ((now - t0) / 1000 / o.loop + o.phase) % 1);
    raf = requestAnimationFrame(tick);
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') go(cur + 1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') go(cur - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (k === 'f' || k === 'F' || e.code === 'KeyF') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else return;
    e.preventDefault();
  }

  /* ---------------- 檢查 ---------------- */
  const parseRgb = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const v = m[1].split(/[ ,/]+/).map(Number); return [v[0], v[1], v[2], v[3] ?? 1]; };
  const relLum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

  /* 這段文字「最難讀的那一點」的對比：背景畫布取樣，再疊上它底下的卡片色 */
  function minContrast(el, sl, box) {
    const layers = [];
    for (let n = el; n && n !== sl.el; n = n.parentElement) {
      const c = parseRgb(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    const fg = parseRgb(getComputedStyle(el).color);
    const ctx = sl.canvas.getContext('2d', { willReadFrequently: true });
    let worst = Infinity;
    for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 5; ix++) {
      const x = Math.max(0, Math.min(W - 1, Math.round(box.x + box.w * (ix + 0.5) / 5)));
      const y = Math.max(0, Math.min(H - 1, Math.round(box.y + box.h * (iy + 0.5) / 3)));
      let px = [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
      for (let k = layers.length - 1; k >= 0; k--) { const [r, g, b, a] = layers[k]; px = [px[0] + (r - px[0]) * a, px[1] + (g - px[1]) * a, px[2] + (b - px[2]) * a]; }
      const a = relLum(px), b = relLum(fg);
      worst = Math.min(worst, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
    }
    return worst;
  }

  function audit(only) {
    return only == null ? slides.map((_, i) => auditSlide(i)) : auditSlide(only);
  }

  function auditSlide(i) {
    {
      const sl = slides[i];
      const issues = [...sl.issues], add = (level, code, msg) => issues.push({ level, code, msg });
      const was = sl.painted;
      paint(i);
      const sr = sl.el.getBoundingClientRect(), k = sr.width / W;
      const box = n => { const r = n.getBoundingClientRect(); return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }; };
      const label = n => (n.textContent || '').trim().slice(0, 14);

      if (sl.el.dataset.fit === 'overflow') add('error', 'OVERFLOW', '已經縮到字級下限仍放不下：請刪減文字、減少項目，或拆成兩頁');
      const texts = [...sl.el.querySelectorAll('[data-text]')].filter(n => n.getClientRects().length);
      const boxes = texts.map(box);
      texts.forEach((n, j) => {
        const b = boxes[j], fs = parseFloat(getComputedStyle(n).fontSize);
        if (fs < FLOOR - 0.01) add('error', 'FONT_FLOOR', `「${label(n)}」字級 ${fs}px，低於下限 ${FLOOR}px`);
        if (b.x < 95 || b.y < 95 || b.x + b.w > W - 95 || b.y + b.h > H - 95) add('error', 'OUT_OF_BOUNDS', `「${label(n)}」超出安全邊界`);
        /* 對比只量文字實際佔到的範圍：標題右邊空著的地方本來就留給紋理 */
        const range = document.createRange();
        range.selectNodeContents(n);
        const tr = range.getBoundingClientRect();
        const c = minContrast(n, sl, tr.width ? { x: (tr.left - sr.left) / k, y: (tr.top - sr.top) / k, w: tr.width / k, h: tr.height / k } : b);
        if (c < 3) add('error', 'LOW_CONTRAST', `「${label(n)}」與背景的對比只有 ${c.toFixed(1)}，讀不清楚`);
        else if (c < 3.5) add('warn', 'LOW_CONTRAST', `「${label(n)}」與背景的對比 ${c.toFixed(1)}，偏低`);
      });
      for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
        if (texts[a].contains(texts[b]) || texts[b].contains(texts[a])) continue;
        const p = boxes[a], q = boxes[b];
        const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x), oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
        if (ox > 2 && oy > 2) add('error', 'OVERLAP', `「${label(texts[a])}」與「${label(texts[b])}」重疊`);
      }
      if (TIERS[sl.data.type] && sl.data.type !== 'cover' && sl.data.type !== 'statement' && sl.fill < 0.45)
        add('warn', 'SPARSE', `內容只佔版面 ${Math.round(sl.fill * 100)}%，偏空：可補充內容，或改用 split 排列`);
      if (!was && i !== cur) release(i);
      return {
        slide: i + 1, type: sl.data.type, item: sl.el.dataset.item || null, arrange: sl.el.dataset.arrange || null,
        cols: sl.el.style.getPropertyValue('--cols') || null, tier: sl.el.dataset.tier == null ? null : +sl.el.dataset.tier,
        fit: sl.el.dataset.fit, fill: sl.fill, issues,
      };
    }
  }

  return {
    mount, go, audit, ready,
    get root() { return root; }, get count() { return slides.length; }, get current() { return cur; }, get slides() { return slides; },
  };
})();
