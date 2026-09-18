/* =========================================================
   第二台機台引擎：三位前輩的考驗（參考出包王女）
   流程：通常（累積機會牌）→ 前輩找你談話 → 約會 → AT 10轉
         → ST 挑戰（10轉，抽對應機會牌）→ 一轉定勝負 → BONUS（轉數告知）
         → 下一關（第 1/3/7/10 關抽上位）
   - 只有「抽選轉」與「BONUS 轉」會消耗耐久、產生收益
   - 對話演出轉不消耗任何東西（res.free = true）
   ========================================================= */
(function (root) {
  const CATS2 = ["cardA", "cardB", "cardC", "bell", "replay", "common", "rubble"];
  const NAME2 = { cardA: "甲的機會牌", cardB: "乙的機會牌", cardC: "丙的機會牌", bell: "銅鐘", replay: "空掘（Replay）", common: "普通礦", rubble: "碎石" };
  const CARD_OF = { a: "cardA", b: "cardB", c: "cardC" };
  const BOSS_OF = { cardA: "a", cardB: "b", cardC: "c" };

  const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const denom = p => { if (p <= 0) return 100; let D = 100; while (p * D < 1 && D < 1e7) D *= 10; return D; };

  function roll(res, rng, label, p, major) {
    const D = denom(p), need = Math.max(0, Math.round(p * D)), n = Math.floor(rng() * D) + 1;
    const hit = n <= need;
    if (res) res.rolls.push({ label, p, D, n, need, hit, major: !!major || hit });
    return hit;
  }
  function rollPick(res, rng, label, names, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    const r = rng(); let x = r * total, i = 0;
    for (; i < weights.length; i++) if ((x -= weights[i]) < 0) break;
    if (i >= weights.length) i = weights.length - 1;
    if (res) {
      let lo = 1; const ranges = names.map((nm, k) => { const hi = lo + weights[k] - 1; const t = `${nm} ${lo}~${hi}`; lo = hi + 1; return weights[k] > 0 ? t : null; }).filter(Boolean);
      res.rolls.push({ label, pick: true, total, n: Math.floor(r * total) + 1, result: names[i], ranges, major: true });
    }
    return i;
  }
  // 小役抽選（table = {cat: [設定1~6]}）
  function rollCat(res, rng, label, table, s, major, forced) {
    if (forced) {
      if (res) res.rolls.push({ label: label + "（強制 " + (NAME2[forced] || forced) + "）", info: true, major: true });
      return forced;
    }
    const order = ["cardA", "cardB", "cardC", "bell", "replay", "common"];
    const r = rng(); let acc = 0, cat = "rubble";
    for (const c of order) { acc += (table[c] || [])[s] || 0; if (r < acc) { cat = c; break; } }
    if (res) {
      const D = 10000;
      let lo = 1; const ranges = [];
      for (const c of order) { const w = Math.round(((table[c] || [])[s] || 0) * D); if (w > 0) { ranges.push(`${NAME2[c]} ${lo}~${lo + w - 1}`); lo += w; } }
      if (lo <= D) ranges.push(`碎石 ${lo}~${D}`);
      res.rolls.push({ label, pick: true, total: D, n: Math.floor(r * D) + 1, result: NAME2[cat], ranges, major: !!major });
    }
    return cat;
  }

  function newState2() {
    return {
      state: "normal",          // normal / date / at / stIntro / st / reward / pick / bonus / pickBoss
      counts: { a: 0, b: 0, c: 0 },   // 各前輩的機會牌累積（永久保留，取得認同後歸零）
      favor: { a: 0, b: 0, c: 0 },    // 好感度 0~1（內部，玩家看不到）
      sinceAt: 0,               // 天井計數
      dateBoss: null, dateStep: 0, dateWin: false, dateSteps: 5, dateColors: [], dateOdd: false, forceCat: null,
      atLeft: 0,
      stBoss: null, stLeft: 0, stRound: 0, stPass: false,
      upper: false, pickedBoss: null,
      bonusLeft: 0, bonusTotal: 0, bonusShown: false, digTaps: 0, digShown: 0,
      gain: 0                  // 這一輪（從約會成功到結束）的收益，UI 顯示用
    };
  }

  const need = (R, id, key) => ((R.bosses.find(b => b.id === id) || {})[key]);

  /* ---------------- 一步（一次點擊） ----------------
     input: { choice: "drill" | "shovel" | bossId }  （選擇畫面才需要）
     回傳 res = { free, cat, events[], rolls[], stateAfter, ... }
  */
  function step2(R, setting, st, rng, input) {
    rng = rng || Math.random;
    input = input || {};
    const s = Math.min(5, Math.max(0, setting - 1));
    const res = { rolls: [], events: [], stateBefore: st.state, cat: null, free: true, pay: 0 };
    const forced = st.forceCat || null; st.forceCat = null;    // 開發者：指定下一轉的小役

    /* ===== 通常：累積機會牌 ===== */
    if (st.state === "normal") {
      res.free = false;
      st.sinceAt++;
      res.cat = rollCat(res, rng, "挖到", R.itemTable, s, false, forced);
      res.pay = payOf(R, res.cat, "normal");
      const boss = BOSS_OF[res.cat];
      if (boss) {
        st.counts[boss]++;
        res.events.push({ t: "card", boss, count: st.counts[boss] });
        // 前輩找你談話（機率隨累積數提升，到保底必定發生）
        const tbl = R.call.rate;
        const n = Math.min(tbl.length, st.counts[boss]);
        const p = n >= R.call.guarantee ? 1 : tbl[n - 1];
        if (roll(res, rng, `${bossName(R, boss)}找你談話（累積${st.counts[boss]}個${n >= R.call.guarantee ? "・保底" : ""}）`, p, true)) {
          startDate(R, st, boss, s, rng, res);
        }
      }
      if (st.state === "normal" && st.sinceAt >= R.tenjou) {
        // 天井：累積最多的前輩直接找你
        const boss = ["a", "b", "c"].sort((x, y) => st.counts[y] - st.counts[x])[0];
        res.rolls.push({ label: `天井 ${R.tenjou} 到達 → ${bossName(R, boss)}找你談話`, info: true, major: true });
        startDate(R, st, boss, s, rng, res);
        res.events.push({ t: "tenjou" });
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== 約會（對話演出：免費） ===== */
    if (st.state === "date") {
      st.dateStep++;
      const col = (st.dateColors || [])[st.dateStep - 1] || 0;
      const kind = col >= (R.date.hotAt || 4) ? "hot" : col >= (R.date.upAt || 3) ? "up" : "chat";
      res.events.push({ t: "dateStep", step: st.dateStep, total: st.dateSteps, color: col, kind, odd: !!st.dateOdd, boss: st.dateBoss, win: st.dateWin });
      if (st.dateStep >= (st.dateSteps || 5)) {
        if (st.dateWin) {
          st.counts[st.dateBoss] = 0;        // 取得認同 → 累積歸零
          st.favor[st.dateBoss] = 0;
          st.state = "at"; st.atLeft = R.at.length; st.gain = 0;
          st.stRound = 0; st.upper = false; st.pickedBoss = null;
          st.sinceAt = 0;
          res.events.push({ t: "dateWin", boss: st.dateBoss });
        } else {
          const add = R.date.favorMin + rng() * (R.date.favorMax - R.date.favorMin);
          st.favor[st.dateBoss] = Math.min(1, st.favor[st.dateBoss] + add);
          res.rolls.push({ label: `約會失敗 → 好感度 +${Math.round(add * 100)}%（目前 ${Math.round(st.favor[st.dateBoss] * 100)}%）`, info: true, major: true });
          res.events.push({ t: "dateLose", boss: st.dateBoss });
          st.state = "normal";
        }
        st.dateBoss = st.dateBoss; st.dateStep = 0;
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== AT：10 轉，只賺錢 ===== */
    if (st.state === "at") {
      res.free = false;
      res.cat = rollCat(res, rng, `AT（剩${st.atLeft}轉）挖到`, R.atTable, s, false, forced);
      res.pay = payOf(R, res.cat, "at");
      st.gain += res.pay;
      st.atLeft--;
      res.events.push({ t: "atSwing", left: st.atLeft });
      if (st.atLeft <= 0) { st.state = "stIntro"; res.events.push({ t: "atEnd" }); }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== ST 前的演出：三位前輩走出來，隨機一位（上位時由玩家選） ===== */
    if (st.state === "stIntro") {
      st.stRound++;
      // 上位抽選（第 1/3/7/10 關）
      if (!st.upper) {
        const up = R.upper.rounds[String(st.stRound)];
        if (up !== undefined && roll(res, rng, `第${st.stRound}關 → 上位抽選`, up[s] !== undefined ? up[s] : up, true)) {
          st.upper = true;
          res.events.push({ t: "upperStart", round: st.stRound });
        }
      }
      if (st.upper && !st.pickedBoss) {
        // 需要玩家選前輩
        if (input.choice && CARD_OF[input.choice]) {
          st.pickedBoss = input.choice;
        } else {
          res.events.push({ t: "askBoss" });
          res.stateAfter = st.state;
          return res;
        }
      }
      st.stBoss = st.upper ? st.pickedBoss : ["a", "b", "c"][rollPick(res, rng, `第${st.stRound}關 → 哪位前輩出現`, [bossName(R, "a"), bossName(R, "b"), bossName(R, "c")], R.st.appear)];
      st.stLeft = R.st.length; st.stPass = false;
      res.events.push({ t: "stStart", boss: st.stBoss, round: st.stRound, upper: st.upper });
      st.state = "st";
      res.stateAfter = st.state;
      return res;
    }

    /* ===== ST：10 轉內抽到對應機會牌 ===== */
    if (st.state === "st") {
      res.free = false;
      const table = st.upper ? R.stTableUpper : (R.stTable[st.stBoss] || R.stTable.a);
      res.cat = rollCat(res, rng, `ST（${bossName(R, st.stBoss)}・剩${st.stLeft}轉）挖到`, table, s, false, forced);
      res.pay = payOf(R, res.cat, "st");
      st.gain += res.pay;
      const boss = BOSS_OF[res.cat];
      if (boss) {
        const right = boss === st.stBoss;
        let p = right ? need(R, st.stBoss, "hit")[s] : R.st.otherPass[s];
        if (st.upper) p = right ? R.upper.hitRight[s] : R.upper.hitWrong[s];
        if (roll(res, rng, `${right ? "對應的" : "其他"}機會牌 → ${bossName(R, st.stBoss)}的認可`, p, true)) {
          st.stPass = true;
          res.events.push({ t: "stPass", boss: st.stBoss, right });
          st.state = "reward";
          res.stateAfter = st.state;
          return res;
        }
      }
      st.stLeft--;
      res.events.push({ t: "stSwing", left: st.stLeft });
      if (st.stLeft <= 0) {
        res.events.push({ t: "stLose", boss: st.stBoss, round: st.stRound, gain: st.gain });
        st.state = "normal"; st.upper = false; st.pickedBoss = null; st.stBoss = null;
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== 一轉定勝負：決定 BONUS 轉數 ===== */
    if (st.state === "reward") {
      res.free = false;
      res.cat = rollCat(res, rng, "一轉定勝負 → 挖到", R.rewardTable, s, true, forced);
      res.pay = payOf(R, res.cat, "st");
      st.gain += res.pay;
      const tier = BOSS_OF[res.cat] ? "card" : (res.cat === "bell" || res.cat === "replay") ? "mid" : "low";
      const rg = R.reward[tier];
      st.bonusTotal = randInt(rng, rg[0], rg[1]);
      res.rolls.push({ label: `報酬等級 ${tier === "card" ? "機會牌（45~100轉）" : tier === "mid" ? "銅鐘/空掘（18~50轉）" : "無（10~20轉）"} → ${st.bonusTotal}轉`, info: true, major: true });
      st.bonusLeft = st.bonusTotal; st.bonusShown = false; st.digTaps = 0; st.digShown = 0;
      st.state = "pick";
      res.events.push({ t: "rewardRoll", tier, total: st.bonusTotal });
      res.stateAfter = st.state;
      return res;
    }

    /* ===== 選擇告知方式：鑽頭（一發）或鏟子（點按） ===== */
    if (st.state === "pick") {
      if (input.choice === "drill") {
        st.bonusShown = true;
        st.state = "bonus";
        res.events.push({ t: "announce", total: st.bonusTotal, how: "drill" });
      } else if (input.choice === "shovel") {
        st.state = "dig";
        res.events.push({ t: "digStart", total: st.bonusTotal });
      } else {
        res.events.push({ t: "askPick" });
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== 鏟子：點按數次後告知（總數一定等於內部決定的轉數） ===== */
    if (st.state === "dig") {
      st.digTaps++;
      const taps = R.dig.taps;                       // 至少點幾下
      const left = Math.max(0, taps - st.digTaps);
      if (st.digTaps < taps) {
        // 每下顯示 +1 / +2（只是演出，總和會在最後補齊成真正的轉數）
        const inc = Math.min(st.bonusTotal - st.digShown - left, 1 + (rng() < R.dig.plusTwo ? 1 : 0));
        st.digShown += Math.max(1, inc);
        res.events.push({ t: "dig", inc: Math.max(1, inc), shown: st.digShown, tap: st.digTaps, taps });
      } else {
        const rest = st.bonusTotal - st.digShown;
        st.digShown = st.bonusTotal;
        st.bonusShown = true;
        st.state = "bonus";
        res.events.push({ t: "announce", total: st.bonusTotal, how: "shovel", last: rest });
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== BONUS：純增，只賺錢 ===== */
    if (st.state === "bonus") {
      res.free = false;
      res.cat = rollCat(res, rng, `BONUS（剩${st.bonusLeft}轉）挖到`, R.bonusTable, s, false, forced);
      res.pay = payOf(R, res.cat, "bonus");
      st.gain += res.pay;
      st.bonusLeft--;
      res.events.push({ t: "bonusSwing", left: st.bonusLeft });
      if (st.bonusLeft <= 0) {
        res.events.push({ t: "bonusEnd", total: st.bonusTotal });
        st.state = "stIntro";
        if (st.upper) st.pickedBoss = null;          // 上位：每次 bonus 結束重新選前輩
      }
      res.stateAfter = st.state;
      return res;
    }

    res.stateAfter = st.state;
    return res;
  }

  function startDate(R, st, boss, s, rng, res, forceWin) {
    st.state = "date"; st.dateBoss = boss; st.dateStep = 0;
    const D = R.date;
    const base = need(R, boss, "date")[s];
    const fav = st.favor[boss] || 0;
    const p = fav >= 1 ? 1 : Math.min(1, base + fav);
    st.dateWin = roll(res, rng, `約會（${bossName(R, boss)}・好感度${Math.round(fav * 100)}%）→ 成功`, p, true);
    if (forceWin !== undefined) st.dateWin = !!forceWin;
    // 長度：一般 5～15 轉；會過時有機率改用「違和感長度」（1～2 或 16～20，出現就是確定過關）
    let odd = false;
    if (st.dateWin && roll(res, rng, "違和感長度（出現＝確定過關）", (D.oddChance || [0])[s] || 0, true)) {
      odd = true;
      st.dateSteps = rng() < 0.5 ? randInt(rng, D.shortLen[0], D.shortLen[1]) : randInt(rng, D.longLen[0], D.longLen[1]);
    } else {
      st.dateSteps = randInt(rng, D.steps[0], D.steps[1]);
    }
    st.dateOdd = odd;
    // 每一轉的信賴度顏色（0白 1藍 2黃 3綠 4紅）
    const w = st.dateWin ? D.colorWin : D.colorLose;
    st.dateColors = [];
    for (let i = 0; i < st.dateSteps; i++) {
      let c = 0, x = rng() * w.reduce((a, b) => a + b, 0);
      for (; c < w.length; c++) if ((x -= w[c]) < 0) break;
      st.dateColors.push(Math.min(w.length - 1, c));
    }
    res.rolls.push({ label: `談話長度 ${st.dateSteps} 轉${odd ? "（違和感）" : ""}｜紅色 ${st.dateColors.filter(c => c >= (D.hotAt || 4)).length} 次`, info: true, major: true });
    res.events.push({ t: "dateStart", boss, win: st.dateWin, steps: st.dateSteps, odd });
  }
  const bossName = (R, id) => (R.bosses.find(b => b.id === id) || {}).name || id;

  // 一轉的收益：礦石名稱 → 基本售價（外部再乘礦坑倍率）
  function oreName(R, cat, phase) {
    const g = (R.map || {})[phase === "normal" ? "normal" : "vein"] || {};
    const v = g[cat];
    return Array.isArray(v) ? v[0] : v;
  }
  function payOf(R, cat, phase) {
    const nm = oreName(R, cat, phase);
    return nm ? ((R.prices || {})[nm] || 0) : 0;
  }

  /* ---------------- 模擬器 ---------------- */
  function simulate2(config, setting, n, rng) {
    rng = rng || Math.random;
    const R = config.machine2;
    const mine = config.mines.find(m => m.engine === 2) || config.mines[0];
    const tool = config.tools.find(t => t.tier === mine.tier) || config.tools[0];
    const costPerSwing = tool.price / tool.durability;
    const st = newState2();
    const stat = { swings: 0, paidSwings: 0, income: 0, dates: 0, dateWins: 0, ats: 0, stRounds: 0, stPasses: 0, uppers: 0, bonusSwings: 0, bonusTotal: 0, chains: [], atSwings: 0 };
    let guard = 0;
    while (stat.paidSwings < n && guard < n * 20) {
      guard++;
      const input = st.state === "pick" ? { choice: "drill" } : (st.state === "stIntro" && st.upper && !st.pickedBoss ? { choice: "a" } : {});
      const res = step2(R, setting, st, rng, input);
      stat.swings++;
      if (!res.free) { stat.paidSwings++; stat.income += res.pay * mine.mult; }
      if (res.stateBefore === "bonus") stat.bonusSwings++;
      if (res.stateBefore === "at") stat.atSwings++;
      for (const e of res.events) {
        if (e.t === "dateStart") stat.dates++;
        if (e.t === "dateWin") { stat.dateWins++; stat.ats++; }
        if (e.t === "stStart") stat.stRounds++;
        if (e.t === "stPass") stat.stPasses++;
        if (e.t === "upperStart") stat.uppers++;
        if (e.t === "bonusEnd") stat.bonusTotal += e.total;
        if (e.t === "stLose") stat.chains.push(st.stRound || 0);
      }
    }
    stat.cost = stat.paidSwings * costPerSwing;
    stat.rtp = stat.income / stat.cost;
    stat.hitRate = stat.ats ? (stat.paidSwings - stat.bonusSwings - stat.atSwings) / stat.ats : Infinity;
    stat.dateWinRate = stat.dates ? stat.dateWins / stat.dates : 0;
    stat.stPassRate = stat.stRounds ? stat.stPasses / stat.stRounds : 0;
    stat.avgRounds = stat.chains.length ? stat.chains.reduce((a, b) => a + b, 0) / stat.chains.length : 0;
    stat.upperRate = stat.ats ? stat.uppers / stat.ats : 0;
    stat.avgBonus = stat.stPasses ? stat.bonusTotal / stat.stPasses : 0;
    return stat;
  }

  // 開發者用：直接開始一場指定結果的談話
  function forceDate(R, setting, st, boss, rng, win) {
    const res = { rolls: [], events: [] };
    startDate(R, st, boss, Math.min(5, Math.max(0, (setting || 1) - 1)), rng || Math.random, res, win);
    return res;
  }
  const api = { CATS2, NAME2, CARD_OF, BOSS_OF, newState2, step2, simulate2, bossName, oreName, forceDate };
  root.MineEngine2 = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
