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

const N = +(process.argv[2] || 1500000);
const R = C.rules;
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";

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
