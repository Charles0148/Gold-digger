#!/usr/bin/env node
/* =========================================================
   佐佐木恩惠 v2：數值表、經濟複驗、存檔遷移測試
   用法：  node tools/boon-v2-test.js [每礦坑揮數]     例：node tools/boon-v2-test.js 400000
   - 數值全部讀 js/config.js（唯一來源），邏輯讀 js/boons.js（遊戲實際使用的同一份）
   - 經濟表沿用診斷（DIAGNOSIS §4）同一套假設：同階鎬挖對應礦坑、設定 1、不計自動停止、
     售價加成套在全部收入上（上限估計）；RTP 由 engine.simulate 現跑
   - 最後一行印 PASS／FAIL 摘要；失敗時結束碼 1
   ========================================================= */
const path = require("path");
const ROOT = path.join(__dirname, "..");
const C = require(path.join(ROOT, "js/config.js"));
const E = require(path.join(ROOT, "js/engine.js"));
const BV = require(path.join(ROOT, "js/boons.js"));
const N = +(process.argv[2] || 400000);

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log("  ✘ FAIL " + name); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = o => JSON.parse(JSON.stringify(o));
const K = C.boss.boonsV2.kinds;
const pct = x => (x * 100).toFixed(1) + "%";

/* ---------- 1. 設定值 ---------- */
console.log("=== 1. 設定值（js/config.js boss.boonsV2）===");
BV.KINDS.forEach(k => console.log(`  ${K[k].name}：每階 ${pct(K[k].step)}，${K[k].max} 階，滿階 ${pct(BV.rate(C, k, K[k].max))}`));
ok(K.autoSpeed.step === 0.04 && K.autoSpeed.max === 5, "自動速度 4%×5");
ok(K.sell.step === 0.02 && K.sell.max === 5, "出售 2%×5");
ok(K.toolCut.step === 0.01 && K.toolCut.max === 5, "折扣 1%×5");
ok(K.toolDur.step === 0.02 && K.toolDur.max === 5, "耐久 2%×5");
ok(BV.cap(C) === 20, "總共 20 階");
ok(C.boss.boonsV2.enabled === false, "預設 enabled=false（正式網址維持舊恩惠）");
ok(K.toolCut.name === "鎬子購買折扣" && K.toolDur.name === "新鎬子耐久", "玩家用語：鎬子購買折扣／新鎬子耐久");

/* ---------- 2. 逐階效果與取整 ---------- */
console.log("\n=== 2. 逐階效果（0～5 階）===");
const T = [0, 1, 2, 3, 4, 5];
const iv = T.map(t => BV.autoInterval(C.play.autoInterval, BV.rate(C, "autoSpeed", t)));
console.log("  自動間隔 ms：" + iv.map(x => x.toFixed(1)).join(" / "));
ok(Math.abs(iv[5] - 350 / 1.2) < 1e-9, "滿階 350/1.20≈291.7ms（不是 350×0.8）");
ok(iv.every((x, i) => i === 0 || x < iv[i - 1]), "速度每階都有感");
C.tools.filter(t => t.category === "pick").forEach(t => {   // 價格／耐久恩惠只作用標準鎬子（紅岩鑽頭沒有價格、不吃恩惠，見 §6）
  const pr = T.map(x => BV.toolPrice(t.price, BV.rate(C, "toolCut", x)));
  const du = T.map(x => BV.toolMax(t.durability, BV.rate(C, "toolDur", x)));
  console.log(`  ${t.name}：價格 ${pr.join("/")}｜新耐久 ${du.join("/")}`);
  ok(pr.every((x, i) => i === 0 || x < pr[i - 1]), `${t.name} 折扣每階都有感`);
  ok(du.every((x, i) => i === 0 || x > du[i - 1]), `${t.name} 耐久每階都有感`);
  ok(pr.every(x => x >= 1), `${t.name} 價格至少 1`);
});
ok(BV.toolPrice(1, 0.05) === 1 && BV.toolPrice(1, 0.99) === 1, "價格下限 1");
console.log("  出售（整筆一次取整到 0.1）：");
const noFeel = [];
[1, 1.1, 1.5, 2, 2.2, 2.5, 3].forEach(base => [1, 10].forEach(q => {
  const v = T.map(t => BV.sellTotal(base * q, BV.rate(C, "sell", t)));
  const flat = v.map((x, i) => i && x === v[i - 1] ? i : 0).filter(Boolean);
  if (flat.length) noFeel.push(`基本價${base}×${q}：第${flat.join("、")}階`);
  console.log(`    基本價 ${base} ×${q}：${v.join(" / ")}${flat.length ? `　（第${flat.join("、")}階與前一階相同）` : ""}`);
}));
console.log("  取整無感回報：" + (noFeel.length ? noFeel.join("；") : "無"));
ok(BV.sellTotal(1 * 10, 0.1) === 11, "整筆取整：1 元×10 顆滿階 = 11");
ok(BV.sellTotal(3.3, 0.06) === 3.5, "3.3×1.06=3.498→3.5");
ok(BV.sellTotal(0, 0.1) === 0, "空的出售 = 0");

