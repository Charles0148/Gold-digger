/* =========================================================
   冒險狩獵礦坑：畫面與操作（沿用 scr-mine 的外框：資訊列、場景、敘述框、控制列）
   - 瀏覽器：window.HuntUI。狀態與規則都在 js/mine-hunt.js（window.MineHunt），斬擊演出在 js/hunt-fx.js（window.HuntFx）
   - game.js 只負責接線（HuntUI.init 傳入接點）；這裡不直接讀寫 localStorage 的存檔，存檔一律由 A.persist() 寫
   - 一般玩家看不到這座礦坑（game.js 的 huntVisible：開發者模式或本機 ?sandbox=）
   - 玩家畫面文字全在 config.hunt.texts；不顯示任何機率、不寫「選對／猜中」、不要血
   ========================================================= */
(function (root) {
  "use strict";
  const MH = root.MineHunt, FX = root.HuntFx;
  let A = null;   // game.js 提供的接點
  const ui = { stalled: 0, devSeen: false, resSeen: false, doneSeen: false, introBusy: false, feedSel: new Set(), flash: null, feedOpen: false, lastPhase: "" };
  const FXPREF_KEY = "mine_fx_pref_v1";
  const $ = id => document.getElementById(id);
  const H = () => A.H();
  const T = () => H().texts;
  const sub = () => A.config().theme.sub;
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] !== undefined ? o[k] : ""));
  const num = n => Math.floor(n).toLocaleString("en-US");
  const SV = () => A.save();
  const RUN = () => MH.run(SV(), H());

  /* ---------- 減少特效（預設跟隨系統「減少動態效果」；存在這台裝置，不進存檔） ---------- */
  function fxPref() { const v = A.store.get(FXPREF_KEY + A.sb); return v === "on" || v === "off" ? v : "auto"; }
  function reduced() {
    const p = fxPref();
    if (p === "on") return true;
    if (p === "off") return false;
    return !!(root.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function setFxPref(v) { A.store.set(FXPREF_KEY + A.sb, v === "on" || v === "off" ? v : "auto"); renderFxPanel(); }
  function renderFxPanel() {
    const el = $("fxPanel"); if (!el) return;
    el.classList.toggle("hidden", !A.visible());
    if (!A.visible()) return;
    const cur = fxPref(), o = T().fxOpts;
    el.innerHTML = `<div class="panel-title">${T().fxTitle}</div>
      <div class="row"><div class="grow">${T().fxLabel}<div class="sub">${T().fxHelp}</div></div></div>
      <div class="btns fx-opts">${["auto", "on", "off"].map(k => `<button class="px-btn small ${cur === k ? "on" : ""}" data-hunt="fx:${k}">${o[k]}</button>`).join("")}</div>`;
  }

  /* ---------- 像素史萊姆（程式現場畫，三種顏色輪流） ---------- */
  const PAL = [{ o: "#0f3d14", g: "#3fcf4f", l: "#9dffa8", d: "#27963a" }, { o: "#0f2a4d", g: "#3f8fe0", l: "#a8d4ff", d: "#2a5fa8" }, { o: "#4d1a0f", g: "#e0623f", l: "#ffb8a0", d: "#a83a27" }];
  const svgCache = {};
  function monSvg(variant) {
    if (svgCache[variant]) return svgCache[variant];
    const W = 24, Hh = 19, P = Object.assign({ k: "#101010", w: "#ffffff", m: PAL[variant].o }, PAL[variant]);
    const inside = (x, y) => y >= 0 && y <= 18 && x >= 0 && x < W && Math.pow((x - 11.5) / 12, 2) + Math.pow((y - 18) / 17.5, 2) <= 1;
    const cell = {};
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const edge = y === 18 || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1);
      let c = "g";
      if (edge) c = "o"; else if ((x - 7) * (x - 7) + (y - 5) * (y - 5) < 8) c = "l"; else if (x > 16 || y >= 16) c = "d";
      cell[x + "," + y] = c;
    }
    [[7, 9], [8, 9], [7, 10], [8, 10], [7, 11], [8, 11], [15, 9], [16, 9], [15, 10], [16, 10], [15, 11], [16, 11]].forEach(p => { cell[p] = "k"; });
    cell["7,9"] = "w"; cell["15,9"] = "w";
    [[10, 14], [11, 14], [12, 14], [13, 14], [9, 13], [14, 13]].forEach(p => { cell[p] = "m"; });
    let s = `<svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">`;
    for (let y = 0; y < Hh; y++) {
      let x = 0;
      while (x < W) {
        const c = cell[x + "," + y];
        if (!c) { x++; continue; }
        let n = 1; while (cell[(x + n) + "," + y] === c) n++;
        s += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${P[c]}"/>`;
        x += n;
      }
    }
    return (svgCache[variant] = s + "</svg>");
  }
  const monHtml = (variant, ghost) => `<div class="hunt-mon${ghost ? " ghost" : ""}">${monSvg(variant % PAL.length)}</div>`;

  /* ---------- 畫面 ---------- */
  function chrome(on) {   // 每次 renderMine 都會呼叫：切換「冒險之地」專用的資訊列、按鈕
    $("mbData").classList.toggle("hidden", on);
    $("huntData").classList.toggle("hidden", !on);
    $("btnFeed").classList.toggle("hidden", !on);
    $("btnFeed").textContent = T().feedBtn;
  }
  const busy = () => { const r = MH.peek(SV(), H()); return !!(FX.playing() || (r && r.anim && ui.stalled !== r.anim.rid)); };

  function render() {
    const sv = SV(), h = H(), M = sv.huntMeta, r = RUN(), t = T();
    if (r.phase === "hunt" && !r.mon && !r.anim && !MH.halted(sv, h)) { MH.spawn(sv, h); A.persist(); }   // 自我修復：狩獵中卻沒有怪（例如開發者跳狀態、舊版留下的狀態）→ 付 1 體力遇一隻
    const halted = MH.halted(sv, h), stalled = !!r.anim && ui.stalled === r.anim.rid, animating = !!r.anim && !stalled, st = M.stamina;
    chrome(true);
    $("mbName").textContent = h.mine.name;
    const PH = { walk: "旅途", dev: r.dev && r.dev.kind === "map" ? "藏寶圖" : "洞窟", country: t.countryName, hunt: "狩獵", done: "凱旋" };
    $("mbState").innerHTML = A.colored(PH[r.phase] || "", A.config().theme.accent) + (A.dbgSetting() ? ` <span style="color:#ff4fd8">設定${A.todaySetting(h.mine.id)}｜${r.phase}｜保底${r.since}</span>` : "");
    $("hbStep").textContent = num(st);
    $("hbGold").textContent = num(r.gold);
    $("hbVisit").textContent = num(M.visits);
    $("veinBanner").classList.add("hidden"); $("vbUp").classList.add("hidden"); $("scene").classList.remove("vein-on");
    $("rollLog").classList.add("hidden");
    // 控制列：體力
    $("tiName").innerHTML = `<span style="color:#7fe3ff">小精靈</span>`;
    $("tiBar").style.width = Math.min(100, st / h.stamina.barRef * 100) + "%";
    $("tiBar").style.background = st > 30 ? "#55ff55" : st > 8 ? "#ffcc33" : "#ff5555";
    $("tiDur").textContent = num(st) + " 步";
    $("btnAuto").textContent = A.save().auto ? "自動" : "手動";
    $("btnAuto").classList.toggle("on", !!A.save().auto);
    $("btnFeed").disabled = animating || FX.playing() || !MH.canFeed(sv, h);   // 只有旅途、發展揭曉後、停住時才能餵
    $("btnLeave").disabled = animating || FX.playing();

    const big = $("sceneBig"), subEl = $("sceneSub");
    let lines = [], tap = "▼ 點擊", choices = [], bigHtml = "", subTxt = "";
    const needN = MH.need(sv, h), lack = Math.max(0, needN - st);
    const hungry = () => { lines = t.hungry.map(x => A.colored(x, sub())).concat([A.colored(fill(t.hungryNeed, { n: lack }), "#ffcc33")]); tap = ""; choices = [{ c: "feed", label: t.feedBtn + "（餵鎬子）", gold: true }]; };
    if (r.phase === "walk") {
      bigHtml = A.colored((r.n + r.since) % 2 ? "· ·" : "·  ·", sub());
      lines = [ui.flash && ui.flash.rid === r.rid ? A.colored(ui.flash.text, "#ffe0a0") : "", t.walk[(r.n + r.since) % t.walk.length]].filter(Boolean);
      tap = "▼ 點擊前進";
      if (halted) hungry();
    } else if (r.phase === "dev") {
      const map = r.dev.kind === "map";
      bigHtml = A.colored(map ? "藏寶圖" : "洞窟", map ? "#ffcc33" : "#7fe3ff");
      lines = (map ? t.devMap : t.devCave).slice();
      tap = t.goIn;
      if (halted) hungry();
    } else if (r.phase === "country") {
      bigHtml = A.colored(t.countryName, "#ffe0a0");
      if (r.country.pick === null) { lines = t.countryIntro.map(x => x); tap = ""; choices = t.countryOpts.map((l, i) => ({ c: "cpick:" + i, label: l })); }
      else { lines = [t.countryReply[r.country.pick], A.colored(r.country.ok ? t.countryOk : t.countryFail, r.country.ok ? "#55ff55" : sub())]; tap = t.countryNext; }
    } else if (r.phase === "hunt") {
      const variant = r.anim ? r.kills - (r.anim.kind === "kill" ? 1 : 0) : r.kills;
      bigHtml = r.mon ? monHtml(variant) : A.colored("…", sub());
      subTxt = `第 ${Math.min(r.kills + 1, h.lower.count)} 隻`;
      if (stalled) {   // 演出後的結果寫入失敗，已回到操作前：不自動重播，讓玩家按「再試一次」
        lines = [A.colored(t.saveFail, "#ffcc33")]; tap = ""; choices = [{ c: "retry", label: t.retry, gold: true }];
      } else if (r.anim) {
        lines = [r.anim.kind === "kill" ? t.monHit[r.anim.pick] : t.downLine]; tap = "";
      } else if (r.mon) {
        lines = [t.monAppear[r.kills % t.monAppear.length]]; tap = r.mon.pres === 0 ? "▼ 點擊出招" : "";
        const names = r.mon.pres === 0 ? t.monSingle : r.mon.pres === 1 ? t.monTwo : t.monThree;
        choices = names.map((l, i) => ({ c: "strike:" + i, label: l, gold: r.mon.pres === 0 }));
        if (ui.flash && ui.flash.rid === r.rid) lines.unshift(A.colored(ui.flash.text, "#ffe0a0"));
      } else if (halted) hungry();
    } else if (r.phase === "done") {
      const L = r.last, w = L.why;
      bigHtml = A.colored(w === "empty" ? "空手" : w === "down" ? "撤退" : "凱旋", w === "empty" ? sub() : "#ffcc33");
      lines = [A.colored(fill(w === "full" ? t.doneFull : w === "down" ? t.doneDown : t.doneEmpty, { k: L.kills, g: num(L.gold) }), w === "empty" ? sub() : "#ffcc33")];
      tap = t.doneTap;
    }
    big.innerHTML = bigHtml; subEl.textContent = subTxt;
    A.setTextbox(lines, 0, { tap: tap || " " });   // 有選項時不顯示「▼ 點擊」
    const box = $("tbChoice");
    if (choices.length) {
      box.classList.remove("hidden");
      box.innerHTML = choices.map(c => `<button class="px-btn wide${c.gold ? " gold" : ""}" data-hunt="${c.c}">${c.label}</button>`).join("");
    } else { box.classList.add("hidden"); box.innerHTML = ""; }
    A.renderHud();
    maybeFx();
    maybeIntro();
  }

  /* ---------- 斬擊／倒下演出 ---------- */
  function maybeFx() {
    const sv = SV(), r = MH.peek(sv, H());
    if (!r || !r.anim || FX.playing() || !A.onMine() || ui.stalled === r.anim.rid) return;
    const rid = r.anim.rid;
    if ($("splash")) { setTimeout(() => { if (A.onMine()) maybeFx(); }, 300); return; }   // 開場動畫還沒收起：先等（重開後補播的演出才看得到）
    requestAnimationFrame(() => {
      const r2 = MH.peek(SV(), H());
      if (!r2 || !r2.anim || r2.anim.rid !== rid || FX.playing() || !A.onMine()) return;
      const a = r2.anim, fx = H().fx;
      try {
        FX.play({ app: $("app"), monEl: document.querySelector("#sceneBig .hunt-mon"), kind: a.kind, pick: a.pick, reduced: reduced(), scale: fx.reducedScale,
          totalMs: fx.totalMs, downMs: fx.downMs, win: T().win, downText: T().down, onDone: () => fxDone(rid) });
      } catch (e) { console.error("斬擊演出失敗：" + (e && e.message)); FX.abort(); fxDone(rid); }
    });
  }
  function fxDone(rid) {
    const sv = SV(), h = H(), r = MH.peek(sv, h);
    if (!r || !r.anim || r.anim.rid !== rid) { if (A.onMine()) render(); return; }   // 演出播放期間存檔被換掉（接回雲端等）：舊演出作廢，重畫並讓新存檔的待播演出接著播
    const kind = r.anim.kind;
    const res = A.commit(() => MH.finishAnim(SV(), H(), rid));   // 原子：往下一隻／凱旋入帳＋存檔；寫入失敗會回到演出前
    if (res && res.failed) { ui.stalled = rid; A.stopAuto(); if (A.onMine()) render(); return; }
    ui.stalled = 0;
    if (res.ok && kind === "kill") ui.flash = { rid: MH.peek(SV(), H()).rid, text: fill(T().killLine, { g: H().lower.gold }) };
    if (A.onMine()) render(); else A.renderHud();
  }
  function abortFx() { FX.abort(); }

  /* ---------- 操作 ---------- */
  /* 一個操作＝一次原子寫入（A.commit：先拍快照，寫入失敗就回到操作前、提示玩家）。失敗時停自動、中止演出、重畫 */
  function act(fn) {
    const res = A.commit(fn);
    if (res && res.failed) { A.stopAuto(); FX.abort(); render(); return { ok: false, failed: true }; }
    render();
    return res;
  }
  function doStep() {
    ui.flash = null;
    const res = act(() => MH.step(SV(), H(), { setting: A.todaySetting(H().mine.id) }));
    if (!res.ok && !res.failed) { if (res.reason === "nosetting") A.dayBlocked(); else if (res.reason === "hungry") A.stopAuto(); }
    return res;
  }
  function doEnter() { ui.devSeen = false; const res = act(() => MH.enterCountry(SV(), H())); if (!res.ok && res.reason === "hungry") A.stopAuto(); return res; }
  function doPick(i) { ui.resSeen = false; return act(() => MH.pickCountry(SV(), H(), i)); }
  function doAfterCountry() { ui.flash = null; return act(() => MH.afterCountry(SV(), H())); }
  function doStrike(i) { return act(() => MH.strike(SV(), H(), i)); }
  function doAgain() { ui.doneSeen = false; ui.flash = null; return act(() => MH.again(SV(), H())); }

  /* 點敘述框（textbox）：依目前階段做「主要動作」。有選項的地方只能按按鈕 */
  function tap() {
    const sv = SV(), r = RUN();
    if (r.anim || FX.playing()) return;
    if (r.phase === "walk") { if (A.dayBlocked()) return; if (MH.halted(sv, H())) { A.toast(T().hungry[0], 1600); return; } doStep(); }
    else if (r.phase === "dev") { if (MH.halted(sv, H())) { A.toast(T().goInHungry, 1600); return; } doEnter(); }
    else if (r.phase === "country") { if (r.country.pick !== null) doAfterCountry(); }
    else if (r.phase === "hunt") { if (r.mon && r.mon.pres === 0) doStrike(0); }
    else if (r.phase === "done") doAgain();
  }
  function onBtn(code) {
    const [k, v] = String(code).split(":");
    if (k === "feed") openFeed();
    else if (k === "cpick") doPick(+v);
    else if (k === "strike") { const r = RUN(); if (!r.anim && !FX.playing()) doStrike(+v); }
    else if (k === "fx") setFxPref(v);
    else if (k === "retry") { const r = RUN(); if (r.anim && ui.stalled === r.anim.rid && !FX.playing()) fxDone(r.anim.rid); }
  }

  /* ---------- 自動模式（規格 2.7）：演出播完才繼續；二選一／三選一、國度解題、停住時不代按 ---------- */
  function auto() {
    const sv = SV(), h = H(), r = RUN();
    if (FX.playing() || r.anim) return { wait: 300 };
    if (A.modalOpen()) return { wait: 400 };
    if (MH.halted(sv, h)) { A.toast("體力用完了，餵鎬子才能繼續走", 2400); return { stop: true }; }
    if (r.phase === "walk") { if (A.dayBlocked()) return { stop: true }; doStep(); return { wait: A.autoWait() }; }
    if (r.phase === "dev") { if (!ui.devSeen) { ui.devSeen = true; return { wait: 1100 }; } ui.devSeen = false; doEnter(); return { wait: 400 }; }
    if (r.phase === "country") {
      if (r.country.pick === null) return { wait: 400 };   // 國度解題：等玩家
      if (!ui.resSeen) { ui.resSeen = true; return { wait: 1200 }; }
      ui.resSeen = false; doAfterCountry(); return { wait: 400 };
    }
    if (r.phase === "hunt") {
      if (!r.mon) return { wait: 400 };
      if (r.mon.pres === 0) { doStrike(0); return { wait: 400 }; }   // 單鈕：代按「出招」
      return { wait: 400 };                                           // 二選一／三選一：等玩家
    }
    if (r.phase === "done") { if (!ui.doneSeen) { ui.doneSeen = true; return { wait: 2500 }; } ui.doneSeen = false; doAgain(); return { wait: 400 }; }
    return { stop: true };
  }

  /* ---------- 餵食（小精靈） ---------- */
  function toolRows() {
    const sv = SV(), h = H();
    return (sv.tools || []).map(t => {
      const d = A.toolDef(t.id), f = MH.feedable(h, d, t);
      return { t, d, f };
    }).filter(x => x.d).sort((a, b) => (a.d.tier - b.d.tier) || (a.t.dur - b.t.dur));
  }
  function feedHtml() {
    const sv = SV(), h = H(), tx = T(), rows = toolRows();
    const sel = [...ui.feedSel].filter(u => rows.some(x => x.t.uid === u && x.f.ok));
    ui.feedSel = new Set(sel);
    const pv = MH.feedPreview(sv, h, A.toolDef, sel);
    const list = rows.length ? rows.map(({ t, d, f }) => {
      const on = ui.feedSel.has(t.uid);
      const note = f.ok ? `體力 +${num(f.n)}` : f.why === "trial" ? tx.feedTrial : tx.feedSmall;
      return `<button class="row feed-row${on ? " on" : ""}${f.ok ? "" : " off"}" data-feed="${t.uid}" ${f.ok ? "" : "disabled"}>
        <span class="grow"><span style="color:${A.rarityColor(d.rarity)}">${d.name}</span> <span class="sub">${t.dur}/${t.max}</span></span>
        <span class="${f.ok ? "feed-n" : "sub"}">${on ? "✔ " : ""}${note}</span></button>`;
    }).join("") : `<div class="sub">${tx.feedNone}</div>`;
    return `<div class="feed-title">${tx.feedTitle}</div><div class="sub" style="text-align:left;margin:4px 0 8px">${tx.feedHint}</div>
      <div class="feed-list">${list}</div>
      <div class="feed-sum">選了 ${pv.count} 把　體力 +${num(pv.n)}　<span class="sub">（現有 ${num(sv.huntMeta.stamina)}）</span></div>
      <div class="btns"><button class="px-btn gold" id="feedGo" ${pv.count && pv.n >= 1 ? "" : "disabled"}>餵食</button><button class="px-btn" id="feedNo">關閉</button></div>`;
  }
  function openFeed() {
    if (busy()) return;
    if (!MH.canFeed(SV(), H())) { A.toast(T().feedPhase, 1600); return; }   // 只有旅途、發展揭曉後、停住時才能餵
    ui.feedSel = new Set(); ui.feedOpen = true;
    showFeed();
  }
  function showFeed() {
    const box = $("modalBox");
    box.innerHTML = feedHtml(); box.classList.add("feed-modal");
    $("modal").classList.remove("hidden");
    $("feedNo").onclick = closeFeed;
    $("feedGo").onclick = confirmFeed;
    box.querySelectorAll("[data-feed]").forEach(b => {
      b.onclick = () => { const u = +b.dataset.feed; if (ui.feedSel.has(u)) ui.feedSel.delete(u); else ui.feedSel.add(u); showFeed(); };
    });
  }
  function closeFeed() { ui.feedOpen = false; $("modalBox").classList.remove("feed-modal"); $("modal").classList.add("hidden"); }
  function confirmFeed() {   // 二次確認
    const sv = SV(), h = H(), tx = T(), uids = [...ui.feedSel], pv = MH.feedPreview(sv, h, A.toolDef, uids);
    if (!pv.count || pv.n < 1) return;
    const precious = uids.map(u => sv.tools.find(t => t.uid === u)).filter(Boolean).filter(t => { const d = A.toolDef(t.id), w = h.feedWarn || {}; return d && ((w.drill && d.drill) || (w.minTier && d.tier >= w.minTier)); });   // 貴重警告：依工具 id／階級／鑽頭判斷（不看換算後的體力）
    const box = $("modalBox");
    box.innerHTML = `<div style="line-height:1.7">要把這 ${pv.count} 把鎬子餵給小精靈嗎？</div>
      <div style="margin-top:6px">體力 +${num(pv.n)}</div>
      ${precious.length ? `<div class="leave-warn" style="margin-top:8px">⚠ ${tx.feedWarn}<br>${precious.map(t => A.toolDef(t.id).name).join("、")}</div>` : ""}
      <div class="sub" style="margin-top:6px">吃掉的鎬子不會退回。</div>
      <div class="btns"><button class="px-btn gold" id="feedYes">餵食</button><button class="px-btn" id="feedBack">再想想</button></div>`;
    $("feedBack").onclick = showFeed;
    $("feedYes").onclick = () => {
      let res = null;
      const c = A.commit(() => {   // 原子：再查一次、移除鎬子、清裝備、加體力（停住時自動回到原處，不重抽、不重播）＋存檔；寫入失敗會回到餵食前
        res = MH.feed(SV(), H(), A.toolDef, uids);
        const r = RUN();
        if (res.ok && r.phase === "hunt" && !r.mon && !r.anim) MH.spawn(SV(), H());
        return res;
      });
      closeFeed();
      if (c && c.failed) { A.stopAuto(); render(); return; }
      if (!res.ok) { A.toast(res.reason === "cap" ? T().feedFull : res.reason === "phase" ? T().feedPhase : "沒辦法餵食，請再試一次", 2000); render(); return; }
      A.toast(fill(T().feedOk, { n: num(res.gained) }), 2200);
      render();
    };
  }

  /* ---------- 第一次進礦坑：光敏提示 → 初見禮 ---------- */
  function modalNote(html, buttons) {
    const box = $("modalBox");
    box.innerHTML = html + `<div class="btns hunt-btns">${buttons.map(b => `<button class="px-btn${b.gold ? " gold" : ""}" id="${b.id}">${b.label}</button>`).join("")}</div>`;
    $("modal").classList.remove("hidden");
  }
  /* 延後到這一輪事件結束再判斷：go() 離開礦坑畫面時會先重畫一次（那時 currentScreen 還是挖礦），
     不延後的話，按「到帳號頁看看」會讓初見禮視窗蓋在帳號頁上 */
  let introTimer = 0;
  function maybeIntro() {
    if (introTimer || ui.introBusy) return;
    introTimer = setTimeout(() => { introTimer = 0; introNow(); }, 0);
  }
  function introNow() {
    if (ui.introBusy || !A.onMine() || A.modalOpen()) return;
    const M = SV().huntMeta, tx = T();
    if (!M.seenLight) {
      ui.introBusy = true;
      const L = tx.light;
      modalNote(`<div style="color:#ffcc33">${L.title}</div><div class="sub" style="margin-top:8px;text-align:left;line-height:1.7">${L.body}</div>`,
        [{ id: "hlOn", label: L.on, gold: true }, { id: "hlGo", label: L.go }, { id: "hlOk", label: L.ok }]);
      const close = fn => { const c = A.commit(() => { SV().huntMeta.seenLight = true; }); $("modal").classList.add("hidden"); ui.introBusy = false; if (c && c.failed) { render(); return; } if (fn) fn(); else render(); };
      $("hlOn").onclick = () => close(() => { setFxPref("on"); A.toast("已開啟減少特效", 1800); render(); });
      $("hlGo").onclick = () => close(() => A.openAcct());
      $("hlOk").onclick = () => close();
      return;
    }
    if (!M.gifted) {
      ui.introBusy = true;
      const n = A.commit(() => MH.gift(SV(), H()));
      if (n && n.failed) { ui.introBusy = false; return; }
      A.renderHud();
      modalNote(`<div style="color:#7fe3ff">${tx.giftTitle}</div><div class="sub" style="margin-top:8px;text-align:left;line-height:1.7">${fill(tx.gift, { n })}</div>`, [{ id: "hgOk", label: "收下", gold: true }]);
      $("hgOk").onclick = () => { $("modal").classList.add("hidden"); ui.introBusy = false; render(); };
    }
  }

  /* ---------- 離開／換礦坑 ---------- */
  function leaveWarn() { const sv = SV(); return MH.inProgress(sv, H()) ? T().leaveWarn : ""; }
  function leave() {
    let res = null;
    const c = A.commit(() => { res = MH.leave(SV(), H()); return res; });   // 金幣入帳＋刪本輪紀錄＝一次原子寫入
    if (c && c.failed) return { failed: true };
    abortFx();
    ui.flash = null; ui.stalled = 0; ui.devSeen = ui.resSeen = ui.doneSeen = false;
    return res;
  }
  function dropRun() { delete SV().huntRuns[H().mine.id]; A.persist(); }   // 離開畫面時被重畫建回來的空紀錄，再清一次

  /* ---------- 開發者／測試 ---------- */
  const persistRender = () => { A.persist(); render(); };   // 開發者工具用（不需要失敗回滾）
  const dev = {
    get state() { return { meta: SV().huntMeta, run: MH.peek(SV(), H()) }; },
    addStamina(n) { const M = SV().huntMeta; M.stamina = Math.max(0, Math.min(H().stamina.cap, M.stamina + (n | 0))); persistRender(); return M.stamina; },
    set(o) { MH.devSet(SV(), H(), o); persistRender(); },
    force(o) { const r = RUN(); r.force = o; A.persist(); },
    fx(kind, pick, t) { FX.seek({ app: $("app"), monEl: document.querySelector("#sceneBig .hunt-mon"), kind: kind || "kill", pick: pick || 0, reduced: reduced(), scale: H().fx.reducedScale, totalMs: H().fx.totalMs, downMs: H().fx.downMs, win: T().win, downText: T().down }, t || 0); },
    fxRelease() { FX.release(); },
    fxPref, setFxPref, reduced
  };

  function init(api) {
    A = api;
    $("btnFeed").addEventListener("click", () => { if (!root.Editor?.isPicking() && A.isHere()) openFeed(); });
  }
  root.HuntUI = { init, render, chrome, tap, onBtn, auto, leave, dropRun, leaveWarn, abortFx, renderFxPanel, fxPref, reduced, dev, maybeIntro, busy };
})(typeof window !== "undefined" ? window : globalThis);
