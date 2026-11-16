/* 自動產生，請勿手改。
   來源：簡報素材工坊（core.js 7c7ec77c2af8efa2、bg.js e59c82c7b49c9e3d、icons.js e038a7ce7eef3663）
   產生方式：node scripts/sync-workshop.mjs "<簡報素材工坊資料夾>" */
'use strict';
const WORKSHOP = (() => {
  const W = 1920, H = 1080, TAU = Math.PI * 2;

/* ---- 顏色 ---- */
const hex2rgb = hx => { const n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const rgba = (hx, a) => { const [r, g, b] = hex2rgb(hx); return `rgba(${r},${g},${b},${a})`; };
const lum = hx => {
  const [r, g, b] = hex2rgb(hx).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = hx => (lum(hx) > 0.36 ? '#191919' : '#FFFFFF');

/* ---- 可重現的亂數（同一顆種子永遠得到同一張圖）---- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const num = n => +(+n).toFixed(2);

  const low = Object.assign(document.createElement('canvas'), { width: 384, height: 216 });
  const lctx = low.getContext('2d');
  const pts = new Float32Array(8);
  const ramp = (p, u) => (u < 0.5 ? mix(p.c[2], p.c[1], u * 2) : mix(p.c[1], p.c[0], (u - 0.5) * 2));

  const PALS = [
    { id: 'bronze', name: '事務所銅', bg: '#F7F0E4', c: ['#A17339', '#B39166', '#D9C4A5'] },
    { id: 'ink', name: '墨底銅金', bg: '#191919', c: ['#6E4A1F', '#A17339', '#C9A46E'] },
    { id: 'blue', name: '信任藍', bg: '#10283A', c: ['#306E9E', '#5E9CB5', '#8FC2CF'] },
    { id: 'olive', name: '成長綠', bg: '#14240F', c: ['#3A762B', '#65955A', '#A9C29F'] },
    { id: 'mist', name: '晨霧', bg: '#F5F2EC', c: ['#B39C81', '#8FC2CF', '#DDD8D2'] },
    { id: 'dusk', name: '暮色', bg: '#1E1A2A', c: ['#3E5C8A', '#8A4F7D', '#C7764F'] },
  ];

  const STYLES = {
    aurora: {
      name: '流光',
      build(rng, s) {
        const n = Math.round(4 + s.density * 5);
        return Array.from({ length: n }, (_, i) => ({
          cx: 0.1 + rng() * 0.8, cy: 0.1 + rng() * 0.8,
          rx: 0.08 + rng() * 0.22, ry: 0.08 + rng() * 0.22,
          n: pick(rng, [1, -1, 1, -1, 2]), m: pick(rng, [1, -1, 2, -2]),
          p: rng() * TAU, q: rng() * TAU, r: 0.28 + rng() * 0.3, ci: i % 3,
        }));
      },
      draw(c, t, m, p, s) {
        const w = low.width, hh = low.height;
        lctx.fillStyle = p.bg;
        lctx.fillRect(0, 0, w, hh);
        const a = 0.3 + s.strength * 0.6;
        for (const b of m) {
          const x = (b.cx + b.rx * Math.cos(TAU * b.n * t + b.p)) * w;
          const y = (b.cy + b.ry * Math.sin(TAU * b.m * t + b.q)) * hh;
          const g = lctx.createRadialGradient(x, y, 0, x, y, b.r * w);
          g.addColorStop(0, rgba(p.c[b.ci], a));
          g.addColorStop(0.5, rgba(p.c[b.ci], a * 0.42));
          g.addColorStop(1, rgba(p.c[b.ci], 0));
          lctx.fillStyle = g;
          lctx.fillRect(0, 0, w, hh);
        }
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(low, 0, 0, W, H);
      },
    },

    waves: {
      name: '波浪',
      build(rng, s) {
        const n = Math.round(3 + s.density * 6);
        return Array.from({ length: n }, (_, i) => ({
          base: 0.34 + 0.6 * i / n,
          k: [
            { a: 50 + rng() * 50, f: (0.7 + rng() * 0.8) * TAU / W, n: pick(rng, [1, -1]), p: rng() * TAU },
            { a: 16 + rng() * 22, f: (1.8 + rng() * 1.6) * TAU / W, n: pick(rng, [1, -1, 2]), p: rng() * TAU },
            { a: 5 + rng() * 9, f: (4 + rng() * 3) * TAU / W, n: pick(rng, [2, -2, 3]), p: rng() * TAU },
          ],
        }));
      },
      draw(c, t, m, p, s) {
        c.fillStyle = p.bg;
        c.fillRect(0, 0, W, H);
        const n = m.length, a = 0.22 + s.strength * 0.5;
        m.forEach((L, i) => {
          c.beginPath();
          c.moveTo(0, H);
          for (let x = 0; x <= W; x += 12) {
            let y = L.base * H;
            for (const k of L.k) y += k.a * Math.sin(x * k.f + TAU * k.n * t + k.p);
            c.lineTo(x, y);
          }
          c.lineTo(W, H);
          c.closePath();
          c.fillStyle = rgba(ramp(p, n > 1 ? i / (n - 1) : 1), a);
          c.fill();
        });
      },
    },

    contour: {
      name: '等高線',
      build(rng) {
        return {
          w: Array.from({ length: 5 }, () => ({
            kx: (rng() * 2 - 1) * 2.2, ky: (rng() * 2 - 1) * 2.2,
            n: pick(rng, [1, -1, 1, -1, 2]), p: rng() * TAU, a: 0.5 + rng() * 0.5,
          })),
          p1: rng() * TAU, p2: rng() * TAU, f: new Float32Array(121 * 69),
        };
      },
      draw(c, t, m, p, s) {
        const C = 120, R = 68, cw = W / C, ch = H / R, f = m.f;
        c.fillStyle = p.bg;
        c.fillRect(0, 0, W, H);
        let S = 0;
        for (const k of m.w) S += k.a;
        for (let j = 0; j <= R; j++) {
          for (let i = 0; i <= C; i++) {
            const u = i / C * 1.78, v = j / R;
            const uw = u + 0.1 * Math.sin(TAU * (v * 1.1 + t) + m.p1);
            const vw = v + 0.1 * Math.sin(TAU * (u * 0.9 - t) + m.p2);
            let val = 0;
            for (const k of m.w) val += k.a * Math.sin(TAU * (k.kx * uw + k.ky * vw + k.n * t) + k.p);
            f[j * (C + 1) + i] = val / S;
          }
        }
        const L = Math.round(6 + s.density * 12);
        c.lineWidth = 2.2;
        c.lineCap = 'round';
        const alpha = 0.3 + s.strength * 0.65;
        for (let l = 0; l < L; l++) {
          const lv = -0.8 + 1.6 * (l + 0.5) / L;
          c.strokeStyle = rgba(ramp(p, l / (L - 1)), alpha);
          c.beginPath();
          for (let j = 0; j < R; j++) {
            const r0 = j * (C + 1), r1 = r0 + C + 1;
            for (let i = 0; i < C; i++) {
              const a = f[r0 + i] - lv, b = f[r0 + i + 1] - lv, d = f[r1 + i] - lv, e = f[r1 + i + 1] - lv;
              const sa = a > 0, sb = b > 0, sd = d > 0, se = e > 0;
              if (sa === sb && sb === sd && sd === se) continue;
              const x = i * cw, y = j * ch;
              let n = 0;
              if (sa !== sb) { pts[n++] = x + cw * a / (a - b); pts[n++] = y; }
              if (sb !== se) { pts[n++] = x + cw; pts[n++] = y + ch * b / (b - e); }
              if (sd !== se) { pts[n++] = x + cw * d / (d - e); pts[n++] = y + ch; }
              if (sa !== sd) { pts[n++] = x; pts[n++] = y + ch * a / (a - d); }
              c.moveTo(pts[0], pts[1]);
              c.lineTo(pts[2], pts[3]);
              if (n === 8) { c.moveTo(pts[4], pts[5]); c.lineTo(pts[6], pts[7]); }
            }
          }
          c.stroke();
        }
      },
    },

    network: {
      name: '星網',
      build(rng, s) {
        const n = Math.round(50 + s.density * 110);
        return {
          xs: new Float32Array(n), ys: new Float32Array(n),
          nodes: Array.from({ length: n }, (_, i) => ({
            x: rng() * W * 1.1 - W * 0.05, y: rng() * H * 1.1 - H * 0.05,
            rx: 25 + rng() * 90, ry: 25 + rng() * 90,
            n: pick(rng, [1, -1, 1, -1, 2]), m: pick(rng, [1, -1, 1, -1, -2]),
            p: rng() * TAU, q: rng() * TAU, r: 3.5 + rng() * rng() * 9, ci: i % 3,
          })),
        };
      },
      draw(c, t, m, p, s) {
        c.fillStyle = p.bg;
        c.fillRect(0, 0, W, H);
        const { nodes, xs, ys } = m, n = nodes.length;
        for (let i = 0; i < n; i++) {
          const o = nodes[i];
          xs[i] = o.x + o.rx * Math.cos(TAU * o.n * t + o.p);
          ys[i] = o.y + o.ry * Math.sin(TAU * o.m * t + o.q);
        }
        const D = 270 - s.density * 90, D2 = D * D, A = 0.3 + s.strength * 0.6;
        c.lineWidth = 2.4;
        c.strokeStyle = lum(p.bg) < 0.3 ? p.c[2] : p.c[0];   // 連線用與底色反差最大的那一色
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = xs[i] - xs[j], dy = ys[i] - ys[j], d2 = dx * dx + dy * dy;
            if (d2 > D2) continue;
            c.globalAlpha = A * (1 - Math.sqrt(d2) / D);
            c.beginPath();
            c.moveTo(xs[i], ys[i]);
            c.lineTo(xs[j], ys[j]);
            c.stroke();
          }
        }
        c.globalAlpha = 0.6 + s.strength * 0.4;
        for (let i = 0; i < n; i++) {
          c.fillStyle = p.c[nodes[i].ci];
          c.beginPath();
          c.arc(xs[i], ys[i], nodes[i].r, 0, TAU);
          c.fill();
        }
        c.globalAlpha = 1;
      },
    },

    steps: {
      name: '階梯',
      build(rng) {
        return { kx: 0.16 + rng() * 0.22, ky: 0.1 + rng() * 0.22, p: rng() * TAU, dir: pick(rng, [1, -1]) };
      },
      draw(c, t, m, p, s) {
        c.fillStyle = p.bg;
        c.fillRect(0, 0, W, H);
        const tw = 170 - s.density * 70, th = tw / 2, amp = th * (0.6 + s.strength * 1.5), dep = amp + 2;
        const k = 0.3 + s.strength * 0.7;
        const top = mix(p.bg, p.c[2], k), left = mix(p.bg, p.c[1], k), right = mix(p.bg, p.c[0], k);
        const A = Math.ceil(W / tw) + 1;
        const b0 = -Math.ceil(amp / (th / 2)) - 2, b1 = Math.ceil(H / (th / 2)) + 2;
        /* 同一排的方塊互不遮擋，所以整排的同色面合成一條路徑一次畫完（比逐面繪製快很多） */
        const NQ = 10, tops = Array.from({ length: NQ + 1 }, (_, q) => mix(top, '#FFFFFF', q / NQ * 0.22));
        const quad = (path, x1, y1, x2, y2, x3, y3, x4, y4) => {
          path.moveTo(x1, y1); path.lineTo(x2, y2); path.lineTo(x3, y3); path.lineTo(x4, y4); path.closePath();
        };
        const paintPath = (col, path) => { c.fillStyle = c.strokeStyle = col; c.fill(path); c.stroke(path); };
        c.lineWidth = 1;
        c.lineJoin = 'round';
        for (let b = b0; b <= b1; b++) {
          const L = new Path2D(), R = new Path2D(), T = [];
          for (let a = -A; a <= A; a++) {
            if ((a + b) & 1) continue;
            const i = (a + b) / 2, j = (b - a) / 2;
            const e = 0.5 + 0.5 * Math.sin(TAU * (m.dir * t + i * m.kx + j * m.ky) + m.p);
            const x = W / 2 + a * tw / 2, y = b * th / 2 - th + (1 - e) * amp;
            quad(L, x - tw / 2, y + th / 2, x, y + th, x, y + th + dep, x - tw / 2, y + th / 2 + dep);
            quad(R, x + tw / 2, y + th / 2, x, y + th, x, y + th + dep, x + tw / 2, y + th / 2 + dep);
            const q = Math.round(e * NQ);
            quad(T[q] || (T[q] = new Path2D()), x, y, x + tw / 2, y + th / 2, x, y + th, x - tw / 2, y + th / 2);
          }
          paintPath(left, L);
          paintPath(right, R);
          for (let q = 0; q <= NQ; q++) if (T[q]) paintPath(tops[q], T[q]);
        }
      },
    },
  };

  const LIB = [
    // 數據
    ['bars', '長條圖', '數據', '圖表 成長 業績 統計', ['*r 4.5 13 3.5 8 .6', '*r 10.25 8 3.5 13 .6', '*r 16 4 3.5 17 .6', 'M2.5 21h19']],
    ['trend', '趨勢', '數據', '成長 上升 折線 業績', ['M3 17l6-6 4 4 8-8', 'M15 7h6v6']],
    ['pie', '圓餅圖', '數據', '占比 比例 份額', ['*M11 4.5a8.5 8.5 0 1 0 8.5 8.5H11z', '*M14.5 2.5V9.5h7a7 7 0 0 0-7-7z']],
    ['target', '目標', '數據', 'KPI 靶心 聚焦 精準', ['*c 12 12 9', 'c 12 12 4.5', 'M12 12h.01']],
    ['funnel', '漏斗', '數據', '轉換 篩選 行銷', ['*M3.5 4.5h17l-6.5 8v6l-4 2v-8z']],
    ['database', '資料庫', '數據', '資料 儲存 系統', ['*M4 6.5c0-1.9 3.6-3.5 8-3.5s8 1.6 8 3.5v11c0 1.9-3.6 3.5-8 3.5s-8-1.6-8-3.5z', 'M4 6.5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5', 'M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5']],
    ['layers', '層級', '數據', '堆疊 架構 分層', ['*M12 3l9 5-9 5-9-5z', 'M3 12.5l9 5 9-5', 'M3 16.5l9 5 9-5']],
    ['stairs', '階梯', '數據', '成長 進階 步驟 升級', ['*M3 21v-3.5h5v-4.5h5V8.5h5V4h3v17z']],
    // 溝通
    ['present', '簡報', '溝通', '投影片 報告 提案 上台', ['M2 4h20', '*M4 4h16v11H4z', 'M12 15v3', 'M8 21l4-3 4 3']],
    ['chat', '對話', '溝通', '留言 回饋 討論 問答', ['*M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 8.5h8', 'M8 12h5']],
    ['mail', '郵件', '溝通', '信件 聯絡 通知', ['*r 3 5 18 14 2', 'M3.5 7.5l8.5 6 8.5-6']],
    ['mic', '麥克風', '溝通', '演講 上台 發表 錄音', ['*r 9 3 6 11 3', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21', 'M9 21h6']],
    ['user', '個人', '溝通', '使用者 學員 客戶', ['*c 12 8 4', 'M4 21a8 8 0 0 1 16 0']],
    ['team', '團隊', '溝通', '夥伴 合作 組織', ['*c 9 8 3.5', 'M2.5 20.5a6.5 6.5 0 0 1 13 0', 'M16 4.7a3.5 3.5 0 0 1 0 6.6', 'M18.5 14.4a6.5 6.5 0 0 1 3 6.1']],
    ['share', '分享', '溝通', '連結 擴散 轉發', ['*c 6 12 2.6', '*c 17.5 5.5 2.6', '*c 17.5 18.5 2.6', 'M8.3 10.7l6.9-3.9', 'M8.3 13.3l6.9 3.9']],
    ['bell', '通知', '溝通', '提醒 鈴 公告', ['*M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15z', 'M10 21.5h4']],
    ['eye', '觀點', '溝通', '檢視 洞察 注意 觀察', ['*M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7z', 'c 12 12 3']],
    // 商務
    ['building', '企業', '商務', '公司 內訓 機構 辦公', ['*r 5 3 14 18 1', 'M9 7.5h1.5', 'M13.5 7.5H15', 'M9 11.5h1.5', 'M13.5 11.5H15', 'M10.5 21v-4.5h3V21', 'M2.5 21h19']],
    ['bag', '購物', '商務', '商品 銷售 訂單', ['*M5 8h14l1 13H4z', 'M9 11V7a3 3 0 0 1 6 0v4']],
    ['coin', '費用', '商務', '金錢 預算 營收 成本', ['*c 12 12 9', 'M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2', 'M12 6.3V8', 'M12 16v1.7']],
    ['trophy', '獎盃', '商務', '成就 冠軍 得獎', ['*M7 4h10v5a5 5 0 0 1-10 0z', 'M7 6H4v1a3 3 0 0 0 3 3', 'M17 6h3v1a3 3 0 0 1-3 3', 'M12 14v4.5', 'M8.5 20.5h7']],
    ['award', '獎章', '商務', '認證 榮譽 品質', ['*c 12 9 5.5', 'M8.5 13.5L7 21.5l5-2.5 5 2.5-1.5-8']],
    ['flag', '里程碑', '商務', '旗幟 目標 階段', ['M5 21.5V3.5', '*M5 4.5h13.5l-3 4 3 4H5z']],
    ['shield', '保障', '商務', '安全 信任 風險', ['*M12 3l8 3v6c0 4.5-3.2 7.8-8 9.5-4.8-1.7-8-5-8-9.5V6z', 'M9 12l2.2 2.2 4-4.2']],
    ['calendar', '行事曆', '商務', '日期 排程 時程', ['*r 3 5 18 16 2', 'M3 10h18', 'M8 3v4', 'M16 3v4']],
    ['clock', '時間', '商務', '時鐘 效率 期限', ['*c 12 12 9', 'M12 7v5l3.5 2']],
    ['pin', '地點', '商務', '位置 地圖 據點', ['*M12 21.5c-4.5-5-7-8.5-7-12a7 7 0 0 1 14 0c0 3.5-2.5 7-7 12z', 'c 12 9.5 2.5']],
    ['globe', '全球', '商務', '國際 網路 市場', ['*c 12 12 9', 'M3 12h18', 'M12 3c3 3.2 3 14.8 0 18', 'M12 3c-3 3.2-3 14.8 0 18']],
    // 工具
    ['search', '搜尋', '工具', '研究 放大鏡 調查', ['*c 10.5 10.5 6.5', 'M15.5 15.5L21 21']],
    ['file', '文件', '工具', '檔案 報告 合約', ['*M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9.5 13h5', 'M9.5 17h5']],
    ['folder', '資料夾', '工具', '整理 歸檔 專案', ['*M3 6h6l2 2.5h10V19H3z']],
    ['pen', '編輯', '工具', '書寫 設計 修改', ['*M4 20l1-4.5L16.5 4a2.12 2.12 0 0 1 3 3L8 18.5z', 'M14 6.5l3.5 3.5']],
    ['sliders', '設定', '工具', '調整 參數 控制', ['M3.5 7h10', 'M18.5 7h2', '*c 16 7 2.5', 'M3.5 17h2', 'M10.5 17h10', '*c 8 17 2.5']],
    ['lock', '鎖定', '工具', '權限 隱私 安全', ['*r 5 11 14 10 2', 'M8 11V8a4 4 0 0 1 8 0v3', 'M12 15v2.5']],
    ['download', '下載', '工具', '匯出 儲存', ['M12 4v11', 'M7.5 11l4.5 4.5 4.5-4.5', 'M4 20h16']],
    ['refresh', '循環', '工具', '更新 迭代 重複', ['M20 11a8 8 0 0 0-14.5-3.5', 'M4 5v3.5h3.5', 'M4 13a8 8 0 0 0 14.5 3.5', 'M20 19v-3.5h-3.5']],
    ['monitor', '螢幕', '工具', '電腦 線上 遠距', ['*r 2.5 4 19 12.5 2', 'M8.5 20.5h7', 'M12 16.5v4']],
    ['phone', '手機', '工具', '行動 App', ['*r 6.5 2.5 11 19 2.5', 'M10.5 18h3']],
    ['image', '圖片', '工具', '照片 視覺 素材', ['*r 3 4.5 18 15 2', 'c 8.5 9.5 1.5', 'M3.5 17l5-4.5 3.5 3 3-2.5 5.5 4.5']],
    ['grid', '版面', '工具', '排版 模組 格線', ['*r 3.5 3.5 7 7 1.5', '*r 13.5 3.5 7 7 1.5', '*r 3.5 13.5 7 7 1.5', '*r 13.5 13.5 7 7 1.5']],
    ['cloud', '雲端', '工具', '線上 同步 儲存', ['*M7 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 11.2 4 4 0 0 1 17.5 19z']],
    ['play', '播放', '工具', '影片 開始 示範', ['*c 12 12 9', 'M10 8.3v7.4l6-3.7z']],
    // 概念
    ['bulb', '靈感', '概念', '想法 創意 燈泡 點子', ['*M8.5 14.5a6 6 0 1 1 7 0c-.6.5-1 1.2-1 2V17h-5v-.5c0-.8-.4-1.5-1-2z', 'M10 20.5h4']],
    ['zap', '效率', '概念', '閃電 快速 能量', ['*M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z']],
    ['star', '重點', '概念', '星 精選 推薦', ['*s 12 12.4 9.6 4.3']],
    ['heart', '喜愛', '概念', '關懷 愛心 滿意', ['*M12 20.5C6 16 3 12.5 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3.5-3 7-9 11.5z']],
    ['check', '完成', '概念', '確認 正確 通過', ['*c 12 12 9', 'M8 12.5l3 3 5-6']],
    ['alert', '注意', '概念', '警示 風險 提醒', ['*M12 3.5l9.5 16.5h-19z', 'M12 9.5v4.5', 'M12 17h.01']],
    ['flow', '流程', '概念', '步驟 架構 分工', ['*r 2.5 3.5 7 5 1.2', '*r 14.5 9.5 7 5 1.2', '*r 2.5 15.5 7 5 1.2', 'M9.5 6H12v12H9.5', 'M12 12h2.5']],
    ['compass', '方向', '概念', '策略 指南 定位', ['*c 12 12 9', 'M15.5 8.5l-2 5-5 2 2-5z']],
    ['book', '知識', '概念', '書 學習 課程 教材', ['*M4 5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z', 'M12 5.5V19']],
    ['home', '首頁', '概念', '家 起點 基礎', ['*M4 10.5L12 4l8 6.5v10H4z', 'M10 20.5V15h4v5.5']],
    ['gift', '禮物', '概念', '回饋 優惠 贈品', ['*r 4 8 16 4.5 1', 'M5.5 12.5V21h13v-8.5', 'M12 8v13', 'M12 8C10.5 4 7 3.5 7 6s3 2 5 2', 'M12 8c1.5-4 5-4.5 5-2s-3 2-5 2']],
    ['coffee', '休息', '概念', '咖啡 中場 Q&A', ['*M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z', 'M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17', 'M8.5 3v3', 'M11 3v3', 'M13.5 3v3']],
    ['cursor', '點擊', '概念', '互動 游標 操作', ['*M5 4l14 6-6 2.2-2.2 6.3z']],
  ].map(([id, name, cat, tags, els]) => ({ id, name, cat, tags, els }));

  function toPath(src, k) {
    let fill = false;
    if (src[0] === '*') { fill = true; src = src.slice(1); }
    const kind = src[1] === ' ' ? src[0] : '';
    const a = kind ? src.slice(2).split(' ').map(Number) : null;
    let d = src;
    if (kind === 'c') {
      const [cx, cy, r] = a;
      d = `M${num(cx - r)} ${cy}a${r} ${r} 0 1 0 ${num(2 * r)} 0a${r} ${r} 0 1 0 ${num(-2 * r)} 0z`;
    } else if (kind === 'r') {
      const [x, y, w, hh, br] = a, r = num(Math.min(br * k / 0.6, w / 2, hh / 2));
      d = r < 0.05
        ? `M${x} ${y}h${w}v${hh}h${-w}z`
        : `M${num(x + r)} ${y}h${num(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${num(hh - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${num(2 * r - w)}a${r} ${r} 0 0 1 ${-r} ${-r}v${num(2 * r - hh)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
    } else if (kind === 's') {
      const [cx, cy, R, r] = a;
      d = 'M' + Array.from({ length: 10 }, (_, i) => {
        const ang = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
        return `${num(cx + rad * Math.cos(ang))} ${num(cy + rad * Math.sin(ang))}`;
      }).join('L') + 'z';
    }
    return { d, fill };
  }

  return { W, H, TAU, hex2rgb, mix, rgba, lum, onColor, mulberry32, pick, num, PALS, STYLES, LIB, toPath };
})();
