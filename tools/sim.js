#!/usr/bin/env node
/* =========================================================
   深層礦脈｜模擬報表產生器
   用法：  node tools/sim.js [揮數]        例：node tools/sim.js 1500000
   產出：  docs/02 §8 的每一張表，含再現資訊

   為什麼要有這支：
   §8.3（顏色信賴度）、§8.4（延伸通過率）、§8.6（劇本信賴度）這三張表
   用 engine.simulate() 跑不出來（它不追蹤演出顏色，也不追蹤第二台劇本）。
   以前是用沒進版控的一次性腳本跑的 → 外部驗證者無法複製，錯了也沒人發現。
   2026-09-24 的外部驗證就抓到 §8.3 和 §8.6 兩張表是錯的，原因分別是
   「結算寫在更新顏色之前」和「三位前輩用均勻抽而不是按牌率加權」。
   這支腳本把正確的量測方式固定下來。
   ========================================================= */
const path = require("path");
const ROOT = path.join(__dirname, "..");
const C  = require(path.join(ROOT, "js/config.js"));
const E  = require(path.join(ROOT, "js/engine.js"));
const E2 = require(path.join(ROOT, "js/engine2.js"));
const VER = require("fs").readFileSync(path.join(ROOT, "js/version.js"), "utf8").match(/"([\d.]+)"/)[1];

const HUNT_ONLY = process.argv[2] === "hunt";   // node tools/sim.js hunt [輪數]：只跑 §8.10 冒險狩獵（很快）
const N = HUNT_ONLY ? 1500000 : +(process.argv[2] || 1500000);
const R = C.rules;
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
const HUNT_RUNS = HUNT_ONLY ? +(process.argv[3] || 400000) : Math.max(100000, Math.min(N, 600000));

/* ---------- §8.10 冒險狩獵礦坑（第 7 座，2026-10-08；規格 Claude outputs/新礦坑_冒險狩獵_規格定案v2_2026-10-08.md） ----------
   只跑這一節：node tools/sim.js hunt [輪數，預設 400000]
   ① 精確期望值（不靠亂數）：第一階段單獨回收率、完整遊戲（加上之後階段的巨龍／狹間，參數在 config.hunt.later）回收率。
      完整遊戲要落在規格 3.4 的表值（112.9／116.4／119.4／126.6／134.2／144.6）±1.0，依設定分佈加權 120%±1，設定六減設定一 28～36 點。
      第一階段（只有下位 3 隻怪、沒有巨龍和狹間）單獨回收率很低是預期的，全部不開放，不影響玩家。
   ② 蒙地卡羅：直接驅動 js/mine-hunt.js 的真實狀態機（不是另寫一份模型），驗證入口機率、30 步保底、呈現類型比例、擊倒率、第一階段回收率。
   ③ 餵食：換算只會少不會多（無套利）、多把先加總再捨去、單把換算為 0 不可餵、試用版不可餵、鑽頭 1,380。 */
