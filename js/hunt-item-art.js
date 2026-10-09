/* =========================================================
   轉生之間 3C：道具像素圖示、品質邊框、能力圖示、旅途道具演出場景（純畫面，無任何抽選與數值）
   - 來源：美編候選稿「第三階段候選稿_2026-10-08」（擁有者 2026-10-09 核准）；全部程式現場畫，沒有外部素材
   - 瀏覽器：window.HuntItemArt。畫面層在 js/hunt-ui.js（時間軸、文字、按鈕）；這裡只負責「某個時間 t 該畫什麼」
   - 圖示 16x16 格；品質邊框 28x28 格：普通 1 道灰、良好 2 道青綠、珍貴 3 道金，完全靜止、不閃
   - 場景是 130x110 小畫布（HuntItemArt.Stage），每個畫面都是時間 t（毫秒）的純函式，所以暫停、重播、重新整理都一致
   - 兩個木箱：待選畫面與選後 0～1240 毫秒完全不依賴「有沒有道具」，開箱前逐格相同（tools 以 sameTest 驗證過）
   ========================================================= */
(function (root) {
  "use strict";
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ssub = (t, a, b) => clamp((t - a) / (b - a));
  const eo = x => 1 - Math.pow(1 - x, 3);
  function Hh(n) { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const rn = (i, s = 0) => Hh(i * 131 + s * 7919 + 17);   // 固定雜湊（只拿來擺碎石與乾草的位置，不是遊戲亂數）

  /* ---------- 16x16 圖示（幾何指令畫，再自動描邊） ---------- */
  const PAL = { k: "#0e0e12", w: "#f4f4f4", g: "#9a9aa5", G: "#5a5a64", s: "#c9d3e6", S: "#8d9bb8", d: "#55627f", n: "#262e44", N: "#3c4660", b: "#c29a5e", B: "#7a4e2a", t: "#8fe9ff", T: "#3a9ab8", y: "#ffe066", Y: "#d79a1c", D: "#8a5a10", o: "#ff9a1f", r: "#d9482a", c: "#2b2b31" };
  const newGrid = () => Array.from({ length: 16 }, () => Array(16).fill(null));
  const put = (m, x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) m[y][x] = c === null ? null : (PAL[c] || c); };
  const rectg = (m, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(m, x + i, y + j, c); };
  const discg = (m, cx, cy, r, c) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x + .5 - cx, y + .5 - cy) <= r) put(m, x, y, c); };
  function polyg(m, pts, c) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const px_ = x + .5, py_ = y + .5; let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py_) !== (yj > py_) && px_ < (xj - xi) * (py_ - yi) / (yj - yi) + xi) ins = !ins; } if (ins) put(m, x, y, c); } }
  function lineg(m, x0, y0, x1, y1, c) { const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx - dy; for (;;) { put(m, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; } } }
  function outline(m) { const add = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!m[y][x]) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 16 && b >= 0 && b < 16 && m[b][a] && m[b][a] !== PAL.k) { add.push([x, y]); break; } } } add.forEach(([x, y]) => m[y][x] = PAL.k); }

  /* 遊戲內的道具 id（js/config.js hunt.items）→ 圖樣 */
  const ART = { "whetstone": "whet", "scale-wedge": "wedge", "guide-bell": "bell", "twin-hunt": "twin", "twin-realm": "compass", "star-ember": "spark" };
  const ICON_FN = {
    whet(m) {   // 研鋒石：磨刀石
      rectg(m, 2, 9, 9, 4, "d"); polyg(m, [[11, 9], [14, 6], [14, 10], [11, 13]], "N"); polyg(m, [[2, 9], [5, 6], [14, 6], [11, 9]], "S");
      rectg(m, 2, 9, 9, 1, "s");
      lineg(m, 6, 8, 10, 7, "d"); lineg(m, 5, 8, 8, 7, "g");
      put(m, 11, 7, "w"); put(m, 10, 7, "w"); put(m, 11, 6, "w"); put(m, 12, 7, "w"); put(m, 11, 8, "w");   // 一點反光（固定，不閃）
      rectg(m, 3, 11, 6, 1, "N");
    },
    wedge(m) {  // 破鱗楔：楔進鱗片的鐵楔
      polyg(m, [[4, 2], [12, 2], [8, 14]], "S"); polyg(m, [[4, 2], [8, 2], [8, 14]], "s"); polyg(m, [[8, 2], [12, 2], [8, 14]], "d");
      rectg(m, 4, 2, 9, 1, "w"); lineg(m, 8, 3, 8, 9, "n");
      polyg(m, [[1, 9], [3, 8], [5, 9], [5, 12], [3, 13], [1, 12]], "T"); put(m, 2, 9, "t"); put(m, 3, 9, "t"); put(m, 2, 10, "t");
      polyg(m, [[11, 9], [13, 8], [15, 9], [15, 12], [13, 13], [11, 12]], "T"); put(m, 12, 9, "t"); put(m, 13, 9, "t"); put(m, 12, 10, "t");
      lineg(m, 4, 10, 5, 12, "k"); lineg(m, 11, 10, 12, 12, "k");
    },
    bell(m) {   // 引路鈴：小黃銅鈴
      discg(m, 8, 3, 2.2, "Y"); put(m, 8, 3, null); put(m, 7, 3, null); put(m, 7, 2, "Y");
      polyg(m, [[6, 5], [10, 5], [13, 12], [3, 12]], "y");
      for (let y = 5; y < 13; y++) for (let x = 0; x < 16; x++) if (m[y][x] === PAL.y && x >= 9) m[y][x] = PAL.Y;
      rectg(m, 2, 12, 12, 1, "Y"); rectg(m, 3, 12, 4, 1, "y"); lineg(m, 6, 6, 5, 10, "w");
      discg(m, 8, 13.8, 1.2, "D"); put(m, 8, 14, "D");
    },
    twin(m) {   // 雙獵護符：左皮革、右青鱗，兩半合一
      lineg(m, 5, 1, 7, 5, "B"); lineg(m, 11, 1, 9, 5, "B"); rectg(m, 6, 1, 5, 1, "B");
      discg(m, 8, 10, 5, "y");
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x + .5 - 8, y + .5 - 10) <= 4) put(m, x, y, x < 8 ? "b" : "T");
      lineg(m, 8, 6, 8, 14, "D"); put(m, 8, 5, "Y");
      put(m, 5, 8, "B"); put(m, 6, 9, "B"); put(m, 5, 10, "B"); put(m, 6, 11, "B"); put(m, 5, 9, "B");
      put(m, 10, 8, "t"); put(m, 11, 9, "t"); put(m, 10, 10, "t"); put(m, 11, 8, "t"); put(m, 10, 12, "t");
    },
    compass(m) { // 雙界羅盤：一端金白、一端餘燼橘
      rectg(m, 7, 1, 2, 1, "y"); discg(m, 8, 8, 6.3, "Y"); discg(m, 8, 8, 5, "n");
      put(m, 8, 4, "w"); put(m, 8, 12, "g"); put(m, 12, 8, "g"); put(m, 4, 8, "g");
      for (let k = 0; k < 5; k++) { put(m, 8 + k, 8 - k, "y"); put(m, 9 + k, 8 - k, "w"); put(m, 7 - k, 8 + k, "r"); put(m, 8 - k, 8 + k, "o"); }
      put(m, 8, 8, "w"); put(m, 7, 8, "w"); put(m, 8, 7, "w"); put(m, 7, 7, "g");
      put(m, 4, 4, "y"); put(m, 5, 3, "y"); put(m, 3, 5, "y");
    },
    spark(m) {  // 星火徽記：金邊盾徽＋四芒火花（刻意不用五芒星）
      polyg(m, [[3, 2], [13, 2], [13, 9], [8, 14], [3, 9]], "Y");
      polyg(m, [[4, 3], [12, 3], [12, 8.5], [8, 12.5], [4, 8.5]], "n");
      rectg(m, 3, 2, 10, 1, "y"); lineg(m, 3, 3, 3, 8, "y");
      lineg(m, 8, 4, 8, 10, "y"); lineg(m, 5, 7, 11, 7, "y");
      put(m, 6, 5, "o"); put(m, 10, 5, "o"); put(m, 6, 9, "o"); put(m, 10, 9, "o");
      rectg(m, 7, 6, 3, 3, "w"); put(m, 8, 4, "w"); put(m, 8, 10, "w"); put(m, 5, 7, "w"); put(m, 11, 7, "w");
    }
  };
  const ATTR_ICON = {   // 三項能力：獵手本能（準星）、破鱗技巧（裂開的鱗片）、遠行意志（雙箭頭）
    hunt(m) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x + .5 - 8, y + .5 - 8); if (d > 3.6 && d <= 5.6) put(m, x, y, "y"); }
      [[8, 1], [8, 2], [8, 14], [8, 13], [1, 8], [2, 8], [14, 8], [13, 8]].forEach(([x, y]) => put(m, x, y, "w")); put(m, 8, 8, "o"); put(m, 7, 8, "o"); put(m, 8, 7, "o"); put(m, 7, 7, "o"); },
    dragon(m) { polyg(m, [[8, 2], [13, 5], [13, 11], [8, 14], [3, 11], [3, 5]], "T"); polyg(m, [[8, 3], [8, 13], [4, 10.5], [4, 5.5]], "t");
      [[8, 2], [8, 3], [7, 5], [7, 6], [9, 7], [9, 8], [7, 9], [7, 10], [8, 11], [8, 12], [8, 13]].forEach(([x, y]) => put(m, x, y, "k")); },
    hp(m) { discg(m, 5.5, 6, 3.2, "r"); discg(m, 10.5, 6, 3.2, "r"); polyg(m, [[2.4, 6.6], [13.6, 6.6], [8, 13.5]], "r");   // 新流程：血量（愛心）
      put(m, 4, 4, "w"); put(m, 5, 4, "w"); put(m, 4, 5, "w"); },
    atk(m) { lineg(m, 12, 2, 5, 9, "s"); lineg(m, 13, 2, 6, 9, "s"); lineg(m, 13, 3, 6, 10, "S"); put(m, 13, 1, "w");   // 戰力（劍）
      lineg(m, 3, 8, 7, 12, "Y"); lineg(m, 4, 8, 8, 12, "y"); lineg(m, 5, 11, 2, 14, "B"); lineg(m, 4, 11, 2, 13, "b"); },
    luck(m) { discg(m, 5.5, 5.5, 2.6, "#4fbf5a"); discg(m, 10.5, 5.5, 2.6, "#4fbf5a"); discg(m, 5.5, 10.5, 2.6, "#4fbf5a"); discg(m, 10.5, 10.5, 2.6, "#4fbf5a");   // 幸運（四葉草）
      discg(m, 8, 8, 1.6, "#2f8a3a"); lineg(m, 9, 9, 13, 14, "#2f8a3a"); put(m, 5, 4, "w"); put(m, 10, 4, "w"); },
    realm(m) { for (let k = 0; k < 2; k++) { const ox = 3 + k * 5; lineg(m, ox, 3, ox + 5, 8, k ? "o" : "y"); lineg(m, ox, 13, ox + 5, 8, k ? "o" : "y"); lineg(m, ox + 1, 3, ox + 6, 8, k ? "o" : "y"); lineg(m, ox + 1, 13, ox + 6, 8, k ? "o" : "y"); } }
  };
  const _ic = {};
  function iconGrid(key) { if (!_ic[key]) { const m = newGrid(); (ICON_FN[key] || ATTR_ICON[key])(m); outline(m); _ic[key] = m; } return _ic[key]; }
  const keyOf = id => ART[id] || (ATTR_ICON[id] ? id : "");

  /* 品質邊框：1/2/3 道（由內往外加），固定顏色。q＝1 普通、2 良好、3 珍貴；總格 28x28，圖示在中央 */
  const QC = ["", "#9a9aa5", "#5fd0b0", "#ffcc33"];
  const QUALITY = { common: 1, good: 2, rare: 3 };
  function framePx(q) {
    const f = Array.from({ length: 28 }, () => Array(28).fill(null)), col = QC[q] || QC[1];
    const inset = [4, 2, 0].slice(3 - (q || 1)), outer = inset[inset.length - 1];
    for (let y = outer; y < 28 - outer; y++) for (let x = outer; x < 28 - outer; x++) { const edge = (x === outer || x === 27 - outer) && (y === outer || y === 27 - outer); if (!edge) f[y][x] = "#101015"; }
    inset.forEach(i => { for (let k = i + 1; k <= 26 - i; k++) { f[i][k] = col; f[27 - i][k] = col; f[k][i] = col; f[k][27 - i] = col; } });
    return f;
  }
  function drawItem(ctx, id, ox, oy, s, framed, q) {   // framed：28x28 格；否則只畫 16x16
    const m = iconGrid(keyOf(id)); let off = 0;
    if (framed) { const f = framePx(q || 1); for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) if (f[y][x]) { ctx.fillStyle = f[y][x]; ctx.fillRect(ox + x * s, oy + y * s, s, s); } off = 6; }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (m[y][x]) { ctx.fillStyle = m[y][x]; ctx.fillRect(ox + (x + off) * s, oy + (y + off) * s, s, s); }
  }
  const _uri = {};
  /* 圖示轉成 data URL（img 用，快取）。framed＝含品質邊框；道具要給 q，能力圖示不給 */
  function uri(id, s, framed, q) {
    const key = id + "|" + s + "|" + (framed ? q || 1 : 0);
    if (_uri[key]) return _uri[key];
    if (!keyOf(id) || typeof document === "undefined") return "";
    const n = framed ? 28 : 16, c = document.createElement("canvas"); c.width = c.height = n * s;
    drawItem(c.getContext("2d"), id, 0, 0, s, !!framed, q);
    return (_uri[key] = c.toDataURL());
  }

  /* 行囊鈕裡「沒有道具」的空格（28x28 格，暗色小方框） */
  function slot() {
    if (_uri.slot || typeof document === "undefined") return _uri.slot || "";
    const c = document.createElement("canvas"); c.width = c.height = 28; const x = c.getContext("2d");
    x.fillStyle = "#5a5a64"; x.fillRect(6, 6, 16, 16); x.fillStyle = "#1b1b20"; x.fillRect(7, 7, 14, 14);
    return (_uri.slot = c.toDataURL());
  }

  /* ---------- 場景畫布（130x110 格） ---------- */
  const AW = 130, AH = 110;
  const SP = { k: "#0e0e12", t: "#9eeeff", u: "#5fc3dc", e: "#14202a" };
  const SPR = ["..kkkk..", ".kttttk.", "kttttttk", "ktettetk", "kttttttk", ".kuuuuk.", "..kuuk..", "...kk..."];   // 小精靈（沿用候選稿的圓形淡青，和 HUD「小精靈」同色）
  const K = "#0e0e12", WD = "#a8693a", WL = "#c98c52", WB = "#6e4524", IR = "#6b7794", IRL = "#98a4c0", GD = "#ffcc33", IN = "#150f12";
  const CY = 52, CXL = 14, CXR = 90, CXC = 52;   // 木箱的 y 與 x（左／右／置中）

  /* 畫布包裝：Stage(canvas).draw("direct"|"chest"|"idle", t, P, reduced)。
     P：direct → { item }；chest → { pick: "left"|"right"|null, res: "item"|"empty", item }（res 與 item 只在 1250 毫秒之後才會影響畫面） */
  function Stage(canvas) {
    canvas.width = AW; canvas.height = AH;
    const g0 = canvas.getContext("2d"), off = document.createElement("canvas"); off.width = AW; off.height = AH;
    const og = off.getContext("2d"); let g = g0, RED = false;
    const px = (x, y, w, h, c, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.fillRect(Math.floor(x), Math.floor(y), w, h); g.globalAlpha = 1; };
    const withAlpha = (a, fn) => { a = Math.round(clamp(a) * 5) / 5; if (a <= 0) return; if (a >= 1) { fn(); return; } og.clearRect(0, 0, AW, AH); g = og; fn(); g = g0; g0.globalAlpha = a; g0.drawImage(off, 0, 0); g0.globalAlpha = 1; };
    const spr = (rows, pal, x, y) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(x + i, y + j, 1, 1, c); } });
    const iconG = (id, x, y, s) => { const m = iconGrid(keyOf(id)); for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (m[j][i]) { g.fillStyle = m[j][i]; g.fillRect(Math.floor(x) + i * s, Math.floor(y) + j * s, s, s); } };
    const spirit = (x, y) => { spr(SPR, SP, Math.floor(x), Math.floor(y)); px(x + 2, y + 9, 4, 1, "#0b0a0e", .6); };
    const bobOf = t => (RED ? 0 : Math.floor(t / 450) % 2);

    function bg() {
      px(0, 0, AW, AH, "#14121a");
      for (let cx = 0; cx < AW; cx += 9) { const h = 30 + Math.floor(rn(cx) * 14); px(cx, 0, 9, h, (cx / 9) % 2 ? "#1d1824" : "#211b29"); px(cx, h - 1, 9, 1, "#2b2335"); }
      px(0, 44, AW, 2, "#0e0c12"); px(0, 46, AW, AH - 46, "#1e1921");
      for (let y = 52; y < AH; y += 9) px(0, y, AW, 1, "#251f28");
      for (let y = 46; y < AH; y++) { const hw = 26 + (y - 46) * 1.1, x0 = Math.floor(65 - hw), x1 = Math.floor(65 + hw); px(x0, y, x1 - x0, 1, y % 9 === 0 ? "#352b3a" : "#2d2533"); px(x0, y, 1, 1, "#3d3244"); px(x1 - 1, y, 1, 1, "#3d3244"); }
      for (let i = 0; i < 18; i++) px(Math.floor(rn(i, 3) * AW), 48 + Math.floor(rn(i, 5) * 60), 2, 1, "#463b4f");
      [[10, 18], [44, 12], [88, 20], [118, 10]].forEach(([x, y]) => { px(x, y, 1, 3, "#2f7f95"); px(x - 1, y + 1, 3, 1, "#2f7f95"); px(x, y + 1, 1, 1, "#8fe9ff"); });
    }
    /* 木箱：26 寬。lv 0 關、1～2 掀蓋中（只見暗縫）、3 全開。inner 在內部與前壁之間繪製（內容物從箱口浮出） */
    function chest(x, y, lv, inner) {
      const by = y + 8;
      if (lv >= 3) {
        px(x + 1, y - 6, 24, 1, K); px(x, y - 5, 26, 7, K); px(x + 1, y - 5, 24, 6, WB); px(x + 4, y - 5, 3, 6, "#4a5470"); px(x + 20, y - 5, 3, 6, "#4a5470");
        px(x, y + 2, 26, 6, K); px(x + 1, y + 2, 24, 6, IN);
      } else if (lv === 2) { px(x, y + 2, 26, 6, K); px(x + 1, y + 2, 24, 6, IN); }
      else if (lv === 1) { px(x, y + 6, 26, 2, K); px(x + 1, y + 6, 24, 2, IN); }
      if (inner) inner(by);
      px(x, by, 26, 11, K); px(x + 1, by + 1, 24, 9, WD); px(x + 1, by + 1, 24, 1, WL);
      for (let i = 8; i < 24; i += 8) px(x + i, by + 2, 1, 8, WB);
      px(x + 3, by + 1, 3, 9, IR); px(x + 3, by + 1, 1, 9, IRL); px(x + 20, by + 1, 3, 9, IR); px(x + 20, by + 1, 1, 9, IRL);
      px(x + 11, by, 4, 5, K); px(x + 12, by + 1, 2, 3, GD); px(x + 13, by + 2, 1, 1, K);
      if (lv <= 2) {
        const ly = [y, y - 2, y - 4][lv], lh = lv === 2 ? 6 : 8;
        px(x + 1, ly, 24, 1, K); px(x, ly + 1, 26, lh - 1, K); px(x + 1, ly + 1, 24, lh - 2, WD); px(x + 2, ly + 1, 22, 1, WL);
        for (let i = 8; i < 24; i += 8) px(x + i, ly + 2, 1, lh - 3, WB);
        px(x + 3, ly + 1, 3, lh - 2, IR); px(x + 3, ly + 1, 1, lh - 2, IRL); px(x + 20, ly + 1, 3, lh - 2, IR); px(x + 20, ly + 1, 1, lh - 2, IRL);
        if (lv === 0) { px(x + 11, ly + 4, 4, 4, K); px(x + 12, ly + 5, 2, 2, GD); }
      }
      px(x + 1, y + 19, 24, 2, "#0b0a0e", .55);
    }
    const chestPos = (P, t, side) => { const base = side === "left" ? CXL : CXR; return P.pick === side ? Math.round(base + (CXC - base) * eo(ssub(t, 300, 800))) : base; };
    const chestLv = t => (t < 800 ? 0 : t < 950 ? 1 : t < 1100 ? 2 : 3);

    const SCENES = {
      idle() { chest(CXL, CY, 0); chest(CXR, CY, 0); spirit(61, 62); },   // 待選：兩個完全一樣、靜止
      direct(t, P) {
        const sx = Math.floor(22 + 14 * eo(ssub(t, 250, 650))), crouch = t > 650 && t < 950 ? 1 : 0, bob = t > 1000 ? bobOf(t) : 0;
        const rise = RED ? 1 : eo(ssub(t, 800, 1300)), ia = ssub(t, 800, RED ? 1000 : 1050);
        if (t >= 800) withAlpha(ia, () => iconG(P.item, 49, RED ? 38 : 72 - rise * 34, 2));   // 物品從碎石下升起（先畫，碎石蓋在上面）
        const spread = eo(ssub(t, 650, 950)) * 4;
        [[60, 71, -1], [66, 72, 1], [63, 73, 0], [70, 71, 1], [58, 73, -1]].forEach(([x, y, d], i) => { const mv = Math.round(spread * d * (i % 2 ? 1.2 : 1)); px(x + mv, y, 5, 3, "#4d4256"); px(x + mv, y, 5, 1, "#6a5c76"); px(x + mv, y + 2, 5, 1, "#352c3c"); });
        spirit(sx, 58 + crouch + bob);
        if (!RED && t > 900 && t < 1500) { const k = ssub(t, 900, 1500); for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283, r = 3 + k * 9; px(65 + Math.cos(an) * r * 1.5, 75 + Math.sin(an) * r * .5, 1, 1, "#7d7088", 1 - k); } }   // 一圈很淡的灰塵（減少特效時沒有）
      },
      chest(t, P) {
        const other = P.pick === "left" ? "right" : "left", ox = chestPos(P, t, other), cx = chestPos(P, t, P.pick);
        withAlpha(1 - ssub(t, 200, 800), () => chest(ox, CY, 0));   // 未選的箱子：線性淡出，不開、不抖、不發光
        spirit(61, 62 + Math.round(16 * eo(ssub(t, 200, 800))) + (RED ? 0 : Math.floor(t / 450) % 2));
        chest(cx, CY, chestLv(t), by => {
          if (t < 1250) return;   // 1250 之前，有道具與空箱的畫面逐格相同
          const mid = cx + 5;
          if (P.res === "item") { const k = RED ? 1 : eo(ssub(t, 1250, 1850)), a = ssub(t, 1250, RED ? 1450 : 1300); withAlpha(a, () => iconG(P.item, mid, by - k * 30, 1)); }
          else { const a = ssub(t, 1250, 1450); withAlpha(a, () => { for (let i = 0; i < 7; i++) { const h = 2 + Math.floor(rn(i, 9) * 3), xx = cx + 3 + i * 3.4; px(xx, by - h, 1, h + 1, i % 2 ? "#c9b36a" : "#a08a45"); px(xx + 1, by - h + 1, 1, 1, "#d8c680"); } }); }
        });
      }
    };
    return { draw(kind, t, P, reduced) { RED = !!reduced; g = g0; bg(); SCENES[kind](t, P || {}); } };
  }

  root.HuntItemArt = { ART, QUALITY, QC, uri, slot, Stage };
  if (typeof module !== "undefined") module.exports = root.HuntItemArt;
})(typeof window !== "undefined" ? window : globalThis);
