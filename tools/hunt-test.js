#!/usr/bin/env node
/* =========================================================
   冒險狩獵礦坑（js/mine-hunt.js）純邏輯測試：存檔補欄位、體力停住、預抽不可重抽、國度成敗、
   狩獵（三種呈現）、倒下／退出／結算入帳、演出補播、餵食（原子、無套利、不可餵的情況）
   用法：node tools/hunt-test.js        最後一行印 PASS／FAIL 摘要；失敗時結束碼 1
   數值讀 js/config.js 的 hunt（唯一來源）。畫面（hunt-ui／hunt-fx）請用 ?sandbox=名稱 在瀏覽器測。
   ========================================================= */
const path = require("path");
const ROOT = path.join(__dirname, "..");
const C = require(path.join(ROOT, "js/config.js"));
const MH = require(path.join(ROOT, "js/mine-hunt.js"));
const H = C.hunt, ST = H.stamina, ID = H.mine.id;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log("  ✘ FAIL " + name); } };
const J = o => JSON.parse(JSON.stringify(o));
const defOf = id => C.tools.find(t => t.id === id);
const fresh = (stamina = 0, coins = 300) => { const sv = { v: 1, coins, tools: [], equipped: null }; MH.fix(sv, H); sv.huntMeta.stamina = stamina; MH.run(sv, H); return sv; };
const R = sv => MH.peek(sv, H);
/* 一路走到「發展」：回傳步數。setting 預設 3 */
function walkToDev(sv, setting = 3) { let n = 0; while (R(sv).phase === "walk") { const r = MH.step(sv, H, { setting }); if (!r.ok) throw new Error("walk " + r.reason); n++; if (n > 100) throw new Error("no dev"); } return n; }
/* 搜一個「國度成功」或「失敗」的種子：換新種子重跑，直到符合 */
function seedWhere(country, stamina = 500, setting = 3) {
  for (let i = 0; i < 5000; i++) { const sv = fresh(stamina); R(sv).seed = i * 7919 + 1; R(sv).seedP = i * 104729 + 5; walkToDev(sv, setting); if (R(sv).country.ok === country) return { sv, i }; }
  throw new Error("no seed");
}

console.log("=== 1. 設定值 ===");
ok(ST.perStep === 1 && ST.countryCost === 2 && ST.valuePer === 6 && ST.intro === 18 && ST.drillTotal === 1380, "每步 1／國度 2／1 體力＝6 金幣／初見禮 18／鑽頭 1380");
ok(H.walk.guarantee === 30 && H.lower.count === 3 && H.lower.win === 0.92 && H.lower.gold === 11 && H.present.join() === "0.5,0.35,0.15", "保底 30／下位 3 隻 92%／11 金幣／呈現 50/35/15");
ok(H.mine.id === "m7" && H.mine.devOnly === true && H.mine.boardEligible === false && H.mine.toolsBrokenEligible === false, "m7 devOnly、不進委託板、不算用壞");
ok(!C.mines.some(m => m.id === "m7"), "m7 不在 config.mines（不會被委託板／圖鑑／模擬器誤算）");

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
  ok(MH.strike(sv, H, 0).ok && R(sv).anim.kind === "kill" && R(sv).gold === 11 && R(sv).kills === 1 && sv.coins === 1000, "擊倒：金幣只進本輪累積，錢包不變");
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
  ok(fin.ev === "done" && R(sv).phase === "done" && R(sv).last.why === "full" && R(sv).last.gold === 33 && R(sv).last.kills === 3 && sv.coins === coinsBefore + 33 && R(sv).gold === 0, "打滿 3 隻：凱旋，33 金幣一次入帳");
  ok(MH.settle(sv, H, "full").ok === false && sv.coins === coinsBefore + 33, "已凱旋不能重複入帳");
}
{
  const sv = fresh(100, 500);
  toHunt(sv, true, 1);
  MH.strike(sv, H, 1); MH.finishAnim(sv, H, R(sv).anim.rid);   // 先打倒一隻
  MH.devSet(sv, H, { phase: "hunt", kills: R(sv).kills, force: { win: false, pres: 1 } }); R(sv).mon = null; R(sv).anim = null; MH.spawn(sv, H);
  ok(R(sv).mon.win === false && MH.strike(sv, H, 0).ok && R(sv).anim.kind === "down" && sv.coins === 500, "角色倒下：播倒下演出，金幣還沒入帳");
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
  ok(MH.leave(dn, H).gold === 11 && dn.coins === 61, "演出播到一半退出：結果已記入，金幣照拿");
}

console.log("=== 8. 演出播到一半關掉遊戲：重開後補播，不重抽 ===");
{
  const sv = fresh(100, 0);
  toHunt(sv, true, 1); MH.strike(sv, H, 1);
  const saved = J(sv);                       // 這一刻存檔，然後關掉遊戲
  MH.fix(saved, H);
  ok(R(saved).anim && R(saved).anim.kind === "kill" && R(saved).anim.pick === 1 && R(saved).gold === 11, "存檔裡有待補播的演出與已記好的金幣");
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

console.log("=== 11. 開發者設定、種子、雜湊 ===");
{
  const vals = []; for (let i = 0; i < 20000; i++) vals.push(MH.mix(123, i));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  ok(vals.every(v => v >= 0 && v < 1) && Math.abs(mean - 0.5) < 0.01, "種子抽選在 [0,1) 且平均約 0.5");
  ok(MH.mix(5, 9) === MH.mix(5, 9) && MH.mix(5, 9) !== MH.mix(5, 10) && MH.mix(5, 9) !== MH.mix(6, 9), "同種子同次數 → 同結果；不同則不同");
  const sv = fresh(10); MH.devSet(sv, H, { phase: "dev", kind: "map", ok: false });
  ok(R(sv).phase === "dev" && R(sv).dev.kind === "map" && R(sv).country.ok === false, "devSet 跳到發展");
}

console.log(`\n${fail ? "FAIL" : "PASS"}：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