function huntSection(runs) {
  const MH = require(path.join(ROOT, "js/mine-hunt.js"));
  const H = C.hunt, ST = H.stamina, LW = H.later, dist = R.settingDist;
  let bad = 0;
  const ck = (ok, msg) => { if (!ok) { bad++; console.log(`  ✗ ${msg}`); } return ok; };
  console.log(`\n=== §8.10 冒險狩獵礦坑（${runs.toLocaleString()} 輪／設定）===`);

  // ---- ① 精確期望值 ----
  function expect(S, full) {
    const pDev = S.dev, N0 = H.walk.guarantee, q = 1 - pDev, wMap = 1 - H.walk.caveShare;
    const walk = (1 - Math.pow(q, N0)) / pDev;
    const Q = (1 - wMap) * S.cave + wMap * S.map;
    const K = H.lower.count, k = H.lower.win;
    let stepsL = 0, goldL = 0, reach = 1;
    for (let i = 0; i < K; i++) { stepsL += reach; goldL += reach * k * H.lower.gold; reach *= k; }
    const passL = reach;
    let spent = walk * ST.perStep + ST.countryCost + Q * stepsL * ST.perStep, gold = Q * goldL;
    const out = { walk, Q, passL, stage1: gold / (spent * ST.valuePer), spent1: spent, gold1: gold };
    if (full) {
      const d = LW.dragon, enter = passL * d.win;
      spent += Q * passL * ST.perStep; gold += Q * passL * d.win * d.gold;
      const rnd = (h, cap, w) => { let m = 0; for (let n = 0; n < cap; n++) m += Math.pow(h, n); return { m, gold: m * w, pcap: Math.pow(h, cap - 1) }; };
      const Hv = rnd(LW.heaven.cont, LW.heaven.cap, LW.heaven.gold), Gv = rnd(LW.hell.cont, LW.hell.cap, LW.hell.gold);
      const a = LW.heaven.nextHeaven, b = LW.hell.nextHeaven, ph = Hv.pcap * LW.ember, pg = Gv.pcap * LW.ember;
      const solve = (Hx, Gx) => {
        const A11 = 1 - ph * a, A12 = -ph * (1 - a), A21 = -pg * b, A22 = 1 - pg * (1 - b), det = A11 * A22 - A12 * A21;
        return { Eh: (Hx * A22 - A12 * Gx) / det, Eg: (A11 * Gx - A21 * Hx) / det };
      };
      const st = solve(Hv.m, Gv.m), gd = solve(Hv.gold, Gv.gold), ent = x => LW.entryHeaven * x.Eh + (1 - LW.entryHeaven) * x.Eg;
      spent += Q * enter * ent(st) * ST.perStep; gold += Q * enter * ent(gd);
      out.full = gold / (spent * ST.valuePer);
    }
    return out;
  }
  const EXPECT_FULL = [1.129, 1.164, 1.194, 1.266, 1.342, 1.446];   // 規格 3.4 表值
  const ex = H.settings.map(S => expect(S, true));
  console.log(`  設定｜每步發展率｜平均幾步遇發展｜洞窟成功｜藏寶圖成功｜國度成功合計｜階段1單獨回收率｜完整遊戲回收率（規格表值）`);
  H.settings.forEach((S, i) => console.log(`  ${i + 1}｜${pct(S.dev, 2)}｜${ex[i].walk.toFixed(1)}｜${pct(S.cave)}｜${pct(S.map)}｜${pct(ex[i].Q)}｜${pct(ex[i].stage1)}｜${pct(ex[i].full)}（${pct(EXPECT_FULL[i])}）`));
  const wFull = ex.reduce((a, e, i) => a + e.full * dist[i], 0), wS1 = ex.reduce((a, e, i) => a + e.stage1 * dist[i], 0);
  console.log(`  加權（settingDist）：完整遊戲 ${pct(wFull, 2)}｜階段 1 單獨 ${pct(wS1, 2)}（只有下位 ${H.lower.count} 隻怪，沒有巨龍與狹間，很低是預期的）｜設定六減設定一 ${((ex[5].full - ex[0].full) * 100).toFixed(1)} 點`);
  ex.forEach((e, i) => ck(Math.abs(e.full - EXPECT_FULL[i]) <= 0.01, `設定${i + 1} 完整遊戲回收率 ${pct(e.full)} 與規格表值 ${pct(EXPECT_FULL[i])} 差超過 1.0 點`));
  ck(Math.abs(wFull - 1.20) <= 0.01, `完整遊戲加權回收率 ${pct(wFull, 2)} 不在 120%±1`);
  ck((ex[5].full - ex[0].full) * 100 >= 28 && (ex[5].full - ex[0].full) * 100 <= 36, `設定六減設定一 ${((ex[5].full - ex[0].full) * 100).toFixed(1)} 點不在 28～36`);
  ck(wS1 > 0.05 && wS1 < 0.30, `階段 1 單獨回收率 ${pct(wS1)} 不在合理範圍（5%～30%）`);
  ck(H.settings.every(S => S.dev > 0 && S.dev < 1 && S.cave > 0 && S.cave < 1 && S.map > 0 && S.map < 1), "入口機率必須在 0～1 之間");
  ck(H.settings.length === 6 && dist.length === 6, "每日設定必須 6 種");

  // ---- ② 蒙地卡羅：真實狀態機 ----
  console.log(`  --- 蒙地卡羅（真實 js/mine-hunt.js，每輪：旅途→發展→國度→下位狩獵→凱旋）---`);
  console.log(`  設定｜每步發展率(排除保底)｜洞窟成功｜藏寶圖成功｜單鈕/二選一/三選一｜擊倒率｜最長連續沒發展｜階段1回收率（精確）`);
  let wMc = 0;
  H.settings.forEach((S, si) => {
    const sv = { coins: 0, tools: [], equipped: null, huntMeta: MH.newMeta(), huntRuns: {} };
    sv.huntMeta.stamina = ST.cap;
    const c = { steps: 0, free: 0, freeDev: 0, caveN: 0, caveOk: 0, mapN: 0, mapOk: 0, pres: [0, 0, 0], monN: 0, monWin: 0, streak: 0, maxStreak: 0, gold: 0, spent: 0 };
    for (let n = 0; n < runs; n++) {
      MH.run(sv, H);
      const before = sv.huntMeta.stamina;
      for (let guard = 0; guard < 200; guard++) {
        const r = MH.peek(sv, H);
        if (r.phase === "walk") {
          const since = r.since, res = MH.step(sv, H, { setting: si + 1 });
          if (!res.ok) { ck(false, "走路失敗：" + res.reason); break; }
          c.steps++; c.streak++;
          if (since < H.walk.guarantee - 1) { c.free++; if (res.ev === "dev") c.freeDev++; }
          if (res.ev === "dev") { c.maxStreak = Math.max(c.maxStreak, c.streak); c.streak = 0; const kd = MH.peek(sv, H); if (kd.dev.kind === "cave") { c.caveN++; if (kd.country.ok) c.caveOk++; } else { c.mapN++; if (kd.country.ok) c.mapOk++; } }
        } else if (r.phase === "dev") MH.enterCountry(sv, H);
        else if (r.phase === "country") { MH.pickCountry(sv, H, 0); MH.afterCountry(sv, H); }
        else if (r.phase === "hunt") {
          if (r.mon) { c.monN++; if (r.mon.win) c.monWin++; c.pres[r.mon.pres]++; MH.strike(sv, H, 0); MH.finishAnim(sv, H, MH.peek(sv, H).anim.rid); }
          else { ck(false, "狩獵中沒有怪物"); break; }
        } else if (r.phase === "done") { c.gold += r.last.gold; MH.again(sv, H); break; }
      }
      c.spent += before - sv.huntMeta.stamina;
    }
    const mcRtp = c.gold / (c.spent * ST.valuePer);
    wMc += mcRtp * dist[si];
    const totP = c.pres[0] + c.pres[1] + c.pres[2];
    console.log(`  ${si + 1}｜${pct(c.freeDev / c.free, 2)}（${pct(S.dev, 2)}）｜${pct(c.caveOk / c.caveN)}（${pct(S.cave)}）｜${pct(c.mapOk / c.mapN)}（${pct(S.map)}）｜${c.pres.map(x => pct(x / totP, 0)).join("/")}｜${pct(c.monWin / c.monN)}｜${c.maxStreak} 步｜${pct(mcRtp)}（${pct(ex[si].stage1)}）`);
    ck(Math.abs(c.freeDev / c.free - S.dev) <= 0.003, `設定${si + 1} 每步發展率實測 ${pct(c.freeDev / c.free, 2)} 與設定值 ${pct(S.dev, 2)} 差超過 0.3 點`);
    ck(Math.abs(c.caveOk / c.caveN - S.cave) <= 0.005, `設定${si + 1} 洞窟國度成功率實測 ${pct(c.caveOk / c.caveN)} 與設定值差超過 0.5 點`);
    ck(Math.abs(c.mapOk / c.mapN - S.map) <= 0.01, `設定${si + 1} 藏寶圖國度成功率實測 ${pct(c.mapOk / c.mapN)} 與設定值差超過 1 點（樣本較少）`);
    ck(Math.abs(c.mapN / (c.mapN + c.caveN) - (1 - H.walk.caveShare)) <= 0.005, `設定${si + 1} 藏寶圖占比與設定值差超過 0.5 點`);
    ck(c.maxStreak <= H.walk.guarantee, `設定${si + 1} 連續 ${c.maxStreak} 步沒遇到發展，超過保底 ${H.walk.guarantee}`);
    H.present.forEach((p, k) => ck(Math.abs(c.pres[k] / totP - p) <= 0.01, `設定${si + 1} 呈現類型 ${k} 實測 ${pct(c.pres[k] / totP)} 與設定值 ${pct(p)} 差超過 1 點`));
    ck(Math.abs(c.monWin / c.monN - H.lower.win) <= 0.005, `設定${si + 1} 擊倒率實測 ${pct(c.monWin / c.monN)} 與設定值差超過 0.5 點`);
    ck(Math.abs(mcRtp - ex[si].stage1) <= 0.01, `設定${si + 1} 階段 1 回收率實測 ${pct(mcRtp)} 與精確值 ${pct(ex[si].stage1)} 差超過 1 點`);
  });
  console.log(`  階段 1 單獨加權回收率（蒙地卡羅）${pct(wMc, 2)}（精確 ${pct(wS1, 2)}）`);
  // 打進去之後的機率與設定無關：第一階段只有「下位擊倒率」，固定寫在 config.hunt.lower；每日設定只能有入口三個欄位
  ck(H.settings.every(S => Object.keys(S).sort().join() === "cave,dev,map"), "每日設定只能有 dev／cave／map 三個入口欄位（打進去之後不隨設定變）");

  // ---- ③ 餵食換算 ----
  console.log(`  --- 餵食（1 體力＝${ST.valuePer} 金幣的鎬子價值，無條件捨去，無套利）---`);
  const defOf = id => C.tools.find(t => t.id === id);
  const WANT = { wood: 18, stone: 55, iron: 133, gold: 275, diamond: 608, redrock: ST.drillTotal };
  const fresh = id => { const d = defOf(id); return { uid: 1, id, dur: d.durability, max: d.durability }; };
  const feedN = tools => MH.feedPreview({ tools }, H, defOf, tools.map(t => t.uid)).n;
  console.log("  滿耐久：" + Object.keys(WANT).map(id => `${defOf(id).name} ${feedN([fresh(id)])}`).join("｜"));
  Object.keys(WANT).forEach(id => ck(feedN([fresh(id)]) === WANT[id], `${defOf(id).name} 滿耐久應為 ${WANT[id]} 體力，實際 ${feedN([fresh(id)])}`));
  ck(WANT.redrock === 1380, "鑽頭應為 1,380 體力");
  ck(!MH.feedable(H, defOf("redrockTrial"), fresh("redrockTrial")).ok, "試用版鑽頭不可餵");
  // 無套利：任何耐久、任何組合，換到的體力 × 6 都不超過精確價值；多把先加總再捨去（≥ 各自捨去的總和）
  let arbBad = 0, multiBad = 0;
  const ids = ["wood", "stone", "iron", "gold", "diamond", "redrock"];
  ids.forEach(id => {
    const d = defOf(id), per = d.price ? d.price / d.durability : ST.drillTotal * ST.valuePer / d.durability;
    for (let dur = 1; dur <= d.durability; dur++) {
      const t = { uid: 1, id, dur, max: d.durability }, f = MH.feedable(H, d, t);
      if (f.ok && f.n * ST.valuePer > dur * per + 1e-6) arbBad++;
      if (!f.ok && dur * per / ST.valuePer >= 1) arbBad++;
    }
  });
  for (let k = 0; k < 20000; k++) {
    const cnt = 1 + Math.floor(Math.random() * 6), tools = [];
    for (let j = 0; j < cnt; j++) { const id = ids[Math.floor(Math.random() * ids.length)], d = defOf(id); tools.push({ uid: j + 1, id, dur: 1 + Math.floor(Math.random() * d.durability), max: d.durability }); }
    const okTools = tools.filter(t => MH.feedable(H, defOf(t.id), t).ok);
    const exact = okTools.reduce((a, t) => a + MH.feedExact(H, defOf(t.id), t), 0), singles = okTools.reduce((a, t) => a + MH.feedable(H, defOf(t.id), t).n, 0);
    const all = MH.feedPreview({ tools: okTools }, H, defOf, okTools.map(t => t.uid)).n;
    if (all > exact + 1e-6 || all < singles) multiBad++;
  }
  ck(arbBad === 0, `餵食換算有 ${arbBad} 個耐久值會多拿體力或誤判不可餵`);
  ck(multiBad === 0, `多把一起餵有 ${multiBad} 組不符合「先加總再捨去、不超過精確值」`);
  ck(!MH.feedable(H, defOf("wood"), { uid: 1, id: "wood", dur: 3, max: 60 }).ok, "耐久 3 的木鎬（換算 0.55 體力）應為不可餵");
  console.log(bad ? `  ⚠️ §8.10 共 ${bad} 項不合格` : `  ✓ §8.10：入口機率／保底／呈現比例／擊倒率／完整遊戲回收率（加權 ${pct(wFull, 2)}）／餵食無套利 全部正確`);
  if (bad) process.exitCode = 1;
}
if (HUNT_ONLY) { console.log("深層礦脈 模擬報表（只跑 §8.10）｜gameVersion " + VER); huntSection(HUNT_RUNS); process.exit(process.exitCode || 0); }