/* ---------- 3. 經濟複驗 ---------- */
console.log(`\n=== 3. 四種滿階經濟（診斷 §4 同假設；每礦坑 ${N.toLocaleString()} 揮，設定1）===`);
const sell = 1 + BV.rate(C, "sell", 5), cut = BV.rate(C, "toolCut", 5), dur = BV.rate(C, "toolDur", 5), spd = BV.rate(C, "autoSpeed", 5);
const mul = sell / ((1 - cut) / (1 + dur));
console.log(`  理論 收入÷成本 倍率 = ${sell.toFixed(2)} ÷ (${(1 - cut).toFixed(2)}÷${(1 + dur).toFixed(2)}) = ${mul.toFixed(4)}；速度 ×${(1 + spd).toFixed(2)}`);
ok(Math.abs(mul - 1.2737) < 0.0005, "理論倍率約 1.274");
console.log("  礦坑＋鎬 | 原本 每分鐘 收入/成本/淨利 | 全滿 每分鐘 收入/成本/淨利 | 機械割 原本→全滿 | 一把鎬(折後)≈全滿幾分鐘淨利");
C.mines.forEach((m, i) => {
  if (m.engine === 2) return;
  const tool = C.tools.find(t => t.tier === m.tier);
  const rtp = E.simulate(C, 1, N, i, Math.random).rtp;
  const perMin0 = 60000 / C.play.autoInterval, perMin1 = 60000 / iv[5];
  const cost0 = tool.price / tool.durability * perMin0, rev0 = cost0 * rtp;
  const pr1 = BV.toolPrice(tool.price, cut), du1 = BV.toolMax(tool.durability, dur);
  const cost1 = pr1 / du1 * perMin1, rev1 = rev0 / perMin0 * perMin1 * sell;
  console.log(`  ${m.name}＋${tool.name} | ${rev0.toFixed(0)} / ${cost0.toFixed(0)} / ${(rev0 - cost0).toFixed(0)} | ${rev1.toFixed(0)} / ${cost1.toFixed(0)} / ${(rev1 - cost1).toFixed(0)} | ${pct(rtp)} → ${pct(rev1 / cost1)} | ${(pr1 / (rev1 - cost1)).toFixed(1)}`);
});
console.log("  （舊版 150%／+25%/+15%/-10%/+15% 的結果已作廢，不再引用）");

