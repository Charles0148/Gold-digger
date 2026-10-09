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
  const ui = { timers: [], stage: null, introKey: "", scaleKey: "", turnKey: "", preKey: "", stalled: 0, devSeen: false, resSeen: false, doneSeen: false, introBusy: false, feedSel: new Set(), flash: null, feedOpen: false, lastPhase: "", attrDraft: { hunt: 0, dragon: 0, realm: 0 }, attrNote: "", item: null, earnKey: "", earn: 0, tip: null };
  const FXPREF_KEY = "mine_fx_pref_v1";
  const $ = id => document.getElementById(id);
  const H = () => A.H();
  const T = () => H().texts;
  const sub = () => A.config().theme.sub;
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] !== undefined ? o[k] : ""));
  const num = n => Math.floor(n).toLocaleString("en-US");
  const IA = root.HuntItemArt;   // 3C：道具圖示與演出場景（js/hunt-item-art.js）
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

  /* ---------- 怪物（暗影眼光，6 種變體：js/hunt-mon.js）。哪一隻由本輪種子＋第幾隻決定，重新整理不會換 ---------- */
  const HM = root.HuntMon;
  const monIdx = r => (r.anim ? r.kills - (r.anim.kind === "kill" ? 1 : 0) : r.kills);   // 這隻是本輪第幾隻（演出中 kills 已加過）
  const variantOf = r => (((r.seed >>> 0) % HM.count) + monIdx(r)) % HM.count;
  const monName = v => ((T().monNames || [])[v] || "怪物");
  /* 第二階段（2026-10-08）：狹間怪天堂 3 種（曦羽梟、輝環水母、曦角鹿）、地獄 3 種（焰鬃犬、裂角魔影、熔瞳）；駭骨巨龍（12）、破鱗後的巨龍（13，擊殺演出用）。圖在 js/hunt-mon.js */
  const realmIdx = r => ((((r.seed >>> 0) + r.realm.total - (r.anim && r.anim.kind === "kill" ? 1 : 0)) % 3) + 3) % 3;
  const isLast = r => !r.mon || !r.mon.sc || r.mon.t >= r.mon.sc.R - 1;   // 這是最後一輪（沒有劇本的舊戰鬥視為 1 輪）
  const curVariant = r => (r.phase === "dragon" ? ((r.anim && (r.anim.kind === "kill" || (r.anim.kind === "finish" && r.anim.outcome === "win"))) || (r.mon && r.mon.win && isLast(r) && !r.anim) ? HM.DRAGON_BROKEN : HM.DRAGON) : r.phase === "realm" ? HM.realm[r.realm.type][realmIdx(r)] : variantOf(r));
  const curName = r => (r.phase === "dragon" ? T().dragonName : r.phase === "realm" ? T().realmMonNames[r.realm.type][realmIdx(r)] : monName(variantOf(r)));
  const monCls = r => (r.phase === "dragon" ? " dragon" : r.phase === "realm" ? " " + r.realm.type : "");
  const monHtml = (v, cls) => `<div class="hunt-mon${cls || ""}${reduced() ? " reduced" : ""}"><img src="${HM.sprite(v)}" alt=""></div>`;
  const akey = r => r.seed + ":" + (r.anim ? r.anim.rid : 0);
  const SC = root.HuntScene;
  const later = (ms, f) => {
    const id = setTimeout(() => {
      const i = ui.timers.indexOf(id);
      if (i >= 0) ui.timers.splice(i, 1);
      f();
    }, ms);
    ui.timers.push(id);
    return id;
  };
  const clearStage = () => { ui.timers.forEach(clearTimeout); ui.timers = []; ui.stage = null; SC.abort(); };
  /* 全螢幕像素演出（js/hunt-scene.js）。leaveOk＝演出中退出鈕可按（狹間每隻之間）；播完呼叫 then */
  function playScene(o, then) {
    ui.stage = { leaveOk: !!o.leaveOk };
    SC.play(Object.assign({ app: $("app"), reduced: reduced(), texts: T().scene, onDone: () => { ui.stage = null; then(); } }, o));
    render();
  }

  /* ---------- 回合戰鬥：血條、角色、每一輪的句子 ---------- */
  const pickLine = (arr, r, t, salt) => arr[(((r.seed >>> 0) + t * 7 + salt) % arr.length + arr.length) % arr.length];
  /* 第 t 輪發生的事（玩家一句、怪物一句；最後一輪勝時怪物不反擊）。依種子與輪次取句，重新整理不變 */
  function roundLines(r, t) {
    const x = r.mon.sc.rs[t], B = T().battle, nm = curName(r), out = [fill(pickLine(x[0] ? B.playerHit : B.playerMiss, r, t, 1), { name: nm })];
    if (x[2] !== null) out.push(fill(pickLine(x[2] ? B.monHit : B.monMiss, r, t, 3), { name: nm }));
    return out;
  }
  function battleEls() {
    const st = $("sceneStage");
    if (!$("huntHp") || $("huntHp").parentNode !== st) {
      const hp = document.createElement("div"); hp.id = "huntHp"; hp.className = "hunt-hp"; hp.innerHTML = '<i class="c"></i>'.repeat(10); st.appendChild(hp);
      const hero = document.createElement("div"); hero.id = "huntHero"; hero.className = "hunt-hero"; hero.innerHTML = `<img src="${HM.uri(HM.HERO)}" alt="">`; st.appendChild(hero);
    }
    return { hp: $("huntHp"), hero: $("huntHero") };
  }
  function setHp(hp) {
    const e = battleEls(), n = Math.ceil(hp / 10);
    [...e.hp.children].forEach((c, i) => c.classList.toggle("on", i < n));
    e.hp.classList.toggle("low", hp <= 40);
  }
  function showBattle(r) {   // 戰鬥中（有怪、或擊殺／倒下／來回演出）才顯示血條與角色；旅途、判定、餘燼不顯示。怪物沒有血條
    const e = battleEls(), fight = (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") && !!r.mon;
    e.hp.classList.toggle("on", fight); e.hero.classList.toggle("on", fight);
    if (fight) setHp(r.mon.sc ? MH.hpAt(r.mon, r.mon.t) : H().battle.hpMax);
  }
  function floatNum(text, cls, el, dx, dy) {
    const st = $("sceneStage"), sr = st.getBoundingClientRect(), r = el.getBoundingClientRect(), d = document.createElement("div");
    d.className = "hunt-num" + (cls ? " " + cls : ""); d.textContent = text;
    d.style.left = Math.round(r.left - sr.left + r.width / 2 - 14 + (dx || 0)) + "px"; d.style.top = Math.round(r.top - sr.top + (dy || 0)) + "px";
    st.appendChild(d);
    d.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-16px)", opacity: 1, offset: .6 }, { transform: "translateY(-18px)", opacity: 0 }], { duration: 700, easing: "steps(6)" }).onfinish = () => d.remove();
  }
  /* 一輪的小演出：玩家出招（命中／揮空）→ 怪物反擊（命中／被閃開）。只有角色閃爍與小數字，不做全螢幕閃白；減少特效時只有淡入淡出、不位移。
     傷害數字＝劇本的數字 × 招式倍率（突刺／橫掃／蓄力，純演出，不影響勝負）。最後一輪是倒下時，怪物的反擊是重擊、血條歸零，接著才是倒下演出 */
  function playRound(r, rid, then) {
    const h = H(), BF = h.fx.battle, B = h.battle, mon = r.mon, t = mon.t, x = mon.sc.rs[t], red = reduced(), k = red ? h.fx.reducedScale : 1, final = r.anim.kind === "down";
    const mi = mon.pres === 0 ? x[4] : (r.anim.pick | 0), pMs = (x[0] ? BF.playerHitMs : BF.playerMissMs) * k;
    const mMs = (x[2] === null ? 0 : x[2] ? BF.monHitMs + (final ? BF.blowExtraMs : 0) : BF.monMissMs) * k;
    ui.stage = { leaveOk: false };
    render();   // 把按鈕鎖起來、血條畫到這一輪開始前
    const monEl = document.querySelector("#sceneBig .hunt-mon"), hero = battleEls().hero, st = $("sceneStage"), L = roundLines(r, t), mv = (dx) => (red ? [] : [{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }]);
    A.setTextbox([L[0]], 0, { tap: " " });
    // 玩家出招
    if (x[0]) {
      const slash = document.createElement("div"); slash.className = "hunt-slash"; const mr = monEl ? monEl.getBoundingClientRect() : null, sr = st.getBoundingClientRect();
      if (mr) { slash.style.left = Math.round(mr.left - sr.left) + "px"; slash.style.top = Math.round(mr.top - sr.top + mr.height * (mi === 1 ? .5 : mi === 0 ? .35 : .6)) + "px"; slash.style.width = Math.round(mr.width) + "px"; slash.style.transform = `rotate(${mi === 1 ? 0 : mi === 0 ? -14 : 12}deg)`; st.appendChild(slash); slash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: pMs * .7, easing: "steps(3)" }).onfinish = () => slash.remove(); }
      if (monEl) { if (red) monEl.animate([{ opacity: 1 }, { opacity: .5 }, { opacity: 1 }], { duration: pMs * .8, delay: pMs * .15, easing: "steps(3)" }); else monEl.animate(mv(8), { duration: pMs * .7, delay: pMs * .15, easing: "steps(4)" }); }
      if (monEl) floatNum("-" + Math.max(1, Math.round(x[1] * B.mult[mi])), "", monEl, 0, 4);
    } else if (monEl) {
      if (!red) monEl.animate(mv(-10), { duration: pMs * .7, delay: pMs * .15, easing: "steps(4)" });
      floatNum(T().battle.miss, "sub", monEl, 0, 4);
    }
    // 怪物反擊
    if (x[2] !== null) later(pMs, () => {
      A.setTextbox(L, 0, { tap: " " });
      if (x[2] === 1) {
        if (monEl) monEl.animate(red ? [{ opacity: 1 }, { opacity: .6 }, { opacity: 1 }] : [{ transform: "translateX(0)" }, { transform: "translateX(-16px)" }, { transform: "translateX(0)" }], { duration: mMs * .6, easing: "steps(4)" });
        hero.animate([{ opacity: 1 }, { opacity: .25 }, { opacity: 1 }, { opacity: .25 }, { opacity: 1 }], { duration: mMs * .9, delay: mMs * .1, easing: "steps(1)" });
        if (!red) hero.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(0)" }], { duration: mMs * .6, delay: mMs * .1, easing: "steps(3)" });
        floatNum("-" + x[3], "", hero, 4, -6);
        later(mMs * .45, () => setHp(MH.hpAt(mon, t + 1)));   // 血條缺格（逐格變暗灰）
      } else {
        if (!red) hero.animate([{ transform: "translateX(0)" }, { transform: "translateX(-9px)" }, { transform: "translateX(0)" }], { duration: mMs * .8, easing: "steps(4)" });
        floatNum(T().battle.dodge, "sub", hero, 4, -6);
      }
    });
    later(pMs + mMs + 60, () => { ui.stage = null; then(); });
  }

  /* ---------- 畫面 ---------- */
  function chrome(on) {   // 每次 renderMine 都會呼叫：切換「冒險之地」專用的資訊列、按鈕
    if (!on) itemStop();
    $("mbData").classList.toggle("hidden", on);
    $("huntData").classList.toggle("hidden", !on);
    $("btnFeed").classList.toggle("hidden", !on);
    $("btnFeed").textContent = T().feedBtn;
  }
  const busy = () => {
    const r = MH.peek(SV(), H());
    if (FX.playing()) return true;
    if (ui.stage) return !ui.stage.leaveOk;   // 狹間每隻之間的文字轉場：退出鈕可以按
    return !!(r && r.anim && ui.stalled !== r.anim.rid);
  };

  /* 敘述框文字與選項（render 與道具演出的逐格更新共用）。choice.hidden＝只佔位、看不見也按不到（演出中保留按鈕的高度，版面不跳） */
  function paintText(lines, tap, choices) {
    A.setTextbox(lines, 0, { tap: tap || " " });   // 有選項時不顯示「▼ 點擊」
    const box = $("tbChoice");
    if (choices.length) {
      box.classList.remove("hidden");
      box.innerHTML = choices.map(c => `<button class="px-btn wide${c.gold ? " gold" : ""}"${c.hidden ? ' style="visibility:hidden" tabindex="-1" aria-hidden="true" disabled' : ` data-hunt="${c.c}"`}>${c.label}</button>`).join("");
    } else { box.classList.add("hidden"); box.innerHTML = ""; }
  }

  function render() {
    const sv = SV(), h = H(), M = sv.huntMeta, r = RUN(), t = T();
    if (!r.itemOffer && ui.item) itemStop();
    if ((r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") && !r.mon && !r.anim && !r.awaiting && !MH.halted(sv, h)) { MH.spawn(sv, h); A.persist(); }   // 自我修復：能力點提示中的安全停點不可越過
    const halted = MH.halted(sv, h), stalled = !!r.anim && ui.stalled === r.anim.rid, animating = !!r.anim && !stalled, st = M.stamina, locked = busy();
    chrome(true);
    $("mbName").textContent = h.mine.name;
    const PH = { walk: "旅途", dev: r.dev && r.dev.kind === "map" ? "藏寶圖" : "洞窟", country: t.countryName, hunt: "狩獵", dragon: t.dragonName, realm: r.realm ? t.realmName[r.realm.type] : "", ember: "餘燼", done: "凱旋" };
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
    $("btnFeed").disabled = animating || locked || !MH.canFeed(sv, h);   // 只有旅途、發展揭曉後、停住時才能餵
    $("btnLeave").disabled = locked;

    const big = $("sceneBig"), subEl = $("sceneSub");
    let lines = [], tap = "▼ 點擊", choices = [], bigHtml = "", subTxt = "";
    const needN = MH.need(sv, h), lack = Math.max(0, needN - st);
    const hungry = () => { lines = t.hungry.map(x => A.colored(x, sub())).concat([A.colored(fill(t.hungryNeed, { n: lack }), "#ffcc33")]); tap = ""; choices = [{ c: "feed", label: t.feedBtn + "（餵鎬子）", gold: true }]; };
    if (r.itemOffer) {   // 3C：旅途道具（直接取得／兩個相同的木箱）。畫面、時間軸、文字全在下方「旅途道具」一節；這裡只取目前這一格
      itemSync(r);
      const p = itemParts(r); lines = p.lines; choices = p.choices; tap = ""; bigHtml = ""; subTxt = "";
    } else if (r.awaiting) {
      bigHtml = A.colored("能力點 +", "#7fe3ff"); lines = ["這一趟獲得了新的能力點。", "可以先投入，也可以留到後面再決定。"]; tap = "";
      choices = [{ c: "panel", label: "查看本趟能力", gold: true }, { c: "continue", label: "繼續前進" }];
    } else if (r.phase === "walk") {
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
    } else if (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") {
      const dragon = r.phase === "dragon", realm = r.phase === "realm", variant = curVariant(r), nm = curName(r);
      const judging = realm && r.anim && r.anim.kind === "judge";
      bigHtml = r.mon ? monHtml(variant, monCls(r)) : A.colored("…", sub());
      subTxt = dragon ? "" : realm ? (r.mon || r.anim ? nm : "") : `${nm}　第 ${Math.min(r.kills + 1, h.lower.count)} 隻`;   // 狹間不顯示「第 N 隻」
      if (stalled) {   // 演出後的結果寫入失敗，已回到操作前：不自動重播，讓玩家按「再試一次」
        lines = [A.colored(t.saveFail, "#ffcc33")]; tap = ""; choices = [{ c: "retry", label: t.retry, gold: true }];
      } else if (judging) {
        bigHtml = A.colored("· ·", sub()); lines = [t.judgeTug[0]]; tap = "";
      } else if (r.anim && r.anim.kind === "finish" && r.anim.stage === "pending") {
        bigHtml = A.colored(t.pendingTitle, "#9fb4d8"); subTxt = "";
        lines = [t.pendingBody, A.colored(fill(t.pendingGold, { g: num(r.gold) }), "#ffcc33")]; tap = "";
        choices = [{ c: "finishcontinue:" + r.anim.rid, label: t.pendingContinue, gold: true }];
      } else if (r.anim && r.anim.kind === "round") {
        lines = [roundLines(r, r.anim.t)[0]]; tap = "";
      } else if (r.anim) {
        if (r.anim.kind === "kill") lines = [dragon ? fill(t.dragonKill, { g: MH.goldOf(r, h, "dragon") }) : realm ? fill(t.realmKill, { name: nm, g: MH.goldOf(r, h, r.realm.type) }) : fill(t.monHit[r.anim.combo === undefined ? r.anim.pick : r.anim.combo], { name: nm })];
        else lines = [dragon ? t.dragonDownLine : fill(t.downLine, { name: nm })];
        tap = "";
      } else if (r.mon) {
        lines = dragon ? t.dragonIntro.slice() : [fill(realm ? (r.realm.type === "hell" ? t.mobHell : t.mobHeaven) : t.monAppear[r.kills % t.monAppear.length], { name: nm })];
        if (realm && r.mon) lines.push(t.monAppear[(r.realm.total) % t.monAppear.length].replace(/\{name\}/g, nm));
        if (r.mon.sc && r.mon.t > 0) lines = roundLines(r, r.mon.t - 1);   // 第 2 輪起：顯示上一輪發生的事（重新整理後也一樣）
        tap = r.mon.pres === 0 ? "▼ 點擊出招" : "";
        const names = r.mon.pres === 0 ? t.monSingle : r.mon.pres === 1 ? t.monTwo : t.monThree;
        choices = names.map((l, i) => ({ c: "strike:" + i, label: l, gold: r.mon.pres === 0 }));
        if (dragon && st < h.dragon.warnStamina) lines.push(A.colored(t.dragonWarn, "#7fe3ff"));
        if (ui.flash && ui.flash.rid === r.rid) lines.unshift(A.colored(ui.flash.text, "#ffe0a0"));
      } else if (halted) {
        hungry();
        if (dragon) lines[lines.length - 1] = A.colored(fill(t.dragonHungry, { n: lack }), "#ffcc33");
        else if (realm) lines[lines.length - 1] = A.colored(fill(t.realmHungry, { n: lack }), "#ffcc33");
      }
    } else if (r.phase === "ember") {
      bigHtml = A.colored("✦", "#ffe0a0");
      if (stalled) { lines = [A.colored(t.saveFail, "#ffcc33")]; tap = ""; choices = [{ c: "retry", label: t.retry, gold: true }]; }
      else if (r.anim) { lines = [t.emberCharge]; tap = ""; }
      else { lines = t.emberWait.slice(); tap = ""; choices = [{ c: "ignite", label: t.emberBtn, gold: true }]; }
    } else if (r.phase === "done") {
      const L = r.last, w = L.why;
      bigHtml = A.colored(w === "empty" ? "空手" : w === "down" ? "撤退" : w === "ember" ? t.emberFailBig : "凱旋", w === "empty" || w === "ember" ? sub() : "#ffcc33");
      lines = [A.colored(fill(w === "full" ? t.doneFull : w === "down" ? (L.dragon ? t.doneDragonDown : t.doneDown) : w === "realm" ? t.doneRealm : w === "ember" ? t.doneEmber : t.doneEmpty, { k: L.kills, g: num(L.gold) }), w === "empty" ? sub() : "#ffcc33")];
      lines.push(`這一趟獲得能力點 ${num(L.attrEarned || 0)}。`);
      if (L.itemId) { const d = MH.itemDef(h, L.itemId); if (d) lines.push(`行囊裡帶過：${d.name}`); }
      tap = t.doneTap;
    }
    let tint = r.realm && (r.phase === "realm" || r.phase === "ember") && !(r.anim && r.anim.kind === "judge") ? r.realm.type : null;
    if (ui.stage) { choices = []; tap = " "; }   // 全螢幕演出中：底下的畫面不給選項
    showBattle(r);
    $("scene").classList.toggle("realm-heaven", tint === "heaven"); $("scene").classList.toggle("realm-hell", tint === "hell");
    big.innerHTML = bigHtml; subEl.textContent = subTxt;
    paintText(lines, tap, choices);
    huntHud(r);
    A.renderHud();
    maybeFx();
    maybeStage();
    maybeIntro();
  }

  /* ---------- 斬擊／倒下，以及第二階段的判定、點燃、巨龍登場／破鱗與狹間轉場演出 ---------- */
  /* 巨龍登場：巨龍出現後、出招前播一次（只是演出；重新整理會再播，無害） */
  function maybeStage() {
    const r = MH.peek(SV(), H());
    if (!r || ui.stage || FX.playing() || !A.onMine() || r.phase !== "dragon" || !r.mon || r.anim || $("splash")) return;
    const key = r.seed + ":" + r.n;
    if (ui.introKey !== key) { ui.introKey = key; playScene({ id: "intro", ms: H().fx.dragonIntroMs }, () => { if (A.onMine()) render(); }); return; }
    if (r.mon.win && isLast(r) && ui.scaleKey !== key) {   // 破鱗過場放在「最後一輪開始前」（巨龍勝的劇本才會破鱗）；接著玩家選最後一招 → 5 秒擊殺
      ui.scaleKey = key; playScene({ id: "brk", ms: H().fx.dragonScaleMs }, () => { if (A.onMine()) render(); });
    }
  }
  /* 判定（單向推進）：天堂 6 秒、地獄 8 秒；點燃成功後的新一輪用短版（同一段畫面等比例縮短） */
  function judgeStage(a, rid) {
    const fx = H().fx;
    playScene({ id: a.type, ms: a.first ? fx.judgeMs[a.type] : fx.judgeMs.again }, () => fxDone(rid));
  }
  /* 點燃：蓄力一路穩定變亮，成敗只在最後約 1.5 秒分開 */
  function emberStage(r, rid) {
    playScene({ id: "ember", ms: H().fx.emberMs, ok: r.ember.ok, gold: r.gold }, () => fxDone(rid));
  }
  /* 狹間每隻之間：5 種場景輪流（天堂金白／地獄赤紅），繼續與結束用同一段畫面、只換句子；退出鈕可按 */
  const TURN_IDS = ["tunnel", "buddy", "glyph", "roar", "fx"];
  function turnStage(r, rid) {
    const t = T().scene.turn, RT = r.realm.type, id = TURN_IDS[(((r.seed >>> 0) % 5) + r.realm.total) % 5];
    const res = r.after === "rend" ? "end" : "cont", pool = t[id === "fx" ? (RT === "hell" ? "fxD" : "fxH") : id][res];   // 撐滿那隻（接餘燼）用「繼續」的句子，不透露上限
    const ln = pool[(Math.floor(r.realm.total / 5) + (r.seed >>> 0)) % pool.length];
    playScene({ id, ms: H().fx.turnScenes[id], realm: RT, res, line: ln, leaveOk: true, leaveText: "離開", onLeave: () => $("btnLeave").click() },
      () => { ui.turnKey = akey(MH.peek(SV(), H()) || r); fxDone(rid); });
  }
  function maybeFx() {
    const sv = SV(), r = MH.peek(sv, H());
    if (!r || !r.anim || FX.playing() || ui.stage || !A.onMine() || ui.stalled === r.anim.rid) return;
    const rid = r.anim.rid;
    if ($("splash")) { setTimeout(() => { if (A.onMine()) maybeFx(); }, 300); return; }   // 開場動畫還沒收起：先等（重開後補播的演出才看得到）
    requestAnimationFrame(() => {
      const r2 = MH.peek(SV(), H());
      if (!r2 || !r2.anim || r2.anim.rid !== rid || FX.playing() || ui.stage || !A.onMine()) return;
      const a = r2.anim, fx = H().fx, t = T();
      if (a.kind === "finish" && a.stage === "pending") return;
      if (a.kind === "finish" && a.stage === "charge") {
        return FX.playCharge({ app: $("app"), tier: a.tier, reduced: reduced(), auto: !!A.save().auto, autoMs: H().finisher.autoReleaseMs, autoModeMs: H().finisher.autoModeReleaseMs,
          onDone: () => { const res = A.commit(() => MH.releaseCharge(SV(), H(), rid)); if (res && res.failed) { ui.stalled = 0; A.stopAuto(); A.toast(T().saveFail, 2400); } if (A.onMine()) render(); } });
      }
      if (a.kind === "finish" && a.stage === "revive") {
        return FX.playRevive({ app: $("app"), monEl: document.querySelector("#sceneBig .hunt-mon"), sceneEl: $("sceneStage"), variant: curVariant(r2), tone: r2.phase === "realm" ? r2.realm.type : "", finisher: a.finisher, combo: a.combo, comboText: t.combo, reduced: reduced(), scale: fx.reducedScale, win: t.win, onDone: () => fxDone(rid) });
      }
      if (a.kind === "finish" && a.stage === "attack") {
        const failed = a.outcome === "lose" || a.fake;
        return FX.play({ app: $("app"), monEl: document.querySelector("#sceneBig .hunt-mon"), sceneEl: $("sceneStage"), variant: curVariant(r2), tone: r2.phase === "realm" ? r2.realm.type : "", kind: failed ? "fail" : "kill", finisher: a.finisher, combo: a.combo, comboText: t.combo, reduced: reduced(), scale: fx.reducedScale,
          totalMs: fx.totalMs, win: t.win, downText: t.down, onDone: failed ? () => { const res = A.commit(() => MH.pendingDefeat(SV(), H(), rid)); if (res && res.failed) { ui.stalled = 0; A.stopAuto(); A.toast(T().saveFail, 2400); } if (A.onMine()) render(); } : () => fxDone(rid) });
      }
      if (a.kind === "judge") return judgeStage(a, rid);
      if (a.kind === "ember") return emberStage(r2, rid);
      if (a.kind === "round") return playRound(r2, rid, () => fxDone(rid));   // 回合戰鬥的中途一輪
      if (a.kind === "down" && r2.mon && r2.mon.sc && ui.preKey !== akey(r2)) return playRound(r2, rid, () => { ui.preKey = akey(r2); maybeFx(); });   // 最後一輪倒下：先播玩家出招＋怪物重擊（血條歸零），再播倒下演出
      if (a.kind === "down" && !(r2.mon && r2.mon.sc)) setHp(0);
      const dragonDown = r2.phase === "dragon" && a.kind === "down";
      try {
        FX.play({ app: $("app"), monEl: document.querySelector("#sceneBig .hunt-mon"), sceneEl: $("sceneStage"), variant: curVariant(r2), tone: r2.phase === "realm" ? r2.realm.type : "", kind: a.kind, combo: a.combo, comboText: t.combo, reduced: reduced(), scale: fx.reducedScale,
          totalMs: fx.totalMs, downMs: dragonDown ? fx.dragonDownMs : fx.downMs, win: t.win, downText: dragonDown ? t.dragonDownText : t.down, onDone: () => fxDone(rid) });
      } catch (e) { console.error("斬擊演出失敗：" + (e && e.message)); FX.abort(); fxDone(rid); }
    });
  }
  function fxDone(rid) {
    const sv = SV(), h = H(), r = MH.peek(sv, h);
    if (!r || !r.anim || r.anim.rid !== rid) { if (A.onMine()) render(); return; }   // 演出播放期間存檔被換掉（接回雲端等）：舊演出作廢，重畫並讓新存檔的待播演出接著播
    if (r.phase === "realm" && r.anim.kind === "kill" && ui.turnKey !== akey(r)) { turnStage(r, rid); return; }   // 狹間：擊殺演出後先播文字轉場，再前進
    const kind = r.anim.kind, vname = curName(r), wasDragon = r.phase === "dragon";
    const res = A.commit(() => MH.finishAnim(SV(), H(), rid));   // 原子：往下一隻／凱旋入帳＋存檔；寫入失敗會回到演出前
    if (res && res.failed) { ui.stalled = rid; A.stopAuto(); if (A.onMine()) render(); return; }
    ui.stalled = 0;
    if (res.ok && kind === "kill" && !wasDragon && MH.peek(SV(), H()).phase === "hunt") ui.flash = { rid: MH.peek(SV(), H()).rid, text: fill(T().killLine, { g: MH.goldOf(MH.peek(SV(), H()), H(), "hunt"), name: vname }) };
    if (A.onMine()) render(); else A.renderHud();
  }
  function abortFx() { FX.abort(); clearStage(); itemStop(); }

  /* ---------- 旅途道具（3C）：直接取得（約 1.5 秒）、兩個相同的木箱（選後 2.1 秒，有道具與空箱同長）----------
     只畫、不抽：結果在 mine-hunt.js 先存檔（itemOffer 的 rid／stage／chosen），這裡只依存檔重播演出，所以演出中重新整理不會重抽。
     兩個木箱：待選是兩個相同的關閉木箱；選後 0～1240 毫秒畫面、文字、版面逐格相同，未選箱中性淡出；1250 毫秒之後才分出有道具或乾草 */
  const q5 = a => Math.round(Math.max(0, Math.min(1, a)) * 5) / 5;
  const ssub = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const itemTime = () => { const f = H().fx.item || {}; return { direct: f.directMs || 1500, chest: f.chestMs || 2100, k: reduced() ? (f.reducedScale || 0.85) : 1 }; };
  const qualOf = d => IA.QUALITY[d && d.quality] || 1;
  const itemCardHtml = (id, a) => {
    const d = MH.itemDef(H(), id), x = T().item;
    return `<span class="hi-card${a > 0 ? "" : " sp"}" style="opacity:${q5(a)}"><img class="hi-ic" src="${IA.uri(id, 2, true, qualOf(d))}" alt=""><span class="hi-tx"><b>${d.name}</b><span>${x.quality[d.quality]}｜${d.text}</span></span></span>`;
  };
  function itemStop() {
    const it = ui.item; if (!it) return;
    if (it.raf) clearTimeout(it.raf);
    if (it.wrap && it.wrap.parentNode) it.wrap.parentNode.removeChild(it.wrap);
    ui.item = null;
  }
  /* 依存檔建立（或沿用）演出：同一個 rid／stage／chosen 不重來，所以 render 被其他事件呼叫也不會重播 */
  function itemSync(r) {
    const o = r.itemOffer, key = o.rid + ":" + o.stage + ":" + (o.chosen === null ? "" : o.chosen), cur = ui.item;
    if (cur && cur.key === key && cur.wrap.isConnected) return cur;
    itemStop();
    const wrap = document.createElement("div"); wrap.id = "huntItem"; wrap.className = "hi-wrap"; wrap.innerHTML = '<canvas id="huntItemCv"></canvas><div class="hi-title"></div>';
    $("sceneStage").appendChild(wrap);
    const tm = itemTime(), show = o.stage === "show", direct = o.route === "direct";
    const side = o.route === "empty" ? o.chosen : o.route === "choice" ? (o.candidates[0] === o.chosen ? "left" : "right") : null;
    const it = ui.item = { key, wrap, cv: wrap.firstChild, title: wrap.lastChild, st: IA.Stage(wrap.firstChild), t: 0, playing: show, last: 0, raf: 0, htmlKey: "",
      kind: !show ? "idle" : direct ? "direct" : "chest", dur: direct ? tm.direct : tm.chest,
      P: { pick: side, res: o.route === "choice" || direct ? "item" : "empty", item: o.route === "empty" ? null : o.chosen } };
    itemDraw(it); itemTitle(it, itemView(r, 0));
    if (show) { it.last = performance.now(); it.raf = setTimeout(itemTick, 33); }
    return it;
  }
  function itemDraw(it) { it.st.draw(it.kind, it.t, it.P, reduced()); }
  /* 這一格該顯示的標題、文字、道具卡、按鈕（時間 t 的純函式；t 之前的逐字相同由 tools 之外的瀏覽器自測確認） */
  function itemView(r, t) {
    const o = r.itemOffer, x = T().item, boxed = o.stage === "offer" || o.route !== "direct", v = { title: boxed ? x.boxTitle : x.bagTitle, ta: 1, lines: [], card: null, btn: null };
    if (o.stage === "offer") { v.lines = x.offer.map(s => ({ s, a: 1 })); v.btn = "offer"; return v; }
    const it = ui.item, dur = it ? it.dur : 0;
    if (o.route === "direct") {
      v.ta = ssub(t, 700, 950); v.lines = [{ s: x.directLine, a: ssub(t, 900, 1200), m: 1 }]; v.card = { id: o.chosen, a: ssub(t, 1200, 1500) };
      v.btn = t >= dur ? "take" : "wait"; return v;
    }
    const item = o.route === "choice", side = it && it.P.pick === "left" ? 0 : 1;
    v.lines = [{ s: x.open[side], a: ssub(t, 200, 450) }, item ? { s: x.boxLine, a: ssub(t, 1500, 1800), m: 1 } : { s: x.emptyLine, a: ssub(t, 1450, 1750), m: 1 }];
    v.card = item ? { id: o.chosen, a: ssub(t, 1750, 2050) } : { id: null, a: 0 };   // 空箱也保留同樣高度的空位，版面與有道具的一致
    v.btn = t >= dur ? (item ? "take" : "go") : "wait";
    return v;
  }
  function itemParts(r) {
    const it = ui.item, v = itemView(r, it ? it.t : 0), x = T().item, o = r.itemOffer;
    const lines = v.lines.map(l => `<span${l.m ? ' class="hi-m"' : ""}${q5(l.a) > 0 ? ` style="opacity:${q5(l.a)}">${l.s}` : ' style="visibility:hidden" aria-hidden="true">&nbsp;'}</span>`);   // 還沒出現的字只留空位（兩個結果在這之前的畫面與內容逐格相同；最多兩行高，字出現時版面不跳）
    if (v.card) lines.push(v.card.id && v.card.a > 0 ? itemCardHtml(v.card.id, v.card.a) : `<span class="hi-card sp" aria-hidden="true"></span>`);
    const choices = v.btn === "offer" ? [{ c: `item:left:${o.rid}`, label: x.pick[0] }, { c: `item:right:${o.rid}`, label: x.pick[1] }]
      : v.btn === "take" ? [{ c: `itemdone:${o.rid}`, label: x.take, gold: true }] : v.btn === "go" ? [{ c: `itemdone:${o.rid}`, label: x.emptyBtn }]
      : v.btn === "wait" ? [{ hidden: true, label: x.take }] : [];
    return { lines, choices, v };
  }
  function itemTitle(it, v) { it.title.textContent = v.title; it.title.style.opacity = q5(v.ta); it.title.style.color = v.title === T().item.boxTitle ? "#caa36a" : "#7fe3ff"; }
  function itemPaint(it) {   // 畫布＋標題＋敘述框文字（只在內容有變時才重寫敘述框，所以按鈕不會被打斷）
    itemDraw(it);
    const r = MH.peek(SV(), H());
    if (!r || !r.itemOffer) return;
    const p = itemParts(r), key = JSON.stringify([p.lines, p.choices]);
    itemTitle(it, p.v);
    if (key !== it.htmlKey) { it.htmlKey = key; if (A.onMine()) paintText(p.lines, " ", p.choices); }
  }
  function itemTick() {   // 約 30 張／秒（小畫布）；用 setTimeout 而不是 requestAnimationFrame：背景分頁自然變慢，時間差有上限，回來會從原處接著播
    const it = ui.item; if (!it) return;
    it.raf = 0;
    const ts = performance.now();
    if (!it.wrap.isConnected) { ui.item = null; return; }
    const dt = Math.min(250, Math.max(0, ts - it.last)); it.last = ts;
    if (it.playing) {
      it.t = Math.min(it.dur, it.t + dt / itemTime().k);
      if (it.t >= it.dur) it.playing = false;
      itemPaint(it);
    }
    if (it.playing) it.raf = setTimeout(itemTick, 33);
  }

  /* ---------- 能力點提示條（3 秒、不彈窗、不擋點擊、不停自動）與「本趟能力」「行囊」鈕 ---------- */
  function tipBar(n) {
    const old = $("huntTip"); if (old) old.remove();
    const x = T().item, el = document.createElement("div"), red = reduced(), ms = (H().fx.item || {}).tipMs || 3100;
    el.id = "huntTip"; el.className = "hi-tip"; el.innerHTML = `<b>${x.tipMain}${num(n)}</b><span>${x.tipSub}</span>`;
    $("sceneStage").appendChild(el);
    const a = red ? [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 150 / ms }, { opacity: 1, offset: 1 - 300 / ms }, { opacity: 0 }]
      : [{ opacity: 1, transform: "translateY(-40px)", offset: 0 }, { opacity: 1, transform: "translateY(0)", offset: 200 / ms }, { opacity: 1, offset: 1 - 300 / ms }, { opacity: 0 }];
    el.animate(a, { duration: ms, easing: "steps(5)", fill: "both" }).onfinish = () => el.remove();
  }
  function huntHud(r) {
    const earned = r.attr ? r.attr.earned | 0 : 0;
    if (ui.earnKey !== String(r.seed)) { ui.earnKey = String(r.seed); ui.earn = earned; }   // 第一次看到這一趟（含重新整理）只記基準，不重播提示
    else if (earned > ui.earn) { tipBar(earned - ui.earn); ui.earn = earned; }
    else ui.earn = earned;
    const dot = $("huntDot"), bag = $("huntBagIc"), held = heldId(r);
    if (dot) dot.classList.toggle("hidden", !(r.attr && r.attr.free > 0));
    if (bag) { const d = held && MH.itemDef(H(), held); bag.src = d ? IA.uri(held, 1, true, qualOf(d)) : IA.slot(); bag.alt = d ? d.name : ""; }
  }

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
  function doIgnite() { return act(() => MH.ignite(SV(), H())); }
  function doAgain() { ui.doneSeen = false; ui.flash = null; return act(() => MH.again(SV(), H())); }
  function doContinue() { return act(() => MH.continueRun(SV(), H())); }
  function doFinishContinue(rid) { return act(() => MH.continueDefeat(SV(), H(), rid)); }
  function doItem(side, rid) { return act(() => MH.pickItem(SV(), H(), side, rid)); }
  function doItemDone(rid) { return act(() => MH.dismissItem(SV(), H(), rid)); }

  /* ---------- 本趟能力面板／行囊（3C 正式樣式；邏輯與 3B 相同：草稿不存、確認後再問一次、確認後不可退） ---------- */
  const ANAME = { hunt: "獵手本能", dragon: "破鱗技巧", realm: "遠行意志" }, ADESC = { hunt: "更容易解決旅途上的一般怪物", dragon: "更容易突破駭骨巨龍", realm: "在天堂與地獄走得更遠" };
  /* 行囊裡看得到的道具：旅途道具演出還沒收好之前（itemOffer 還在）不顯示，免得開箱前就從行囊圖示看出結果 */
  const heldId = r => (r.itemOffer ? null : MH.ITEM_IDS.find(id => r.items && r.items[id]) || null);
  function bagBlock(r) {
    const id = heldId(r), d = id && MH.itemDef(H(), id), x = T().item;
    if (!d) return `<div class="ha-bag"><div class="ha-tx"><b>${x.bagTitle}</b><br><span class="sub">${x.bagNone}</span></div></div>`;
    return `<div class="ha-bag"><img class="hi-ic" src="${IA.uri(id, 2, true, qualOf(d))}" alt=""><div class="ha-tx"><b>${x.bagTitle}｜${d.name}</b> <span class="q">${x.quality[d.quality]}</span><br><span class="sub">${d.text}</span></div></div>`;
  }
  function attrPanel(reset) {
    A.stopAuto();
    if (reset) { ui.attrDraft = { hunt: 0, dragon: 0, realm: 0 }; ui.attrNote = ""; }
    const r = RUN(), a = r.attr, safe = MH.attrSafe(r), x = T().item;
    const used = MH.ATTRS.reduce((n, k) => n + ui.attrDraft[k], 0), remain = a.free - used;
    const word = lv => (lv <= 0 ? "尚未投入" : lv <= 2 ? "稍微提升" : lv <= 5 ? "提升" : "明顯提升");   // 不顯示任何百分比
    let pips = ""; for (let i = 0; i < Math.min(a.free, 12); i++) pips += `<i class="${i < remain ? "" : "u"}"></i>`; if (a.free > 12) pips += '<span class="sub">…</span>';
    const rows = MH.ATTRS.map(k => {
      const active = MH.attrActive(r, k), d = ui.attrDraft[k], level = a[k] + d;
      const fxt = !active ? x.dead : d ? `${word(a[k])} → ${word(level)}` : word(a[k]);
      return `<div class="ha-row${active ? "" : " dead"}"><img class="ha-ic" src="${IA.uri(k, 2, false)}" alt=""><div class="ha-am"><b>${ANAME[k]}</b><span class="sub">${ADESC[k]}</span><span class="sub">已確認 ${num(a[k])}${d ? "　這次 +" + d : ""}</span><span class="ha-fx${active ? "" : " off"}">${fxt}</span></div><div class="hunt-attr-step"><button class="px-btn small" id="haMinus-${k}" ${d ? "" : "disabled"}>－</button><span>${d ? "+" + d : "0"}</span><button class="px-btn small" id="haPlus-${k}" ${safe && active && remain > 0 ? "" : "disabled"}>＋</button></div></div>`;
    }).join("");
    modalNote(`<div class="ha"><div class="ha-title">本趟能力</div><div class="sub ha-sub">${x.panelSub}</div><div>可分配點數：<b class="ha-n">${num(Math.max(0, remain))}</b></div><div class="ha-pips">${pips}</div>${rows}${bagBlock(r)}${safe ? "" : `<div class="sub" style="margin-top:8px">${x.viewOnly}</div>`}${ui.attrNote ? `<div class="ha-note">${ui.attrNote}</div>` : ""}</div>`,
      [{ id: "haCommit", label: "確認投入", gold: true }, { id: "haClose", label: "關閉" }]);
    $("haCommit").disabled = used <= 0 || used > a.free || !safe;
    MH.ATTRS.forEach(k => {
      $("haMinus-" + k).onclick = () => { ui.attrDraft[k] = Math.max(0, ui.attrDraft[k] - 1); attrPanel(false); };
      $("haPlus-" + k).onclick = () => { ui.attrDraft[k]++; ui.attrNote = ""; attrPanel(false); };
    });
    $("haClose").onclick = () => { $("modal").classList.add("hidden"); };
    $("haCommit").onclick = () => {
      const draft = Object.assign({}, ui.attrDraft);
      modalNote(`<div class="ha"><div class="ha-ask">投入後，這一趟不能重新分配。</div><div class="sub" style="margin:10px 0 4px">要確認投入這些能力點嗎？</div></div>`, [{ id: "haYes", label: "確認投入", gold: true }, { id: "haNo", label: "返回" }]);
      $("haNo").onclick = () => attrPanel(false);
      $("haYes").onclick = () => { const res = act(() => MH.allocate(SV(), H(), draft)); if (res.ok) { ui.attrDraft = { hunt: 0, dragon: 0, realm: 0 }; ui.attrNote = x.panelDone; attrPanel(false); } else if (!res.failed) attrPanel(false); };   // 成功後面板留著顯示「已投入」，－全灰、不能退回
    };
  }
  function bagPanel() {
    const r = RUN(), x = T().item, has = !!heldId(r);
    modalNote(`<div class="ha"><div class="ha-title">${x.bagTitle}</div><div class="sub ha-sub">${x.bagNote}</div>${bagBlock(r)}<div class="sub" style="margin-top:8px">${has ? x.bagKeep : x.bagHint}</div></div>`, [{ id: "hbClose", label: "關閉" }]);
    $("hbClose").onclick = () => { $("modal").classList.add("hidden"); };
  }

  /* 點敘述框（textbox）：依目前階段做「主要動作」。有選項的地方只能按按鈕 */
  function tap() {
    const sv = SV(), r = RUN();
    if (r.anim || FX.playing() || ui.stage) return;
    if (r.itemOffer || r.awaiting) return;
    if (r.phase === "walk") { if (A.dayBlocked()) return; if (MH.halted(sv, H())) { A.toast(T().hungry[0], 1600); return; } doStep(); }
    else if (r.phase === "dev") { if (MH.halted(sv, H())) { A.toast(T().goInHungry, 1600); return; } doEnter(); }
    else if (r.phase === "country") { if (r.country.pick !== null) doAfterCountry(); }
    else if (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") { if (r.mon && r.mon.pres === 0) doStrike(0); }
    else if (r.phase === "ember") doIgnite();
    else if (r.phase === "done") doAgain();
  }
  function onBtn(code) {
    const [k, v, x] = String(code).split(":");
    if (k === "feed") openFeed();
    else if (k === "panel") attrPanel(true);
    else if (k === "bag") bagPanel();
    else if (k === "continue") doContinue();
    else if (k === "finishcontinue") doFinishContinue(+v);
    else if (k === "item") doItem(v, +x);
    else if (k === "itemdone") doItemDone(+v);
    else if (k === "cpick") doPick(+v);
    else if (k === "strike") { const r = RUN(); if (!r.anim && !FX.playing() && !ui.stage) doStrike(+v); }
    else if (k === "ignite") { const r = RUN(); if (!r.anim && !FX.playing() && !ui.stage) doIgnite(); }
    else if (k === "fx") setFxPref(v);
    else if (k === "retry") { const r = RUN(); if (r.anim && ui.stalled === r.anim.rid && !FX.playing()) fxDone(r.anim.rid); }
  }

  /* ---------- 自動模式（規格 2.7）：演出播完才繼續；二選一／三選一、國度解題、停住時不代按 ---------- */
  function auto() {
    const sv = SV(), h = H(), r = RUN();
    if (FX.playing() || r.anim || ui.stage) return { wait: 300 };
    if (A.modalOpen()) return { wait: 400 };
    if (MH.halted(sv, h)) { A.toast("體力用完了，餵鎬子才能繼續走", 2400); return { stop: true }; }
    if (r.itemOffer) return { wait: 400 };   // 道具二選一／空箱由玩家決定；直接取得也等玩家看完
    if (r.awaiting) { doContinue(); return { wait: 400 }; }   // 取得能力點不強制停自動，未投入點數保留
    if (r.phase === "walk") { if (A.dayBlocked()) return { stop: true }; doStep(); return { wait: A.autoWait() }; }
    if (r.phase === "dev") { if (!ui.devSeen) { ui.devSeen = true; return { wait: 1100 }; } ui.devSeen = false; doEnter(); return { wait: 400 }; }
    if (r.phase === "country") {
      if (r.country.pick === null) return { wait: 400 };   // 國度解題：等玩家
      if (!ui.resSeen) { ui.resSeen = true; return { wait: 1200 }; }
      ui.resSeen = false; doAfterCountry(); return { wait: 400 };
    }
    if (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") {
      if (!r.mon) return { wait: 400 };
      if (r.phase !== "dragon" && r.mon.pres === 0) { doStrike(0); return { wait: 400 }; }   // 單鈕：代按「出招」
      return { wait: 400 };                                                                    // 二選一／三選一、巨龍的三選一：等玩家
    }
    if (r.phase === "ember") return { wait: 400 };   // 「點燃」：等玩家（審查員／組長指示：選擇與點燃時自動暫停）
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
        if (res.ok && (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") && !r.mon && !r.anim) MH.spawn(SV(), H());
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
    ui.flash = null; ui.introKey = ui.scaleKey = ui.turnKey = ui.preKey = ""; ui.stalled = 0; ui.devSeen = ui.resSeen = ui.doneSeen = false; ui.earnKey = "";
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
    fx(kind, combo, t) { FX.seek({ app: $("app"), monEl: document.querySelector("#sceneBig .hunt-mon"), sceneEl: $("sceneStage"), comboText: T().combo, variant: curVariant(RUN()), kind: kind || "kill", combo: combo || 0, reduced: reduced(), scale: H().fx.reducedScale, totalMs: H().fx.totalMs, downMs: H().fx.downMs, win: T().win, downText: T().down }, t || 0); },
    fxRelease() { FX.release(); },
    fxPref, setFxPref, reduced,
    /* 3C 測試用：把旅途道具演出停在第 t 毫秒（t 省略＝取目前畫面狀態）；回傳畫布圖與敘述框 HTML，供「開箱前逐格相同」比對與截圖 */
    itemSeek(t) { const it = ui.item; if (!it) return null; if (t !== undefined) { it.playing = false; if (it.raf) clearTimeout(it.raf); it.raf = 0; it.t = Math.max(0, Math.min(it.dur, t)); it.htmlKey = ""; itemPaint(it); } return { t: it.t, dur: it.dur, cv: it.cv.toDataURL(), tx: $("tbLines").innerHTML + "|" + $("tbChoice").innerHTML, title: it.title.textContent + it.title.style.opacity }; }
  };

  function init(api) {
    A = api;
    $("btnFeed").addEventListener("click", () => { if (!root.Editor?.isPicking() && A.isHere()) openFeed(); });
  }
  root.HuntUI = { init, render, chrome, tap, onBtn, auto, leave, dropRun, leaveWarn, abortFx, renderFxPanel, fxPref, reduced, dev, maybeIntro, busy };
})(typeof window !== "undefined" ? window : globalThis);