console.log(`深層礦脈 模擬報表`);
console.log(`gameVersion ${VER}｜iterations ${N.toLocaleString()}｜date ${new Date().toISOString().slice(0, 10)}｜rng Math.random（未固定 seed）`);

/* ---------- §8.1 第一台（m1，木鎬） ----------
   指標定義（來自 engine.js 的 simulate()）：
     機械割  = stat.rtp     = 礦石收入 ÷ 工具花費
     初當    = stat.hitRate = (總揮數 − AT揮數) ÷ 初當次數   ← 分母是「AT 外揮數」
     紫/金礦 = stat.epicRate / legendRate，分母同樣是 AT 外揮數
   ⚠️ simulate() 不模擬礦石碎裂（toolFactor 只存在於 game.js），
      所以這是「工具剛好匹配」的上界。                                    */
console.log(`\n=== §8.1 第一台（m1 淺層洞窟，木鎬）===`);
console.log(`設定 | 機械割 | 初當 | 平均連莊 | 最大連莊 | AT揮數佔比 | 紫礦 | 金礦`);
const rtp1 = [];
for (const s of [1, 2, 3, 4, 5, 6]) {
  const r = E.simulate(C, s, N, 0, Math.random);
  rtp1.push(r.rtp);
  console.log(`${s} | ${pct(r.rtp)} | 1/${Math.round(r.hitRate)} | ${r.avgChain.toFixed(2)} | ${Math.max(...r.chains)} | ${pct(r.bonusSwings / N)} | 1/${Math.round(r.epicRate)} | 1/${Math.round(r.legendRate)}`);
}