/* ---------- 4. 存檔遷移 ---------- */
console.log("\n=== 4. 存檔遷移（Lv101＋100 個舊恩惠測試副本）===");
const oldIds = Object.keys(C.boss.boons);
const legacy = {
  v: 1, rev: 57, name: "測試副本", coins: 123456.7, uid: 999,
  tools: [{ uid: 5, id: "iron", dur: 37, max: 206 }, { uid: 6, id: "wood", dur: 60, max: 62 }], equipped: 5,
  ores: { "赤銅礦": 12 }, dex: { "赤銅礦": { count: 99, first: "2026-09-01" } },
  boss: { favor: 12.5, level: 101, total: 9876.5, req: { day: "2026-09-29", no: 2, lines: [] }, reqAds: { date: "2026-09-29", count: 1 }, talk: { trip: 3 },
    boons: Array.from({ length: 100 }, (_, i) => ({ id: oldIds[i % oldIds.length], r: C.boss.boons[oldIds[i % oldIds.length]].r })) },
  unlocked: ["m1", "m2", "m3"], mineId: "m3", plays: { m3: { a: 1 } }, plays2: {}, today: { date: "2026-09-29", stats: {} },
  ads: { date: "2026-09-29", count: 4 }, pw: {}, glass: { date: "2026-09-29", byMine: {} },
  senpai: { since: "0.10.11", wins: { a: 100, b: 3, c: 0 }, memories: { a: { date: "2026-09-20" } }, story: null }, auto: false, debug: {}
};
const s1 = clone(legacy); let backups = 0, backupBoss = null;
const r1 = BV.fix(s1, C, b => { backups++; backupBoss = b; });
ok(r1.migrated && backups === 1, "第一次遷移呼叫備份一次");
ok(eq(backupBoss, legacy.boss), "備份內容＝原始 boss");
ok(s1.v === 1, "頂層 save.v 仍是 1");
ok(eq(s1.boss.boons, legacy.boss.boons) && s1.boss.boons.length === 100, "100 個舊恩惠原樣保留");
ok(s1.boss.level === 101 && s1.boss.favor === 12.5 && s1.boss.total === 9876.5, "等級／恩惠點數不變");
ok(eq(s1.boss.req, legacy.boss.req) && eq(s1.boss.reqAds, legacy.boss.reqAds) && eq(s1.boss.talk, legacy.boss.talk), "委託板／重置次數／台詞狀態不變");
const { boss: _b1, ...rest1 } = s1, { boss: _b0, ...rest0 } = legacy;
ok(eq(rest1, rest0), "boss 以外所有欄位（金錢、礦石、工具 dur/max、前輩、回憶、ID…）完全不變");
ok(s1.boss.schema === 2 && s1.boss.epoch === 0 && s1.boss.rewardLv === 101 && eq(s1.boss.pending.filter(p => p.kind !== "milestone"), []), "schema=2、epoch=0、rewardLv=目前等級、不補發舊等級");
ok(eq(s1.boss.pending, [{ lv: 25, kind: "milestone", id: "redrockTrial", epoch: 0 }]), "Lv101 舊存檔遷移後只補排 1 筆 Lv25 紅岩試用（階段2）");
ok(BV.KINDS.every(k => s1.boss.tiers[k] === 0), "四種從 0 階開始（舊恩惠不換算）");
const s1b = clone(s1); const r1b = BV.fix(s1b, C, () => backups++);
ok(!r1b.migrated && backups === 1 && eq(s1b, s1), "冪等：第二次不改任何東西、不再備份");
const s2 = { v: 1, coins: 5 }; BV.fix(s2, C);
ok(s2.boss && s2.boss.schema === 2 && s2.boss.level === 1, "缺 boss 的存檔自動補新結構");
const s3 = { v: 1, boss: { level: "x", favor: null, boons: "壞", schema: 2, tiers: { sell: 99, toolCut: -3, autoSpeed: 2.7 }, rewardLv: 500, pending: [{ lv: 3, kind: "pick", opts: ["sell"] }, { lv: 3, kind: "pick" }, { kind: "tool" }, "x", { lv: 2, kind: "tool", id: "iron" }] } };
BV.fix(s3, C);
ok(s3.boss.level === 1 && s3.boss.favor === 0 && Array.isArray(s3.boss.boons), "壞欄位修正");
ok(s3.boss.tiers.sell === 5 && s3.boss.tiers.toolCut === 0 && s3.boss.tiers.autoSpeed === 2 && s3.boss.tiers.toolDur === 0, "階數夾在 0～5 整數");
ok(s3.boss.rewardLv === 1, "rewardLv 不超過等級");
ok(eq(s3.boss.pending.map(p => p.lv), [2, 3]) && s3.boss.legacyStray.length === 4, "壞的待領搬到 legacyStray（不直接刪），其餘依等級排序");

