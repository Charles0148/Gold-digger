#!/usr/bin/env node
/* =========================================================
   紅晶（js/ruby.js）純邏輯測試：存檔補欄位、各來源上限、換日換週、購買不變負數
   用法：node tools/ruby-test.js        最後一行印 PASS／FAIL 摘要；失敗時結束碼 1
   數值讀 js/config.js 的 ruby（唯一來源）
   ========================================================= */
const path = require("path");
const ROOT = path.join(__dirname, "..");
const C = require(path.join(ROOT, "js/config.js"));
const RY = require(path.join(ROOT, "js/ruby.js"));
const RC = C.ruby;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log("  ✘ FAIL " + name); } };
const fresh = () => { const sv = { v: 1 }; RY.fix(sv, RC); return sv; };

console.log("=== 1. 設定值 ===");
ok(RC.welcome === 20 && RC.board === 2 && RC.dig.need === 42000 && RC.dig.dailyCap === 4, "開帳號 20／委託 2／進度 42000／每天 4");
ok(RC.boon.per === 1 && RC.boon.weekCap === 7 && RC.freeze.per === 2 && RC.freeze.dailyTimes === 2 && RC.freeze.weekCap === 8, "恩惠 1（週 7）／凍結 2（天 2 次、週 8）");
ok(RC.ads.enabled === false && RC.ads.at.join() === "3,6,10,12", "網頁示意廣告不給紅晶；上架後第 3、6、10、12 次");
ok(RC.shop.redrock === 175 && RC.shop.probe === 330 && RC.shop.boardTicket === 25 && RC.shop.nameColor === 120 && RC.shop.frame === 220, "商店價格");
ok(["m1", "m2", "m3", "m4", "m5", "m6"].map(m => RC.mines[m].progress.perDur).join() === "14,17,21,26,30,35", "每扣 1 耐久的進度 14/17/21/26/30/35");
ok(C.glasses.ruby.prices.join() === "15,30" && C.glasses.ruby.badgeRate.join() === "10,25", "觀測鏡第 6／7 次：15／30 紅晶、完整礦紋 10／25%");
ok(C.tools.find(t => t.id === "redrock").category === "premium" && !C.tools.some(t => t.category === "paid"), "工具分類 paid → premium");

console.log("=== 2. 舊存檔補欄位 ===");
{
  const old = { v: 1, coins: 5 }; RY.fix(old, RC);
  ok(old.v === 1 && old.coins === 5 && old.ruby.bal === 0 && old.ruby.day.date === "" && old.ruby.welcome === null && old.ruby.probe === null, "沒有 ruby → 補 0，頂層 v 維持 1、其他欄位不動");
  const bad = { v: 1, ruby: { bal: -5, got: "x", day: null, week: 3, drops: "z", probe: { mine: "m1", left: 0 }, welcome: {} } }; RY.fix(bad, RC);
  ok(bad.ruby.bal === 0 && bad.ruby.got === 0 && bad.ruby.day.ads === 0 && bad.ruby.week.boon === 0 && Array.isArray(bad.ruby.drops) && bad.ruby.probe === null && bad.ruby.welcome === null, "壞資料夾回合法值");
  const big = { v: 1, ruby: { bal: 5e9 } }; RY.fix(big, RC);
  ok(big.ruby.bal === RC.maxBal, "餘額上限 " + RC.maxBal);
  const keep = { v: 1, ruby: { bal: 37, got: 50, spent: 13, crystals: 2, welcome: { at: "t", srv: false }, probe: { mine: "m3", left: 4 } } }; RY.fix(keep, RC);
  ok(keep.ruby.bal === 37 && keep.ruby.got === 50 && keep.ruby.spent === 13 && keep.ruby.crystals === 2 && keep.ruby.welcome.at === "t" && keep.ruby.probe.left === 4, "正常資料原樣保留（冪等）");
}

console.log("=== 3. 週一換週 ===");
ok(RY.weekKey("2026-10-05") === "2026-10-05", "2026-10-05 是週一");
ok(RY.weekKey("2026-10-11") === "2026-10-05", "週日仍屬同一週");
ok(RY.weekKey("2026-10-12") === "2026-10-12", "下週一換週");
ok(RY.weekKey("2027-01-01") === "2026-12-28", "跨年");
ok(RY.weekKey(null) === "" && RY.weekKey("bad") === "", "日期未知 → 空");