/* ---------- §8.2 各礦坑 ---------- */
console.log(`\n=== §8.2 第一台 各礦坑（${Math.round(N / 4).toLocaleString()} 揮）===`);
C.mines.forEach((m, i) => {
  if (m.engine === 2) return;
  const a = E.simulate(C, 1, Math.round(N / 4), i, Math.random);
  const b = E.simulate(C, 6, Math.round(N / 4), i, Math.random);
  console.log(`${m.name} ×${m.mult} 天井${m.tenjou} | 設定1 ${pct(a.rtp)}／1/${Math.round(a.hitRate)} | 設定6 ${pct(b.rtp)}／1/${Math.round(b.hitRate)}`);
});

/* ---------- §8.3 連續演出信賴度 ----------
   ⚠️ 量測陷阱：最後一回合（= 最高色）和 bonusStart/chanceLose 事件是同一揮發出的。
      顏色必須「先更新再結算」，否則每一場都會漏掉最高色，白色會被誤算成大宗。 */
console.log(`\n=== §8.3 連續演出：最高顏色 → 通關率（設定1）===`);
{
  const st = E.newPlayState(), shows = [];
  let cur = null;
  for (let i = 0; i < N * 2; i++) {
    const r = E.swing(R, 1, st, Math.random, 800);
    if (cur && (r.omenKey === "chance" || r.omenKey === "chanceEnter")) cur.maxColor = Math.max(cur.maxColor, r.omen);
    for (const e of r.events) {
      if (e.t === "chanceStart") cur = { maxColor: 0, win: false, rounds: e.len };
      if (e.t === "bonusStart" && (e.from === "chance" || e.from === "revive") && cur) { cur.win = true; shows.push(cur); cur = null; }
      if (e.t === "chanceLose" && !e.fake && cur) { shows.push(cur); cur = null; }
    }
  }
  console.log(`（樣本 ${shows.length.toLocaleString()} 場）`);
  R.omen.names.forEach((nm, c) => {
    const g = shows.filter(x => x.maxColor === c);
    if (g.length) console.log(`  ${nm} | 出現 ${pct(g.length / shows.length)} | 通關率 ${pct(g.filter(x => x.win).length / g.length)}`);
  });
  console.log(`  ——`);
  for (let n = 1; n <= 5; n++) {
    const g = shows.filter(x => x.rounds === n);
    if (g.length) console.log(`  ${n}回合 | 出現 ${pct(g.length / shows.length)} | 通關率 ${pct(g.filter(x => x.win).length / g.length)}`);
  }
}

