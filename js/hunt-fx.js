/* =========================================================
   冒險狩獵礦坑：斬擊演出（方案 C「重擊裂開」＋「勝利」字樣）與「倒下」演出
   - 瀏覽器：window.HuntFx。只做畫面，不碰存檔；演出播完呼叫 onDone，呼叫端才往下一步走
   - 來源：Claude outputs/斬擊候選稿_2026-10-08/index.html 的方案 C（擁有者 2026-10-08 選定）
   - 做法：把整個遊戲畫面（#hud、目前的畫面、#nav）複製成兩片，沿鋸齒斜線切開，沿切線兩側滑開、露出縫隙的光，再合回；
           碎片／斬線畫在半解析度畫布上（1 點＝2 像素）；停頓時整個畫面凍結一小段時間；震動是整數像素、每 33 毫秒換一次
   - 閃光規則（審查員）：蓄力不閃；重擊只有 1 次白閃（約 0.1 秒）；「勝利」字樣淡入加發光、不閃爍；
                        每隻怪的演出不能跳過，兩次演出之間至少 2.4 秒 → 任何 1 秒內全螢幕閃白 ≤ 1 次
   - 減少特效：不閃白（只有柔和的淡入淡出）、不晃動、碎片減半、滑開距離 6 成、變暗最多 3 成、整段縮短
   ========================================================= */
