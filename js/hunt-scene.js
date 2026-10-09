/* =========================================================
   冒險狩獵礦坑第二階段：全螢幕像素演出（駭骨巨龍登場／破鱗、天堂／地獄判定、輪迴的餘燼點燃、轉生狹間每隻之間的 5 種場景）
   - 瀏覽器：window.HuntScene。只做畫面，不碰存檔；演出播完呼叫 onDone，呼叫端才往下一步走（和 hunt-fx.js 同一套規矩）
   - 來源：Claude outputs/第二階段演出候選稿_2026-10-08/（擁有者 2026-10-08 核准）。每個演出都是「時間 t（毫秒）的純函式」，畫在 98×211 的小畫布（每格放大 4 倍，不抗鋸齒），文字另畫在 780×1688 的疊字畫布
   - 長度＝設定檔 config.hunt.fx 的毫秒數；和候選稿原長不同時整段等比例伸縮（例如餘燼成功後的短版判定）。減少特效：長度 ×0.85、不抖動、粒子減半
   - 閃光規則：沒有全螢幕白閃（天堂的光逐步鋪開、地獄的焰逐步漫上；點燃一路穩定變亮，成敗只在最後 1.5 秒分開）。判定為單向推進，不來回、沒有差一點
   - 巨龍使用 js/hunt-mon-art.js 的 v2 四格預繪 PNG；每幀只移動圖片層，不重畫數千格
   ========================================================= */
