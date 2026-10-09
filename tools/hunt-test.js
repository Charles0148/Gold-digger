#!/usr/bin/env node
/* =========================================================
   冒險狩獵礦坑（js/mine-hunt.js）純邏輯測試：存檔補欄位、體力停住、預抽不可重抽、國度成敗、
   狩獵（三種呈現）、倒下／退出／結算入帳、演出補播、餵食（原子、無套利、不可餵的情況）
   用法：node tools/hunt-test.js        最後一行印 PASS／FAIL 摘要；失敗時結束碼 1
   數值讀 js/config.js 的 hunt（唯一來源）。畫面（hunt-ui／hunt-fx）請用 ?sandbox=名稱 在瀏覽器測。
   ========================================================= */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const C = require(path.join(ROOT, "js/config.js"));
const MH = require(path.join(ROOT, "js/mine-hunt.js"));
require(path.join(ROOT, "js/hunt-fx.js"));
const H = C.hunt, ST = H.stamina, ID = H.mine.id;

/* 回合戰鬥（第 15 節才測）：第 1～14 節測的是「一輪定勝負」的狀態機本身，先把每隻怪的輪數壓成 1 輪（等同舊版／舊存檔的戰鬥），第 15 節再還原成 config 的厚重輪數 */
const ROUNDS0 = JSON.parse(JSON.stringify(H.battle.rounds));
Object.keys(H.battle.rounds).forEach(k => { H.battle.rounds[k] = [1, 1]; });
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log("  ✘ FAIL " + name); } };
const J = o => JSON.parse(JSON.stringify(o));
const defOf = id => C.tools.find(t => t.id === id);
/* 既有第 1～15 節固定跑第二階段相容行程；第三階段另在後段用 fresh3 驗證，避免把舊回歸的期望值偷偷改掉。 */
const fresh = (stamina = 0, coins = 300) => { const sv = { v: 1, coins, tools: [], equipped: null }; MH.fix(sv, H); sv.huntMeta.stamina = stamina; MH.run(sv, H).rv = 2; return sv; };
const fresh3 = (stamina = 0, coins = 300) => { const sv = { v: 1, coins, tools: [], equipped: null }; MH.fix(sv, H); sv.huntMeta.stamina = stamina; MH.run(sv, H).rv = 3; return sv; };
const fresh4 = (stamina = 500, coins = 300) => { const sv = { v: 1, coins, tools: [], equipped: null }; MH.fix(sv, H); sv.huntMeta.stamina = stamina; MH.run(sv,H); return sv; };
const R = sv => MH.peek(sv, H);
/* 舊回歸多數只關心「整段演出完成後」的狀態；新終結技拆成蓄力／出招／暫待／復活，這個測試包裝器把整段跑完。
   新流程各停點與未入帳保證另在第 16 節逐步驗證。 */
const finishRaw = MH.finishAnim;
MH.finishAnim = function (sv, h, rid) {
  let r = MH.peek(sv, h);
  if (!r || !r.anim || r.anim.rid !== rid || r.anim.kind !== "finish") return finishRaw(sv, h, rid);
  if (r.anim.stage === "charge") MH.releaseCharge(sv, h, rid);
  r = MH.peek(sv, h);
  if (r.anim && r.anim.stage === "attack" && (r.anim.outcome === "lose" || r.anim.fake)) MH.pendingDefeat(sv, h, rid);
  r = MH.peek(sv, h);
  if (r.anim && r.anim.stage === "pending") MH.continueDefeat(sv, h, rid);
  r = MH.peek(sv, h);
  return r && r.anim && r.anim.rid === rid ? finishRaw(sv, h, rid) : { ok: true, ev: "done" };
};
/* 一路走到「發展」：回傳步數。setting 預設 3 */
function walkToDev(sv, setting = 3) { let n = 0; while (R(sv).phase === "walk") { const r = MH.step(sv, H, { setting }); if (!r.ok) throw new Error("walk " + r.reason); n++; if (n > 100) throw new Error("no dev"); } return n; }
/* 搜一個「國度成功」或「失敗」的種子：換新種子重跑，直到符合 */
function seedWhere(country, stamina = 500, setting = 3) {
  for (let i = 0; i < 5000; i++) { const sv = fresh(stamina); R(sv).seed = i * 7919 + 1; R(sv).seedP = i * 104729 + 5; walkToDev(sv, setting); if (R(sv).country.ok === country) return { sv, i }; }
  throw new Error("no seed");
}

console.log("=== 1. 設定值 ===");
ok(ST.perStep === 1 && ST.countryCost === 2 && ST.valuePer === 6 && ST.intro === 18 && ST.drillTotal === 1380, "每步 1／國度 2／1 體力＝6 金幣／初見禮 18／鑽頭 1380");
ok(H.walk.guarantee === 30 && H.lower.count === 3 && H.lower.win === 0.895 && H.lower.gold === 10 && H.dragon.win === 0.755 && H.dragon.gold === 83 && H.realm.heaven.cont === 0.83 && H.realm.heaven.gold === 44 && H.realm.hell.cont === 0.895 && H.realm.hell.gold === 65, "第三階段重新校準：下位 89.5/10、巨龍 75.5/83、天堂 83/44、地獄 89.5/65");
ok(H.mine.id === "m7" && H.mine.devOnly === true && H.mine.boardEligible === false && H.mine.toolsBrokenEligible === false, "m7 devOnly、不進委託板、不算用壞");
ok(!C.mines.some(m => m.id === "m7"), "m7 不在 config.mines（不會被委託板／圖鑑／模擬器誤算）");
{ const FX = globalThis.HuntFx, cuts = FX.COMBOS.map(c => c.cut), W = 390, HH = 844;
  const full = FX.COMBOS.every(c => { const g = FX.cutGeom(c, [W / 2, HH * .46], W, HH); return [-1, 1].every(s => { const x = g.p[0] + g.d[0] * g.span * s, y = g.p[1] + g.d[1] * g.span * s; return x < 0 || x > W || y < 0 || y > HH; }); });
  ok(cuts.map(c => c.angle).join() === "-55,28,0" && new Set(cuts.map(c => c.angle)).size === 3 && FX.COMBOS.every(c => c.cut.angle === c.last.cutAngle && Array.isArray(c.cut.at) && c.cut.at.length === 2 && c.cut.source) && full, "三套路切線角度不同、來自最後一刀，390 寬時兩端都穿出畫面"); }

console.log("=== 2. fixHuntSave：舊存檔補欄位、壞資料收斂 ===");
{
  const old = { v: 1, coins: 777, tools: [] };
  ok(MH.fix(old, H) === true && old.v === 1 && old.huntMeta.stamina === 0 && old.huntMeta.visits === 0 && old.huntMeta.gifted === false && J(old.huntRuns).constructor === Object, "沒有欄位 → 補預設，v 仍是 1，不動金幣");
  ok(old.coins === 777, "補欄位不動金幣");
  ok(MH.fix(old, H) === false, "冪等：第二次沒有修改");
  const b = { v: 1, coins: 10, huntMeta: { stamina: -5, visits: "x", seenLight: 1, gifted: "yes", claimed: [] }, huntRuns: {} };
  MH.fix(b, H);
  ok(b.huntMeta.stamina === 0 && b.huntMeta.visits === 0 && b.huntMeta.seenLight === false && b.huntMeta.gifted === false && !Array.isArray(b.huntMeta.claimed), "體力負數／亂型別 → 夾回合法值");
  const c = { v: 1, coins: 10, huntMeta: { stamina: 9e15 }, huntRuns: {} };
  MH.fix(c, H); ok(c.huntMeta.stamina === ST.cap, "體力夾在上限");
  const d = { v: 1, coins: 100, huntRuns: { m7: { phase: "???", gold: 55, seed: 1, seedP: 2 }, m9: { phase: "walk" } } };
  MH.fix(d, H);
  ok(d.coins === 155 && R(d).phase === "walk" && R(d).gold === 0 && !d.huntRuns.m9, "不認得的狀態 → 先把本輪累積金幣入帳（55），落回旅途；其他礦坑紀錄丟掉");
  const e = { v: 1, coins: 0, huntRuns: { m7: { phase: "hunt", seed: 5, seedP: 6, n: 0, nP: 0, since: 0, kills: 9, gold: 20, mon: null, anim: null } } };
  MH.fix(e, H); ok(e.coins === 20 && R(e).phase === "walk", "隻數超過上限 → 視為壞資料，金幣照拿");
  const f = { v: 1, coins: 0, huntRuns: { m7: { phase: "hunt", seed: 5, seedP: 6, n: 0, nP: 0, since: 0, kills: 1, gold: 11, mon: { win: true, pres: 1 }, anim: { kind: "kill", pick: 1, rid: 1 }, after: "spawn", rid: 1, last: null } } };
  MH.fix(f, H); ok(R(f).phase === "hunt" && R(f).anim.rid === 1 && f.coins === 0, "演出待播的合法狀態原樣保留");
  const g = J(f); R(g).after = "oops"; MH.fix(g, H); ok(R(g).phase === "walk" && g.coins === 11, "演出待播但後續未知 → 收斂並入帳");
}

console.log("=== 3. 初見禮、體力停住（狀態保留、不重抽） ===");
{
  const sv = fresh(0);
  ok(MH.gift(sv, H) === 18 && sv.huntMeta.stamina === 18 && sv.huntMeta.gifted === true && MH.gift(sv, H) === 0 && sv.huntMeta.stamina === 18, "初見禮 18 體力，只給一次");
  const s0 = fresh(0), n0 = R(s0).n;
  const r = MH.step(s0, H, { setting: 3 });
  ok(!r.ok && r.reason === "hungry" && R(s0).n === n0 && R(s0).since === 0 && s0.huntMeta.stamina === 0, "體力 0：走不動，不抽、不扣、狀態不變");
  ok(MH.halted(s0, H) && MH.need(s0, H) === 1, "停住：需要 1 體力");
  const s1 = fresh(5); const r1 = MH.step(s1, H, { setting: 0 });
  ok(!r1.ok && r1.reason === "nosetting" && s1.huntMeta.stamina === 5 && R(s1).n === 0, "日期未知（沒有設定）：不能走新的一步，不扣體力");
  const s2 = fresh(40); const steps = walkToDev(s2);
  ok(steps <= 30 && s2.huntMeta.stamina === 40 - steps, `每步扣 1（走 ${steps} 步、體力 ${s2.huntMeta.stamina}）`);
  ok(R(s2).phase === "dev" && MH.need(s2, H) === 2, "發展後下一步付 2（國度）");
  s2.huntMeta.stamina = 1;
  ok(MH.halted(s2, H) && MH.enterCountry(s2, H).reason === "hungry" && R(s2).phase === "dev" && s2.huntMeta.stamina === 1, "體力 1 進不了國度（需要 2）：停住、不扣、狀態保留");
  s2.huntMeta.stamina = 2;
  ok(MH.enterCountry(s2, H).ok && s2.huntMeta.stamina === 0 && R(s2).phase === "country", "餵到 2 → 進國度扣 2");
}

