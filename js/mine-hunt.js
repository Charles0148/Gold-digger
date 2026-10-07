/* =========================================================
   冒險狩獵礦坑：純邏輯狀態機（不碰畫面、不碰 localStorage、不呼叫 persist）
   - 瀏覽器：window.MineHunt；node 測試／模擬：require("js/mine-hunt.js")（tools/sim.js、tools/hunt-test.js）
   - 規格：Claude outputs/新礦坑_冒險狩獵_規格定案v2_2026-10-08.md（第一階段：旅途→發展→國度→下位狩獵→凱旋）
   - 數值：config.hunt（呼叫端傳入程式內建的 DEFAULT_CONFIG.hunt，下稱 H）
   - 存檔（頂層 save.v 永遠維持 1，舊存檔沒有這兩塊時 fix 補預設）：
       save.huntMeta   永久：{ v, stamina, visits, claimed, seenLight, gifted }
       save.huntRuns   { 礦坑id: 本趟 }，離開礦坑就刪。本趟：
         phase   "walk"旅途｜"dev"發展已揭曉｜"country"國度｜"hunt"狩獵｜"done"凱旋（金幣已入帳，只看統計）
         seed／n    勝負種子流（第 n 次抽 ＝ 雜湊(seed, n)，n 存檔 → 讀檔重整不能重抽）
         seedP／nP  呈現類型種子流（獨立，不改變勝負序列）
         since     距離上次發展的步數（30 步保底）
         dev       { kind: "cave"|"map" }
         country   { ok: 預抽成敗, pick: null｜0～2 }
         kills／gold／mon{win,pres}／anim{kind,pick,rid}／after／rid  狩獵
         last      { gold, kills, why }  凱旋統計
   - 防作弊：任何影響結果的隨機，在「付出體力的那一刻」抽好、寫進存檔，呼叫端 persist 之後才演出。
   - 金幣：只累積在 run.gold，settle() 才一次進 save.coins；餵食（feed）是原子操作，不扣耐久、不算用壞、不累積紅晶。
   ========================================================= */
