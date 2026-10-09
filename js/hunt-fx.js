/* =========================================================
   冒險狩獵礦坑：「五秒擊殺」演出（連斬 5 刀 → 反黑蓄力 → 整個畫面斬開碎裂 → 金色勝利），以及「倒下」演出
   - 瀏覽器：window.HuntFx。只做畫面，不碰存檔；演出播完呼叫 onDone，呼叫端才往下一步走
   - 來源：Claude outputs/五秒擊殺候選稿_2026-10-08/（擁有者 2026-10-08 定案；毫秒數與每一刀細節見該資料夾說明.md）。斬開那段沿用「丙＋反黑」
   - 每隻怪都播、不能跳過。總長 5000 毫秒：
       0～2200     連斬 5 刀（套路依招式：突刺→C「連刺上挑」、橫掃→A「快速五連斬」、蓄力→B「三刀大迴旋」；單鈕怪的套路預抽時就決定並存檔）
       2200～2900  反黑蓄力：全畫面瞬間反黑（94%），只留怪物發光的眼睛和一道聚集的光
       2900～3850  整個畫面沿該套路最後一刀的切線分成兩大塊，沿法線錯開約 35 像素停住 330ms；3230 各自碎成 22 片玻璃，怪物崩成碎塊
       3900～5000  金色立體「勝利」衝向鏡頭定格、光掃過、階梯淡出；結束後畫面完整復原
   - 連斬階段：每刀命中停頓 45～120ms（動畫時間凍結）、怪物擊退／傾斜、受擊色只在怪物身上（白剪影 66ms，最後一刀金色 100ms）、
     刀痕與火花畫在半解析度小畫布上、右上角「連斬 ×N」字樣（每刀 +1 彈一下）、每刀一個傷害數字（純演出用的數字，與勝負、金幣無關）
   - 「整個畫面」＝ #hud、目前的畫面（資訊列、場景、敘述框、選項、按鈕）、#nav，全部跟著切開、碎裂
   - 效能：量一次真實畫面，凍成「絕對定位範本」（不放進畫面）；兩大塊與 22 片碎片各自從範本長出副本，只保留和那一塊範圍重疊的元素
     → 每片碎片只有自己範圍內的十幾個節點，總量約 500（減少特效約 330），不是 24 份整屏（數千個）。碎片只用位移＋旋轉＋透明度，位置每 33ms 更新一次
   - 閃光規則（審查員）：全螢幕亮度突變只有「反黑進入」（2200）與「反黑恢復」（3230）兩次，間隔 1030ms；沒有全螢幕閃白。
     受擊閃光只在怪物身上；光柱、亮線、勝利字都不閃；兩隻怪的演出之間至少 5 秒
   - 減少特效：不閃（受擊只變亮、反黑改 3 格漸暗到 47%）、不晃、不彈、不旋轉、碎片 8 片、兩塊只錯開 55%、火花星芒減半、勝利只淡入，整段縮為 75%
   ========================================================= */