console.log("=== 4. 預抽：重新整理不能重抽；保底 30 步 ===");
{
  // 同一個存檔「走到一半存檔、重開」與「不重開」結果完全相同
  // 每一步都「存檔→讀檔」再走，與連續走完全相同（讀檔重來抽不到不同的結果）
  const x = fresh(500); R(x).seed = 4242; R(x).seedP = 99;
  let y = J(x); const evx = [], evy = [];
  for (let i = 0; i < 60 && R(x).phase === "walk"; i++) { evx.push(MH.step(x, H, { setting: 2 }).ev); y = J(y); evy.push(MH.step(y, H, { setting: 2 }).ev); }
  ok(evx.join() === evy.join() && JSON.stringify(R(x)) === JSON.stringify(R(y)), "每一步存檔重讀 ＝ 連續走（種子＋次數都在存檔裡）");
  const x2 = J(x), x3 = J(x);   // 在「發展」狀態存檔、讀檔：結果一致
  ok(R(x).phase === "dev" && JSON.stringify(R(x2).country) === JSON.stringify(R(x3).country) && R(x2).dev.kind === R(x).dev.kind, "發展與國度成敗已存檔：重新整理看到同一個結果");
  // 走路的抽選只由 seed 與 n 決定：從同一個存檔狀態各走一步，結果相同
  const p = fresh(50); R(p).seed = 777; const q = J(p);
  ok(MH.step(p, H, { setting: 3 }).ev === MH.step(q, H, { setting: 3 }).ev && R(p).n === R(q).n, "同一個存檔狀態＋同一步 → 同一個結果（讀檔重來不能換結果）");
  // 保底：設定 1（發展率最低）連續 30 步內必定遇到發展
  let worst = 0;
  for (let i = 0; i < 3000; i++) { const s = fresh(100); R(s).seed = i * 31 + 7; worst = Math.max(worst, walkToDev(s, 1)); }
  ok(worst <= 30, `3000 次實測最長 ${worst} 步遇到發展（保底 30）`);
  const g = fresh(100); R(g).since = 29; R(g).seed = 5;
  ok(MH.step(g, H, { setting: 1 }).ev === "dev", "已走 29 步沒發展 → 第 30 步必定發展");
}

console.log("=== 5. 國度：成功進狩獵、失敗空手凱旋；造訪次數成敗皆算 ===");
{
  const bad = seedWhere(false);
  let sv = bad.sv; MH.enterCountry(sv, H);
  ok(MH.pickCountry(sv, H, 1).success === false && sv.huntMeta.visits === 1, "失敗也算造訪 +1");
  ok(!MH.pickCountry(sv, H, 0).ok && sv.huntMeta.visits === 1, "同一個國度不能重複選（造訪不會重複 +1）");
  const coins = sv.coins, st = sv.huntMeta.stamina;
  ok(MH.afterCountry(sv, H).ev === "done" && R(sv).phase === "done" && R(sv).last.why === "empty" && R(sv).last.gold === 0 && sv.coins === coins && sv.huntMeta.stamina === st, "失敗：空手凱旋，金幣不變、體力保留");
  const oldSeed = R(sv).seed;
  ok(MH.again(sv, H).ok && R(sv).phase === "walk" && R(sv).seed !== oldSeed && R(sv).kills === 0 && R(sv).gold === 0, "凱旋後再出發：新的一輪、換新種子");
  const good = seedWhere(true); sv = good.sv; MH.enterCountry(sv, H);
  ok(!MH.pickCountry(sv, H, 5).ok && !MH.afterCountry(sv, H).ok, "還沒選就不能往下；選項超出範圍無效");
  MH.pickCountry(sv, H, 0);
  const st2 = sv.huntMeta.stamina, r = MH.afterCountry(sv, H);
  ok(r.ok && R(sv).phase === "hunt" && R(sv).mon && sv.huntMeta.stamina === st2 - 1, "成功：進狩獵，第一隻怪付 1 體力、預抽勝負與呈現");
}

console.log("=== 6. 狩獵：三種呈現、擊倒入帳、倒下照拿、一律凱旋才入帳 ===");
function toHunt(sv, win, pres) {   // 用開發者設定直接進狩獵並強制預抽
  MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win, pres } });
  return MH.spawn(sv, H);
}
{
  const sv = fresh(100, 1000);
  toHunt(sv, true, 0);
  ok(R(sv).mon.pres === 0 && !MH.strike(sv, H, 1).ok, "單鈕：只能選 0");
  ok(MH.strike(sv, H, 0).ok && R(sv).anim.kind === "finish" && R(sv).anim.stage === "charge" && R(sv).gold === 0 && R(sv).kills === 0 && sv.coins === 1000, "最後一輪：先存蓄力與終結技，尚未增加擊倒／本輪金幣／錢包");
  ok(!MH.strike(sv, H, 0).ok, "演出中不能再出招");
  const rid = R(sv).anim.rid;
  ok(MH.finishAnim(sv, H, rid + 5).reason === "state" && R(sv).anim, "rid 對不上不動作");
  const st = sv.huntMeta.stamina; ok(MH.finishAnim(sv, H, rid).ev === "mon" && R(sv).mon && sv.huntMeta.stamina === st - 1 && R(sv).kills === 1, "演出播完 → 下一隻（付 1 體力）");
  ok(!MH.finishAnim(sv, H, rid).ok, "同一個演出不會重複前進／重複入帳");
  R(sv).force = { win: true, pres: 2 }; MH.devSet(sv, H, { phase: "hunt", kills: 1, force: { win: true, pres: 2 } }); R(sv).mon = null; R(sv).anim = null; MH.spawn(sv, H);
  ok(R(sv).mon.pres === 2 && MH.strike(sv, H, 2).ok && R(sv).anim.pick === 2, "三選一：可選 0～2");
  MH.finishAnim(sv, H, R(sv).anim.rid);
  ok(R(sv).kills === 2 && R(sv).mon && R(sv).gold === 22, "第二隻打完 → 第三隻");
  R(sv).mon.win = true; MH.strike(sv, H, 0);
  const coinsBefore = sv.coins;
  const fin = MH.finishAnim(sv, H, R(sv).anim.rid);
  ok(fin.ok && R(sv).phase === "dragon" && R(sv).mon && R(sv).mon.pres === 2 && R(sv).gold === 33 && sv.coins === coinsBefore && R(sv).kills === 3, "打滿 3 隻：接到巨龍（自動付體力、金幣還在本輪、沒有入帳）");
}
{
  const sv = fresh(100, 500);
  toHunt(sv, true, 1);
  MH.strike(sv, H, 1); MH.finishAnim(sv, H, R(sv).anim.rid);   // 先打倒一隻
  MH.devSet(sv, H, { phase: "hunt", kills: R(sv).kills, force: { win: false, pres: 1 } }); R(sv).mon = null; R(sv).anim = null; MH.spawn(sv, H);
  ok(R(sv).mon.win === false && MH.strike(sv, H, 0).ok && R(sv).anim.kind === "finish" && R(sv).anim.outcome === "lose" && sv.coins === 500, "角色倒下：先播蓄力與敗北終結技，金幣還沒入帳");
  const st = sv.huntMeta.stamina; MH.finishAnim(sv, H, R(sv).anim.rid);
  ok(R(sv).phase === "done" && R(sv).last.why === "down" && sv.coins === 511 && sv.huntMeta.stamina === st, "倒下 → 凱旋：已累積的 11 金幣照拿，體力保留");
}

console.log("=== 7. 退出礦坑：金幣照拿、體力保留、本輪進度清除 ===");
{
  const sv = fresh(77, 100);
  toHunt(sv, true, 0); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid);
  const res = MH.leave(sv, H);
  ok(res.gold === 11 && sv.coins === 111 && sv.huntMeta.stamina === 77 - 2 && !sv.huntRuns.m7, "退出：11 金幣入帳、本輪紀錄刪除、體力保留");
  ok(MH.leave(sv, H).gold === 0 && sv.coins === 111, "沒有進度時退出不多給");
  const v = fresh(99, 50); walkToDev(v, 6); ok(MH.inProgress(v, H), "走到發展：算進行中（離開時提醒）");
  const w = fresh(9, 50); ok(!MH.inProgress(w, H), "剛進來沒走：不用提醒");
  const dn = fresh(9, 50); toHunt(dn, true, 0); MH.strike(dn, H, 0);   // 演出播到一半就退出
  ok(MH.leave(dn, H).gold === 0 && dn.coins === 50, "終結技完成前退出：未完成這隻不給金幣，既有累積仍會照拿");
}

console.log("=== 8. 演出播到一半關掉遊戲：重開後補播，不重抽 ===");
{
  const sv = fresh(100, 0);
  toHunt(sv, true, 1); MH.strike(sv, H, 1);
  const saved = J(sv);                       // 這一刻存檔，然後關掉遊戲
  MH.fix(saved, H);
  ok(R(saved).anim && R(saved).anim.kind === "finish" && R(saved).anim.stage === "charge" && R(saved).anim.pick === 1 && R(saved).gold === 0, "存檔裡有待補播的蓄力／終結技，尚未先給金幣");
  const before = JSON.stringify(R(saved).mon), n = R(saved).n;
  ok(JSON.stringify(R(saved).mon) === before && R(saved).n === n, "重開不重抽");
  ok(MH.finishAnim(saved, H, R(saved).anim.rid).ok && R(saved).kills === 1, "補播完成後才往下");
}

console.log("=== 9. 停住時餵食 → 回到原處（不重抽、不重播） ===");
{
  const sv = fresh(1, 0);
  toHunt(sv, true, 0); MH.strike(sv, H, 0);          // 體力 0 了
  MH.finishAnim(sv, H, R(sv).anim.rid);              // 下一隻付不起
  ok(R(sv).phase === "hunt" && !R(sv).mon && MH.halted(sv, H) && R(sv).kills === 1 && R(sv).gold === 11, "狩獵中沒體力：停住，累積金幣與隻數保留");
  const n = R(sv).n, nP = R(sv).nP;
  sv.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }];
  ok(MH.feed(sv, H, defOf, [1]).gained === 18 && sv.huntMeta.stamina === 18, "餵一把木鎬 +18");
  ok(R(sv).n === n && R(sv).nP === nP, "餵食本身不抽");
  ok(MH.spawn(sv, H).ok && R(sv).n === n + 1 && R(sv).nP === nP + 1 && sv.huntMeta.stamina === 17, "回到原處：付 1 體力、各抽一次（不重抽）");
}

console.log("=== 10. 餵食：原子、二次檢查、無套利、不可餵 ===");
{
  const sv = fresh(0);
  sv.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }, { uid: 2, id: "iron", dur: 100, max: 200 }, { uid: 3, id: "redrockTrial", dur: 1000, max: 1000 }, { uid: 4, id: "wood", dur: 3, max: 60 }, { uid: 5, id: "redrock", dur: 1000, max: 1000 }];
  sv.equipped = 2;
  const p = MH.feedPreview(sv, H, defOf, [1, 2]);
  ok(p.n === Math.floor(60 * 110 / 60 / 6 + 100 * 800 / 200 / 6 + 1e-9) && p.count === 2, `多把先加總再捨去：18.33＋66.67＝85（實際 ${p.n}）`);
  ok(MH.feedable(H, defOf("redrockTrial"), sv.tools[2]).why === "trial" && !MH.feed(sv, H, defOf, [3]).ok && sv.tools.length === 5, "試用版鑽頭不可餵、沒有任何變動");
  ok(MH.feedable(H, defOf("wood"), sv.tools[3]).why === "small" && !MH.feed(sv, H, defOf, [4]).ok && sv.tools.length === 5, "換算 0 的破鎬子不可餵、沒有任何變動");
  ok(!MH.feed(sv, H, defOf, [1, 999]).ok && sv.tools.length === 5 && sv.huntMeta.stamina === 0, "選到不存在的鎬子 → 整筆不成立");
  const toolsBefore = J(sv.tools);
  const r = MH.feed(sv, H, defOf, [1, 2, 1]);
  ok(r.ok && r.gained === 85 && r.count === 2 && sv.huntMeta.stamina === 85 && sv.tools.map(t => t.uid).join() === "3,4,5" && sv.equipped === null, "餵 2 把（重複 uid 只算一次）：+85、鎬子移除、裝備清空");
  ok(toolsBefore.length === 5, "（測試自身檢查）");
  const big = MH.feed(sv, H, defOf, [5]);
  ok(big.ok && big.gained === ST.drillTotal && sv.huntMeta.stamina === 85 + 1380, "紅岩鑽頭滿耐久 = 1,380");
  const cap = fresh(ST.cap - 5); cap.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }];
  ok(MH.feed(cap, H, defOf, [1]).reason === "cap" && cap.tools.length === 1 && cap.huntMeta.stamina === ST.cap - 5, "會超過體力上限時整筆不成立（不吞掉鎬子）");
  const busy = fresh(5); busy.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }]; toHunt(busy, true, 0); MH.strike(busy, H, 0);
  ok(MH.feed(busy, H, defOf, [1]).reason === "busy" && busy.tools.length === 1, "演出播放中不能餵食");
  // 不算用壞／不碰其他欄位
  const keep = fresh(0); keep.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }]; keep.stat = { toolsBroken: 7 }; keep.ruby = { dig: 5 };
  MH.feed(keep, H, defOf, [1]);
  ok(keep.stat.toolsBroken === 7 && keep.ruby.dig === 5, "餵食不算用壞、不動紅晶進度");
}

