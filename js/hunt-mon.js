/* =========================================================
   冒險狩獵礦坑：怪物圖（方向 2「暗影眼光」，擁有者 2026-10-08 選定）
   - 瀏覽器：window.HuntMon；node 也能 require（測試用，不碰 DOM）
   - 來源：Claude outputs/斬擊碎裂候選稿_2026-10-08/index.html 的暗影眼光怪物（程式現場畫的像素圖，沒有外部素材）
   - 全身深紫藍剪影，只有上緣和左緣一道亮邊，眼睛發光（偶爾眨一下）。同一個形狀換眼睛顏色就是另一隻，共 6 種變體。
   - 畫成 SVG 的 data URI（用 <img> 顯示，斬擊演出複製畫面時不會多出一堆方塊節點）；cells() 回傳每格顏色，給「怪物崩成碎塊」用
   ========================================================= */
(function (root) {
  "use strict";
  const emptyGrid = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
  const fromRows = (rows, w) => rows.map(r => (r + ".".repeat(w)).slice(0, w).split(""));
  const mirrorG = half => half.map(r => r.concat(r.slice().reverse()));
  function line(g, x0, y0, x1, y1, ch) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx - dy;
    for (;;) { if (g[y0] && x0 >= 0 && x0 < g[0].length) g[y0][x0] = ch; if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; } }
  }
  const padOutline = g => {
    const h = g.length, w = g[0].length, G = emptyGrid(w + 2, h + 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) G[y + 1][x + 1] = g[y][x];
    const filled = (x, y) => G[y] && G[y][x] && G[y][x] !== "." && G[y][x] !== "O";
    const out = G.map(r => r.slice());
    for (let y = 0; y < G.length; y++) for (let x = 0; x < G[0].length; x++)
      if (G[y][x] === "." && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = "O";
    return out;
  };
  function slimeGrid() {
    const W = 24, oy = 6, g = emptyGrid(W, oy + 18);
    const inside = (x, y) => y >= 0 && y <= 17 && Math.pow((x - 11.5) / 12, 2) + Math.pow((y - 17) / 17.5, 2) <= 1;
    for (let y = 0; y < 18; y++) for (let x = 0; x < W; x++) if (inside(x, y)) g[y + oy][x] = "a";
    [[7, 9], [8, 9], [7, 10], [8, 10], [7, 11], [8, 11], [15, 9], [16, 9], [15, 10], [16, 10], [15, 11], [16, 11]].forEach(p => { g[p[1] + oy][p[0]] = "p"; });
    return g.slice(oy - 1);
  }
  const BAT = mirrorG(fromRows([
    "............", "........a...", "........aa..", ".y......aaa.", ".yy....aaaaa", ".yxy...aaaaa", ".yxxy..awwaa", ".yxxxy.awpaa", ".yxxxxyaaaaa",
    ".yxxxxxaaamm", ".yxxxxxaaatm", ".xxxxx.aaaaa", ".xx.xx..aaaa", ".x...x...aaa", "............"], 12));
  const MUSH = mirrorG(fromRows([
    "............", "......aaaaaa", "....aaaaaabb", "...aaaaaaabb", "..aabbaaaaaa", "..aabbaaaaaa", ".aaaaaaaabba", ".aaaaaaaabba", ".aaaaaaaaaaa",
    ".ccccccccccc", "......eeeeee", "......eppeee", "......eppeee", "......eeeeee", "......eeeemm", "......eeeeee", ".....ffffeee", ".....ffff..."], 12));
  const GOLEM = mirrorG(fromRows([
    "............", "......aaaaaa", "....aaabbbbb", "....aabbbaaa", "....aaaaaaaa", "....aaWWaaaa", "....aaWWaaaa", "....aaaaaaaa", "....aaaaammm", "...aaaaaaaaa",
    ".yyaaaaaaaaa", "aaaaaaaabbaa", "aaaa.aaaaaaa", "aaaa.aaaacaa", "aaaa.aaaaaac", "bbaa.aaaaaaa", "aaaa..aaaaaa", "......aaa..."], 12));
  const GHOST = mirrorG(fromRows([
    "............", "......aaaaaa", "....aaaaaaaa", "...aaaaaaaaa", "..aaaaaaaaaa", "..aaaaaaaaaa", "..aaaaaWWaaa", "..aaaaaWWaaa", "..aaaaaWWaaa", "..aaaaaaaaaa",
    "..aaaaaaaaaa", ".aaaaaaaaaaa", ".aaaaaaaaaaa", ".aaaaaaaaaaa", "aaaaaaaaaaaa", "aaa.aaaa.aaa", "aa...aaa...a"], 12));
  function spiderGrid() {
    const half = emptyGrid(12, 17);
    for (let y = 0; y < 17; y++) for (let x = 0; x < 12; x++) if (Math.pow((x - 11.5) / 4.8, 2) + Math.pow((y - 9) / 4.4, 2) <= 1) half[y][x] = "a";
    line(half, 7, 6, 5, 3, "a"); line(half, 5, 3, 2, 2, "a"); line(half, 2, 2, 1, 4, "a");
    line(half, 7, 8, 3, 6, "a"); line(half, 3, 6, 1, 7, "a"); line(half, 1, 7, 0, 10, "a");
    line(half, 7, 10, 3, 10, "a"); line(half, 3, 10, 1, 13, "a");
    line(half, 8, 13, 5, 14, "a"); line(half, 5, 14, 4, 16, "a");
    [[9, 7], [10, 7], [9, 8], [10, 8]].forEach(p => { half[p[1]][p[0]] = "w"; });
    return mirrorG(half);
  }
  const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, k) => { const A = hex2(a), B = hex2(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
  const SIL = eye => ({ body: "#2c2950", rim: "#7771b8", eye, O: "#07070b" });
  /* 順序固定＝config.hunt.monNames 的順序：洞影蝠、影蜘蛛、幽影、影菇、影泥、石影像 */
  const MONS = [
    { g: () => BAT, pal: SIL("#ffe36b") },
    { g: spiderGrid, pal: SIL("#7fe3ff") },
    { g: () => GHOST, pal: SIL("#ff4fd8") },
    { g: () => MUSH, pal: SIL("#55ff55") },
    { g: slimeGrid, pal: SIL("#ff9a1f") },
    { g: () => GOLEM, pal: SIL("#bfe9ff") }
  ];
  const cache = [];
  /* 回傳 { svg, w, h, cell, uri }；cell[y][x]＝該格顏色（沒有就 null） */
  function build(i) {
    const m = MONS[((i % MONS.length) + MONS.length) % MONS.length], pal = m.pal, G = padOutline(m.g()), h = G.length, w = G[0].length;
    const filled = (x, y) => G[y] && G[y][x] && G[y][x] !== "." && G[y][x] !== "O";
    const eyeCh = c => c === "w" || c === "p" || c === "W";
    const cell = Array.from({ length: h }, () => Array(w).fill(null)), eye = Array.from({ length: h }, () => Array(w).fill(false)), eyes = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = G[y][x]; if (c === ".") continue;
      if (c === "O") { cell[y][x] = pal.O; continue; }
      if (eyeCh(c)) { cell[y][x] = pal.eye; eye[y][x] = true; eyes.push([x, y]); continue; }
      cell[y][x] = (!filled(x, y - 1) || !filled(x - 1, y)) ? pal.rim : pal.body;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (eye[y][x] || !cell[y][x] || G[y][x] === "O") continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => eye[y + d[1]] && eye[y + d[1]][x + d[0]])) cell[y][x] = mix(pal.body, pal.eye, .38);
    }
    const rects = pred => {
      let s = "";
      for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < w) { if (!cell[y][x] || !pred(x, y)) { x++; continue; } let n = 1; while (x + n < w && cell[y][x + n] === cell[y][x] && pred(x + n, y)) n++; s += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${cell[y][x]}"/>`; x += n; }
      }
      return s;
    };
    const style = "<style>.eye{animation:b 3s steps(1) infinite}@keyframes b{0%,93%,100%{opacity:1}94%,97%{opacity:0}}</style>";   // 偶爾眨一下
    const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w * 7}" height="${h * 7}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${style}${rects((x, y) => !eye[y][x])}<g class="eye">${rects((x, y) => eye[y][x])}</g></svg>`;
    return { svg, w, h, cell, eyes, eye: pal.eye, uri: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) };
  }
  const get = i => { const k = ((i % MONS.length) + MONS.length) % MONS.length; return cache[k] || (cache[k] = build(k)); };
  const api = { count: MONS.length, get, uri: i => get(i).uri, cells: i => get(i) };
  root.HuntMon = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