(function (root) {
  "use strict";
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const eOut = x => 1 - Math.pow(1 - x, 3);
  const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const rad = d => d * Math.PI / 180;
  const step6 = v => Math.round(clamp01(v) * 6) / 6;
  const f2 = v => String(+v.toFixed(2));
  const OV = 0.75;   // 兩半互相重疊的像素，避免縫隙
  const T = { blackAt: 2200, gatherAt: 2300, lineAt: 2840, splitAt: 2900, burstAt: 3230, flyMs: 620, winAt: 3900, fadeAt: 4750, fadeEnd: 5000, total: 5000 };
  const RADII = [0, 70, 170, 330, 1000], RADII_RED = [0, 130, 1000], G = 900;
  const WIN_SCALE = [.12, .22, .38, .6, .95, 1.5, 1.7, 1.35, 1.12, 1.0];   // 每格 33ms：從遠處衝向鏡頭，過頭一點再定格
  const GOLDS = ["#ffffff", "#ffe0a0", "#ffcc33", "#ff9a1f"];
  const BLACK = .94;   // 反黑的濃度

  /* ---- 三種連斬套路。r＝命中的時間（ms，含停頓），h＝命中停頓。每套路 5 次命中。索引對應招式：0 突刺→C、1 橫掃→A、2 蓄力→B ---- */
  const COMBOS = [
    { id: "C", name: "連刺上挑", cut: { angle: -55, at: [0, 0], source: "上挑末端切線" }, hits: [
      { r: 300, h: 45, kind: "stab", a: 0, len: 330, th: 4, col: "#ffffff", off: [-12, -10], kb: [8, 0], tilt: 1, spk: 8, sh: 2, dmg: 14 },
      { r: 500, h: 45, kind: "stab", a: 180, len: 330, th: 4, col: "#7fe3ff", off: [12, 12], kb: [-8, 0], tilt: -1, spk: 8, sh: 2, dmg: 16 },
      { r: 680, h: 50, kind: "stab", a: 12, len: 330, th: 5, col: "#ffcc33", off: [-6, -18], kb: [8, 3], tilt: 1, spk: 9, sh: 3, dmg: 18 },
      { r: 840, h: 55, kind: "stab", a: 168, len: 330, th: 5, col: "#ff9a1f", off: [6, 10], kb: [-8, 3], tilt: -1, spk: 9, sh: 3, dmg: 21 },
      { r: 1500, h: 120, kind: "launch", cutAngle: -55, th: 13, col: "#ffcc33", off: [0, 0], kb: [12, 0], tilt: 5, spk: 28, sh: 9, dmg: 92, heavy: true, pre: "gather", air: { h: 76, d: 560 } }] },
    { id: "A", name: "快速五連斬", cut: { angle: 28, at: [0, 0], source: "X 交叉的主刀（先畫、較重）" }, hits: [
      { r: 300, h: 50, kind: "line", a: 35, len: 270, th: 7, col: "#ffcc33", off: [0, -4], kb: [10, 6], tilt: 2, spk: 10, sh: 3, dmg: 24 },
      { r: 700, h: 55, kind: "line", a: 145, len: 270, th: 7, col: "#7fe3ff", off: [0, 0], kb: [-10, 6], tilt: -2, spk: 10, sh: 3, dmg: 27 },
      { r: 1040, h: 60, kind: "line", a: -2, len: 320, th: 9, col: "#ffffff", off: [0, 8], kb: [18, 0], tilt: 3, spk: 12, sh: 4, dmg: 31 },
      { r: 1320, h: 65, kind: "line", a: -62, len: 250, th: 8, col: "#ff9a1f", off: [-10, 10], kb: [8, -16], tilt: -3, spk: 12, sh: 4, dmg: 36 },
      { r: 1880, h: 110, kind: "line2", a: 28, a2: 152, cutAngle: 28, len: 440, th: 12, col: "#ffcc33", off: [0, 0], kb: [28, 12], tilt: 6, spk: 26, sh: 9, dmg: 88, heavy: true, pre: "glint" }] },
    { id: "B", name: "三刀大迴旋", cut: { angle: 0, at: [0, 0], source: "大迴旋收刀點的切線" }, hits: [
      { r: 320, h: 55, kind: "line", a: 20, len: 280, th: 7, col: "#ffcc33", off: [0, -8], kb: [10, 3], tilt: 2, spk: 10, sh: 3, dmg: 22 },
      { r: 720, h: 60, kind: "line", a: 160, len: 280, th: 7, col: "#7fe3ff", off: [0, 4], kb: [-10, 3], tilt: -2, spk: 10, sh: 3, dmg: 25 },
      { r: 1100, h: 65, kind: "line", a: 0, len: 340, th: 10, col: "#ffffff", off: [0, 12], kb: [18, 0], tilt: 3, spk: 14, sh: 4, dmg: 30 },
      { r: 1840, h: 0, kind: "spin", th: 11, col: "#ffcc33", off: [0, 0], kb: [0, -14], tilt: 4, spk: 20, sh: 5, dmg: 41, pre: "ring", lift: 22 },
      { r: 1990, h: 120, kind: "none", cutAngle: 0, col: "#ffcc33", off: [0, 0], kb: [0, -12], tilt: 6, spk: 28, sh: 9, dmg: 96, heavy: true }] }
  ];
  COMBOS.forEach(c => { let acc = 0; c.hits.forEach((h, i) => { h.e = h.r - acc; h.i = i; acc += h.h; }); c.last = c.hits[c.hits.length - 1]; c.endRaw = c.last.r + c.last.h; });
  /* 每套路只有一份切線幾何：angle 是畫面座標的刀痕方向，at 是相對怪物中心的通過點。後段所有效果共用 p／d／n。 */
  function cutGeom(combo, center, W, H) {
    const a = rad(combo.cut.angle), p = [center[0] + combo.cut.at[0], center[1] + combo.cut.at[1]], d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
    const corners = [[0, 0], [W, 0], [W, H], [0, H]];
    const span = Math.max(...corners.map(q => Math.abs((q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1]))) + 8;
    return { angle: combo.cut.angle, p, d, n, span };
  }
  function drawCutLine(g2, cut, grow, width, paint) {   // 半解析度畫布；span 由四角投影算出，任何角度都會穿出畫面兩側
    const half = cut.span * clamp01(grow), steps = Math.max(1, Math.ceil(half));
    for (let i = -steps; i <= steps; i++) {
      const s = half * i / steps, x = Math.round((cut.p[0] + cut.d[0] * s) / 2), y = Math.round((cut.p[1] + cut.d[1] * s) / 2);
      paint(x, y, width);
    }
  }
  /* 把「含停頓的時間」換成「動畫時間」：命中停頓期間動畫時間不前進（火花、刀痕、擊退全部凍結） */
  function teOf(combo, t) {
    let acc = 0;
    for (const h of combo.hits) { if (t < h.r) break; if (t < h.r + h.h) return h.r - acc; acc += h.h; }
    return t - acc;
  }
  /* 怪物的姿勢（被擊退、打飛、踉蹌） */
  function pose(combo, te, t) {
    let dx = 0, dy = 0, rot = 0;
    combo.hits.forEach(h => {
      const u = te - h.e;
      if (u >= 0) { const s = eOut(clamp01(u / 70)) * (1 - .5 * clamp01((u - 70) / 300)); dx += h.kb[0] * s; dy += h.kb[1] * s; rot += h.tilt * s;
        if (h.air) dy -= h.air.h * Math.sin(Math.PI * clamp01(u / h.air.d)); }
      if (h.lift) { const l = eOut(seg(te, h.e - 480, h.e)) * (1 - seg(te, h.e + 80, h.e + 420)); dy -= h.lift * l; }
    });
    const st = t - combo.endRaw;   // 最後一刀之後：踉蹌，往下沉、左右晃、歪一點，約 0.5 秒後站定
    if (st > 0) { const amp = 9 * (1 - seg(st, 0, 500)); dx += Math.round(amp * Math.sin(Math.floor(st / 33) * 0.6)); dy += 12 * eOut(seg(st, 0, 260)); rot += 6 * eOut(seg(st, 0, 260)); }
    return [Math.round(dx), Math.round(dy), Math.round(rot * 2) / 2];
  }

  let S = null;       // 目前正在播的演出
  let layer = null;   // #huntFx

  function ensureLayer(app) {
    if (layer && layer.parentNode === app) return layer;
    layer = document.createElement("div");
    layer.id = "huntFx"; layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<div class="hfx-world"><div class="hfx-back"><div class="pil"></div></div><div class="hfx-cut"></div><div class="hfx-tone"></div></div>' +
      '<div class="hfx-pretone"></div><canvas class="hfx-cv"></canvas><div class="hfx-hits"></div><div class="hfx-vic"></div><div class="hfx-dim"></div><div class="hfx-label"></div>';
    app.appendChild(layer);
    return layer;
  }
  const q = (L, c) => L.querySelector("." + c);

  /* ---------- 凍結快照：量一次真實畫面，凍成「絕對定位範本」 ---------- */
  const inlineKid = c => { const d = getComputedStyle(c).display; return d === "inline" || d === "contents"; };
  function freezeEl(src, origin, app) {
    const cs = getComputedStyle(src);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    const r = src.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const tag = src.tagName.toLowerCase(), kids = [...src.children];
    const deep = tag === "svg" || tag === "img" || tag === "canvas" || !kids.length || kids.every(inlineKid);   // 葉：整棵子樹一起複製（文字換行不變）
    const tpl = src.cloneNode(deep), s = tpl.style;
    s.position = "absolute"; s.left = (r.left - origin.x) + "px"; s.top = (r.top - origin.y) + "px"; s.width = r.width + "px"; s.height = r.height + "px";
    s.right = "auto"; s.bottom = "auto"; s.margin = "0"; s.minWidth = "0"; s.minHeight = "0"; s.maxWidth = "none"; s.maxHeight = "none";
    s.transform = "none"; s.animation = "none"; s.transition = "none";
    const rec = { tpl, deep, x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height, kids: [] };
    if (!deep) {
      const o = { x: r.left + (parseFloat(cs.borderLeftWidth) || 0), y: r.top + (parseFloat(cs.borderTopWidth) || 0) };
      kids.forEach(k => { const kr = freezeEl(k, o, app); if (kr) rec.kids.push(kr); });
    }
    return rec;
  }
  function snapshot(app, rect) {
    const root = document.createElement("div");
    root.className = "hfx-tpl";
    root.style.cssText = "position:absolute;left:0;top:0;width:" + rect.width + "px;height:" + rect.height + "px;overflow:hidden;background:var(--bg)";
    const rec = { tpl: root, deep: false, x: 0, y: 0, w: rect.width, h: rect.height, kids: [] };
    const o = { x: rect.left, y: rect.top };
    ["hud", "screens", "nav"].forEach(id => { const el = document.getElementById(id); if (!el) return; const k = freezeEl(el, o, rect); if (k) rec.kids.push(k); });
    return rec;
  }
  /* 從範本長出一份副本；test(rec) 為 false 的元素（連同子樹）不複製 */
  function build(rec, test) {
    const el = rec.tpl.cloneNode(rec.deep);
    if (!rec.deep) for (const k of rec.kids) if (test(k)) el.appendChild(build(k, test));
    return el;
  }
  function findRec(rec, pred) { if (pred(rec)) return rec; for (const k of rec.kids) { const f = findRec(k, pred); if (f) return f; } return null; }

  /* ---------- 幾何：玻璃碎片（由中心放射的裂紋＋兩三圈環形裂紋，頂點抖動，吸附到偶數像素） ---------- */
  function clipPlane(poly, p, n) {   // 保留 dot(q-p,n) >= 0
    const out = [], dt = pt => (pt[0] - p[0]) * n[0] + (pt[1] - p[1]) * n[1];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = dt(a), db = dt(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function makeShards(W, H, c, K, radii, seed, pin) {   // pin：指定第 0 條與對面那條裂紋的角度（讓切線正好是兩條裂紋，碎片不會跨過切線）
    const R = radii.length - 1, rot = pin, ang = [];
    for (let k = 0; k < K; k++) ang.push(rot + (k + ((k === 0 || k === K / 2) ? 0 : (rnd(seed + k + 1) - .5) * .55)) / K * Math.PI * 2);
    const V = [null];
    for (let j = 1; j <= R; j++) { V[j] = []; for (let k = 0; k < K; k++) { const r = radii[j] * (1 + (rnd(seed + j * 31 + k) - .5) * (j === R ? .1 : .4)); V[j][k] = [c[0] + Math.cos(ang[k]) * r, c[1] + Math.sin(ang[k]) * r]; } }
    const raw = [];
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      raw.push({ ring: 0, p: [c, V[1][k], V[1][k2]] });
      for (let j = 1; j < R; j++) raw.push({ ring: j, p: [V[j][k], V[j][k2], V[j + 1][k2], V[j + 1][k]] });
    }
    const sn = v => Math.round(v / 2) * 2, out = [];
    raw.forEach(s => {
      let p = s.p;
      p = clipPlane(p, [0, 0], [1, 0]); if (p.length < 3) return; p = clipPlane(p, [W, 0], [-1, 0]); if (p.length < 3) return;
      p = clipPlane(p, [0, 0], [0, 1]); if (p.length < 3) return; p = clipPlane(p, [0, H], [0, -1]); if (p.length < 3) return;
      p = p.map(pt => [sn(pt[0]), sn(pt[1])]);
      let a = 0; for (let i = 0; i < p.length; i++) { const n2 = p[(i + 1) % p.length]; a += p[i][0] * n2[1] - n2[0] * p[i][1]; }
      if (Math.abs(a) / 2 < 120) return;
      out.push({ ring: s.ring, p, area: Math.abs(a) / 2 });
    });
    return out;
  }

  const setS = (el, k, v) => { const key = "_" + k; if (el[key] !== v) { el[key] = v; el.style[k] = v; } };

  /* ---------- 刀痕、星芒 ---------- */
  function drawPath(g2, P, plen, u0, head, th, fade, col1, col2) {   // 沿路徑畫一條「頭先到、尾先消」的像素刀光
    const n = Math.max(6, Math.ceil(plen / 2 * (head - u0) * 1.3)), pass = (scale, col) => {
      g2.fillStyle = col;
      for (let k = 0; k <= n; k++) {
        const u = u0 + (head - u0) * k / n, w = th * (1 - .55 * fade) * (.25 + .75 * Math.pow(Math.sin(Math.PI * Math.min(.999, Math.max(.001, u))), .6)) * scale, p = P(u), wi = Math.max(1, Math.round(w));
        g2.fillRect(Math.round(p[0] / 2 - wi / 2), Math.round(p[1] / 2 - wi / 2), wi, wi);
      }
    };
    pass(1, col1); pass(.45, col2);
  }
  function slashes(ctx, h) {   // 這一刀要畫的刀痕清單
    const c0 = [ctx.cm[0] + h.off[0], ctx.cm[1] + h.off[1]], out = [];
    const lineP = (a, len, c) => { const d = [Math.cos(rad(a)), Math.sin(rad(a))]; return u => [c[0] + d[0] * len * (u - .5), c[1] + d[1] * len * (u - .5)]; };
    if (h.kind === "line") out.push({ P: lineP(h.a, h.len, c0), len: h.len, t0: h.e - 30, dur: 60, fade: 150, th: h.th });
    else if (h.kind === "line2") { out.push({ P: lineP(h.a, h.len, c0), len: h.len, t0: h.e - 30, dur: 60, fade: 190, th: h.th }); out.push({ P: lineP(h.a2, h.len, c0), len: h.len, t0: h.e + 10, dur: 60, fade: 190, th: h.th }); }
    else if (h.kind === "stab") { const d = [Math.cos(rad(h.a)), Math.sin(rad(h.a))]; out.push({ P: u => [c0[0] - d[0] * h.len * (1 - u), c0[1] - d[1] * h.len * (1 - u)], len: h.len, t0: h.e - 26, dur: 36, fade: 130, th: h.th }); }
    else if (h.kind === "spin") out.push({ P: u => { const a = rad(-90 + 360 * u); return [c0[0] + 128 * Math.cos(a), c0[1] + 82 * Math.sin(a)]; }, len: 560, t0: h.e, dur: 150, fade: 160, th: h.th, lin: true });
    else if (h.kind === "launch") {
      const A = [c0[0] - 150, c0[1] + 95], C = [c0[0] - 30, c0[1] + 105], B = [c0[0] + 130, c0[1] - 120];
      out.push({ P: u => [(1 - u) * (1 - u) * A[0] + 2 * u * (1 - u) * C[0] + u * u * B[0], (1 - u) * (1 - u) * A[1] + 2 * u * (1 - u) * C[1] + u * u * B[1]], len: 330, t0: h.e - 40, dur: 70, fade: 230, th: h.th });
    }
    return out;
  }
  /* 狹間色調：天堂把冷色刀光換成金白、地獄換成赤橙（只換刀光顏色，結構不變） */
  const TONE = { heaven: { "#7fe3ff": "#fff2c0", "#ffffff": "#fffbe8", "#ffcc33": "#ffe9a8" }, hell: { "#7fe3ff": "#ff9a6a", "#ffffff": "#ffd9c0", "#ffcc33": "#ff7a2a", "#ff9a1f": "#ff4a2a" } };
  const toneCol = (tone, c) => (tone && TONE[tone] && TONE[tone][c]) || c;
  function drawBurst(g2, cx, cy, size, spikes) {
    for (let k = 0; k < spikes; k++) {
      const a = k * Math.PI * 2 / spikes + .39, cardinal = (spikes === 4) || k % 2 === 0; g2.fillStyle = k % 2 ? "#ffe0a0" : "#ffffff";
      const m = cardinal ? size : size * .62;
      for (let r = 2; r <= m; r++) { const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r); g2.fillRect(x, y, cardinal && r < m * .6 ? 2 : 1, cardinal && r < m * .6 ? 2 : 1); }
    }
  }

  /* ---------- 建立斬擊場景（播放前一次做完） ---------- */
  function buildKill(ctx, opts, L) {
    const W = ctx.W, H = ctx.H, reduced = ctx.reduced, ic = ctx.ic, combo = ctx.combo;
    const tpl = snapshot(opts.app, ctx.rect);
    const monEl = opts.monEl, img = monEl && monEl.querySelector("img"), m = img ? monEl.getBoundingClientRect() : null, MC = root.HuntMon && root.HuntMon.cells(opts.variant || 0);
    ctx.finalPose = pose(combo, 1e9, 1e9);
    if (m && MC) {
      const sx = m.left - ctx.rect.left, sy = m.top - ctx.rect.top, cp = m.width / MC.w;
      ctx.cm = [sx + m.width / 2, sy + m.height / 2]; ctx.cp = Math.max(2, Math.round(cp)); ctx.eyes = MC.eyes.map(e => [sx + (e[0] + .5) * cp, sy + (e[1] + .5) * cp]); ctx.eyeCol = MC.eye;
      // 斬開時兩半、碎片裡看到的是「打倒之後」的怪物最後的姿勢
      const mr = findRec(tpl, r => r.tpl.className && String(r.tpl.className).indexOf("hunt-mon") >= 0);
      if (mr) { const p = ctx.finalPose; mr.tpl.style.transform = "translate3d(" + p[0] + "px," + p[1] + "px,0) rotate(" + p[2] + "deg)"; }
      // 怪物崩成的碎塊（取怪物自己的像素，每 2×2 格併成一塊；位置套用最後的姿勢）
      const fp = ctx.finalPose, fr = rad(fp[2]), cs = Math.cos(fr), sn = Math.sin(fr), kk = cp / 7;
      ctx.chips = [];
      for (let by = 0; by < MC.h; by += 2) for (let bx = 0; bx < MC.w; bx += 2) {
        let col = null; for (let y = by; y < by + 2 && !col; y++) for (let x = bx; x < bx + 2; x++) if (MC.cell[y] && MC.cell[y][x]) { col = MC.cell[y][x]; break; }
        if (!col) continue;
        const i = ctx.chips.length;
        if (reduced && i % 2) { ctx.chips.push(null); continue; }
        const px = sx + (bx + 1) * cp - ctx.cm[0], py = sy + (by + 1) * cp - ctx.cm[1];
        const x0 = ctx.cm[0] + cs * px - sn * py + fp[0], y0 = ctx.cm[1] + sn * px + cs * py + fp[1];
        ctx.chips.push({ x: x0, y: y0, vx: ((x0 - ctx.cm[0]) * 2.2 + (rnd(i) - .5) * 120) * kk, vy: (-(120 + rnd(i + .4) * 300) + (y0 - ctx.cm[1]) * .6) * kk, col: col === "#07070b" ? "#7771b8" : col, life: .8 + rnd(i + .8) * .5 });
      }
      ctx.chips = ctx.chips.filter(Boolean);
    } else { ctx.cm = [W / 2, H * .4]; ctx.eyes = []; ctx.chips = []; ctx.cp = 4; ctx.eyeCol = "#ffe36b"; }
    ctx.cut = cutGeom(combo, ctx.cm, W, H);
    const nn = ctx.cut.n, cutP = ctx.cut.p;
    // 連斬字樣與傷害數字
    const sc = (opts.sceneEl || opts.app).getBoundingClientRect(), hits = q(L, "hfx-hits");
    hits.innerHTML = '<div class="hfx-cmb" style="right:' + Math.round(ctx.rect.right - sc.right + 12) + 'px;top:' + Math.round(sc.top - ctx.rect.top + 8) + 'px"><span class="cl">' + (opts.comboText || "連斬") + '</span><span class="cn">×1</span></div>' +
      combo.hits.map((h, i) => '<div class="hfx-dm' + (h.heavy ? " big" : "") + '" style="left:' + Math.round(ctx.cm[0] + h.off[0] + (rnd(i * 3.7) - .5) * 70) + "px;top:" + Math.round(ctx.cm[1] + h.off[1] - 30) + 'px">' + h.dmg + "</div>").join("");
    ctx.cmb = hits.querySelector(".hfx-cmb"); ctx.cn = ctx.cmb.querySelector(".cn"); ctx.dms = [...hits.querySelectorAll(".hfx-dm")];
    // 勝利字樣：本體＋兩層殘影（衝向鏡頭時的速度線）
    const g = ch => '<span class="hv-g"><span class="hv-t">' + ch + '</span><span class="hv-t hv-sh">' + ch + "</span></span>";
    const vic = q(L, "hfx-vic");
    vic.innerHTML = ["m", "t1", "t2"].map(k => '<div class="hv-l ' + k + '" style="top:' + ctx.wy + 'px">' + g(opts.win ? opts.win[0] : "勝") + g(opts.win ? opts.win[1] : "利") + "</div>").join("");
    ctx.vl = [...vic.querySelectorAll(".hv-l")]; ctx.sh = [...ctx.vl[0].querySelectorAll(".hv-sh")];
    // 兩大塊：整個畫面沿切線分成左右兩半（各自的副本，只留和那一半有重疊的元素）
    const cut = q(L, "hfx-cut"), K = reduced ? 4 : 6, radii = reduced ? RADII_RED : RADII;
    cut.innerHTML = "";
    ctx.hf = [0, 1].map(() => { const h = document.createElement("div"); h.className = "hfx-hf"; h.style.transformOrigin = (W / 2) + "px " + (H / 2) + "px"; cut.appendChild(h); return h; });
    const rectP = [[0, 0], [W, 0], [W, H], [0, H]]; ctx.tones = [];
    [-1, 1].forEach((side, i) => {
      const poly = clipPlane(rectP, [cutP[0] - nn[0] * side * OV, cutP[1] - nn[1] * side * OV], [nn[0] * side, nn[1] * side]);
      const el = document.createElement("div"); el.className = "hfx-hp";
      el.style.clipPath = "polygon(" + poly.map(p => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",") + ")";
      const keep = r => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].some(p => side * ((p[0] - cutP[0]) * nn[0] + (p[1] - cutP[1]) * nn[1]) >= -2);
      el.appendChild(build(tpl, keep));
      const tone = document.createElement("div"); tone.className = "hfx-tone-in"; el.appendChild(tone); ctx.tones.push(tone);
      ctx.hf[i].appendChild(el);
    });
    // 22 片玻璃（碎裂瞬間才顯示）：每片只複製和自己範圍有重疊的元素
    const polys = makeShards(W, H, cutP, K, radii, 11, rad(ctx.cut.angle));
    ctx.shards = [];
    polys.forEach((s, i) => {
      const Pp = s.p, xs = Pp.map(p => p[0]), ys = Pp.map(p => p[1]);
      const gx = xs.reduce((a, b) => a + b, 0) / Pp.length, gy = ys.reduce((a, b) => a + b, 0) / Pp.length;
      const ex = Pp.map(p => { const dx = p[0] - gx, dy = p[1] - gy, d = Math.hypot(dx, dy) || 1; return [p[0] + dx / d * 1.2, p[1] + dy / d * 1.2]; });
      const bx = Math.floor(Math.min(...ex.map(p => p[0]))) - 1, by = Math.floor(Math.min(...ex.map(p => p[1]))) - 1;
      const bw = Math.ceil(Math.max(...ex.map(p => p[0]))) - bx + 1, bh = Math.ceil(Math.max(...ex.map(p => p[1]))) - by + 1;
      const el = document.createElement("div"); el.className = "hfx-shd";
      el.style.cssText = "left:" + bx + "px;top:" + by + "px;width:" + bw + "px;height:" + bh + "px;clip-path:polygon(" + ex.map(p => (p[0] - bx).toFixed(1) + "px " + (p[1] - by).toFixed(1) + "px").join(",") + ");transform-origin:" + (gx - bx).toFixed(1) + "px " + (gy - by).toFixed(1) + "px;display:none";
      const inner = build(tpl, r => r.x < bx + bw && r.x + r.w > bx && r.y < by + bh && r.y + r.h > by);
      inner.style.left = (-bx) + "px"; inner.style.top = (-by) + "px";
      el.appendChild(inner);
      const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "hfx-ol"); svg.setAttribute("width", bw); svg.setAttribute("height", bh);
      const pg = document.createElementNS(ns, "polygon"); pg.setAttribute("points", ex.map(p => (p[0] - bx).toFixed(1) + "," + (p[1] - by).toFixed(1)).join(" "));
      pg.setAttribute("fill", "none"); pg.setAttribute("stroke", "#07070b"); pg.setAttribute("stroke-width", "4"); svg.appendChild(pg); el.appendChild(svg);
      const side = ((gx - cutP[0]) * nn[0] + (gy - cutP[1]) * nn[1]) < 0 ? -1 : 1;
      ctx.hf[side < 0 ? 0 : 1].appendChild(el);
      let dx = gx - cutP[0], dy = gy - cutP[1]; const d = Math.hypot(dx, dy);
      if (d < 1) { const a = rnd(i + 5) * 6.28; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
      const sp = ([520, 470, 430, 600][s.ring] || 480) * (.8 + rnd(i * 3.3) * .45);
      ctx.shards.push({ el, vx: dx * sp + nn[0] * side * 150, vy: dy * sp + nn[1] * side * 150 - 140, w: (rnd(i * 7.7) - .5) * 2 * 520, tf: "", op: "", on: false });
    });
    ctx.stats = { shards: ctx.shards.length, nodes: cut.querySelectorAll("*").length + vic.querySelectorAll("*").length + hits.querySelectorAll("*").length + 6, combo: combo.id, cutAngle: ctx.cut.angle };
    // 後層的碎屑（緩緩上飄的小光點）
    ctx.deb = []; const nd = reduced ? 12 : 30;
    for (let i = 0; i < nd; i++) ctx.deb.push({ x: cutP[0] + (rnd(i * 2.1) - .5) * 150, y: rnd(i * 3.7) * H, v: 30 + rnd(i * 5.1) * 70, s: 1 + Math.floor(rnd(i * 6.3) * 2), c: toneCol(ctx.tone, GOLDS[Math.floor(rnd(i * 9.1) * 4)]), ph: rnd(i * 4.4) });
  }

  /* ---------- 每一格的畫面（t＝演出時間 ms，已除掉減少特效的時間縮放） ---------- */
  function render(t) {
    const ctx = S.ctx, combo = ctx.combo, W = ctx.W, H = ctx.H, ic = ctx.ic, reduced = ctx.reduced, g2 = ctx.g2, L = ctx.L, te = teOf(combo, t);
    g2.clearRect(0, 0, ctx.cv.width, ctx.cv.height);
    const world = q(L, "hfx-world"), pil = q(L, "pil"), split = t >= T.splitAt, burst = t >= T.burstAt, inCombo = t < T.blackAt;
    /* ===== 一、連斬（0～2200）：刀痕、命中停頓、擊退、受擊色（只在怪物身上）、火花、連斬字樣 ===== */
    const pz = pose(combo, te, t), mon = ctx.mon;
    if (mon) {
      setS(mon, "transform", "translate3d(" + pz[0] + "px," + pz[1] + "px,0) rotate(" + pz[2] + "deg)");
      let fc = "";
      combo.hits.forEach(h => { const u = te - h.e; if (inCombo && u >= 0 && u < (h.heavy ? 100 : 66)) fc = reduced ? "mh" : (h.heavy ? "mg" : "mw"); });
      if (mon._fc !== fc) { mon._fc = fc; mon.classList.remove("mw", "mg", "mh"); if (fc) mon.classList.add(fc); }
    }
    if (inCombo) {
      combo.hits.forEach(h => {
        const u = te - h.e;
        if (h.pre && u < 0 && u > -520) {   // 蓄勢（最後一刀前的準備動作）
          const p = seg(u, -(h.pre === "ring" ? 480 : h.pre === "gather" ? 520 : 160), 0);
          if (h.pre === "glint") { const sc = slashes(ctx, h)[0].P(0); drawBurst(g2, sc[0] / 2, sc[1] / 2, 2 + 6 * p, 4); }
          else for (let i = 0; i < (reduced ? 10 : 22); i++) {
            const a = rnd(i * 3.1) * 6.28, k = ((p * 1.2 + rnd(i * 1.7)) % 1), R = 1 - k * k;
            const ox = h.pre === "ring" ? ctx.cm[0] : ctx.cm[0] - 110, oy = h.pre === "ring" ? ctx.cm[1] : ctx.cm[1] + 72, rx = h.pre === "ring" ? 150 : 90, ry = h.pre === "ring" ? 98 : 60;
            g2.fillStyle = i % 3 ? "#ffcc33" : "#ffffff"; g2.fillRect(Math.round((ox + Math.cos(a) * rx * R) / 2), Math.round((oy + Math.sin(a) * ry * R) / 2), 2, 2);
          }
        }
        if (u < -60) return;
        slashes(ctx, h).forEach(s => {   // 刀痕
          const ts = te - s.t0; if (ts < 0 || ts > s.dur + s.fade) return;
          const head = s.lin ? clamp01(ts / s.dur) : eOut(clamp01(ts / s.dur)), fade = seg(ts, s.dur, s.dur + s.fade), u0 = fade * fade * head;
          drawPath(g2, s.P, s.len, u0, head, s.th, fade, reduced ? "#ffcf70" : toneCol(ctx.tone, h.col), reduced ? "#fff3c9" : toneCol(ctx.tone, "#ffffff"));
        });
        if (u < 0) return;
        const hx = ctx.cm[0] + h.off[0], hy = ctx.cm[1] + h.off[1], age = u;   // 命中的星芒、火花、碎片
        if (age < 170) { const len = (h.heavy ? 22 : 12) * (age < 50 ? age / 50 : 1 - (age - 50) / 120); if (len > 2) drawBurst(g2, hx / 2, hy / 2, len, reduced ? 4 : 8); }
        const a0 = rad(h.a === undefined ? -90 : h.a + 90), n = Math.round(h.spk * (reduced ? .5 : 1)), uu = u / 1000;
        for (let k = 0; k < n; k++) {
          const side = rnd(h.i * 91 + k) < .5 ? 1 : -1, ang = (h.kind === "stab" || h.kind === "spin" || h.kind === "none" || h.kind === "launch" || h.kind === "line2") ? rnd(h.i * 77 + k) * 6.28 : a0 + (side < 0 ? Math.PI : 0) + (rnd(h.i * 53 + k) - .5) * 1.4;
          const sp = 140 + rnd(h.i * 31 + k) * 260, life = .25 + rnd(h.i * 17 + k) * .25; if (uu > life) continue;
          g2.fillStyle = k % 3 === 0 ? "#ffffff" : k % 3 === 1 ? h.col : "#ffe0a0";
          g2.fillRect(Math.round((hx + Math.cos(ang) * sp * uu) / 2), Math.round((hy + Math.sin(ang) * sp * uu + 700 * uu * uu * .5) / 2), 1 + (k % 2), 1 + (k % 2));
        }
        const nc = Math.round(h.sh * (reduced ? .5 : 1));
        for (let k = 0; k < nc; k++) {
          const ang = rnd(h.i * 41 + k) * 6.28, sp = 90 + rnd(h.i * 23 + k) * 220, life = .35 + rnd(h.i * 13 + k) * .3; if (uu > life) continue;
          g2.fillStyle = k % 2 ? "#7771b8" : ctx.eyeCol; g2.fillRect(Math.round((hx + Math.cos(ang) * sp * uu) / 2), Math.round((hy + Math.sin(ang) * sp * uu - 60 * uu + 900 * uu * uu * .5) / 2), 2, 2);
        }
      });
    }
    let cnt = 0, cu = 1e9; combo.hits.forEach(h => { if (te >= h.e) { cnt = h.i + 1; cu = te - h.e; } });   // 連斬字樣與傷害數字
    if (cnt > 0 && inCombo) {
      const sc = reduced ? 1 : [1.7, 1.4, 1.2, 1.1, 1][Math.min(4, Math.floor(cu / 17))];
      setS(ctx.cmb, "opacity", "1"); if (ctx.cn._tx !== cnt) { ctx.cn._tx = cnt; ctx.cn.textContent = "×" + cnt; }
      setS(ctx.cmb, "transform", "scale(" + sc + ")"); const big = cnt === 5 ? "hfx-cmb big" : "hfx-cmb"; if (ctx.cmb.className !== big) ctx.cmb.className = big;
    } else setS(ctx.cmb, "opacity", "0");
    ctx.dms.forEach((el, i) => {
      const h = combo.hits[i], u = te - h.e, ok = inCombo && u >= 0 && u < 520;
      setS(el, "opacity", ok ? f2(step6(1 - seg(u, 300, 520))) : "0"); if (ok) setS(el, "transform", "translateY(" + (-Math.round(36 * eOut(clamp01(u / 400)))) + "px)");
    });
    setS(q(L, "hfx-hits"), "opacity", inCombo ? "1" : "0");
    /* ===== 二、反黑（2200～）：整個畫面瞬間變暗（亮度突變 1 次），只留怪物發光的眼睛和一道正在聚集的光。減少特效：3 格漸暗到 47% ===== */
    let to = 0;
    if (t >= T.blackAt && t < T.burstAt) to = reduced ? BLACK * .5 * Math.min(3, Math.floor((t - T.blackAt) / 33) + 1) / 3 : BLACK;
    else if (t >= T.burstAt && t < T.burstAt + 66) to = (t - T.burstAt < 33 ? .5 : 0) * BLACK * (reduced ? .5 : 1);   // 恢復（亮度突變第 2 次；兩格）
    const pre = q(L, "hfx-pretone");
    setS(pre, "display", !split && t >= T.blackAt && to > 0 ? "block" : "none"); setS(pre, "opacity", f2(to));
    ctx.tones.forEach(e => setS(e, "opacity", f2(burst ? 0 : to)));
    setS(q(L, "hfx-tone"), "opacity", f2(burst ? to : 0));
    const cut = ctx.cut, nrm = cut.n;
    const side0 = (x, y) => ((x - cut.p[0]) * nrm[0] + (y - cut.p[1]) * nrm[1]) < 0 ? 0 : 1;
    const hfT = (i, p) => { const f = t < T.splitAt ? 0 : t < T.splitAt + 33 ? .5 : 1, k = reduced ? .55 : 1, side = i ? 1 : -1, dist = 35 * f * k;
      return [p[0] + nrm[0] * side * dist, p[1] + nrm[1] * side * dist]; };
    if (t >= T.blackAt && !burst) {   // 發光的眼睛（疊在反黑之上；斬開後跟著兩半移動）
      const gp = seg(t, T.blackAt, T.lineAt), fr0 = rad(pz[2]), cs = Math.cos(fr0), sn = Math.sin(fr0);
      ctx.eyes.forEach(e => {
        const px = e[0] - ctx.cm[0], py = e[1] - ctx.cm[1]; let x = ctx.cm[0] + cs * px - sn * py + pz[0], y = ctx.cm[1] + sn * px + cs * py + pz[1];
        if (split) { const qq = hfT(side0(x, y), [x, y]); x = qq[0]; y = qq[1]; }
        const r = reduced ? 1 : 1 + Math.floor(gp * 4) + (Math.floor((t - T.blackAt) / 90) % 2);
        g2.globalAlpha = .22; g2.fillStyle = ctx.eyeCol; g2.fillRect(Math.round(x / 2) - 2 - r, Math.round(y / 2) - 2 - r, 4 + 2 * r, 4 + 2 * r);
        g2.globalAlpha = 1; g2.fillRect(Math.round(x / 2) - 2, Math.round(y / 2) - 2, 4, 4);
        if (gp > .35) { g2.fillStyle = "#ffffff"; g2.fillRect(Math.round(x / 2) - 1, Math.round(y / 2) - 1, 2, 2); }
      });
    }
    if (t >= T.gatherAt && t < T.lineAt) {   // 正在聚集的光：光點聚到同一條切線，線從通過點向畫面兩側長出來
      const gp = seg(t, T.gatherAt, T.lineAt), f = Math.pow(gp, 1.5) * .5;
      const col = gp < .35 ? "#a8741a" : gp < .7 ? "#ffcc33" : "#ffffff", wd = gp < .5 ? 1 : 2;
      g2.fillStyle = toneCol(ctx.tone, col); drawCutLine(g2, cut, f, wd, (x, y, w) => g2.fillRect(x - (w >> 1), y - (w >> 1), w, w));
      for (let i = 0; i < (reduced ? 10 : 24); i++) {
        const p = (gp * 1.3 + rnd(i * 1.9)) % 1, k = p * p, along = (rnd(i * 2.7) - .5) * cut.span * 1.5, side = rnd(i * 3.1) < .5 ? -1 : 1, away = 150 + rnd(i * 4.3) * 230;
        const x = cut.p[0] + cut.d[0] * along + (cut.n[0] * side * away + cut.d[0] * (rnd(i * 5.7) - .5) * 80) * (1 - k);
        const y = cut.p[1] + cut.d[1] * along + (cut.n[1] * side * away + cut.d[1] * (rnd(i * 5.7) - .5) * 80) * (1 - k);
        g2.fillStyle = toneCol(ctx.tone, i % 3 ? "#ffcc33" : "#ffffff"); g2.fillRect(Math.round(x / 2), Math.round(y / 2), p > .8 ? 1 : 2, p > .8 ? 1 : 2);
      }
    }
    /* ===== 三、斬開（2900）：沿用丙 ===== */
    if (t >= T.lineAt && t < T.splitAt) {   // 一條依套路方向、任意角度都貫穿整個畫面的亮線（紅綠藍錯開）
      const gr = [.5, .75, 1][Math.min(2, Math.floor((t - T.lineAt) / 20))];
      drawCutLine(g2, cut, gr, 2, (x, y) => {
        if (!reduced) { const lo = ctx.tone === "hell" ? ["#ff2a2a", "#ff9a1f", "#ffd9c0"] : ctx.tone === "heaven" ? ["#ffe0a0", "#fffbe8", "#7fe3ff"] : ["#ff2a2a", "#2aff2a", "#2a6aff"];
          g2.globalCompositeOperation = "lighter"; g2.fillStyle = lo[0]; g2.fillRect(x - 3, y - 1, 3, 2); g2.fillStyle = lo[1]; g2.fillRect(x - 1, y - 1, 3, 2); g2.fillStyle = lo[2]; g2.fillRect(x + 1, y - 1, 3, 2); g2.globalCompositeOperation = "source-over"; }
        g2.fillStyle = reduced ? toneCol(ctx.tone, "#ffe0a0") : toneCol(ctx.tone, "#ffffff"); g2.fillRect(x - 1, y - 1, 2, 2);
      });
    }
    if (t >= T.splitAt && t < T.burstAt) {   // 縫裡迸出的火花
      const dU = cut.d, n2 = cut.n, st = Math.floor(t / 50);
      for (let i = 0; i < (reduced ? 8 : 22); i++) {
        const p = (rnd(i * 3.3 + st) - .5) * H * 1.1, o = (rnd(i * 5.1 + st) - .5) * 40;
        g2.fillStyle = toneCol(ctx.tone, GOLDS[Math.floor(rnd(i * 7.7 + st) * 4)]); g2.fillRect(Math.round((cut.p[0] + dU[0] * p + n2[0] * o) / 2), Math.round((cut.p[1] + dU[1] * p + n2[1] * o) / 2), 1 + (i % 2), 1 + (i % 2));
      }
    }
    setS(world, "display", split ? "block" : "none");
    ctx.hf.forEach((h, i) => {
      const f = t < T.splitAt ? 0 : t < T.splitAt + 33 ? .5 : 1, k = reduced ? .55 : 1, side = i ? 1 : -1, dist = 35 * f * k;
      setS(h, "transform", "translate3d(" + Math.round(nrm[0] * side * dist) + "px," + Math.round(nrm[1] * side * dist) + "px,0)");
    });
    ctx.hp.forEach(h => setS(h, "display", burst ? "none" : "block"));
    if (split && !burst) {   // 光柱：切開的瞬間就從縫裡透出（紅綠藍色差、略傾斜）
      const pw = reduced ? 34 : 40;
      setS(pil, "left", cut.p[0] + "px"); setS(pil, "top", (cut.p[1] - cut.span) + "px"); setS(pil, "bottom", "auto"); setS(pil, "height", (cut.span * 2) + "px");
      setS(pil, "width", pw + "px"); setS(pil, "marginLeft", (-pw / 2) + "px"); setS(pil, "transformOrigin", "50% 50%"); setS(pil, "transform", "rotate(" + (cut.angle - 90) + "deg)"); setS(pil, "opacity", "1");
      if (pil.classList.contains("rgb") !== !reduced) pil.classList.toggle("rgb", !reduced);
    }
    if (burst) {
      const u = t - T.burstAt, tau = Math.floor(u / 33) * 33 / 1000;
      ctx.shards.forEach(s => {
        if (!s.on) { s.on = true; s.el.style.display = ""; s.el.style.willChange = "transform, opacity"; }
        const k = reduced ? .35 : 1, x = s.vx * k * tau, y = reduced ? s.vy * k * tau : s.vy * tau + .5 * G * tau * tau;
        const rot = reduced ? 0 : Math.round(s.w * tau / 15) * 15;
        const tf = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0) rotate(" + rot + "deg)";
        const op = f2(step6(1 - seg(u, T.flyMs * (reduced ? .2 : .6), T.flyMs)));
        if (s.tf !== tf) { s.tf = tf; s.el.style.transform = tf; } if (s.op !== op) { s.op = op; s.el.style.opacity = op; }
      });
      const pw = 44 + (reduced ? -4 : (Math.floor(u / 133) % 2) * 4), fo = step6(1 - seg(t, T.fadeAt, T.fadeEnd));
      if (pil.classList.contains("rgb")) pil.classList.remove("rgb");
      setS(pil, "transform", "rotate(" + (cut.angle - 90) + "deg)");
      setS(pil, "width", pw + "px"); setS(pil, "marginLeft", (-pw / 2) + "px"); setS(pil, "opacity", String(fo));
      if (u > 80) ctx.deb.forEach(d => { if (Math.floor((t / 100 + d.ph * 10)) % 5 === 0) return; const y = ((d.y - d.v * u / 1000) % H + H) % H; g2.fillStyle = d.c; g2.fillRect(Math.round(d.x / 2), Math.round(y / 2), d.s, d.s); });
      const a = u / 1000;   // 怪物崩成碎塊
      ctx.chips.forEach(c => { if (a > c.life) return; if (a > c.life * .7 && Math.floor(a * 30) % 2) return; g2.fillStyle = c.col; g2.fillRect(Math.round((c.x + c.vx * a) / 2), Math.round((c.y + c.vy * a + .5 * 1500 * a * a) / 2), ctx.cp, ctx.cp); });
    }
    /* ===== 四、勝利（3900～）：金色立體字衝向鏡頭定格（減少特效：只淡入），光掃過，階梯淡出 ===== */
    const wf = step6(1 - seg(t, T.fadeAt, T.fadeEnd)), wu = t - T.winAt;
    ctx.vl.forEach((el, i) => {
      let op = 0, sc = 1;
      if (reduced) { if (i === 0) op = step6(seg(wu, 0, 240)) * wf; }
      else { const u = wu - i * 33; if (u >= 0) { const k = Math.floor(u / 33); if (i === 0) { sc = WIN_SCALE[Math.min(WIN_SCALE.length - 1, k)]; op = wf; } else if (k < WIN_SCALE.length) { sc = WIN_SCALE[k]; op = (i === 1 ? .5 : .25) * wf; } } }
      setS(el, "opacity", f2(op)); setS(el, "transform", "scale(" + sc + ")");
    });
    const k8 = Math.floor((wu - 420) / 40);
    ctx.sh.forEach((e, i) => { if (!reduced && k8 >= 0 && k8 <= 7) { const s = -0.3 + k8 * (2.6 / 7); setS(e, "visibility", "visible"); setS(e, "backgroundPosition", ((2 - (s - i)) / 3 * 100).toFixed(1) + "% 0"); } else setS(e, "visibility", "hidden"); });
    /* ===== 晃動：每刀命中後小晃一下，最後一刀、斬開、碎裂、字定格各一下（整數像素、階梯式；減少特效不晃） ===== */
    let sx = 0, sy = 0;
    if (!reduced) {
      const evs = [{ at: T.splitAt, d: 260, a: 14 }, { at: T.burstAt, d: 260, a: 9 }, { at: T.winAt + 200, d: 150, a: 6 }];
      combo.hits.forEach(h => evs.push({ at: h.r + h.h, d: h.heavy ? 220 : 110, a: h.sh }));
      let best = null; for (const ev of evs) { const rel = t - ev.at; if (rel >= 0 && rel < ev.d) { const amp = ev.a * (1 - rel / ev.d); if (!best || amp > best.amp) best = { amp, step: Math.floor(rel / 33), seed: ev.at }; } }
      if (best) { sx = Math.round((rnd(best.step * 2 + best.seed) - .5) * 2 * best.amp); sy = Math.round((rnd(best.step * 2 + best.seed + 1) - .5) * 1.4 * best.amp); }
    }
    const wt = "translate3d(" + sx + "px," + sy + "px,0)";
    setS(world, "transform", wt); setS(ctx.cv, "transform", wt);
    ctx.roots.forEach(r => setS(r.el, "transform", split ? r.orig : (r.orig ? wt + " " + r.orig : wt)));   // 斬開之前，真實畫面（資訊列、場景、導覽列）本身跟著晃
  }

  function renderDown(t, dur) {
    const L = S.ctx.L;
    setS(q(L, "hfx-dim"), "opacity", String(Math.round(.55 * Math.min(seg(t, 0, 500), 1 - seg(t, dur - 350, dur)) * 8) / 8));
    setS(q(L, "hfx-label"), "opacity", String(Math.round(Math.min(seg(t, 300, 550), 1 - seg(t, dur - 400, dur - 120)) * 6) / 6));
  }

  function cleanup() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    const ctx = S.ctx, L = ctx.L;
    L.classList.remove("on");
    if (ctx.mon) { ctx.mon.style.transform = ctx.monOrig.transform; ctx.mon.style.animation = ctx.monOrig.animation; ctx.mon.classList.remove("mw", "mg", "mh"); delete ctx.mon._fc; delete ctx.mon._transform; }
    ctx.roots.forEach(r => { r.el.style.transform = r.orig; delete r.el._transform; });
    q(L, "hfx-cut").innerHTML = ""; q(L, "hfx-vic").innerHTML = ""; q(L, "hfx-hits").innerHTML = "";
    const lab = q(L, "hfx-label"); lab.className = "hfx-label"; lab.textContent = "";
    ["hfx-world", "hfx-pretone", "hfx-tone", "hfx-hits", "hfx-dim", "hfx-label", "hfx-cv"].forEach(c => { const e = q(L, c); e.removeAttribute("style"); for (const k of Object.keys(e)) if (k[0] === "_") delete e[k]; });
    const pil = q(L, "pil"); pil.removeAttribute("style"); pil.classList.remove("rgb"); for (const k of Object.keys(pil)) if (k[0] === "_") delete pil[k];
    const cv = q(L, "hfx-cv"); cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
    S = null;
  }
  function finish() { const done = S && S.onDone; cleanup(); if (done) done(); }
  /* 中途中止（切到別的畫面、分頁到背景）：不呼叫 onDone，狀態仍是「演出待播」，回來會從頭補播 */
  function abort() { cleanup(); }

  /* opts: { app, monEl(.hunt-mon), sceneEl, variant, combo(0突刺→C／1橫掃→A／2蓄力→B), kind: "kill"|"down", reduced, scale(減少特效的時間縮放), totalMs, downMs, win, comboText, downText, onDone } */
  function play(opts) {
    if (S) cleanup();
    const app = opts.app, L = ensureLayer(app), reduced = !!opts.reduced;
    const rect = app.getBoundingClientRect(), W = rect.width, H = rect.height;
    const cv = q(L, "hfx-cv"), g2 = cv.getContext("2d");
    const scale = reduced ? (opts.scale || .75) : 1;
    cv.width = Math.ceil(W / 2); cv.height = Math.ceil(H / 2); g2.imageSmoothingEnabled = false;
    const combo = COMBOS[Math.max(0, Math.min(2, opts.combo | 0))];
    const roots = ["hud", "screens", "nav"].map(id => document.getElementById(id)).filter(Boolean).map(el => ({ el, orig: el.style.transform || "" }));
    const mon = opts.monEl || null;
    L.dataset.realm = opts.tone || "";   // 狹間的擊殺演出：天堂（金白）／地獄（赤紅）色調（CSS 與刀光顏色）
    const ctx = { L, rect, W, H, cv, g2, reduced, combo, mon, tone: opts.tone || "", roots, monOrig: mon ? { transform: mon.style.transform || "", animation: mon.style.animation || "" } : null,
      ic: [W / 2, Math.round(H * .46)], wy: Math.round(H * .30), hf: [], hp: [], tones: [], shards: [], chips: [], deb: [], vl: [], sh: [], dms: [], eyes: [] };
    S = { ctx, onDone: opts.onDone, start: 0, kind: opts.kind, raf: 0 };
    let total;
    if (opts.kind === "down") {
      total = (opts.downMs || 1500) * scale;
      const lab = q(L, "hfx-label"); lab.textContent = opts.downText || "倒下了……"; lab.className = "hfx-label down";
      L.classList.add("on");
    } else {
      total = (opts.totalMs || T.total) * scale;
      L.classList.add("on");
      try { buildKill(ctx, opts, L); }
      catch (e) { cleanup(); throw e; }
      if (mon) mon.style.animation = "none";   // 怪物原本的上下晃動先停掉，姿勢由演出控制
      ctx.hp = [...q(L, "hfx-cut").querySelectorAll(".hfx-hp")];
      q(L, "hfx-pretone").style.background = "#000";
    }
    S.total = total; S.scale = scale; S.start = performance.now();
    const frame = now => {
      if (!S) return;
      const t = (now - S.start) / scale;
      if (now - S.start >= S.total) return finish();
      try { if (S.kind === "down") renderDown(Math.max(0, t), S.total / scale); else render(Math.max(0, t)); }
      catch (e) { console.error("斬擊演出出錯：" + (e && e.message)); return finish(); }   // 出錯也要收尾，不能把畫面卡住（演出圖層會擋點擊）
      S.raf = requestAnimationFrame(frame);
    };
    if (opts.kind === "down") renderDown(0, total / scale); else render(0);
    S.raf = requestAnimationFrame(frame);
  }
  /* 測試用：停在指定時間（演出時間 ms）擷取畫面。HuntFx.seek(opts, t)；HuntFx.release() 還原；HuntFx.stats() 回報碎片數與節點數 */
  function seek(opts, t) { if (!S || !S.manual) { opts.onDone = null; play(opts); cancelAnimationFrame(S.raf); S.manual = true; } if (S.kind === "down") renderDown(t, S.total / S.scale); else render(t); }
  const stats = () => (S && S.ctx.stats) || null;
  const playing = () => !!S;

  root.HuntFx = { play, abort, seek, release: abort, playing, stats, COMBOS, cutGeom, T };
})(typeof window !== "undefined" ? window : globalThis);
