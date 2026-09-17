/* =========================================================
   機率引擎 MineEngine v2（不碰畫面，只負責「揮一次」的結果）
   遊戲本體與編輯模式的模擬器共用同一份
   ---------------------------------------------------------
   狀態：
     normal   通常
     koukaku  高確
     chance   連續演出（發展）1～5 揮
     zencho   前兆（天井 / 金礦直擊 → AT 前）
     bonus    AT（RB / BB / SBB）
   ========================================================= */
(function (root) {
  const CATS = ["rubble", "common", "good", "rare", "epic", "legend"];
  const TYPES = ["RB", "BB", "SBB"];

  const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  function pickCategory(table, s, rng) {
    let r = rng(), acc = 0;
    for (const c of ["legend", "epic", "rare", "good", "common"]) {
      acc += table[c][s];
      if (r < acc) return c;
    }
    return "rubble";
  }
  function pickWeighted(weights, rng) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) { if ((r -= weights[i]) < 0) return i; }
    return 0;
  }
  const pickType = (w, rng) => TYPES[pickWeighted(TYPES.map(t => w[t] || 0), rng)];

  /* ---------- 抽選紀錄（測試用：顯示每次抽選的機率與抽出的數字） ---------- */
  const CAT_NAME = { rubble: "碎石", common: "普通", good: "綠", rare: "藍", epic: "紫", legend: "金" };
  function denom(p) { let D = 100; while (D < 1e8 && Math.abs(p * D - Math.round(p * D)) > 1e-7) D *= 10; return D; }
  // 機率抽選：p 例如 0.3 → 在 1~100 抽一個數字，≤30 當選
  function roll(res, rng, label, p, major) {
    const r = rng(), hit = r < p;
    if (res) { const D = denom(p); res.rolls.push({ label, p, D, n: Math.floor(r * D) + 1, need: Math.round(p * D), hit, major: !!major || hit }); }
    return hit;
  }
  // 權重抽選：例如 RB60/BB39/SBB1 → 在 1~100 抽一個數字
  function rollPick(res, rng, label, names, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    const r = rng(); let x = r * total, i = 0;
    for (; i < weights.length; i++) { if ((x -= weights[i]) < 0) break; }
    if (i >= weights.length) i = weights.length - 1;
    if (res) {
      let lo = 1; const ranges = names.map((nm, k) => { const hi = lo + weights[k] - 1; const t = `${nm} ${lo}~${hi}`; lo = hi + 1; return weights[k] > 0 ? t : null; }).filter(Boolean);
      res.rolls.push({ label, pick: true, total, n: Math.floor(r * total) + 1, result: names[i], ranges, major: true });
    }
    return i;
  }
  // 小役抽選紀錄（每揮抽出的礦石）
  function rollCat(res, rng, label, table, s, major) {
    const order = ["legend", "epic", "rare", "good", "common"];
    const r = rng(); let acc = 0, cat = "rubble";
    for (const c of order) { acc += table[c][s]; if (r < acc) { cat = c; break; } }
    if (res) {
      const D = Math.min(1e6, Math.max(...order.map(c => denom(table[c][s]))));
      let lo = 1; const ranges = [];
      for (const c of order) { const w = Math.round(table[c][s] * D); if (w > 0) { ranges.push(`${CAT_NAME[c]} ${lo}~${lo + w - 1}`); lo += w; } }
      if (lo <= D) ranges.push(`碎石 ${lo}~${D}`);
      res.rolls.push({ label, pick: true, total: D, n: Math.floor(r * D) + 1, result: CAT_NAME[cat], ranges, major: !!major });
    }
    return cat;
  }
  const rollType = (res, rng, label, w) => TYPES[rollPick(res, rng, label, TYPES, TYPES.map(t => w[t] || 0))];

  function newPlayState() {
    return {
      state: "normal", base: "normal", sinceHit: 0,
      chanceLeft: 0, pending: null,          // 連續演出（chanceLeft = 還剩幾回合）
      chanceRounds: 0, chanceIdx: 0, chanceWin: false, chanceLevel: 0,
      chanceColors: [], chanceColor: 0, chanceFake: false, reviveType: null,
      zenchoLeft: 0, zenchoType: null,       // 前兆
      fakeLeft: 0,                           // 假前兆
      bonusType: null, bonusLeft: 0, stock: [], chain: 0,
      rbLeft: -1, rbOn: false                // 彩色演出（確定 SBB）倒數
    };
  }

  /* ---------- 連續演出（v0.5）：進入時決定回合數、結果、顏色路線 ---------- */
  const CHANCE_TRIG_TABLE = { gold: "fromLegend", purple: "fromEpic", other: "first" };
  function chanceWinP(C, level, s) { return (C.winRate["r" + Math.min(5, Math.max(1, level))] || C.winRate.r1)[s]; }
  // 顏色路線：只升不降，最後一回合的顏色由「會不會通關」決定
  function buildColorPath(C, rounds, win, rng, floor) {
    const final = Math.max(floor || 0, pickWeighted(win ? C.colorWin : C.colorLose, rng));
    let start = Math.min(final, Math.max(floor || 0, pickWeighted(C.colorStart, rng)));
    const path = [start];
    for (let i = 1; i < rounds; i++) {
      const prev = path[i - 1];
      const left = rounds - 1 - i;             // 之後還有幾回合
      // 隨機往上爬，保證最後一回合到達 final
      const v = i === rounds - 1 ? final : prev + Math.floor(rng() * (final - prev + 1) / (left + 1));
      path.push(Math.max(prev, Math.min(final, v)));
    }
    path[rounds - 1] = final;
    return path;
  }
  function startChance(rules, st, s, trigger, rng, res, mode) {
    const C = rules.chance;
    const rounds = 1 + rollPick(res, rng, `${trigger === "gold" ? "金礦" : trigger === "purple" ? "紫礦" : "其他"}→演出回合數`,
      ["1回合", "2回合", "3回合", "4回合", "5回合"], C.lenWeights[trigger] || C.lenWeights.other);
    st.base = mode; st.state = "chance";
    st.chanceRounds = rounds; st.chanceIdx = 0; st.chanceLevel = rounds;
    st.chanceColor = 0; st.chanceTrig = trigger; st.pending = null; st.chanceFake = false;
    const win = roll(res, rng, `${rounds}回合→通關抽選`, chanceWinP(C, rounds, s), true);
    st.chanceWin = win;
    if (win) {
      st.pending = rollType(res, rng, "當選種類", rules.bonusDraw.first);
      setRainbow(rules, st, st.pending, rounds, rng, res);
      st.chanceFake = roll(res, rng, "先演失敗→下一揮復活", (C.revive || {}).fakeLose || 0, true);
      res.win = true;
    }
    st.chanceColors = buildColorPath(C, rounds, win, rng, 0);
    res.events.push({ t: "chanceStart", len: rounds });
    return rounds;
  }
  // 演出中挖到機會牌 → 升格（顏色下限提高；還沒通關的話重抽）
  function chanceUpgrade(rules, st, s, cat, rng, res) {
    const C = rules.chance;
    let floor = 0, upped = false;
    if (cat === "legend") {
      floor = C.upFloorLegend;
      if (!st.chanceWin) {
        res.rolls.push({ label: "演出中金礦（強機會牌）→ 直接通關", p: 1, D: 100, n: 1, need: 100, hit: true, major: true });
        st.chanceWin = true;
        st.pending = rollType(res, rng, "當選種類", rules.bonusDraw.fromLegend);
        setRainbow(rules, st, st.pending, st.chanceRounds - st.chanceIdx + 1, rng, res);
        res.win = true; st.chanceFake = false;
      }
      upped = true;
    } else if (cat === "epic") {
      const before = st.chanceLevel;
      st.chanceLevel = Math.min(5, st.chanceLevel + (C.upEpic || 1));
      floor = C.upFloorEpic;
      if (!st.chanceWin && st.chanceLevel > before) {
        const p0 = chanceWinP(C, before, s), p1 = chanceWinP(C, st.chanceLevel, s);
        const add = p1 > p0 ? (p1 - p0) / (1 - p0) : 0;
        if (roll(res, rng, `演出中紫礦（機會牌）→升格重抽（${Math.round(p0 * 100)}%→${Math.round(p1 * 100)}%）`, add, true)) {
          st.chanceWin = true;
          st.pending = rollType(res, rng, "當選種類", rules.bonusDraw.fromEpic);
          setRainbow(rules, st, st.pending, st.chanceRounds - st.chanceIdx + 1, rng, res);
          res.win = true;
          st.chanceFake = roll(res, rng, "先演失敗→下一揮復活", (C.revive || {}).fakeLose || 0, true);
        }
      }
      upped = true;
    }
    if (upped) {
      // 剩下的回合重新排顏色（含下限），且不低於目前顏色
      const left = st.chanceRounds - st.chanceIdx;
      if (left > 0) {
        const path = buildColorPath(C, left, st.chanceWin, rng, Math.max(floor, st.chanceColor));
        st.chanceColors = st.chanceColors.slice(0, st.chanceIdx).concat(path);
      }
      res.events.push({ t: "chanceUp", cat });
    }
    return upped;
  }

  function startBonus(rules, st, type) {
    st.state = "bonus"; st.bonusType = type; st.bonusLeft = rules.bonus.length[type];
  }
  // 抽到 SBB 時，以 sbbRainbow 機率決定「之後某一揮突然變彩色」
  function setRainbow(rules, st, type, remaining, rng, res) {
    st.rbOn = false;
    st.rbLeft = (type === "SBB" && roll(res, rng, "星辰礦脈→彩色演出", rules.omen.sbbRainbow, true)) ? randInt(rng, 0, Math.max(0, remaining - 1)) : -1;
  }
  // 違和感 = 確定演出：只在「已確定當選 AT」或「已確定連莊（尚未告知）」時出現
  function pickHint(rules, key, rng) {
    const H = rules.hints;
    if (!key || !H.weights[key] || rng() >= H.rate) return null;
    return H.ids[pickWeighted(H.weights[key], rng)];
  }

  /**
   * 揮一次
   * @param rules config.rules
   * @param setting 1~6
   * @param st playState（直接修改）
   * @param tenjou 此副本的天井揮數
   */
  function swing(rules, setting, st, rng, tenjou) {
    rng = rng || Math.random;
    tenjou = tenjou || 800;
    const s = Math.min(5, Math.max(0, setting - 1));
    const res = { rolls: [], events: [], stateBefore: st.state, cat: "rubble", omen: 0, omenKey: "normal", hint: null, win: false, toolDrop: false };

    /* ================= AT 中 ================= */
    if (st.state === "bonus") {
      const type = st.bonusType;
      res.bonusType = type;
      res.cat = rollCat(res, rng, `礦脈中（${type} 剩${st.bonusLeft}揮）挖到`, rules.bonusTable[type], s, true);
      res.toolDrop = rng() < rules.toolDrop.bonus;
      res.omen = -1; res.omenKey = null;

      if (res.cat === "legend") {
        const B = rules.bonus;
        const last = st.stock[st.stock.length - 1];
        if (last && last.type !== "SBB") {
          // 已確定下一隻 → 抽升格（RB→BB 較易、BB→SBB 較難）
          const p = last.type === "RB" ? B.upgrade.RBtoBB[s] : B.upgrade.BBtoSBB[s];
          if (roll(res, rng, `礦脈中金礦→升格 ${last.type}→${last.type === "RB" ? "BB" : "SBB"}`, p, true)) {
            const from = last.type;
            last.type = last.type === "RB" ? "BB" : "SBB";
            const shown = roll(res, rng, "升格→當下告知", B.announceRate);
            if (shown) last.announced = true;
            res.events.push({ t: "upgrade", from, to: last.type, shown });
          }
        }
      }
      // 每一揮都抽「延伸」：還沒確定下一隻時才抽；基本機率＋挖到稀有礦的加成
      // 連到第 boostAfter 隻（含）之後改用 high 表（通過率大幅提升、稀有礦影響更高）
      if (!st.stock.length) {
        const CT = rules.bonus.cont, hi = st.chain >= CT.boostAfter, T = hi ? CT.high : CT.low;
        const p = Math.min(1, T.base[type][s] + ((T.add[res.cat] || [])[s] || 0));
        if (roll(res, rng, `礦脈延伸抽選（第${st.chain}隻 ${type}${hi ? "・加強" : ""}，挖到${CAT_NAME[res.cat]}）`, p, true)) {
          const B = rules.bonus;
          const shown = roll(res, rng, "延伸→當下告知", B.announceRate);
          const next = { type: rollType(res, rng, "延伸的下一隻", rules.bonusDraw.next), announced: shown };
          st.stock.push(next);
          res.events.push({ t: "stock", type: next.type, shown });
        }
      }

      // 有尚未告知的連莊 → 可能出現違和感（確定連莊）
      const hidden = st.stock.find(x => !x.announced);
      if (hidden) res.hint = pickHint(rules, hidden.type, rng);

      st.bonusLeft--;
      if (st.bonusLeft <= 0) {
        res.rolls.push({ label: `礦脈最後一揮：已確定延伸 ${st.stock.length} 隻` + (st.stock.length ? `（下一隻 ${st.stock[0].type}）→ 延伸` : " → 結束"), info: true, major: true });
        if (st.stock.length) {
          const next = st.stock.shift();
          st.chain++;
          res.events.push({ t: "bonusChain", type: next.type, surprise: !next.announced });
          startBonus(rules, st, next.type);
        } else {
          res.events.push({ t: "bonusEnd", chain: st.chain });
          st.state = "normal"; st.base = "normal"; st.sinceHit = 0; st.chain = 0; st.bonusType = null;
        }
      }
      res.stateAfter = st.state;
      return res;
    }

    /* ================= 通常 / 高確 / 連續演出 / 前兆 ================= */
    res.cat = rollCat(res, rng, "挖到", rules.itemTable, s, false);
    res.toolDrop = rng() < rules.toolDrop.normal;
    const C = rules.chance;

    if (st.state === "revive") {
      // 復活：上一揮演成失敗，這一揮拉回
      const type = st.reviveType;
      st.reviveType = null; st.chain = 1;
      res.rolls.push({ label: `復活演出：已確定當選 ${type}`, info: true, major: true });
      res.events.push({ t: "revive", type });
      res.events.push({ t: "bonusStart", type, from: "revive" });
      res.omenKey = "zencho"; res.win = true;
      st.pending = type;
      setRainbow(rules, st, type, 1, rng, res);
      startBonus(rules, st, type);
      st.pending = null;
      res.omen = st.rbOn || st.rbLeft === 0 ? 5 : 6;   // 6 = 金（復活專用）；已排定彩色時才是彩色
      res.inOmen = true;
      res.stateAfter = st.state;
      return res;
    }

    if (st.state === "zencho") {
      st.zenchoLeft--;
      res.omenKey = "zencho";
      res.hint = pickHint(rules, st.zenchoType, rng);
      if (st.zenchoLeft <= 0) {
        st.chain = 1;
        res.events.push({ t: "bonusStart", type: st.zenchoType, from: st.zenchoFrom });
        startBonus(rules, st, st.zenchoType);
        st.zenchoType = null;
      }
    } else if (st.state === "chance") {
      st.sinceHit++;
      const C = rules.chance;
      st.chanceIdx++;
      if (res.cat === "epic" || res.cat === "legend") chanceUpgrade(rules, st, s, res.cat, rng, res);
      // 顏色：只升不降
      const want = st.chanceColors[st.chanceIdx - 1] ?? st.chanceColor;
      const up = st.chanceIdx > 1 && want > st.chanceColor;
      st.chanceColor = Math.max(st.chanceColor, want);
      res.omen = st.chanceColor; res.omenKey = "chance";
      res.chanceRound = { idx: st.chanceIdx, total: st.chanceRounds, color: st.chanceColor, up };
      if (up && roll(res, rng, "顏色升級→額外一句", C.upLineRate)) res.chanceRound.upLine = true;
      res.hint = st.pending && !st.chanceFake ? pickHint(rules, st.pending, rng) : null;
      st.chanceLeft = st.chanceRounds - st.chanceIdx;
      if (st.chanceIdx >= st.chanceRounds) {
        if (st.chanceWin && !st.chanceFake) {
          st.chain = 1;
          res.events.push({ t: "bonusStart", type: st.pending, from: "chance" });
          startBonus(rules, st, st.pending);
          st.pending = null;
        } else if (st.chanceWin && st.chanceFake) {
          // 先演失敗，下一揮復活
          res.events.push({ t: "chanceLose", fake: true });
          st.reviveType = st.pending; st.state = "revive"; st.pending = null;
        } else {
          res.events.push({ t: "chanceLose" });
          st.state = st.base; st.pending = null;
        }
      }
    } else {
      // ---- 通常 / 高確 ----
      const mode = st.state === "koukaku" ? "koukaku" : "normal";
      st.sinceHit++;
      let started = false;

      if (res.cat === "legend") {
        // 金礦（強機會牌）：直擊 → 否則抽連續演出長度
        if (roll(res, rng, `金礦→直擊（${mode === "koukaku" ? "高確" : "通常"}）`, rules.gold.direct[mode][s], true)) {
          const type = rollType(res, rng, "當選種類", rules.bonusDraw.fromLegend);
          st.state = "zencho"; st.zenchoLeft = 1; st.zenchoType = type; st.zenchoFrom = "direct";
          setRainbow(rules, st, type, 2, rng, res);
          res.win = true; res.events.push({ t: "directWin" });
          res.omenKey = "zencho"; started = true;
        } else {
          startChance(rules, st, s, "gold", rng, res, mode);
          started = true; res.omenKey = "chanceEnter";
        }
      } else {
        // 紫礦與其他：有機率進入連續演出
        const p = res.cat === "epic" ? rules.purple.chance[mode][s] : rules.other.chance[mode][s];
        if (roll(res, rng, `${CAT_NAME[res.cat]}→連續演出（${mode === "koukaku" ? "高確" : "通常"}）`, p, res.cat === "epic")) {
          startChance(rules, st, s, res.cat === "epic" ? "purple" : "other", rng, res, mode);
          started = true; res.omenKey = "chanceEnter";
        }
      }

      if (!started && st.sinceHit >= tenjou) {
        // 天井：進入前兆（不會直接開）
        st.state = "zencho"; st.zenchoLeft = randInt(rng, rules.zencho.min, rules.zencho.max);
        res.rolls.push({ label: `天井 ${tenjou} 到達`, p: 1, D: 100, n: 1, need: 100, hit: true, major: true });
        st.zenchoType = rollType(res, rng, "當選種類", rules.bonusDraw.first); st.zenchoFrom = "tenjou";
        setRainbow(rules, st, st.zenchoType, st.zenchoLeft + 1, rng, res);
        res.win = true; res.events.push({ t: "tenjou" }); res.omenKey = "zencho"; started = true;
      }

      if (!started) {
        if (mode === "normal") {
          if (roll(res, rng, `${CAT_NAME[res.cat]}→高確`, rules.koukaku.enter[res.cat][s], res.cat === "rare" || res.cat === "epic")) { st.state = "koukaku"; res.events.push({ t: "toKoukaku" }); }
        } else if (roll(res, rng, "高確→轉落", rules.koukaku.drop)) st.state = "normal";

        if (st.fakeLeft > 0) {
          st.fakeLeft--; res.omenKey = "fake";
          if (st.fakeLeft === 0) res.events.push({ t: "fakeEnd" });
        } else if (roll(res, rng, "假地鳴", rules.fakeZencho[mode])) {
          st.fakeLeft = randInt(rng, rules.fakeZencho.min, rules.fakeZencho.max);
          res.omenKey = "fake"; res.events.push({ t: "fakeStart" });
        } else {
          res.omenKey = st.state === "koukaku" ? "koukaku" : "normal";
        }
      } else st.fakeLeft = 0;
    }

    // 期待度顏色：只在地鳴（前兆／連續演出／假前兆）中抽選；彩色 = 確定 SBB（抽選出現）
    res.inOmen = ["zencho", "chance", "chanceEnter", "fake"].includes(res.omenKey);
    if (!res.inOmen) res.omen = 0;
    else if (res.omenKey === "chance" || res.omenKey === "chanceEnter") {
      if (res.omenKey === "chanceEnter") res.omen = (st.chanceColors || [])[0] || 1;
      if (st.rbLeft === 0) st.rbOn = true; else if (st.rbLeft > 0) st.rbLeft--;
      if (st.rbOn) res.omen = 5;
    } else {
      res.omen = pickWeighted(rules.omen[res.omenKey], rng);
      if (st.rbLeft === 0) st.rbOn = true; else if (st.rbLeft > 0) st.rbLeft--;
      if (st.rbOn) res.omen = 5;
    }
    if (st.state !== "zencho" && st.state !== "chance" && st.state !== "revive") { st.rbLeft = -1; st.rbOn = false; }
    res.stateAfter = st.state;
    return res;
  }

  /**
   * 模擬器：跑 n 揮
   * 機械割 = (礦石價值 + 工具掉落期望價值) ÷ 工具花費（同階工具 價格÷耐久）
   */
  function simulate(config, setting, n, mineIndex, rng) {
    rng = rng || Math.random;
    const rules = config.rules;
    const mine = config.mines[mineIndex || 0];
    const tool = config.tools.find(t => t.tier === mine.tier) || config.tools[0];
    const costPerSwing = tool.price / tool.durability;
    const catValue = {}, veinValue = {};
    config.categories.forEach(c => { catValue[c.id] = c.value * mine.mult; veinValue[c.id] = (c.veinValue ?? c.value) * mine.mult; });

    const st = newPlayState();
    const stat = {
      swings: n, hits: 0, tenjou: 0, direct: 0, fromChance: 0, bonusSwings: 0, income: 0, bonusIncome: 0, toolDrops: 0,
      types: { RB: 0, BB: 0, SBB: 0 }, firstTypes: { RB: 0, BB: 0, SBB: 0 }, chains: [], cats: {}, catsNormal: {},
      chanceStarts: 0, chanceWins: 0,
      omen: rules.omen.names.map(() => ({ shown: 0, real: 0 }))
    };
    CATS.forEach(c => { stat.cats[c] = 0; stat.catsNormal[c] = 0; });

    for (let i = 0; i < n; i++) {
      const r = swing(rules, setting, st, rng, mine.tenjou);
      const v = r.stateBefore === "bonus" ? veinValue[r.cat] : catValue[r.cat];
      stat.cats[r.cat]++; stat.income += v;
      if (r.stateBefore === "bonus") { stat.bonusSwings++; stat.bonusIncome += v; }
      else stat.catsNormal[r.cat]++;
      if (r.toolDrop) stat.toolDrops++;
      for (const e of r.events) {
        if (e.t === "bonusStart") {
          stat.hits++; stat.types[e.type]++; stat.firstTypes[e.type]++;
          if (e.from === "tenjou") stat.tenjou++; else if (e.from === "direct") stat.direct++; else stat.fromChance++;
        }
        if (e.t === "bonusChain") stat.types[e.type]++;
        if (e.t === "bonusEnd") stat.chains.push(e.chain);
        if (e.t === "chanceStart") stat.chanceStarts++;
      }
      if (r.inOmen) {
        stat.omen[r.omen].shown++;
        if (r.omenKey === "zencho" || r.omenKey === "chanceWin") stat.omen[r.omen].real++;
      }
    }
    const td = rules.toolDrop, avgDur = (td.minDur + td.maxDur) / 2;
    const lower = config.tools.filter(t => t.tier < mine.tier);
    const lowerAvg = lower.length ? lower.reduce((a, t) => a + t.price, 0) / lower.length : tool.price;
    const dropValue = (lower.length ? td.sameTier * tool.price + (1 - td.sameTier) * lowerAvg : tool.price) * avgDur;
    stat.income += stat.toolDrops * dropValue;
    stat.cost = n * costPerSwing;
    stat.rtp = stat.income / stat.cost;
    const normalSwings = n - stat.bonusSwings;
    stat.hitRate = stat.hits ? normalSwings / stat.hits : Infinity;
    stat.avgChain = stat.chains.length ? stat.chains.reduce((a, b) => a + b, 0) / stat.chains.length : 0;
    stat.epicRate = stat.catsNormal.epic ? normalSwings / stat.catsNormal.epic : Infinity;
    stat.legendRate = stat.catsNormal.legend ? normalSwings / stat.catsNormal.legend : Infinity;
    stat.bonusIncomeShare = stat.bonusIncome / Math.max(1, stat.income);
    stat.veinIncomeShare = stat.bonusIncomeShare;
    stat.avgBonusSwings = stat.chains.length ? stat.bonusSwings / stat.chains.length : 0;
    return stat;
  }

  const api = { CATS, TYPES, swing, simulate, newPlayState, pickWeighted, randInt };
  root.MineEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