console.log("=== 10b. 餵食時機：只有旅途、發展揭曉後、停住時 ===");
{
  const mk = () => { const sv = fresh(50); sv.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }]; return sv; };
  const t = (sv, label, want) => { const before = sv.huntMeta.stamina, r = MH.feed(sv, H, defOf, [1]); ok(want ? r.ok : (!r.ok && r.reason === "phase" && sv.tools.length === 1 && sv.huntMeta.stamina === before), label + (want ? "：可餵" : "：不可餵（整筆不成立）")); ok(MH.canFeed(want ? mk() : sv, H) === want, label + " canFeed"); };
  t(mk(), "旅途", true);
  const d = mk(); MH.devSet(d, H, { phase: "dev", kind: "cave", ok: true }); t(d, "發展揭曉後", true);
  const c = mk(); MH.devSet(c, H, { phase: "country", kind: "cave", ok: true }); t(c, "國度中", false);
  const m = mk(); toHunt(m, true, 1); t(m, "狩獵中有怪物等著出招", false);
  const dn = mk(); MH.devSet(dn, H, { phase: "walk" }); R(dn).phase = "done"; R(dn).last = { gold: 0, kills: 0, why: "empty" }; t(dn, "凱旋畫面", false);
  const h = fresh(0); h.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }]; MH.devSet(h, H, { phase: "hunt", kills: 1 });
  ok(MH.halted(h, H) && MH.canFeed(h, H) && MH.feed(h, H, defOf, [1]).ok, "狩獵中沒體力（停住）：可餵");
  const full = fresh(ST.cap - 5); full.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }];
  ok(MH.feed(full, H, defOf, [1]).reason === "cap" && full.tools.length === 1, "體力快滿：回 cap（UI 顯示「體力已滿」）");
}

console.log("=== 11. 開發者設定、種子、雜湊 ===");
{
  const vals = []; for (let i = 0; i < 20000; i++) vals.push(MH.mix(123, i));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  ok(vals.every(v => v >= 0 && v < 1) && Math.abs(mean - 0.5) < 0.01, "種子抽選在 [0,1) 且平均約 0.5");
  ok(MH.mix(5, 9) === MH.mix(5, 9) && MH.mix(5, 9) !== MH.mix(5, 10) && MH.mix(5, 9) !== MH.mix(6, 9), "同種子同次數 → 同結果；不同則不同");
  const sv = fresh(10); MH.devSet(sv, H, { phase: "dev", kind: "map", ok: false });
  ok(R(sv).phase === "dev" && R(sv).dev.kind === "map" && R(sv).country.ok === false, "devSet 跳到發展");
}

console.log("=== 12. 怪物（精美版 14 隻＋角色）===");
{
  const HM = require(path.join(ROOT, "js/hunt-mon.js"));
  const HA = require(path.join(ROOT, "js/hunt-mon-art.js"));
  ok(HM.count === 6 && C.hunt.texts.monNames.length === HM.count, "怪物 6 種，名稱數量一致（洞影蝠、影蜘蛛、幽影、影菇、影泥、石影像）");
  const uris = new Set(); let good = true;
  for (let i = 0; i < 6; i++) { const m = HM.get(i); uris.add(m.uri); if (!(m.w > 8 && m.h > 8 && m.cell.length === m.h && m.cell.flat().some(Boolean) && m.svg.includes("<svg"))) good = false; }
  ok(good && uris.size === 6, "每種都畫得出來（有像素格、有 SVG），6 種圖各不相同");
  ok(HM.total === 15 && HM.get(15) === HM.get(0) && HM.get(-1) === HM.get(14), "變體編號循環（6 種下位怪＋6 種狹間怪＋巨龍 2 種＋角色 共 15）");
  const rm = [...HM.realm.heaven, ...HM.realm.hell].concat([HM.DRAGON, HM.DRAGON_BROKEN]);
  ok(rm.every(i => { const m = HM.get(i); return m.w > 8 && m.h > 8 && m.eyes.length > 0 && m.cell.flat().some(Boolean); }) && new Set(rm.map(i => HM.get(i).uri)).size === 8, "狹間 6 種新怪＋巨龍 2 種都畫得出來、各不相同、有眼睛可供擊殺演出使用");
  ok(C.hunt.texts.realmMonNames.heaven.length === 3 && C.hunt.texts.realmMonNames.hell.length === 3, "狹間怪名稱天堂 3／地獄 3");
  const dims = HA.list.map((m, i) => { const b = fs.readFileSync(path.join(ROOT, m.sprite)); return [m.w, m.h, b.readUInt32BE(16), b.readUInt32BE(20), HM.get(i).eyes.length]; });
  ok(dims.slice(0, 6).every(d => d[0] === 40 && d[1] === 40 && d[2] === 160 && d[3] === 40 && d[4] > 0) && dims.slice(6, 12).every(d => d[0] === 48 && d[1] === 48 && d[2] === 192 && d[3] === 48 && d[4] > 0), "下位 40×40、狹間 48×48：PNG 都是橫排四格且有反黑眼睛座標");
  ok(dims.slice(12).every(d => d[0] === 128 && d[1] === 108 && d[2] === 512 && d[3] === 108 && d[4] > 0) && /駭骨巨龍/.test(HA.list[12].name) && /破鱗後/.test(HA.list[13].name), "巨龍 v2／破鱗後 v2 為 128×108、橫排四格且有反黑眼睛座標");
  const tt = C.hunt.texts.scene.turn, all = Object.keys(tt).reduce((n, k) => n + tt[k].cont.length + tt[k].end.length, 0);
  ok(Object.keys(tt).length === 6 && all === 36 && Object.keys(tt).every(k => tt[k].cont.length === 3 && tt[k].end.length === 3), "狹間場景 5 種（光羽／焰流分兩組）共 36 句：繼續 3＋結束 3");
  ok(!/再一次|可惜|中獎|大當|稀有|超強|第 ?\{?\w*\}? ?隻/.test(JSON.stringify(C.hunt.texts.scene)), "演出文字沒有審查員禁用字眼（再一次／可惜／中獎／大當／稀有／超強／第 N 隻）");
  const txt = JSON.stringify(C.hunt.texts);
  ok(!/史萊姆/.test(txt) && /\{name\}/.test(txt), "文字不再寫死史萊姆，改用 {name}");
}

console.log("=== 13. 斬擊套路（突刺→C、橫掃→A、蓄力→B；單鈕怪隨機，預抽並存檔）===");
{
  // 選項怪：套路由玩家選的招式決定
  for (const pick of [0, 1, 2]) {
    const sv = fresh(50); toHunt(sv, true, 2); const r = MH.strike(sv, H, pick);
    ok(r.ok && R(sv).anim.combo === pick && R(sv).anim.pick === pick, `三選一選第 ${pick} 招 → 套路 ${pick}`);
  }
  const two = fresh(50); toHunt(two, true, 1); MH.strike(two, H, 1); ok(R(two).anim.combo === 1, "二選一選橫掃 → 套路 1（A）");
  // 單鈕怪：預抽時就有套路，存檔後不變
  const one = fresh(50); toHunt(one, true, 0);
  const cb = R(one).mon.combo; ok([0, 1, 2].includes(cb), "單鈕怪預抽時就決定套路");
  const reloaded = J(one); MH.fix(reloaded, H);
  ok(R(reloaded).mon.combo === cb, "重新整理（存檔重讀）套路不變");
  MH.strike(one, H, 0); ok(R(one).anim.combo === cb, "出招後演出的套路 ＝ 預抽的套路");
  const reload2 = J(one); MH.fix(reload2, H); ok(R(reload2).anim.combo === cb, "演出播到一半重新整理：補播同一套路");
  // 單鈕怪的套路三種都會出現、大致平均，且不多抽（每隻怪仍是勝負 1 抽＋呈現 1 抽）
  const cnt = [0, 0, 0]; let n1 = 0, drawsOk = true;
  for (let i = 0; i < 6000; i++) {
    const sv = fresh(50); R(sv).seed = i * 7 + 1; R(sv).seedP = i * 13 + 5; MH.devSet(sv, H, { phase: "hunt", kills: 0 });
    const n0 = R(sv).n, p0 = R(sv).nP; MH.spawn(sv, H);
    if (R(sv).n !== n0 + 1 || R(sv).nP !== p0 + 1) drawsOk = false;
    if (R(sv).mon.pres === 0) { n1++; cnt[R(sv).mon.combo]++; }
  }
  ok(drawsOk, "套路不多抽（勝負 +1、呈現 +1）");
  ok(n1 > 2500 && cnt.every(c => Math.abs(c / n1 - 1 / 3) < 0.04), `單鈕怪三種套路各約三分之一（${cnt.map(c => (c / n1 * 100).toFixed(0) + "%").join("/")}）`);
  const old = { v: 1, coins: 0, huntRuns: { m7: { phase: "hunt", seed: 5, seedP: 6, n: 0, nP: 0, since: 0, kills: 1, gold: 11, mon: { win: true, pres: 0 }, anim: { kind: "kill", pick: 2, rid: 1 }, after: "spawn", rid: 1, last: null } } };
  MH.fix(old, H); ok(R(old).anim.combo === 2 && R(old).mon.combo === 0, "舊存檔（沒有套路欄位）演出待播：套路補成選項");
}