(function (root) {
  "use strict";
  const AW = 98, AH = 211;
  const NATIVE = { intro: 3000, brk: 2500, heaven: 6000, hell: 8000, ember: 8000, tunnel: 2400, buddy: 2400, glyph: 2200, roar: 2000, fx: 2600, collapse: 2600, wake: 3400 };
  const RED_MS = { collapse: 2600, wake: 1700 };
  let L = null, A = null, g = null, X = null, tx = null, D = null, DI = null, CAP = null, RED = false, S = null, TX = {}, TR = { realm: "heaven", res: "cont", line: "", gold: 0, ok: true };
  const kit = () => root.HuntMon.kit;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ssub = (t, a, b) => clamp((t - a) / (b - a));
  const eo = x => 1 - Math.pow(1 - x, 3), ei = x => x * x * x, sm = x => x * x * (3 - 2 * x);
  const lerp = (a, b, k) => a + (b - a) * k;
  function Hs(n) { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const rn = (i, s = 0) => Hs(i * 131 + s * 7919 + 17);
  const h2 = h => h[0] === "r" ? h.match(/\d+/g).map(Number) : [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb = a => "rgb(" + a[0] + "," + a[1] + "," + a[2] + ")";
  const mixA = (a, b, k) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k));
  const mix = (a, b, k) => rgb(mixA(h2(a), h2(b), clamp(k)));
  function px(x, y, w, h, c, a = 1) { g.globalAlpha = a; g.fillStyle = c; g.fillRect(Math.floor(x), Math.floor(y), w, h); }
  function disc(cx, cy, r, c, a = 1) { g.globalAlpha = a; g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(Math.floor(cx - w), Math.floor(cy + dy), 2 * w + 1, 1); } }
  function glow(cx, cy, r, c, a = 1) { [1, .75, .5, .3].forEach(k => disc(cx, cy, Math.max(1, Math.round(r * k)), c, a * .2)); }
  function ring(cx, cy, r, c, a = 1, th = 1, dash = 0, rot = 0) { g.globalAlpha = a; g.fillStyle = c; const n = Math.ceil(r * 7); for (let i = 0; i < n; i++) { if (dash && Math.floor(i / dash) % 2) continue; const an = rot + i / n * Math.PI * 2; g.fillRect(Math.floor(cx + Math.cos(an) * r), Math.floor(cy + Math.sin(an) * r), th, th); } }
  function line(x0, y0, x1, y1, c, a = 1) { g.globalAlpha = a; g.fillStyle = c; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); }
  function bands(cols, y0 = 0, y1 = AH) {
    const n = cols.length, h = (y1 - y0) / n;
    for (let i = 0; i < n; i++) px(0, y0 + i * h, AW, Math.ceil(h) + 1, cols[i]);
    for (let i = 1; i < n; i++) { const y = Math.floor(y0 + i * h); for (let x = 0; x < AW; x += 2) px(x, y - 1, 1, 1, cols[i]); for (let x = 1; x < AW; x += 2) px(x, y, 1, 1, cols[i - 1]); }
  }
  /* 文字（邏輯座標 390x844；像素風陰影＝偏移複製） */
  function T(s, x, y, size, col, o = {}) {
    tx.save(); const a0 = o.a == null ? 1 : o.a; tx.globalAlpha = a0; tx.font = size + "px " + (S ? S.font : "monospace"); tx.textAlign = o.align || "center"; tx.textBaseline = "middle";
    if (tx.letterSpacing !== undefined) tx.letterSpacing = (o.ls || 0) + "px";
    if (o.glow) { tx.fillStyle = o.glow; tx.globalAlpha = a0 * .35; for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) tx.fillText(s, x + dx, y + dy); tx.globalAlpha = a0; }
    tx.fillStyle = o.sh || "#000"; tx.fillText(s, x + 2, y + 2); tx.fillStyle = col; tx.fillText(s, x, y); tx.restore();
  }
  function slam(s, u, yF, size, col, o = {}) {      // 從上方壓入、小彈一下後定格
    if (u < 0) return; const f = ssub(u, 0, 150); let y = yF - 320 * (1 - ei(f));
    if (u > 150 && u < 300) y -= 7 * Math.sin(Math.PI * (u - 150) / 150);
    T(s, 195, y, size, col, Object.assign({ ls: 6 }, o));
  }
  function shakeAt(t, a, b, amp) { if (RED || t < a || t > b) return [0, 0]; const i = Math.floor(t / 40); return [Math.round((rn(i, 1) - .5) * 2 * amp) * 4, Math.round((rn(i, 2) - .5) * 2 * amp) * 4]; }
  function begin() { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, AW, AH); tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, 780, 1688); tx.setTransform(2, 0, 0, 2, 0, 0); A.style.transform = ""; if (D) { D.style.display = "none"; D.querySelectorAll("i").forEach(e => e.style.display = "none"); } }
  const NP = n => RED ? Math.ceil(n / 2) : n;     // 減少特效：粒子減半
  function vig(a) { for (let i = 0; i < 6; i++) { const w = 6 - i; px(0, 0, w, AH, "#000", a * .16); px(AW - w, 0, w, AH, "#000", a * .16); px(0, 0, AW, w * 2, "#000", a * .16); px(0, AH - w * 2, AW, w * 2, "#000", a * .16); } }
  const fadeTxt = (s, t, a, b, y, size, col, o = {}) => { const al = Math.min(ssub(t, a, a + 250), 1 - ssub(t, b - 250, b)); if (al > 0) T(s, 195, y, size, col, Object.assign({ a: al }, o)); };
  function blit(ctx, C, x0, y0, o = {}) { ctx.globalAlpha = 1; for (const c of C.cells) { ctx.fillStyle = (c.k === "e" && o.noEye) ? (o.body || "#2c2950") : c.col; ctx.fillRect(x0 + c.x, y0 + c.y, 1, 1); } }

  /* ===== 駭骨巨龍 ===== */
  /* o: asm＝登場進行毫秒；brk＝破鱗進行毫秒。圖片固定以 128×108 的 2 倍顯示。 */
  function drawDragon(o) {
    if (!D || !DI) return;
    const broken = o.brk != null && o.brk >= 900, v = broken ? root.HuntMon.DRAGON_BROKEN : root.HuntMon.DRAGON;
    const src = root.HuntMon.sprite(v); if (DI.getAttribute("src") !== src) DI.setAttribute("src", src);
    D.style.display = "block"; D.classList.toggle("reduced", RED);
    let alpha = 1, y = 0, scale = 1;
    if (o.asm != null) { const p = eo(ssub(o.asm, 350, 1550)); alpha = p; y = Math.round((1 - p) * 150); scale = .72 + .28 * p; }
    D.style.opacity = alpha; D.style.transform = `translateY(${y}px) scale(${scale})`;
    if (o.brk != null) D.querySelectorAll("i").forEach((e, i) => {
      const q = ssub(o.brk, 650 + i * 55, 1450 + i * 55); if (q <= 0 || q >= 1) return;
      const a = (i / 8) * Math.PI * 2 - 1.4, dx = Math.cos(a) * (35 + 95 * q), dy = Math.sin(a) * (22 + 55 * q) + 90 * q * q;
      e.style.display = "block"; e.style.opacity = 1 - q; e.style.transform = `translate(${Math.round(dx)}px,${Math.round(dy)}px) rotate(${i * 45 + q * 90}deg)`;
    });
    const eyeK = o.eyeK == null ? 1 : o.eyeK;
    if (eyeK > .3) glow(49, 82, 8, o.eyeCol || "#7fe3ff", .3 * eyeK);
  }
  function cave() {
    bands(["#07060d", "#0d0b1c", "#141126", "#1c1735"], 0, 142);
    px(0, 142, AW, AH - 142, "#0f0d1c");
    for (let x = 0; x < AW; x += 3) px(x, 142, 2, 1, "#2c2950");
    for (let i = 0; i < 9; i++) { const x = i * 11 + rn(i) * 6, h = 8 + rn(i, 2) * 14; for (let k = 0; k < h; k++) px(x - Math.floor((h - k) / 4), k, Math.max(1, Math.floor((h - k) / 2)), 1, "#050409"); }
    for (let y = 150; y < AH; y += 12) px(0, y, AW, 1, "#171430");
  }
  const CRACKS = Array.from({ length: 8 }, (_, k) => { const pts = [[49, 148]]; let x = 49, y = 148; for (let s = 0; s < 14; s++) { const an = (k / 7 - .5) * 2.6 + (rn(k, s) - .5) * .9; x += Math.sin(an) * 8; y += 3 + rn(k, s + 20) * 7; pts.push([x, Math.min(y, AH - 1)]); } return pts; });
  function cracksDraw(p, col) { CRACKS.forEach((cr, k) => { const n = Math.floor(cr.length * clamp(p * (.6 + rn(k) * .6))); for (let i = 1; i < n; i++) line(cr[i - 1][0], cr[i - 1][1], cr[i][0], cr[i][1], col, .5 * (1 - i / cr.length * .7)); }); }
  function dust(t, from, n) { for (let i = 0; i < NP(n); i++) { const s = from + rn(i, 7) * 900, u = (t - s) / 1300; if (u < 0 || u > 1) continue; px(8 + rn(i, 8) * 82, 146 - u * 60 + rn(i, 9) * 6, 1, 1, "#9a94e0", (1 - u) * .8); } }
  function sIntro(t) {
    begin(); const [sx, sy] = shakeAt(t, 350, 1400, 1); A.style.transform = `translate(${sx}px,${sy}px)`;
    cave(); px(0, 0, AW, AH, "#000", 1 - ssub(t, 0, 600));
    cracksDraw(ssub(t, 200, 1300), "#5a8ab0");
    dust(t, 400, 28);
    const idle = t > 1900 ? Math.floor(t / 520) % 2 : 0;
    drawDragon({ asm: t, plates: true, eyeK: ssub(t, 1900, 2200), eyeCol: "#7fe3ff", dy: idle });
    if (t > 1900) { const r = ssub(t, 1900, 2800); ring(49, 160, 8 + r * 50, "#7fe3ff", (1 - r) * .5, 1, 3); }
    slam(TX.dragonTitle, t - 2100, 640, 44, "#e8f4ff", { sh: "#2a1f5a", glow: "#7fe3ff" });
    T(TX.dragonSub, 195, 690, 14, "#9a94e0", { a: ssub(t, 2500, 2900) });
  }
  function sBreak(t) {
    begin(); const [sx, sy] = shakeAt(t, 500, 1500, 1); A.style.transform = `translate(${sx}px,${sy}px)`;
    cave(); cracksDraw(1, "#5a8ab0"); const hot = ssub(t, 1500, 1800);
    drawDragon({ brk: t, plates: true, eyeCol: mix("#7fe3ff", "#ff4f6a", hot), eyeK: 1, dy: Math.floor(t / 520) % 2 });
    const r = ssub(t, 600, 1500); if (r > 0 && r < 1) { ring(49, 100, 6 + r * 70, "#bfe9ff", (1 - r) * .6, 1, 2); ring(49, 100, 3 + r * 50, "#7fe3ff", (1 - r) * .5, 1, 4); }
    for (let i = 0; i < NP(30); i++) { const s = 500 + rn(i, 1) * 900, u = (t - s) / 1100; if (u < 0 || u > 1) continue; const an = rn(i, 2) * 6.28, d = 8 + u * (30 + rn(i, 3) * 40); px(49 + Math.cos(an) * d, 100 + Math.sin(an) * d * .8 - u * 14, 1, 1, i % 2 ? "#bfe9ff" : "#9a94e0", 1 - u); }
    if (t > 2250) vig((t - 2250) / 250 * 3);   // 收尾轉暗，接擊殺的反黑
    slam(TX.breakTitle, t - 1300, 640, 56, "#e8f4ff", { sh: "#5a1030", glow: "#ff4f6a" });
    T(TX.breakSub, 195, 690, 14, "#9a94e0", { a: ssub(t, 1750, 2100) });
  }

  /* ===== 天堂／地獄判定：一方逐步擴大直到覆蓋整個畫面（結果早已決定，沒有來回、沒有差一點） ===== */
  function lightRegion(yb, k, t) {
    if (yb <= 2) return; const dk = ["#14122a", "#1c1838", "#241f44", "#2c2650", "#352e5a"], br = ["#fff6d0", "#fbe9a0", "#f6d878", "#f0c861", "#e4b650"];
    const gd = ["#6a4a2a", "#7a5a2e", "#8a6a30", "#9a7a34", "#a88a38"]; bands(dk.map((c, i) => k < .6 ? mix(c, gd[i], k / .6) : mix(gd[i], br[i], (k - .6) / .4)), 0, Math.min(yb, AH));
    for (let x = 2; x < AW; x += 4) { const Ln = Math.min(yb, AH) * (.45 + .55 * rn(x)), y = (t * .05 * (.6 + rn(x, 2)) + rn(x, 3) * 100) % Ln; px(x, y, 1, 6, "#ffffff", .3 * k); }
    for (let x = 0; x < AW + 6; x += 6) disc(x, yb - 1, 4 + Math.floor(rn(x) * 3), mix("#3a3560", "#fff2c0", k), 1);
  }
  function fireRegion(yb, k, t) {
    if (yb >= AH) return; const y0 = Math.max(0, yb);
    bands(["#2a0508", "#4a0a0c", "#7a1410", "#a8200f", "#d03a14"].map(c => mix("#12040a", c, .25 + .75 * k)), y0 + 6, AH);
    for (let x = 0; x < AW; x += 3) {
      const top = yb + Math.sin(x * .4 + t * .006) * 3 + rn(x) * 5;
      px(x, top, 2, 16, mix("#2a0a10", "#8a1a14", k)); px(x, top + 3, 2, 14, mix("#3a0c10", "#e0401c", k)); px(x, top + 9, 1, 8, mix("#4a1010", "#ffb347", k));
    }
  }
  function sparksAt(yb, t, col) { for (let i = 0; i < NP(26); i++) { const y = yb + (rn(i, 1) - .5) * 10 - ((t * .03 + i * 7) % 12); px(rn(i) * AW, y, 1, 1, i % 3 ? col[0] : col[1], .9); } }
  function sHeaven(t) {
    begin(); px(0, 0, AW, AH, "#05040a");
    const p = sm(ssub(t, 600, 4200)), yb = t < 600 ? 100 : 100 + 130 * p;
    lightRegion(yb, .3 + .7 * p, t); fireRegion(yb, .4, t);
    if (yb < AH) sparksAt(yb, t, ["#fff2c0", "#ffcc33"]);
    px(0, 0, AW, AH, "#000", 1 - ssub(t, 0, 500));
    if (t > 4200) {
      const a = ssub(t, 4200, 4800);
      for (let i = 0; i < 14; i++) { const an = i / 14 * 6.28 + t * .0004; line(49, 70, 49 + Math.cos(an) * 90, 70 + Math.sin(an) * 90, "#ffffff", .22 * a); }
      glow(49, 70, 30, "#ffffff", .9 * a); disc(49, 70, 14, "#fffbe0", a);
      for (let r = 0; r < 3; r++) for (let x = -10; x < AW + 14; x += 14) disc(x + (t * .004 * (r + 1)) % 14, 182 + r * 14, 8, ["#fff8e0", "#f4e4b0", "#e0c47a"][r], a);
      for (let i = 0; i < NP(14); i++) { const x = 6 + rn(i) * 86 + 4 * Math.sin(t * .002 + i), y = (t * .012 * (.6 + rn(i, 2) * .6) + rn(i, 3) * 211) % 211; px(x, y, 2, 1, "#ffffff", .9 * a); px(x + 1, y + 1, 1, 1, "#fff2c0", .8 * a); }
      const r = ssub(t, 4200, 5000); if (r < 1) ring(49, 105, 6 + r * 110, "#ffffff", (1 - r) * .7, 1, 2);
    }
    const bs = { sh: "#7a4a10" }, J = TX.heaven;
    fadeTxt(J.l1, t, 900, 2600, 150, 15, "#fff8e0", bs);
    fadeTxt(J.l2, t, 2500, 4300, 150, 15, "#fff8e0", bs);
    slam(J.title, t - 4500, 560, 64, "#fffbe8", { sh: "#7a4a10", glow: "#ffcc33" });
    T(J.sub, 195, 620, 16, "#7a4a10", { a: ssub(t, 5000, 5400), sh: "#fff2c0" });
  }
  const HCRACK = Array.from({ length: 9 }, (_, k) => { const pts = [[49, 150]]; let x = 49, y = 150; for (let s = 0; s < 12; s++) { x += (k / 8 - .5) * 20 + (rn(k, s) - .5) * 10; y += (rn(k, s + 9) - .3) * 8; pts.push([x, clamp(y, 120, AH - 1)]); } return pts; });
  function sHell(t) {
    begin(); px(0, 0, AW, AH, "#05040a");
    const p = sm(ssub(t, 600, 3600)), yb = t < 600 ? 100 : 100 - 130 * p;
    lightRegion(yb, .3, t); fireRegion(yb, .35 + .65 * p, t);
    if (yb > -4) sparksAt(yb, t, ["#ffb347", "#ff3a2a"]);
    px(0, 0, AW, AH, "#000", 1 - ssub(t, 0, 500));
    const c2 = ssub(t, 3600, 5200);
    if (t > 3600) {   // 第二段：地面裂開、整體色調轉暗紅（單向，逐漸）
      px(0, 0, AW, AH, "#1a0204", c2 * .55);
      HCRACK.forEach((cr, k) => { const n = Math.floor(cr.length * clamp(c2 * (.7 + rn(k) * .5))); for (let i = 1; i < n; i++) { line(cr[i - 1][0], cr[i - 1][1], cr[i][0], cr[i][1], "#ffb347", .95); line(cr[i - 1][0] + 1, cr[i - 1][1], cr[i][0] + 1, cr[i][1], "#e0401c", .8); } });
      for (let i = 0; i < NP(30); i++) { const u = ((t * .0006 * (.5 + rn(i, 1)) + rn(i, 2)) % 1); px(rn(i) * AW, 200 - u * 190, 1, 1, i % 2 ? "#ffb347" : "#ff3a2a", c2 * (1 - u)); }
    }
    const o = ssub(t, 5400, 6200), bar = 22 * ssub(t, 5200, 6200);   // 第三段：巨大的眼睛在深處睜開，上下黑邊慢慢收窄（單向）
    if (t > 5400) {
      const ry = 1 + 11 * sm(o); for (let dy = -Math.ceil(ry); dy <= ry; dy++) { const w = Math.floor(26 * Math.sqrt(Math.max(0, 1 - Math.pow(dy / ry, 2)))); px(49 - w, 95 + dy, 2 * w + 1, 1, "#12020a"); }
      glow(49, 95, 36, "#ff3a2a", .35 * o); disc(49, 95, Math.min(9, Math.floor(ry)), "#ff6a1f"); px(48, 95 - Math.floor(ry) + 1, 2, Math.max(1, 2 * Math.floor(ry) - 1), "#000");
    }
    px(0, 0, AW, bar, "#000"); px(0, AH - bar, AW, bar, "#000");
    if (t > 6400) { px(0, 0, AW, 2, "#6a0f12"); px(0, AH - 2, AW, 2, "#6a0f12"); px(0, 0, 2, AH, "#6a0f12"); px(AW - 2, 0, 2, AH, "#6a0f12"); for (let i = 0; i < NP(24); i++) { const u = (t * .0005 * (.6 + rn(i, 1)) + rn(i, 2)) % 1; px(6 + rn(i) * 86 + 3 * Math.sin(t * .002 + i), 205 - u * 190, 1, 1, i % 2 ? "#ffb347" : "#ff5a3a", 1 - u); } }
    const [sx, sy] = shakeAt(t, 6500, 6900, 1); if (t > 6400) A.style.transform = `translate(${sx}px,${sy}px)`;
    const bs = { sh: "#000" }, J = TX.hell;
    fadeTxt(J.l1, t, 900, 2800, 130, 15, "#ffd9c0", bs);
    fadeTxt(J.l2, t, 2400, 3900, 130, 15, "#ffd9c0", bs);
    fadeTxt(J.l3, t, 3700, 5100, 130, 15, "#ffd9c0", bs);
    fadeTxt(J.l4, t, 5300, 6400, 130, 15, "#ffd9c0", bs);
    slam(J.title, t - 6500, 500, 68, "#ff6a3a", { sh: "#000", glow: "#6a0f12" });
    T(J.sub, 195, 565, 16, "#ffd9c0", { a: ssub(t, 7100, 7500) });
  }

  /* ===== 點燃（輪迴的餘燼）：蓄力一路穩定變亮；成敗只在最後 1.5 秒分開，之前逐格相同 ===== */
  function igBg(b) { bands(["#07060d", "#0d0b1c", "#141126", "#1c1735"].map(c => mix(c, "#4a2a14", b * .8)), 0, 142); px(0, 142, AW, AH - 142, mix("#0f0d1c", "#24140a", b)); for (let x = 0; x < AW; x += 3) px(x, 142, 2, 1, mix("#2c2950", "#8a5a2a", b)); }
  function sIgnite(t, ok) {
    begin(); const b = sm(ssub(t, 0, 6500)), b2 = ok ? Math.max(b, sm(ssub(t, 6500, 7600))) : b * (1 - .85 * sm(ssub(t, 6500, 7500)));
    igBg(b2 * .9);
    const cx = 49, cy = 118, E = TX.ember;
    for (let i = 0; i < NP(70); i++) { const ts = 300 + rn(i, 1) * 4800, u = (t - ts) / 1500; if (u < 0 || u > 1 || (!ok && t > 6500)) continue; const e = u * u, r = lerp(100, 3, e), an = rn(i, 2) * 6.28 + 2 * e; px(cx + Math.cos(an) * r, cy + Math.sin(an) * r * .9, 1 + (i % 4 === 0), 1, i % 3 ? "#ffb347" : "#fff2c0", .9); }
    let rad = 3 + 8 * b;
    if (ok && t > 6500) { const inh = ssub(t, 6500, 6900); rad = (3 + 8 * b) * (1 - .6 * inh); }
    const ashK = ok ? 0 : sm(ssub(t, 6500, 7500));
    glow(cx, cy, 10 + 52 * b2, mix("#ff9a1f", "#fff2c0", b2), .45);
    { const rk = ok ? 1 : 1 - sm(ssub(t, 6500, 7300)); for (let i = 0; i < 12; i++) { const an = i / 12 * 6.283 + t * .0003; line(cx + Math.cos(an) * (rad + 3), cy + Math.sin(an) * (rad + 3), cx + Math.cos(an) * (rad + 6 + 55 * b), cy + Math.sin(an) * (rad + 6 + 55 * b), "#ffe9a8", .25 * rk * b); }
      ring(cx, cy, 16 + 26 * b, "#ffb347", .5 * rk * b, 1, 3, t * .0006); ring(cx, cy, 10 + 14 * b, "#fff2c0", .5 * rk * b, 1, 2, -t * .0008); }
    disc(cx, cy, Math.max(1, Math.round(rad)), mix(mix("#ff6a1f", "#fff2c0", b), "#5a5560", ashK)); disc(cx, cy, Math.max(1, Math.round(rad / 2)), mix("#ffe36b", "#8a8590", ashK));
    if (ok && t > 6900) {
      const q = eo(ssub(t, 6900, 7500)), w = 2 + 10 * q; const gr = ["#ffb347", "#ffe36b", "#fff2c0", "#ffffff"];
      for (let k = 0; k < 4; k++) { const ww = Math.max(1, Math.round(w * (1 - k * .22))); px(cx - ww / 2, cy - (cy + 4) * q, ww, (cy + 4) * q, gr[k], .9); }
      const r = ssub(t, 6900, 7700); ring(cx, cy, 4 + r * 90, "#fff2c0", (1 - r) * .6, 1, 2); ring(cx, cy, 4 + r * 60, "#ffb347", (1 - r) * .5, 1, 3);
      for (let i = 0; i < NP(26); i++) { const u = clamp((t - 6950 - rn(i) * 400) / 900); px(cx + (rn(i, 1) - .5) * 30, cy - u * 120, 1, 2, "#fff2c0", 1 - u); }
    }
    if (!ok && t > 6500) for (let i = 0; i < NP(34); i++) { const s = 6500 + rn(i, 1) * 900, u = (t - s) / 1600; if (u < 0 || u > 1) continue; px(cx + (rn(i, 2) - .5) * 24 + 8 * u * (rn(i, 3) - .5) * 4 + 3 * Math.sin(t * .003 + i), cy - 4 + u * 70, 1, 1, i % 2 ? "#8a8590" : "#5a5560", 1 - u * .8); }
    fadeTxt(E.charge, t, 900, 6400, 640, 14, "#ffd9a0");
    if (ok) {
      slam(E.okTitle, t - 7200, 640, 36, "#fff8e0", { sh: "#7a4a10", glow: "#ffcc33" }); T(E.okSub, 195, 690, 14, "#ffd9a0", { a: ssub(t, 7650, 7950) });
    } else {
      const a = ssub(t, 7100, 7600); T(E.failTitle, 195, 600, 24, "#c8c4d0", { a, ls: 3 });
      T(E.failGold, 195, 660, 14, "#9a94e0", { a: ssub(t, 7350, 7800) }); T("＋ " + Math.floor(TR.gold).toLocaleString("en-US"), 195, 700, 26, "#ffcc33", { a: ssub(t, 7350, 7800), sh: "#3a2a08" });
    }
  }

  /* ===== 狹間每隻之間的場景（5 種）。「繼續」與「結束」使用同一段畫面，只有句子不同 ===== */
  const THEME = () => TR.realm === "heaven"
    ? { bg: ["#171430", "#241f44", "#3a3158", "#4e4260"], acc: "#ffe9a8", acc2: "#ffcc33", dk: "#0d0b1c", txt: "#fff8e0" }
    : { bg: ["#0e0507", "#1c080c", "#2c0c10", "#401014"], acc: "#ff7a2a", acc2: "#ff3a2a", dk: "#080304", txt: "#ffd9c0" };
  function trFrame(th, ground) { begin(); bands(th.bg, 0, ground || 142); px(0, ground || 142, AW, AH - (ground || 142), th.dk); }
  function trText(t, d, th) {
    px(0, 160, AW, 26, "#000", .5); fadeTxt(TR.line, t, 450, d - 300, 686, 15, th.txt, { sh: "#000" });
    px(0, 0, AW, AH, "#000", ssub(t, d - 250, d));       // 繼續／結束的收尾完全相同
  }
  function sTunnel(t) {
    const th = THEME(), d = 2400; begin(); px(0, 0, AW, AH, th.dk); const vx = 49, vy = 92;
    for (let i = 0; i < 11; i++) { const z = ((i + t * .0035) % 11) / 11, s = 6 + 110 * z * z, c = mix(th.dk, th.bg[3], .5 + z * .5); const x0 = vx - s, x1 = vx + s, y0 = vy - s * .8, y1 = vy + s * .7; px(x0, y0, 2 * s, 1, c); px(x0, y1, 2 * s, 1, c); px(x0, y0, 1, y1 - y0, c); px(x1, y0, 1, y1 - y0, c); }
    for (let k = 0; k < 10; k++) { const an = k / 10 * 6.283; for (let j = 0; j < 7; j++) { const z = ((j / 7 + t * .0004 + rn(k) * .3) % 1), r = 4 + z * z * 90; px(vx + Math.cos(an) * r, vy + Math.sin(an) * r * .85, z > .5 ? 2 : 1, 1, k % 2 ? th.acc : th.acc2, .4 + z * .6); } }
    glow(vx, vy, 8 + ssub(t, 0, 2000) * 10, th.acc, .6);
    trText(t, d, th);
  }
  const SPIRIT_PAL = { body: "#35305a", rim: "#ffe9a8", eye: "#ffe9a8", O: "#07070b", acc: "#ffe9a8", mem: "#1b1838", mrim: "#3d3a73", hole: "#0f0e22" };
  let _spirit = null;
  function sBuddy(t) {
    const th = THEME(), d = 2400; trFrame(th); const hot = TR.realm === "heaven" ? "#ffe9a8" : "#ff7a2a";
    for (let i = 0; i < 6; i++) disc(10 + i * 17, 150 + (i % 2) * 6, 7, mix(th.dk, th.bg[3], .5));
    const face = ssub(t, 500, 1000), bob = Math.floor(t / 450) % 2, ex = 54 - Math.round(face * 4);
    if (!_spirit) { const o = kit().Grid(14, 12); o.el(6.5, 6, 5, 4, "a"); o.mln(3, 3, 2, 0, "a"); o.mrc(4, 5, 1, 2, "e"); o.mset(6, 10, "h"); _spirit = o.G; }
    const sp = kit().toCells(_spirit, Object.assign({}, SPIRIT_PAL, { eye: hot, rim: hot }));
    blit(g, sp, ex, 118 + bob, { noEye: face < 1, body: SPIRIT_PAL.body }); glow(ex + 6, 124 + bob, 12, hot, .3);
    if (t > 1000) { px(6, 66, 86, 28, "#e8e8e8"); px(7, 67, 84, 26, "#1b1b1f"); px(ex + 4, 94, 4, 3, "#e8e8e8"); px(ex + 5, 94, 2, 2, "#1b1b1f"); }
    px(0, 0, AW, AH, "#000", ssub(t, d - 250, d));
    const al = Math.min(ssub(t, 1050, 1300), 1 - ssub(t, d - 550, d - 300)); if (al > 0) T(TR.line, 195, 320, 15, "#e8e8e8", { a: al });
  }
  function sGlyph(t) {
    const th = THEME(), d = 2200; begin(); bands(th.bg, 0, 80); px(0, 80, AW, AH - 80, th.dk); for (let y = 82; y < AH; y += 8) px(0, y, AW, 1, mix(th.dk, th.bg[2], .5));
    const R = 6 + 54 * eo(ssub(t, 200, 1700)), cx = 49, cy = 130, a = th.acc;
    [14, 26, 40, 56].forEach(r => { if (r <= R) for (let i = 0; i < r * 9; i++) { const an = i / (r * 9) * 6.283; px(cx + Math.cos(an) * r, cy + Math.sin(an) * r * .45, 1, 1, a, .85); } });
    for (let k = 0; k < 16; k++) { const an = k / 16 * 6.283; for (let r = 14; r <= 40; r += 2) if (r <= R) px(cx + Math.cos(an) * r, cy + Math.sin(an) * r * .45, 1, 1, th.acc2, .5); }
    for (let k = 0; k < 8; k++) { const an = k / 8 * 6.283 + .39, r = 48; if (r <= R) px(cx + Math.cos(an) * r - 1, cy + Math.sin(an) * r * .45 - 1, 3, 3, a); }
    glow(cx, cy, R * .8, a, .35 * ssub(t, 400, 1600));
    for (let i = 0; i < NP(26); i++) { const u = ((t * .0005 * (.5 + rn(i, 1)) + rn(i, 2)) % 1); if (t > 600) px(cx + (rn(i) - .5) * R * 1.6, cy - u * 70, 1, 1, a, 1 - u); }
    trText(t, d, th);
  }
  let _wing = null;
  function wingShape(x0, y0) {
    if (!_wing) { const o = kit().Grid(40, 18); o.mel(11, 8, 9, 5, "a"); o.mln(19, 8, 6, 2, "a", 2); o.mln(6, 2, 0, 9, "a"); o.mln(6, 2, 8, 12, "a"); o.mln(19, 9, 10, 15, "a"); o.mln(10, 15, 3, 11, "a"); o.mrc(18, 6, 2, 8, "a"); o.mset(18, 7, "e"); _wing = kit().toCells(o.G, { body: "#07060a", rim: "#2a2540", eye: "#ff4a2a", O: "#000", acc: "#2a2540", mem: "#000", mrim: "#000", hole: "#000" }); }
    const eye = TR.realm === "heaven" ? "#fff4c0" : "#ff4a2a";
    _wing.cells.forEach(c => { px(x0 + c.x, y0 + c.y, 1, 1, c.k === "e" ? eye : c.col); });
  }
  function sRoar(t) {
    const th = THEME(), d = 2000; trFrame(th, 128);
    for (let i = 0; i < 20; i++) px(rn(i) * AW, rn(i, 2) * 70, 1, 1, th.acc, .5);
    for (let x = 0; x < AW; x++) { const h = 6 + Math.round(8 * Math.abs(Math.sin(x * .12)) + 5 * Math.abs(Math.sin(x * .31))); px(x, 128 - h, 1, h, th.dk); }
    const [sx, sy] = shakeAt(t, 300, 900, 1); A.style.transform = `translate(${sx}px,${sy}px)`;
    for (let k = 0; k < 3; k++) { const r = ssub(t, 250 + k * 200, 1500 + k * 200); if (r > 0 && r < 1) ring(72, 124, 4 + r * 90, th.acc, (1 - r) * .55, 1, 2); }
    const bx = -44 + 150 * ssub(t, 400, 1800); wingShape(bx, 38 + Math.round(6 * Math.sin(t * .004)));
    trText(t, d, th);
  }
  function sFx(t) {
    const th = THEME(), d = 2600; trFrame(th, 150);
    if (TR.realm === "heaven") {
      const b = ssub(t, 0, 800); for (let i = 0; i < 3; i++) for (let y = 0; y < 150; y++) px(18 + i * 30 + y * .15, y, 3, 1, "#fff2c0", .08 * b);
      for (let i = 0; i < NP(34); i++) { const sp = .6 + rn(i, 1) * .7, y = ((t * .018 * sp + rn(i, 2) * 211) % 211), x = 4 + rn(i) * 90 + 6 * Math.sin(t * .0022 * sp + i); px(x, y, 3, 1, i % 3 ? "#fff8e0" : "#ffe9a8", .95); px(x + 1, y + 1, 1, 1, "#ffcc33", .8); }
    } else {
      for (let k = 0; k < 5; k++) { const x = 8 + k * 20 + rn(k) * 6; for (let y = 0; y < 14; y++) px(x + Math.sin(y * 1.3 + k) * 2, 150 + y * 4 + (y % 2), 4, 3, "#1a0204"); const h = 70 * eo(ssub(t, 150 + k * 90, 1100)); for (let y = 0; y < h; y++) { const w = 1 + Math.round(3 * (1 - y / 70) * (.7 + .3 * Math.sin(t * .01 + y * .5 + k))); px(x + 1 - w / 2 + 1, 150 - y, w, 1, y < 18 ? "#ffcc33" : (y < 40 ? "#ff7a2a" : "#c02a18"), 1 - y / 90); } }
      for (let i = 0; i < NP(30); i++) { const u = ((t * .0006 * (.6 + rn(i, 1)) + rn(i, 2)) % 1); px(6 + rn(i) * 88, 150 - u * 130, 1, 1, i % 2 ? "#ffb347" : "#ff5a3a", 1 - u); }
    }
    trText(t, d, th);
  }

  /* ===== rv4 拉鋸 B：天堂／地獄上下兩片互推。前 11 句由 hold() 停格等點擊，最後兩句才播 2.6 秒。 ===== */
  function collapseTime(t) {
    if (!TR.preview) return 20000 + t;   // 兩片撞合 → 同步角力 → 勝方推到底 → 收暗
    const p = [700, 2300, 4100, 5900, 7700, 9500, 11300, 13100, 14900, 16700, 18500];
    return p[Math.max(0, Math.min(10, TR.step | 0))] + (RED ? 0 : t % 1800);
  }
  function collapseHeaven(yb, t, k) {
    lightRegion(yb, .72 + .2 * k, t);
    const sunA = .22 + .18 * k, sy = Math.min(55, Math.max(20, yb * .34));
    glow(49, sy, 15, "#fff2c0", sunA); disc(49, sy, 5, "#fff6d0", .72 + .18 * k);
    for (let i = 0; i < NP(18); i++) { const y = 5 + (rn(i, 8) * Math.max(8, yb - 10) + t * (.002 + rn(i, 9) * .002)) % Math.max(8, yb - 8); px(3 + rn(i) * 92, y, 1, 1, i % 3 ? "#fff8e0" : "#f0c861", .38 + .28 * k); }
  }
  function collapseHell(yb, t, k) {
    fireRegion(yb, .7 + .25 * k, t);
    for (let i = 0; i < NP(22); i++) { const span = Math.max(8, AH - yb - 5), u = (rn(i, 3) * span + t * (.004 + rn(i, 4) * .004)) % span; px(3 + rn(i) * 92, AH - 4 - u, 1, 1, i % 3 ? "#ff7a2a" : "#ffb347", (.3 + .45 * k) * (1 - u / span)); }
  }
  function sCollapse(t) {
    begin(); const Tm = collapseTime(t), reveal = !TR.preview;
    const appear = sm(ssub(Tm, 0, 4200)), pressure = sm(ssub(Tm, 7200, 11800));
    const wave = RED ? 0 : Math.sin((Tm - 7200) * Math.PI / 900) * (3 + pressure * 11);   // 1.8 秒一個來回
    let boundary = 105 + (Tm < 7200 ? 0 : wave);
    let gap = reveal && !RED ? Math.round(8 * (1 - sm(ssub(t, 0, 520)))) : 0;
    if (reveal) {
      const winPush = sm(ssub(t, 1200, 2220));
      if (RED) {
        boundary = 105; gap = 0;   // 減少特效：只以顏色淡入交代落點，不移動畫面
      } else if (winPush > 0) boundary = lerp(boundary, TR.out === "heaven" ? AH + 8 : -8, winPush);
    }
    px(0, 0, AW, AH, "#090817");
    const topEdge = clamp(boundary - gap / 2, 0, AH), bottomEdge = clamp(boundary + gap / 2, 0, AH);
    collapseHeaven(topEdge, Tm, appear); collapseHell(bottomEdge, Tm, appear);
    if (gap > 0) px(0, topEdge, AW, Math.max(1, bottomEdge - topEdge), "#17132d");
    else {
      px(0, boundary - 2, AW, 1, mix("#f0c861", "#7a1410", .35), .7);
      px(0, boundary - 1, AW, 2, mix("#fff2c0", "#ff7a2a", .5), .74);
      px(0, boundary + 1, AW, 1, mix("#f0c861", "#a8200f", .7), .7);
    }
    if (reveal && RED) {
      const winFade = sm(ssub(t, 1200, 2220)), winCol = TR.out === "heaven" ? "#f6d878" : "#a8200f";
      px(0, 0, AW, AH, winCol, winFade * .82);
    }
    const fadeIn = TR.preview ? 1 - ssub(Tm, 0, 900) : 0;
    if (fadeIn > 0) px(0, 0, AW, AH, "#000", fadeIn);
    if (reveal) px(0, 0, AW, AH, "#000", ssub(t, 2070, 2600));
  }

  /* ===== 睜眼 A：細光、杏仁形眼縫、馬賽克對焦；播完保留入口畫面等點擊。 ===== */
  function entrance(t, still) {
    bands(["#0b0a1a", "#15132b", "#211d40"], 0, 151); px(0, 151, AW, 60, "#111026");
    for (let y = 8; y < 150; y += 9) { px(0, y, AW, 1, "#080714", .7); for (let x = (y & 1) ? 0 : 6; x < AW; x += 13) px(x, y, 1, 8, "#080714", .5); }
    px(21, 55, 58, 9, "#4a4584"); px(24, 63, 9, 89, "#3a3560"); px(65, 63, 9, 89, "#3a3560");
    for (let y = 64; y < 151; y++) { const k = 1 - Math.abs(y - 105) / 50; px(33, y, 32, 1, mix("#6a4f2a", "#fff2c0", Math.max(0, k))); }
    for (let i = 0; i < 4; i++) { const y = 151 + i * 15, x = 17 - i * 5; px(x, y, AW - x * 2, 14, "#2a2652"); px(x, y, AW - x * 2, 1, "#5a5090"); }
    for (const bx of [12, 86]) { const h = still ? 5 : 3 + Math.floor(rn(Math.floor(t / 260), bx) * 5); px(bx - 3, 137 - h, 6, h, "#ff9a1f"); px(bx - 1, 137 - h - 2, 2, h + 1, "#ffcf70"); }
    glow(78, 151, 7, "#ffe9a8", .2); disc(78, 151, 3, "#ffe9a8"); px(77, 151, 1, 1, "#2a2250");
  }
  function pixelate(m) {
    if (m <= 1) return; const im = g.getImageData(0, 0, AW, AH), d = im.data;
    for (let y = 0; y < AH; y += m) for (let x = 0; x < AW; x += m) { const i = (y * AW + x) * 4, rr = d[i], gg = d[i + 1], bb = d[i + 2]; for (let yy = y; yy < Math.min(AH, y + m); yy++) for (let xx = x; xx < Math.min(AW, x + m); xx++) { const j = (yy * AW + xx) * 4; d[j] = rr; d[j + 1] = gg; d[j + 2] = bb; } }
    g.putImageData(im, 0, 0);
  }
  function sWake(t) {
    begin(); const d = RED ? RED_MS.wake : NATIVE.wake, held = t >= d, u = Math.min(t, d);
    entrance(u, RED || held); if (!held && !RED) pixelate(u < 1700 ? 12 : u < 2100 ? 6 : u < 2500 ? 3 : 1);
    if (!held) {
      if (RED) { const a = sm(ssub(u, 250, 1450)); px(0, 0, AW, AH, "#000", 1 - a); px(27, 105, 44, 1, "#f4dfa0", (1 - a) * .8); }
      else {
        const Hh = u < 800 ? 1 : u < 1250 ? 2 + (u - 800) / 65 : u < 1800 ? Math.max(2, 9 - (u - 1250) / 80) : 3 + (u - 1800) / 8;
        const rx = u < 800 ? Math.max(1, (u - 300) / 10) : Math.min(150, 24 + (u - 800) / 18), bri = .35 + .65 * sm(ssub(u, 800, 3000));
        for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) { const e = Math.pow((x - 49) / rx, 2) + Math.pow((y - 105) / Math.max(.5, Hh), 2); if (e > 1) px(x, y, 1, 1, "#000"); else if (bri < 1) px(x, y, 1, 1, "#000", 1 - bri); }
      }
    } else { const a = .7 + .3 * Math.sin((t - d) * .0039); for (let r = 0; r < 3; r++) px(88 + r, 199 + r, 5 - r * 2, 1, "#ffe9a8", a); }
  }
  const FN = { intro: sIntro, brk: sBreak, heaven: sHeaven, hell: sHell, ember: t => sIgnite(t, TR.ok), tunnel: sTunnel, buddy: sBuddy, glyph: sGlyph, roar: sRoar, fx: sFx, collapse: sCollapse, wake: sWake };

  /* ===== 圖層與播放 ===== */
  function ensure(app) {
    if (L && L.parentNode === app) return L;
    L = document.createElement("div"); L.id = "huntScene"; L.setAttribute("aria-hidden", "true");
    L.innerHTML = '<div class="hs-box"><canvas class="hs-art"></canvas><div class="hs-dragon"><span><img alt=""></span><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><canvas class="hs-tx"></canvas><div class="hs-caption"></div></div><button class="px-btn hs-leave" type="button"></button>';
    app.appendChild(L);
    A = L.querySelector(".hs-art"); X = L.querySelector(".hs-tx"); D = L.querySelector(".hs-dragon"); DI = D.querySelector("img"); CAP = L.querySelector(".hs-caption");
    A.width = AW; A.height = AH; X.width = 780; X.height = 1688;
    g = A.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = false; tx = X.getContext("2d");
    return L;
  }
  function fit(app) {
    const r = app.getBoundingClientRect(), bw = Math.floor(Math.min(r.width, r.height * 390 / 844)), bh = Math.floor(bw * 844 / 390), box = L.querySelector(".hs-box");
    box.style.width = bw + "px"; box.style.height = bh + "px";
  }
  function setup(o) {
    const app = o.app; ensure(app); fit(app);
    RED = !!o.reduced; TX = o.texts || {};
    TR = { realm: o.realm || "heaven", res: o.res || "cont", line: o.line || "", gold: o.gold || 0, ok: o.ok !== false,
      out: o.out === "hell" ? "hell" : "heaven", preview: !!o.preview, step: o.step | 0 };
    L.style.zIndex = o.leaveOk ? "55" : "72";   // 轉場時蓋在確認視窗（z 60）底下，離開鈕才按得到確認
    const btn = L.querySelector(".hs-leave"); btn.style.display = o.leaveOk ? "block" : "none"; btn.textContent = o.leaveText || "離開"; btn.onclick = o.leaveOk ? (() => { if (o.onLeave) o.onLeave(); }) : null;
    CAP.innerHTML = o.caption || ""; CAP.style.display = o.caption ? "block" : "none"; CAP.classList.toggle("auto", !!o.captions); L.onclick = null;
    L.classList.add("on");
    return { font: getComputedStyle(document.body).fontFamily || "monospace" };
  }
  function cleanup() {
    if (!S) return;
    cancelAnimationFrame(S.raf); L.classList.remove("on"); L.onclick = null; A.style.transform = ""; if (D) D.style.display = "none"; if (CAP) { CAP.style.display = "none"; CAP.textContent = ""; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, AW, AH); tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, 780, 1688); S = null;
  }
  /* o: { app, id: intro|brk|heaven|hell|ember|tunnel|buddy|glyph|roar|fx, ms(目標長度；和原長不同時等比例伸縮), reduced, realm("heaven"|"hell"，場景色調), line(場景句子), ok(點燃成敗), gold(失敗時顯示的金幣), texts, leaveOk, onLeave, onDone } */
  function play(o) {
    if (S) cleanup();
    const font = setup(o).font; clearTimeout(fadeT); L.classList.remove("out");
    const nat = NATIVE[o.id], ms = RED && RED_MS[o.id] ? RED_MS[o.id] : (o.ms || nat) * (RED ? .85 : 1);
    S = { id: o.id, font, onDone: o.onDone, start: 0, raf: 0, ms, k: nat / ms, nat, hold: !!o.hold, held: false, captions: o.captions || null, captionAfter: o.captionAfter || "" };
    S.start = performance.now();
    const frame = now => {
      if (!S) return;
      const u = now - S.start;
      if (u >= S.ms && !S.hold) return finish();
      if (u >= S.ms && S.hold && !S.held) { S.held = true; if (S.captionAfter) { CAP.innerHTML = S.captionAfter; CAP.style.display = "block"; } L.onclick = () => { if (S && S.held) finish(); }; }
      if (S.captions) { CAP.innerHTML = S.captions[u < 900 ? 0 : 1] || ""; CAP.style.display = "block"; }
      try { FN[S.id](S.held ? S.nat + (u - S.ms) : Math.max(0, Math.min(S.nat, u * S.k))); }
      catch (e) { console.error("演出出錯：" + (e && e.message)); return finish(); }   // 出錯也要收尾，不能把畫面卡住
      S.raf = requestAnimationFrame(frame);
    };
    try { FN[S.id](0); } catch (e) { console.error("演出出錯：" + (e && e.message)); cleanup(); if (o.onDone) o.onDone(); return; }
    S.raf = requestAnimationFrame(frame);
  }
  /* 點擊推進用的停格背景；只改演出畫面，不碰遊戲存檔。 */
  function hold(o) {
    if (S && S.previewKey === o.key) return;
    if (S) cleanup();
    const font = setup(Object.assign({}, o, { preview: true })).font;
    S = { id: o.id, font, onDone: null, start: performance.now(), raf: 0, nat: NATIVE[o.id], previewKey: o.key };
    L.onclick = () => { const cb = o.onAdvance; cleanup(); if (cb) cb(); };
    const frame = now => { if (!S || S.previewKey !== o.key) return; try { FN[o.id](now - S.start); } catch (e) { console.error("演出出錯：" + (e && e.message)); } S.raf = requestAnimationFrame(frame); };
    FN[o.id](0); S.raf = requestAnimationFrame(frame);
  }
  /* 播完：圖層漸漸淡出（0.4 秒），不是硬切回遊戲畫面（天堂判定結尾很亮，硬切會有一次亮度突變）。onDone 立刻呼叫，底下的畫面同時更新 */
  let fadeT = 0;
  function finish() {
    const done = S && S.onDone, el = L; cleanup();
    el.classList.add("on", "out"); clearTimeout(fadeT); fadeT = setTimeout(() => el.classList.remove("on", "out"), 420);
    if (done) done();
  }
  /* 中途中止（切到別的畫面、分頁到背景、離開礦坑）：不呼叫 onDone，狀態仍是「演出待播」，回來會從頭補播 */
  function abort() { cleanup(); }
  /* 測試用：停在原長的第 t 毫秒擷取畫面 */
  function seek(o, t) { if (!S || !S.manual) { o.onDone = null; play(o); cancelAnimationFrame(S.raf); S.manual = true; } else S.font = setup(o).font; FN[o.id](t); }
  const playing = () => !!S;
  root.HuntScene = { play, hold, abort, seek, release: abort, playing, NATIVE };
})(typeof window !== "undefined" ? window : globalThis);