/* ---------- 5. 升級獎勵 ---------- */
console.log("\n=== 5. 升級獎勵（兩選一、跨多級、連點、重整、滿階鎬子）===");
const fresh = () => ({ v: 1, unlocked: ["m1"], tools: [], boss: BV.newBoss() });
const g = fresh(); g.boss.level = 6;
ok(BV.queue(g, C) === 5 && g.boss.pending.length === 5 && g.boss.rewardLv === 6, "一次跨 5 級 → 5 筆待領不漏");
ok(g.boss.pending.every(p => p.kind === "pick" && p.opts === null), "候選等輪到才產生");
ok(BV.prepare(g, C, Math.random) === true, "輪到第一筆時產生候選");
const o1 = clone(g.boss.pending[0].opts);
ok(o1.length === 2 && o1[0] !== o1[1], "兩個不同候選");
const reload = clone(g);   // 模擬「存檔→重整」
ok(BV.prepare(reload, C, () => 0.99) === false && eq(reload.boss.pending[0].opts, o1), "重整後不重抽（候選固定）");
ok(!BV.claim(g, C, 99, o1[0]).ok, "等級對不上（舊畫面）不能領");
ok(!BV.claim(g, C, 2, BV.KINDS.find(k => !o1.includes(k))).ok, "不在候選內不能領");
const c1 = BV.claim(g, C, 2, o1[0]);
ok(c1.ok && g.boss.tiers[o1[0]] === 1 && g.boss.pending.length === 4, "選擇成功升一階");
ok(!BV.claim(g, C, 2, o1[0]).ok && g.boss.tiers[o1[0]] === 1, "連點第二次不重領");
// 只剩一種
const one = fresh(); Object.assign(one.boss.tiers, { autoSpeed: 5, sell: 5, toolCut: 5, toolDur: 3 }); one.boss.level = 2; BV.queue(one, C); BV.prepare(one, C);
ok(eq(one.boss.pending[0].opts, ["toolDur"]), "只剩一種未滿 → 只給一個");
// 容量：已 19 階＋一次升 3 級 → 1 選 + 2 鎬
const cap = fresh(); Object.assign(cap.boss.tiers, { autoSpeed: 5, sell: 5, toolCut: 5, toolDur: 4 }); cap.boss.level = 4; cap.unlocked = ["m1", "m2"];
BV.queue(cap, C);
ok(eq(cap.boss.pending.map(p => p.kind), ["pick", "tool", "tool"]) && cap.boss.pending[1].id === "stone", "19 階＋升 3 級 → 1 次選擇＋2 把石鎬（鎬種在升級當下固定）");
cap.unlocked.push("m3", "m4", "m5");
BV.prepare(cap, C); BV.claim(cap, C, 2, "toolDur");
ok(cap.boss.pending[0].id === "stone", "之後解鎖新礦坑，已產生的鎬種不變");
const added = []; const ct = BV.claim(cap, C, 3, null, (id, r) => added.push([id, r]));
ok(ct.ok && eq(added, [["stone", 1]]), "領鎬子走 addTool(id, 1) 一次");
ok(!BV.claim(cap, C, 3, null, (id) => added.push(id)).ok && added.length === 1, "鎬子連點不重領");
// 0→5 全程
const full = fresh(); full.unlocked = ["m1", "m6"]; full.boss.level = 22; BV.queue(full, C);
let picks = 0;
while (full.boss.pending.length && full.boss.pending[0].kind === "pick") { BV.prepare(full, C); const p = full.boss.pending[0]; BV.claim(full, C, p.lv, p.opts[p.opts.length - 1]); picks++; }
ok(picks === 20 && BV.KINDS.every(k => full.boss.tiers[k] === 5), "Lv2～Lv21 共 20 次選擇 → 四種全滿");
ok(full.boss.pending.length === 1 && full.boss.pending[0].kind === "tool" && full.boss.pending[0].lv === 22 && full.boss.pending[0].id === "iron", "Lv22 起送鎬子；只解鎖到第二台（tier3）→ 鐵鎬");
const top = fresh(); top.unlocked = ["m1", "m2", "m3", "m4", "m5"]; ok(BV.bestPick(top, C) === "diamond", "解鎖星核裂谷 → 鑽石鎬");
// 滿階獎勵關閉
const C2 = clone(C); C2.boss.boonsV2.maxedReward = false;
const nf = fresh(); Object.assign(nf.boss.tiers, { autoSpeed: 5, sell: 5, toolCut: 5, toolDur: 5 }); nf.boss.level = 5; BV.queue(nf, C2);
ok(nf.boss.pending.length === 0 && nf.boss.rewardLv === 5, "滿階獎勵關閉時不排鎬子、也不卡住 rewardLv");
// 候選失效（編輯器改階數）→ 重抽／改鎬子
const inv = fresh(); inv.boss.level = 2; BV.queue(inv, C); BV.prepare(inv, C); BV.KINDS.forEach(k => { inv.boss.tiers[k] = 5; });
BV.prepare(inv, C); ok(inv.boss.pending[0].kind === "tool", "候選全部失效 → 改成鎬子，不丟獎勵");
// 等機率：四種都未滿時，每種出現 50%、每組配對 1/6；滿階退出
{
  const M = 60000, seen = {}, pair = {};
  for (let i = 0; i < M; i++) { const x = fresh(); x.boss.level = 2; BV.queue(x, C); BV.prepare(x, C); const o = x.boss.pending[0].opts;
    o.forEach(k => { seen[k] = (seen[k] || 0) + 1; }); pair[o.join("+")] = (pair[o.join("+")] || 0) + 1; }
  console.log("  四種都未滿（" + M + " 次）：各項出現率 " + BV.KINDS.map(k => `${K[k].name} ${pct(seen[k] / M)}`).join("、"));
  console.log("  配對出現率 " + Object.keys(pair).sort().map(k => `${k} ${pct(pair[k] / M)}`).join("、"));
  ok(BV.KINDS.every(k => Math.abs(seen[k] / M - 0.5) < 0.012), "每種出現率約 50%");
  ok(Object.keys(pair).length === 6 && Object.values(pair).every(v => Math.abs(v / M - 1 / 6) < 0.01), "6 種配對各約 1/6");
  const s3 = {}; for (let i = 0; i < 30000; i++) { const x = fresh(); x.boss.tiers.sell = 5; x.boss.level = 2; BV.queue(x, C); BV.prepare(x, C); x.boss.pending[0].opts.forEach(k => { s3[k] = (s3[k] || 0) + 1; }); }
  ok(!s3.sell && ["autoSpeed", "toolCut", "toolDur"].every(k => Math.abs(s3[k] / 30000 - 2 / 3) < 0.015), "一種滿階後退出，其餘三種各約 2/3");
}
// 工具分類：通用謝禮只送 rewardTiers 的標準鎬子；新工具預設不送、不打折、不加耐久
{
  const Cp = clone(C);
  Cp.tools.splice(4, 0, { id: "redrock", tier: 5, name: "紅岩鑽頭", durability: 1000, price: 99, rarity: 5, category: "paid" });
  Cp.tools.splice(0, 0, { id: "probe", tier: 5, name: "礦脈探測器", durability: 50, price: 10, rarity: 3, category: "probe" });
  const top2 = fresh(); top2.unlocked = ["m1", "m2", "m3", "m4", "m5"];
  ok(BV.bestPick(top2, Cp) === "diamond", "同 tier 新增付費／探測器時，仍只送鑽石鎬");
  ok(!BV.rewardable(Cp, "redrock") && !BV.toolFlag(Cp, "redrock", "boonDiscount") && !BV.toolFlag(Cp, "redrock", "boonDurability"), "新工具三個旗標預設都是 false");
  ok(BV.toolFlag(C, "wood", "boonDiscount") && BV.toolFlag(C, "diamond", "boonDurability") && BV.rewardable(C, "iron"), "標準鎬子可送、可打折、可加耐久");
  const Cs = clone(C); Cs.tools = Cs.tools.map(({ category, rewardEligible, boonDiscount, boonDurability, ...t }) => t);   // 模擬編輯器存的舊設定檔（沒有旗標）
  ok(BV.bestPick(top2, Cs) === "diamond" && BV.toolFlag(Cs, "wood", "boonDiscount"), "舊設定檔沒有旗標時，內建鎬子沿用預設旗標");
  const Cn = clone(C); Cn.tools.find(t => t.id === "diamond").rewardEligible = false;
  ok(BV.bestPick(top2, Cn) === "gold", "該 tier 不可贈送時往下找");
  const q = fresh(); q.unlocked = ["m1", "m2", "m3", "m4", "m5"]; Object.assign(q.boss.tiers, { autoSpeed: 5, sell: 5, toolCut: 5, toolDur: 5 }); q.boss.level = 2; BV.queue(q, C);
  const Cr = clone(C); Cr.tools = Cr.tools.filter(t => t.id !== "diamond");
  BV.prepare(q, Cr); ok(q.boss.pending[0].id === "gold", "已固定的鎬種被設定移除時改送可贈送的鎬子，不送不存在的道具");
}
// 隨機性：大量抽選都合法
let bad = 0; for (let i = 0; i < 2000; i++) { const x = fresh(); x.boss.tiers.sell = i % 6; x.boss.level = 2; BV.queue(x, C); BV.prepare(x, C); const o = x.boss.pending[0].opts; if (!o || new Set(o).size !== o.length || o.some(k => x.boss.tiers[k] >= 5)) bad++; }
ok(bad === 0, "2000 次候選抽選都是不同且未滿階");

