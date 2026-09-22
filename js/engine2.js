/* =========================================================
   第二台機台引擎：三位前輩的考驗（參考出包王女）
   流程：通常（累積機會牌）→ 前輩找你談話 → 約會 → AT 10轉
         → ST 挑戰（10轉，抽對應機會牌）→ 一轉定勝負 → BONUS（轉數告知）
         → 下一關（第 1/3/7/10 關抽上位）
   - 只有「抽選轉」與「BONUS 轉」會消耗耐久、產生收益
   - 對話演出轉不消耗任何東西（res.free = true）
   ========================================================= */
(function (root) {
  const CATS2 = ["goldA", "goldB", "goldC", "cardA", "cardB", "cardC", "bell", "replay", "common", "rubble"];
  const NAME2 = { goldA: "甲的金機會牌", goldB: "乙的金機會牌", goldC: "丙的金機會牌", cardA: "甲的機會牌", cardB: "乙的機會牌", cardC: "丙的機會牌", bell: "銅鐘", replay: "空掘（Replay）", common: "普通礦", rubble: "碎石" };
  const CARD_OF = { a: "cardA", b: "cardB", c: "cardC" };
  const BOSS_OF = { cardA: "a", cardB: "b", cardC: "c" };
  const GOLD_OF = { goldA: "a", goldB: "b", goldC: "c" };

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
    const order = ["goldA", "goldB", "goldC", "cardA", "cardB", "cardC", "bell", "replay", "common"];
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
      dateQueue: [],            // 同一轉有兩位以上當選時排隊
      cleared: 0,               // 這一輪已通關幾關（上位抽選用）
      atLeft: 0,
      stBoss: null, stLeft: 0, stRound: 0, stPass: false,
      dateScene: "normal", dateAgain: false, lastRejected: null,
      upper: false, pickedBoss: null, lastPick: null, lastStBoss: null, runMaxBonus: 0, mood: null,
      bonusLeft: 0, bonusTotal: 0, bonusShown: false, digTaps: 0, digShown: 0, digSeq: null,
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

    /* ===== 通常：抽機會牌 → 加好感度 → 抽「前輩找你談話」 ===== */
    if (st.state === "normal") {
      res.free = false;
      st.sinceAt++;
      res.cat = rollCat(res, rng, "挖到", R.itemTable, s, false, forced);
      res.pay = payOf(R, res.cat, "normal");
      const F = R.favor;
      const hits = [];               // 這一轉當選的前輩（可能兩位以上）
      const addFavor = (boss, lo, hi, why) => {
        const add = lo + rng() * (hi - lo);
        st.favor[boss] = Math.min(1, (st.favor[boss] || 0) + add);
        st.counts[boss] = (st.counts[boss] || 0) + 1;
        res.rolls.push({ label: `${bossName(R, boss)} 好感度 +${Math.round(add * 100)}%（${why}）→ 目前 ${Math.round(st.favor[boss] * 100)}%`, info: true, major: true });
        // 好感度就是「被找去談話」的機率；100% 必定
        const p = st.favor[boss];
        if (roll(res, rng, `${bossName(R, boss)}找你談話（好感度 ${Math.round(p * 100)}%）`, p, true)) hits.push(boss);
      };
      const pBoss = BOSS_OF[res.cat], gBoss = GOLD_OF[res.cat];
      if (pBoss) {
        res.events.push({ t: "card", boss: pBoss, gold: false });
        addFavor(pBoss, F.purpleMin, F.purpleMax, "紫機會牌");
      } else if (gBoss) {
        res.events.push({ t: "card", boss: gBoss, gold: true });
        const targets = (F.goldTargets || {})[res.cat] || [gBoss];
        for (const t of targets) addFavor(t, F.goldMin, F.goldMax, "金機會牌");
      }
      if (hits.length) {
        st.dateQueue = hits.slice(1);
        startDate(R, st, hits[0], s, rng, res);
        if (hits.length > 1) res.events.push({ t: "alsoWants", boss: hits[1] });
      } else if (st.sinceAt >= R.tenjou) {
        // 天井：好感度最高的前輩直接找你
        const boss = ["a", "b", "c"].sort((x, y) => (st.favor[y] || 0) - (st.favor[x] || 0))[0];
        res.rolls.push({ label: `天井 ${R.tenjou} 到達 → ${bossName(R, boss)}找你談話`, info: true, major: true });
        st.dateQueue = [];
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
      res.events.push({ t: "dateStep", step: st.dateStep, total: st.dateSteps, color: col, kind, odd: !!st.dateOdd, boss: st.dateBoss, win: st.dateWin, scene: st.dateScene || "normal" });
      if (st.dateStep >= (st.dateSteps || 5)) {
        const boss = st.dateBoss;
        if (st.dateWin) {
          // 取得認同：只有成功的那一位歸零，其他人的好感度保留
          st.counts[boss] = 0;
          st.favor[boss] = 0;
          st.dateQueue = [];
          // 每次進 AT，這一輪的狀態全部重算
          st.state = "at"; st.atLeft = R.at.length; st.gain = 0;
          st.stRound = 0; st.cleared = 0; st.upper = false; st.pickedBoss = null;
          st.stBoss = null; st.stLeft = 0; st.bonusLeft = 0; st.bonusTotal = 0;
          st.runMaxBonus = 0; st.lastStBoss = null;
          st.sinceAt = 0; st.dateStep = 0;
          st.lastRejected = null;
          res.events.push({ t: "dateWin", boss, scene: st.dateScene || "normal" });
        } else {
          res.events.push({ t: "dateLose", boss, scene: st.dateScene || "normal" });
          st.lastRejected = boss;          // 下次又是他 → 彩蛋台詞
          st.dateStep = 0;
          if (st.dateQueue && st.dateQueue.length) {
            const next = st.dateQueue.shift();
            startDate(R, st, next, s, rng, res);
            res.events.push({ t: "dateNext", boss: next });
          } else {
            st.state = "normal";
          }
        }
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
      // 上位抽選：通關第 N 關「之後」才抽（所以第一關不會直接上位）
      if (!st.upper && st.cleared > 0) {
        const up = R.upper.rounds[String(st.cleared)];
        if (up !== undefined && roll(res, rng, `已通關${st.cleared}關 → 上位抽選`, up[s] !== undefined ? up[s] : up, true)) {
          st.upper = true;
          res.events.push({ t: "upperStart", round: st.stRound + 1, cleared: st.cleared });
        }
      }
      if (st.upper && !st.pickedBoss) {
        // 需要玩家選前輩
        if (input.choice && CARD_OF[input.choice]) {
          st.pickedBoss = input.choice;
          if (!input.auto) st.lastPick = input.choice;      // 只記住玩家自己選的
        } else {
          res.events.push({ t: "askBoss" });
          res.stateAfter = st.state;
          return res;
        }
      }
      st.stRound++;      // v0.10.0：移到「要玩家選前輩」的提早 return 之後，避免多跳關
      st.stBoss = st.upper ? st.pickedBoss : ["a", "b", "c"][rollPick(res, rng, `第${st.stRound}關 → 哪位前輩出現`, [bossName(R, "a"), bossName(R, "b"), bossName(R, "c")], R.st.appear)];
      st.stLeft = R.st.length; st.stPass = false;
      res.events.push({ t: "stStart", boss: st.stBoss, round: st.stRound, upper: st.upper, same: st.lastStBoss === st.stBoss });
      st.lastStBoss = st.stBoss;
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
      const boss = BOSS_OF[res.cat], gold = GOLD_OF[res.cat];
      if (gold) {
        // 金機會牌：ST 中出現就一定過關（上位也一樣）
        res.rolls.push({ label: `金機會牌（${bossName(R, gold)}）→ ${bossName(R, st.stBoss)}的認可（確定）`, p: 1, D: 100, n: 1, need: 100, hit: true, major: true });
        st.stPass = true;
        st.cleared = (st.cleared || 0) + 1;
        res.events.push({ t: "stPass", boss: st.stBoss, right: true, gold: true, cleared: st.cleared });
        st.state = "reward";
        res.stateAfter = st.state;
        return res;
      }
      if (boss) {
        const right = boss === st.stBoss;
        let p = right ? need(R, st.stBoss, "hit")[s] : R.st.otherPass[s];
        if (st.upper) p = right ? R.upper.hitRight[s] : R.upper.hitWrong[s];
        if (roll(res, rng, `${right ? "對應的" : "其他"}機會牌 → ${bossName(R, st.stBoss)}的認可`, p, true)) {
          st.stPass = true;
          st.cleared = (st.cleared || 0) + 1;
          res.events.push({ t: "stPass", boss: st.stBoss, right, cleared: st.cleared });
          st.state = "reward";
          res.stateAfter = st.state;
          return res;
        }
      }
      st.stLeft--;
      res.events.push({ t: "stSwing", left: st.stLeft });
      if (st.stLeft <= 0) {
        res.events.push({ t: "stLose", boss: st.stBoss, round: st.stRound, cleared: st.cleared, gain: st.gain, maxBonus: st.runMaxBonus || 0, upper: !!st.upper });
        st.state = "normal"; st.upper = false; st.pickedBoss = null; st.stBoss = null;
        st.stRound = 0; st.cleared = 0; st.stLeft = 0; st.bonusLeft = 0; st.bonusTotal = 0;
        st.runMaxBonus = 0; st.lastStBoss = null;
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
      const tier = GOLD_OF[res.cat] ? "gold" : BOSS_OF[res.cat] ? "card" : (res.cat === "bell" || res.cat === "replay") ? "mid" : "low";
      const table = (st.upper && R.upper.reward ? R.upper.reward : R.reward);
      const rg = table[tier] || R.reward[tier] || R.reward.low;
      st.bonusTotal = randInt(rng, rg[0], rg[1]);
      res.rolls.push({ label: `報酬等級 ${tier === "gold" ? "金機會牌" : tier === "card" ? "機會牌" : tier === "mid" ? "銅鐘/空掘" : "無"}（${rg[0]}~${rg[1]}轉${st.upper ? "・上位" : ""}）→ ${st.bonusTotal}轉`, info: true, major: true });
      st.bonusLeft = st.bonusTotal; st.bonusShown = false; st.digTaps = 0; st.digShown = 0;
      st.runMaxBonus = Math.max(st.runMaxBonus || 0, st.bonusTotal);
      st.digSeq = buildDigSeq(R, st.bonusTotal, rng);
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

    /* ===== 鏟子：一下一下挖出來（每下 +N，總和一定等於內部決定的轉數） ===== */
    if (st.state === "dig") {
      const seq = st.digSeq || (st.digSeq = buildDigSeq(R, st.bonusTotal, rng));
      const inc = seq[st.digTaps] || 1;
      st.digTaps++;
      st.digShown += inc;
      const last = st.digTaps >= seq.length;
      res.events.push({ t: "dig", inc, shown: st.digShown, tap: st.digTaps, taps: seq.length, last });
      if (last) {
        st.digShown = st.bonusTotal;
        st.bonusShown = true;
        st.state = "bonus";
        res.events.push({ t: "announce", total: st.bonusTotal, how: "shovel" });
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ===== BONUS：純增，只賺錢 ===== */
    if (st.state === "bonus") {
      res.free = false;
      res.cat = rollCat(res, rng, `BONUS（剩${st.bonusLeft}轉）挖到`, R.bonusTable, s, false, forced);
      const qw = R.bonusQty || [1];
      res.qty = res.cat === "rubble" ? 0 : 1 + rollPick(null, rng, "", qw.map((_, i) => String(i + 1)), qw);
      res.pay = payOf(R, res.cat, "bonus") * (res.qty || 1);
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

  /* 鏟子：排出一串 +N，總和一定 = 轉數（v0.10.0）
     設計：大部分是 +1／+2／+3／+5，只有轉數多到小數字補不完時，
     才夾帶幾個「大跳」（+25、+50、+100…）當驚喜，而不是把總數平均切開。 */
  function buildDigSeq(R, total, rng) {
    const D = R.dig || {};
    const smalls = D.incs || [1, 2, 3, 5];
    const sw = D.incWeights || [40, 30, 20, 10];
    const bigs = (D.bigIncs || [10, 25, 50, 100, 200]).slice().sort((a, b) => b - a);
    const maxTaps = D.maxTaps || 30, minTaps = D.minTaps || 6;
    const perTap = D.perTap || 7;
    const pickSmall = () => {
      let x = rng() * sw.reduce((a, b) => a + b, 0), i = 0;
      for (; i < sw.length; i++) if ((x -= sw[i]) < 0) break;
      return smalls[Math.min(i, smalls.length - 1)];
    };
    // 這次大概點幾下
    const taps = Math.max(minTaps, Math.min(maxTaps, Math.round(total / perTap) + minTaps));
    const avgSmall = smalls.reduce((a, v, i) => a + v * sw[i], 0) / sw.reduce((a, b) => a + b, 0);
    // 小數字撐不起來的部分，交給大跳
    let need = total - Math.floor(taps * avgSmall);
    const bigList = [];
    while (need > 0 && bigList.length < 4) {
      const b = bigs.find(v => need >= v * 0.8 && v <= total);
      if (!b) break;
      bigList.push(b); need -= b;
    }
    let smallTotal = total - bigList.reduce((a, b) => a + b, 0);
    if (smallTotal < 0) { bigList.pop(); smallTotal = total - bigList.reduce((a, b) => a + b, 0); }
    // 用小數字把 smallTotal 補完
    const small = [];
    let left = smallTotal;
    const hardMax = maxTaps - bigList.length;
    while (left > 0) {
      if (small.length >= hardMax - 1) { small.push(left); left = 0; break; }
      let inc = pickSmall();
      if (inc > left) inc = left;
      small.push(inc); left -= inc;
    }
    // 把大跳插進去（前 bigAfter 下不會出現，先醞釀）
    const seq = small;
    const after = Math.min(D.bigAfter || 3, seq.length);
    for (const b of bigList) {
      const pos = after + Math.floor(rng() * Math.max(1, seq.length - after + 1));
      seq.splice(Math.min(pos, seq.length), 0, b);
    }
    // 保底下數
    while (seq.length < minTaps && seq.some(v => v > 1)) {
      const i = seq.findIndex(v => v > 1);
      seq[i] -= 1; seq.splice(i, 0, 1);
    }
    return seq.filter(v => v > 0);
  }

  /* 期待度顏色：循序漸進、只升不降。回傳每一轉的顏色（0白 1藍 2黃 3綠 4紅） */
  function buildDateColors(D, len, scene, win, rng) {
    const tw = ((D.colorTarget || {})[win ? "win" : "lose"]) || [20, 20, 20, 20, 20];
    const ceil = (((D.colorCeil || {})[scene] || {})[win ? "win" : "lose"]);
    const cap = ceil === undefined ? 4 : ceil;
    const floor = Math.min(cap, ((D.colorFloor || {})[scene]) || 0);
    // 目標顏色
    let x = rng() * tw.reduce((a, b) => a + b, 0), t = 0;
    for (; t < tw.length; t++) if ((x -= tw[t]) < 0) break;
    const target = Math.min(cap, Math.max(floor, Math.min(t, tw.length - 1)));
    const cols = new Array(len).fill(floor);
    const ups = target - floor;
    if (ups > 0) {
      const startAt = Math.min(len - 1, Math.floor(len * (D.colorStartAt || 0.35)));
      const span = Math.max(1, len - startAt);
      const pts = [];
      for (let i = 0; i < ups; i++) pts.push(startAt + Math.floor(rng() * span));
      pts.sort((a, b) => a - b);
      let c = floor;
      for (let i = 0; i < len; i++) {
        while (pts.length && pts[0] <= i) { pts.shift(); c = Math.min(target, c + 1); }
        cols[i] = c;
      }
    }
    cols[len - 1] = target;            // 最後一轉一定是這場的最高點
    return cols;
  }

  function startDate(R, st, boss, s, rng, res, forceWin) {
    st.state = "date"; st.dateBoss = boss; st.dateStep = 0;
    st.sinceAt = 0;                 // 談話一開始就重置天井計數
    const D = R.date;
    const moodUp = (st.mood && st.mood === boss) ? ((R.mood || {}).bonus || 0) : 0;
    /* v0.10.0：通過率是該前輩的固定值，好感度只決定「會不會被找」，不再影響通過率 */
    const p = Math.min(1, need(R, boss, "date")[s] + moodUp);
    st.dateWin = roll(res, rng, `約會（${bossName(R, boss)}・通過率${Math.round(p * 100)}%${moodUp ? "・今日心情+" + Math.round(moodUp * 100) + "%" : ""}）→ 成功`, p, true);
    if (forceWin !== undefined) st.dateWin = !!forceWin;

    /* 劇本：結果已經定案，這裡只決定「用哪一套演出」
       normal＝礦坑內談話、strong＝外出、hot＝激熱。失敗時也抽得到，只是機率低很多。 */
    const sc = ((D.scene || {})[st.dateWin ? "win" : "lose"]) || {};
    let scene = "normal";
    if (roll(res, rng, "激熱演出", sc.hot || 0, true)) scene = "hot";
    else if (roll(res, rng, "外出演出", sc.strong || 0, true)) scene = "strong";
    st.dateScene = scene;

    // 長度：一般 5～15 轉；會過時有機率改用「違和感長度」（1～2 或 20～30，出現就是確定過關）
    let odd = false;
    if (st.dateWin && roll(res, rng, "違和感長度（出現＝確定過關）", (D.oddChance || [0])[s] || 0, true)) {
      odd = true;
      st.dateSteps = rng() < 0.5 ? randInt(rng, D.shortLen[0], D.shortLen[1]) : randInt(rng, D.longLen[0], D.longLen[1]);
    } else {
      st.dateSteps = randInt(rng, D.steps[0], D.steps[1]);
    }
    st.dateOdd = odd;
    st.dateColors = buildDateColors(D, st.dateSteps, scene, st.dateWin, rng);
    /* 連續被同一個人拒絕 → 彩蛋台詞 */
    st.dateAgain = st.lastRejected === boss;

    res.rolls.push({ label: `談話長度 ${st.dateSteps} 轉${odd ? "（違和感）" : ""}｜劇本 ${scene === "hot" ? "激熱" : scene === "strong" ? "外出" : "礦坑內"}｜最高期待度 ${["白", "藍", "黃", "綠", "紅"][st.dateColors[st.dateColors.length - 1]]}`, info: true, major: true });
    res.events.push({ t: "dateStart", boss, win: st.dateWin, steps: st.dateSteps, odd, scene, again: st.dateAgain });
  }
  const bossName = (R, id) => (R.bosses.find(b => b.id === id) || {}).name || id;

  // 一轉的收益：礦石名稱 → 基本售價（外部再乘礦坑倍率）
  function oreName(R, cat, phase) {
    // 三組礦石：通常／報酬・ST／BONUS（高價的現金類只在 BONUS 出現）
    const key = phase === "normal" ? "normal" : phase === "bonus" ? "bonus" : "st";
    const g = (R.map || {})[key] || (R.map || {}).st || {};
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
        if (e.t === "stLose") stat.chains.push(e.cleared || 0);
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