console.log("=== 14. 第二階段：巨龍、判定、狹間、餘燼（規格 第二階段規格_2026-10-08）===");
{
  const D = H.dragon, RM = H.realm;
  ok(D.win === 0.755 && D.gold === 83 && D.warnStamina === 25 && RM.entryHeaven === 0.90 && RM.ember === 0.54 && RM.heaven.cap === 20 && RM.hell.cap === 10 && RM.heaven.gold === 44 && RM.hell.gold === 65 && !H.later, "巨龍／狹間採第三階段校準值，later 已刪");
  const toDragon = (st = 100, force) => { const sv = fresh(st, 1000); MH.devSet(sv, H, { phase: "dragon", force }); MH.spawn(sv, H); return sv; };
  // 抽選次數寫死：巨龍 draw×2、drawP×0；狹間每隻 draw×1、drawP×1；進餘燼 draw×2
  { const sv = fresh(100); MH.devSet(sv, H, { phase: "dragon" }); const n0 = R(sv).n, p0 = R(sv).nP; MH.spawn(sv, H);
    ok(R(sv).n === n0 + 2 && R(sv).nP === p0 && sv.huntMeta.stamina === 99 && R(sv).mon.pres === 2 && ["heaven", "hell"].includes(R(sv).mon.entry), "巨龍付 1 體力：draw×2、drawP×0、固定三選一"); }
  { const sv = fresh(100); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 3 }); const n0 = R(sv).n, p0 = R(sv).nP; MH.spawn(sv, H);
    ok(R(sv).n === n0 + 1 && R(sv).nP === p0 + 1 && R(sv).mon.win === true && typeof R(sv).mon.cont === "boolean", "狹間每隻：draw×1、drawP×1"); }
  { const sv = fresh(100); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 19 }); MH.spawn(sv, H); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); const n0 = R(sv).n; ok(R(sv).phase === "ember" && R(sv).ember && R(sv).n === n0, "撐滿後進餘燼（進入時 draw 已發生）"); }
  { const sv = fresh(100); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 19, force: { cont: false } }); MH.spawn(sv, H); MH.strike(sv, H, 0); const n0 = R(sv).n; MH.finishAnim(sv, H, R(sv).anim.rid); ok(R(sv).n === n0 + 2, "進餘燼：draw×2（成功、下一輪天堂）"); }
  // 固定 seed 對照表：同一個 seed 重放兩次結果一樣
  { const seq = () => { const sv = fresh(1000); R(sv).seed = 31337; R(sv).seedP = 777; MH.devSet(sv, H, { phase: "dragon" }); R(sv).seed = 31337; R(sv).seedP = 777; R(sv).n = 0; R(sv).nP = 0; const out = [];
      MH.spawn(sv, H); out.push(R(sv).mon.win + R(sv).mon.entry); R(sv).mon.win = true;
      for (let g = 0; g < 400 && R(sv).phase !== "done"; g++) { const r = R(sv); if (r.anim) { MH.finishAnim(sv, H, r.anim.rid); } else if (r.mon) { out.push(r.phase + (r.mon.cont === undefined ? "" : r.mon.cont ? "c" : "e") + r.mon.pres + r.mon.combo); MH.strike(sv, H, 0); } else if (r.phase === "ember") { out.push("E" + r.ember.ok + r.ember.next); MH.ignite(sv, H); } }
      return out.join("|"); };
    ok(seq() === seq() && seq().length > 20, "固定 seed 重放兩次：巨龍／狹間／餘燼結果一模一樣"); }
  // 巨龍勝：金幣 +90 → 判定 → 狹間
  { const sv = toDragon(100, { win: true, entry: "hell" }); ok(R(sv).mon.entry === "hell" && R(sv).mon.win, "強制巨龍勝、地獄入口");
    ok(!MH.strike(sv, H, 3).ok && MH.strike(sv, H, 2).ok && R(sv).anim.combo === 2 && R(sv).anim.kind === "finish" && R(sv).gold === 0 && R(sv).after === null && sv.coins === 1000, "巨龍三選一出招：套路＝所選，結果完成前不先加金幣");
    const saved = J(sv); MH.fix(saved, H); ok(R(saved).phase === "dragon" && R(saved).anim && R(saved).mon.entry === "hell", "演出中重新整理：巨龍演出補播、入口類型不變");
    const rid = R(sv).anim.rid;
    ok(MH.finishAnim(sv, H, rid).ev === "judge" && R(sv).phase === "realm" && R(sv).anim.kind === "judge" && R(sv).anim.type === "hell" && R(sv).anim.first === true && R(sv).realm.type === "hell" && R(sv).realm.n === 0 && !R(sv).mon, "播完 → 判定演出（地獄、第一次）");
    ok(!MH.finishAnim(sv, H, rid).ok, "同一演出不重複前進");
    const jr = J(sv); MH.fix(jr, H); ok(R(jr).anim.kind === "judge" && R(jr).anim.type === "hell", "判定演出中重新整理：補播判定、結果不變");
    const st = sv.huntMeta.stamina; ok(MH.finishAnim(sv, H, R(sv).anim.rid).ev === "mon" && R(sv).mon.win && sv.huntMeta.stamina === st - 1 && MH.need(sv, H) === 0, "判定播完 → 自動付 1 體力遇第一隻狹間怪"); }
  // 巨龍敗 → 撤退，金幣照拿
  { const sv = toDragon(100, { win: false, entry: "heaven" }); sv.coins = 500; R(sv).gold = 33;
    ok(MH.strike(sv, H, 1).ok && R(sv).anim.kind === "finish" && R(sv).anim.outcome === "lose" && R(sv).gold === 33 && R(sv).after === null, "巨龍敗：蓄力後進敗北終結技，不加金幣");
    MH.finishAnim(sv, H, R(sv).anim.rid);
    ok(R(sv).last.dragon === true, "巨龍敗北：結算標記 dragon（用專屬句子）");
    ok(R(sv).phase === "done" && R(sv).last.why === "down" && sv.coins === 533 && R(sv).last.gold === 33 && !R(sv).realm, "巨龍敗 → 撤退結算，下位 33 金幣照拿，沒有進狹間"); }
  // 巨龍前沒體力：停住、餵食後原處接上、不重抽
  { const sv = fresh(1, 0); toHunt(sv, true, 0); MH.strike(sv, H, 0); R(sv).kills = 2; R(sv).after = "full";
    MH.finishAnim(sv, H, R(sv).anim.rid);
    ok(R(sv).phase === "dragon" && !R(sv).mon && MH.halted(sv, H) && MH.canFeed(sv, H) && MH.need(sv, H) === 1, "下位打滿但體力 0：停在巨龍前（不顯示為凱旋）");
    sv.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }]; const n = R(sv).n; MH.feed(sv, H, defOf, [1]); ok(R(sv).n === n, "餵食不抽");
    MH.spawn(sv, H); const j = J(sv); MH.fix(j, H); ok(JSON.stringify(R(j).mon) === JSON.stringify(R(sv).mon), "付體力後重新整理：勝負、入口類型不重抽"); }
  // 第一階段存檔：播第 3 隻擊殺演出（after:"full"）→ 接巨龍不卡
  { const old = { v: 1, coins: 0, huntMeta: { stamina: 50 }, huntRuns: { m7: { phase: "hunt", seed: 5, seedP: 6, n: 7, nP: 3, since: 0, kills: 3, gold: 33, mon: { win: true, pres: 0, combo: 1 }, anim: { kind: "kill", pick: 0, rid: 3, combo: 1 }, after: "full", rid: 3, last: null } } };
    MH.fix(old, H); ok(R(old).phase === "hunt" && R(old).anim && R(old).realm === null && R(old).ember === null, "第一階段存檔：缺的新欄位補 null、演出保留");
    ok(MH.finishAnim(old, H, 3).ev === "mon" && R(old).phase === "dragon" && R(old).gold === 33 && old.coins === 0, "after:'full' 解讀為接到巨龍（不當凱旋）");
    const dn = { v: 1, coins: 0, huntRuns: { m7: { phase: "done", seed: 5, seedP: 6, n: 7, nP: 3, since: 0, kills: 3, gold: 0, mon: null, anim: null, after: null, rid: 3, last: { gold: 33, kills: 3, why: "full" } } } };
    MH.fix(dn, H); ok(R(dn).phase === "done" && R(dn).last.why === "full", "第一階段凱旋（why:full）原樣保留"); }
  // 狹間：金幣、隻數、繼續／結束、不會倒下
  { const sv = fresh(100, 0); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 0, force: { cont: true, pres: 0 } }); MH.spawn(sv, H);
    ok(!MH.strike(sv, H, 1).ok && MH.strike(sv, H, 0).ok && R(sv).gold === 0 && R(sv).realm.n === 0 && R(sv).anim.kind === "finish", "天堂出招後先播完整終結技，不提前改金幣／隻數");
    MH.finishAnim(sv, H, R(sv).anim.rid); ok(R(sv).mon && R(sv).phase === "realm", "繼續 → 下一隻（付 1 體力）");
    R(sv).mon.cont = false; MH.strike(sv, H, 0); ok(R(sv).anim.kind === "finish" && R(sv).after === null, "這隻 cont=false → 終結技後才結束");
    const coins = sv.coins; MH.finishAnim(sv, H, R(sv).anim.rid);
    ok(R(sv).phase === "done" && R(sv).last.why === "realm" && R(sv).last.gold === 68 && R(sv).last.realmKills === 2 && sv.coins === coins + 68 && !R(sv).realm, "狹間結束 → 凱旋：金幣一次入帳、realm 清除、統計"); }
  { const sv = fresh(100, 0); MH.devSet(sv, H, { phase: "realm", type: "hell", n: 0, force: { cont: true } }); MH.spawn(sv, H); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid);
    ok(R(sv).gold === 68, "地獄終結技完成後 +68"); }
  // 狹間中體力 0：停住不動、狀態保留；餵食後從原處接上
  { const sv = fresh(1, 0); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 4, force: { cont: true } }); MH.spawn(sv, H); MH.strike(sv, H, 0);
    MH.finishAnim(sv, H, R(sv).anim.rid);
    ok(R(sv).phase === "realm" && !R(sv).mon && R(sv).realm.n === 5 && MH.halted(sv, H) && MH.canFeed(sv, H) && R(sv).gold === 34, "狹間體力 0：停住，隻數與金幣保留，可餵食");
    const j = J(sv); MH.fix(j, H); ok(R(j).phase === "realm" && !R(j).mon && R(j).realm.n === 5, "停住時重新整理：原樣");
    sv.tools = [{ uid: 1, id: "wood", dur: 60, max: 60 }]; MH.feed(sv, H, defOf, [1]); ok(MH.spawn(sv, H).ok && R(sv).mon.win === true, "餵食後付體力遇下一隻"); }
  // 撐滿 → 餘燼：失敗 / 成功
  { const mk = (type, ok_, next) => { const sv = fresh(100, 0); MH.devSet(sv, H, { phase: "realm", type, n: RM[type].cap - 1, force: { pres: 0, emberOk: ok_, emberNext: next } }); MH.spawn(sv, H); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); return sv; };
    const f = mk("heaven", false, "heaven");
    ok(R(f).phase === "ember" && R(f).ember.ok === false && R(f).ember.pressed === false && !R(f).anim && R(f).realm.n === 20 && R(f).gold === 34, "撐滿天堂 20：進餘燼，金幣累積保留，等待點燃");
    const j0 = J(f); MH.fix(j0, H); ok(JSON.stringify(R(j0).ember) === JSON.stringify(R(f).ember), "餘燼等待中重新整理：成敗不重抽");
    ok(MH.canFeed(f, H) === false && MH.need(f, H) === 0, "餘燼不需要體力、不能餵食");
    const nn = R(f).n; ok(MH.ignite(f, H).ok && R(f).anim.kind === "ember" && R(f).ember.pressed && R(f).n === nn && !MH.ignite(f, H).ok, "點燃：只開始演出、不再抽、不能重複按");
    const jr = J(f); MH.fix(jr, H); ok(R(jr).anim.kind === "ember" && R(jr).ember.ok === false, "點燃演出中重新整理：補播，成敗不變");
    const coins = f.coins; MH.finishAnim(f, H, R(f).anim.rid);
    ok(R(f).phase === "done" && R(f).last.why === "ember" && R(f).last.gold === 34 && f.coins === coins + 34 && R(f).last.realmKills === 20, "點燃失敗 → 凱旋(ember)：帶回金幣一次入帳");
    const g = mk("hell", true, "heaven"); ok(R(g).ember.ok === true && R(g).realm.type === "hell" && R(g).realm.n === 10, "撐滿地獄 10 隻進餘燼");
    MH.ignite(g, H); MH.finishAnim(g, H, R(g).anim.rid);
    ok(R(g).phase === "realm" && R(g).anim.kind === "judge" && R(g).anim.first === false && R(g).anim.type === "heaven" && R(g).realm.round === 2 && R(g).realm.n === 0 && R(g).realm.total === 10 && !R(g).ember && R(g).gold === 68, "餘燼成功 → 新一輪判定(天堂)：round+1、n 歸 0、total 保留、金幣保留");
    const st = g.huntMeta.stamina; MH.finishAnim(g, H, R(g).anim.rid); ok(R(g).mon && g.huntMeta.stamina === st - 1, "新一輪第一隻付 1 體力"); }
  // 離開礦坑：各新狀態都入帳
  for (const ph of ["dragon", "realm", "ember"]) { const sv = fresh(50, 10); MH.devSet(sv, H, { phase: ph, type: "heaven", n: 2 }); R(sv).gold = 77; ok(MH.inProgress(sv, H) && MH.leave(sv, H).gold === 77 && sv.coins === 87 && !sv.huntRuns.m7, `${ph}：退出金幣照拿、清本輪、體力保留(${sv.huntMeta.stamina})`); }
  // 壞資料收斂
  { const mkr = o => ({ v: 1, coins: 5, huntRuns: { m7: Object.assign({ phase: "realm", seed: 1, seedP: 2, n: 0, nP: 0, since: 0, kills: 4, gold: 40, mon: null, anim: null, after: null, rid: 1, last: null, realm: { type: "hell", n: 99, round: 0, total: -4 }, ember: null }, o) } });
    const a = mkr({}); MH.fix(a, H); ok(R(a).phase === "realm" && R(a).realm.n === 10 && R(a).realm.round === 1 && R(a).realm.total === 0, "realm 欄位夾在合理範圍");
    const b = mkr({ realm: { type: "x" } }); MH.fix(b, H); ok(R(b).phase === "walk" && b.coins === 45, "狹間缺 realm → 作廢但金幣入帳");
    const c = mkr({ phase: "ember", ember: { ok: "?" } }); MH.fix(c, H); ok(R(c).phase === "walk" && c.coins === 45, "餘燼資料壞 → 作廢但金幣入帳");
    const d = mkr({ phase: "hunt", realm: { type: "heaven", n: 1, round: 1, total: 1 }, kills: 1 }); MH.fix(d, H); ok(R(d).phase === "hunt" && R(d).realm === null, "不該有 realm 的階段：丟掉重補，不作廢");
    const e = mkr({ phase: "ember", ember: { ok: true, next: "heaven", pressed: true }, anim: null }); MH.fix(e, H); ok(R(e).phase === "ember" && R(e).ember.pressed === false, "按了點燃卻沒有演出：回到可再按");
    const f = mkr({ mon: { win: true, pres: 1, combo: 0 } }); MH.fix(f, H); ok(R(f).phase === "walk", "狹間怪缺 cont → 作廢");
    const g = mkr({ anim: { kind: "kill", pick: 0, rid: 2, combo: 0 }, mon: { win: true, pres: 0, combo: 0, cont: true }, after: "oops" }); MH.fix(g, H); ok(R(g).phase === "walk", "狹間演出的後續未知 → 收斂入帳");
    const h = { v: 1, coins: 0, huntRuns: { m7: { phase: "dragon", seed: 1, seedP: 2, n: 2, nP: 0, since: 0, kills: 3, gold: 33, mon: { win: true, pres: 2, combo: 0, entry: "x" }, anim: null, after: null, rid: 1, last: null } } }; MH.fix(h, H); ok(R(h).phase === "walk" && h.coins === 33, "巨龍入口類型壞 → 作廢入帳"); }
  // 道具預留：多餘欄位不報錯
  { const sv = fresh(10); R(sv).seedI = 5; R(sv).nI = 2; MH.fix(sv, H); ok(R(sv).phase === "walk" && R(sv).seedI === 5, "多餘欄位（階段 3 預留 seedI／nI）不報錯"); }
  // 開發者跳狀態
  { const sv = fresh(10); MH.devSet(sv, H, { phase: "ember", type: "hell", ok: false, next: "hell" }); ok(R(sv).phase === "ember" && R(sv).ember.next === "hell" && R(sv).realm.n === 10, "devSet 跳到餘燼（地獄撐滿）"); }
}

