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
  /* ---------- 第二階段（2026-10-08）：駭骨巨龍與狹間新怪物（美編候選稿 第二階段演出候選稿_2026-10-08，擁有者核准；怪物為暫名） ----------
     編號：0～5 下位怪、6～8 天堂（曦羽梟、輝環水母、曦角鹿）、9～11 地獄（焰鬃犬、裂角魔影、熔瞳）、12 駭骨巨龍、13 破鱗後的巨龍（擊殺演出用） */
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
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  /* 網格 → cells：加一圈外框 O，上緣／左緣亮邊，眼睛周圍染一點眼色。k：e 眼睛、a 身體、h 發光部位、m 翼膜、n 孔洞 */
  function toCells(G, pal) {
    const h0 = G.length, w0 = G[0].length, W = w0 + 2, Hh = h0 + 2, P = emptyGrid(W, Hh);
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) P[y + 1][x + 1] = G[y][x];
    const fl = (x, y) => P[y] && P[y][x] && P[y][x] !== "." && P[y][x] !== "O";
    const out = P.map(r => r.slice());
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (P[y][x] === "." && (fl(x - 1, y) || fl(x + 1, y) || fl(x, y - 1) || fl(x, y + 1))) out[y][x] = "O";
    const cells = [], idx = Array.from({ length: Hh }, () => Array(W).fill(-1));
    const eyeAt = (x, y) => out[y] && out[y][x] === "e";
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const c = out[y][x]; if (c === ".") continue;
      let col, k = c;
      if (c === "O") col = pal.O;
      else if (c === "e") col = pal.eye;
      else if (c === "h") col = pal.acc;
      else if (c === "m") col = (!fl(x, y - 1) || !fl(x - 1, y)) ? pal.mrim : pal.mem;
      else if (c === "n") col = pal.hole;
      else { col = (!fl(x, y - 1) || !fl(x - 1, y)) ? pal.rim : pal.body; k = "a"; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => eyeAt(x + d[0], y + d[1]))) col = mix(pal.body, pal.eye, .38); }
      idx[y][x] = cells.length; cells.push({ x, y, col, k });
    }
    return { cells, idx, w: W, h: Hh };
  }
  const PALH = { body: "#35305a", rim: "#f0e2a8", eye: "#fff4c0", O: "#07070b", acc: "#ffe9a8", mem: "#1b1838", mrim: "#3d3a73", hole: "#0f0e22" };
  const PALD = { body: "#2a1322", rim: "#c25040", eye: "#ff4a2a", O: "#07070b", acc: "#ff7a2a", mem: "#1b0a12", mrim: "#5a2020", hole: "#0a0306" };
  function mOwl() { const o = Grid(26, 27); o.elo(12.5, 2, 6, 1.2, "h"); o.el(12.5, 17, 6, 7, "a"); o.el(12.5, 10, 5, 4, "a"); o.mln(9, 7, 8, 4, "a"); o.mln(8, 4, 10, 6, "a"); o.mel(5, 18, 3, 6, "a"); o.mln(3, 23, 2, 26, "a"); o.mrc(10, 9, 2, 2, "e"); o.mrc(9, 24, 2, 2, "a"); o.mset(12, 20, "h"); return o.G; }
  function mJelly() { const o = Grid(26, 28); o.el(12.5, 9, 9, 7, "a"); o.rc(4, 12, 18, 2, "a"); [6, 9, 11].forEach(x => { for (let y = 14; y < 26; y++) o.mset(x + (Math.floor(y / 3) % 2), y, "a"); }); o.mln(8, 0, 9, 2, "h"); o.mln(5, 2, 7, 4, "h"); o.mset(12, 0, "h"); o.mrc(8, 8, 2, 2, "e"); o.mset(6, 11, "h"); return o.G; }
  function mDeer() { const o = Grid(26, 30); o.mln(9, 8, 7, 3, "h"); o.mln(7, 3, 5, 1, "h"); o.mln(8, 6, 5, 5, "h"); o.mln(7, 3, 9, 1, "h"); o.el(12.5, 12, 4, 5, "a"); o.mrc(11, 15, 2, 2, "a"); o.mln(8, 10, 5, 9, "a"); o.mln(5, 9, 7, 12, "a"); o.rc(10, 16, 6, 5, "a"); o.el(12.5, 23, 7, 6, "a"); o.mrc(7, 27, 2, 3, "a"); o.mrc(10, 11, 1, 2, "e"); o.mset(12, 22, "h"); return o.G; }
  function mHound() { const o = Grid(28, 26); o.mln(8, 7, 5, 3, "h"); o.mln(10, 6, 9, 1, "h"); o.mln(6, 10, 2, 8, "h"); o.mln(7, 12, 2, 13, "h"); o.el(13.5, 12, 6, 5, "a"); o.mln(9, 8, 8, 4, "a"); o.mln(8, 4, 11, 7, "a"); o.rc(11, 14, 6, 4, "a"); o.mset(9, 11, "e"); o.mset(10, 10, "e"); o.mset(11, 10, "e"); o.el(13.5, 21, 7, 4, "a"); o.mrc(8, 24, 3, 2, "a"); o.mset(12, 18, "n"); return o.G; }
  function mImp() { const o = Grid(26, 28); o.mln(8, 9, 4, 6, "h"); o.mln(4, 6, 3, 2, "h"); o.mln(3, 2, 6, 1, "h"); o.el(12.5, 12, 6, 5, "a"); o.mset(9, 12, "e"); o.mset(10, 11, "e"); o.mset(11, 11, "e"); o.mrc(10, 16, 6, 1, "n"); o.el(12.5, 21, 5, 5, "a"); o.mln(8, 19, 3, 14, "a"); o.mln(3, 14, 6, 22, "a"); o.ln(17, 24, 22, 26, "a"); o.ln(22, 26, 23, 22, "a"); o.mrc(9, 25, 2, 2, "a"); o.mset(12, 20, "h"); return o.G; }
  function mOrb() { const o = Grid(26, 28); o.el(12.5, 12, 9, 9, "a"); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; o.ln(12.5 + Math.cos(a) * 9.5, 12 + Math.sin(a) * 9.5, 12.5 + Math.cos(a) * 12.5, 12 + Math.sin(a) * 12.5, "a"); } o.el(12.5, 12, 5, 4, "e"); o.rc(12, 9, 2, 6, "n"); o.ln(8, 22, 7, 26, "h"); o.ln(12, 22, 12, 27, "h"); o.ln(17, 22, 18, 26, "h"); return o.G; }
  /* 角色（回合戰鬥畫面左下角；目前核准的暗影眼光風格小劍士剪影，後續可逐一調整）：編號 14 */
  const PALHERO = { body: "#2d4a7a", rim: "#9ec3ff", eye: "#fff4c0", O: "#07070b", acc: "#ffd24a", mem: "#1b1838", mrim: "#3d3a73", hole: "#0f0e22" };
  function mHero() { const o = Grid(14, 20); o.el(6.5, 4, 3.2, 3.2, "a"); o.set(5, 4, "e"); o.set(8, 4, "e"); o.rc(4, 8, 6, 7, "a"); o.rc(4, 8, 6, 1, "h"); o.rc(2, 9, 2, 5, "a"); o.rc(10, 9, 2, 4, "a"); o.rc(4, 15, 2, 5, "a"); o.rc(8, 15, 2, 5, "a"); o.ln(12, 2, 12, 13, "h"); o.set(11, 13, "h"); o.set(13, 13, "h"); return o.G; }
  const REALM_MON = [{ g: mOwl, p: PALH }, { g: mJelly, p: PALH }, { g: mDeer, p: PALH }, { g: mHound, p: PALD }, { g: mImp, p: PALD }, { g: mOrb, p: PALD }];

  /* 駭骨巨龍（骨架、無血肉；暗影眼光配色）。plates＝覆在身上的骨甲磚（破鱗過場一片片碎裂） */
  const DRAGON_PAL = { body: "#2c2950", rim: "#7771b8", eye: "#7fe3ff", O: "#07070b", mem: "#1b1838", mrim: "#3d3a73", acc: "#7771b8", hole: "#0f0e22" };
  let _dr = null;
  function dragonData() {
    if (_dr) return _dr;
    const W = 89, Hh = 80, o = Grid(W, Hh), M = o.M;
    const pts = [[40, 30], [14, 9], [2, 20], [8, 25], [4, 36], [9, 41], [12, 48], [18, 50], [24, 54], [30, 56], [38, 58]];
    const inside = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
    const mp = pts.map(p => [M(p[0]), p[1]]);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (inside(pts, x, y) || inside(mp, x, y)) o.set(x, y, "m");
    o.el(44, 12, 8, 7, "a"); o.mln(37, 8, 32, 3, "a", 2); o.mln(32, 3, 27, 2, "a"); o.mln(27, 2, 24, 5, "a"); o.mln(38, 12, 33, 11, "a"); o.mln(33, 11, 30, 14, "a"); o.mln(36, 15, 31, 18, "a");
    o.el(44, 19, 5, 3, "a"); for (let x = 40; x <= 48; x += 2) { o.set(x, 22, "a"); o.set(x, 23, "a"); }
    o.mrc(39, 10, 3, 2, "e"); o.set(43, 16, "n"); o.set(45, 16, "n");
    for (let y = 24; y <= 31; y++) if (y % 3) o.rc(y >= 28 ? 41 : 42, y, y >= 28 ? 7 : 5, 1, "a");
    for (let y = 32; y <= 66; y++) if (y % 3) o.rc(43, y, 3, 1, "a");
    for (let k = 0; k < 7; k++) { const y = 33 + k * 4, xw = 14 - k; o.mln(42, y, 42 - xw, y + 2, "a"); o.mln(42 - xw, y + 2, 44 - xw, y + 7, "a"); }
    o.mel(36, 32, 5, 3, "a"); o.el(44, 68, 10, 3, "a");
    o.mln(37, 34, 34, 46, "a", 2); o.mln(34, 46, 33, 56, "a"); o.mln(33, 56, 29, 61, "a"); o.mln(33, 57, 31, 62, "a");
    o.mln(36, 69, 33, 74, "a", 2); o.mln(33, 74, 31, 78, "a"); o.mln(31, 78, 28, 79, "a"); o.mln(31, 78, 31, 79, "a");
    o.ln(44, 70, 46, 76, "a", 2); o.ln(46, 76, 52, 79, "a"); o.ln(52, 79, 58, 77, "a"); o.ln(58, 77, 62, 72, "a");
    o.mln(40, 30, 28, 18, "a", 2); o.mln(28, 18, 14, 9, "a", 2); o.mln(14, 9, 10, 3, "a");
    [[2, 20], [4, 36], [12, 48], [24, 54]].forEach(p => o.mln(14, 9, p[0], p[1], "a"));
    const C = toCells(o.G, DRAGON_PAL), plates = [];
    for (let r = 0, by = 3; by < 68; by += 4, r++) for (let bx = (r % 2 ? -2 : 0); bx < W; bx += 5) {
      const ids = [];
      for (let y = by; y < by + 4; y++) for (let x = Math.max(0, bx); x < bx + 5 && x < W; x++) { const i = C.idx[y + 1][x + 1]; if (i >= 0 && C.cells[i].k === "a") ids.push(i); }
      if (ids.length >= 11) { plates.push({ ids, by, bx, d: Math.hypot(bx + 2 - 44, by + 2 - 40) }); ids.forEach(i => { C.cells[i].plate = plates.length - 1; }); }
    }
    C.cells.forEach(c => { c.d = Math.hypot(c.x - 1 - 44, c.y - 1 - 40); });
    return (_dr = { C, plates, W, Hh });
  }
  const plateCol = (c, p) => { const y = c.y - 1; return y === p.by ? "#9a94e0" : (y === p.by + 3 ? "#34305f" : "#4a4684"); };
  /* 把 cells（含 k／col）畫成和下位怪同格式的圖。eyeCol＝眼睛顏色 */
  function fromCells(C, colorOf, eyeCol) {
    const w = C.w, h = C.h, cell = Array.from({ length: h }, () => Array(w).fill(null)), eye = Array.from({ length: h }, () => Array(w).fill(false)), eyes = [];
    C.cells.forEach(c => { if (c.k === "e") { cell[c.y][c.x] = eyeCol; eye[c.y][c.x] = true; eyes.push([c.x, c.y]); } else cell[c.y][c.x] = colorOf(c); });
    const rects = pred => {
      let s = "";
      for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < w) { if (!cell[y][x] || !pred(x, y)) { x++; continue; } let n = 1; while (x + n < w && cell[y][x + n] === cell[y][x] && pred(x + n, y)) n++; s += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${cell[y][x]}"/>`; x += n; }
      }
      return s;
    };
    const style = "<style>.eye{animation:b 3s steps(1) infinite}@keyframes b{0%,93%,100%{opacity:1}94%,97%{opacity:0}}</style>";
    const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w * 7}" height="${h * 7}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${style}${rects((x, y) => !eye[y][x])}<g class="eye">${rects((x, y) => eye[y][x])}</g></svg>`;
    return { svg, w, h, cell, eyes, eye: eyeCol, uri: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) };
  }
  function buildX(k) {
    if (k <= 11) { const m = REALM_MON[k - 6]; return fromCells(toCells(m.g(), m.p), c => c.col, m.p.eye); }
    if (k === 14) return fromCells(toCells(mHero(), PALHERO), c => c.col, PALHERO.eye);
    const D = dragonData();
    if (k === 12) return fromCells(D.C, c => (c.plate != null ? plateCol(c, D.plates[c.plate]) : c.col), "#7fe3ff");
    return fromCells(D.C, c => mix(c.col, "#7fe3ff", c.k === "a" ? .25 * clamp01(1 - c.d / 60) : 0), "#ff4f6a");   // 13：破鱗後（骨甲碎裂、骨髓光、赤眼）
  }
  const TOTAL = 15;
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
  const get = i => { const k = ((i % TOTAL) + TOTAL) % TOTAL; return cache[k] || (cache[k] = k < MONS.length ? build(k) : buildX(k)); };
  const api = { count: MONS.length, total: TOTAL, realm: { heaven: [6, 7, 8], hell: [9, 10, 11] }, DRAGON: 12, DRAGON_BROKEN: 13, HERO: 14, get, uri: i => get(i).uri, cells: i => get(i), kit: { Grid, toCells, dragonData, plateCol, mix } };
  root.HuntMon = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
