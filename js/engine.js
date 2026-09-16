/* =========================================================
   機率引擎 MineEngine（不碰畫面，只負責「揮一次」的結果）
   遊戲本體和編輯模式的模擬器共用同一份，確保數字一致
   ========================================================= */
(function (root) {
  const CATS = ["rubble", "common", "good", "rare", "epic", "legend"];

  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

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

  function newPlayState() {
    return { state: "normal", zenchoLeft: 0, fakeLeft: 0, veinLeft: 0, sinceHit: 0, chain: 0 };
  }

  /**
   * 揮一次
   * @param rules  config.rules
   * @param setting 1~6
   * @param st  playState（會被直接修改）
   * @returns {cat, omen, events[], stateBefore, stateAfter, win, tenjou, toolDrop}
   */
  function swing(rules, setting, st, rng) {
    rng = rng || Math.random;
    const s = Math.min(5, Math.max(0, setting - 1));
    const res = { events: [], stateBefore: st.state, win: false, tenjou: false, toolDrop: false };
    let omenKey = "normal";

    if (st.state === "vein") {
      // ---- 礦脈（AT）中 ----
      res.cat = pickCategory(rules.veinTable, s, rng);
      res.toolDrop = rng() < rules.toolDrop.vein;
      st.veinLeft--;
      omenKey = null;
      if (st.veinLeft <= 0) {
        if (rng() < rules.vein.continue[s]) {
          st.veinLeft = rules.vein.length; st.chain++;
          res.events.push("veinContinue");
        } else {
          st.state = "normal"; st.sinceHit = 0; st.chain = 0;
          res.events.push("veinEnd");
        }
      }
    } else {
      // ---- 通常 / 高確 / 前兆 ----
      res.cat = pickCategory(rules.itemTable, s, rng);
      res.toolDrop = rng() < rules.toolDrop.normal;

      if (st.state === "zencho") {
        st.zenchoLeft--;
        omenKey = "zencho";
        if (st.zenchoLeft <= 0) {
          st.state = "vein"; st.veinLeft = rules.vein.length; st.chain = 1;
          res.events.push("veinStart");
        }
      } else {
        const table = rules.veinWin[st.state === "koukaku" ? "koukaku" : "normal"];
        st.sinceHit++;
        if (rng() < table[res.cat][s]) res.win = true;
        if (!res.win && st.sinceHit >= rules.tenjou) { res.win = true; res.tenjou = true; res.events.push("tenjou"); }

        if (res.win) {
          st.state = "zencho"; st.fakeLeft = 0;
          st.zenchoLeft = randInt(rng, rules.zencho.min, rules.zencho.max);
          omenKey = "zencho";
        } else if (st.state === "normal") {
          if (rng() < rules.toKoukaku[res.cat][s]) { st.state = "koukaku"; res.events.push("toKoukaku"); }
        } else if (st.state === "koukaku") {
          if (rng() < rules.koukakuDrop) st.state = "normal";
        }

        if (!res.win) {
          if (st.fakeLeft > 0) {
            st.fakeLeft--; omenKey = "fake";
            if (st.fakeLeft === 0) res.events.push("fakeEnd");
          } else if (rng() < rules.fakeZencho[st.state === "koukaku" ? "koukaku" : "normal"]) {
            st.fakeLeft = randInt(rng, rules.fakeZencho.min, rules.fakeZencho.max); omenKey = "fake";
          } else {
            omenKey = st.state === "koukaku" ? "koukaku" : "normal";
          }
        }
      }
    }

    res.omen = omenKey ? pickWeighted(rules.omen[omenKey], rng) : -1; // -1 = 礦脈中
    res.omenKey = omenKey;
    res.stateAfter = st.state;
    return res;
  }

  /**
   * 模擬器：跑 n 揮，回傳統計（給編輯模式與脈絡文件用）
   * 機械割 = 賣礦總收入 ÷ 工具花費（以同階工具的「價格÷耐久」計）
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
      swings: n, hits: 0, tenjou: 0, veinSwings: 0, chains: [], cats: {}, income: 0,
      toolDrops: 0, veinIncome: 0, epicNormal: 0, omen: rules.omen.names.map(() => ({ shown: 0, real: 0 }))
    };
    CATS.forEach(c => stat.cats[c] = 0);
    let curChain = 0;

    for (let i = 0; i < n; i++) {
      const r = swing(rules, setting, st, rng);
      stat.cats[r.cat]++;
      stat.income += catValue[r.cat];
      if (r.stateBefore === "vein") stat.veinIncome += catValue[r.cat];
      else if (r.cat === "epic") stat.epicNormal++;
      if (r.toolDrop) stat.toolDrops++;
      if (r.stateBefore === "vein") stat.veinSwings++;
      if (r.win) { stat.hits++; if (r.tenjou) stat.tenjou++; }
      if (r.events.includes("veinStart")) curChain = 1;
      if (r.events.includes("veinContinue")) curChain++;
      if (r.events.includes("veinEnd")) { stat.chains.push(curChain); curChain = 0; }

      if (r.omen >= 0) {
        stat.omen[r.omen].shown++;
        if (r.omenKey === "zencho") stat.omen[r.omen].real++;
      }
    }
    // 工具掉落：同階機率 sameTier，否則平均分給較低階；價值 = 價格 × 平均剩餘耐久
    const td = rules.toolDrop, avgDur = (td.minDur + td.maxDur) / 2;
    const lower = config.tools.filter(t => t.tier < mine.tier);
    const lowerAvg = lower.length ? lower.reduce((a, t) => a + t.price, 0) / lower.length : tool.price;
    const dropValue = (lower.length ? td.sameTier * tool.price + (1 - td.sameTier) * lowerAvg : tool.price) * avgDur;
    stat.toolIncome = stat.toolDrops * dropValue;
    stat.income += stat.toolIncome;
    stat.cost = n * costPerSwing;
    stat.rtp = stat.income / stat.cost;
    stat.hitRate = stat.hits ? (n - stat.veinSwings) / stat.hits : Infinity; // 1/x（不含礦脈中）
    stat.avgChain = stat.chains.length ? stat.chains.reduce((a, b) => a + b, 0) / stat.chains.length : 0;
    stat.epicRate = stat.epicNormal ? (n - stat.veinSwings) / stat.epicNormal : Infinity;
    stat.veinIncomeShare = stat.veinIncome / Math.max(1, stat.income);
    return stat;
  }

  const api = { CATS, swing, simulate, newPlayState, pickWeighted, randInt };
  root.MineEngine = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