console.log("=== 15. 回合戰鬥（厚重輪數）：劇本、血量、存檔、相容 ===");
{
  Object.keys(ROUNDS0).forEach(k => { H.battle.rounds[k] = ROUNDS0[k]; });
  const B = H.battle;
  ok(B.rounds.lower.join() === "3,4" && B.rounds.heaven.join() === "4,6" && B.rounds.hell.join() === "5,7" && B.rounds.dragon.join() === "8,10" && B.pMiss === 0.2 && B.mMiss === 0.4 && B.mult.join() === "0.8,1,1.4", "config.hunt.battle：厚重輪數、miss 20%／40%、倍率 0.8／1.0／1.4");
  // 抽選次數與固定 seed 對照：勝負、呈現、入口一個字不變（以 mix 直接算出期望值）
  { let same = true, drawsOk = true;
    for (let i = 0; i < 1500; i++) {
      const sv = fresh(50); const seed = i * 7919 + 3, seedP = i * 104729 + 11; MH.devSet(sv, H, { phase: "hunt", kills: 0 }); R(sv).seed = seed; R(sv).seedP = seedP; R(sv).n = 0; R(sv).nP = 0; const nB0 = R(sv).nB;
      MH.spawn(sv, H);
      const win = MH.mix(seed, 0) < MH.chance(R(sv), H, "hunt"), uP = MH.mix(seedP, 0), P = H.present, pres = uP < P[0] ? 0 : uP < P[0] + P[1] ? 1 : 2, combo = Math.min(2, Math.floor((uP % P[0]) / P[0] * 3));
      if (R(sv).mon.win !== win || R(sv).mon.pres !== pres || R(sv).mon.combo !== combo) same = false;
      if (R(sv).n !== 1 || R(sv).nP !== 1 || R(sv).nB !== nB0 + 1) drawsOk = false;
      const dv = fresh(50); MH.devSet(dv, H, { phase: "dragon" }); R(dv).seed = seed; R(dv).n = 0; MH.spawn(dv, H);
      if (R(dv).mon.win !== (MH.mix(seed, 0) < MH.chance(R(dv), H, "dragon")) || R(dv).mon.entry !== (MH.mix(seed, 1) < H.realm.entryHeaven ? "heaven" : "hell") || R(dv).n !== 2 || R(dv).nP !== 0) same = false;
    }
    ok(same, "加了劇本之後，下位／巨龍的勝負、呈現、套路、入口與抽選次數逐筆和直接用 mix 算的一致（對照表 1500 組）");
    ok(drawsOk, "每隻怪只多用劇本種子流 nB +1，draw／drawP 次數不變"); }
  // 劇本屬性（各種開場血量）
  { let bad = 0, pm = 0, pn = 0, mm = 0, mn = 0; const kinds = [["lower", true], ["lower", false], ["heaven", true], ["hell", true], ["dragon", true], ["dragon", false]];
    for (const [kind, win] of kinds) for (const hp0 of [20, 35, 60, 100]) for (let i = 0; i < 3000; i++) {
      const sc = MH.makeScript(H, kind, win, (i * 2654435761 + hp0) >>> 0, hp0), [lo, hi] = B.rounds[kind];
      if (sc.R < lo || sc.R > hi || !MH.scOk(sc, win)) bad++;
      if (win && MH.hpAt({ sc }, sc.R) < B.winFloor) bad++;
      if (!win && (MH.hpAt({ sc }, sc.R) !== 0 || MH.hpAt({ sc }, sc.R - 1) < B.loseFloor)) bad++;
      if (!win) { let h = 0; for (let k = 0; k < sc.R - 1; k++) h += sc.rs[k][2]; if (h < Math.min((B.loseMinHits[kind] || 0), sc.R - 1)) bad++; }
      for (let k = 1; k < sc.R; k++) if (!sc.rs[k - 1][0] && !sc.rs[k][0]) bad++;
      if (hp0 === 100 && kind === "heaven") for (let k = 0; k < sc.R - 1; k++) { pn++; if (!sc.rs[k][0]) pm++; mn++; if (!sc.rs[k][2]) mm++; }
    }
    ok(bad === 0, "72,000 份劇本：輪數在範圍內、勝時一路至少剩 20、負時最後一輪剛好歸零且之前不低於 15 並至少挨幾下、玩家 miss 不連續（含開場血量偏低 20～35）");
    ok(pm / pn > .14 && pm / pn < .21 && mm / mn > .38 && mm / mn < .5, `miss 頻率：玩家打空 ${(pm / pn * 100).toFixed(1)}%（設定 20%，扣掉不連續修正）／怪物被閃開 ${(mm / mn * 100).toFixed(1)}%（設定 40%）`); }
  const playOut = (sv, pick = 0) => { let rounds = 0; for (let g = 0; g < 80; g++) { const r = R(sv); if (r.anim) { const k = r.anim.kind; MH.finishAnim(sv, H, r.anim.rid); if (k !== "round") return rounds; } else if (r.mon) { rounds++; MH.strike(sv, H, Math.min(pick, r.mon.pres)); } else return rounds; } return -1; };
  // 下位 3 隻連續累積 → 巨龍
  { let hpOk = true, carried = true, chainMin = 100;
    for (let i = 0; i < 400; i++) {
      const sv = fresh(500); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true } }); R(sv).seedB = i * 977 + 13; R(sv).nB = 0; R(sv).hp = 100; MH.spawn(sv, H);
      let prev = 100;
      for (let k = 0; k < 3; k++) {
        const m = R(sv).mon; if (!m) { carried = false; break; } if (m.sc.hp0 !== prev) carried = false;
        const end = MH.hpAt(m, m.sc.R); if (end < 20) hpOk = false; chainMin = Math.min(chainMin, end); prev = end;
        playOut(sv);
        if (k < 2) { if (!R(sv).mon) { carried = false; break; } R(sv).mon.win = true; R(sv).mon.sc = MH.makeScript(H, "lower", true, 12345 + i, R(sv).mon.sc.hp0); }
      }
      if (R(sv).phase !== "dragon" || !R(sv).mon || R(sv).mon.sc.hp0 !== prev) carried = false;
    }
    ok(hpOk && carried, `下位 3 隻血量連續累積（每隻開場＝上一隻打完剩的，最低 ${chainMin}）、帶到巨龍；勝一路都撐住`); }
  { const sv = fresh(500); MH.devSet(sv, H, { phase: "dragon", hp: 27, force: { win: true, entry: "heaven" } }); MH.spawn(sv, H);
    const m = R(sv).mon; ok(m.sc.hp0 === 27 && m.sc.R >= 8 && m.sc.R <= 10 && MH.hpAt(m, m.sc.R) >= 20, "巨龍開場血量偏低（27）：劇本自動減少命中，仍保證至少剩 20、輪數 8～10"); }
  { const sv = fresh(500); MH.devSet(sv, H, { phase: "dragon", hp: 40, force: { win: false, entry: "hell" } }); MH.spawn(sv, H);
    const m = R(sv).mon, rounds = playOut(sv, 2);
    ok(rounds === m.sc.R && R(sv).phase === "done" && R(sv).last.why === "down" && R(sv).last.dragon === true && MH.hpAt(m, m.sc.R) === 0 && MH.hpAt(m, m.sc.R - 1) >= 15, `巨龍敗：打滿 ${rounds} 輪，最後一輪血條歸零，之前不低於 15，接撤退結算`); }
  { const sv = fresh(500); sv.coins = 0; MH.devSet(sv, H, { phase: "dragon", hp: 60, force: { win: true, entry: "hell" } }); MH.spawn(sv, H);
    playOut(sv, 1); ok(R(sv).phase === "realm" && R(sv).anim && R(sv).anim.kind === "judge", "巨龍勝：打完所有輪 → 判定"); MH.finishAnim(sv, H, R(sv).anim.rid);
    ok(R(sv).mon.sc.hp0 === B.hpMax && R(sv).gold === 90, "進狹間：第一隻血量回滿（100）、金幣與勝負不變");
    R(sv).mon.cont = true; playOut(sv); ok(R(sv).mon && R(sv).mon.sc.hp0 === B.hpMax, "狹間每一隻開場都回滿"); }
  // 中途輪：只是演出
  { const sv = fresh(500); sv.coins = 0; MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true, pres: 2, rounds: 4 } }); MH.spawn(sv, H);
    const m0 = JSON.stringify(R(sv).mon.sc), gold0 = R(sv).gold, kills0 = R(sv).kills;
    const r1 = MH.strike(sv, H, 1);
    ok(r1.ok && R(sv).anim.kind === "round" && R(sv).anim.t === 0 && R(sv).after === "round" && R(sv).gold === gold0 && R(sv).kills === kills0 && !MH.strike(sv, H, 0).ok, "中途一輪：只有演出，不加金幣、不加隻數、播放中不能再出招");
    const sv2 = J(sv); MH.fix(sv2, H); ok(R(sv2).anim.kind === "round" && JSON.stringify(R(sv2).mon.sc) === m0 && R(sv2).mon.t === 0, "一輪演出中重新整理：補播同一輪，劇本不重排");
    const nB = R(sv).nB, rid = R(sv).anim.rid; ok(MH.finishAnim(sv, H, rid).ev === "round" && R(sv).mon.t === 1 && !R(sv).anim && R(sv).nB === nB && !MH.finishAnim(sv, H, rid).ok, "播完 → 第 2 輪等待選招（t+1、不重排、不重複前進）");
    const sv3 = J(sv); MH.fix(sv3, H); ok(R(sv3).mon.t === 1 && JSON.stringify(R(sv3).mon.sc) === m0 && !R(sv3).anim, "等待選招中重新整理：回到同一輪（第 2 輪）");
    for (let k = 0; k < 2; k++) { MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); } MH.strike(sv, H, 2);
    ok(R(sv).anim.kind === "finish" && R(sv).anim.combo === 2 && R(sv).gold === 0 && R(sv).kills === 0, "最後一輪選蓄力 → 蓄力池終結技，完成前不先加金幣"); }
  { const sv = fresh(500); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true, pres: 0, combo: 1, rounds: 2 } }); MH.spawn(sv, H); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); MH.strike(sv, H, 0); ok(R(sv).anim.combo === 1, "單鈕怪：最後一輪套路＝預抽的套路"); }
  // 舊戰鬥（沒有劇本）＝1 輪
  { const old = { v: 1, coins: 0, huntMeta: { stamina: 50 }, huntRuns: { m7: { phase: "hunt", seed: 5, seedP: 6, n: 3, nP: 1, since: 0, kills: 1, gold: 11, mon: { win: true, pres: 1, combo: 0 }, anim: null, after: null, rid: 1, last: null } } };
    MH.fix(old, H); const nB0 = R(old).nB; ok(R(old).mon.sc === undefined && R(old).hp === 100 && Number.isInteger(R(old).seedB), "舊存檔：沒有劇本的怪維持沒有（視為 1 輪），seedB 由舊 seed 推出、血量補滿");
    MH.strike(old, H, 1); ok(R(old).anim.kind === "finish" && R(old).anim.stage === "charge" && R(old).nB === nB0, "舊戰鬥出招 → 新蓄力終結技（結果仍是 mon.win），不補排、不動 nB");
    const old2 = J(old); delete R(old2).seedB; MH.fix(old2, H); const old3 = J(old); delete R(old3).seedB; MH.fix(old3, H); ok(R(old2).seedB === R(old3).seedB, "seedB 補值是確定的（只由舊 seed 推出）");
    const old4 = { v: 1, coins: 0, huntRuns: { m7: { phase: "hunt", seed: 5, seedP: 6, n: 3, nP: 1, since: 0, kills: 1, gold: 11, mon: { win: false, pres: 0, combo: 0 }, anim: { kind: "down", pick: 0, rid: 2, combo: 0 }, after: "down", rid: 2, last: null } } };
    MH.fix(old4, H); ok(MH.finishAnim(old4, H, 2).ev === "done" && R(old4).last.why === "down" && old4.coins === 11, "舊存檔播倒下中重新整理：照舊播完、結算"); }
  // 壞掉的劇本：丟掉變成 1 輪，不作廢整趟
  { const mk = f => { const sv = fresh(50); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true, pres: 1, rounds: 3 } }); MH.spawn(sv, H); f(R(sv).mon); return sv; };
    const a = mk(m => { m.sc.rs.pop(); }); MH.fix(a, H); ok(R(a).phase === "hunt" && R(a).mon && R(a).mon.win === true && R(a).mon.sc === undefined, "劇本長度不符 → 丟掉劇本、怪物和勝負保留");
    const b = mk(m => { m.sc.rs[m.sc.R - 1][2] = 1; }); MH.fix(b, H); ok(R(b).mon.sc === undefined && R(b).phase === "hunt", "勝劇本最後一輪卻有反擊（不一致）→ 丟掉");
    const c = mk(m => { m.t = 99; }); MH.fix(c, H); ok(R(c).mon.sc === undefined, "輪次超出範圍 → 丟掉");
    const d = mk(() => {}); MH.strike(d, H, 0); R(d).anim.t = 5; MH.fix(d, H); ok(R(d).phase === "walk", "round 演出的輪次對不上 → 收斂（金幣入帳）"); }
  { const sv = fresh(50); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 3, force: { cont: true, rounds: 3 } }); MH.spawn(sv, H); MH.strike(sv, H, 0); const sv2 = J(sv); MH.fix(sv2, H); ok(R(sv2).phase === "realm" && R(sv2).anim.kind === "round", "狹間怪的中途輪重新整理後保留"); }
  { const sv = fresh(50); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: false, pres: 0, rounds: 3 } }); MH.spawn(sv, H); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); MH.strike(sv, H, 0);
    const j = J(sv); MH.fix(j, H); ok(R(j).anim.kind === "finish" && R(j).anim.outcome === "lose" && R(j).mon.t === 2 && R(j).mon.sc.R === 3, "最後一輪（敗北終結技）中重新整理：補播，劇本還在"); }
  { const sv = fresh(1, 0); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true, pres: 0, rounds: 4 } }); sv.huntMeta.stamina = 1; MH.spawn(sv, H); ok(sv.huntMeta.stamina === 0 && !MH.halted(sv, H), "體力 0 時戰鬥中不停住（出招不扣體力）"); for (let k = 0; k < 3; k++) { MH.strike(sv, H, 0); MH.finishAnim(sv, H, R(sv).anim.rid); } ok(R(sv).mon.t === 3 && sv.huntMeta.stamina === 0, "多輪都不扣體力"); }
  { const sv = fresh(50); sv.coins = 5; MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true, pres: 0, rounds: 4 } }); R(sv).gold = 22; MH.spawn(sv, H); MH.strike(sv, H, 0); ok(MH.leave(sv, H).gold === 22 && sv.coins === 27, "戰鬥中退出：先前累積的金幣入帳，這隻不給"); }
  ok(MH.hpAt(null, 0) === null, "hpAt 沒有劇本時回傳 null");
}