/* ---------- §8.4 延伸（連莊）通過率 ---------- */
console.log(`\n=== §8.4 延伸通過率（一條礦脈至少中一次）===`);
for (const s of [1, 6]) {
  const st = E.newPlayState(), pass = { RB: [0, 0], BB: [0, 0], SBB: [0, 0] };
  let curType = null, got = false;
  const close = () => { if (curType) { pass[curType][1]++; if (got) pass[curType][0]++; } };
  for (let i = 0; i < N * 2; i++) {
    const r = E.swing(R, s, st, Math.random, 800);
    for (const e of r.events) {
      if (e.t === "bonusStart" || e.t === "bonusChain") { close(); curType = e.type; got = false; }
      if (e.t === "stock") got = true;
      if (e.t === "bonusEnd") { close(); curType = null; got = false; }
    }
  }
  console.log(`  設定${s}： ` + ["RB", "BB", "SBB"].map(t => `${t} ${pct(pass[t][0] / Math.max(1, pass[t][1]), 0)}`).join("｜"));
}

/* ---------- §8.5 第二台 ---------- */
console.log(`\n=== §8.5 第二台（m6）===`);
console.log(`設定 | 機械割 | 初當 | 上位率`);
const rtp2 = [];
for (const s of [1, 2, 3, 4, 5, 6]) {
  const r = E2.simulate2(C, s, N, Math.random);
  rtp2.push(r.rtp);
  console.log(`${s} | ${pct(r.rtp)} | 1/${Math.round(r.hitRate)} | ${pct(r.upperRate, 0)}`);
}

/* ---------- §8.6 第二台 劇本／顏色信賴度 ----------
   ⚠️ 量測陷阱：前輩必須**按機會牌出現率加權**抽，不能均勻抽三位。
      最好抽到的岩倉通過率最低，均勻抽會把整體通過率高估約 8 個百分點。 */
console.log(`\n=== §8.6 第二台 劇本與顏色信賴度（設定1）===`);
{
  const M = C.machine2, s = 0;
  const w = {
    a: M.itemTable.cardA[s] + M.itemTable.goldA[s],
    b: M.itemTable.cardB[s] + M.itemTable.goldB[s],
    c: M.itemTable.cardC[s] + M.itemTable.goldC[s]
  };
  const tot = w.a + w.b + w.c;
  const pick = () => { let x = Math.random() * tot; for (const k of ["a", "b", "c"]) if ((x -= w[k]) < 0) return k; return "c"; };
  console.log(`  被找的分布（按牌率）： ` + Object.entries(w).map(([k, v]) => `${M.bosses.find(b => b.id === k).name} ${pct(v / tot)}`).join("  "));

  const n = Math.max(200000, Math.round(N / 5));
  const sc = { normal: [0, 0], strong: [0, 0], hot: [0, 0] }, odd = [0, 0], col = {};
  let win = 0;
  for (let i = 0; i < n; i++) {
    const st = E2.newState2();
    E2.forceDate(M, 1, st, pick(), Math.random);
    if (st.dateWin) win++;
    sc[st.dateScene][1]++; if (st.dateWin) sc[st.dateScene][0]++;
    if (st.dateOdd) { odd[1]++; if (st.dateWin) odd[0]++; }
    const mx = st.dateColors[st.dateColors.length - 1];
    (col[mx] = col[mx] || [0, 0]); col[mx][1]++; if (st.dateWin) col[mx][0]++;
  }
  console.log(`  整體通過率 ${pct(win / n)}（${n.toLocaleString()} 場）`);
  const NAME = { normal: "礦坑內", strong: "外出", hot: "激熱" };
  for (const k of ["normal", "strong", "hot"]) console.log(`  ${NAME[k]} | 出現 ${pct(sc[k][1] / n)} | 通過 ${pct(sc[k][0] / sc[k][1])}`);
  console.log(`  違和感長度 | 出現 ${pct(odd[1] / n)} | 通過 ${pct(odd[0] / odd[1])}`);
  ["白", "藍", "黃", "綠", "紅"].forEach((nm, c) => {
    if (col[c]) console.log(`  ${nm} | 出現 ${pct(col[c][1] / n)} | 通關率 ${pct(col[c][0] / col[c][1])}`);
  });
}

/* ---------- §8.8 礦脈觀測鏡（v0.10.6） ----------
   必須成立的檢查：
     1. 每個內部值 × 每次觀測的權重合計 = 100
     2. 等級下限（geD/geC/geB/geA）只出現在對應內部值以上（這類情報必定為真）
     3. 完整礦紋：第1〜3次 0%、第4次 0.5%、第5次 2%，且抽中必定等於真實內部值
   然後反推玩家看到某個現象時的真實內部分布，以及五次觀測後的猜中率與花費。   */
