/* =========================================================
   遊戲本體 Game：畫面、存檔、玩家操作
   ========================================================= */
(function () {
  const E = window.MineEngine;
  const E2 = window.MineEngine2;
  const CFG_KEY = "mine_config_v4";
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
  function pwHash(str) { // 密碼雜湊（不把密碼本身寫在程式裡）
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0).toString(36);
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
  let stored = store.get(CFG_KEY);
  if (!stored) { // 舊版設定檔：只沿用外觀（版面、顏色、圖片、文字），數值改用新版
    const old = store.get("mine_config_v3");
    if (old) { stored = {}; ["layout", "theme", "images", "texts", "gameTitle"].forEach(k => { if (old[k]) stored[k] = old[k]; }); }
  }
  let config = deepMerge(clone(window.DEFAULT_CONFIG), stored || {});

  /* ---------------- 存檔 ---------------- */
  function newSave() {
    return {
      v: 1, name: "", coins: 300, uid: 1,
      tools: [], equipped: null,
      ores: {}, dex: {},
      boss: newBoss(),
      unlocked: ["m1"], mineId: "m1",
      plays: {}, plays2: {}, today: { date: todayKey(), stats: {} },
      ads: { date: todayKey(), count: 0 }, pw: {},
      auto: false, debug: { showSetting: false, forceSetting: 0 }
    };
  }
  function newBoss() { return { favor: 0, level: 1, boons: [], req: null, total: 0 }; }
  let save = store.get(SAVE_KEY);
  let needStarter = false;
  if (!save || save.v !== 1) { save = newSave(); needStarter = true; }
  save.auto = false;
  if (!save.boss) save.boss = newBoss();
  if (!save.plays2) save.plays2 = {};
  if (!save.pw) save.pw = {};
  delete save.upgrades;
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
  function totalPlays() { return save.tools.reduce((a, t) => a + t.dur, 0); }

  /* ---------------- 恩惠（老闆給的永久加成） ---------------- */
  const RARITY_NAME = ["普通", "藍", "紫", "金"];
  const BOON_COLOR = r => rarityColor([1, 3, 4, 5][r]);
  function boonCount(id, target) {
    return save.boss.boons.filter(b => b.id === id && (target === undefined || b.target === target)).length;
  }
  const boonVal = id => ((config.boss.boons[id] || {}).v || 0);
  const boonSum = (id, target) => boonCount(id, target) * boonVal(id);
  function toolMax(id) { const d = toolDef(id); return Math.round(d.durability * (1 + boonSum("toolDur"))); }
  function sellBonus(name, rarity) {
    return 1 + boonSum("allSell") + boonSum("oreSell", name) + boonSum("raritySell", rarity);
  }
  const toolPrice = t => Math.max(1, Math.round(t.price * Math.max(0.1, 1 - boonSum("shopCut"))));
  // 工具效率：低階工具挖高階礦坑 → 收益打折（公式 A）
  function toolFactor(tool, mine) {
    const d = toolDef(tool.id); if (!d || d.tier >= mine.tier) return 1;
    const need = config.tools.find(t => t.tier === mine.tier); if (!need) return 1;
    const f = (d.price / d.durability) / (need.price / need.durability) * ((config.toolPenalty || {}).underMul ?? 0.9);
    return Math.min(1, f);
  }
  const money = n => { const v = Math.round(n * 10) / 10; return v % 1 ? v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : v.toLocaleString("en-US"); };

  // 物品名稱 → 屬於哪座礦坑、哪個小役
  function itemIndex() {
    const idx = {};
    config.mines.forEach(m => config.categories.forEach(c => {
      (m.items[c.id] || []).forEach(name => { idx[name] = { mine: m, cat: c, vein: false }; });
      ((m.veinItems || {})[c.id] || []).forEach(name => { idx[name] = { mine: m, cat: c, vein: true }; });
    }));
    return idx;
  }
  function basePrice(name) {
    const m2 = (config.machine2 || {}).prices || {};
    if (m2[name] !== undefined) {
      const mine = config.mines.find(m => m.engine === 2) || {};
      return Math.round(m2[name] * (mine.mult || 1) * 10) / 10;
    }
    const it = itemIndex()[name]; if (!it) return 0;
    const base = it.vein ? (it.cat.veinValue ?? it.cat.value) : it.cat.value;
    return Math.round(base * it.mine.mult * 10) / 10;
  }
  function itemPrice(name) { // 含恩惠加成
    const it = itemIndex()[name]; if (!it) return 0;
    return Math.round(basePrice(name) * sellBonus(name, it.cat.rarity) * 10) / 10;
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
    const ok = t => t.dur > 0 && toolDef(t.id);
    let t = save.tools.find(x => x.uid === save.equipped);
    if (t && ok(t)) return t;
    // 自動裝備：優先「剛好夠格」的最低階，其次用手上最高階的低階工具；同階先用耐久少的
    const tierOf = x => toolDef(x.id).tier;
    const list = save.tools.filter(ok).sort((a, b) => {
      const fa = tierOf(a) >= mine.tier, fb = tierOf(b) >= mine.tier;
      if (fa !== fb) return fa ? -1 : 1;
      return (fa ? tierOf(a) - tierOf(b) : tierOf(b) - tierOf(a)) || a.dur - b.dur;
    });
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
    $("verTag").textContent = "v" + (window.GAME_VERSION || "?");
    document.title = config.gameTitle;
  }

  /* ---------------- HUD ---------------- */
  function renderHud() {
    $("hudName").textContent = save.name || "玩家";
    $("hudCoins").textContent = fmt(save.coins);
    $("hudPlays").textContent = fmt(totalPlays());
  }

  /* ---------------- 第二台機台（三位前輩的考驗） ---------------- */
  const M2 = () => config.machine2;
  const isM2 = () => curMine().engine === 2;
  const FREE2 = ["date", "stIntro", "pick", "dig"];
  function state2() {
    const id = curMine().id;
    if (!save.plays2[id] || !save.plays2[id].counts) save.plays2[id] = E2.newState2();
    return save.plays2[id];
  }
  const bossName2 = id => (M2().bosses.find(b => b.id === id) || {}).name || id;

  /* ---------------- 挖礦畫面 ---------------- */
  let veinGain = 0;
  const TYPE_COLOR = { RB: "#4f9dff", BB: "#ffaa00", SBB: "rainbow" };
  const veinName = t => (config.texts.veinName || {})[t] || t;
  function renderMine() {
    checkDay();
    if (isM2()) return renderMine2();
    const mine = curMine(), st = save.plays[mine.id] || E.newPlayState(), ms = mineStats(mine.id);
    $("mbName").textContent = mine.name;
    let stateTxt = st.state === "bonus" ? colored(veinName(st.bonusType), TYPE_COLOR[st.bonusType]) : "";
    if (save.debug.showSetting) {
      const nm = { normal: "通常", koukaku: "高確", chance: "連續演出", revive: "復活", zencho: "前兆", bonus: "AT" }[st.state];
      stateTxt += ` <span style="color:#ff4fd8">設定${todaySetting(mine.id)}｜${nm}${st.pending ? "(當選" + st.pending + ")" : ""}${st.zenchoType ? "(" + st.zenchoType + ")" : ""}${st.state === "chance" ? `｜${st.chanceIdx}/${st.chanceRounds}回合 ${st.chanceWin ? "會過" + (st.chanceFake ? "(先演失敗)" : "") : "不會過"}` : ""}${st.stock && st.stock.length ? "｜庫存" + st.stock.map(x => x.type).join(",") : ""}</span>`;
    }
    $("mbState").innerHTML = stateTxt;
    $("mbSwings").textContent = fmt(ms.swings);
    $("mbHits").textContent = ms.hits;
    $("mbEpic").textContent = ms.epic;
    $("mbSince").textContent = st.state === "bonus" ? "—" : st.sinceHit;

    const inBonus = st.state === "bonus";
    $("veinBanner").classList.toggle("hidden", !inBonus);
    $("scene").classList.toggle("vein-on", inBonus && st.bonusType === "SBB");
    if (inBonus) {
      const shownStock = st.stock.filter(x => x.announced).length;
      $("vbChain").innerHTML = colored(veinName(st.bonusType), TYPE_COLOR[st.bonusType]) + ` 第${st.chain}脈` + (shownStock ? ` <span style="color:#ff5555">+${shownStock}</span>` : "");
      $("vbLeft").textContent = st.bonusLeft;
      if (st.atHigh > 0) $("vbChain").innerHTML += (st.chain >= config.rules.bonus.cont.boostAfter
        ? ` <span class="rainbow-text">≋深層共鳴${st.atHigh}</span>`
        : ` <span style="color:${config.rules.omen.colors[6] || "#ffcc33"}">≋共鳴${st.atHigh}</span>`);
      $("vbGain").textContent = money(veinGain);
    }
    const t = activeTool();
    if (t) {
      const d = toolDef(t.id);
      const f = toolFactor(t, mine);
      $("tiName").innerHTML = `<span style="color:${rarityColor(d.rarity)}">${d.name}</span>` + (f < 1 ? ` <span style="color:#ff7755">收益${Math.round(f * 100)}%</span>` : "");
      $("tiBar").style.width = (t.dur / t.max * 100) + "%";
      $("tiBar").style.background = t.dur / t.max > .5 ? "#55ff55" : t.dur / t.max > .2 ? "#ffcc33" : "#ff5555";
      $("tiDur").textContent = t.dur + "/" + t.max;
    } else {
      $("tiName").textContent = "無工具"; $("tiBar").style.width = "0"; $("tiDur").textContent = "";
    }
    $("rollLog").classList.toggle("hidden", !save.debug.showRolls);
    $("btnAuto").textContent = save.auto ? "自動" : "手動";
    $("btnAuto").classList.toggle("on", save.auto);
    renderHud();
  }

  function renderMine2() {
    const mine = curMine(), st = state2(), ms = mineStats(mine.id);
    $("mbName").textContent = mine.name;
    const PH = { normal: "", date: "談話中", at: "報酬", stIntro: "挑戰準備", st: "ST", reward: "一轉定勝負", pick: "選擇", dig: "挖掘中", bonus: "BONUS" };
    let txt = st.upper ? colored("上位", "#ffcc33") + " " : "";
    txt += PH[st.state] ? colored(PH[st.state], config.theme.accent) : "";
    if (save.debug.showSetting) {
      txt += ` <span style="color:#ff4fd8">設定${todaySetting(mine.id)}｜${st.state}｜累${st.counts.a}/${st.counts.b}/${st.counts.c}｜好感${Math.round(st.favor.a * 100)}/${Math.round(st.favor.b * 100)}/${Math.round(st.favor.c * 100)}%${st.stBoss ? "｜對手" + bossName2(st.stBoss) : ""}${st.bonusTotal ? "｜報酬" + st.bonusTotal + "轉" : ""}</span>`;
    }
    $("mbState").innerHTML = txt;
    $("mbSwings").textContent = fmt(ms.swings);
    $("mbHits").textContent = ms.hits || 0;
    $("mbEpic").textContent = ms.dates || 0;
    $("mbSince").textContent = st.sinceAt;
    const inRun = ["at", "st", "reward", "pick", "dig", "bonus", "stIntro"].includes(st.state);
    $("veinBanner").classList.toggle("hidden", !inRun);
    $("scene").classList.toggle("vein-on", !!st.upper);
    if (inRun) {
      $("vbChain").innerHTML = (st.upper ? colored("上位", "#ffcc33") + " " : "") + (st.state === "bonus" ? "BONUS" : st.state === "st" ? `ST 第${st.stRound}關` : st.state === "at" ? "報酬" : "挑戰");
      $("vbLeft").textContent = st.state === "bonus" ? st.bonusLeft : st.state === "st" ? st.stLeft : st.state === "at" ? st.atLeft : "—";
      $("vbGain").textContent = money(st.gain * (mine.mult || 1));
    }
    const t = activeTool();
    if (t) {
      const d = toolDef(t.id), f = toolFactor(t, mine);
      $("tiName").innerHTML = `<span style="color:${rarityColor(d.rarity)}">${d.name}</span>` + (f < 1 ? ` <span style="color:#ff7755">收益${Math.round(f * 100)}%</span>` : "");
      $("tiBar").style.width = (t.dur / t.max * 100) + "%";
      $("tiBar").style.background = t.dur / t.max > .5 ? "#55ff55" : t.dur / t.max > .2 ? "#ffcc33" : "#ff5555";
      $("tiDur").textContent = t.dur + "/" + t.max;
    } else { $("tiName").textContent = "無工具"; $("tiBar").style.width = "0"; $("tiDur").textContent = ""; }
    $("rollLog").classList.toggle("hidden", !save.debug.showRolls);
    $("btnAuto").textContent = save.auto ? "自動" : "手動";
    $("btnAuto").classList.toggle("on", save.auto);
    renderHud();
  }

  function setTextbox(lines, omen, opts) {
    opts = opts || {};
    const box = $("textbox");
    box.classList.remove("omen-rainbow", "hint-blink");
    const oc = config.rules.omen.colors;
    const layoutBorder = ((config.layout || {}).textbox || {}).border || "";
    if (omen === "vein" || oc[omen] === "rainbow") { box.classList.add("omen-rainbow"); box.style.borderColor = ""; }
    else box.style.borderColor = omen > 0 ? oc[omen] : layoutBorder;
    if (opts.blink) box.classList.add("hint-blink");
    const tag = $("tbTag"); tag.textContent = opts.tag || ""; tag.classList.toggle("hidden", !opts.tag);
    if (opts.tag) { tag.style.color = omen > 0 && oc[omen] !== "rainbow" ? oc[omen] : ""; tag.classList.toggle("rainbow-text", oc[omen] === "rainbow"); }
    $("tbTap").textContent = opts.tap || config.texts.tap;
    $("tbLines").innerHTML = lines.map(l => `<div>${l}</div>`).join("");
  }
  function colored(txt, color) { return color === "rainbow" ? `<span class="rainbow-text">${txt}</span>` : `<span style="color:${color}">${txt}</span>`; }

  /* ---------------- 第二台機台：一次點擊 ---------------- */
  function doSwing2(input) {
    checkDay();
    const mine = curMine(), R = M2(), st = state2(), T = R.lines, sub = config.theme.sub;
    const free = FREE2.includes(st.state);
    const tool = activeTool();
    if (!free && !tool) {
      const need = config.tools.find(t => t.tier === mine.tier);
      setTextbox([colored(config.texts.noTool, "#ff5555"), colored(`建議使用「${need ? need.name : ""}」以上`, sub), `到${config.boss.name}那裡買，或看廣告領取`], 0);
      setChoices(null); stopAuto(); renderMine();
      return null;
    }
    const res = E2.step2(R, todaySetting(mine.id), st, Math.random, input || {});
    const ms = mineStats(mine.id);
    const lines = [];
    let bigHtml = null, newFind = false;

    if (!res.free) {
      ms.swings++;
      const phase = res.stateBefore === "normal" ? "normal" : "vein";
      const g = ((R.map || {})[phase] || {})[res.cat];
      const name = Array.isArray(g) ? pickOne(g) : g;
      const factor = toolFactor(tool, mine);
      const sfx = pickOne(config.texts.swing);
      if (!name) {
        lines.push(colored(sfx + " " + pickOne(config.texts.rubble), rarityColor(0)));
        bigHtml = colored("·", rarityColor(0));
      } else if (factor < 1 && Math.random() >= factor) {
        lines.push(sfx + " " + colored(name, oreColor(name)) + colored(" 碎掉了…", "#ff7755"));
        bigHtml = `<s>${colored(name, oreColor(name))}</s>`;
      } else {
        save.ores[name] = (save.ores[name] || 0) + 1;
        if (!save.dex[name]) { save.dex[name] = { count: 0, first: todayKey() }; newFind = true; }
        save.dex[name].count++;
        const price = itemPrice(name);
        lines.push(sfx + " " + colored(name, oreColor(name)) + ` <span style="color:${sub}">$${money(price)}</span>` + (newFind ? colored(" NEW", config.theme.accent) : ""));
        bigHtml = colored(name, oreColor(name));
      }
      tool.dur--;
      if (tool.dur <= 0) { save.tools = save.tools.filter(t => t.uid !== tool.uid); lines.push(colored(config.texts.toolBreak + toolDef(tool.id).name, "#ff5555")); }
    }

    let tag = "", omen = 0, choices = null;
    const ev = t => res.events.find(e => e.t === t);
    for (const e of res.events) {
      if (e.t === "tenjou") lines.push(colored("……有人在坑口喊你", config.theme.accent));
      if (e.t === "dateStart") { lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "call", T.call)), config.theme.accent)); ms.dates = (ms.dates || 0) + 1; }
      if (e.t === "dateStep") {
        const pool = bl(e.boss, e.kind, bl(e.boss, "chat", ["……"]));
        const oc = config.rules.omen.colors;
        lines.push(colored(pickOne(pool), oc[e.color] || "#e8e8e8"));
        omen = Math.max(omen, e.color);
      }
      if (e.t === "dateWin") { lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "win", [T.dateWin])), "#ffcc33")); lines.push(colored(T.atStart, "rainbow")); ms.hits = (ms.hits || 0) + 1; }
      if (e.t === "dateLose") lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "lose", [T.dateLose])), sub));
      if (e.t === "atEnd") lines.push(colored(T.stIntro, config.theme.accent));
      if (e.t === "upperStart") lines.push(colored(T.upperStart, "rainbow"));
      if (e.t === "askBoss") {
        lines.push(colored(T.askBoss, config.theme.accent));
        choices = M2().bosses.map(b => ({ v: b.id, label: `▶ 「${b.name}前輩，這次我要得到你的信任」` }));
      }
      if (e.t === "stStart") {
        lines.push(colored(`第${e.round}關　${T.stAppear} ` + colored(bossName2(e.boss), "#ffcc33"), "#e8e8e8"));
        const ap = bl(e.boss, "appear", null); if (ap) lines.push(colored(pickOne(ap), sub));
      }
      if (e.t === "stPass") lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "pass", [T.stPass])) + (e.right ? "" : "（勉強認可）"), "#ffcc33"));
      if (e.t === "stLose") lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "fail", [T.stLose])) + `　共${e.round}關　收穫 $${money(e.gain * (mine.mult || 1))}`, sub));
      if (e.t === "rewardRoll") lines.push(colored(T.reward, config.theme.accent));
      if (e.t === "askPick") {
        lines.push(colored(T.pick, config.theme.accent));
        choices = [{ v: "drill", label: T.drill }, { v: "shovel", label: T.shovel }];
      }
      if (e.t === "digStart") lines.push(colored(T.digTap, config.theme.accent));
      if (e.t === "dig") { bigHtml = `<span class="dig-plus">+${e.inc}</span>`; lines.push(colored(`目前 ${e.shown} 轉…（還要 ${e.taps - e.tap} 下）`, sub)); }
      if (e.t === "announce") { lines.push(colored(`${T.announce} ${e.total} 轉！`, "rainbow")); bigHtml = colored(e.total + "轉", config.theme.accent); }
      if (e.t === "bonusEnd") lines.push(colored(T.bonusEnd + `　收穫 $${money(st.gain * (mine.mult || 1))}`, config.theme.accent));
    }
    const stt = st.state;
    if (stt === "date") tag = (state2().dateOdd ? "≋ 談話中（怪異）≋" : "≋ 談話中 ≋");
    else if (stt === "at" || stt === "bonus") tag = st.upper ? "≋ 上位・報酬中 ≋" : "≋ 報酬中 ≋";
    else if (stt === "st") tag = st.upper ? `≋ 上位ST 第${st.stRound}關 ≋` : `≋ ST 第${st.stRound}關 ≋`;
    if (st.upper) omen = 6;
    else if (stt === "st") omen = 2;

    setTextbox(lines.slice(0, 5), omen, { tag, tap: stt === "dig" ? T.digTap : null });
    setChoices(choices);
    if (bigHtml) {
      const big = $("sceneBig");
      big.innerHTML = bigHtml; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    }
    $("sceneSub").textContent = "";
    logRolls(res, ms.swings);
    renderMine();
    persist();
    return { res, st };
  }
  const bl = (boss, key, fallback) => {
    const v = ((M2().bossLines || {})[boss] || {})[key];
    return (v && v.length) ? v : fallback;
  };
  function setChoices(list) {
    const box = $("tbChoice");
    if (!list || !list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    box.classList.remove("hidden");
    box.innerHTML = list.map(c => `<button class="px-btn wide" data-m2="${c.v}">${c.label}</button>`).join("");
  }
  function oreColor(name) {
    const it = itemIndex()[name];
    return rarityColor(it ? it.cat.rarity : 1);
  }

  function doSwing() {
    if (isM2()) return doSwing2();
    checkDay();
    const mine = curMine(), T = config.texts, rules = config.rules, sub = config.theme.sub;
    const tool = activeTool();
    if (!tool) {
      const need = config.tools.find(t => t.tier === mine.tier);
      setTextbox([colored(T.noTool, "#ff5555"), colored(`建議使用「${need ? need.name : ""}」以上`, sub), `到${config.boss.name}那裡買，或看廣告領取`], 0);
      stopAuto(); renderMine();
      return null;
    }
    const st = save.plays[mine.id] || (save.plays[mine.id] = E.newPlayState());
    if (!st.stock) { Object.assign(st, E.newPlayState(), { sinceHit: st.sinceHit || 0 }); } // 舊存檔轉換
    const r = E.swing(rules, todaySetting(mine.id), st, Math.random, mine.tenjou);
    const ms = mineStats(mine.id);
    ms.swings++;
    if (r.stateBefore !== "bonus") { ms.normalSwings++; if (r.cat === "epic") ms.epic++; if (r.cat === "legend") ms.legend = (ms.legend || 0) + 1; }
    const ev = t => r.events.find(e => e.t === t);
    if (ev("bonusStart")) { ms.hits++; veinGain = 0; }

    const lines = [];
    const cat = catDef(r.cat);
    const factor = toolFactor(tool, mine);
    let bigHtml, newFind = false;
    // 違和感：音效字
    let sfx = pickOne(T.swing);
    if (r.hint === "sfx") sfx = T.hintSfx;
    if (r.hint === "silent") sfx = "……";

    if (r.cat === "rubble") {
      lines.push(colored(sfx + " " + (r.hint === "silent" ? "" : pickOne(T.rubble)), rarityColor(cat.rarity)));
      bigHtml = colored("·", rarityColor(0));
    } else if (factor < 1 && Math.random() >= factor) {
      // 工具太弱：礦石被震碎（期望收益 = 工具效率）
      const inVein = r.stateBefore === "bonus";
      const name = pickOne((inVein && mine.veinItems && mine.veinItems[r.cat]) || mine.items[r.cat]);
      lines.push(sfx + " " + colored(name, rarityColor(cat.rarity)) + colored(" 碎掉了…", "#ff7755"));
      bigHtml = `<s>${colored(name, rarityColor(cat.rarity))}</s>`;
    } else {
      const inVein = r.stateBefore === "bonus";
      const name = pickOne((inVein && mine.veinItems && mine.veinItems[r.cat]) || mine.items[r.cat]);
      save.ores[name] = (save.ores[name] || 0) + 1;
      if (!save.dex[name]) { save.dex[name] = { count: 0, first: todayKey() }; newFind = true; }
      save.dex[name].count++;
      const price = itemPrice(name);
      if (r.stateBefore === "bonus") veinGain += price;
      lines.push(sfx + " " + colored(name, rarityColor(cat.rarity)) + ` <span style="color:${sub}">$${money(price)}</span>` + (newFind ? colored(" NEW", config.theme.accent) : ""));
      bigHtml = colored(name, rarityColor(cat.rarity));
    }

    const oc = rules.omen.colors;
    const cr = r.chanceRound;
    if (cr) {
      // 連續演出：照回合數的劇本走，顏色只升不降
      const script = (T.chanceScript || {})["r" + cr.total] || [];
      const line = script[cr.idx - 1] || script[script.length - 1] || "";
      if (line) lines.push(colored(line, oc[cr.color]));
      if (cr.upLine && (T.chanceUpLines || []).length) lines.push(colored(pickOne(T.chanceUpLines), oc[cr.color]));
    }
    const isRevive = r.events.some(e => e.t === "revive");
    if (!cr && !isRevive && r.omen > 0 && T.omenLine[r.omen]) lines.push(colored(T.omenLine[r.omen], oc[r.omen]));
    else if (st.state === "koukaku" && Math.random() < 0.25) lines.push(colored(T.koukakuHint, sub));
    if (r.atHigh && !r.events.some(e => e.t === "atHighStart") && Math.random() < 0.3) lines.push(colored(T.atHighHint, oc[6] || "#ffcc33"));
    if (r.hint === "drip") lines.push(colored(T.hintDrip, sub));
    if (r.hint === "glow") lines.push(colored(T.hintGlow, "#ffe08a"));

    // 事件文字（不直接說出前兆／AT 等術語）
    const enter = ["chanceStart", "fakeStart", "tenjou"];
    for (const e of r.events) {
      if (enter.includes(e.t)) lines.unshift(colored(T.omenEnter, config.theme.accent));
      if (e.t === "chanceLose" && cr) lines.push(colored(T.chanceCollapse, "#ff7755"));
      else if ((e.t === "chanceLose" && !e.short) || e.t === "fakeEnd") lines.push(colored(T.chanceLose, sub));
      if (e.t === "revive") lines.push(colored(T.revive, r.omen === 5 ? "rainbow" : (oc[6] || "#ffcc33")));
      if (e.t === "directWin") lines.push(colored(T.directWin, "#ffaa00"));
      if (e.t === "bonusStart") { if (e.from === "chance") lines.push(colored(T.chanceWin, config.theme.accent)); lines.push(colored(T.bonusStart[e.type], TYPE_COLOR[e.type])); }
      if (e.t === "atHighStart") lines.push(colored(e.deep ? (T.atHighEnterDeep || T.atHighEnter) : T.atHighEnter, e.deep ? "rainbow" : (oc[6] || "#ffcc33")));
      if (e.t === "atHighEnd") lines.push(colored(T.atHighEnd, sub));
      if (e.t === "stock" && e.shown) lines.push(colored(T.stock, "rainbow"));
      if (e.t === "upgrade" && e.shown) lines.push(colored(`${T.upgrade} ${veinName(e.from)}→${veinName(e.to)}`, "rainbow"));
      if (e.t === "bonusChain") lines.push(colored((e.surprise ? T.bonusChainSurprise : T.bonusChain) + " " + T.bonusStart[e.type], TYPE_COLOR[e.type]));
      if (e.t === "upperStart") lines.push(colored(T.upperStart, "rainbow"));
      if (e.t === "veinCap") lines.push(colored(T.veinCap, "#ff7755"));
      if (e.t === "bonusEnd") lines.push(colored(`${T.bonusEnd}　共${e.chain}脈　收穫 $${money(veinGain)}`, config.theme.accent));
    }

    // 工具掉落：恩惠加成另外補抽；工具太弱時也會打折
    let drop = r.toolDrop;
    if (!drop && boonSum("toolDrop") > 0) {
      const td0 = rules.toolDrop;
      drop = Math.random() < (r.stateBefore === "bonus" ? td0.bonus : td0.normal) * boonSum("toolDrop");
    }
    if (drop && factor < 1 && Math.random() >= factor) drop = false;
    if (drop) {
      const td = rules.toolDrop;
      let tier = mine.tier;
      if (mine.tier > 1 && Math.random() >= td.sameTier) tier = 1 + Math.floor(Math.random() * (mine.tier - 1));
      const def = config.tools.find(t => t.tier === tier) || config.tools[0];
      addTool(def.id, td.minDur + Math.random() * (td.maxDur - td.minDur));
      lines.push(T.toolDrop + colored(def.name, rarityColor(def.rarity)));
    }

    tool.dur--;
    let broke = false;
    if (tool.dur <= 0) {
      save.tools = save.tools.filter(t => t.uid !== tool.uid);
      lines.push(colored(T.toolBreak + toolDef(tool.id).name, "#ff5555"));
      broke = true;
    }

    const boxOmen = (r.stateBefore === "bonus" && st.state === "bonus")
      ? (st.bonusType === "SBB" ? "vein" : (r.atHigh ? 6 : 0))
      : Math.max(0, r.omen);
    setTextbox(lines.slice(0, 5), boxOmen, { tap: r.hint === "tap" ? T.hintTap : null, blink: r.hint === "blink" || isRevive, tag: (r.atHigh && !ev("atHighEnd")) ? (r.atHighDeep ? (T.atHighTagDeep || T.atHighTag) : T.atHighTag) : (r.inOmen && !ev("bonusStart") && !ev("chanceLose") && !ev("fakeEnd") ? T.omenTag : "") });
    const big = $("sceneBig");
    big.innerHTML = bigHtml; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    $("sceneSub").textContent = "";
    if (cat.rarity >= 4 || ev("bonusStart") || ev("bonusChain")) {
      const sc = $("scene"); sc.classList.remove("shake"); void sc.offsetWidth; sc.classList.add("shake");
    }
    logRolls(r, ms.swings);
    renderMine();
    persist();
    return { r, broke, newFind, cat, st };
  }

  /* ---------------- 測試：抽選紀錄 ---------------- */
  const pctText = (p, D) => (p * 100).toFixed(Math.max(0, Math.round(Math.log10(D)) - 2)) + "%";
  function logRolls(r, swingNo) {
    const box = $("rollLog");
    box.classList.toggle("hidden", !save.debug.showRolls);
    if (!save.debug.showRolls) return;
    const list = r.rolls.filter(x => save.debug.showAllRolls || x.major);
    if (!list.length) return;
    const html = list.map(x => x.info ? `<div class="pk">・${x.label}</div>` : x.pick
      ? `<div class="pk">・${x.label}｜1~${x.total} 抽出 ${x.n} → ${x.result}（${x.ranges.join("／")}）</div>`
      : `<div class="${x.hit ? "hit" : "miss"}">・${x.label} ${pctText(x.p, x.D)}｜1~${x.D.toLocaleString("en-US")} 抽出 ${x.n.toLocaleString("en-US")}（≤${x.need.toLocaleString("en-US")} 當選）→ ${x.hit ? "當選" : "沒中"}</div>`).join("");
    const div = document.createElement("div");
    const cn = (catDef(r.cat) || {}).name || (E2 && E2.NAME2[r.cat]) || r.cat || "—";
    div.innerHTML = `<div class="sw">#${swingNo} ${r.cat ? "挖到 " + cn : "演出"}</div>${html}`;
    box.prepend(div);
    while (box.children.length > 60) box.lastChild.remove();
  }

  /* ---------------- 自動模式 ---------------- */
  let autoTimer = null;
  const AUTO_STOP = ["chanceStart", "fakeStart", "tenjou", "directWin", "bonusStart", "bonusChain", "bonusEnd", "stock", "upgrade", "chanceUp", "revive"];
  function autoStep() {
    if (!save.auto) return;
    if (isM2()) return autoStep2();
    const res = doSwing();
    if (!res) return;
    const stopAt = (config.play && config.play.autoStopOmen) || 3;
    const r = res.r;
    const stop = r.events.some(e => AUTO_STOP.includes(e.t) && !((e.t === "stock" || e.t === "upgrade") && !e.shown)) ||
      (r.omen >= stopAt && r.stateBefore !== "bonus") || res.st.state === "zencho" || res.st.state === "chance" || res.st.state === "revive" ||
      (res.broke && !activeTool());
    if (stop) { stopAuto(); return; }
    autoTimer = setTimeout(autoStep, ((config.play && config.play.autoInterval) || 350) / (1 + boonSum("autoSpeed")));
  }
  // 第二台機台：自動時直接跳過所有對話演出
  const AUTO_STOP2 = ["dateWin", "upperStart", "announce", "stLose", "bonusEnd"];
  function autoStep2() {
    if (!save.auto) return;
    const st = state2();
    const input = st.state === "pick" ? { choice: "drill" }
      : (st.state === "stIntro" && st.upper && !st.pickedBoss) ? { choice: pickOne(M2().bosses).id }
      : {};
    const out = doSwing2(input);
    if (!out) return;
    const free = FREE2.includes(out.res.stateBefore);
    const stop = out.res.events.some(e => AUTO_STOP2.includes(e.t)) || (out.res.stateBefore !== "normal" && !activeTool());
    if (stop && !save.auto) return;
    autoTimer = setTimeout(autoStep2, free ? 120 : ((config.play && config.play.autoInterval) || 350) / (1 + boonSum("autoSpeed")));
  }
  function stopAuto() { save.auto = false; clearTimeout(autoTimer); renderMine(); }
  function toggleAuto() {
    if (save.auto) { stopAuto(); return; }
    save.auto = true; renderMine(); autoStep();
  }

  /* ---------------- 背包（只看，不賣） ---------------- */
  function renderBag() {
    const tools = [...save.tools].sort((a, b) => toolDef(b.id).tier - toolDef(a.id).tier || b.dur - a.dur);
    const act = activeTool(), mine = curMine();
    $("bagPlays").textContent = `合計可挖 ${fmt(totalPlays())} 次`;
    const icon = id => config.images["tool_" + id] ? `<div class="icon" style="background-image:url(${config.images["tool_" + id]})"></div>` : "";
    $("bagTools").innerHTML = tools.length ? tools.map(t => {
      const d = toolDef(t.id), eq = act && act.uid === t.uid, f = toolFactor(t, mine);
      return `<div class="row ${eq ? "equipped" : ""}">${icon(t.id)}
        <div class="grow"><span style="color:${rarityColor(d.rarity)}">${d.name}</span> <span class="sub">${t.dur}/${t.max}</span>${f < 1 ? ` <span style="color:#ff7755;font-size:.8em">此礦坑收益${Math.round(f * 100)}%</span>` : ""}
        <div class="bar"><div class="bar-fill" style="width:${t.dur / t.max * 100}%"></div></div></div>
        ${eq ? '<span class="sub">使用中</span>' : `<button class="px-btn small" data-equip="${t.uid}">裝備</button>`}</div>`;
    }).join("") : '<div class="sub">沒有工具</div>';

    const idx = itemIndex();
    const names = oreNames();
    let total = 0;
    $("bagOres").innerHTML = names.length ? names.map(n => {
      const p = itemPrice(n), c = save.ores[n]; total += p * c;
      return `<div class="row"><div class="grow"><span style="color:${rarityColor(idx[n].cat.rarity)}">${n}</span> ×${c}
        <div class="sub">單價 $${money(p)}</div></div></div>`;
    }).join("") : '<div class="sub">背包是空的</div>';
    $("bagOreTotal").textContent = names.length ? `總價值 $${money(total)}｜要賣礦石請找${config.boss.name}` : "";
    renderHud();
  }
  function oreNames() {
    const idx = itemIndex();
    return Object.keys(save.ores).filter(n => save.ores[n] > 0 && idx[n])
      .sort((a, b) => idx[b].cat.rarity - idx[a].cat.rarity || idx[b].mine.mult - idx[a].mine.mult);
  }
  function sell(name, n) {
    const c = Math.min(n, save.ores[name] || 0); if (!c) return;
    save.ores[name] -= c; if (save.ores[name] <= 0) delete save.ores[name];
    save.coins += itemPrice(name) * c;
    toast(`賣出 ${name} ×${c}  +$${money(itemPrice(name) * c)}`);
    persist(); renderShop();
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
        : unlocked ? `<button class="px-btn small" data-go-mine="${m.id}">${locked(m.id) ? "🔒 " : ""}前往</button>`
        : `<button class="px-btn small" data-unlock="${m.id}" ${save.coins < m.unlock ? "disabled" : ""}>解鎖 $${fmt(m.unlock)}</button>`;
      return `<div class="row ${here ? "equipped" : ""} ${unlocked ? "" : "locked"}">
        <div class="grow"><span style="color:${rarityColor(m.tier)}">${m.name}</span> <span class="sub">×${m.mult}</span>
        <div class="sub">${m.engine === 2 ? "玩法不同｜" : ""}天井 ${m.tenjou}｜建議 ${need ? need.name : "?"}${unlocked ? `｜本日 ${ms.swings}揮 礦脈${ms.hits} 紫${epicRate}` : ""}${save.debug.showSetting ? `｜<span style="color:#ff4fd8">設定${todaySetting(m.id)}</span>` : ""}</div></div>${btn}</div>`;
    }).join("");
  }

  /* ---------------- 圖鑑 ---------------- */
  function renderDex() {
    let got = 0, all = 0;
    $("dexList").innerHTML = config.mines.map(m => {
      const cells = config.categories.filter(c => c.id !== "rubble").flatMap(c => (m.items[c.id] || []).concat((m.veinItems || {})[c.id] || []).map(n => {
        all++; const d = save.dex[n]; if (d) got++;
        return d ? `<div class="dex-cell"><div style="color:${rarityColor(c.rarity)}">${n}</div><div class="n">×${d.count}</div></div>`
                 : `<div class="dex-cell"><div style="color:${rarityColor(0)}">？？？</div><div class="n">${config.rarities[c.rarity].name}</div></div>`;
      })).join("");
      return `<div class="dex-mine"><h4>${m.name}</h4><div class="dex-grid">${cells}</div></div>`;
    }).join("");
    $("dexCount").textContent = `${got}/${all}`;
  }

  /* ---------------- 礦坑老闆 佐佐木 ---------------- */
  let bossView = "menu", bossLine = null;
  const B = () => config.boss;
  const levelNeed = lv => B().levelNeed.base + B().levelNeed.step * Math.floor(lv / B().levelNeed.every);
  const reqSlot = () => Math.floor(Date.now() / (B().reqHours * 3600000));
  function weighted(obj) { // {key: weight} 或 [weights] → key / index
    const keys = Object.keys(obj), tot = keys.reduce((a, k) => a + obj[k], 0);
    let r = Math.random() * tot;
    for (const k of keys) { r -= obj[k]; if (r < 0) return Array.isArray(obj) ? +k : k; }
    return Array.isArray(obj) ? keys.length - 1 : keys[keys.length - 1];
  }
  function makeRequest() {
    const n = weighted(B().lineWeights) + 1, lines = [], used = new Set();
    for (let i = 0; i < n * 4 && lines.length < n; i++) {
      const m = pickOne(config.mines), cat = weighted(B().catWeights);
      const pool = (cat !== "common" && Math.random() < B().veinChance && m.veinItems && m.veinItems[cat]) || m.items[cat];
      if (!pool || !pool.length) continue;
      const name = pickOne(pool); if (used.has(name)) continue;
      used.add(name);
      const [lo, hi] = B().qty[cat];
      const base = lo + Math.floor(Math.random() * (hi - lo + 1));
      lines.push({ name, cat, qty: base, done: false });
    }
    return { slot: reqSlot(), lines };
  }
  function checkRequest() {
    const bs = save.boss;
    if (!bs.req || bs.req.slot !== reqSlot()) { bs.req = makeRequest(); persist(); }
    return bs.req;
  }
  const lineQty = l => Math.max(1, Math.ceil(l.qty * Math.pow(1 - boonVal("reqQty"), boonCount("reqQty"))));
  function timeLeft() {
    const ms = (reqSlot() + 1) * B().reqHours * 3600000 - Date.now();
    const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function addFavor(pts) {
    const bs = save.boss, gained = [];
    pts = Math.round(pts * (1 + boonSum("favorUp")) * 10) / 10;
    bs.favor += pts; bs.total += pts;
    while (bs.favor >= levelNeed(bs.level)) {
      bs.favor -= levelNeed(bs.level); bs.level++;
      gained.push(rollBoon());
    }
    bs.favor = Math.round(bs.favor * 10) / 10;
    return { pts, gained };
  }
  function rollBoon() {
    const r = weighted(B().boonRarity);
    const ids = Object.keys(B().boons).filter(id => B().boons[id].r === r);
    const id = pickOne(ids), b = { id, r };
    if (id === "oreSell") { // 隨機指定一種礦石（以已發現的為主）
      const known = Object.keys(save.dex).filter(n => itemIndex()[n] && itemIndex()[n].cat.id !== "rubble");
      b.target = pickOne(known.length ? known : Object.keys(itemIndex()));
    }
    if (id === "raritySell") b.target = 1 + Math.floor(Math.random() * 5);
    save.boss.boons.push(b);
    return b;
  }
  function boonLabel(b) {
    const d = B().boons[b.id]; if (!d) return b.id;
    if (b.id === "oreSell") return `「${b.target}」售價 +${Math.round(d.v * 100)}%`;
    if (b.id === "raritySell") return `${config.rarities[b.target].name}色礦石售價 +${Math.round(d.v * 100)}%`;
    return d.name;
  }
  function oreOrigin(name) {
    const it = itemIndex()[name]; if (!it) return;
    const box = $("modalBox");
    box.innerHTML = `<div style="color:${rarityColor(it.cat.rarity)};font-size:1.2em">${name}</div>
      <div style="margin:10px 0;line-height:1.7">產地：<b>${it.mine.name}</b><br>稀有度：${config.rarities[it.cat.rarity].name}${it.vein ? "<br><span style='color:#ffaa00'>只在礦脈中才挖得到</span>" : ""}<br>基本售價 $${money(basePrice(name))}｜背包 ${save.ores[name] || 0} 個</div>
      <div class="btns"><button class="px-btn" id="mdClose">知道了</button></div>`;
    $("modal").classList.remove("hidden");
    $("mdClose").onclick = () => $("modal").classList.add("hidden");
  }
  function deliver(i) {
    const req = checkRequest(), l = req.lines[i]; if (!l || l.done) return;
    const need = lineQty(l);
    if ((save.ores[l.name] || 0) < need) { bossLine = B().lines.noEnough; renderShop(); return; }
    save.ores[l.name] -= need; if (save.ores[l.name] <= 0) delete save.ores[l.name];
    const coins = Math.round(basePrice(l.name) * sellBonus(l.name, catDef(l.cat).rarity) * need * B().deliverMul * 10) / 10;
    save.coins += coins; l.done = true;
    let pts = B().points[l.cat] || 1;
    const allDone = req.lines.every(x => x.done);
    if (allDone) pts += B().completeBonus;
    const fr = addFavor(pts);
    bossLine = allDone ? B().lines.allDone : B().lines.deliver;
    toast(`交付 ${l.name} ×${need}  +$${money(coins)}  恩惠+${fr.pts}`);
    persist(true); renderShop();
    if (fr.gained.length) showBoons(fr.gained);
  }
  function showBoons(list) {
    const box = $("modalBox");
    box.innerHTML = `<div class="boss-name">${B().name}</div><div style="margin:8px 0">「${B().lines.levelUp}」</div>
      <div style="margin:6px 0">恩惠等級 → Lv${save.boss.level}</div>
      ${list.map(b => `<div class="boon-get" style="border-color:${BOON_COLOR(b.r)};color:${BOON_COLOR(b.r)}">【${RARITY_NAME[b.r]}】${boonLabel(b)}</div>`).join("")}
      <div class="btns"><button class="px-btn" id="mdClose">收下</button></div>`;
    $("modal").classList.remove("hidden");
    $("mdClose").onclick = () => $("modal").classList.add("hidden");
  }

  function renderShop() {
    checkDay();
    const bs = save.boss, L = B().lines;
    $("bossName").textContent = B().name;
    $("bossLv").innerHTML = `恩惠 Lv${bs.level}　<span class="sub">${money(bs.favor)}/${levelNeed(bs.level)}</span>`;
    $("bossFavorBar").style.width = Math.min(100, bs.favor / levelNeed(bs.level) * 100) + "%";
    const view = bossView;
    let say = bossLine, body = "";
    const back = `<button class="px-btn wide boss-opt" data-boss="menu">◀ 返回</button>`;

    if (view === "menu") {
      say = say || pickOne(L.greet);
      const req = checkRequest(), left = req.lines.filter(l => !l.done).length;
      const adLeft = config.rules.adDailyLimit - save.ads.count;
      body = `<div class="boss-opts">
        <button class="px-btn wide boss-opt" data-boss="board">▶ 看委託板 <span class="sub">${left ? `剩${left}項` : "已完成"}</span></button>
        <button class="px-btn wide boss-opt" data-boss="sell">▶ 賣礦石</button>
        <button class="px-btn wide boss-opt" data-boss="buy">▶ 買鎬子</button>
        <button class="px-btn wide boss-opt" data-boss="boons">▶ 我的恩惠 <span class="sub">${bs.boons.length}個</span></button>
        <button class="px-btn wide boss-opt" data-boss="ad" ${adLeft <= 0 ? "disabled" : ""}>▶ 領補給（看廣告） <span class="sub">今日剩${adLeft}次</span></button>
        <button class="px-btn wide boss-opt" data-boss="bye">▶ 離開</button></div>`;
    }
    if (view === "board") {
      say = say || L.board;
      const req = checkRequest(), idx = itemIndex();
      body = `<div class="board"><div class="board-head">委託板 <span class="sub">下一張 ${timeLeft()}</span></div>` +
        req.lines.map((l, i) => {
          const known = !!save.dex[l.name], it = idx[l.name], color = rarityColor(it ? it.cat.rarity : 0);
          const need = lineQty(l), have = save.ores[l.name] || 0;
          const nameHtml = known ? `<a class="ore-link" data-origin="${l.name}" style="color:${color}">${l.name}</a>`
            : `<span style="color:${rarityColor(0)}">？？？</span> <span class="sub">(${config.rarities[it ? it.cat.rarity : 0].name})</span>`;
          const pay = Math.round(basePrice(l.name) * need * B().deliverMul * 10) / 10;
          return `<div class="row board-line ${l.done ? "done" : ""}"><div class="grow">${nameHtml} ×${need}
            <div class="sub">酬勞 $${money(pay)}＋恩惠${B().points[l.cat]}點</div></div>
            ${l.done ? '<span class="sub">✔ 已交付</span>' : `<button class="px-btn small" data-deliver="${i}" ${have >= need ? "" : "disabled"}>交付<br><span class="sub">包包 ${have}/${need}</span></button>`}</div>`;
        }).join("") + `<div class="sub" style="margin-top:6px">全部完成再加 ${B().completeBonus} 點｜點礦石名稱可查產地</div></div>` + back;
    }
    if (view === "sell") {
      say = say || L.sell;
      const idx = itemIndex(), names = oreNames();
      let total = 0;
      const rows = names.map(n => {
        const p = itemPrice(n), c = save.ores[n]; total += p * c;
        return `<div class="row"><div class="grow"><span style="color:${rarityColor(idx[n].cat.rarity)}">${n}</span> ×${c}
          <div class="sub">單價 $${money(p)}</div></div>
          <button class="px-btn small" data-sell1="${n}">賣1</button><button class="px-btn small" data-sellall="${n}">全賣</button></div>`;
      }).join("");
      body = `<div class="board"><div class="board-head">收購 <span class="sub">合計 $${money(total)}</span> ${names.length ? '<button class="px-btn small" id="btnSellAll">全部賣出</button>' : ""}</div>
        <div class="list">${rows || '<div class="sub">背包是空的</div>'}</div></div>` + back;
    }
    if (view === "buy") {
      say = say || L.buy;
      const cut = boonSum("shopCut");
      body = `<div class="board"><div class="board-head">鎬子 ${cut ? `<span class="sub">恩惠折扣 -${Math.round(cut * 100)}%</span>` : ""}</div><div class="list">` + config.tools.map(t => {
        const pr = toolPrice(t);
        return `<div class="row"><div class="grow"><span style="color:${rarityColor(t.rarity)}">${t.name}</span>
        <div class="sub">耐久 ${toolMax(t.id)}｜每揮 $${(pr / toolMax(t.id)).toFixed(1)}｜適合 ${config.mines.filter(m => m.tier === t.tier).map(m => m.name).join("、")}</div></div>
        <button class="px-btn small" data-buy="${t.id}" ${save.coins < pr ? "disabled" : ""}>$${fmt(pr)}</button></div>`;
      }).join("") + `</div></div>` + back;
    }
    if (view === "boons") {
      say = say || (bs.boons.length ? L.boons : L.noBoon);
      const groups = {};
      bs.boons.forEach(b => { const k = b.id + "|" + (b.target ?? ""); (groups[k] = groups[k] || { b, n: 0 }).n++; });
      const list = Object.values(groups).sort((x, y) => y.b.r - x.b.r);
      body = `<div class="board"><div class="board-head">我的恩惠 <span class="sub">共${bs.boons.length}個｜累計恩惠 ${money(bs.total)}點</span></div>` +
        (list.length ? list.map(g => `<div class="row"><div class="grow" style="color:${BOON_COLOR(g.b.r)}">【${RARITY_NAME[g.b.r]}】${boonLabel(g.b)}</div><span>×${g.n}</span></div>`).join("")
          : '<div class="sub">還沒有恩惠。完成委託提升恩惠等級，每升一級抽一個。</div>') +
        `<div class="sub" style="margin-top:6px">機率：普通${B().boonRarity[0]}%／藍${B().boonRarity[1]}%／紫${B().boonRarity[2]}%／金${B().boonRarity[3]}%，可以重複疊加</div></div>` + back;
    }
    $("bossSay").textContent = say || "";
    $("bossBody").innerHTML = body;
    bossLine = null;
    renderHud();
  }
  function bossGo(v) {
    if (v === "bye") { bossView = "menu"; bossLine = B().lines.bye; go("mine"); return; }
    if (v === "ad") { bossLine = B().lines.ad; watchAd(); return; }
    bossView = v; renderShop();
  }

  function watchAd() {
    if (save.ads.count >= config.rules.adDailyLimit) return;
    let sec = 5;
    const box = $("modalBox");
    const tick = () => {
      box.innerHTML = `<div>（廣告示意）</div><div style="font-size:2em;margin:16px 0">${sec}</div><div class="sub">之後會換成真實廣告</div>`;
      if (sec-- <= 0) {
        save.ads.count++;
        const woods = 1 + boonCount("adWood");
        for (let i = 0; i < woods; i++) addTool("wood", 1);
        let msg = `獲得 木鎬 ×${woods}`;
        if (boonCount("adStone") && Math.random() < boonSum("adStone")) { addTool("stone", 1); msg += "、石鎬 ×1"; }
        $("modal").classList.add("hidden");
        toast(msg); persist(); renderShop();
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

  const lockOf = id => ((config.locks || {})[id]) || null;
  const locked = id => !!lockOf(id) && !save.pw[id];
  function askPassword(id, onOk) {
    const box = $("modalBox"), mine = mineDef(id);
    box.innerHTML = `<div>「${mine.name}」需要密碼</div>
      <div class="sub" style="margin-top:6px">坑口上了鎖。</div>
      <input id="pwInput" inputmode="numeric" maxlength="16" placeholder="輸入密碼">
      <div class="sub hidden" id="pwErr" style="color:#ff5555">密碼不對</div>
      <div class="btns"><button class="px-btn" id="pwOk">開鎖</button><button class="px-btn" id="pwNo">取消</button></div>`;
    $("modal").classList.remove("hidden");
    $("pwInput").focus();
    const tryIt = () => {
      const v = ($("pwInput").value || "").trim();
      if (pwHash(v) === lockOf(id)) {
        save.pw[id] = true; persist(true);
        $("modal").classList.add("hidden");
        toast("坑口的鎖開了");
        onOk();
      } else {
        $("pwErr").classList.remove("hidden");
        $("pwInput").value = "";
      }
    };
    $("pwOk").onclick = tryIt;
    $("pwInput").onkeydown = e => { if (e.key === "Enter") tryIt(); };
    $("pwNo").onclick = () => $("modal").classList.add("hidden");
  }

  function leaveMine() {
    const mine = curMine();
    const box = $("modalBox");
    box.innerHTML = `<div style="line-height:1.7">真的要離開嗎<br><span class="sub">離開了礦坑之後，坑洞將會坍塌，搜尋的結果也將重置喔…</span></div>
      <div class="btns"><button class="px-btn" id="lvOk">離開</button><button class="px-btn" id="lvNo">留下</button></div>`;
    $("modal").classList.remove("hidden");
    $("lvNo").onclick = () => $("modal").classList.add("hidden");
    $("lvOk").onclick = () => {
      stopAuto(); clearM2UI();
      $("modal").classList.add("hidden");
      go("map");
      delete save.plays[mine.id];
      delete save.plays2[mine.id];
      save.today.stats[mine.id] = { swings: 0, hits: 0, epic: 0, normalSwings: 0 };
      toast("坑洞坍塌了，" + mine.name + " 的搜尋結果已重置");
      persist(true); renderMap();
    };
  }

  let currentScreen = "mine";
  function clearM2UI() { const b = $("tbChoice"); if (b) { b.classList.add("hidden"); b.innerHTML = ""; } }
  function go(name) {
    clearM2UI();
    if (name !== "mine") stopAuto();
    if (name === "shop" && currentScreen !== "shop") bossView = "menu";
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
  $("btnLeave").addEventListener("click", () => { if (!window.Editor?.isPicking()) leaveMine(); });
  $("hudName").addEventListener("click", () => { if (!window.Editor?.isPicking()) askName(false); });
  document.addEventListener("click", e => {
    if (window.Editor?.isPicking()) return;
    const link = e.target.closest("[data-origin]"); if (link) { oreOrigin(link.dataset.origin); return; }
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    if (t.id === "btnSellAll") {
      const names = oreNames(); if (!names.length) return;
      let sum = 0; names.forEach(n => { sum += itemPrice(n) * save.ores[n]; });
      save.coins += sum; save.ores = {}; toast(`全部賣出 +$${money(sum)}`); persist(); renderShop();
    }
    if (d.m2) { doSwing2({ choice: d.m2 }); return; }
    if (d.boss) bossGo(d.boss);
    if (d.deliver !== undefined) deliver(+d.deliver);
    if (d.equip) { save.equipped = +d.equip; const tt = save.tools.find(x => x.uid === +d.equip); if (tt) { const f = toolFactor(tt, curMine()); if (f < 1) toast(`工具等級不足：這座礦坑收益剩 ${Math.round(f * 100)}%`); } persist(); renderBag(); }
    if (d.sell1) sell(d.sell1, 1);
    if (d.sellall) sell(d.sellall, Infinity);
    if (d.goMine) {
      if (locked(d.goMine)) { askPassword(d.goMine, () => { const b = document.querySelector(`[data-go-mine="${d.goMine}"]`); if (b) b.click(); }); return; }
      const from = curMine();
      if (from.engine === 2 && from.id !== d.goMine) { delete save.plays2[from.id]; toast("離開了「" + from.name + "」，累積全部歸零"); }
      save.mineId = d.goMine; save.equipped = null; clearM2UI(); persist();
      if (!(from.engine === 2 && from.id !== d.goMine)) toast("前往 " + mineDef(d.goMine).name);
      go("mine");
    }
    if (d.unlock) { const m = mineDef(d.unlock); if (save.coins >= m.unlock) { save.coins -= m.unlock; save.unlocked.push(m.id); persist(); toast("解鎖 " + m.name); renderMap(); renderHud(); } }
    if (d.buy) { const tl = toolDef(d.buy), pr = toolPrice(tl); if (save.coins >= pr) { save.coins -= pr; addTool(tl.id, 1); persist(); toast("購買 " + tl.name); renderShop(); } }
  });
  setInterval(() => { // 委託板倒數；時間到自動換新委託
    if (currentScreen !== "shop" || bossView !== "board" || !$("modal").classList.contains("hidden")) return;
    const el = document.querySelector(".board-head .sub");
    if (save.boss.req && save.boss.req.slot !== reqSlot()) renderShop(); else if (el) el.textContent = "下一張 " + timeLeft();
  }, 1000);
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
    persist, renderAll, toast, todaySetting, go, swing: () => doSwing(),
    setLock(id, pw) { config.locks = config.locks || {}; if (pw) { config.locks[id] = pwHash(pw); delete save.pw[id]; } else { delete config.locks[id]; } store.set(CFG_KEY, config); persist(true); renderAll(); },
    clearLockMemory(id) { delete save.pw[id]; persist(true); renderAll(); },
    m2: {
      get state() { return isM2() ? state2() : null; },
      isHere: () => isM2(),
      favor(boss) { const st = state2(); if (boss === "all") { st.favor.a = st.favor.b = st.favor.c = 1; } else st.favor[boss] = 1; persist(true); renderAll(); },
      counts(boss, n) { const st = state2(); st.counts[boss] = Math.max(0, (st.counts[boss] || 0) + n); persist(true); renderAll(); },
      card(cat) { state2().forceCat = cat; renderAll(); },
      date(boss, win) {
        const st = state2();
        E2.forceDate(M2(), todaySetting(curMine().id), st, boss, Math.random, win !== false);
        persist(true); go("mine");
      },
      at(boss) {
        const st = state2();
        Object.assign(st, { state: "at", atLeft: config.machine2.at.length, gain: 0, stRound: 0, upper: false, pickedBoss: null, sinceAt: 0, dateBoss: boss || "a" });
        persist(true); go("mine");
      },
      upper(on) { const st = state2(); st.upper = on !== false; st.pickedBoss = null; persist(true); renderAll(); },
      stBoss(boss) { const st = state2(); st.stBoss = boss; st.pickedBoss = boss; persist(true); renderAll(); },
      bonus(n) { const st = state2(); st.bonusTotal = n; st.bonusLeft = n; st.state = "bonus"; persist(true); go("mine"); },
      reset() { const id = curMine().id; delete save.plays2[id]; persist(true); renderAll(); }
    },
    addFavor: p => { const r = addFavor(p); persist(true); renderAll(); if (r.gained.length) showBoons(r.gained); },
    newRequest: () => { save.boss.req = makeRequest(); persist(true); renderAll(); },
    toolFactor, itemPrice, basePrice
  };

  /* ---------------- 啟動 ---------------- */
  applyLook();
  setTextbox([colored(pickOne(["點擊這裡揮鎬", "準備好了嗎？"]), config.theme.sub)], 0);
  renderAll();
  if (!save.name) askName(true);
})();