/* ---------- 6. 階段2：紅岩鑽頭・試用（Lv25 固定一次、每個 epoch 一次）＋工具分類 ---------- */
console.log("\n=== 6. 紅岩鑽頭・試用（里程碑）＋工具分類 ===");
{
  const RT = C.tools.find(t => t.id === "redrockTrial"), RP = C.tools.find(t => t.id === "redrock");
  ok(RT && RT.durability === 1000 && RT.category === "special" && RT.price === undefined, "試用版：耐久 1000、special、沒有金幣價格");
  ok(RP && RP.durability === 1000 && RP.category === "paid" && RP.price === undefined, "完整版：只有識別資料（paid、無價格）");
  ok(["redrockTrial", "redrock"].every(id => !BV.rewardable(C, id) && !BV.toolFlag(C, id, "boonDiscount") && !BV.toolFlag(C, id, "boonDurability")), "兩把都不進滿階謝禮、不打折、不吃耐久恩惠");
  ok(Object.values(C.boss.boonsV2.rewardTiers).every(id => C.tools.find(t => t.id === id).category === "pick"), "rewardTiers 只對應標準鎬子");
  ok([0, 5].every(t => BV.toolMax(RT.durability, BV.toolFlag(C, "redrockTrial", "boonDurability") ? BV.rate(C, "toolDur", t) : 0) === 1000), "耐久恩惠 0 階／滿階，試用到手都是 1000");
  const ms = s => s.boss.pending.filter(p => p.kind === "milestone");
  const add = []; const addT = (id, r) => add.push([id, r]);
  // Lv24 不出現；Lv24→25 排入一次
  const a = fresh(); a.boss.level = 24; a.boss.rewardLv = 23; BV.queue(a, C);   // 只排 Lv24 一次選擇（避免一次跨 23 級把 20 階排滿）
  ok(ms(a).length === 0, "Lv24：沒有紅岩試用待領");
  a.boss.level = 25; BV.queue(a, C); BV.queue(a, C); BV.fix(a, C);
  ok(ms(a).length === 1 && eq(ms(a)[0], { lv: 25, kind: "milestone", id: "redrockTrial", epoch: 0 }), "Lv24→25：排入 1 筆（重複 queue／fix 不多排）");
  ok(a.boss.pending.filter(p => p.lv === 25).map(p => p.kind).join() === "pick,milestone", "同一級：恩惠選擇照常，試用排在後面（不取代選擇）");
  while (a.boss.pending[0].kind === "pick") { BV.prepare(a, C); const p = a.boss.pending[0]; BV.claim(a, C, p.lv, p.opts[0], addT); }
  ok(!BV.claim(a, C, 25, "wrong", addT).ok && !BV.claim(a, C, 24, "redrockTrial", addT).ok && add.length === 0, "id／等級對不上不能領");
  const c = BV.claim(a, C, 25, "redrockTrial", addT);
  ok(c.ok && c.tool === "redrockTrial" && eq(add, [["redrockTrial", 1]]) && a.boss.milestones.redrockTrial.epoch === 0, "領取：寫紀錄→移除待領→addTool 一次");
  ok(!BV.claim(a, C, 25, "redrockTrial", addT).ok && add.length === 1, "連點第二次不重領");
  const re = clone(a); BV.fix(re, C); BV.queue(re, C); re.boss.level = 40; BV.queue(re, C);
  ok(ms(re).length === 0, "重開（fix）／之後再升級：同 epoch 不再排入");
  // 舊 v2 存檔（schema 2 已在，Lv25／Lv30）補一次
  [25, 30].forEach(lv => { const o = fresh(); o.boss.level = lv; o.boss.rewardLv = lv; delete o.boss.milestones; BV.fix(o, C);
    ok(ms(o).length === 1 && o.boss.pending.length === 1, `Lv${lv} 舊 v2 存檔：只補 1 筆試用、不補發舊等級選擇`); });
  // epoch
  const e = clone(a); e.boss.epoch = 1; BV.fix(e, C);
  ok(ms(e).length === 1 && ms(e)[0].epoch === 1, "epoch 改變（模擬正式重置世代）→ 可重新符合一次");
  const e2 = clone(e); e2.boss.epoch = 2; BV.fix(e2, C);
  ok(ms(e2).length === 1 && ms(e2)[0].epoch === 2 && e2.boss.legacyStray.some(p => p.kind === "milestone" && p.epoch === 1), "別的 epoch 留下的待領不能領（搬到 legacyStray），只保留目前 epoch 的一筆");
  const e3 = fresh(); e3.boss.level = 30; e3.boss.epoch = 1; e3.boss.milestones = { redrockTrial: { epoch: 1, lv: 25, at: "x" } }; BV.fix(e3, C);
  ok(ms(e3).length === 0, "同 epoch 已有領取紀錄 → 不排入");
  // 本機領取紀錄（known／guard）
  const k = fresh(); k.boss.level = 30; BV.fix(k, C, null, () => true);
  ok(ms(k).length === 0 && k.boss.milestones.redrockTrial.via === "device", "這台裝置已領過（known）→ 不排入、記成已領、不發工具");
  const g2 = fresh(); g2.boss.level = 30; BV.fix(g2, C); const add2 = [];
  const cg = BV.claim(g2, C, 25, "redrockTrial", id => add2.push(id), () => false);
  ok(!cg.ok && cg.why === "device" && add2.length === 0 && ms(g2).length === 0 && g2.boss.milestones.redrockTrial.via === "device", "領取當下發現另一個分頁已領（guard=false）→ 不發、記成已領");
  let thrown = false; const g3 = fresh(); g3.boss.level = 30; BV.fix(g3, C); const add3 = [];
  try { BV.claim(g3, C, 25, "redrockTrial", id => add3.push(id), () => { throw new Error("full"); }); } catch (x) { thrown = true; }
  ok(thrown && add3.length === 0 && ms(g3).length === 1 && !g3.boss.milestones.redrockTrial, "紀錄寫入失敗 → 不發、待領保留");
  // 設定裡沒有這把／被改成標準鎬子 → 不排、不發
  const Cx = clone(C); Cx.tools = Cx.tools.filter(t => t.id !== "redrockTrial"); const x = fresh(); x.boss.level = 30; BV.fix(x, Cx);
  ok(ms(x).length === 0, "設定裡沒有試用工具 → 不排待領");
  const Cy = clone(C); Cy.tools.find(t => t.id === "redrockTrial").category = "pick"; const y = fresh(); y.boss.level = 30; BV.fix(y, Cy);
  ok(ms(y).length === 0, "試用工具被改成標準鎬子 → 不當里程碑發");
  // 模擬器只用標準鎬子
  const lcg = () => { let q = 7; return () => (q = (q * 16807) % 2147483647) / 2147483647; };
  const Cz = clone(C); Cz.tools = [{ id: "redrockTrial", tier: 1, name: "x", durability: 1000, price: 1, category: "special" }].concat(Cz.tools);
  ok(E.simulate(C, 1, 20000, 0, lcg()).rtp === E.simulate(Cz, 1, 20000, 0, lcg()).rtp, "engine.simulate：多一把 special 工具（排最前、tier1）結果完全相同");
}

console.log(`\n${fail ? "FAIL" : "PASS"}：${pass} 項通過，${fail} 項失敗`);
process.exit(fail ? 1 : 0);