function glassReport() {
  const G = C.glasses; if (!G || !G.weights) return;
  const d = R.settingDist, MIN = { geD: 2, geC: 3, geB: 4, geA: 5 };
  console.log(`\n=== §8.8 礦脈觀測鏡 ===`);
  let bad = 0;
  for (let s = 1; s <= 6; s++) {
    const rows = G.weights[s] || [];
    if (rows.length !== (G.dailyMax || 5)) { console.log(`  ✗ 內部值${s} 只有 ${rows.length} 列，應為 ${G.dailyMax}`); bad++; }
    rows.forEach((r, i) => {
      let sum = 0;
      for (const k in r) {
        sum += r[k];
        if (!G.results[k]) { console.log(`  ✗ 內部值${s} 第${i + 1}次：不認識的結果「${k}」`); bad++; }
        else if (MIN[k] && s < MIN[k]) { console.log(`  ✗ 內部值${s} 第${i + 1}次 會說謊：${G.results[k].name}`); bad++; }
      }
      if (Math.abs(sum - 100) > 1e-9) { console.log(`  ✗ 內部值${s} 第${i + 1}次 權重合計 ${sum}`); bad++; }
    });
  }
  const want = [0, 0, 0, 0.5, 2];
  want.forEach((v, i) => { if ((G.badgeRate || [])[i] !== v) { console.log(`  ✗ 第${i + 1}次完整礦紋機率 ${G.badgeRate[i]}%，應為 ${v}%`); bad++; } });
  console.log(bad ? `  ⚠️ 共 ${bad} 項不合格` : `  ✓ 權重合計、等級下限不說謊、完整礦紋機率（0/0/0/0.5/2%）全部正確`);
  // 2026-10-05 紅晶：第 6、7 次（G.ruby）同樣檢查
  const GR = G.ruby || { weights: {}, badgeRate: [], prices: [] }, NR = GR.prices.length;
  let badR = 0;
  for (let s = 1; s <= 6; s++) {
    const rows = GR.weights[s] || [];
    if (rows.length !== NR) { console.log(`  ✗ 紅晶：內部值${s} 有 ${rows.length} 列，應為 ${NR}`); badR++; }
    rows.forEach((r, i) => {
      let sum = 0;
      for (const k in r) {
        sum += r[k];
        if (!G.results[k]) { console.log(`  ✗ 紅晶 內部值${s} 第${6 + i}次：不認識的結果「${k}」`); badR++; }
        else if (MIN[k] && s < MIN[k]) { console.log(`  ✗ 紅晶 內部值${s} 第${6 + i}次 會說謊：${G.results[k].name}`); badR++; }
      }
      if (Math.abs(sum - 100) > 1e-9) { console.log(`  ✗ 紅晶 內部值${s} 第${6 + i}次 權重合計 ${sum}`); badR++; }
    });
  }
  if (NR) console.log(badR ? `  ⚠️ 紅晶第 6／7 次共 ${badR} 項不合格` : `  ✓ 紅晶第 6／7 次：權重合計、等級下限不說謊（完整礦紋 ${GR.badgeRate.join("／")}%，價格 ${GR.prices.join("／")} 紅晶）`);
  const W = s => (G.weights[s] || []).concat(GR.weights[s] || []), BR = (G.badgeRate || []).concat(GR.badgeRate || []);

  // 各現象的反推分布（把五次觀測都算進去，按出現次數加權）
  const joint = {};
  for (let s = 1; s <= 6; s++) (G.weights[s] || []).forEach((r, i) => {
    const pb = (G.badgeRate[i] || 0) / 100;
    for (const k in r) (joint[k] = joint[k] || Array(7).fill(0))[s] += d[s - 1] * (1 - pb) * r[k] / 100;
    (joint.badge = joint.badge || Array(7).fill(0))[s] += d[s - 1] * pb;
  });
  const NAME = k => k === "badge" ? "完整礦紋（E〜S）" : G.results[k].name;
  const rows = Object.entries(joint).map(([k, v]) => {
    const tot = v.reduce((a, b) => a + b, 0), p = v.map(x => x / tot);
    return { k, tot, p, ev: p.reduce((a, x, i) => a + x * i, 0) };
  }).sort((a, b) => a.ev - b.ev);
  console.log(`  玩家看到 | 每次觀測出現率 | E | D | C | B | A | S | 平均內部值`);
  for (const r of rows) {
    console.log(`  ${NAME(r.k)} | ${pct(r.tot / (G.dailyMax || 5))} | ` +
      [1, 2, 3, 4, 5, 6].map(i => (r.p[i] * 100).toFixed(0) + "%").join(" | ") + ` | ${r.ev.toFixed(2)}`);
  }
  console.log(`  不觀測（先驗）平均內部值 ${d.reduce((a, v, i) => a + v * (i + 1), 0).toFixed(2)}`);

  // 模擬：完整觀測 n 次之後猜得多準，以及徽章實際出現率
  const pickS = () => { let x = Math.random(), a = 0; for (let i = 0; i < 6; i++) { a += d[i]; if (x < a) return i + 1; } return 1; };
  const draw = (s, stage) => {
    if (Math.random() * 100 < (BR[stage - 1] || 0)) return { k: "badge", g: s - 1 };
    const t = W(s)[stage - 1]; let x = Math.random() * 100;
    for (const k in t) if ((x -= t[k]) < 0) return { k };
    return { k: "silent" };
  };
  const n = 200000, maxN = (G.dailyMax || 5) + NR;
  const badgeHit = Array(maxN).fill(0), badgeWrong = [0];
  const acc = Array(maxN).fill(0), sure = Array(maxN).fill(0);
  for (let i = 0; i < n; i++) {
    const S = pickS(), post = d.slice();
    let known = false;
    for (let t = 1; t <= maxN; t++) {
      const e = draw(S, t);
      if (e.k === "badge") {
        badgeHit[t - 1]++;
        if (e.g + 1 !== S) badgeWrong[0]++;
        known = true;
        for (let s = 1; s <= 6; s++) post[s - 1] *= (s === e.g + 1 ? 1 : 0);
      } else {
        for (let s = 1; s <= 6; s++) post[s - 1] *= (W(s)[t - 1][e.k] || 0) / 100;
      }
      if (known) sure[t - 1]++;
      const tot = post.reduce((a, b) => a + b, 0);
      if (tot > 0) { const p = post.map(v => v / tot); if (p.indexOf(Math.max(...p)) + 1 === S) acc[t - 1]++; }
    }
  }
  console.log(`  ——完整礦紋實際出現率（${n.toLocaleString()} 次模擬）——`);
  badgeHit.forEach((v, i) => console.log(`  第${i + 1}次 ${(v / n * 100).toFixed(2)}%（設定值 ${BR[i]}%）`));
  console.log(`  徽章與真實內部值不符的次數：${badgeWrong[0]}（必須為 0）`);
  console.log(`  ——累積觀測後猜中真實內部值的機率——`);
  let cost = 0;
  acc.forEach((v, i) => {
    if (i < (G.dailyMax || 5)) cost += Math.pow(G.repeatMul, i);
    const rb = GR.prices.slice(0, Math.max(0, i + 1 - (G.dailyMax || 5))).reduce((a, b) => a + b, 0);
    console.log(`  觀測${i + 1}次 | 猜中 ${(v / n * 100).toFixed(1)}% | 已完全確定 ${(sure[i] / n * 100).toFixed(1)}% | 累計花費 = 建議鎬子價 ×${(cost * G.priceMul).toFixed(0)}${rb ? `＋紅晶 ${rb}` : ""}`);
  });
}
glassReport();

