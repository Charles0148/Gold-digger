/* =========================================================
   冒險狩獵礦坑：正式怪物圖（擁有者 2026-10-09 核准）
   - 0～5 下位、6～8 天堂、9～11 地獄、12 駭骨巨龍 v2、13 破鱗後 v2；編號不變
   - 每隻四格 idle 精靈表；cells()／eyes 保留給斬擊碎塊與反黑演出
   - 瀏覽器預載 PNG；node 測試不碰 DOM
   ========================================================= */
(function (root) {
  "use strict";
  const ART = root.HuntMonArt || (typeof require !== "undefined" ? require("./hunt-mon-art.js") : null);
  const EXTRA = root.HuntRealmExtra || [];
  if (!ART || !ART.list || ART.list.length !== 14) throw new Error("HuntMonArt 未載入或怪物數量錯誤");
  if (EXTRA.length !== 9) throw new Error("狹間新怪物資料未載入或數量錯誤");

  const emptyGrid = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
  const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, k) => { const A = hex2(a), B = hex2(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join(""); };

  /* 舊場景仍使用的格子工具（小精靈、遠方翼影）；不是正式怪物圖。 */
  function Grid(W, Hh) {
    const G = emptyGrid(W, Hh);
    const o = {
      W, H: Hh, G,
      set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < Hh) G[y][x] = c; },
      ln(x0, y0, x1, y1, c, th) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; o.set(x, y, c); if (th > 1) { o.set(x + 1, y, c); o.set(x, y + 1, c); } } },
      el(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2) <= 1) o.set(x, y, c); },
      elo(cx, cy, rx, ry, c) { const n = Math.ceil((rx + ry) * 6); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c); } },
      rc(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(x + i, y + j, c); },
      M: x => W - 1 - x,
      mset(x, y, c) { o.set(x, y, c); o.set(W - 1 - x, y, c); },
      mln(a, b, c, d, ch, th) { o.ln(a, b, c, d, ch, th); o.ln(W - 1 - a, b, W - 1 - c, d, ch, th); },
      mel(cx, cy, rx, ry, c) { o.el(cx, cy, rx, ry, c); o.el(W - 1 - cx, cy, rx, ry, c); },
      mrc(x, y, w, h, c) { o.rc(x, y, w, h, c); o.rc(W - w - x, y, w, h, c); }
    };
    return o;
  }
  function toCells(G, pal) {
    const h0 = G.length, w0 = G[0].length, W = w0 + 2, Hh = h0 + 2, P = emptyGrid(W, Hh);
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) P[y + 1][x + 1] = G[y][x];
    const fl = (x, y) => P[y] && P[y][x] && P[y][x] !== "." && P[y][x] !== "O";
    const out = P.map(r => r.slice());
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (P[y][x] === "." && (fl(x - 1, y) || fl(x + 1, y) || fl(x, y - 1) || fl(x, y + 1))) out[y][x] = "O";
    const cells = [], idx = Array.from({ length: Hh }, () => Array(W).fill(-1));
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const c = out[y][x]; if (c === ".") continue;
      let col = pal.body, k = c;
      if (c === "O") col = pal.O; else if (c === "e") col = pal.eye; else if (c === "h") col = pal.acc;
      else if (c === "m") col = (!fl(x, y - 1) || !fl(x - 1, y)) ? pal.mrim : pal.mem;
      else if (c === "n") col = pal.hole; else { col = (!fl(x, y - 1) || !fl(x - 1, y)) ? pal.rim : pal.body; k = "a"; }
      idx[y][x] = cells.length; cells.push({ x, y, col, k });
    }
    return { cells, idx, w: W, h: Hh };
  }

  /* 玩家角色沿用原圖，怪物編號因此仍固定到 13。 */
  const PALHERO = { body: "#2d4a7a", rim: "#9ec3ff", eye: "#fff4c0", O: "#07070b", acc: "#ffd24a", mem: "#1b1838", mrim: "#3d3a73", hole: "#0f0e22" };
  function heroGrid() { const o = Grid(14, 20); o.el(6.5, 4, 3.2, 3.2, "a"); o.set(5, 4, "e"); o.set(8, 4, "e"); o.rc(4, 8, 6, 7, "a"); o.rc(4, 8, 6, 1, "h"); o.rc(2, 9, 2, 5, "a"); o.rc(10, 9, 2, 4, "a"); o.rc(4, 15, 2, 5, "a"); o.rc(8, 15, 2, 5, "a"); o.ln(12, 2, 12, 13, "h"); o.set(11, 13, "h"); o.set(13, 13, "h"); return o.G; }

  const cache = [], images = [];
  function svgText(w, h, cell) {
    let body = "";
    for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
      const col = cell[y][x]; if (!col) { x++; continue; }
      let x2 = x + 1; while (x2 < w && cell[y][x2] === col) x2++;
      body += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${col}"/>`; x = x2;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
  }
  function art(i) {
    if (cache[i]) return cache[i];
    if (i >= 14 && i <= 22) {
      const E = EXTRA[i - 14], B = art(E.base);
      return cache[i] = Object.assign({}, B, { sprite: E.sprite, name: E.name, kind: E.kind, type: E.type, extra: true });
    }
    const A = ART.list[i], cell = Array.from({ length: A.h }, () => Array(A.w).fill(null)), eyeSet = new Set(A.eyes.map(e => e.join(",")));
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const n = A.rows[y].charCodeAt(x) - 0x100; if (n >= 0) cell[y][x] = ART.palette[n]; }
    const svg = svgText(A.w, A.h, cell);
    return cache[i] = { w: A.w, h: A.h, cell, cells: cell.flatMap((r, y) => r.flatMap((col, x) => col ? [{ x, y, col, k: eyeSet.has(x + "," + y) ? "e" : "a" }] : [])), eyes: A.eyes, eye: A.eye, sprite: A.sprite, name: A.name, kind: A.kind, svg, uri: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) };
  }
  function hero() {
    if (cache[23]) return cache[23];
    const C = toCells(heroGrid(), PALHERO), cell = Array.from({ length: C.h }, () => Array(C.w).fill(null)), eyes = [];
    C.cells.forEach(c => { cell[c.y][c.x] = c.col; if (c.k === "e") eyes.push([c.x, c.y]); });
    const svg = svgText(C.w, C.h, cell);
    return cache[23] = Object.assign(C, { cell, eyes, eye: PALHERO.eye, svg, uri: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) });
  }
  const get = i => { const n = (((i | 0) % 24) + 24) % 24; return n === 23 ? hero() : art(n); };
  function image(i) {
    if (typeof root.Image === "undefined" || i < 0 || i > 22) return null;
    if (!images[i]) { const im = new root.Image(); im.decoding = "async"; im.src = i < 14 ? ART.list[i].sprite : EXTRA[i - 14].sprite; images[i] = im; }
    return images[i];
  }
  for (let i = 0; i < 23; i++) image(i);   // 巨龍與狹間怪登場前完成解碼

  const dragonData = () => { const C = get(12); return { C, plates: [], eye: C.eye }; };
  const api = {
    count: 6, total: 24,
    realm: { heaven: [6, 7, 8, 14, 15, 16, 17, 18, 19], hell: [9, 10, 11, 20, 21, 22] },
    realmByType: {
      heaven: { balanced: [6, 8, 19], tank: [14, 15], brutal: [16, 17], evasive: [7, 18] },
      hell: { balanced: [11], tank: [20], brutal: [9, 21], evasive: [10, 22] }
    },
    lowerByType: { balanced: [4], tank: [3, 5], brutal: [1], evasive: [0, 2] },
    DRAGON: 12, DRAGON_BROKEN: 13, HERO: 23,
    get, uri: i => get(i).uri, sprite: i => get(i).sprite || get(i).uri, cells: i => get(i), image,
    kit: { Grid, toCells, dragonData, plateCol: c => c.col, mix }
  };
  root.HuntMon = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