(function (root) {
  "use strict";
  const int = (x, lo, hi) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
  const isObj = o => o && typeof o === "object" && !Array.isArray(o);
  const PHASES = ["walk", "dev", "country", "hunt", "done"];
  const GOLD_MAX = 1e9;

  /* ---- 種子抽選：第 n 次抽 ＝ 雜湊(seed, n)，回傳 [0,1)。只防重整／讀檔重抽，不是伺服器級 ---- */
  function mix(seed, n) {
    let h = (seed | 0) ^ Math.imul(((n | 0) + 0x7f4a7c15) | 0, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }
  const draw = run => mix(run.seed, run.n++);        // 勝負／入口
  const drawP = run => mix(run.seedP, run.nP++);     // 呈現類型
  const newSeed = rng => Math.floor((rng || Math.random)() * 4294967296) >>> 0;

  function newMeta() { return { v: 1, stamina: 0, visits: 0, claimed: {}, seenLight: false, gifted: false }; }
  function newRun(rng) {
    return { phase: "walk", seed: newSeed(rng), n: 0, seedP: newSeed(rng), nP: 0, since: 0, dev: null, country: null,
      kills: 0, gold: 0, mon: null, anim: null, after: null, rid: 0, last: null };
  }
  const mineId = H => (H.mine || {}).id || "m7";

  /* ---- fixHuntSave：本機讀檔、adoptSave、Game.setSave、newSave 四個入口共用。冪等。
     缺欄位補預設；數值夾在合理範圍；不認得的本趟狀態 → 先把能辨識的本輪累積金幣入帳，落回旅途（規格 2.5）。
     回傳是否有修改（呼叫端可據此決定要不要存檔）。 ---- */
  function fix(sv, H, rng) {
    let changed = false;
    const capS = (H.stamina || {}).cap || 100000000;
    if (!isObj(sv.huntMeta)) { sv.huntMeta = newMeta(); changed = true; }
    const M = sv.huntMeta;
    const before = JSON.stringify(M);
    M.v = 1;
    M.stamina = int(M.stamina, 0, capS);
    M.visits = int(M.visits, 0, 1e9);
    if (!isObj(M.claimed)) M.claimed = {};
    M.seenLight = M.seenLight === true; M.gifted = M.gifted === true;
    if (JSON.stringify(M) !== before) changed = true;
    if (!isObj(sv.huntRuns)) { sv.huntRuns = {}; changed = true; }
    const id = mineId(H);
    Object.keys(sv.huntRuns).forEach(k => { if (k !== id) { delete sv.huntRuns[k]; changed = true; } });   // 不認得的礦坑本趟紀錄：丟掉
    if (sv.huntRuns[id] !== undefined && !validRun(sv.huntRuns[id], H)) {
      const bad = sv.huntRuns[id];
      const g = isObj(bad) ? int(bad.gold, 0, GOLD_MAX) : 0;
      sv.coins = (Number(sv.coins) || 0) + g;
      sv.huntRuns[id] = newRun(rng);
      changed = true;
    }
    return changed;
  }
  function validRun(r, H) {
    if (!isObj(r) || !PHASES.includes(r.phase)) return false;
    if (!Number.isInteger(r.seed) && !(typeof r.seed === "number" && Number.isFinite(r.seed))) return false;
    if (!Number.isInteger(r.seedP) && !(typeof r.seedP === "number" && Number.isFinite(r.seedP))) return false;
    r.seed = r.seed >>> 0; r.seedP = r.seedP >>> 0;
    r.n = int(r.n, 0, 1e9); r.nP = int(r.nP, 0, 1e9);
    r.since = int(r.since, 0, 1e6); r.kills = int(r.kills, 0, 1e6); r.rid = int(r.rid, 0, 1e9);
    r.gold = int(r.gold, 0, GOLD_MAX);
    const cnt = (H.lower || {}).count || 3;
    if (r.kills > cnt) return false;
    const pick = p => p === null || (Number.isInteger(p) && p >= 0 && p <= 2);
    if (r.phase === "dev" || r.phase === "country") {
      if (!isObj(r.country) || typeof r.country.ok !== "boolean" || !pick(r.country.pick === undefined ? null : r.country.pick)) return false;
      if (r.country.pick === undefined) r.country.pick = null;
    }
    if (r.phase === "dev") { if (!isObj(r.dev) || (r.dev.kind !== "cave" && r.dev.kind !== "map")) return false; }
    if (r.phase === "country" && r.dev !== null && !(isObj(r.dev) && (r.dev.kind === "cave" || r.dev.kind === "map"))) return false;
    if (r.phase === "hunt") {
      if (r.mon !== null && !(isObj(r.mon) && typeof r.mon.win === "boolean" && Number.isInteger(r.mon.pres) && r.mon.pres >= 0 && r.mon.pres <= 2)) return false;
      if (r.anim !== null) {
        if (!(isObj(r.anim) && (r.anim.kind === "kill" || r.anim.kind === "down") && pick(r.anim.pick) && Number.isInteger(r.anim.rid))) return false;
        if (!r.mon) return false;
        if (r.after !== "spawn" && r.after !== "full" && r.after !== "down") return false;
      }
    } else { if (r.mon !== null || r.anim !== null) return false; }
    if (r.phase === "done") { if (!isObj(r.last)) return false; r.last.gold = int(r.last.gold, 0, GOLD_MAX); r.last.kills = int(r.last.kills, 0, 1e6); if (!["full", "down", "empty"].includes(r.last.why)) return false; }
    if (r.force !== undefined && !isObj(r.force)) delete r.force;
    return true;
  }

  /* 取得（必要時建立）本趟紀錄。進入礦坑時呼叫。 */
  function run(sv, H, rng) {
    const id = mineId(H);
    if (!isObj(sv.huntRuns)) sv.huntRuns = {};
    if (!sv.huntRuns[id]) sv.huntRuns[id] = newRun(rng);
    return sv.huntRuns[id];
  }
  const peek = (sv, H) => (isObj(sv.huntRuns) ? sv.huntRuns[mineId(H)] || null : null);
  const stamina = sv => (isObj(sv.huntMeta) ? sv.huntMeta.stamina : 0);

  /* 下一個要付的體力（0＝現在不需要付）。停住＝體力 < need。 */
  function need(sv, H) {
    const r = peek(sv, H); if (!r) return 0;
    const S = H.stamina;
    if (r.phase === "walk") return S.perStep;
    if (r.phase === "dev") return S.countryCost;
    if (r.phase === "hunt" && !r.mon && !r.anim) return S.perStep;
    return 0;
  }
  function halted(sv, H) { const n = need(sv, H); return n > 0 && stamina(sv) < n; }
  const busy = (sv, H) => { const r = peek(sv, H); return !!(r && r.anim); };

  /* ---- 初見禮：第一次進礦坑，一次性 ---- */
  function gift(sv, H) {
    const M = sv.huntMeta; if (M.gifted) return 0;
    M.gifted = true;
    const n = Math.min(H.stamina.intro, H.stamina.cap - M.stamina);
    M.stamina += n; return n;
  }

  /* ---- 旅途：走一步 ---- */
  function step(sv, H, ctx) {
    const r = peek(sv, H), M = sv.huntMeta;
    if (!r || r.phase !== "walk") return { ok: false, reason: "state" };
    const setting = ctx && ctx.setting;
    if (!(setting >= 1 && setting <= H.settings.length)) return { ok: false, reason: "nosetting" };   // 日期未知：不能走新的一步
    if (M.stamina < H.stamina.perStep) return { ok: false, reason: "hungry", need: H.stamina.perStep - M.stamina };
    M.stamina -= H.stamina.perStep;
    r.since++;
    const S = H.settings[setting - 1];
    const u = draw(r);
    if (!(r.since >= H.walk.guarantee || u < S.dev)) return { ok: true, ev: "walk" };
    const uKind = draw(r), uOk = draw(r);
    const kind = uKind < H.walk.caveShare ? "cave" : "map";
    r.dev = { kind }; r.country = { ok: uOk < (kind === "cave" ? S.cave : S.map), pick: null };
    r.phase = "dev"; r.since = 0;
    return { ok: true, ev: "dev", kind };
  }

  /* ---- 發展 → 國度（進入時扣 2） ---- */
  function enterCountry(sv, H) {
    const r = peek(sv, H), M = sv.huntMeta;
    if (!r || r.phase !== "dev") return { ok: false, reason: "state" };
    if (M.stamina < H.stamina.countryCost) return { ok: false, reason: "hungry", need: H.stamina.countryCost - M.stamina };
    M.stamina -= H.stamina.countryCost;
    r.phase = "country";
    return { ok: true };
  }
  /* 國度的選擇只是演出，不影響成敗；揭曉後造訪次數 +1（成敗皆算） */
  function pickCountry(sv, H, idx) {
    const r = peek(sv, H);
    if (!r || r.phase !== "country" || r.country.pick !== null) return { ok: false, reason: "state" };
    if (!(Number.isInteger(idx) && idx >= 0 && idx <= 2)) return { ok: false, reason: "arg" };
    r.country.pick = idx;
    sv.huntMeta.visits = int(sv.huntMeta.visits + 1, 0, 1e9);
    return { ok: true, success: r.country.ok };
  }
  /* 國度結果看完 → 成功進狩獵（自動付第一隻怪的體力）；失敗空手凱旋 */
  function afterCountry(sv, H) {
    const r = peek(sv, H);
    if (!r || r.phase !== "country" || r.country.pick === null) return { ok: false, reason: "state" };
    if (!r.country.ok) { settle(sv, H, "empty"); return { ok: true, ev: "done" }; }
    r.phase = "hunt"; r.kills = 0; r.mon = null; r.dev = null; r.country = null;
    return spawn(sv, H);
  }

  /* ---- 狩獵：遇到一隻怪＝付 1 體力＋預抽勝負與呈現類型 ---- */
  function spawn(sv, H) {
    const r = peek(sv, H), M = sv.huntMeta;
    if (!r || r.phase !== "hunt" || r.mon || r.anim) return { ok: false, reason: "state" };
    if (M.stamina < H.stamina.perStep) return { ok: false, reason: "hungry", need: H.stamina.perStep - M.stamina };
    M.stamina -= H.stamina.perStep;
    let win = draw(r) < H.lower.win;
    const uP = drawP(r), P = H.present;
    let pres = uP < P[0] ? 0 : uP < P[0] + P[1] ? 1 : 2;
    if (r.force) { if (typeof r.force.win === "boolean") win = r.force.win; if (Number.isInteger(r.force.pres)) pres = Math.max(0, Math.min(2, r.force.pres)); delete r.force; }   // 開發者測試用
    r.mon = { win, pres };
    return { ok: true, ev: "mon", pres };
  }
  /* 出招：選項只改演出（斬擊方向與顏色），勝負早在 spawn 決定。結果一次落地，動畫之後才播 */
  function strike(sv, H, idx) {
    const r = peek(sv, H);
    if (!r || r.phase !== "hunt" || !r.mon || r.anim) return { ok: false, reason: "state" };
    if (!(Number.isInteger(idx) && idx >= 0 && idx <= r.mon.pres)) return { ok: false, reason: "arg" };
    r.rid++;
    if (r.mon.win) {
      r.kills++; r.gold = int(r.gold + H.lower.gold, 0, GOLD_MAX);
      r.anim = { kind: "kill", pick: idx, rid: r.rid };
      r.after = r.kills >= H.lower.count ? "full" : "spawn";
    } else {
      r.anim = { kind: "down", pick: idx, rid: r.rid };
      r.after = "down";
    }
    return { ok: true, anim: r.anim };
  }
  /* 演出播完（或重開後補播完）：rid 對不上就不動作，防止重複前進／重複入帳 */
  function finishAnim(sv, H, rid) {
    const r = peek(sv, H);
    if (!r || r.phase !== "hunt" || !r.anim || r.anim.rid !== rid) return { ok: false, reason: "state" };
    const after = r.after;
    r.anim = null; r.mon = null; r.after = null;
    if (after === "spawn") return spawn(sv, H);
    settle(sv, H, after);   // "full"｜"down"
    return { ok: true, ev: "done" };
  }

  /* ---- 凱旋：本輪金幣一次入帳（原子：coins 增加、金幣歸零、進 done 同一次完成）---- */
  function settle(sv, H, why) {
    const r = peek(sv, H);
    if (!r || r.phase === "done") return { ok: false, reason: "state" };
    const g = int(r.gold, 0, GOLD_MAX);
    sv.coins = (Number(sv.coins) || 0) + g;
    r.last = { gold: g, kills: r.kills, why };
    r.gold = 0; r.mon = null; r.anim = null; r.after = null; r.dev = null; r.country = null;
    r.phase = "done";
    return { ok: true, gold: g, why };
  }
  /* 凱旋畫面點完 → 新的一輪（換新種子，體力與造訪次數都留著） */
  function again(sv, H, rng) {
    const r = peek(sv, H);
    if (!r || r.phase !== "done") return { ok: false, reason: "state" };
    sv.huntRuns[mineId(H)] = newRun(rng);
    return { ok: true };
  }
  /* 主動退出礦坑／地圖換礦坑：本輪金幣照拿、清掉本輪進度、體力保留 */
  function leave(sv, H) {
    const id = mineId(H), r = peek(sv, H);
    if (!r) return { gold: 0, kills: 0 };
    const g = r.phase === "done" ? 0 : int(r.gold, 0, GOLD_MAX), k = r.kills;
    sv.coins = (Number(sv.coins) || 0) + g;
    delete sv.huntRuns[id];
    return { gold: g, kills: k };
  }
  /* 這一趟有沒有「還沒結束的進度」（離開時提醒用）：走過路、拿了發展、國度、狩獵中或有累積金幣 */
  function inProgress(sv, H) {
    const r = peek(sv, H); if (!r) return false;
    return r.phase === "dev" || r.phase === "country" || r.phase === "hunt" || r.gold > 0 || r.since > 0;
  }

  /* ---- 餵食（小精靈）：鎬子整把換體力 ----
     體力＝無條件捨去(Σ 剩餘耐久×原價÷標準耐久÷valuePer)，多把先加總再捨去。用 config 原價與標準耐久（不用折扣後實付、不用加成後的最大耐久）。
     沒有原價的鑽頭：剩餘耐久×drillTotal÷標準耐久。試用版不可餵；單把換算 < 1 體力的不可餵。 */
  function feedExact(H, def, tool) {
    if (!def || def.trial || !tool || !(tool.dur > 0)) return 0;
    const S = H.stamina;
    if (def.price > 0) return tool.dur * def.price / def.durability / S.valuePer;
    if (def.drill) return tool.dur * S.drillTotal / def.durability;
    return 0;
  }
  const floorEps = x => Math.floor(x + 1e-9);
  function feedable(H, def, tool) {
    if (!def) return { ok: false, why: "none" };
    if (def.trial) return { ok: false, why: "trial" };
    const v = feedExact(H, def, tool);
    if (v <= 0) return { ok: false, why: "none" };
    if (floorEps(v) < 1) return { ok: false, why: "small" };
    return { ok: true, exact: v, n: floorEps(v) };
  }
  /* 預覽：selection＝uid 陣列；defOf＝id→工具定義。回傳 { n, count, bad } */
  function feedPreview(sv, H, defOf, uids) {
    const seen = new Set(); let sum = 0, count = 0, bad = 0;
    (uids || []).forEach(u => {
      if (seen.has(u)) return; seen.add(u);
      const t = (sv.tools || []).find(x => x.uid === u), f = t ? feedable(H, defOf(t.id), t) : { ok: false };
      if (!f.ok) { bad++; return; }
      sum += f.exact; count++;
    });
    return { n: floorEps(sum), count, bad };
  }
  /* 只能在旅途、發展揭曉後、或停住（體力不夠付下一步）時餵食；演出中、國度、有怪物等著出招時不行 */
  function canFeed(sv, H) {
    const r = peek(sv, H);
    return !!r && !r.anim && (r.phase === "walk" || r.phase === "dev" || halted(sv, H));
  }
  function feed(sv, H, defOf, uids) {
    if (busy(sv, H)) return { ok: false, reason: "busy" };
    if (!canFeed(sv, H)) return { ok: false, reason: "phase" };
    const p = feedPreview(sv, H, defOf, uids);
    if (!p.count || p.bad || p.n < 1) return { ok: false, reason: "invalid" };
    const M = sv.huntMeta;
    if (M.stamina + p.n > H.stamina.cap) return { ok: false, reason: "cap" };
    const ids = new Set(uids);
    sv.tools = sv.tools.filter(t => !ids.has(t.uid));
    if (ids.has(sv.equipped)) sv.equipped = null;
    M.stamina += p.n;
    return { ok: true, gained: p.n, count: p.count };
  }

  /* ---- 開發者測試用（Game.hunt 才會呼叫；一般玩家看不到這座礦坑）---- */
  function devSet(sv, H, o, rng) {
    const r = run(sv, H, rng);
    o = o || {};
    if (o.phase === "walk") { Object.assign(r, { phase: "walk", dev: null, country: null, mon: null, anim: null, after: null }); }
    else if (o.phase === "dev") { Object.assign(r, { phase: "dev", dev: { kind: o.kind === "map" ? "map" : "cave" }, country: { ok: o.ok !== false, pick: null }, mon: null, anim: null, after: null, since: 0 }); }
    else if (o.phase === "country") { Object.assign(r, { phase: "country", dev: { kind: o.kind === "map" ? "map" : "cave" }, country: { ok: o.ok !== false, pick: null }, mon: null, anim: null, after: null }); }
    else if (o.phase === "hunt") { Object.assign(r, { phase: "hunt", dev: null, country: null, mon: null, anim: null, after: null, kills: int(o.kills, 0, 2) }); }
    if (o.force) r.force = o.force;
    return r;
  }

  const api = { PHASES, mix, newMeta, newRun, fix, validRun, run, peek, stamina, need, halted, busy, gift, step, enterCountry, pickCountry, afterCountry,
    spawn, strike, finishAnim, settle, again, leave, inProgress, feedExact, feedable, feedPreview, canFeed, feed, devSet };
  root.MineHunt = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