console.log("=== 16. 第三階段 3B：能力、道具、空箱、歸零、舊檔、重整、回滾 ===");
{
  const seedFor = (lo, hi) => { for (let s = 1; s < 200000; s++) { const u = MH.mix(s, 0); if (u >= lo && u < hi) return s; } throw new Error("seedI"); };
  const triggerOffer = (lo, hi) => {
    const sv = fresh3(100, 0), r = R(sv); r.seedI = seedFor(lo, hi); r.nI = 0; r.since = H.walk.guarantee - 1;
    const n = r.n, nP = r.nP; MH.step(sv, H, { setting: 3 });
    ok(r.n === n + 3 && r.nP === nP, "旅途發展仍只消耗既有結果流 draw×3；道具不碰 draw／drawP");
    return sv;
  };

  // 能力點：擊倒先落存檔、下一隻生成前停點、確認不可退、遞減且永遠低於硬頂。
  { const sv = fresh3(100, 0), r = R(sv); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: { win: true, pres: 0, rounds: 1 } }); const n0 = r.n, p0 = r.nP; MH.spawn(sv, H); MH.strike(sv, H, 0);
    ok(r.attr.free === 0 && r.n === n0 + 1 && r.nP === p0 + 1, "終結技完成前不先發能力點；勝負／呈現抽選次數不變");
    const rid = r.anim.rid; MH.finishAnim(sv, H, rid); ok(r.awaiting === "spawn" && !r.mon && r.attr.free === 1 && r.attr.earned === 1, "演出完成才發 +1，停在安全點且不先生成下一隻");
    const snap = J(sv); MH.fix(snap, H); ok(R(snap).awaiting === "spawn" && R(snap).attr.free === 1 && R(snap).n === r.n, "安全點重新整理：點數與抽選索引不變");
    ok(!MH.allocate(sv, H, { hunt: 2 }).ok && MH.allocate(sv, H, { hunt: 1 }).ok && r.attr.hunt === 1 && r.attr.free === 0 && !MH.allocate(sv, H, { hunt: -1 }).ok, "不能超支；確認投入後不可退回／重配");
    const p1 = MH.chance(r, H, "hunt"); r.attr.hunt = 1000000; const pHuge = MH.chance(r, H, "hunt");
    ok(p1 > H.lower.win && pHuge < H.attributes.hunt.cap && pHuge > p1, "無單項上限採遞減效果，極高點數仍低於 97% 硬頂");
    r.attr.hunt = 1; const n1 = r.n; MH.continueRun(sv, H); ok(r.mon && r.n === n1 + 1 && !r.awaiting, "繼續後才生成下一隻，只用原本一次勝負抽選"); }

  // 巨龍 +2、狹間每第 3 隻 +1。
  { const sv = fresh3(100, 0), r = R(sv); MH.devSet(sv, H, { phase: "dragon", force: { win: true, entry: "heaven", rounds: 1 } }); MH.spawn(sv, H); MH.strike(sv, H, 0); ok(r.attr.free === 0, "駭骨巨龍終結技完成前不先發點數"); MH.finishAnim(sv, H, r.anim.rid); ok(r.awaiting === "judge" && r.pendingEntry === "heaven" && r.attr.free === 2, "巨龍完成後 +2，判定演出前提供安全停點");
    MH.allocate(sv, H, { realm: 2 }); MH.continueRun(sv, H); ok(r.anim.kind === "judge" && r.attr.realm === 2, "投入後再進天堂／地獄判定"); }
  { const sv = fresh3(100, 0), r = R(sv); MH.devSet(sv, H, { phase: "realm", type: "heaven", n: 2, force: { cont: true, rounds: 1 } }); MH.spawn(sv, H); MH.strike(sv, H, 0); MH.finishAnim(sv, H, r.anim.rid); ok(r.realm.n === 3 && r.attr.free === 1, "狹間每輪第 3 隻完成後取得 1 點"); }

  // 5／28／42／25 四路線與六道具；選擇、重整、resolution 都不可重複。
  { const sv = triggerOffer(0, .05), r = R(sv), o = r.itemOffer; ok(o.route === "direct" && o.stage === "show" && MH.ITEM_IDS.includes(o.chosen) && r.items[o.chosen] === 1, "直接取得 5%：先存一件六種道具，再顯示"); const ni = r.nI; const j = J(sv); MH.fix(j, H); ok(R(j).nI === ni && R(j).itemOffer.chosen === o.chosen, "直接取得重整不重抽"); ok(MH.dismissItem(sv, H, o.rid).ok && !MH.dismissItem(sv, H, o.rid).ok, "直接取得 resolution 防重複"); }
  { const sv = triggerOffer(.05, .33), r = R(sv), o = r.itemOffer; ok(o.route === "choice" && o.candidates.length === 2 && o.candidates[0] !== o.candidates[1], "二選一取得 28%：兩件不同正面道具"); const ni = r.nI, rid = o.rid; const j = J(sv); MH.fix(j, H); ok(R(j).nI === ni && J(R(j).itemOffer).candidates.join() === o.candidates.join(), "二選一選擇前重整：候選不變、不重抽"); ok(MH.pickItem(sv, H, "right", rid).ok && itemMapForTest(r) === o.candidates[1] && !MH.pickItem(sv, H, "left", rid).ok, "只取得所選道具，重複 resolution 被拒絕"); }
  { const sv = triggerOffer(.33, .75), r = R(sv), o = r.itemOffer, rid = o.rid; ok(o.route === "empty" && o.candidates.length === 0 && o.chosen === null, "二選一空箱 42%：不生成任一箱內容"); ok(MH.pickItem(sv, H, "left", rid).ok && o.chosen === "left" && !itemMapForTest(r), "空箱只記所選左箱，不生成未選箱內容"); const j = J(sv); MH.fix(j, H); ok(R(j).itemOffer.chosen === "left" && R(j).itemOffer.stage === "show", "空箱選擇後重整：只重播所選箱狀態"); ok(!MH.pickItem(sv, H, "right", rid).ok, "空箱選定後不能換箱"); }
  { const sv = triggerOffer(.75, 1); ok(R(sv).itemOffer === null && !itemMapForTest(R(sv)), "無事件 25%：直接進發展，不產生 offer 或道具"); }

  // 結算摘要後清空；頂層 save.v 永遠是 1。
  { const sv = fresh3(10, 7), r = R(sv); r.attr = { free: 2, hunt: 1, dragon: 0, realm: 3, earned: 6 }; r.items.whetstone = 1; r.itemOffer = { rid: 1, route: "empty", candidates: [], chosen: "right", stage: "show" }; MH.settle(sv, H, "empty");
    ok(sv.v === 1 && r.last.attrEarned === 6 && r.last.itemId === "whetstone" && r.attr.earned === 0 && !itemMapForTest(r) && r.itemOffer === null, "一趟結束：last 留摘要，能力／道具／offer 全歸零，save.v=1"); }

  // 第二階段舊存檔補欄位但沿用舊門檻／舊報酬，seedI 只由 seed 混出。
  { const old = { v: 1, coins: 0, huntMeta: { stamina: 20 }, huntRuns: { m7: { phase: "hunt", seed: 123, seedP: 456, n: 0, nP: 0, since: 0, kills: 0, gold: 0, mon: null, anim: null, after: null, rid: 0, last: null } } }; MH.fix(old, H); const r = R(old), si = r.seedI;
    ok(r.rv === 2 && Number.isInteger(si) && r.attr.free === 0 && r.itemOffer === null && old.v === 1, "舊存檔補第三階段欄位，頂層版本不變");
    const old2 = J(old); delete R(old2).seedI; MH.fix(old2, H); ok(R(old2).seedI === si && MH.chance(r, H, "hunt") === .92 && MH.goldOf(r, H, "hunt") === 11, "舊行程 seedI 補值固定，勝率與報酬重放維持第二階段"); }

  // huntCommit 與 UI 的所有第三階段變更都走原子提交；寫入失敗會 restore snapshot。
  { const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8"), uiSrc = fs.readFileSync(path.join(ROOT, "js/hunt-ui.js"), "utf8");
    ok(/function huntCommit\(fn\)[\s\S]*const snap = clone\(save\)[\s\S]*store\.set\(SAVE_KEY, save\)[\s\S]*save = snap/.test(gameSrc), "huntCommit：寫入失敗會回滾整包存檔快照");
    ok(/doItem\([\s\S]*A\.commit|function act\(fn\)[\s\S]*A\.commit\(fn\)/.test(uiSrc) && /MH\.allocate/.test(uiSrc), "道具 resolution 與能力確認都經 huntCommit 原子提交"); }
}