(function (root) {
  "use strict";
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const eOut = x => 1 - Math.pow(1 - x, 3);
  const eInOut = x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const rad = d => d * Math.PI / 180;
  const OV = 0.75;   // 兩片互相重疊的像素，避免縫隙
  const COLORS = ["#ffcc33", "#7fe3ff", "#ff9a1f"];   // 三種招式的斬線顏色
  const THETA = [72, 108, 90];                        // 三種招式的斬線角度（度）
  const SHARD = [["#55ff55", "#3fcf4f", "#9dffa8", "#ffffff", "#27963a", "#ffe0a0"], ["#7fe3ff", "#4fa8d8", "#c8f4ff", "#ffffff", "#2a6e9a", "#ffe0a0"], ["#ff9a1f", "#d86a10", "#ffd08a", "#ffffff", "#a8401a", "#ffe0a0"]];

  let S = null;       // 目前正在播的演出
  let layer = null;   // #huntFx

  function ensureLayer(app) {
    if (layer && layer.parentNode === app) return layer;
    layer = document.createElement("div");
    layer.id = "huntFx"; layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<canvas class="hfx-cv"></canvas><div class="hfx-dim"></div><div class="hfx-flash"></div><div class="hfx-label"></div>';
    app.appendChild(layer);
    return layer;
  }

  /* ---------- 幾何：沿斜線切開 ---------- */
  const clipStr = poly => "polygon(" + poly.map(p => p[0].toFixed(1) + "px " + p[1].toFixed(1) + "px").join(",") + ")";
  function halfPoly(ctx, theta, side, jag) {
    const d = [Math.cos(rad(theta)), Math.sin(rad(theta))], n = [-d[1], d[0]], c = ctx.mc, L = ctx.L;
    const pts = [], N = jag ? 60 : 1;
    for (let i = 0; i <= N; i++) {
      const u = -L + 2 * L * i / N, j = jag ? jag(i, N) : 0, o = j - side * OV;
      pts.push([c[0] + d[0] * u + n[0] * o, c[1] + d[1] * u + n[1] * o]);
    }
    const a = pts[0], b = pts[pts.length - 1];
    pts.push([b[0] + n[0] * side * L, b[1] + n[1] * side * L], [a[0] + n[0] * side * L, a[1] + n[1] * side * L]);
    return { poly: pts, d1: [n[0] * side, n[1] * side] };
  }
  function mkPiece(ctx, g) {
    const el = document.createElement("div");
    el.className = "hfx-piece";
    ["hud", "screens", "nav"].forEach(id => {
      const src = document.getElementById(id); if (!src) return;
      const c = src.cloneNode(true);
      if (id === "screens") c.querySelectorAll(".screen:not(.active)").forEach(x => x.remove());   // 沒在看的畫面不用複製
      el.appendChild(c);
    });
    el.style.clipPath = clipStr(g.poly);
    ctx.stage.appendChild(el);
    const r = { el, mon: el.querySelector(".hunt-mon"), d1: g.d1, tf: "" };
    ctx.all.push(r); return r;
  }
  function place(ctx, r, o1) {
    const k = ctx.reduced ? 0.6 : 1;
    const tf = "translate3d(" + Math.round(r.d1[0] * o1 * k) + "px," + Math.round(r.d1[1] * o1 * k) + "px,0)";
    if (r.tf !== tf) { r.tf = tf; r.el.style.transform = tf; }
  }

  /* ---------- 像素碎片／斬線／星芒 ---------- */
  function spawnShards(ctx, t0, n, dir) {
    const k = ctx.reduced ? 0.5 : 1;
    for (let i = 0; i < Math.round(n * k); i++) {
      const sd = 500 + i, side = rnd(sd + .5) < .5 ? -1 : 1;
      const ang = dir + (side < 0 ? Math.PI : 0) + (rnd(sd + .3) - .5) * 1.7;
      const sp = (90 + rnd(sd + .1) * 300) * 1.5;
      ctx.shards.push({ t0, x: ctx.mc[0] + (rnd(sd + .2) - .5) * 120, y: ctx.mc[1] + (rnd(sd + .4) - .5) * 90,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 140, s: 2 + Math.floor(rnd(sd + .6) * 4),
        c: ctx.pal[Math.floor(rnd(sd + .7) * ctx.pal.length)], life: .45 + rnd(sd + .8) * .5 });
    }
  }
  function drawShards(ctx, te) {
    const c2 = ctx.c2;
    for (const p of ctx.shards) {
      if (te < p.t0) continue;
      const a = (te - p.t0) / 1000; if (a > p.life) continue;
      if (a > p.life * .7 && Math.floor(a * 30) % 2) continue;
      c2.fillStyle = p.c;
      c2.fillRect(Math.round((p.x + p.vx * a) / 2), Math.round((p.y + p.vy * a + 0.5 * 760 * a * a) / 2), p.s, p.s);
    }
  }
  function drawSlash(ctx, sl, te) {
    if (te < sl.t0) return;
    const head = eOut(seg(te, sl.t0, sl.t0 + sl.dur)), fade = seg(te, sl.t0 + sl.dur, sl.t0 + sl.dur + sl.fade);
    if (fade >= 1) return;
    const u0 = fade * fade * head, th = rad(sl.theta), dx = Math.cos(th), dy = Math.sin(th), c2 = ctx.c2;
    const Lg = ctx.L / 2, sx = ctx.mc[0] / 2 - dx * Lg, sy = ctx.mc[1] / 2 - dy * Lg;
    const n = Math.ceil(Lg * 2 * (head - u0) * 1.5) + 1, shallow = Math.abs(dx) >= Math.abs(dy);
    const pass = (scale, col) => {
      c2.fillStyle = col;
      for (let k = 0; k <= n; k++) {
        const u = u0 + (head - u0) * k / n, w = sl.thick * (1 - .6 * fade) * (.2 + .8 * Math.pow(Math.sin(Math.PI * u), .6)) * scale;
        const x = sx + dx * u * Lg * 2, y = sy + dy * u * Lg * 2, wi = Math.max(1, Math.round(w));
        if (shallow) c2.fillRect(Math.round(x), Math.round(y - wi / 2), 1, wi); else c2.fillRect(Math.round(x - wi / 2), Math.round(y), wi, 1);
      }
    };
    pass(1, ctx.reduced ? "#ffcf70" : sl.col); pass(.45, ctx.reduced ? "#fff3c9" : "#ffffff");
  }
  function drawBurst(ctx, te, e, size, spikes) {
    const age = te - e; if (age < 0 || age > 170) return;
    const len = size * (age < 50 ? age / 50 : 1 - (age - 50) / 150);
    if (len < 2) return;
    const cx = ctx.mc[0] / 2, cy = ctx.mc[1] / 2, c2 = ctx.c2;
    for (let k = 0; k < spikes; k++) {
      const a = k * Math.PI * 2 / spikes, cardinal = (spikes === 4) || k % 2 === 0;
      c2.fillStyle = k % 2 ? "#ffe0a0" : "#ffffff";
      const m = cardinal ? len : len * .62;
      for (let r = 2; r <= m; r++) {
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        c2.fillRect(x, y, cardinal && r < m * .6 ? 2 : 1, cardinal && r < m * .6 ? 2 : 1);
      }
    }
  }

  /* ---------- 方案 C 的時間表（單位：演出時間 ms；hold＝停頓，期間畫面凍結） ----------
     0～240 蓄力變暗 → 255～310 長斬 → 310 命中（閃白＋停頓 240）→ 縫隙張開（鋸齒、縫裡有火花）→ 780～1280 慢慢合回
     勝利字樣：760 起淡入、2080 起淡出 */
  const HOLD = { at: 310, dur: 240 }, FLASH_LEN = 70, GLOW = [100, 300, 700, 1300], IMPACT = 310;
  function timeMap(t) {
    if (t < HOLD.at) return { te: t, frozen: false, since: 0 };
    if (t < HOLD.at + HOLD.dur) return { te: HOLD.at, frozen: true, since: t - HOLD.at };
    return { te: t - HOLD.dur, frozen: false, since: 0 };
  }
  const monState = te => (te < 310 ? "alive" : te < 360 ? "white" : "gone");
  const dimAt = te => (te >= 310 ? 0 : Math.round(.6 * eOut(seg(te, 0, 240)) * 10) / 10);
  function offAt(te) {
    let off = 0;
    if (te >= 310) off = 3 + 17 * eOut(seg(te, 310, 370)) + 5 * seg(te, 370, 780);
    return off * (1 - eInOut(seg(te, 780, 1280)));
  }

  function setStyle(el, k, v) { const key = "_" + k; if (el[key] !== v) { el[key] = v; el.style[k] = v; } }

  function render(t) {
    const ctx = S.ctx, c2 = ctx.c2, s = timeMap(t), te = s.te, reduced = ctx.reduced;
    // 各片的怪物狀態與位置
    const ms = monState(te), cls = "hunt-mon" + (ms === "white" ? (reduced ? " hit" : " white") : ms === "gone" ? " gone" : "");
    const off = offAt(te);
    ctx.all.forEach(r => { if (r.mon && r.cls !== cls) { r.cls = cls; r.mon.className = cls; } place(ctx, r, off); });
    // 畫布
    c2.clearRect(0, 0, ctx.cv.width, ctx.cv.height);
    drawSlash(ctx, ctx.slash, te);
    drawShards(ctx, te);
    if (te > 90 && te < 310) drawBurst(ctx, te, 90, 3 + 14 * seg(te, 90, 300), 4);
    drawBurst(ctx, te, IMPACT, 24, 8);
    if (te >= 310 && te < 900) {   // 縫隙裡的火花
      c2.fillStyle = "#ffe0a0";
      const th = rad(ctx.theta), d = [Math.cos(th), Math.sin(th)], nn = [-d[1], d[0]];
      for (let i = 0; i < 16; i++) {
        if ((Math.floor(te / 50) + i) % 3 === 0) continue;
        const u = (rnd(i * 5.7) - .5) * ctx.L * .8, len = 5 + Math.floor(rnd(i + .3) * 9);
        let x = (ctx.mc[0] + d[0] * u) / 2, y = (ctx.mc[1] + d[1] * u) / 2; const sg = rnd(i + .9) < .5 ? -1 : 1;
        for (let k = 0; k < len; k++) { x += nn[0] * sg * .8 + (rnd(i * 9 + k) - .5) * 1.6; y += nn[1] * sg * .8 + (rnd(i * 9 + k + .5) - .5) * 1.6; c2.fillRect(Math.round(x), Math.round(y), 1, 1); }
      }
    }
    // 縫隙發光（白 → 金 → 橘 → 暗紅，階梯變色）
    const age = t - (HOLD.at); let col = "#000";
    if (age >= 0) col = age < GLOW[0] ? (reduced ? "#ffe0a0" : "#ffffff") : age < GLOW[1] ? "#ffcc33" : age < GLOW[2] ? "#ff9a1f" : age < GLOW[3] ? "#a8301a" : "#3a0d0d";
    setStyle(ctx.voidEl, "background", col);
    // 震動：整數像素、階梯式；減少特效時完全不晃
    let sx = 0, sy = 0;
    if (!reduced) {
      const shakes = [{ e: 310, d: 460, a: 12 }, { e: 1280, d: 140, a: 3 }];
      let best = null;
      for (const ev of shakes) {
        const rel = t - (ev.e + HOLD.dur);
        if (rel >= 0 && rel < ev.d) { const amp = ev.a * (1 - rel / ev.d); if (!best || amp > best.amp) best = { amp, step: Math.floor(rel / 33), seed: ev.e }; }
      }
      if (best) { sx = Math.round((rnd(best.step * 2 + best.seed) - .5) * 2 * best.amp); sy = Math.round((rnd(best.step * 2 + best.seed + 1) - .5) * 1.4 * best.amp); }
    }
    const wt = "translate3d(" + sx + "px," + sy + "px,0)";
    setStyle(ctx.stage, "transform", wt);
    // 閃白：整段只有命中那一下（70ms 全亮，之後 33ms 一階衰減）。減少特效：不閃，只有柔和淡入淡出
    const rel = t - HOLD.at; let fl = 0;
    if (rel >= 0) {
      if (!reduced) fl = rel < FLASH_LEN ? .9 : rel < FLASH_LEN + 33 ? .45 : rel < FLASH_LEN + 66 ? .2 : 0;
      else fl = rel < 150 ? .22 * (1 - rel / 150) : 0;
    }
    setStyle(ctx.flash, "opacity", String(fl));
    setStyle(ctx.dim, "opacity", String(Math.min(dimAt(te), reduced ? .3 : 1)));
    // 勝利字樣：裂開張開之後淡入（階梯式），停留，再階梯式淡出。不閃爍
    const lin = seg(t, 760, 1000), lout = 1 - seg(t, 2080, 2330);
    const lv = Math.round(Math.min(lin, lout) * 6) / 6;
    setStyle(ctx.label, "opacity", String(lv));
    if (lv > 0 && !ctx.labelOn) { ctx.labelOn = true; ctx.label.classList.add("on"); }
  }

  function renderDown(t, dur) {
    const ctx = S.ctx;
    const dim = Math.round(.55 * Math.min(seg(t, 0, 500), 1 - seg(t, dur - 350, dur)) * 8) / 8;
    setStyle(ctx.dim, "opacity", String(dim));
    const lv = Math.round(Math.min(seg(t, 300, 550), 1 - seg(t, dur - 400, dur - 120)) * 6) / 6;
    setStyle(ctx.label, "opacity", String(lv));
  }

  function cleanup() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    S.ctx.all.forEach(r => r.el.remove());
    if (S.ctx.stage && S.ctx.stage.parentNode) S.ctx.stage.remove();
    const L = S.layerEl;
    L.classList.remove("on");
    L.querySelector(".hfx-label").className = "hfx-label"; L.querySelector(".hfx-label").textContent = "";
    ["hfx-dim", "hfx-flash", "hfx-label"].forEach(c => { const e = L.querySelector("." + c); e.style.opacity = "0"; e._opacity = "0"; });
    const cv = L.querySelector(".hfx-cv"); cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
    S = null;
  }
  function finish() { const done = S && S.onDone; cleanup(); if (done) done(); }
  /* 中途中止（切到別的畫面、分頁到背景）：不呼叫 onDone，狀態仍是「演出待播」，回來會從頭補播 */
  function abort() { cleanup(); }

  /* opts: { app, monEl, kind: "kill"|"down", pick, reduced, scale(減少特效的時間縮放), totalMs, downMs, win: "勝利", downText, onDone } */
  function play(opts) {
    if (S) cleanup();
    const app = opts.app, L = ensureLayer(app), reduced = !!opts.reduced;
    const rect = app.getBoundingClientRect(), W = rect.width, H = rect.height;
    const cv = L.querySelector(".hfx-cv"), c2 = cv.getContext("2d");
    const label = L.querySelector(".hfx-label"), flash = L.querySelector(".hfx-flash"), dim = L.querySelector(".hfx-dim");
    const scale = reduced ? (opts.scale || .65) : 1;
    const pick = opts.pick || 0;
    // 舞台容器（只有斬擊用）：兩片＋縫隙的光放在這裡，震動也套在這裡（畫布與閃光不晃）
    let stage = null, voidEl = null;
    if (opts.kind !== "down") {
      stage = document.createElement("div"); stage.className = "hfx-stage";
      voidEl = document.createElement("div"); voidEl.className = "hfx-void"; stage.appendChild(voidEl);
      L.insertBefore(stage, cv);
    }
    L.classList.add("on");
    const ctx = { cv, c2, W, H, reduced, voidEl, flash, dim, label, stage, all: [], shards: [], pal: SHARD[pick] || SHARD[0], theta: THETA[pick] || 72,
      slash: { t0: 255, dur: 55, theta: THETA[pick] || 72, thick: 10, fade: 220, col: COLORS[pick] || COLORS[0] }, labelOn: false };
    cv.width = Math.ceil(W / 2); cv.height = Math.ceil(H / 2); c2.imageSmoothingEnabled = false;
    label.textContent = opts.kind === "down" ? (opts.downText || "倒下了……") : (opts.win || "勝利");
    label.className = "hfx-label" + (opts.kind === "down" ? " down" : "") + (reduced ? " calm" : "");
    S = { ctx, layerEl: L, onDone: opts.onDone, start: performance.now(), kind: opts.kind, raf: 0 };
    let total;
    if (opts.kind === "down") total = (opts.downMs || 1500) * scale;
    else {
      total = (opts.totalMs || 2400) * scale;
      const mr = (opts.monEl || app).getBoundingClientRect();
      ctx.mc = [mr.left + mr.width / 2 - rect.left, mr.top + mr.height / 2 - rect.top];
      ctx.L = Math.hypot(W, H) * 1.15;
      const jag = (i, N) => { const e = Math.min(i, N - i) / (N * .25); return (rnd(i * 3.1) - .5) * 2 * 7 * clamp01(e + .25); };
      mkPiece(ctx, halfPoly(ctx, ctx.theta, 1, jag)); mkPiece(ctx, halfPoly(ctx, ctx.theta, -1, jag));
      spawnShards(ctx, 330, 52, rad(ctx.theta + 90));
    }
    S.total = total; S.scale = scale;
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
  /* 測試用：停在指定時間（演出時間 ms）擷取畫面。HuntFx.seek(opts, t)；HuntFx.release() 還原 */
  function seek(opts, t) { if (!S || !S.manual) { opts.onDone = null; play(opts); cancelAnimationFrame(S.raf); S.manual = true; } if (S.kind === "down") renderDown(t, S.total / S.scale); else render(t); }
  const playing = () => !!S;

  root.HuntFx = { play, abort, seek, release: abort, playing };
})(typeof window !== "undefined" ? window : globalThis);
