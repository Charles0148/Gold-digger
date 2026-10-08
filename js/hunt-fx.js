/* =========================================================
   冒險狩獵礦坑：斬擊演出「丙」＋「反黑」＋金色「勝利」，以及「倒下」演出
   - 瀏覽器：window.HuntFx。只做畫面，不碰存檔；演出播完呼叫 onDone，呼叫端才往下一步走
   - 來源：Claude outputs/斬擊碎裂候選稿_2026-10-08/ 的丙版（擁有者 2026-10-08 定案：丙＋反黑，每隻怪都播、不能跳過）。毫秒數見該資料夾說明.md
   - 流程（總長 2400 毫秒）：
       0～400     蓄力：整個畫面偏金、逐格變亮，金色光點往中線聚集
       400～532   反黑：全螢幕黑閃 66ms，之後整個畫面維持暗到幾乎全黑（88%）到碎裂
       440～500   一條略斜（7 度）、從最上貫穿到最下的亮線（紅黃藍錯開）
       500～830   整個畫面沿切線分成左右兩大塊，往反方向錯開約 32 像素並停住 330ms；停住期間畫面反黑，只留切線與縫裡的光
       830～1450  兩塊各自碎成 22 片玻璃飛散，色調還原；怪物崩成碎塊；光柱轉正、白金色
       1300～     金色立體「勝利」從遠處衝向鏡頭定格，之後一道光掃過；2150～2400 階梯淡出；結束後畫面完整復原
   - 「整個畫面」＝ #hud、目前的畫面（資訊列、場景、敘述框、選項、按鈕）、#nav，全部跟著切開、碎裂
   - 效能（寫在這裡給之後的人）：候選稿每一片碎片都是「整個畫面的完整副本」（約 1500 個節點）。正式畫面節點多得多，照搬會到數千個。
     做法＝「凍結快照＋逐片裁切」：播放前量一次真實畫面，把每個有版面的元素凍成「絕對定位＋量到的位置與大小」的範本（只複製一次、不放進畫面）；
     兩大塊與 22 片碎片各自從範本長出副本時，只保留「和那一塊範圍有重疊」的元素（整棵子樹丟掉不相交的）。
     所以每片碎片只有自己範圍內的十幾個節點，總量約兩大塊＋22 片小碎片，不是 24 份整屏。圖像用 <img>（內嵌 SVG），不是一堆方塊。
     碎片只用位移＋旋轉＋透明度（不重排），位置每 33ms 更新一次；亮線、碎屑、怪物碎塊畫在一張半解析度（1 點＝2 像素）的小畫布上。
   - 閃光規則（審查員）：任何 1 秒內亮度／顏色突變不超過 3 次。反黑的「進入」與「恢復」各算 1 次（中間隔 330ms），整段只有這 2 次；
     兩次演出之間至少 2.4 秒；勝利字、光柱、亮線都不閃爍。
   - 減少特效：不閃（反黑改成約 0.1 秒漸暗到 44%）、不晃動、不旋轉、碎片減到 8 片（4 條放射裂紋）、兩塊只錯開 55%、亮線不做色差、整段縮短為 85%
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
  const TILT = 7;   // 切線傾斜角（度）：上端偏右
  /* 丙的時間表（演出時間 ms） */
  const P = { total: 2400, chargeEnd: 400, flashAt: 400, lineAt: 440, splitAt: 500, burstAt: 830, flyMs: 620, winAt: 1300, fadeAt: 2150, fadeEnd: 2400, K: 6, radii: [0, 70, 170, 330, 1000], G: 900 };
  const RADII_RED = [0, 130, 1000];
  const TONE_OP = 0.88;   // 反黑：黑色蓋上去的濃度
  const WIN_SCALE = [.12, .22, .38, .6, .95, 1.5, 1.7, 1.35, 1.12, 1.0];   // 每格 33ms：從遠處衝向鏡頭，過頭一點再定格
  const GOLDS = ["#ffffff", "#ffe0a0", "#ffcc33", "#ff9a1f"];

  let S = null;       // 目前正在播的演出
  let layer = null;   // #huntFx

  function ensureLayer(app) {
    if (layer && layer.parentNode === app) return layer;
    layer = document.createElement("div");
    layer.id = "huntFx"; layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<div class="hfx-world"><div class="hfx-back"><div class="pil"></div></div><div class="hfx-cut"></div><div class="hfx-tone"></div></div>' +
      '<canvas class="hfx-cv"></canvas><div class="hfx-tint"></div><div class="hfx-pretone"></div><div class="hfx-dim"></div><div class="hfx-flash"></div><div class="hfx-vic"></div><div class="hfx-label"></div>';
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
    const R = radii.length - 1, rot = pin !== undefined ? pin : rnd(seed) * 6.28, ang = [];
    for (let k = 0; k < K; k++) ang.push(rot + (k + ((pin !== undefined && (k === 0 || k === K / 2)) ? 0 : (rnd(seed + k + 1) - .5) * .55)) / K * Math.PI * 2);
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

  /* ---------- 建立斬擊場景（播放前一次做完） ---------- */
  function buildKill(ctx, opts, L) {
    const W = ctx.W, H = ctx.H, reduced = ctx.reduced, ic = ctx.ic;
    const th = rad(TILT), nn = [Math.cos(th), Math.sin(th)];
    const tpl = snapshot(opts.app, ctx.rect);
    // 勝利字樣：本體＋兩層殘影（衝向鏡頭時的速度線）
    const g = ch => '<span class="hv-g"><span class="hv-t">' + ch + '</span><span class="hv-t hv-sh">' + ch + "</span></span>";
    const vic = q(L, "hfx-vic");
    vic.innerHTML = ["m", "t1", "t2"].map(k => '<div class="hv-l ' + k + '" style="top:' + ctx.wy + 'px">' + g("勝") + g("利") + "</div>").join("");
    ctx.vl = [...vic.querySelectorAll(".hv-l")]; ctx.sh = [...ctx.vl[0].querySelectorAll(".hv-sh")];
    // 兩大塊：整個畫面沿切線分成左右兩半（各自的副本，只留和那一半有重疊的元素）
    const cut = q(L, "hfx-cut"), K = reduced ? 4 : P.K, radii = reduced ? RADII_RED : P.radii;
    cut.innerHTML = "";
    ctx.hf = [0, 1].map(() => { const h = document.createElement("div"); h.className = "hfx-hf"; h.style.transformOrigin = (W / 2) + "px " + (H / 2) + "px"; cut.appendChild(h); return h; });
    const rectP = [[0, 0], [W, 0], [W, H], [0, H]]; ctx.tones = [];
    [-1, 1].forEach((side, i) => {
      const poly = clipPlane(rectP, [ic[0] - nn[0] * side * OV, ic[1] - nn[1] * side * OV], [nn[0] * side, nn[1] * side]);
      const el = document.createElement("div"); el.className = "hfx-hp";
      el.style.clipPath = "polygon(" + poly.map(p => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",") + ")";
      const keep = r => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].some(p => side * ((p[0] - ic[0]) * nn[0] + (p[1] - ic[1]) * nn[1]) >= -2);
      el.appendChild(build(tpl, keep));
      const tone = document.createElement("div"); tone.className = "hfx-tone-in"; el.appendChild(tone); ctx.tones.push(tone);
      ctx.hf[i].appendChild(el);
    });
    // 22 片玻璃（碎裂瞬間才顯示）：每片只複製和自己範圍有重疊的元素
    const polys = makeShards(W, H, ic, K, radii, 11, Math.atan2(-Math.cos(th), Math.sin(th)));
    ctx.shards = []; let nodes = 0;
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
      ctx.hf[((gx - ic[0]) * nn[0] + (gy - ic[1]) * nn[1]) < 0 ? 0 : 1].appendChild(el);
      let dx = gx - ic[0], dy = gy - ic[1]; const d = Math.hypot(dx, dy);
      if (d < 1) { const a = rnd(i + 5) * 6.28; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
      const sp = ([520, 470, 430, 600][s.ring] || 480) * (.8 + rnd(i * 3.3) * .45);
      ctx.shards.push({ el, vx: dx * sp, vy: dy * sp - 140, w: (rnd(i * 7.7) - .5) * 2 * 520, tf: "", op: "", on: false });
    });
    ctx.stats = { shards: ctx.shards.length, nodes: cut.querySelectorAll("*").length + vic.querySelectorAll("*").length + 4 };
    // 怪物崩成的碎塊（取怪物自己的像素，每 2×2 格併成一塊）
    const m = opts.monEl ? opts.monEl.getBoundingClientRect() : null, MC = root.HuntMon && root.HuntMon.cells(opts.variant || 0);
    ctx.chips = [];
    if (m && MC) {
      const sx = m.left - ctx.rect.left, sy = m.top - ctx.rect.top, cp = m.width / MC.w, kk = cp / 7;
      ctx.cm = [sx + m.width / 2, sy + m.height / 2]; ctx.cp = Math.max(2, Math.round(cp));
      for (let by = 0; by < MC.h; by += 2) for (let bx = 0; bx < MC.w; bx += 2) {
        let col = null; for (let y = by; y < by + 2 && !col; y++) for (let x = bx; x < bx + 2; x++) if (MC.cell[y] && MC.cell[y][x]) { col = MC.cell[y][x]; break; }
        if (!col) continue;
        const i = ctx.chips.length + (reduced ? 1 : 0);
        if (reduced && ctx.chips.length % 2) { ctx.chips.push(null); continue; }
        const x0 = sx + (bx + 1) * cp, y0 = sy + (by + 1) * cp;
        ctx.chips.push({ x: x0, y: y0, vx: ((x0 - ctx.cm[0]) * 2.2 + (rnd(i) - .5) * 120) * kk, vy: (-(120 + rnd(i + .4) * 300) + (y0 - ctx.cm[1]) * .6) * kk, col: col === "#07070b" ? "#7771b8" : col, life: .8 + rnd(i + .8) * .5 });
      }
      ctx.chips = ctx.chips.filter(Boolean);
    } else ctx.cm = [W / 2, H * .4];
    // 後層的碎屑（緩緩上飄的小光點）
    ctx.deb = []; const nd = reduced ? 12 : 30;
    for (let i = 0; i < nd; i++) ctx.deb.push({ x: W / 2 + (rnd(i * 2.1) - .5) * 150, y: rnd(i * 3.7) * H, v: 30 + rnd(i * 5.1) * 70, s: 1 + Math.floor(rnd(i * 6.3) * 2), c: GOLDS[Math.floor(rnd(i * 9.1) * 4)], ph: rnd(i * 4.4) });
  }

  /* ---------- 每一格的畫面（t＝演出時間 ms，已除掉減少特效的時間縮放） ---------- */
  function render(t) {
    const ctx = S.ctx, W = ctx.W, H = ctx.H, ic = ctx.ic, reduced = ctx.reduced, g2 = ctx.g2, L = ctx.L;
    g2.clearRect(0, 0, ctx.cv.width, ctx.cv.height);
    const world = q(L, "hfx-world"), pil = q(L, "pil"), split = t >= P.splitAt, burst = t >= P.burstAt;
    /* 蓄力：整個畫面偏金、逐格變亮；金色光點往中線聚集 */
    let tint = 0;
    if (t < P.flashAt) tint = Math.round((reduced ? .2 : .42) * Math.pow(seg(t, 0, P.chargeEnd), 1.6) / .05) * .05;
    else if (reduced) { const r = t - P.flashAt; tint = r < 200 ? Math.round(.35 * (1 - r / 200) / .05) * .05 : 0; }
    setS(q(L, "hfx-tint"), "opacity", f2(tint * .7));
    if (t < P.flashAt) {
      const nm = reduced ? 10 : 26;
      for (let i = 0; i < nm; i++) {
        const p = ((t / P.chargeEnd) * 1.3 + rnd(i * 1.9)) % 1, a = rnd(i * 2.7) * 6.28, R0 = 160 + rnd(i * 3.1) * 240, k = p * p;
        const x = ic[0] + Math.cos(a) * R0 * (1 - k), y = ic[1] + Math.sin(a) * R0 * (1 - k) * 1.3;
        g2.fillStyle = i % 3 ? "#ffcc33" : "#ffffff"; g2.fillRect(Math.round(x / 2), Math.round(y / 2), p > .8 ? 1 : 2, p > .8 ? 1 : 2);
      }
    }
    /* 反黑：全螢幕黑閃 66ms（之後 33ms 一階衰減），整個畫面維持暗到幾乎全黑到碎裂；碎裂後 66ms 兩格還原。
       減少特效：不閃，改成 3 格（約 0.1 秒）漸暗到 44%，碎裂後同樣還原 */
    let fl = 0; const fr = t - P.flashAt;
    if (!reduced && fr >= 0) fl = fr < 66 ? .9 : fr < 99 ? .5 : fr < 132 ? .22 : 0;
    setS(q(L, "hfx-flash"), "opacity", f2(fl));
    let to = 0; const full = TONE_OP * (reduced ? .5 : 1);
    if (t >= P.flashAt && t < P.burstAt) to = reduced ? full * Math.min(3, Math.floor((t - P.flashAt) / 33) + 1) / 3 : TONE_OP;
    const pre = q(L, "hfx-pretone");
    setS(pre, "display", !split && to > 0 ? "block" : "none"); setS(pre, "opacity", f2(to));
    ctx.tones.forEach(e => setS(e, "opacity", f2(to)));
    const rec = t >= P.burstAt && t < P.burstAt + 66 ? (t - P.burstAt < 33 ? .5 : 0) * full : 0;
    const t2 = q(L, "hfx-tone"); setS(t2, "opacity", f2(rec));
    /* 亮線：一條貫穿整個畫面、略微傾斜的亮線（紅黃藍錯開）；縫裡迸出的火花 */
    if (t >= P.lineAt && t < P.splitAt) {
      const gr = [.3, .6, 1][Math.min(2, Math.floor((t - P.lineAt) / 20))], cx2 = ic[0] / 2, cy2 = ic[1] / 2, tn = Math.tan(rad(TILT));
      const y0 = Math.round(cy2 - gr * cy2), y1 = Math.round(cy2 + gr * (H / 2 - cy2));
      for (let y = y0; y < y1; y++) {
        const x = Math.round(cx2 + (cy2 - y) * tn);
        if (!reduced) { g2.globalCompositeOperation = "lighter"; g2.fillStyle = "#ff2a2a"; g2.fillRect(x - 4, y, 3, 1); g2.fillStyle = "#2aff2a"; g2.fillRect(x - 3, y, 4, 1); g2.fillStyle = "#2a6aff"; g2.fillRect(x - 1, y, 4, 1); g2.globalCompositeOperation = "source-over"; }
        g2.fillStyle = reduced ? "#ffe0a0" : "#ffffff"; g2.fillRect(x - 1, y, 2, 1);
      }
    }
    if (t >= P.splitAt && t < P.burstAt) {
      const tn = rad(TILT), dU = [Math.sin(tn), -Math.cos(tn)], n2 = [Math.cos(tn), Math.sin(tn)], st = Math.floor(t / 50);
      for (let i = 0; i < (reduced ? 8 : 22); i++) {
        const p = (rnd(i * 3.3 + st) - .5) * H * 1.1, o = (rnd(i * 5.1 + st) - .5) * 40;
        g2.fillStyle = GOLDS[Math.floor(rnd(i * 7.7 + st) * 4)]; g2.fillRect(Math.round((ic[0] + dU[0] * p + n2[0] * o) / 2), Math.round((ic[1] + dU[1] * p + n2[1] * o) / 2), 1 + (i % 2), 1 + (i % 2));
      }
    }
    /* 切開：整個畫面沿切線分成左右兩大塊，往反方向明顯錯開（略帶傾斜），停住 330ms 讓人看清楚 */
    setS(world, "display", split ? "block" : "none");
    ctx.hf.forEach((h, i) => {
      const f = t < P.splitAt ? 0 : t < P.splitAt + 33 ? .5 : 1, k = reduced ? .55 : 1, o = i ? [14, 32, 1.8] : [-14, -32, -1.8];
      setS(h, "transform", "translate3d(" + Math.round(o[0] * f * k) + "px," + Math.round(o[1] * f * k) + "px,0) rotate(" + (reduced ? 0 : o[2] * f) + "deg)");
    });
    ctx.hp.forEach(h => setS(h, "display", burst ? "none" : "block"));
    /* 光柱：切開的瞬間就從縫裡透出（紅綠藍色差、略傾斜），碎裂後轉正、白金色，之後緩緩呼吸 */
    if (split && !burst) {
      setS(pil, "width", (reduced ? 34 : 40) + "px"); setS(pil, "marginLeft", (reduced ? -17 : -20) + "px"); setS(pil, "transform", "rotate(" + TILT + "deg)"); setS(pil, "opacity", "1");
      if (pil.classList.contains("rgb") !== !reduced) pil.classList.toggle("rgb", !reduced);
    }
    if (burst) {
      const u = t - P.burstAt, tau = Math.floor(u / 33) * 33 / 1000;
      ctx.shards.forEach(s => {
        if (!s.on) { s.on = true; s.el.style.display = ""; s.el.style.willChange = "transform, opacity"; }
        const k = reduced ? .35 : 1, x = s.vx * k * tau, y = reduced ? s.vy * k * tau : s.vy * tau + .5 * P.G * tau * tau;
        const rot = reduced ? 0 : Math.round(s.w * tau / 15) * 15;
        const tf = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0) rotate(" + rot + "deg)";
        const op = f2(step6(1 - seg(u, P.flyMs * (reduced ? .2 : .6), P.flyMs)));
        if (s.tf !== tf) { s.tf = tf; s.el.style.transform = tf; } if (s.op !== op) { s.op = op; s.el.style.opacity = op; }
      });
      const pw = 44 + (reduced ? -4 : (Math.floor(u / 133) % 2) * 4), fo = step6(1 - seg(t, P.fadeAt, P.fadeEnd));
      if (pil.classList.contains("rgb")) pil.classList.remove("rgb");
      setS(pil, "transform", "rotate(" + [TILT, TILT / 2, 0][Math.min(2, Math.floor(u / 33))] + "deg)");
      setS(pil, "width", pw + "px"); setS(pil, "marginLeft", (-pw / 2) + "px"); setS(pil, "opacity", String(fo));
      if (u > 80) ctx.deb.forEach(d => { if (Math.floor((t / 100 + d.ph * 10)) % 5 === 0) return; const y = ((d.y - d.v * u / 1000) % H + H) % H; g2.fillStyle = d.c; g2.fillRect(Math.round(d.x / 2), Math.round(y / 2), d.s, d.s); });
      const a = u / 1000;   // 怪物崩成碎塊
      ctx.chips.forEach(c => { if (a > c.life) return; if (a > c.life * .7 && Math.floor(a * 30) % 2) return; g2.fillStyle = c.col; g2.fillRect(Math.round((c.x + c.vx * a) / 2), Math.round((c.y + c.vy * a + .5 * 1500 * a * a) / 2), ctx.cp, ctx.cp); });
    }
    /* 勝利：金色厚重立體字，從遠處高速衝向鏡頭後定格（減少特效：只做階梯淡入）；之後一道光掃過 */
    const wf = step6(1 - seg(t, P.fadeAt, P.fadeEnd)), wu = t - P.winAt;
    ctx.vl.forEach((el, i) => {
      let op = 0, sc = 1;
      if (reduced) { if (i === 0) op = step6(seg(wu, 0, 240)) * wf; }
      else { const u = wu - i * 33; if (u >= 0) { const k = Math.floor(u / 33); if (i === 0) { sc = WIN_SCALE[Math.min(WIN_SCALE.length - 1, k)]; op = wf; } else if (k < WIN_SCALE.length) { sc = WIN_SCALE[k]; op = (i === 1 ? .5 : .25) * wf; } } }
      setS(el, "opacity", f2(op)); setS(el, "transform", "scale(" + sc + ")");
    });
    const k8 = Math.floor((wu - 420) / 40);
    ctx.sh.forEach((e, i) => { if (!reduced && k8 >= 0 && k8 <= 7) { const s = -0.3 + k8 * (2.6 / 7); setS(e, "visibility", "visible"); setS(e, "backgroundPosition", ((2 - (s - i)) / 3 * 100).toFixed(1) + "% 0"); } else setS(e, "visibility", "hidden"); });
    /* 晃動：切開、碎裂、字定格各一下（整數像素、階梯式；減少特效時不晃）。晃的是切開後的「世界」（兩塊、碎片、後層） */
    let sx = 0, sy = 0;
    if (!reduced) {
      const evs = [{ at: P.splitAt, d: 260, a: 14 }, { at: P.burstAt, d: 260, a: 9 }, { at: P.winAt + 200, d: 150, a: 6 }];
      let best = null; for (const ev of evs) { const rel = t - ev.at; if (rel >= 0 && rel < ev.d) { const amp = ev.a * (1 - rel / ev.d); if (!best || amp > best.amp) best = { amp, step: Math.floor(rel / 33), seed: ev.at }; } }
      if (best) { sx = Math.round((rnd(best.step * 2 + best.seed) - .5) * 2 * best.amp); sy = Math.round((rnd(best.step * 2 + best.seed + 1) - .5) * 1.4 * best.amp); }
    }
    setS(world, "transform", "translate3d(" + sx + "px," + sy + "px,0)");
  }

  function renderDown(t, dur) {
    const L = S.ctx.L;
    setS(q(L, "hfx-dim"), "opacity", String(Math.round(.55 * Math.min(seg(t, 0, 500), 1 - seg(t, dur - 350, dur)) * 8) / 8));
    setS(q(L, "hfx-label"), "opacity", String(Math.round(Math.min(seg(t, 300, 550), 1 - seg(t, dur - 400, dur - 120)) * 6) / 6));
  }

  function cleanup() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    const L = S.ctx.L;
    L.classList.remove("on");
    q(L, "hfx-cut").innerHTML = ""; q(L, "hfx-vic").innerHTML = "";
    const lab = q(L, "hfx-label"); lab.className = "hfx-label"; lab.textContent = "";
    ["hfx-world", "hfx-pretone", "hfx-tone", "hfx-tint", "hfx-dim", "hfx-flash", "hfx-label"].forEach(c => { const e = q(L, c); e.removeAttribute("style"); for (const k of Object.keys(e)) if (k[0] === "_") delete e[k]; });
    const pil = q(L, "pil"); pil.removeAttribute("style"); pil.classList.remove("rgb"); for (const k of Object.keys(pil)) if (k[0] === "_") delete pil[k];
    const cv = q(L, "hfx-cv"); cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
    S = null;
  }
  function finish() { const done = S && S.onDone; cleanup(); if (done) done(); }
  /* 中途中止（切到別的畫面、分頁到背景）：不呼叫 onDone，狀態仍是「演出待播」，回來會從頭補播 */
  function abort() { cleanup(); }

  /* opts: { app, monEl, variant, kind: "kill"|"down", reduced, scale(減少特效的時間縮放), totalMs, downMs, win, downText, onDone } */
  function play(opts) {
    if (S) cleanup();
    const app = opts.app, L = ensureLayer(app), reduced = !!opts.reduced;
    const rect = app.getBoundingClientRect(), W = rect.width, H = rect.height;
    const cv = q(L, "hfx-cv"), g2 = cv.getContext("2d");
    const scale = reduced ? (opts.scale || .85) : 1;
    cv.width = Math.ceil(W / 2); cv.height = Math.ceil(H / 2); g2.imageSmoothingEnabled = false;
    const ctx = { L, rect, W, H, cv, g2, reduced, ic: [W / 2, Math.round(H * .46)], wy: Math.round(H * .30), hf: [], hp: [], tones: [], shards: [], chips: [], deb: [], vl: [], sh: [] };
    S = { ctx, onDone: opts.onDone, start: 0, kind: opts.kind, raf: 0 };
    let total;
    if (opts.kind === "down") {
      total = (opts.downMs || 1500) * scale;
      const lab = q(L, "hfx-label"); lab.textContent = opts.downText || "倒下了……"; lab.className = "hfx-label down";
      L.classList.add("on");
    } else {
      total = (opts.totalMs || P.total) * scale;
      L.classList.add("on");
      try { buildKill(ctx, opts, L); }
      catch (e) { cleanup(); throw e; }
      ctx.hp = [...q(L, "hfx-cut").querySelectorAll(".hfx-hp")];
      q(L, "hfx-tint").style.background = "#ffcc33";
      q(L, "hfx-pretone").style.background = "#000"; q(L, "hfx-flash").style.background = "#000";
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

  root.HuntFx = { play, abort, seek, release: abort, playing, stats };
})(typeof window !== "undefined" ? window : globalThis);