/* ---------- §8.7 依 settingDist 加權的玩家體感 RTP ---------- */
console.log(`\n=== §8.7 依每日設定分配加權（玩家實際體感）===`);
{
  const d = R.settingDist;
  const w1 = rtp1.reduce((a, v, i) => a + v * d[i], 0);
  const w2 = rtp2.reduce((a, v, i) => a + v * d[i], 0);
  console.log(`  settingDist = [${d.join(", ")}]`);
  console.log(`  第一台 加權機械割 ${pct(w1)}｜第二台 加權機械割 ${pct(w2)}`);
  console.log(`  ⚠️ 玩家若能操縱每日設定（見 RISK-3），實際會逼近設定6：第一台 ${pct(rtp1[5])}、第二台 ${pct(rtp2[5])}`);
}

/* ---------- §8.9 紅晶（2026-10-05 設計 v4） ----------
   1. 挖礦紅晶：每扣 1 耐久累積 ruby.mines[礦坑].progress.perDur 點，滿 ruby.dig.need 得 1 顆 → 每顆要扣多少耐久
   2. 紅岩鑽頭：耐久 1000，m1～m5 礦脈中不扣、m6 只在前輩的心意中不扣（每把上限 300）→ 一把實際能揮幾下
      設定依 settingDist 抽（每 3 把換一次＝換一天）；狀態連續（上一把用完時的礦脈會接到下一把），跟實際連續玩一樣 */
{
  const RB = C.ruby, M = RB.mines, D = C.tools.find(t => t.id === "redrock").durability;
  console.log(`\n=== §8.9 紅晶 ===`);
  console.log(`  挖礦紅晶：滿 ${RB.dig.need} 點得 1 顆，每天最多 ${RB.dig.dailyCap} 顆`);
  C.mines.forEach(m => { const p = (M[m.id] || {}).progress; if (p) console.log(`  ${m.id} ${m.name}｜每扣 1 耐久 ${p.perDur} 點｜約 ${Math.round(RB.dig.need / p.perDur)} 耐久 1 顆`); });
  const pickS = () => { let x = Math.random(), a = 0; for (let i = 0; i < 6; i++) { a += R.settingDist[i]; if (x < a) return i + 1; } return 1; };
  const LIVES = Math.max(200, Math.round(N / 3000));
  console.log(`  ——紅岩鑽頭一把實際揮數（耐久 ${D}，${LIVES} 把平均，設定依 settingDist）——`);
  C.mines.forEach((m, i) => {
    const df = (M[m.id] || {}).drillFree; if (!df) return;
    let swings = 0, free = 0, s = 1;
    const st2 = E2.newState2(), st1 = E.newPlayState();
    for (let k = 0; k < LIVES; k++) {
      if (k % 3 === 0) s = pickS();
      let dur = D, used = 0;
      if (m.engine === 2) {
        const st = st2;
        while (dur > 0) {
          const input = st.state === "pick" ? { choice: "drill" } : (st.state === "stIntro" && st.upper && !st.pickedBoss ? { choice: "a" } : {});
          const res = E2.step2(C.machine2, s, st, Math.random, input);
          if (res.free) continue;
          swings++;
          if (df.phases.includes(res.stateBefore) && (!df.maxPerTool || used < df.maxPerTool)) { used++; free++; } else dur--;
        }
      } else {
        const st = st1;
        while (dur > 0) {
          const r = E.swing(R, s, st, Math.random, m.tenjou);
          swings++;
          if (df.phases.includes(r.stateBefore === "bonus" ? "bonus" : "normal")) free++; else dur--;
        }
      }
    }
    console.log(`  ${m.id} ${m.name}｜平均 ${Math.round(swings / LIVES)} 揮（多 ${pct(swings / LIVES / D - 1, 0)}）｜免扣 ${pct(free / swings)}${df.maxPerTool ? `｜每把上限 ${df.maxPerTool}` : ""}`);
  });
}