console.log("=== 4. 各來源與上限 ===");
{
  const D = "2026-10-06";
  // 挖礦：m1 每 3000 耐久 1 顆、每天 4 顆
  const a = fresh(); let g = 0;
  for (let i = 0; i < 2999; i++) g += RY.onDig(a, RC, D, 14);
  ok(g === 0 && a.ruby.day.dig === 2999 * 14, "m1 2999 耐久還沒滿");
  g += RY.onDig(a, RC, D, 14);
  ok(g === 1 && a.ruby.bal === 1 && a.ruby.day.dig === 0, "第 3000 耐久 → +1");
  for (let i = 0; i < 20000; i++) g += RY.onDig(a, RC, D, 14);
  ok(g === 4 && a.ruby.day.digGot === 4 && a.ruby.day.dig === 0, "每天最多 4 顆，到上限後不再累積");
  g += RY.onDig(a, RC, "2026-10-07", 14);
  ok(a.ruby.day.date === "2026-10-07" && a.ruby.day.digGot === 0 && a.ruby.day.dig === 14, "換日進度歸零、重新累積");
  ok(RY.onDig(a, RC, null, 99999) === 0 && a.ruby.day.date === "2026-10-07", "日期未知：不發、不換日");
  ok(Math.round(RC.dig.need / RC.mines.m5.progress.perDur) === 1400 && Math.round(RC.dig.need / RC.mines.m6.progress.perDur) === 1200, "m5 約 1400、m6 約 1200 耐久一顆");

  // 委託：當天第一張全部完成 +2，一天一次
  const b = fresh();
  ok(RY.onBoard(b, RC, D, 2) === 0, "第 2 張不算");
  ok(RY.onBoard(b, RC, D, 1) === 2 && RY.onBoard(b, RC, D, 1) === 0, "第 1 張 +2，同一天不重複");
  ok(RY.onBoard(b, RC, "2026-10-07", 1) === 2, "隔天再 +2");

  // 恩惠：每週 7
  const c = fresh();
  ok(RY.onBoon(c, RC, D, 3) === 3 && RY.onBoon(c, RC, D, 5) === 4 && RY.onBoon(c, RC, D, 1) === 0, "每週上限 7（一次升多級也夾住）");
  ok(RY.onBoon(c, RC, "2026-10-11", 1) === 0, "同週週日仍滿");
  ok(RY.onBoon(c, RC, "2026-10-12", 1) === 1, "下週一重算");
  ok(RY.onBoon(c, RC, null, 1) === 0, "日期未知不發");

  // 凍結：每天 2 次、每週 8 顆
  const f = fresh(); let fz = 0;
  fz += RY.onFreeze(f, RC, "2026-10-05"); fz += RY.onFreeze(f, RC, "2026-10-05"); fz += RY.onFreeze(f, RC, "2026-10-05");
  ok(fz === 4 && f.ruby.day.frz === 2, "一天最多 2 次（+4）");
  fz += RY.onFreeze(f, RC, "2026-10-06") + RY.onFreeze(f, RC, "2026-10-06");
  fz += RY.onFreeze(f, RC, "2026-10-07");
  ok(fz === 8 && f.ruby.week.frz === 8, "本週累計到 8");
  ok(RY.onFreeze(f, RC, "2026-10-08") === 0 && f.ruby.day.frz === 0, "週上限到了：不發、也不吃掉當天次數");
  ok(RY.onFreeze(f, RC, "2026-10-12") === 2, "下週一恢復");

  // 廣告：網頁版不發，但照樣計數
  const h = fresh(); let ag = 0;
  for (let i = 0; i < 12; i++) ag += RY.onAd(h, RC, D);
  ok(ag === 0 && h.ruby.day.ads === 12, "enabled:false → 不發、計數 12");
  const RC2 = JSON.parse(JSON.stringify(RC)); RC2.ads.enabled = true;
  const h2 = fresh(); const got = [];
  for (let i = 1; i <= 13; i++) if (RY.onAd(h2, RC2, D)) got.push(i);
  ok(got.join() === "3,6,10,12" && h2.ruby.bal === 4, "開啟後第 3、6、10、12 次各 +1（每天 4 顆）");

  // 開帳號：每份存檔一次
  const w = fresh();
  ok(RY.onWelcome(w, RC, "t1", false) === 20 && RY.onWelcome(w, RC, "t2", true) === 0 && w.ruby.welcome.at === "t1" && w.ruby.welcome.srv === false, "開帳號 20 顆只發一次");
}

console.log("=== 5. 購買 ===");
{
  const s = fresh(); RY.add(s, RC, 30);
  ok(!RY.spend(s, 31) && s.ruby.bal === 30, "餘額不足：不扣");
  ok(RY.spend(s, 25) && s.ruby.bal === 5 && s.ruby.spent === 25 && s.ruby.got === 30, "扣款成功、累計花費");
  ok(!RY.spend(s, 25) && s.ruby.bal === 5, "連買第二次（不夠）→ 不會變負數");
  ok(!RY.spend(s, 0) && !RY.spend(s, -3) && !RY.spend(s, "x") && s.ruby.bal === 5, "0／負數／非數字價格一律拒絕");
  const m = fresh(); m.ruby.bal = RC.maxBal - 3;
  ok(RY.add(m, RC, 10) === 3 && m.ruby.bal === RC.maxBal, "加到上限為止");
}

console.log(`\n${fail ? "FAIL" : "PASS"}：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
