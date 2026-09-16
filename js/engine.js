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

  function newPlayState() {
    return {
      state: "normal", base: "normal", sinceHit: 0,
      chanceLeft: 0, pending: null,          // 連續演出
      zenchoLeft: 0, zenchoType: null,       // 前兆
      fakeLeft: 0,                           // 假前兆
      bonusType: null, bonusLeft: 0, stock: [], chain: 0
    };
  }

  function startBonus(rules, st, type) {
    st.state = "bonus"; st.bonusType = type; st.bonusLeft = rules.bonus.length[type];
  }
  function pickHint(rules, key, rng) {
    const H = rules.hints;
    const rate = key === "fake" ? H.fakeRate : H.rate;
    if (rng() >= rate) return null;
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
    const res = { events: [], stateBefore: st.state, cat: "rubble", omen: 0, omenKey: "normal", hint: null, win: false, toolDrop: false };

    /* ================= AT 中 ================= */
    if (st.state === "bonus") {
      const type = st.bonusType;
      res.bonusType = type;
      res.cat = pickCategory(rules.bonusTable[type], s, rng);
      res.toolDrop = rng() < rules.toolDrop.bonus;
      res.omen = -1; res.omenKey = null;

      if (res.cat === "legend") {
        const B = rules.bonus;
        const last = st.stock[st.stock.length - 1];
        if (last && last.type !== "SBB") {
          // 已確定下一隻 → 抽升格（RB→BB 較易、BB→SBB 較難）
          const p = last.type === "RB" ? B.upgrade.RBtoBB[s] : B.upgrade.BBtoSBB[s];
          if (rng() < p) {
            const from = last.type;
            last.type = last.type === "RB" ? "BB" : "SBB";
            const shown = rng() < B.announceRate;
            if (shown) last.announced = true;
            res.events.push({ t: "upgrade", from, to: last.type, shown });
          }
        } else if (rng() < B.continue[type][s]) {
          const shown = rng() < B.announceRate;
          const next = { type: pickType(rules.bonusDraw.next, rng), announced: shown };
          st.stock.push(next);
          res.events.push({ t: "stock", type: next.type, shown });
        }
      }

      st.bonusLeft--;
      if (st.bonusLeft <= 0) {
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
    res.cat = pickCategory(rules.itemTable, s, rng);
    res.toolDrop = rng() < rules.toolDrop.normal;
    const C = rules.chance;

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
      if (!st.pending) {
        const p = C.base[s] + (res.cat === "epic" ? C.epicAdd[s] : 0) + (res.cat === "legend" ? C.legendAdd[s] : 0);
        if (rng() < p) {
          const table = res.cat === "legend" ? rules.bonusDraw.fromLegend : res.cat === "epic" ? rules.bonusDraw.fromEpic : rules.bonusDraw.first;
          st.pending = pickType(table, rng);
          res.win = true;
        }
      }
      res.omenKey = st.pending ? "chanceWin" : "chanceLose";
      res.hint = st.pending ? pickHint(rules, st.pending, rng) : pickHint(rules, "fake", rng);
      st.chanceLeft--;
      if (st.chanceLeft <= 0) {
        if (st.pending) {
          st.chain = 1;
          res.events.push({ t: "bonusStart", type: st.pending, from: "chance" });
          startBonus(rules, st, st.pending);
        } else {
          res.events.push({ t: "chanceLose" });
          st.state = st.base;
        }
        st.pending = null;
      }
    } else {
      // ---- 通常 / 高確 ----
      const mode = st.state === "koukaku" ? "koukaku" : "normal";
      st.sinceHit++;
      let started = false;

      if (res.cat === "legend") {
        // 金礦（強機會牌）：直擊 → 否則抽連續演出長度
        if (rng() < rules.gold.direct[mode][s]) {
          const type = pickType(rules.bonusDraw.fromLegend, rng);
          st.state = "zencho"; st.zenchoLeft = 1; st.zenchoType = type; st.zenchoFrom = "direct";
          res.win = true; res.events.push({ t: "directWin" });
          res.omenKey = "zencho"; started = true;
        } else {
          const len = 1 + pickWeighted(rules.gold.lenWeights, rng);
          if (len === 1) { res.events.push({ t: "chanceLose", short: true }); }
          else { st.base = mode; st.state = "chance"; st.chanceLeft = len - 1; st.pending = null; res.events.push({ t: "chanceStart", len }); started = true; res.omenKey = "chanceLose"; }
        }
      } else {
        // 紫礦與其他：有機率進入連續演出
        const p = res.cat === "epic" ? rules.purple.chance[mode][s] : rules.other.chance[mode][s];
        if (rng() < p) {
          const len = 2 + pickWeighted(rules.purple.lenWeights, rng);
          st.base = mode; st.state = "chance"; st.chanceLeft = len - 1; st.pending = null;
          res.events.push({ t: "chanceStart", len }); started = true; res.omenKey = "chanceLose";
        }
      }

      if (!started && st.sinceHit >= tenjou) {
        // 天井：進入前兆（不會直接開）
        st.state = "zencho"; st.zenchoLeft = randInt(rng, rules.zencho.min, rules.zencho.max);
        st.zenchoType = pickType(rules.bonusDraw.first, rng); st.zenchoFrom = "tenjou";
        res.win = true; res.events.push({ t: "tenjou" }); res.omenKey = "zencho"; started = true;
      }

      if (!started) {
        if (mode === "normal") {
          if (rng() < rules.koukaku.enter[res.cat][s]) { st.state = "koukaku"; res.events.push({ t: "toKoukaku" }); }
        } else if (rng() < rules.koukaku.drop) st.state = "normal";

        if (st.fakeLeft > 0) {
          st.fakeLeft--; res.omenKey = "fake"; res.hint = pickHint(rules, "fake", rng);
          if (st.fakeLeft === 0) res.events.push({ t: "fakeEnd" });
        } else if (rng() < rules.fakeZencho[mode]) {
          st.fakeLeft = randInt(rng, rules.fakeZencho.min, rules.fakeZencho.max);
          res.omenKey = "fake"; res.events.push({ t: "fakeStart" }); res.hint = pickHint(rules, "fake", rng);
        } else {
          res.omenKey = st.state === "koukaku" ? "koukaku" : "normal";
        }
      } else st.fakeLeft = 0;
    }

    res.omen = pickWeighted(rules.omen[res.omenKey], rng);
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
    const catValue = {}; config.categories.forEach(c => catValue[c.id] = c.value * mine.mult);

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
      const v = catValue[r.cat];
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
      if (r.omen >= 0 && r.omenKey) {
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