/* 3. 礦脈探測器：接下來 10 次「通常狀態」挖掘，機會牌 ×mult（m1～m5 紫・金 ×8、m6 六種機會牌 ×5），沒有保底。
      做法：先暖機到通常狀態，複製同一個狀態各跑「有探測器／沒有」兩條，比較 10 次內出牌率與之後多拿的收入。
      收入差＝用一次多拿的期望金額；機械割影響以「每 4 週用一次、每天揮 D 下」換算（D 見下方，假設值）。 */
{
  const RB = C.ruby, M = RB.mines, TRIALS = Math.max(3000, Math.round(N / 300)), FOLLOW = 800, DAILY = 3000;
  console.log(`  ——礦脈探測器（${TRIALS.toLocaleString()} 次，設定依 settingDist；之後追 ${FOLLOW} 揮算收入差；換算假設每天揮 ${DAILY} 下、4 週用一次）——`);
  const pickS = () => { let x = Math.random(), a = 0; for (let i = 0; i < 6; i++) { a += R.settingDist[i]; if (x < a) return i + 1; } return 1; };
  const clone = o => JSON.parse(JSON.stringify(o));
  C.mines.forEach((m, i) => {
    const pc = (M[m.id] || {}).probe; if (!pc) return;
    const isM2 = m.engine === 2;
    const tool = C.tools.find(t => t.category === "pick" && t.tier === m.tier), cps = tool.price / tool.durability;
    let card = [0, 0], date = [0, 0], at = [0, 0], gain = 0;
    for (let k = 0; k < TRIALS; k++) {
      const s = pickS();
      let base;
      if (isM2) { base = E2.newState2(); for (let w = 0, n = 200 + Math.floor(Math.random() * 800); w < n || base.state !== "normal"; w++) { const input = base.state === "pick" ? { choice: "drill" } : (base.state === "stIntro" && base.upper && !base.pickedBoss ? { choice: "a" } : {}); E2.step2(C.machine2, s, base, Math.random, input); } }
      else { base = E.newPlayState(); for (let w = 0, n = 200 + Math.floor(Math.random() * 800); w < n || base.state !== "normal"; w++) E.swing(R, s, base, Math.random, m.tenjou); }
      [0, 1].forEach(withProbe => {
        const st = clone(base); let left = 10, income = 0, gotCard = false, gotDate = false, gotAt = false, live = new Set(), paid = 0;
        while (paid < FOLLOW) {
          const pm = withProbe && left > 0 ? pc.mult : 0;
          if (isM2) {
            const input = st.state === "pick" ? { choice: "drill" } : (st.state === "stIntro" && st.upper && !st.pickedBoss ? { choice: "a" } : {});
            input.probeMult = pm; if (pm && pc.states) input.probeBoost = pc.states;   // m6：各狀態都加成、連續 10 轉不暫停
            const inWin = left > 0, res = E2.step2(C.machine2, s, st, Math.random, input);
            if (!res.free) { paid++; income += res.pay * m.mult; }
            if (res.probe || (!withProbe && inWin && !res.free && (pc.states || res.stateBefore === "normal") && !res.events.some(e => e.t === "freeze"))) left--;
            for (const e of res.events) {
              if (inWin && e.t === "card") gotCard = true;
              if (inWin && e.t === "dateStart") { gotDate = true; live.add(e.boss); }
              if (e.t === "dateWin" && live.has(e.boss)) gotAt = true;
            }
          } else {
            const inWin = left > 0, r = E.swing(R, s, st, Math.random, m.tenjou, { probeMult: pm });
            paid++;
            const cat = C.categories.find(c => c.id === r.cat);
            income += (r.stateBefore === "bonus" ? (cat.veinValue ?? cat.value) : cat.value) * m.mult;
            if (r.probe || (!withProbe && inWin && r.stateBefore === "normal" && st && !r.events.some(e => e.t === "freeze"))) { if (r.cat === "epic" || r.cat === "legend") gotCard = true; left--; }
          }
        }
        card[withProbe] += gotCard; date[withProbe] += gotDate; at[withProbe] += gotAt;
        gain += withProbe ? income : -income;
      });
    }
    const per = gain / TRIALS, rtpPt = per / (DAILY * 28 * cps) * 100;
    console.log(`  ${m.id} ${m.name} ×${pc.mult}｜10 次內出機會牌 ${pct(card[0] / TRIALS)} → ${pct(card[1] / TRIALS)}` +
      (isM2 ? `｜進談話 ${pct(date[0] / TRIALS)} → ${pct(date[1] / TRIALS)}｜進帶路 ${pct(at[0] / TRIALS)} → ${pct(at[1] / TRIALS)}` : "") +
      `｜用一次多拿 $${per.toFixed(0)}（≈${(per / cps).toFixed(0)} 揮的鎬子錢）｜機械割 +${rtpPt.toFixed(3)} 個百分點`);
  });
}

huntSection(HUNT_RUNS);