function itemMapForTest(r) { return MH.ITEM_IDS.find(id => r.items && r.items[id]) || null; }

console.log("=== 17. 終結技／蓄力／假復活／暫待結算 ===");
{
  const FX = globalThis.HuntFx, pools = MH.FINISHER_POOLS;
  ok(FX.FINISHERS.length === 8 && pools.map(x => x.length).join() === "3,3,2", "8 種終結技：突刺 3／橫掃 3／蓄力 2");
  ok(FX.FINISHERS.map(x => x.word).join("") === "穿閃裂滅破斷墜斬" && FX.FINISHERS.every(x => x.cut.angle === x.last.a || x.cut.angle === x.last.cutAngle), "八個招牌字齊全，切線跟最後一刀");

  const mk = (win, force = {}) => { const sv = fresh3(50, 7), r = R(sv); MH.devSet(sv, H, { phase: "hunt", kills: 0, force: Object.assign({ win, pres: 2, rounds: 1 }, force) }); r.seedFx = force.seedFx === undefined ? 123 : force.seedFx; r.nFx = 0; r.seedRev = force.seedRev === undefined ? 456 : force.seedRev; r.nRev = 0; MH.spawn(sv, H); return sv; };
  { const sv = mk(true, { fakeRevive: false }), r = R(sv), before = { n: r.n, nP: r.nP }, fx = J(r.mon.fx); MH.strike(sv, H, 2);
    ok(pools[2].includes(r.anim.finisher) && r.anim.finisher === fx.moves[2], "按鈕只決定風格池，池內使用已存檔的獨立演出結果");
    const re = J(sv); MH.fix(re, H); ok(JSON.stringify(R(re).anim) === JSON.stringify(r.anim) && R(re).n === before.n && R(re).nP === before.nP, "終結技／階數重整不重抽，也不多動勝負／呈現流"); }

  const wc = [0,0,0], lc = [0,0,0], N = 30000; let fake = 0, trueRev = 0;
  for (let i = 1; i <= N; i++) {
    const w = mk(true, { seedFx: i * 7919 + 3 }); wc[R(w).mon.fx.tier - 1]++; if (R(w).mon.fx.fake) fake++;
    const l = mk(false, { seedFx: i * 104729 + 7, seedRev: i * 31337 + 11 }); lc[R(l).mon.fx.tier - 1]++; if (R(l).mon.fx.revive) trueRev++;
  }
  ok(wc.every((n,i) => Math.abs(n/N - H.finisher.chargeTier.win[i]) < .012), `勝利蓄力約 20／35／45（${wc.map(n=>(n/N*100).toFixed(1)).join("/")}%）`);
  ok(lc.every((n,i) => Math.abs(n/N - H.finisher.chargeTier.lose[i]) < .012), `敗北蓄力約 65／30／5（${lc.map(n=>(n/N*100).toFixed(1)).join("/")}%）`);
  ok(Math.abs(fake/N - .05) < .006, `假復活為勝利約 5%（${(fake/N*100).toFixed(2)}%）`);
  ok(H.revive.trueRate === 0 && trueRev === 0, "真復活機制保留，但 config=0 時 30,000 次不發生");

  { const sv = mk(false, { revive: false, chargeTier: 2 }), r = R(sv); MH.strike(sv, H, 1); const rid = r.anim.rid, coins = sv.coins;
    ok(r.anim.stage === "charge" && r.anim.tier === 2 && !MH.pendingDefeat(sv, H, rid).ok, "蓄力尚未放手前不能跳到敗北暫待");
    ok(MH.releaseCharge(sv, H, rid).ok && r.anim.stage === "attack" && !MH.releaseCharge(sv, H, rid).ok, "放手只生效一次，立即進終結技");
    ok(MH.pendingDefeat(sv, H, rid).ok && r.anim.stage === "pending" && sv.coins === coins && r.gold === 0, "倒下至按繼續前錢包與本趟金幣都不增加");
    const reload = J(sv); MH.fix(reload, H); ok(JSON.stringify(R(reload).anim) === JSON.stringify(r.anim) && reload.coins === coins, "暫待結算重新整理不重抽、不入帳");
    ok(MH.continueDefeat(sv, H, rid).ev === "done" && R(sv).phase === "done" && sv.coins === coins && !MH.continueDefeat(sv, H, rid).ok, "真敗按繼續只結算一次，rid 防重複"); }

  for (const forced of [{ win: true, fakeRevive: true }, { win: false, revive: true }]) {
    const sv = mk(forced.win, forced), r = R(sv); MH.strike(sv, H, 0); const rid = r.anim.rid; MH.releaseCharge(sv, H, rid); MH.pendingDefeat(sv, H, rid); const before = sv.coins;
    ok(MH.continueDefeat(sv, H, rid).ev === "revive" && r.anim.stage === "revive" && sv.coins === before && finishRaw(sv, H, rid).ok && R(sv).kills === 1, forced.win ? "假復活：先敗北後沿原結果接回勝利" : "真復活機制：強制測試可由原敗接回勝利");
  }
  const uiSrc = fs.readFileSync(path.join(ROOT, "js/hunt-ui.js"), "utf8"), fxSrc = fs.readFileSync(path.join(ROOT, "js/hunt-fx.js"), "utf8");
  ok(/MH\.releaseCharge[\s\S]*A\.commit|A\.commit\(\(\) => MH\.releaseCharge/.test(uiSrc) && /A\.commit\(\(\) => MH\.pendingDefeat/.test(uiSrc) && /function doFinishContinue[\s\S]*act\(\(\) => MH\.continueDefeat/.test(uiSrc), "蓄力放手、敗北暫待、繼續都經原子提交與失敗回滾");
  ok(/S\.hold = 0; msg\.textContent = "放開了，重新凝聚"/.test(fxSrc) && /S\.auto && S\.peak >= autoModeMs/.test(fxSrc) && /autoModeMs: H\(\)\.finisher\.autoModeReleaseMs/.test(uiSrc) && H.finisher.autoModeReleaseMs === 250 && H.finisher.autoReleaseMs === 3000, "未到頂放開從頭蓄；自動模式 250ms 放手；手動頂住約 3 秒自動斬下");
  ok(FX.T.burstAt - FX.T.blackAt > 1000, "全螢幕反黑進出間隔超過 1 秒，沒有新增全螢幕閃白");
  ok(!/中獎|賠率|押注/.test(JSON.stringify({ finisher: H.finisher, revive: H.revive, pending: [H.texts.pendingTitle,H.texts.pendingGold,H.texts.pendingBody] })), "新玩家文字不含賭博用語");
}

console.log("=== 18. 新流程第 1 階段：七國、直洞、保底、能力點、重整 ===");
{
  ok(H.countries.length === 7 && H.countries.map(x => x.tasks.length).join() === "5,3,4,2,6,3,1", "七國與題數 5／3／4／2／6／3／1");
  ok(MH.countryRate(H,"varian",1,0) === 0 && MH.countryRate(H,"varian",1,1) === .20 && MH.countryRate(H,"varian",6,1) === .25 && MH.countryRate(H,"varian",6,5) === 1, "瓦瑞安 0 題＝0%，設定固定加值與 100% 上限");
  ok(Math.abs(MH.countryRate(H,"medali",6,3)-.50)<1e-12 && Math.abs(MH.countryRate(H,"futuro",6,1)-.55)<1e-12, "美妲莉／芙特羅設定六邊界 50%／55%");

  const autoEntrance = (sv, setting) => {
    let guard=0;
    while (R(sv).phase !== "hunt" && guard++ < 5000) {
      const r=R(sv);
      if (r.event) { if (r.event.goblin && r.attr.free) MH.allocate(sv,H,{hp:r.attr.free}); MH.advanceEntrance(sv,H,"next"); continue; }
      if (r.phase === "walk") { const z=MH.step(sv,H,{setting}); if(!z.ok) throw new Error("new walk "+z.reason); continue; }
      if (r.phase === "dev") { if(r.dev.stage==="offer") MH.advanceEntrance(sv,H,"enter"); else if(r.dev.stage==="fail") MH.advanceEntrance(sv,H,"next"); else MH.advanceEntrance(sv,H,"enter"); continue; }
      const c=r.country;
      if(c.stage==="intro") MH.enterCountry(sv,H);
      else if(c.stage==="task") MH.pickCountry(sv,H,0);
      else if(c.stage==="goblin") { if(r.attr.free) MH.allocate(sv,H,{hp:r.attr.free}); MH.advanceEntrance(sv,H,"next"); }
      else if(c.stage==="warn"||c.stage==="enter") MH.advanceEntrance(sv,H,"enter");
      else MH.advanceEntrance(sv,H,"next");
    }
    if(guard>=5000) throw new Error("new entrance guard"); return R(sv);
  };

  { const sv=fresh4(), r=R(sv); r.segmentSteps=19; r.seedE=1; r.nE=0; const before=J(sv); MH.step(sv,H,{setting:3}); const snap=J(sv); MH.fix(snap,H); ok(R(snap).nE===r.nE && JSON.stringify(R(snap).event)===JSON.stringify(r.event) && JSON.stringify(R(snap).dev)===JSON.stringify(r.dev) && JSON.stringify(R(snap).country)===JSON.stringify(r.country), "一步的路上事件／直洞／國度結果存檔，重整不重抽"); ok(before.v===1 && sv.v===1, "新流程頂層 save.v 維持 1"); }
  { const sv=fresh4(), r=R(sv); r.phase="country"; r.countryCount=5; r.setting=1; r.country={id:"futuro",stage:"goblin",q:0,pick:null,answer:null,ok:null,successes:0,chest:null,gift:null,enterOk:null,guaranteed:false}; r.attr.free=2;
    ok(MH.allocate(sv,H,{hp:1}).ok && r.attr.hp===1 && r.attr.free===1, "哥布林處可分配血量／戰力／幸運，也可保留"); MH.advanceEntrance(sv,H,"next"); ok(r.country.guaranteed && r.country.enterOk, "沒進 AT 的第 5 國必進，成功 0 題也不顯示內部規則"); MH.advanceEntrance(sv,H,"next"); MH.advanceEntrance(sv,H,"enter"); ok(r.phase==="hunt" && r.attr.free===0, "第 5 國進 AT，未分配點清零"); }
  { const sv=fresh4(), r=R(sv); r.event={kind:"route",goblin:false,chest:true,rewards:[{kind:"point",n:1}],next:null}; r.attr.free=1; ok(!MH.allocate(sv,H,{luck:1}).ok, "沒有哥布林時不能分配能力點"); MH.advanceEntrance(sv,H,"next"); ok(r.attr.free===1, "路上失敗／事件後能力點保留"); }
  { const old={v:1,coins:0,huntRuns:{m7:{phase:"walk",seed:5,seedP:6,n:0,nP:0,since:0,kills:0,gold:0,mon:null,anim:null,after:null,rid:0,last:null}}}; MH.fix(old,H); ok(R(old).rv===2 && old.v===1 && R(old).phase==="walk", "舊 hunt 存檔修復後維持可跑，不強切新流程"); }

  { const sv=fresh4(10), r=R(sv); r.phase="country"; r.country={id:"futuro",stage:"intro",q:0,pick:null,answer:null,ok:null,successes:0,chest:null,gift:null,enterOk:null,guaranteed:false};
    ok(MH.need(sv,H)===2, "國度入口需要 2 體力"); MH.enterCountry(sv,H); ok(r.country.stage==="arrive" && MH.need(sv,H)===0 && sv.huntMeta.stamina===8, "進國度扣 2，先看國王開場（arrive）再答題");
    MH.advanceEntrance(sv,H,"next"); ok(r.country.stage==="task", "開場看完才出題");
    r.country.stage="farewell"; r.seedE=3; let k=0; while(k++<200){ const t=J(sv); MH.advanceEntrance(t,H,"next"); if(!R(t).country.chest){ ok(R(t).country.stage==="goblin" && R(t).country.gift, "沒有國度寶箱時直接遇到哥布林（不多一頁空白）"); break; } r.seedE=(r.seedE+1)>>>0; } }
  { const sv=fresh4(0), r=R(sv); r.phase="dev"; r.dev={kind:"direct",ok:true,stage:"offer"}; ok(MH.need(sv,H)===0 && !MH.halted(sv,H), "直洞不另扣體力：體力 0 也能決定要不要進"); }
  const N=20000, rows=[];
  for(let setting=1;setting<=6;setting++) { let direct=0,countries=0,guarantee=0; for(let i=0;i<N;i++){ const sv=fresh4(10000,0),r=R(sv); r.seedE=(i*2654435761+setting*7919)>>>0; const end=autoEntrance(sv,setting); direct+=end.entry==="direct"; countries+=end.countryCount; guarantee+=end.countryCount>=5; } rows.push({direct:direct/N,countries:countries/N,guarantee:guarantee/N}); }
  const directMin=Math.min(...rows.map(x=>x.direct)), directMax=Math.max(...rows.map(x=>x.direct));
  ok(directMin>.055 && directMax<.080, `入口蒙地卡羅每設定 ${N.toLocaleString()} 趟：直洞占 AT ${(directMin*100).toFixed(2)}%～${(directMax*100).toFixed(2)}%`);
  ok(rows.every(x=>x.countries>2.6&&x.countries<3.2), `平均國度 ${Math.min(...rows.map(x=>x.countries)).toFixed(2)}～${Math.max(...rows.map(x=>x.countries)).toFixed(2)}，第 5 國保底可達`);
  console.log("  新入口統計｜"+rows.map((x,i)=>`${i+1}:${(x.direct*100).toFixed(2)}%/${x.countries.toFixed(2)}/${(x.guarantee*100).toFixed(2)}%`).join("｜"));
}

console.log("=== 19. 新流程第 2 階段：AT 找怪、戰前道具、血量、巨龍階梯（真實狀態機對照 hunt7） ===");
{
  const cyc = (sv) => { const r = R(sv); const ks = ["hp", "atk", "luck"]; while (r.attr.free > 0) { const k = ks[(r.attr.hp + r.attr.atk + r.attr.luck) % 3]; MH.allocate(sv, H, { [k]: 1 }); } };
  const toAT = (sv, setting) => { let g = 0; while (R(sv).phase !== "hunt" && g++ < 5000) { const r = R(sv);
      if (r.event) { if (r.event.goblin) cyc(sv); MH.advanceEntrance(sv, H, "next"); continue; }
      if (r.phase === "walk") { MH.step(sv, H, { setting }); continue; }
      if (r.phase === "dev") { MH.advanceEntrance(sv, H, r.dev.stage === "fail" ? "next" : "enter"); continue; }
      const c = r.country; if (c.stage === "intro") MH.enterCountry(sv, H); else if (c.stage === "task") MH.pickCountry(sv, H, 0);
      else if (c.stage === "goblin") { cyc(sv); MH.advanceEntrance(sv, H, "next"); } else if (c.stage === "warn" || c.stage === "enter") MH.advanceEntrance(sv, H, "enter"); else MH.advanceEntrance(sv, H, "next"); } };
  const prep = (sv) => { const r = R(sv), m = r.mon, ratio = () => r.hp / r.maxHp, has = id => (r.routeItems[id] || 0) > 0;
    if (ratio() < .58 && has("salve")) MH.useRouteItem(sv, H, "salve");
    if (ratio() < .32 && has("dew")) MH.useRouteItem(sv, H, "dew");
    if ((m.type === "brutal" || m.type === "dragon") && has("net")) MH.useRouteItem(sv, H, "net");
    else if (m.type === "tank" && has("whet")) MH.useRouteItem(sv, H, "whet");
    else if (has("charm") && ratio() < .72) MH.useRouteItem(sv, H, "charm"); };
  const playAT = (sv) => { let g = 0, dragon = false; while (g++ < 20000) { const r = R(sv);
      if (r.phase === "dragon") dragon = true;
      if (r.phase === "realm" || r.phase === "done") return { dragon, realm: r.phase === "realm", kills: r.kills, gold: r.gold };
      if (r.story) { MH.atStory(sv, H); continue; }
      if (!r.mon) { const z = MH.atStep(sv, H); if (!z.ok) throw new Error("atStep " + z.reason); continue; }
      if (r.mon.prep) { prep(sv); MH.fight(sv, H); continue; }
      const z = MH.strike(sv, H, 0); if (!z.ok) throw new Error("strike " + z.reason); MH.finishAnim(sv, H, R(sv).anim.rid); }
    throw new Error("AT guard"); };
  { const sv = fresh4(5000), r = R(sv); toAT(sv, 3); ok(r.story && r.story.kind === "open" && r.maxHp === 100 + r.attr.hp * 7 + (r.companion ? 8 : 0) && r.hp === r.maxHp, "進 AT：先演受傷小精靈，最大血量＝100＋血量點×7（＋同伴 8）");
    ok(r.companion === (r.totalSuccess >= 5), `累積成功 ${r.totalSuccess} 題 → 同伴 ${r.companion}`);
    MH.atStory(sv, H); let steps = 0; while (!R(sv).mon) { MH.atStep(sv, H); steps++; } ok(R(sv).mon.prep && typeof R(sv).mon.win === "undefined" && steps <= 26, `第 ${steps} 步遇怪；遇怪時還沒抽勝負`);
    const snap = J(sv); MH.fix(snap, H); ok(R(snap).mon.prep === true && R(snap).mon.type === R(sv).mon.type, "戰前準備中重整：怪物種類保留、仍未抽勝負");
    r.routeItems.charm = 1; r.routeItems.net = 1; const p0 = MH.winChance(r, H); MH.useRouteItem(sv, H, "charm"); const p1 = MH.winChance(r, H);
    ok(Math.abs(p1 - Math.min(.975, p0 + .075)) < 1e-9, "星運符：本場勝率 +7.5 點（不超過上限）"); ok(MH.useRouteItem(sv, H, "net").reason === "once" && r.routeItems.net === 1, "加成道具一場只能用一個，沒用掉不扣");
    MH.fight(sv, H); ok(R(sv).mon.prep === false && typeof R(sv).mon.win === "boolean" && MH.useRouteItem(sv, H, "net").reason === "state", "按開始戰鬥後勝負抽定，不能再用道具"); }
  ok(MH.hpPenalty(1) === 0 && Math.abs(MH.hpPenalty(.5) - .06) < 1e-12 && Math.abs(MH.hpPenalty(.25) - .18) < 1e-12 && Math.abs(MH.hpPenalty(0) - .38) < 1e-12, "血量懲罰曲線 0／6／18／38 點");
  const N = 20000; let dr = 0, rl = 0, comp = 0;
  for (let i = 0; i < N; i++) { const sv = fresh4(1e6, 0), r = R(sv); r.seed = (i * 2654435761) >>> 0; r.seedE = (i * 40503 + 17) >>> 0; r.seedP = (i * 69069 + 3) >>> 0; r.seedRev = (i * 1103515245 + 12345) >>> 0;
    toAT(sv, 3); comp += r.companion; const o = playAT(sv); dr += o.dragon; rl += o.realm; }
  ok(Math.abs(dr / N - .7817) < .015 && Math.abs(rl / N - .6634) < .015, `設定三 ${N.toLocaleString()} 趟真實狀態機：見到巨龍 ${(dr / N * 100).toFixed(2)}%（hunt7 設定三 78.17%）、進狹間 ${(rl / N * 100).toFixed(2)}%（66.34%）、同伴 ${(comp / N * 100).toFixed(2)}%`);
}

console.log(`\n${fail ? "FAIL" : "PASS"}：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
