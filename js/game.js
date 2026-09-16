/* =========================================================
   遊戲本體 Game：畫面、存檔、玩家操作
   ========================================================= */
(function () {
  const E = window.MineEngine;
  const CFG_KEY = "mine_config_v1";
  const SAVE_KEY = "mine_save_v1";
  const $ = id => document.getElementById(id);

  /* ---------------- 工具函式 ---------------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = n => Math.floor(n).toLocaleString("en-US");
  const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function seeded(str) { // 以字串產生固定亂數（同一天同一礦坑 → 同一個設定）
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  }
  function deepMerge(base, over) {
    if (Array.isArray(base) || typeof base !== "object" || base === null) return over === undefined ? base : over;
    const out = Array.isArray(over) ? over : { ...base };
    if (over && typeof over === "object" && !Array.isArray(over)) {
      for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }

  /* ---------------- 設定檔 ---------------- */
  let config = deepMerge(clone(window.DEFAULT_CONFIG), store.get(CFG_KEY) || {});

  /* ---------------- 存檔 ---------------- */
  function newSave() {
    return {
      v: 1, name: "", coins: 300, uid: 1,
      tools: [], equipped: null,
      ores: {}, dex: {}, upgrades: {},
      unlocked: ["m1"], mineId: "m1",
      plays: {}, today: { date: todayKey(), stats: {} },
      ads: { date: todayKey(), count: 0 },
      auto: false, debug: { showSetting: false, forceSetting: 0 }
    };
  }
  let save = store.get(SAVE_KEY);
  let needStarter = false;
  if (!save || save.v !== 1) { save = newSave(); needStarter = true; }
  save.auto = false;
  let saveTimer = null;
  function persist(now) {
    clearTimeout(saveTimer);
    if (now) store.set(SAVE_KEY, save);
    else saveTimer = setTimeout(() => store.set(SAVE_KEY, save), 400);
  }

  /* ---------------- 查詢 ---------------- */
  const toolDef = id => config.tools.find(t => t.id === id);
  const mineDef = id => config.mines.find(m => m.id === id);
  const curMine = () => mineDef(save.mineId) || config.mines[0];
  const catDef = id => config.categories.find(c => c.id === id);
  const rarityColor = r => (config.rarities[r] || config.rarities[0]).color;
  const upLv = id => save.upgrades[id] || 0;
  function toolMax(id) { const d = toolDef(id); return Math.round(d.durability * (1 + upLv(id) * config.upgrade.durabilityPerLv)); }
  function totalPlays() { return save.tools.reduce((a, t) => a + t.dur, 0); }
  function sellBonus() { return 1 + Object.values(save.upgrades).reduce((a, b) => a + b, 0) * config.upgrade.valuePerLv; }

  // 物品名稱 → 屬於哪座礦坑、哪個小役
  function itemIndex() {
    const idx = {};
    config.mines.forEach(m => config.categories.forEach(c => {
      (m.items[c.id] || []).forEach(name => { idx[name] = { mine: m, cat: c }; });
    }));
    return idx;
  }
  function itemPrice(name) {
    const it = itemIndex()[name]; if (!it) return 0;
    return Math.round(it.cat.value * it.mine.mult * sellBonus());
  }

  function todaySetting(mineId) {
    if (save.debug.forceSetting) return save.debug.forceSetting;
    const r = seeded(todayKey() + "|" + mineId);
    let acc = 0; const dist = config.rules.settingDist;
    for (let i = 0; i < dist.length; i++) { acc += dist[i]; if (r < acc) return i + 1; }
    return 1;
  }
  function checkDay() {
    const k = todayKey();
    if (save.today.date !== k) save.today = { date: k, stats: {} };
    if (save.ads.date !== k) save.ads = { date: k, count: 0 };
  }
  function mineStats(id) {
    return save.today.stats[id] || (save.today.stats[id] = { swings: 0, hits: 0, epic: 0, normalSwings: 0 });
  }

  /* ---------------- 工具 ---------------- */
  function addTool(id, ratio) {
    const max = toolMax(id);
    const t = { uid: save.uid++, id, dur: Math.max(1, Math.round(max * ratio)), max };
    save.tools.push(t);
    return t;
  }
  function activeTool() {
    const mine = curMine();
    const ok = t => t.dur > 0 && toolDef(t.id) && toolDef(t.id).tier >= mine.tier;
    let t = save.tools.find(x => x.uid === save.equipped);
    if (t && ok(t)) return t;
    // 自動裝備：可用的最低階、耐久最少的
    const list = save.tools.filter(ok).sort((a, b) => toolDef(a.id).tier - toolDef(b.id).tier || a.dur - b.dur);
    t = list[0] || null;
    save.equipped = t ? t.uid : null;
    return t;
  }

  if (needStarter) { addTool("wood", 1); addTool("wood", 1); } // 新手送兩把木鎬

  /* ---------------- 主題 / 版面 / 圖片 套用 ---------------- */
  function applyLook() {
    const th = config.theme, rs = document.documentElement.style;
    rs.setProperty("--bg", th.bg); rs.setProperty("--panel", th.panel); rs.setProperty("--panel-dark", th.panelDark);
    rs.setProperty("--border", th.border); rs.setProperty("--accent", th.accent);
    rs.setProperty("--text", th.text); rs.setProperty("--sub", th.sub); rs.setProperty("--fs", th.fontSize + "px");
    if (th.font) rs.setProperty("--font", th.font);

    const img = config.images || {};
    document.body.style.backgroundImage = img.bg ? `url(${img.bg})` : "";
    const mineImg = img["mine_" + save.mineId] || img.scene;
    $("scene").style.backgroundImage = mineImg ? `url(${mineImg})` : "";
    $("textbox").style.backgroundImage = img.textbox ? `url(${img.textbox})` : "";
    $("hud").style.backgroundImage = img.hud ? `url(${img.hud})` : "";
    $("nav").style.backgroundImage = img.nav ? `url(${img.nav})` : "";

    document.querySelectorAll("[data-edit]").forEach(el => {
      const L = (config.layout || {})[el.dataset.edit] || {};
      const px = v => (v === undefined || v === "" || v === null ? "" : v + "px");
      el.style.transform = (L.x || L.y) ? `translate(${L.x || 0}px, ${L.y || 0}px)` : "";
      el.style.width = L.w ? L.w + "%" : "";
      el.style.minHeight = px(L.h);
      el.style.fontSize = L.fs ? L.fs + "em" : "";
      el.style.borderRadius = px(L.radius);
      el.style.padding = px(L.pad);
      el.style.backgroundColor = L.bg || "";
      el.style.color = L.color || "";
      el.style.borderColor = L.border || "";
      el.style.opacity = L.opacity !== undefined && L.opacity !== "" ? L.opacity : "";
      el.style.display = L.hidden ? "none" : "";
    });
    $("tbTap").textContent = config.texts.tap;
    document.title = config.gameTitle;
  }

  /* ---------------- HUD ---------------- */
  function renderHud() {
    $("hudName").textContent = save.name || "玩家";
    $("hudCoins").textContent = fmt(save.coins);
    $("hudPlays").textContent = fmt(totalPlays());
  }

  /* ---------------- 挖礦畫面 ---------------- */
  let veinGain = 0;
  function renderMine() {
    checkDay();
    const mine = curMine(), st = save.plays[mine.id] || E.newPlayState(), ms = mineStats(mine.id);
    $("mbName").textContent = mine.name;
    let stateTxt = st.state === "vein" ? "<span class='rainbow-text'>礦脈中</span>" : "";
    if (save.debug.showSetting) stateTxt += ` <span style="color:#ff4fd8">設定${todaySetting(mine.id)}｜${({ normal: "通常", koukaku: "高確", zencho: "前兆", vein: "礦脈" })[st.state]}</span>`;
    $("mbState").innerHTML = stateTxt;
    $("mbSwings").textContent = fmt(ms.swings);
    $("mbHits").textContent = ms.hits;
    $("mbEpic").textContent = ms.epic;
    $("mbSince").textContent = st.state === "vein" ? "—" : st.sinceHit;

    const inVein = st.state === "vein";
    $("veinBanner").classList.toggle("hidden", !inVein);
    $("scene").classList.toggle("vein-on", inVein);
    if (inVein) {
      $("vbChain").textContent = st.chain; $("vbLeft").textContent = st.veinLeft; $("vbGain").textContent = fmt(veinGain);
    }
    const t = activeTool();
    if (t) {
      const d = toolDef(t.id);
      $("tiName").innerHTML = `<span style="color:${rarityColor(d.rarity)}">${d.name}</span>`;
      $("tiBar").style.width = (t.dur / t.max * 100) + "%";
      $("tiBar").style.background = t.dur / t.max > .5 ? "#55ff55" : t.dur / t.max > .2 ? "#ffcc33" : "#ff5555";
      $("tiDur").textContent = t.dur + "/" + t.max;
    } else {
      $("tiName").textContent = "無工具"; $("tiBar").style.width = "0"; $("tiDur").textContent = "";
    }
    $("btnAuto").textContent = save.auto ? "自動" : "手動";
    $("btnAuto").classList.toggle("on", save.auto);
    renderHud();
  }

  function setTextbox(lines, omen) {
    const box = $("textbox");
    box.classList.remove("omen-rainbow");
    const oc = config.rules.omen.colors;
    const layoutBorder = ((config.layout || {}).textbox || {}).border || "";
    if (omen === "vein" || oc[omen] === "rainbow") { box.classList.add("omen-rainbow"); box.style.borderColor = ""; }
    else box.style.borderColor = omen > 0 ? oc[omen] : layoutBorder;
    $("tbLines").innerHTML = lines.map(l => `<div>${l}</div>`).join("");
  }
  const colored = (txt, color) => color === "rainbow" ? `<span class="rainbow-text">${txt}</span>` : `<span style="color:${color}">${txt}</span>`;

  function doSwing() {
    checkDay();
    const mine = curMine(), T = config.texts, rules = config.rules;
    const tool = activeTool();
    if (!tool) {
      const need = config.tools.find(t => t.tier === mine.tier);
      setTextbox([colored(T.noTool, "#ff5555"), colored(`需要「${need ? need.name : ""}」以上的工具`, config.theme.sub), "到工坊購買或看廣告領取"], 0);
      stopAuto(); renderMine();
      return null;
    }
    const st = save.plays[mine.id] || (save.plays[mine.id] = E.newPlayState());
    const setting = todaySetting(mine.id);
    const r = E.swing(rules, setting, st);
    const ms = mineStats(mine.id);
    ms.swings++;
    if (r.stateBefore !== "vein") { ms.normalSwings++; if (r.cat === "epic") ms.epic++; }
    if (r.events.includes("veinStart")) { ms.hits++; veinGain = 0; }

    const lines = [];
    const cat = catDef(r.cat);
    let bigHtml, newFind = false;
    if (r.cat === "rubble") {
      lines.push(colored(pickOne(T.swing) + " " + pickOne(T.rubble), rarityColor(cat.rarity)));
      bigHtml = colored("·", rarityColor(0));
    } else {
      const name = pickOne(mine.items[r.cat]);
      save.ores[name] = (save.ores[name] || 0) + 1;
      if (!save.dex[name]) { save.dex[name] = { count: 0, first: todayKey() }; newFind = true; }
      save.dex[name].count++;
      const price = itemPrice(name);
      if (r.stateBefore === "vein") veinGain += price;
      lines.push(pickOne(T.swing) + " " + colored(name, rarityColor(cat.rarity)) + ` <span style="color:${config.theme.sub}">+$${fmt(price)}</span>` + (newFind ? colored(" NEW", config.theme.accent) : ""));
      bigHtml = colored(name, rarityColor(cat.rarity));
    }

    // 期待度演出文字
    const oc = rules.omen.colors;
    if (r.omen > 0 && T.omenLine[r.omen]) lines.push(colored(T.omenLine[r.omen], oc[r.omen]));
    else if (st.state === "koukaku" && Math.random() < 0.25) lines.push(colored(T.koukakuHint, config.theme.sub));

    // 事件
    if (r.events.includes("tenjou")) lines.push(colored(T.tenjou, config.theme.accent));
    if (r.events.includes("fakeEnd")) lines.push(colored(T.fakeEnd, config.theme.sub));
    if (r.events.includes("veinStart")) lines.push(colored(T.veinStart, "rainbow"));
    if (r.events.includes("veinContinue")) lines.push(colored(T.veinContinue + ` 第${st.chain}連`, "rainbow"));
    if (r.events.includes("veinEnd")) lines.push(colored(`${T.veinEnd}　收穫 $${fmt(veinGain)}`, config.theme.accent));

    // 工具掉落
    if (r.toolDrop) {
      const td = rules.toolDrop;
      let tier = mine.tier;
      if (mine.tier > 1 && Math.random() >= td.sameTier) tier = 1 + Math.floor(Math.random() * (mine.tier - 1));
      const def = config.tools.find(t => t.tier === tier) || config.tools[0];
      addTool(def.id, td.minDur + Math.random() * (td.maxDur - td.minDur));
      lines.push(T.toolDrop + colored(def.name, rarityColor(def.rarity)));
    }

    // 耐久
    tool.dur--;
    let broke = false;
    if (tool.dur <= 0) {
      save.tools = save.tools.filter(t => t.uid !== tool.uid);
      lines.push(colored(T.toolBreak + toolDef(tool.id).name, "#ff5555"));
      broke = true;
    }

    const boxOmen = (r.stateBefore === "vein" || st.state === "vein") ? "vein" : Math.max(0, r.omen);
    setTextbox(lines.slice(0, 4), boxOmen);
    const big = $("sceneBig");
    big.innerHTML = bigHtml; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    $("sceneSub").textContent = "";
    if (cat.rarity >= 3 || r.events.includes("veinStart")) {
      const sc = $("scene"); sc.classList.remove("shake"); void sc.offsetWidth; sc.classList.add("shake");
    }
    renderMine();
    persist();
    return { r, broke, newFind, cat };
  }

  /* ---------------- 自動模式 ---------------- */
  let autoTimer = null;
  function autoStep() {
    if (!save.auto) return;
    const res = doSwing();
    const stopAt = (config.play && config.play.autoStopOmen) || 3;
    if (!res) return;
    const ev = res.r.events;
    if (res.r.omen >= stopAt || ev.includes("veinStart") || ev.includes("veinEnd") || ev.includes("tenjou") ||
        res.cat.rarity >= 5 || (res.broke && !activeTool())) { stopAuto(); return; }
    autoTimer = setTimeout(autoStep, (config.play && config.play.autoInterval) || 350);
  }
  function stopAuto() { save.auto = false; clearTimeout(autoTimer); renderMine(); }
  function toggleAuto() {
    if (save.auto) { stopAuto(); return; }
    save.auto = true; renderMine(); autoStep();
  }

  /* ---------------- 背包 ---------------- */
  function renderBag() {
    const tools = [...save.tools].sort((a, b) => toolDef(b.id).tier - toolDef(a.id).tier || b.dur - a.dur);
    const act = activeTool();
    $("bagPlays").textContent = `合計可挖 ${fmt(totalPlays())} 次`;
    const icon = id => config.images["tool_" + id] ? `<div class="icon" style="background-image:url(${config.images["tool_" + id]})"></div>` : "";
    $("bagTools").innerHTML = tools.length ? tools.map(t => {
      const d = toolDef(t.id), eq = act && act.uid === t.uid;
      return `<div class="row ${eq ? "equipped" : ""}">${icon(t.id)}
        <div class="grow"><span style="color:${rarityColor(d.rarity)}">${d.name}</span> <span class="sub">${t.dur}/${t.max}</span>
        <div class="bar"><div class="bar-fill" style="width:${t.dur / t.max * 100}%"></div></div></div>
        ${eq ? '<span class="sub">使用中</span>' : `<button class="px-btn small" data-equip="${t.uid}">裝備</button>`}</div>`;
    }).join("") : '<div class="sub">沒有工具</div>';

    const idx = itemIndex();
    const names = Object.keys(save.ores).filter(n => save.ores[n] > 0 && idx[n])
      .sort((a, b) => idx[b].cat.rarity - idx[a].cat.rarity || idx[b].mine.mult - idx[a].mine.mult);
    let total = 0;
    $("bagOres").innerHTML = names.length ? names.map(n => {
      const p = itemPrice(n), c = save.ores[n]; total += p * c;
      return `<div class="row"><div class="grow"><span style="color:${rarityColor(idx[n].cat.rarity)}">${n}</span> ×${c}
        <div class="sub">單價 $${fmt(p)}</div></div>
        <button class="px-btn small" data-sell1="${n}">賣1</button><button class="px-btn small" data-sellall="${n}">全賣</button></div>`;
    }).join("") : '<div class="sub">背包是空的</div>';
    $("bagOreTotal").textContent = names.length ? `總價值 $${fmt(total)}（鍛造加成 ×${sellBonus().toFixed(2)}）` : "";
    renderHud();
  }
  function sell(name, n) {
    const c = Math.min(n, save.ores[name] || 0); if (!c) return;
    save.ores[name] -= c; if (save.ores[name] <= 0) delete save.ores[name];
    save.coins += itemPrice(name) * c;
    toast(`賣出 ${name} ×${c}  +$${fmt(itemPrice(name) * c)}`);
    persist(); renderBag();
  }

  /* ---------------- 地圖 ---------------- */
  function renderMap() {
    checkDay();
    $("mapList").innerHTML = config.mines.map(m => {
      const unlocked = save.unlocked.includes(m.id), ms = mineStats(m.id);
      const need = config.tools.find(t => t.tier === m.tier);
      const here = m.id === save.mineId;
      const epicRate = ms.epic ? `1/${Math.round(ms.normalSwings / ms.epic)}` : "—";
      const btn = here ? '<span class="sub">所在地</span>'
        : unlocked ? `<button class="px-btn small" data-go-mine="${m.id}">前往</button>`
        : `<button class="px-btn small" data-unlock="${m.id}" ${save.coins < m.unlock ? "disabled" : ""}>解鎖 $${fmt(m.unlock)}</button>`;
      return `<div class="row ${here ? "equipped" : ""} ${unlocked ? "" : "locked"}">
        <div class="grow"><span style="color:${rarityColor(m.tier)}">${m.name}</span> <span class="sub">×${m.mult}</span>
        <div class="sub">需要 ${need ? need.name : "?"}以上${unlocked ? `｜本日 ${ms.swings}揮 礦脈${ms.hits} 史詩${epicRate}` : ""}${save.debug.showSetting ? `｜<span style="color:#ff4fd8">設定${todaySetting(m.id)}</span>` : ""}</div></div>${btn}</div>`;
    }).join("");
  }

  /* ---------------- 圖鑑 ---------------- */
  function renderDex() {
    let got = 0, all = 0;
    $("dexList").innerHTML = config.mines.map(m => {
      const cells = config.categories.filter(c => c.id !== "rubble").flatMap(c => (m.items[c.id] || []).map(n => {
        all++; const d = save.dex[n]; if (d) got++;
        return d ? `<div class="dex-cell"><div style="color:${rarityColor(c.rarity)}">${n}</div><div class="n">×${d.count}</div></div>`
                 : `<div class="dex-cell"><div style="color:${rarityColor(0)}">？？？</div><div class="n">${config.rarities[c.rarity].name}</div></div>`;
      })).join("");
      return `<div class="dex-mine"><h4>${m.name}</h4><div class="dex-grid">${cells}</div></div>`;
    }).join("");
    $("dexCount").textContent = `${got}/${all}`;
  }

  /* ---------------- 工坊 ---------------- */
  function renderShop() {
    checkDay();
    const left = config.rules.adDailyLimit - save.ads.count;
    $("btnAd").disabled = left <= 0;
    $("adInfo").textContent = `今日剩餘 ${left} 次（目前為廣告示意，未接真實廣告）`;
    $("shopList").innerHTML = config.tools.map(t => `<div class="row">
      <div class="grow"><span style="color:${rarityColor(t.rarity)}">${t.name}</span>
      <div class="sub">耐久 ${toolMax(t.id)}｜每揮成本 $${(t.price / toolMax(t.id)).toFixed(1)}</div></div>
      <button class="px-btn small" data-buy="${t.id}" ${save.coins < t.price ? "disabled" : ""}>$${fmt(t.price)}</button></div>`).join("");
    const U = config.upgrade;
    $("upList").innerHTML = config.tools.map(t => {
      const lv = upLv(t.id), cost = t.price * U.costMul * (lv + 1), max = lv >= U.maxLevel;
      return `<div class="row"><div class="grow"><span style="color:${rarityColor(t.rarity)}">${t.name}</span> Lv${lv}/${U.maxLevel}
        <div class="sub">耐久 +${Math.round(lv * U.durabilityPerLv * 100)}%｜全礦售價 +${Math.round(lv * U.valuePerLv * 100)}%</div></div>
        ${max ? '<span class="sub">MAX</span>' : `<button class="px-btn small" data-up="${t.id}" ${save.coins < cost ? "disabled" : ""}>$${fmt(cost)}</button>`}</div>`;
    }).join("");
    renderHud();
  }

  function watchAd() {
    if (save.ads.count >= config.rules.adDailyLimit) return;
    let sec = 5;
    const box = $("modalBox");
    const tick = () => {
      box.innerHTML = `<div>（廣告示意）</div><div style="font-size:2em;margin:16px 0">${sec}</div><div class="sub">之後會換成真實廣告</div>`;
      if (sec-- <= 0) {
        save.ads.count++;
        addTool("wood", 1);
        $("modal").classList.add("hidden");
        toast("獲得 木鎬 ×1"); persist(); renderShop();
        return;
      }
      setTimeout(tick, 1000);
    };
    $("modal").classList.remove("hidden"); tick();
  }

  /* ---------------- 共用 UI ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 1600);
  }
  function askName(first) {
    const box = $("modalBox");
    box.innerHTML = `<div>${first ? "歡迎來到「" + config.gameTitle + "」" : "修改名稱"}</div>
      <input id="nameInput" maxlength="12" placeholder="輸入你的名字" value="${save.name || ""}">
      <div class="btns"><button class="px-btn" id="nameOk">確定</button></div>`;
    $("modal").classList.remove("hidden");
    $("nameOk").onclick = () => {
      const v = $("nameInput").value.trim();
      if (!v) return;
      save.name = v; $("modal").classList.add("hidden"); persist(true); renderHud();
    };
  }

  let currentScreen = "mine";
  function go(name) {
    if (name !== "mine") stopAuto();
    currentScreen = name;
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === "scr-" + name));
    document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.go === name));
    renderAll();
  }
  function renderAll() {
    applyLook();
    ({ mine: renderMine, bag: renderBag, map: renderMap, dex: renderDex, shop: renderShop })[currentScreen]();
    renderHud();
  }

  /* ---------------- 事件綁定 ---------------- */
  $("nav").addEventListener("click", e => { const b = e.target.closest("button[data-go]"); if (b && !window.Editor?.isPicking()) go(b.dataset.go); });
  $("textbox").addEventListener("click", () => {
    if (window.Editor?.isPicking()) return;
    if (save.auto) { stopAuto(); return; }
    doSwing();
  });
  $("btnAuto").addEventListener("click", () => { if (!window.Editor?.isPicking()) toggleAuto(); });
  $("hudName").addEventListener("click", () => { if (!window.Editor?.isPicking()) askName(false); });
  $("btnSellAll").addEventListener("click", () => {
    const names = Object.keys(save.ores); if (!names.length) return;
    let sum = 0; names.forEach(n => { sum += itemPrice(n) * save.ores[n]; });
    save.coins += sum; save.ores = {}; toast(`全部賣出 +$${fmt(sum)}`); persist(); renderBag();
  });
  $("btnAd").addEventListener("click", watchAd);
  document.addEventListener("click", e => {
    if (window.Editor?.isPicking()) return;
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    if (d.equip) { save.equipped = +d.equip; const tt = save.tools.find(x => x.uid === +d.equip); if (tt && toolDef(tt.id).tier < curMine().tier) toast("這把工具等級不足以挖目前的礦坑"); persist(); renderBag(); }
    if (d.sell1) sell(d.sell1, 1);
    if (d.sellall) sell(d.sellall, Infinity);
    if (d.goMine) { save.mineId = d.goMine; save.equipped = null; persist(); toast("前往 " + mineDef(d.goMine).name); go("mine"); }
    if (d.unlock) { const m = mineDef(d.unlock); if (save.coins >= m.unlock) { save.coins -= m.unlock; save.unlocked.push(m.id); persist(); toast("解鎖 " + m.name); renderMap(); renderHud(); } }
    if (d.buy) { const tl = toolDef(d.buy); if (save.coins >= tl.price) { save.coins -= tl.price; addTool(tl.id, 1); persist(); toast("購買 " + tl.name); renderShop(); } }
    if (d.up) {
      const tl = toolDef(d.up), lv = upLv(tl.id), cost = tl.price * config.upgrade.costMul * (lv + 1);
      if (save.coins >= cost && lv < config.upgrade.maxLevel) {
        save.coins -= cost; save.upgrades[tl.id] = lv + 1;
        save.tools.forEach(x => { if (x.id === tl.id) { const nm = toolMax(tl.id); x.dur += nm - x.max; x.max = nm; } });
        persist(); toast(`${tl.name} 升到 Lv${lv + 1}`); renderShop();
      }
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { stopAuto(); persist(true); } });

  /* ---------------- 對外介面（給編輯模式用） ---------------- */
  window.Game = {
    get config() { return config; },
    get save() { return save; },
    defaults: () => clone(window.DEFAULT_CONFIG),
    setConfig(c, keep) { config = c; if (keep !== false) { if (!store.set(CFG_KEY, c)) toast("儲存失敗：圖片可能太大"); } renderAll(); },
    resetConfig() { store.del(CFG_KEY); config = clone(window.DEFAULT_CONFIG); renderAll(); },
    setSave(s) { save = s; persist(true); renderAll(); },
    resetSave() { store.del(SAVE_KEY); save = newSave(); addTool("wood", 1); addTool("wood", 1); persist(true); renderAll(); askName(true); },
    persist, renderAll, toast, todaySetting, go
  };

  /* ---------------- 啟動 ---------------- */
  applyLook();
  setTextbox([colored(pickOne(["點擊這裡揮鎬", "準備好了嗎？"]), config.theme.sub)], 0);
  renderAll();
  if (!save.name) askName(true);
})();
