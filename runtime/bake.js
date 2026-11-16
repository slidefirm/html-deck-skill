/* html-deck 烘焙：把瀏覽器自動排好的每一頁，轉成編輯器（editor/edit-mode.js）吃的靜態物件。
   只在產檔時由 build.mjs 丟進無頭瀏覽器執行，不會出現在成品裡。

   成品的每一頁長這樣（座標以 .content 為準，也就是畫面往內 96px 的安全區）：
     <section class="slide" style="背景色與背景圖">
       <div class="content" data-content-area="true">
         <div class="el" data-edit-kind="text" data-edit-fit="text">單一段文字</div>
         <div class="el" data-edit-kind="visual">線、色塊、箭頭</div>
         <div class="el" data-edit-composite="…" data-edit-structure="module">卡片：背景層 + 內層文字、數字、圖示</div>
       </div>
     </section>
   樣式一律寫成 inline，量到多少就寫多少，成品不再依賴自動排版的 CSS。 */
const DeckBake = (() => {
  const W = 1920, H = 1080, CX = 96, CY = 96;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const q = s => esc(s).replace(/"/g, '&quot;');
  const r1 = v => Math.round(v * 10) / 10;
  const px = v => r1(v) + 'px';

  /* 瀏覽器把 color-mix 的結果回報成 color(srgb …)；編輯器與 PPTX 匯出只認得 rgb()，這裡統一換掉 */
  const rgbify = v => String(v).replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g, (m, r, g, b, a) => {
    const c = [r, g, b].map(x => Math.round(Math.max(0, Math.min(1, +x)) * 255)).join(', ');
    return a == null || +a >= 1 ? `rgb(${c})` : `rgba(${c}, ${Math.round(+a * 1000) / 1000})`;
  });
  const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(rgbify(c)); if (!m) return 0; const v = m[1].split(/[ ,/]+/); return v[3] == null ? 1 : +v[3]; };

  let sr, k;
  const rect = n => { const r = n.getBoundingClientRect(); return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }; };
  const num = v => parseFloat(v) || 0;
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

  const hasBorder = cs => SIDES.some(s => num(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
  const hasDeco = cs => alpha(cs.backgroundColor) > 0 || cs.backgroundImage !== 'none' || hasBorder(cs);
  const directText = n => [...n.childNodes].some(c => c.nodeType === 3 && c.data.trim());

  /* 底色、邊框、圓角 */
  function decoCss(cs, radiusFrom) {
    const out = [];
    if (alpha(cs.backgroundColor) > 0) out.push(`background-color:${rgbify(cs.backgroundColor)}`);
    if (cs.backgroundImage !== 'none') out.push(`background-image:${rgbify(cs.backgroundImage)}`);
    for (const s of SIDES) {
      const w = num(cs[`border${s}Width`]);
      if (w > 0 && cs[`border${s}Style`] !== 'none') out.push(`border-${s.toLowerCase()}:${px(w)} ${cs[`border${s}Style`]} ${rgbify(cs[`border${s}Color`])}`);
    }
    const rad = (radiusFrom || cs).borderRadius;
    if (rad && rad !== '0px') out.push(`border-radius:${rad}`);
    return out;
  }

  /* 文字的樣子。行高與字距寫成相對於字級的比例，之後在編輯器裡改字級時會跟著走。
     換行方式不在這裡決定：見 collect() 裡的 nowrap */
  function typeCss(cs) {
    const fs = num(cs.fontSize), out = [`font-size:${px(fs)}`, `font-weight:${cs.fontWeight}`, `color:${rgbify(cs.color)}`];
    const lh = num(cs.lineHeight);
    out.push(`line-height:${lh && fs ? Math.round(lh / fs * 1000) / 1000 : 1.2}`);
    const ls = num(cs.letterSpacing);
    if (ls) out.push(`letter-spacing:${Math.round(ls / fs * 1000) / 1000}em`);
    if (cs.textAlign !== 'start' && cs.textAlign !== 'left') out.push(`text-align:${cs.textAlign}`);
    if (cs.textWrap && cs.textWrap !== 'wrap') out.push(`text-wrap:${cs.textWrap}`);
    if (cs.fontVariantNumeric !== 'normal') out.push(`font-variant-numeric:${cs.fontVariantNumeric}`);
    if (!/Noto|JhengHei|system-ui/.test(cs.fontFamily)) out.push(`font-family:${cs.fontFamily.replace(/"/g, "'")}`);
    if (num(cs.webkitTextStrokeWidth) > 0) out.push(`-webkit-text-stroke:${cs.webkitTextStrokeWidth} ${rgbify(cs.webkitTextStrokeColor)}`);
    if (+cs.opacity < 1) out.push(`opacity:${cs.opacity}`);
    out.push('overflow-wrap:anywhere', 'line-break:strict');
    return out;
  }

  /* 文字實際佔的範圍：扣掉邊框與內距 */
  function contentBox(n, cs) {
    const b = rect(n), l = num(cs.borderLeftWidth) + num(cs.paddingLeft), t = num(cs.borderTopWidth) + num(cs.paddingTop);
    return { x: b.x + l, y: b.y + t, w: b.w - l - num(cs.borderRightWidth) - num(cs.paddingRight), h: b.h - t - num(cs.borderBottomWidth) - num(cs.paddingBottom) };
  }

  /* 這段文字排成幾行。寫進成品（data-hd-lines），check 用它確認烘焙後、編輯器載入後都沒有多斷行 */
  function lineCount(n) {
    const range = document.createRange(), tops = [];
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 0.5 && !tops.some(t => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
    return tops.length;
  }

  /* 文字實際畫出來的範圍（最寬的那一行）。只有一行的單獨文字用這個當框，選取框才會貼著字，置中的字也不會跑掉 */
  function tightBox(n) {
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    return r.width ? { x: (r.left - sr.left) / k, w: r.width / k + 1 } : null;
  }

  /* 把一個物件拆成「看得到的東西」：底、文字、圖示、圖片 */
  function collect(root) {
    const items = [];
    const walk = (n, clip) => {
      if (n.hidden) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const tag = n.tagName.toLowerCase();
      if (tag === 'svg') {
        /* 圖示的第二個顏色來自主題變數，先換成實際顏色 */
        const css = [`color:${rgbify(cs.color)}`, `--ic2:${rgbify(resolveColor(n.parentElement, 'var(--ic2, currentColor)'))}`];
        items.push({ kind: 'visual', box: rect(n), css, html: n.outerHTML, cls: 'ic' });
        return;
      }
      if (tag === 'img') {
        const css = ['object-fit:cover'];
        if (clip) css.push(`border-radius:${clip}`);
        items.push({ kind: 'image', box: rect(n), css, src: n.getAttribute('src'), alt: n.getAttribute('alt') || '' });
        return;
      }
      const deco = hasDeco(cs), text = directText(n);
      if (deco) items.push({ kind: 'deco', box: rect(n), css: decoCss(cs, n === root || !clip ? null : { borderRadius: clip }), own: n === root, cls: n.classList[0] || '' });
      /* 色塊卡片右上角的淡色序號是 CSS 產生的，量不到位置：它是直向排列的第一個，所以就在卡片內距的左上角 */
      const before = getComputedStyle(n, '::before');
      if (n.matches('.item') && before.content !== 'none' && before.content !== 'normal' && before.display !== 'none') {
        const b = rect(n), fs = num(before.fontSize);
        items.push({
          kind: 'metric', css: typeCss(before), text: String([...n.parentElement.children].indexOf(n) + 1).padStart(2, '0'), cls: 'block-no',
          box: { x: b.x + num(cs.paddingLeft), y: b.y + num(cs.paddingTop), w: b.w - num(cs.paddingLeft) - num(cs.paddingRight), h: num(before.lineHeight) || fs },
        });
      }
      if (text) {
        const prefix = n.matches('.by') ? '— ' : '', box = contentBox(n, cs), tight = tightBox(n), lines = lineCount(n);
        /* 框是照著字的寬度縮出來的（不是被版面撐開的）：字與框之間沒有餘裕 */
        const hugging = !!prefix || !tight || box.w - tight.w < 3;
        items.push({
          kind: n.matches('.mark.num, .mark.val, .bignum') ? 'metric' : 'text', box, tight: deco || prefix ? null : tight, css: typeCss(cs), lines,
          /* 只有一行、而且框貼著字的文字不自動換行。否則在編輯器裡換字體時，英數字只要寬一點點就會被擠到第二行 */
          nowrap: cs.whiteSpace === 'nowrap' || (lines <= 1 && hugging),
          text: prefix + n.textContent, cls: n.classList[n.classList.length - 1] || tag, tag: /^h[1-6]$/.test(tag) ? tag : 'p',
        });
        return;
      }
      const inner = cs.overflow !== 'visible' && cs.borderRadius !== '0px' ? cs.borderRadius : clip;
      for (const c of n.children) walk(c, inner);
    };
    walk(root, null);
    return items;
  }

  /* 把 var(--x) 解析成實際顏色 */
  function resolveColor(host, value) {
    const probe = document.createElement('i');
    probe.style.color = value;
    host.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }

  /* 作者自己指定的換行改成硬斷行：編輯器調整框寬時會把換行方式改回一般，只有 <br> 會留下來 */
  const textHtml = t => esc(t).split(String.fromCharCode(10)).join('<br>');
  const wrapCss = it => (it.nowrap ? [...it.css, 'white-space:nowrap'] : it.css);

  const style = (box, css, origin, auto) => {
    const o = origin || { x: CX, y: CY };
    return [`left:${px(box.x - o.x)}`, `top:${px(box.y - o.y)}`, `width:${px(Math.ceil(box.w * 10 - 0.05) / 10)}`, `height:${auto ? 'auto' : px(box.h)}`, ...css].join(';');
  };

  /* 卡片裡的一層 */
  function layer(it, origin) {
    const pos = 'data-edit-position="absolute"';
    if (it.kind === 'deco') return `<div class="hd-${q(it.cls)}" data-edit-layer="visual" ${pos} style="${q(style(it.box, it.css, origin))}"></div>`;
    if (it.kind === 'visual') return `<i class="hd-${q(it.cls)}" data-edit-layer="visual" ${pos} style="${q(style(it.box, it.css, origin))}">${it.html}</i>`;
    if (it.kind === 'image') return `<img class="hd-img" data-edit-layer="visual" ${pos} src="${q(it.src)}" alt="${q(it.alt)}" style="${q(style(it.box, it.css, origin))}">`;
    const tag = it.kind === 'metric' ? 'span' : it.tag === 'p' ? 'p' : 'b';
    return `<${tag} class="hd-${q(it.cls)}" data-edit-layer="${it.kind}" ${pos} data-edit-vertical-align="start"${it.lines ? ` data-hd-lines="${it.lines}"` : ''} style="${q(style(it.box, wrapCss(it), origin, true))}">${textHtml(it.text)}</${tag}>`;
  }

  /* 一個物件 → 一個 .el */
  function objectHtml(root, id) {
    const items = collect(root);
    if (!items.length) return '';
    const name = id.replace(/-\d+$/, '');
    if (items.length === 1) {
      const it = items[0];
      if (it.kind === 'text' || it.kind === 'metric') {
        /* 一行：框貼著字、不自動換行。多行：框用排版時真正的寬度，並把它記成這段文字的寬度上限，
           之後換字體或改字，都在同一個寬度裡重新換行 */
        const single = it.lines <= 1;
        const box = single && it.tight && it.tight.w < it.box.w ? { ...it.box, ...it.tight } : it.box;
        const css = single ? [...it.css, 'white-space:nowrap'] : it.css;
        return `<div class="el hd-${q(name)}" data-edit-kind="text" data-edit-fit="text" data-edit-vertical-align="start"${single ? '' : ` data-edit-fit-max-width="${px(it.box.w)}"`}${it.lines ? ` data-hd-lines="${it.lines}"` : ''} style="${q(style(box, css, null, true))}">${textHtml(it.text)}</div>`;
      }
      if (it.kind === 'image') return `<img class="el hd-${q(name)}" data-edit-kind="visual" src="${q(it.src)}" alt="${q(it.alt)}" style="${q(style(it.box, it.css))}">`;
      return `<div class="el hd-${q(name)}" data-edit-kind="visual" style="${q(style(it.box, it.css))}">${it.html || ''}</div>`;
    }
    /* 多層：做成群組。第一層一定是填滿整個群組的背景層（沒有底色時是透明的），其餘各層的座標以群組左上角為準 */
    const box = rect(root), own = items[0].kind === 'deco' && items[0].own ? items.shift() : null;
    const bg = `<div class="hd-bg" data-edit-layer="background" data-edit-position="absolute" style="${q(['left:0', 'top:0', 'width:100%', 'height:100%', ...(own ? own.css : [])].join(';'))}"></div>`;
    return `<div class="el hd-${q(name)}" data-edit-kind="visual" data-edit-composite="${q(id)}" data-edit-structure="module" data-edit-fit="container" data-edit-role="module" style="${q(style(box, []))}">${bg}${items.map(it => layer(it, box)).join('')}</div>`;
  }

  /* 背景圖用 WebP 品質 0.86：實測失真程度與 JPEG 0.82 相當（PSNR 差距 0.2 以內），檔案約一半。瀏覽器不會編 WebP 時（回傳的不是 WebP）退回 JPEG。
     匯出 PPTX 時編輯器會把它轉回 JPEG，舊版 PowerPoint 也打得開。 */
  function encode(canvas, quality) {
    const url = canvas.toDataURL('image/webp', quality);
    return url.startsWith('data:image/webp') ? url : canvas.toDataURL('image/jpeg', 0.82);
  }

  async function run({ quality = 0.86 } = {}) {
    await Deck.ready;
    const out = [], n = Deck.count;
    for (let i = 0; i < n; i++) {
      Deck.go(i);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sl = Deck.slides[i], el = sl.el;
      sr = el.getBoundingClientRect();
      k = sr.width / W;
      const parts = [];
      for (const o of el.querySelectorAll('[data-obj]')) parts.push(objectHtml(o, o.dataset.obj));
      [...el.querySelectorAll('.chrome span')].forEach((s, j) => { if (s.textContent.trim()) parts.push(objectHtml(s, j ? 'page-no' : 'footer')); });
      out.push({
        type: sl.data.type, bg: encode(sl.canvas, quality), color: sl.theme.bg,
        html: parts.filter(Boolean).join('\n'),
      });
    }
    const cs = getComputedStyle(Deck.root);
    return { slides: out, font: cs.getPropertyValue('--font').trim(), ink: cs.getPropertyValue('--ink').trim(), bg: cs.getPropertyValue('--bg').trim(), accent: cs.getPropertyValue('--accent').trim() };
  }

  return { run };
})();
