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
         seedFx／nFx 終結技、蓄力與假復活種子流；seedRev／nRev 真復活種子流；兩者都不碰既有勝負與收入抽選
         since     距離上次發展的步數（30 步保底）
         dev       { kind: "cave"|"map" }
         country   { ok: 預抽成敗, pick: null｜0～2 }
         kills／gold／mon{win,pres,combo,fx}／anim{kind,stage,pick,rid,combo,finisher,tier}／after／rid  狩獵。combo＝風格池 0突刺／1橫掃／2蓄力；fx 保存池內終結技、蓄力階與真／假復活結果；
                  單鈕（出招）的怪由呈現抽選那一抽順便決定（不多抽一次），選項怪＝玩家選的招式；都跟著預抽結果存進存檔，重新整理套路不變
         第二階段（2026-10-08，規格 新礦坑_冒險狩獵_第二階段規格）：phase 新增 "dragon"巨龍｜"realm"轉生狹間｜"ember"輪迴的餘燼
         realm     { type:"heaven"|"hell", n:本輪已擊倒隻數, round:第幾輪, total:本趟狹間累計 }（判定演出開始時建立，凱旋清掉）
         ember     { ok:預抽成敗, next:成功後下一輪 "heaven"|"hell", pressed }（撐滿進入餘燼時預抽）
         mon 擴充  巨龍多 entry（預抽的入口類型）、pres 固定 2；狹間多 cont（這隻打完是否繼續）、win 固定 true
         anim.kind 新增 "judge"（帶 type、first）｜"ember"；after 新增 "judge"｜"rspawn"｜"rend"｜"ember"｜"emberfail"；hunt 的 "full" 現在＝接到巨龍
         抽選次數（寫死，不得改順序）：巨龍 draw×2（勝負、入口天堂）；狹間每隻 draw×1（繼續）＋drawP×1（呈現＋套路）；進餘燼 draw×2（成功、下一輪天堂）；判定 0
         回合戰鬥（2026-10-08，規格 新礦坑_冒險狩獵_回合戰鬥規格）：mon.sc＝{ R, hp0, rs:[[pHit,pDmg,mHit,mDmg,var]…] } 劇本（spawn 那一刻用獨立種子流 seedB／nB 排好、整份存檔；勝負與其他抽選一個字不動）、mon.t＝目前第幾輪（0 起算）；
                  anim.kind "round"（中途一輪，anim.t＝輪次、after "round"）；run.hp＝下位到巨龍連續累積的角色血量（進狹間每隻回滿）。舊戰鬥（沒有 sc）視為只有 1 輪
         last      { gold, kills, why:"full"(舊)|"down"|"empty"|"realm"|"ember", realmKills?, rounds? }  凱旋統計
   - 防作弊：任何影響結果的隨機，在「付出體力的那一刻」抽好、寫進存檔，呼叫端 persist 之後才演出。
   - 金幣：只累積在 run.gold，settle() 才一次進 save.coins；餵食（feed）是原子操作，不扣耐久、不算用壞、不累積紅晶。
   ========================================================= */
(function (root) {
  "use strict";
  const int = (x, lo, hi) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
  const isObj = o => o && typeof o === "object" && !Array.isArray(o);
  const PHASES = ["walk", "dev", "country", "hunt", "dragon", "realm", "ember", "done"];
  const KINDS = ["heaven", "hell"];
  const LEGACY_ATTRS = ["hunt", "dragon", "realm"];
  const ATTRS = ["hp", "atk", "luck"];
  const ITEM_IDS = ["whetstone", "scale-wedge", "guide-bell", "twin-hunt", "twin-realm", "star-ember"];
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
  const drawI = run => mix(run.seedI, run.nI++);     // 第三階段道具專用；絕不碰勝負流
  const drawFx = run => mix(run.seedFx, run.nFx++);  // 終結技／蓄力／假復活；絕不碰勝負流
  const drawRev = run => mix(run.seedRev, run.nRev++); // 真復活；絕不碰勝負流
  const drawE = run => mix(run.seedE, run.nE++);       // 新流程入口專用；不碰既有勝負／演出流
  const newSeed = rng => Math.floor((rng || Math.random)() * 4294967296) >>> 0;
  const FINISHER_POOLS = [["pierce-rise", "meteor-pierce", "sky-rend"], ["gale-seven", "twin-moon-cross", "horizon-break"], ["moonwheel-fall", "mountain-one"]];
  const FINISHER_IDS = [].concat(...FINISHER_POOLS);

  function newMeta() { return { v: 1, stamina: 0, visits: 0, claimed: {}, seenLight: false, gifted: false }; }
  function newRun(rng) {
    return { phase: "walk", seed: newSeed(rng), n: 0, seedP: newSeed(rng), nP: 0, since: 0, dev: null, country: null,
      kills: 0, gold: 0, mon: null, anim: null, after: null, rid: 0, last: null, realm: null, ember: null, seedB: newSeed(rng), nB: 0, hp: 100,
      rv: 4, seedI: newSeed(rng), nI: 0, seedFx: newSeed(rng), nFx: 0, seedRev: newSeed(rng), nRev: 0, seedE: newSeed(rng), nE: 0,
      attr: attr0(), items: {}, itemOffer: null, awaiting: null, pendingEntry: null,
      segmentSteps: 0, setting: 1, countryCount: 0, totalSuccess: 0, visited: [], answers: {}, lastCountry: null, entry: null,
      routeItems: {}, event: null, warnedUnspent: false, maxHp: 100, companion: false, atStep: 0, story: null, atEvent: null };
  }
  const mineId = H => (H.mine || {}).id || "m7";

  const attr0 = () => ({ free: 0, hp: 0, atk: 0, luck: 0, hunt: 0, dragon: 0, realm: 0, earned: 0 });
  const itemMap = r => { const all = (r && r.items) || {}; for (const id of ITEM_IDS) if (all[id]) return id; return null; };
  function fixStage3(r, H) {
    r.rv = r.rv === 4 ? 4 : r.rv === 3 ? 3 : 2;   // 頂層 save.v 仍為 1；舊行程照原版本跑完
    r.seedI = Number.isFinite(r.seedI) ? r.seedI >>> 0 : (mix(r.seed, 0x1A73C9E5) * 4294967296) >>> 0;
    r.nI = int(r.nI === undefined ? 0 : r.nI, 0, 1e9);
    r.seedFx = Number.isFinite(r.seedFx) ? r.seedFx >>> 0 : (mix(r.seedP, 0x46A17C2D) * 4294967296) >>> 0;
    r.nFx = int(r.nFx === undefined ? 0 : r.nFx, 0, 1e9);
    r.seedRev = Number.isFinite(r.seedRev) ? r.seedRev >>> 0 : (mix(r.seed, 0x6B4F91E3) * 4294967296) >>> 0;
    r.nRev = int(r.nRev === undefined ? 0 : r.nRev, 0, 1e9);
    const a = isObj(r.attr) ? r.attr : attr0();
    for (const k of ["free", "hp", "atk", "luck", "hunt", "dragon", "realm", "earned"]) a[k] = int(a[k], 0, Number.MAX_SAFE_INTEGER);
    r.attr = a;
    if (r.rv === 4) fixEntrance(r, H);
    const src = isObj(r.items) ? r.items : {}, got = {};
    let kept = false;
    for (const id of ITEM_IDS) { got[id] = !kept && src[id] === 1 ? 1 : 0; if (got[id]) kept = true; }
    r.items = got;
    const waits = ["spawn", "full", "judge", "rspawn"];
    r.awaiting = waits.includes(r.awaiting) && (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") && !r.mon && !r.anim ? r.awaiting : null;
    r.pendingEntry = KINDS.includes(r.pendingEntry) ? r.pendingEntry : null;
    if (r.awaiting !== "judge") r.pendingEntry = null;
    const o = r.itemOffer;
    if (o !== null && o !== undefined) {
      const ids = H.items || [], known = x => ids.some(y => y.id === x), choice = o && o.route === "choice" && Array.isArray(o.candidates) && o.candidates.length === 2 && o.candidates[0] !== o.candidates[1] && o.candidates.every(known);
      const empty = o && o.route === "empty" && Array.isArray(o.candidates) && o.candidates.length === 0;
      const direct = o && o.route === "direct" && Array.isArray(o.candidates) && o.candidates.length === 1 && known(o.candidates[0]);
      const stage = o && (o.stage === "offer" || o.stage === "show");
      const chosen = o && (o.chosen === null || o.chosen === "left" || o.chosen === "right" || known(o.chosen));
      if (!(isObj(o) && Number.isInteger(o.rid) && stage && chosen && (choice || empty || direct))) r.itemOffer = null;
      else {
        o.rid = int(o.rid, 1, 1e9);
        if ((direct && (o.stage !== "show" || o.chosen !== o.candidates[0] || itemMap(r) !== o.chosen)) ||
            (choice && o.stage === "show" && (!known(o.chosen) || !o.candidates.includes(o.chosen) || itemMap(r) !== o.chosen)) ||
            (empty && o.stage === "show" && o.chosen !== "left" && o.chosen !== "right") ||
            ((choice || empty) && o.stage === "offer" && o.chosen !== null)) r.itemOffer = null;
      }
    } else r.itemOffer = null;
  }

  function fixEntrance(r, H) {
    r.seedE = Number.isFinite(r.seedE) ? r.seedE >>> 0 : (mix(r.seed, 0x4E545259) * 4294967296) >>> 0;
    r.nE = int(r.nE, 0, 1e9); r.segmentSteps = int(r.segmentSteps, 0, 20); r.setting = int(r.setting || 1, 1, 6); r.countryCount = int(r.countryCount, 0, 1e6);
    r.totalSuccess = int(r.totalSuccess, 0, 1e9); r.warnedUnspent = r.warnedUnspent === true;
    const ids = (H.countries || []).map(x => x.id);
    r.visited = Array.isArray(r.visited) ? [...new Set(r.visited.filter(x => ids.includes(x)))].slice(0, ids.length) : [];
    r.answers = isObj(r.answers) ? r.answers : {};
    for (const id of Object.keys(r.answers)) {
      if (!ids.includes(id) || !Array.isArray(r.answers[id])) delete r.answers[id];
      else r.answers[id] = r.answers[id].filter(x => isObj(x) && int(x.q, 0, 99) === x.q && int(x.pick, 0, 2) === x.pick && int(x.answer, 0, 2) === x.answer && typeof x.ok === "boolean").slice(0, 99);
    }
    r.lastCountry = ids.includes(r.lastCountry) ? r.lastCountry : null;
    r.entry = r.entry === "direct" || r.entry === "country" ? r.entry : null;
    const supplies = ((H.entrance || {}).items || []).map(x => x.id), src = isObj(r.routeItems) ? r.routeItems : {};
    r.routeItems = Object.fromEntries(supplies.map(id => [id, int(src[id], 0, 1e6)]));
    if (r.event !== null && r.event !== undefined && !isObj(r.event)) r.event = null;
    r.companion = r.companion === true; r.atStep = int(r.atStep, 0, 99);
    r.maxHp = int(r.maxHp || 100, 1, 100000); r.hp = Math.max(1, Math.min(r.maxHp, Number.isFinite(Number(r.hp)) ? Number(r.hp) : r.maxHp));
    if (!(isObj(r.story) && ["open", "dragon"].includes(r.story.kind))) r.story = null;
    if (r.atEvent !== null && r.atEvent !== undefined && !isObj(r.atEvent)) r.atEvent = null;
  }

  function tierRoll(win, u, H) {
    const a = ((H.finisher || {}).chargeTier || {})[win ? "win" : "lose"] || (win ? [0.20, 0.35, 0.45] : [0.65, 0.30, 0.05]);
    return u < a[0] ? 1 : u < a[0] + a[1] ? 2 : 3;
  }
  function addFinishRolls(r, H, force) {
    if (!r.mon || r.mon.fx) return;
    const eligible = r.phase === "hunt" || r.phase === "dragon";
    let fake = false, revive = false;
    if (eligible && r.mon.win) fake = drawFx(r) < Number(((H.revive || {}).fakeRate) || 0);
    const trueRate = r.rv === 4 && H.at ? H.at.revive[int(r.setting, 1, 6) - 1] : ((H.revive || {}).trueRate) || 0;   // 新流程：真復活依設定 3.5～6%
    if (eligible && !r.mon.win) revive = drawRev(r) < Number(trueRate);
    const tier = tierRoll(r.mon.win, drawFx(r), H);
    const moves = FINISHER_POOLS.map(pool => pool[Math.min(pool.length - 1, Math.floor(drawFx(r) * pool.length))]);
    if (force && typeof force.fakeRevive === "boolean") fake = force.fakeRevive && eligible && r.mon.win;
    if (force && typeof force.revive === "boolean") revive = force.revive && eligible && !r.mon.win;
    r.mon.fx = { fake, revive, tier: int(force && force.chargeTier !== undefined ? force.chargeTier : tier, 1, 3), moves };
  }

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
    if (sv.huntRuns[id] !== undefined) {
      const rb = JSON.stringify(sv.huntRuns[id]);
      if (!validRun(sv.huntRuns[id], H)) {
      const bad = sv.huntRuns[id];
      const g = isObj(bad) ? int(bad.gold, 0, GOLD_MAX) : 0;
      sv.coins = (Number(sv.coins) || 0) + g;
      sv.huntRuns[id] = newRun(rng);
      changed = true;
      } else if (JSON.stringify(sv.huntRuns[id]) !== rb) changed = true;
    }
    return changed;
  }
  function validRun(r, H) {
    if (!isObj(r) || !PHASES.includes(r.phase)) return false;
    if (!Number.isInteger(r.seed) && !(typeof r.seed === "number" && Number.isFinite(r.seed))) return false;
    if (!Number.isInteger(r.seedP) && !(typeof r.seedP === "number" && Number.isFinite(r.seedP))) return false;
    r.seed = r.seed >>> 0; r.seedP = r.seedP >>> 0;
    // 回合戰鬥（2026-10-08）：劇本種子流與角色血量。舊存檔沒有時由舊 seed 推出（不消耗它）；血量缺就補滿
    r.seedB = Number.isFinite(r.seedB) ? r.seedB >>> 0 : (mix(r.seed, 0x0B477135) * 4294967296) >>> 0;
    r.nB = int(r.nB === undefined ? 0 : r.nB, 0, 1e9);
    if (r.rv !== 4) r.hp = int(r.hp === undefined ? ((H.battle || {}).hpMax || 100) : r.hp, 1, (H.battle || {}).hpMax || 100);   // 新流程的血量上限隨能力變，由 fixEntrance 夾
    r.n = int(r.n, 0, 1e9); r.nP = int(r.nP, 0, 1e9);
    r.since = int(r.since, 0, 1e6); r.kills = int(r.kills, 0, 1e6); r.rid = int(r.rid, 0, 1e9);
    r.gold = int(r.gold, 0, GOLD_MAX);
    fixStage3(r, H);
    const cnt = (H.lower || {}).count || 3;
    const pick = p => p === null || (Number.isInteger(p) && p >= 0 && p <= 2);
    const RL = H.realm || {};
    const capOf = t => ((RL[t] || {}).cap) || 20;
    // 第二階段欄位：缺的補 null；格式不對的丟掉重補（realm 在狹間時是必要的，壞了才整趟作廢）
    if (r.realm === undefined) r.realm = null;
    if (r.ember === undefined) r.ember = null;
    if (r.realm !== null) {
      if (isObj(r.realm) && KINDS.includes(r.realm.type)) {
        r.realm.n = int(r.realm.n, 0, capOf(r.realm.type)); r.realm.round = int(r.realm.round, 1, 1e6); r.realm.total = int(r.realm.total, 0, 1e6);
      } else r.realm = null;
    }
    if (r.ember !== null && !(isObj(r.ember) && typeof r.ember.ok === "boolean" && KINDS.includes(r.ember.next))) r.ember = null;
    if (r.ember) r.ember.pressed = r.ember.pressed === true;
    if (r.phase !== "realm" && r.phase !== "ember") r.realm = null;
    if (r.phase !== "ember") r.ember = null;
    if (r.phase === "hunt" && r.kills > cnt && r.rv !== 4) return false;
    if (r.phase === "dragon" && r.kills > cnt + 1) return false;
    if (r.rv === 4) {
      if (r.phase === "dev" && !(isObj(r.dev) && r.dev.kind === "direct" && typeof r.dev.ok === "boolean" && ["offer", "warn", "enter", "fail"].includes(r.dev.stage))) return false;
      if (r.phase === "country") {
        const c = (H.countries || []).find(x => x.id === (r.country || {}).id), stages = ["intro", "arrive", "task", "result", "farewell", "chest", "goblin", "cave", "warn", "enter", "fail"];
        if (!c || !stages.includes(r.country.stage)) return false;
        r.country.q = int(r.country.q, 0, c.tasks.length - 1); r.country.successes = int(r.country.successes, 0, c.tasks.length);
        r.country.pick = pick(r.country.pick === undefined ? null : r.country.pick) ? r.country.pick : null;
        r.country.answer = pick(r.country.answer === undefined ? null : r.country.answer) ? r.country.answer : null;
        r.country.ok = typeof r.country.ok === "boolean" ? r.country.ok : null;
        if (r.country.stage === "result" && (r.country.pick === null || r.country.answer === null || r.country.ok === null)) return false;
      }
    } else {
      if (r.phase === "dev" || r.phase === "country") {
        if (!isObj(r.country) || typeof r.country.ok !== "boolean" || !pick(r.country.pick === undefined ? null : r.country.pick)) return false;
        if (r.country.pick === undefined) r.country.pick = null;
      }
      if (r.phase === "dev") { if (!isObj(r.dev) || (r.dev.kind !== "cave" && r.dev.kind !== "map")) return false; }
      if (r.phase === "country" && r.dev !== null && !(isObj(r.dev) && (r.dev.kind === "cave" || r.dev.kind === "map"))) return false;
    }
    const hasMon = r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm";
    if (hasMon) {
      if (r.mon !== null && r.rv === 4 && isObj(r.mon) && r.mon.prep === true) {   // 新流程：戰前準備中，勝負還沒抽
        if (!(Number.isInteger(r.mon.pres) && r.mon.pres >= 0 && r.mon.pres <= 2 && typeof r.mon.type === "string" && r.phase !== "realm" && !r.anim)) return false;
        r.mon.bonus = Math.max(0, Math.min(1, Number(r.mon.bonus) || 0)); r.mon.bound = r.mon.bound === true; r.mon.bonusUsed = r.mon.bonusUsed === true;
        if (!(Number.isInteger(r.mon.combo) && r.mon.combo >= 0 && r.mon.combo <= 2)) r.mon.combo = 0;
      } else if (r.mon !== null) {
        if (!(isObj(r.mon) && typeof r.mon.win === "boolean" && Number.isInteger(r.mon.pres) && r.mon.pres >= 0 && r.mon.pres <= 2)) return false;
        if (!(Number.isInteger(r.mon.combo) && r.mon.combo >= 0 && r.mon.combo <= 2)) r.mon.combo = 0;
        if (r.phase === "dragon" && (r.mon.pres !== 2 || !KINDS.includes(r.mon.entry))) return false;
        if (r.phase === "realm" && (r.mon.win !== true || typeof r.mon.cont !== "boolean")) return false;
        // 回合劇本：壞了就丟掉（變成「只有 1 輪」的舊戰鬥），勝負還在 mon.win，不作廢整趟
        if (r.mon.sc !== undefined) {
          if (scOk(r.mon.sc, r.mon.win) && Number.isInteger(r.mon.t) && r.mon.t >= 0 && r.mon.t < r.mon.sc.R) { /* 保留 */ }
          else { delete r.mon.sc; delete r.mon.t; }
        } else delete r.mon.t;
        if (!r.anim) addFinishRolls(r, H, null);
        if (r.mon.fx && (!(typeof r.mon.fx.fake === "boolean" && typeof r.mon.fx.revive === "boolean" && Number.isInteger(r.mon.fx.tier) && r.mon.fx.tier >= 1 && r.mon.fx.tier <= 3 && Array.isArray(r.mon.fx.moves) && r.mon.fx.moves.length === 3 && r.mon.fx.moves.every((x, i) => FINISHER_POOLS[i].includes(x))))) return false;
      }
    } else if (r.mon !== null) return false;
    if (r.phase === "realm" && !r.realm) return false;
    if (r.phase === "ember" && (!r.realm || !r.ember)) return false;
    if (r.anim !== null) {
      if (!isObj(r.anim) || !Number.isInteger(r.anim.rid)) return false;
      const k = r.anim.kind, af = r.after;
      if (k === "round" && (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm")) {
        if (!(r.mon && r.mon.sc && af === "round" && pick(r.anim.pick) && r.anim.t === r.mon.t && r.mon.t < r.mon.sc.R - 1)) return false;
      } else if (k === "finish" && (r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm")) {
        if (!(r.mon && ["charge", "attack", "pending", "revive"].includes(r.anim.stage) && ["win", "lose"].includes(r.anim.outcome) && FINISHER_IDS.includes(r.anim.finisher) && Number.isInteger(r.anim.tier) && r.anim.tier >= 1 && r.anim.tier <= 3)) return false;
      } else if (r.phase === "hunt" || r.phase === "dragon") {
        if (!((k === "kill" || k === "down") && pick(r.anim.pick) && r.mon)) return false;
        if (!(Number.isInteger(r.anim.combo) && r.anim.combo >= 0 && r.anim.combo <= 2)) r.anim.combo = r.anim.pick === null ? 0 : r.anim.pick;   // 舊存檔沒有套路：照選項
        if (r.phase === "hunt" && af !== "spawn" && af !== "full" && af !== "down" && af !== "walk") return false;
        if (r.phase === "dragon" && af !== "judge" && af !== "down") return false;
      } else if (r.phase === "realm") {
        if (k === "kill") {
          if (!(pick(r.anim.pick) && r.mon && (af === "rspawn" || af === "rend" || af === "ember"))) return false;
          if (!(Number.isInteger(r.anim.combo) && r.anim.combo >= 0 && r.anim.combo <= 2)) r.anim.combo = 0;
        } else if (k === "judge") {
          if (r.mon || af !== "rspawn" || !KINDS.includes(r.anim.type)) return false;
          r.anim.first = r.anim.first === true;
        } else return false;
      } else if (r.phase === "ember") {
        if (!(k === "ember" && r.ember.pressed && (af === "judge" || af === "emberfail"))) return false;
      } else return false;
    } else if (r.phase === "ember") r.ember.pressed = false;   // 按了點燃卻沒有演出待播：回到可再按
    if (r.phase === "done") {
      if (!isObj(r.last)) return false;
      r.last.gold = int(r.last.gold, 0, GOLD_MAX); r.last.kills = int(r.last.kills, 0, 1e6);
      if (!["full", "down", "empty", "realm", "ember"].includes(r.last.why)) return false;
      r.last.dragon = r.last.dragon === true;
      if (r.last.realmKills !== undefined) r.last.realmKills = int(r.last.realmKills, 0, 1e6);
      if (r.last.rounds !== undefined) r.last.rounds = int(r.last.rounds, 0, 1e6);
      r.last.attrEarned = int(r.last.attrEarned, 0, Number.MAX_SAFE_INTEGER);
      if (!ITEM_IDS.includes(r.last.itemId)) r.last.itemId = null;
      r.attr = attr0(); r.items = Object.fromEntries(ITEM_IDS.map(id => [id, 0])); r.itemOffer = null; r.awaiting = null; r.pendingEntry = null;
    }
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
    if (r.awaiting || (r.rv === 4 && r.event)) return 0;
    const S = H.stamina;
    if (r.rv === 4 && r.phase === "dev") return 0;
    if (r.rv === 4 && r.story) return 0;   // 新流程直洞：進不進洞都不另扣體力
    if (r.rv === 4 && r.phase === "country") return r.country && r.country.stage === "intro" ? S.countryCost : 0;
    if (r.phase === "walk") return S.perStep;
    if (r.phase === "dev") return S.countryCost;
    if ((r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm") && !r.mon && !r.anim) return S.perStep;
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
  function entranceCfg(H) { return H.entrance || {}; }
  function countryDef(H, id) { return (H.countries || []).find(x => x.id === id) || null; }
  function countryRate(H, id, setting, successes) { const c = countryDef(H, id), E = entranceCfg(H); return !c || successes <= 0 ? 0 : Math.min(1, successes * c.per + E.settingAdd[int(setting, 1, 6) - 1]); }
  function addPoint(r, n) { n = int(n, 0, 2); r.attr.free += n; r.attr.earned += n; return { kind: "point", n }; }
  function addRouteItem(r, H) {
    const rows = entranceCfg(H).items || [], total = rows.reduce((n, x) => n + x.weight, 0), x = drawE(r) * total;
    let sum = 0, got = rows[rows.length - 1]; for (const row of rows) { sum += row.weight; if (x < sum) { got = row; break; } }
    if (!got) return { kind: "empty" }; r.routeItems[got.id] = int((r.routeItems[got.id] || 0) + 1, 0, 1e6); return { kind: "item", id: got.id };
  }
  function goblinGift(r, H) {
    const E = entranceCfg(H), G = E.reward.goblin;
    if (drawE(r) < G.item) return addRouteItem(r, H);
    return addPoint(r, drawE(r) < G.onePoint ? 1 : 2);
  }
  function chestGift(r, H, rich) {
    const C = rich ? entranceCfg(H).reward.countryChest : entranceCfg(H).reward.routeChest, u = drawE(r);
    if (u < C.item) return addRouteItem(r, H);
    if (u < C.item + C.point) return addPoint(r, 1);
    return { kind: "empty" };
  }
  function routeNext(r, H) {
    const E = entranceCfg(H), reached = r.segmentSteps >= E.route.maxSteps || drawE(r) < E.route.progress;
    if (!reached) return null;
    r.segmentSteps = 0;
    if (drawE(r) < E.route.directCave) return { kind: "direct", ok: drawE(r) < E.route.directSuccess };
    const countries = H.countries || [], c = countries[Math.min(countries.length - 1, Math.floor(drawE(r) * countries.length))];
    return { kind: "country", id: c.id };
  }
  function applyRouteNext(r, next) {
    if (!next) return;
    if (next.kind === "direct") { r.phase = "dev"; r.dev = { kind: "direct", ok: next.ok, stage: "offer" }; r.country = null; }
    else { r.phase = "country"; r.dev = null; r.country = { id: next.id, stage: "intro", q: 0, pick: null, answer: null, ok: null, successes: 0, chest: null, gift: null, enterOk: null, guaranteed: false }; }
  }
  function beginHunt(r, H) {
    r.attr.free = 0; r.phase = "hunt"; r.kills = 0; r.mon = null; r.anim = null; r.after = null; r.event = null; r.dev = null; r.country = null;
    const A = H.at;   // 進 AT：累積成功 5 題以上，受傷的小精靈活下來成為同伴；最大血量＝100＋血量點×7（＋同伴）
    r.companion = r.totalSuccess >= A.companion.need;
    r.maxHp = 100 + r.attr.hp * A.hpPerPoint + (r.companion ? A.companion.hp : 0); r.hp = r.maxHp;
    r.atStep = 0; r.atEvent = null; r.story = { kind: "open" };
    return { ok: true, ev: "hunt" };
  }
  function newStep(sv, H, setting) {
    const r = peek(sv, H), M = sv.huntMeta, E = entranceCfg(H);
    if (r.event) return { ok: false, reason: "event" };
    if (M.stamina < H.stamina.perStep) return { ok: false, reason: "hungry", need: H.stamina.perStep - M.stamina };
    M.stamina -= H.stamina.perStep; r.setting = setting; r.segmentSteps++;
    const rewards = [], goblin = drawE(r) < E.route.goblinPerStep, chest = drawE(r) < E.route.chestPerStep;
    if (goblin) rewards.push(goblinGift(r, H)); if (chest) rewards.push(chestGift(r, H, false));
    const next = routeNext(r, H);
    if (goblin || chest) { r.event = { kind: "route", goblin, chest, rewards, next }; return { ok: true, ev: "event" }; }
    applyRouteNext(r, next); return { ok: true, ev: next ? next.kind : "walk" };
  }
  function step(sv, H, ctx) {
    const r = peek(sv, H), M = sv.huntMeta;
    if (!r || r.phase !== "walk") return { ok: false, reason: "state" };
    const setting = ctx && ctx.setting;
    if (!(setting >= 1 && setting <= H.settings.length)) return { ok: false, reason: "nosetting" };   // 日期未知：不能走新的一步
    if (r.rv === 4) return newStep(sv, H, setting);
    if (M.stamina < H.stamina.perStep) return { ok: false, reason: "hungry", need: H.stamina.perStep - M.stamina };
    M.stamina -= H.stamina.perStep;
    r.since++;
    const S = H.settings[setting - 1];
    const u = draw(r);
    if (!(r.since >= H.walk.guarantee || u < S.dev)) return { ok: true, ev: "walk" };
    const uKind = draw(r), uOk = draw(r);
    const kind = uKind < H.walk.caveShare ? "cave" : "map";
    r.dev = { kind }; r.country = { ok: uOk < (kind === "cave" ? S.cave : S.map), pick: null };
    makeItemOffer(r, H);   // 結果流三抽完成後，才碰獨立道具流；先存 offer 再由畫面揭曉
    r.phase = "dev"; r.since = 0;
    return { ok: true, ev: "dev", kind };
  }

  /* ---- 發展 → 國度（進入時扣 2） ---- */
  function enterCountry(sv, H) {
    const r = peek(sv, H), M = sv.huntMeta;
    if (!r) return { ok: false, reason: "state" };
    if (r.rv === 4) {
      if (r.phase !== "country" || !r.country || r.country.stage !== "intro") return { ok: false, reason: "state" };
      if (M.stamina < H.stamina.countryCost) return { ok: false, reason: "hungry", need: H.stamina.countryCost - M.stamina };
      M.stamina -= H.stamina.countryCost; r.countryCount++; if (!r.visited.includes(r.country.id)) r.visited.push(r.country.id);
      r.country.stage = "arrive"; sv.huntMeta.visits = int(sv.huntMeta.visits + 1, 0, 1e9); return { ok: true };
    }
    if (r.phase !== "dev") return { ok: false, reason: "state" };
    if (r.itemOffer) return { ok: false, reason: "item" };
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
    if (r.rv === 4) {
      if (r.country.stage !== "task") return { ok: false, reason: "state" };
      const ok = drawE(r) < 1 / 3, answer = ok ? idx : [0, 1, 2].filter(x => x !== idx)[Math.floor(drawE(r) * 2)];
      r.country.pick = idx; r.country.answer = answer; r.country.ok = ok; r.country.stage = "result";
      const rec = { q: r.country.q, pick: idx, answer, ok }; (r.answers[r.country.id] || (r.answers[r.country.id] = [])).push(rec);
      if (ok) { r.country.successes++; r.totalSuccess++; rec.reward = drawE(r) < entranceCfg(H).reward.success.point ? addPoint(r, 1) : addRouteItem(r, H); }
      return { ok: true, success: ok, reward: rec.reward || null };
    }
    r.country.pick = idx;
    sv.huntMeta.visits = int(sv.huntMeta.visits + 1, 0, 1e9);
    return { ok: true, success: r.country.ok };
  }
  /* 國度結果看完 → 成功進狩獵（自動付第一隻怪的體力）；失敗空手凱旋 */
  function afterCountry(sv, H) {
    const r = peek(sv, H);
    if (!r || r.phase !== "country") return { ok: false, reason: "state" };
    if (r.rv === 4) return advanceEntrance(sv, H, "next");
    if (r.country.pick === null) return { ok: false, reason: "state" };
    if (!r.country.ok) { settle(sv, H, "empty"); return { ok: true, ev: "done" }; }
    r.phase = "hunt"; r.kills = 0; r.mon = null; r.dev = null; r.country = null;
    return spawn(sv, H);
  }

  /* ---- 回合戰鬥劇本（只影響演出，不影響勝負與金幣）。j 的分配寫死：0＝輪數；1+5i 玩家中／miss；2+5i 玩家傷害（顯示值）；3+5i 怪物中／閃開；4+5i 怪物傷害；5+5i 單鈕怪小動畫款式 ---- */
  function makeScript(H, kind, win, sB, hp0, forceR) {
    const B = H.battle, [lo, hi] = B.rounds[kind], [ma, mb] = B.mDmg[kind], [pa, pb] = B.pDmg, u = j => mix(sB, j);
    const R = forceR ? int(forceR, 1, 12) : lo + Math.floor(u(0) * (hi - lo + 1)), last = R - 1, rs = [];
    for (let i = 0; i < R; i++) rs.push([u(1 + 5 * i) >= B.pMiss ? 1 : 0, pa + Math.floor(u(2 + 5 * i) * (pb - pa + 1)), u(3 + 5 * i) >= B.mMiss ? 1 : 0, ma + Math.floor(u(4 + 5 * i) * (mb - ma + 1)), Math.min(2, Math.floor(u(5 + 5 * i) * 3))]);
    for (let i = 1; i < R; i++) if (!rs[i - 1][0] && !rs[i][0]) rs[i][0] = 1;   // 玩家不連續兩輪 miss
    const sum = () => { let t = 0; for (let i = 0; i < last; i++) if (rs[i][2] === 1) t += rs[i][3]; return t; };
    const lastHit = () => { for (let i = last - 1; i >= 0; i--) if (rs[i][2] === 1) return i; return -1; };
    if (win) {   // 勝：最後一輪玩家必中、怪物不反擊；一路撐住（最低剩 winFloor）
      rs[last][0] = 1; rs[last][2] = null; rs[last][3] = null;
      while (sum() > hp0 - B.winFloor) { const i = lastHit(); if (i < 0) break; rs[i][2] = 0; }
    } else {     // 負：最後一輪怪物必中、血量剛好歸零；之前至少挨幾下
      rs[last][2] = 1;
      const budget = hp0 - B.loseFloor, need = Math.min((B.loseMinHits || {})[kind] || 0, last);
      let hits = 0; for (let i = 0; i < last; i++) if (rs[i][2] === 1) hits++;
      for (let i = 0; i < last && hits < need; i++) if (rs[i][2] !== 1) { rs[i][2] = 1; hits++; }
      while (sum() > budget && hits > need) { const i = lastHit(); rs[i][2] = 0; hits--; }
      while (sum() > budget) { let k = -1; for (let i = 0; i < last; i++) if (rs[i][2] === 1 && rs[i][3] > 1 && (k < 0 || rs[i][3] > rs[k][3])) k = i; if (k < 0) break; rs[k][3]--; }
      rs[last][3] = hp0 - sum();
    }
    const sc = { R, hp0, rs };
    if (!scOk(sc, win)) throw new Error("回合劇本自驗失敗");
    return sc;
  }
  /* 劇本結構與一致性檢查（讀檔也用）：勝＝最後一輪沒有反擊且剩血 > 0；負＝最後一輪怪物命中且累計剛好歸零 */
  function scOk(sc, win) {
    if (!isObj(sc) || !Number.isInteger(sc.R) || sc.R < 1 || sc.R > 12 || !Number.isInteger(sc.hp0) || sc.hp0 < 1 || !Array.isArray(sc.rs) || sc.rs.length !== sc.R) return false;
    let sum = 0;
    for (let i = 0; i < sc.R; i++) {
      const x = sc.rs[i], lastR = i === sc.R - 1;
      if (!Array.isArray(x) || x.length !== 5 || !(x[0] === 0 || x[0] === 1) || !Number.isInteger(x[1]) || !Number.isInteger(x[4]) || x[4] < 0 || x[4] > 2) return false;
      if (win && lastR) { if (x[0] !== 1 || x[2] !== null || x[3] !== null) return false; continue; }
      if (!(x[2] === 0 || x[2] === 1) || !Number.isInteger(x[3]) || x[3] < 0) return false;
      if (x[2] === 1) sum += x[3];
    }
    if (win) return sc.hp0 - sum >= 1;
    return sc.rs[sc.R - 1][2] === 1 && sum === sc.hp0;
  }
  /* 第 t 輪開始前的血量（t＝R 時＝這場打完後）。單一來源：由劇本推得，不另存 */
  function hpAt(mon, t) {
    if (!mon || !mon.sc) return null;
    let hp = mon.sc.hp0; const n = Math.min(t, mon.sc.R);
    for (let i = 0; i < n; i++) { const x = mon.sc.rs[i]; if (x[2] === 1) hp -= x[3]; }
    return Math.max(0, hp);
  }
  const kindOf = r => (r.phase === "hunt" ? "lower" : r.phase === "dragon" ? "dragon" : r.realm.type);

  /* 開發者強制值只用一次（spawn／進餘燼各取自己的欄位，用完就刪） */
  function takeForce(r, keys) {
    const f = r.force; if (!f) return {};
    const out = {}; keys.forEach(k => { if (f[k] !== undefined) { out[k] = f[k]; delete f[k]; } });
    if (!Object.keys(f).length) delete r.force;
    return out;
  }
  const presOf = (H, uP) => { const P = H.present; return uP < P[0] ? 0 : uP < P[0] + P[1] ? 1 : 2; };

  /* ---- 第三階段：能力與旅途道具。舊行程 rv=2 沿用第二階段門檻，確保存檔重放結果不變。 ---- */
  function itemDef(H, id) { return (H.items || []).find(x => x.id === id) || null; }
  function chance(r, H, kind) {
    if (!r || r.rv < 3) {
      if (kind === "hunt") return 0.92;
      if (kind === "dragon") return 0.80;
      return kind === "heaven" ? 0.854 : 0.92;
    }
    if (r.rv === 4) {
      const base = kind === "hunt" ? H.lower.win : kind === "dragon" ? H.dragon.win : H.realm[kind].cont;
      const s = r.attr || {}, bonus = (s.atk || 0) * .014 + (s.luck || 0) * .012 + (s.hp || 0) * .006;
      return Math.min(kind === "dragon" ? .94 : .975, base + bonus);
    }
    const key = kind === "heaven" || kind === "hell" ? "realm" : kind;
    const base = key === "hunt" ? H.lower.win : key === "dragon" ? H.dragon.win : H.realm[kind].cont;
    const d = itemDef(H, itemMap(r)), cfg = H.attributes[key], bonus = d ? Number(d[key]) || 0 : 0, n = r.attr[key] || 0;
    const start = Math.min(cfg.cap - Number.EPSILON, base + bonus);
    return Math.min(cfg.cap - Number.EPSILON, cfg.cap - (cfg.cap - start) * Math.pow(1 - cfg.decay, n));
  }
  function goldOf(r, H, kind) {
    if (r && r.rv < 3) return kind === "hunt" ? 11 : kind === "dragon" ? 90 : kind === "heaven" ? 34 : 68;
    return kind === "hunt" ? H.lower.gold : kind === "dragon" ? H.dragon.gold : H.realm[kind].gold;
  }
  function drawItem(r, H) {
    const a = H.items || []; if (a.length < 6) return null;
    const Q = H.itemQuality || {}, common = Number(Q.common) || 0.70, good = Number(Q.good) || 0.25, remain = Math.max(Number.EPSILON, 1 - common);
    const q = drawI(r) < common ? "common" : drawI(r) < good / remain ? "good" : "rare", pool = a.filter(x => x.quality === q);
    return pool[Math.min(pool.length - 1, Math.floor(drawI(r) * pool.length))].id;
  }
  function addItem(r, id) {
    if (!ITEM_IDS.includes(id) || itemMap(r)) return false;
    r.items[id] = 1; return true;
  }
  function makeItemOffer(r, H) {
    if (r.rv !== 3 || r.itemOffer || itemMap(r)) return null;
    const u = drawI(r), E = H.itemEvent || {}, a = Number(E.direct) || 0, b = a + (Number(E.choice) || 0), c = b + (Number(E.empty) || 0);
    if (u < a) {
      const id = drawItem(r, H); if (!id || !addItem(r, id)) return null;
      return r.itemOffer = { rid: Math.max(1, r.nI), route: "direct", candidates: [id], chosen: id, stage: "show" };
    }
    if (u < b) {
      const x = drawItem(r, H); let y = drawItem(r, H), guard = 0;
      if (!x || !y) return null;
      while (x === y && guard++ < 12) y = drawItem(r, H);
      if (x === y) y = ITEM_IDS[(ITEM_IDS.indexOf(y) + 1) % ITEM_IDS.length];
      return r.itemOffer = { rid: Math.max(1, r.nI), route: "choice", candidates: [x, y], chosen: null, stage: "offer" };
    }
    if (u < c) return r.itemOffer = { rid: Math.max(1, r.nI), route: "empty", candidates: [], chosen: null, stage: "offer" };
    return null;
  }
  function pickItem(sv, H, side, rid) {
    const r = peek(sv, H), o = r && r.itemOffer;
    if (!o || o.rid !== rid || o.stage !== "offer" || (side !== "left" && side !== "right")) return { ok: false, reason: "state" };
    o.chosen = side;
    if (o.route === "choice") {
      const id = o.candidates[side === "left" ? 0 : 1];
      if (!addItem(r, id)) return { ok: false, reason: "item" };
      o.chosen = id;
    } else if (o.route !== "empty") return { ok: false, reason: "state" };
    o.stage = "show";
    return { ok: true, route: o.route, itemId: o.route === "choice" ? o.chosen : null };
  }
  function dismissItem(sv, H, rid) {
    const r = peek(sv, H), o = r && r.itemOffer;
    if (!o || o.rid !== rid || o.stage !== "show") return { ok: false, reason: "state" };
    r.itemOffer = null; return { ok: true };
  }
  function earnAttr(r, n) {
    if (r.rv !== 3 || n <= 0) return 0;
    r.attr.free = int(r.attr.free + n, 0, Number.MAX_SAFE_INTEGER);
    r.attr.earned = int(r.attr.earned + n, 0, Number.MAX_SAFE_INTEGER);
    return n;
  }
  function attrSafe(r) { return !!r && !r.anim && !r.mon && (r.rv === 4 ? !!(r.event && r.event.goblin) || (r.phase === "country" && r.country && r.country.stage === "goblin") : (["walk", "dev", "country", "ember"].includes(r.phase) || !!r.awaiting)); }
  function attrActive(r, key) {
    if (r.rv === 4) return ATTRS.includes(key) && r.phase !== "done";
    if (key === "hunt") return r.phase === "walk" || r.phase === "dev" || r.phase === "country" || r.phase === "hunt";
    if (key === "dragon") return r.phase === "walk" || r.phase === "dev" || r.phase === "country" || r.phase === "hunt" || r.phase === "dragon";
    return r.phase !== "done";
  }
  function allocate(sv, H, draft) {
    const r = peek(sv, H);
    if (!r || r.rv < 3 || !attrSafe(r) || !isObj(draft)) return { ok: false, reason: "state" };
    const keys = r.rv === 4 ? ATTRS : LEGACY_ATTRS;
    const d = {}; let total = 0;
    for (const k of keys) { d[k] = int(draft[k], 0, Number.MAX_SAFE_INTEGER); if (d[k] && !attrActive(r, k)) return { ok: false, reason: "inactive" }; total += d[k]; }
    if (!Number.isSafeInteger(total) || total <= 0 || total > r.attr.free) return { ok: false, reason: "points" };
    for (const k of keys) r.attr[k] = int(r.attr[k] + d[k], 0, Number.MAX_SAFE_INTEGER);
    r.attr.free -= total;
    return { ok: true, spent: total };
  }

  /* 排這隻怪的回合劇本：獨立種子流 seedB／nB（每隻怪 +1），勝負確定之後才排，所以強制勝負（開發者）也會得到對應劇本 */
  function addScript(r, H, forceR) {
    const hp0 = r.phase === "realm" ? H.battle.hpMax : int(r.hp, 1, H.battle.hpMax);   // 下位到巨龍連續累積；狹間每隻回滿
    r.mon.sc = makeScript(H, kindOf(r), r.mon.win, (mix(r.seedB, r.nB) * 4294967296) >>> 0, hp0, forceR); r.mon.t = 0; r.nB = int(r.nB + 1, 0, 1e9);
  }

  /* ---- 遇到一隻怪＝付 1 體力＋預抽。下位／巨龍／狹間三種（抽選次數見檔頭，寫死）---- */
  function spawn(sv, H) {
    const r = peek(sv, H), M = sv.huntMeta;
    if (!r || (r.phase !== "hunt" && r.phase !== "dragon" && r.phase !== "realm") || r.mon || r.anim || r.awaiting) return { ok: false, reason: "state" };
    if (r.rv === 4 && r.phase !== "realm") return { ok: false, reason: "walk" };   // 新流程：下位與巨龍由 atStep 走路遇到
    if (M.stamina < H.stamina.perStep) return { ok: false, reason: "hungry", need: H.stamina.perStep - M.stamina };
    M.stamina -= H.stamina.perStep;
    if (r.phase === "dragon") {   // 勝負、入口天堂各 1 抽；呈現不抽（固定三選一，套路＝玩家選的）
      let win = draw(r) < chance(r, H, "dragon"), entry = draw(r) < H.realm.entryHeaven ? "heaven" : "hell";
      const f = takeForce(r, ["win", "entry", "rounds", "fakeRevive", "revive", "chargeTier"]);
      if (typeof f.win === "boolean") win = f.win;
      if (KINDS.includes(f.entry)) entry = f.entry;
      r.mon = { win, pres: 2, combo: 0, entry };
      addScript(r, H, f.rounds);
      addFinishRolls(r, H, f);
      return { ok: true, ev: "mon", pres: 2 };
    }
    let win = true, cont = false;
    if (r.phase === "hunt") win = draw(r) < chance(r, H, "hunt"); else cont = draw(r) < chance(r, H, r.realm.type);
    const uP = drawP(r), P = H.present;
    let pres = presOf(H, uP);
    let combo = Math.min(2, Math.floor((uP % P[0]) / P[0] * 3));   // 單鈕怪的套路：用「單鈕那一段」的 uP 三等分（pres 0 時 uP<P[0]），不多抽一次，所以不改變抽選次數
    const f = takeForce(r, ["win", "pres", "combo", "cont", "rounds", "fakeRevive", "revive", "chargeTier"]);   // 開發者測試用
    if (typeof f.win === "boolean" && r.phase === "hunt") win = f.win;
    if (typeof f.cont === "boolean" && r.phase === "realm") cont = f.cont;
    if (Number.isInteger(f.pres)) pres = Math.max(0, Math.min(2, f.pres));
    if (Number.isInteger(f.combo)) combo = Math.max(0, Math.min(2, f.combo));
    r.mon = r.phase === "hunt" ? { win, pres, combo } : { win: true, pres, combo, cont };
    addScript(r, H, f.rounds);
    addFinishRolls(r, H, f);
    return { ok: true, ev: "mon", pres };
  }
  /* 出招：選項只改演出（斬擊方向與顏色），勝負早在 spawn 決定。結果一次落地，動畫之後才播 */
  function strike(sv, H, idx) {
    const r = peek(sv, H);
    if (!r || (r.phase !== "hunt" && r.phase !== "dragon" && r.phase !== "realm") || !r.mon || r.anim) return { ok: false, reason: "state" };
    if (!(Number.isInteger(idx) && idx >= 0 && idx <= r.mon.pres)) return { ok: false, reason: "arg" };
    const sc = r.mon.sc, lastRound = !sc || r.mon.t >= sc.R - 1;
    r.rid++;
    if (!lastRound) { r.anim = { kind: "round", pick: idx, rid: r.rid, t: r.mon.t }; r.after = "round"; return { ok: true, anim: r.anim }; }   // 中途一輪：只是來回的演出
    const combo = r.mon.pres === 0 ? r.mon.combo : idx;   // 最後一輪的招式決定 5 秒擊殺的套路：突刺 0→C、橫掃 1→A、蓄力 2→B；單鈕怪：預抽時定好的那一種
    addFinishRolls(r, H, null);
    const fx = r.mon.fx, finisher = fx.moves[combo];
    r.anim = { kind: "finish", stage: "charge", pick: idx, rid: r.rid, combo, finisher, tier: fx.tier,
      outcome: r.mon.win ? "win" : "lose", fake: fx.fake === true, revive: fx.revive === true };
    r.after = null;
    return { ok: true, anim: r.anim };
  }

  function releaseCharge(sv, H, rid) {
    const r = peek(sv, H);
    if (!r || !r.anim || r.anim.rid !== rid || r.anim.kind !== "finish" || r.anim.stage !== "charge") return { ok: false, reason: "state" };
    r.anim.stage = "attack";
    return { ok: true, anim: r.anim };
  }
  function pendingDefeat(sv, H, rid) {
    const r = peek(sv, H);
    if (!r || !r.anim || r.anim.rid !== rid || r.anim.kind !== "finish" || r.anim.stage !== "attack" || (r.anim.outcome !== "lose" && !r.anim.fake)) return { ok: false, reason: "state" };
    r.anim.stage = "pending";
    return { ok: true, ev: "pending" };
  }
  function continueDefeat(sv, H, rid) {
    const r = peek(sv, H);
    if (!r || !r.anim || r.anim.rid !== rid || r.anim.kind !== "finish" || r.anim.stage !== "pending") return { ok: false, reason: "state" };
    if (r.anim.fake || r.anim.revive) { r.anim.stage = "revive"; return { ok: true, ev: "revive" }; }
    settle(sv, H, "down");
    return { ok: true, ev: "done" };
  }

  function applyWin(r, H) {
    r.kills++;
    if (r.rv === 4 && (r.phase === "hunt" || r.phase === "dragon")) {   // 新流程：打倒怪物不給能力點；血量照預算的傷害扣，再回最大血量 16%
      const A = H.at, dragon = r.phase === "dragon";
      r.hp = Math.max(1, r.hp - (Number(r.mon.dmg) || 0)); r.hp = Math.min(r.maxHp, r.hp + r.maxHp * A.victoryHeal);
      r.gold = int(r.gold + A.gold[dragon ? "dragon" : "lower"], 0, GOLD_MAX); r.atStep = 0; r.atEvent = null;
      if (dragon) r.after = "judge";
      else r.after = drawE(r) < A.dragonLadder[Math.min(r.kills - 1, A.dragonLadder.length - 1)] ? "full" : "walk";
      return 0;
    }
    let gained = 0;
    const sc = r.mon && r.mon.sc;
    if (sc && r.phase === "hunt") r.hp = Math.max(1, hpAt(r.mon, sc.R));
    if (r.phase === "hunt") { gained = earnAttr(r, 1); r.gold = int(r.gold + goldOf(r, H, "hunt"), 0, GOLD_MAX); r.after = r.kills >= H.lower.count ? "full" : "spawn"; }
    else if (r.phase === "dragon") { gained = earnAttr(r, 2); r.gold = int(r.gold + goldOf(r, H, "dragon"), 0, GOLD_MAX); r.after = "judge"; }
    else {
      const RT = H.realm[r.realm.type];
      r.realm.n++; r.realm.total++; r.gold = int(r.gold + goldOf(r, H, r.realm.type), 0, GOLD_MAX);
      if (r.realm.n % 3 === 0) gained = earnAttr(r, 1);
      r.after = r.realm.n >= RT.cap ? "ember" : r.mon.cont ? "rspawn" : "rend";
    }
    return gained;
  }
  /* 判定演出開始：建立（或重設）本輪狹間。結果＝type，早就預抽好 */
  function startRealm(r, type, first) {
    r.rid++;
    const prev = r.realm;
    r.realm = { type, n: 0, round: prev ? prev.round + 1 : 1, total: prev ? prev.total : 0 };
    r.phase = "realm"; r.ember = null; r.mon = null;
    r.anim = { kind: "judge", type, first, rid: r.rid }; r.after = "rspawn";
  }
  /* 撐滿 → 進餘燼：預抽成敗、成功後下一輪天堂（各 1 抽，共 2 抽） */
  function enterEmber(sv, H) {
    const r = peek(sv, H), RT = H.realm[r.realm.type];
    let ok = draw(r) < H.realm.ember, next = draw(r) < RT.nextHeaven ? "heaven" : "hell";
    const f = takeForce(r, ["emberOk", "emberNext"]);
    if (typeof f.emberOk === "boolean") ok = f.emberOk;
    if (KINDS.includes(f.emberNext)) next = f.emberNext;
    r.phase = "ember"; r.ember = { ok, next, pressed: false }; r.mon = null; r.anim = null; r.after = null;
    return { ok: true, ev: "ember" };
  }
  /* 按「點燃」（單鈕）：成敗早已預抽，這裡只是開始演出 */
  function ignite(sv, H) {
    const r = peek(sv, H);
    if (!r || r.phase !== "ember" || !r.ember || r.ember.pressed || r.anim) return { ok: false, reason: "state" };
    r.ember.pressed = true; r.rid++;
    r.anim = { kind: "ember", rid: r.rid }; r.after = r.ember.ok ? "judge" : "emberfail";
    return { ok: true, anim: r.anim };
  }
  /* 演出播完（或重開後補播完）：rid 對不上就不動作，防止重複前進／重複入帳 */
  function finishAnim(sv, H, rid) {
    const r = peek(sv, H);
    if (!r || !r.anim || r.anim.rid !== rid) return { ok: false, reason: "state" };
    if (r.phase === "done" || !PHASES.includes(r.phase)) return { ok: false, reason: "state" };
    if (r.after === "round" && r.anim.kind === "round" && r.mon) { r.anim = null; r.after = null; r.mon.t++; return { ok: true, ev: "round" }; }   // 這一輪播完 → 回到等待選招
    if (r.anim.kind === "finish") {
      const resolvesWin = (r.anim.stage === "attack" && r.anim.outcome === "win" && !r.anim.fake) || r.anim.stage === "revive";
      if (!resolvesWin || !r.mon) return { ok: false, reason: "state" };
      const gained0 = applyWin(r, H);
      if (gained0) r.anim.attrEarned = gained0;
    }
    const after = r.after, entry = r.mon && r.mon.entry, gained = int(r.anim.attrEarned, 0, 2);
    r.anim = null; r.mon = null; r.after = null;
    if (after === "spawn" || after === "rspawn") { if (gained) { r.awaiting = after; return { ok: true, ev: "attr" }; } return spawn(sv, H); }
    if (after === "walk") return { ok: true, ev: "walk" };
    if (after === "full" && r.rv === 4) { r.phase = "dragon"; return { ok: true, ev: "dragon" }; }   // 新流程：巨龍也要走路找，遇到時才揭露兇手
    if (after === "full") { r.phase = "dragon"; if (gained) { r.awaiting = "full"; return { ok: true, ev: "attr" }; } return spawn(sv, H); }   // 舊行程沒有能力點，仍照原流程直接接巨龍
    if (after === "judge") {
      if (r.phase === "dragon" && gained) { r.awaiting = "judge"; r.pendingEntry = entry; return { ok: true, ev: "attr" }; }
      if (r.phase === "dragon") startRealm(r, entry, true);
      else startRealm(r, r.ember.next, false);
      return { ok: true, ev: "judge" };
    }
    if (after === "ember") return enterEmber(sv, H);
    if (after === "rend") { settle(sv, H, "realm"); return { ok: true, ev: "done" }; }
    if (after === "emberfail") { settle(sv, H, "ember"); return { ok: true, ev: "done" }; }
    settle(sv, H, after);   // "down"
    return { ok: true, ev: "done" };
  }

  /* 能力點提示後繼續；玩家可先投入，也可保留點數。自動模式直接走這裡，不被強制停下。 */
  function continueRun(sv, H) {
    const r = peek(sv, H), w = r && r.awaiting;
    if (!r || !w || r.mon || r.anim) return { ok: false, reason: "state" };
    r.awaiting = null;
    if (w === "judge") { const entry = r.pendingEntry; r.pendingEntry = null; if (!KINDS.includes(entry)) return { ok: false, reason: "state" }; startRealm(r, entry, true); return { ok: true, ev: "judge" }; }
    return spawn(sv, H);
  }

  /* ---- 新流程第 2 階段：AT（找怪、戰前準備、開始戰鬥）。所有新抽選走 seedE；勝負仍走核心 draw ---- */
  function hpPenalty(ratio) {
    if (ratio >= .75) return 0;
    if (ratio >= .50) return (.75 - ratio) / .25 * .06;
    if (ratio >= .25) return .06 + (.50 - ratio) / .25 * .12;
    return .18 + (.25 - Math.max(0, ratio)) / .25 * .20;
  }
  function typeDef(H, type) { const A = H.at; return type === "dragon" ? A.dragon : A.types[type] || A.types.balanced; }
  function winChance(r, H) {
    const A = H.at, m = r.mon, t = typeDef(H, m.type), dragon = m.type === "dragon", s = r.attr;
    let p = (dragon ? t.base : t.lower) + s.atk * t.atk + s.luck * t.luck + s.hp * t.hp + (r.companion ? A.companion.bonus : 0) + (m.bonus || 0);
    p -= hpPenalty(r.hp / r.maxHp);
    return Math.max(A.floor, Math.min(dragon ? A.cap.dragon : A.cap.lower, p));
  }
  function atSpawn(r, H) {
    const A = H.at; r.atStep = 0;
    if (r.phase === "dragon") { r.mon = { prep: true, type: "dragon", pres: 2, combo: 0, bonus: 0, bound: false, bonusUsed: false }; r.story = { kind: "dragon" }; return; }
    const keys = Object.keys(A.types), total = keys.reduce((n, k) => n + A.types[k].weight[0], 0);
    let x = drawE(r) * total, type = keys[keys.length - 1]; for (const k of keys) { x -= A.types[k].weight[0]; if (x < 0) { type = k; break; } }
    const uP = drawP(r), P = H.present, pres = presOf(H, uP), combo = Math.min(2, Math.floor((uP % P[0]) / P[0] * 3));
    r.mon = { prep: true, type, pres, combo, bonus: 0, bound: false, bonusUsed: false };
  }
  /* 走一步找怪：扣 1 體力；路上可能遇到回血蘑菇、寶箱；遇怪率照質數 2、3、5、7、11…% 往上加，打完一隻重新算 */
  function atStep(sv, H) {
    const r = peek(sv, H), M = sv.huntMeta, A = H.at;
    if (!r || r.rv !== 4 || (r.phase !== "hunt" && r.phase !== "dragon") || r.mon || r.anim || r.story) return { ok: false, reason: "state" };
    if (M.stamina < H.stamina.perStep) return { ok: false, reason: "hungry", need: H.stamina.perStep - M.stamina };
    M.stamina -= H.stamina.perStep; r.atStep = int(r.atStep + 1, 0, 99);
    const ev = {};
    if (drawE(r) < A.mushroom) { const before = r.hp; r.hp = Math.min(r.maxHp, r.hp + r.maxHp * A.mushroomHeal); ev.mushroom = Math.round(r.hp - before); }
    if (drawE(r) < A.chest) ev.chest = chestGift(r, H, false);
    const meet = drawE(r) < A.primes[Math.min(r.atStep - 1, A.primes.length - 1)];
    r.atEvent = ev.mushroom !== undefined || ev.chest ? ev : null;
    if (meet) { atSpawn(r, H); return { ok: true, ev: "mon" }; }
    return { ok: true, ev: "walk" };
  }
  function atStory(sv, H) {
    const r = peek(sv, H); if (!r || r.rv !== 4 || !r.story) return { ok: false, reason: "state" };
    r.story = null; return { ok: true };
  }
  /* 戰前使用道具：回血類直接回；加成類（星運符／縛影網／破甲砥石）一場只能用一個 */
  function useRouteItem(sv, H, id) {
    const r = peek(sv, H), A = H.at, d = A.items[id];
    if (!r || r.rv !== 4 || !r.mon || !r.mon.prep || r.anim || r.story || !d) return { ok: false, reason: "state" };
    if (!(r.routeItems[id] > 0)) return { ok: false, reason: "none" };
    if (d.bonus && r.mon.bonusUsed) return { ok: false, reason: "once" };
    if (d.only && r.mon.type !== d.only) return { ok: false, reason: "nouse" };
    if (d.heal && r.hp >= r.maxHp) return { ok: false, reason: "full" };
    r.routeItems[id]--;
    if (d.heal) r.hp = Math.min(r.maxHp, r.hp + r.maxHp * d.heal);
    if (d.bonus) { r.mon.bonus += d.bonus; r.mon.bonusUsed = true; if (d.bound) r.mon.bound = true; }
    return { ok: true, id };
  }
  /* 傷害平均分到怪物命中的回合（血條用 100 格換算），讓演出和真正扣的血一致 */
  function fitDamage(sc, Db) {
    const last = sc.R - 1; Db = Math.max(0, Math.min(sc.hp0 - 1, Db));
    let hits = []; for (let i = 0; i < last; i++) if (sc.rs[i][2] === 1) hits.push(i);
    if (!hits.length && Db > 0 && last > 0) { sc.rs[0][2] = 1; hits = [0]; }
    for (let i = 0; i < last; i++) if (sc.rs[i][2] === 1) sc.rs[i][3] = 0;
    if (!hits.length) return;
    if (Db === 0) { hits.forEach(i => { sc.rs[i][2] = 0; }); return; }
    const each = Math.floor(Db / hits.length); let rest = Db - each * hits.length;
    hits.forEach(i => { sc.rs[i][3] = each + (rest > 0 ? 1 : 0); if (rest > 0) rest--; });
  }
  /* 開始戰鬥：這裡才一次抽好勝負（道具都用完了）。之後不能再用道具 */
  function fight(sv, H) {
    const r = peek(sv, H), A = H.at;
    if (!r || r.rv !== 4 || !r.mon || !r.mon.prep || r.anim || r.story) return { ok: false, reason: "state" };
    const m = r.mon, dragon = m.type === "dragon", f = takeForce(r, ["win", "pres", "combo", "entry", "rounds", "fakeRevive", "revive", "chargeTier"]);
    m.p = winChance(r, H);
    let win = draw(r) < m.p; if (typeof f.win === "boolean") win = f.win;
    if (dragon) { let entry = draw(r) < H.realm.entryHeaven ? "heaven" : "hell"; if (KINDS.includes(f.entry)) entry = f.entry; m.entry = entry; }
    else { if (Number.isInteger(f.pres)) m.pres = int(f.pres, 0, 2); if (Number.isInteger(f.combo)) m.combo = int(f.combo, 0, 2); }
    const t = typeDef(H, m.type), dmg = t.dmg, rolled = dmg[0] + drawE(r) * (dmg[1] - dmg[0]);
    m.dmg = rolled * (1 - Math.min(A.dmgReduceCap, r.attr.hp * A.dmgReducePer)) * (m.bound ? A.items.net.bound : 1);
    m.win = win; m.prep = false;
    const hp0 = Math.max(1, Math.round(r.hp / r.maxHp * H.battle.hpMax));
    m.sc = makeScript(H, dragon ? "dragon" : "lower", win, (mix(r.seedB, r.nB) * 4294967296) >>> 0, hp0, f.rounds); m.t = 0; r.nB = int(r.nB + 1, 0, 1e9);
    if (win) fitDamage(m.sc, Math.round(m.dmg / r.maxHp * H.battle.hpMax));
    addFinishRolls(r, H, f);
    return { ok: true, win };
  }

  function advanceEntrance(sv, H, action) {
    const r = peek(sv, H); if (!r || r.rv !== 4) return { ok: false, reason: "state" };
    if (r.event) { if (action !== "next") return { ok: false, reason: "state" }; const next = r.event.next; r.event = null; applyRouteNext(r, next); return { ok: true, ev: next ? next.kind : "walk" }; }
    if (r.phase === "dev") {
      if (r.dev.stage === "offer") {
        if (action === "stay") { r.phase = "walk"; r.dev = null; return { ok: true, ev: "walk" }; }
        if (action !== "enter") return { ok: false, reason: "state" };
        if (!r.dev.ok) { r.dev.stage = "fail"; return { ok: true, ev: "fail" }; }
        r.entry = "direct"; r.lastCountry = null;
        if (r.attr.free > 0 && !r.warnedUnspent) { r.warnedUnspent = true; r.dev.stage = "warn"; return { ok: true, ev: "warn" }; }
        r.dev.stage = "enter"; return { ok: true, ev: "enter" };
      }
      if (r.dev.stage === "fail" && action === "next") { r.phase = "walk"; r.dev = null; return { ok: true, ev: "walk" }; }
      if (r.dev.stage === "warn" && action === "back") { r.phase = "walk"; r.dev = null; return { ok: true, ev: "walk" }; }
      if ((r.dev.stage === "warn" || r.dev.stage === "enter") && action === "enter") return beginHunt(r, H);
      return { ok: false, reason: "state" };
    }
    if (r.phase !== "country" || !r.country) return { ok: false, reason: "state" };
    const c = r.country, def = countryDef(H, c.id), E = entranceCfg(H);
    if (c.stage === "arrive" && action === "next") { c.stage = "task"; return { ok: true, ev: "task" }; }
    if (c.stage === "result" && action === "next") {
      c.q++; c.pick = c.answer = c.ok = null; c.stage = c.q < def.tasks.length ? "task" : "farewell"; return { ok: true, ev: c.stage };
    }
    if (c.stage === "farewell" && action === "next") {
      c.chest = drawE(r) < E.reward.countryChest.rate ? chestGift(r, H, true) : null;
      if (c.chest) { c.stage = "chest"; return { ok: true, ev: "chest" }; }
      c.gift = goblinGift(r, H); c.stage = "goblin"; return { ok: true, ev: "goblin" };   // 沒有寶箱就直接遇到哥布林
    }
    if (c.stage === "chest" && action === "next") { c.gift = goblinGift(r, H); c.stage = "goblin"; return { ok: true, ev: "goblin" }; }
    if (c.stage === "goblin" && action === "next") {
      if (c.enterOk === true) { c.stage = "enter"; return { ok: true, ev: "enter" }; }
      const rate = countryRate(H, c.id, r.setting, c.successes);
      c.guaranteed = r.countryCount >= 5; c.enterOk = c.guaranteed || drawE(r) < rate; c.stage = "cave"; return { ok: true, ev: "cave" };
    }
    if (c.stage === "cave" && action === "next") {
      if (!c.enterOk) { c.stage = "fail"; return { ok: true, ev: "fail" }; }
      r.entry = "country"; r.lastCountry = c.id;
      if (r.attr.free > 0 && !r.warnedUnspent) { r.warnedUnspent = true; c.stage = "warn"; return { ok: true, ev: "warn" }; }
      c.stage = "enter"; return { ok: true, ev: "enter" };
    }
    if (c.stage === "fail" && action === "next") { r.phase = "walk"; r.country = null; return { ok: true, ev: "walk" }; }
    if (c.stage === "warn" && action === "back") { c.stage = "goblin"; return { ok: true, ev: "goblin" }; }
    if ((c.stage === "warn" || c.stage === "enter") && action === "enter") return beginHunt(r, H);
    return { ok: false, reason: "state" };
  }

  /* ---- 凱旋：本輪金幣一次入帳（原子：coins 增加、金幣歸零、進 done 同一次完成）---- */
  function settle(sv, H, why) {
    const r = peek(sv, H);
    if (!r || r.phase === "done") return { ok: false, reason: "state" };
    const g = int(r.gold, 0, GOLD_MAX);
    sv.coins = (Number(sv.coins) || 0) + g;
    r.last = { gold: g, kills: r.kills, why, attrEarned: r.attr ? r.attr.earned : 0, itemId: itemMap(r) };
    if (why === "down" && r.phase === "dragon") r.last.dragon = true;   // 巨龍打輸：結算用專屬句子
    if (r.realm) { r.last.realmKills = r.realm.total; r.last.rounds = r.realm.round; }
    r.gold = 0; r.mon = null; r.anim = null; r.after = null; r.dev = null; r.country = null; r.realm = null; r.ember = null;
    r.attr = attr0(); r.items = Object.fromEntries(ITEM_IDS.map(id => [id, 0])); r.itemOffer = null; r.awaiting = null; r.pendingEntry = null;
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
    return r.phase === "dev" || r.phase === "country" || r.phase === "hunt" || r.phase === "dragon" || r.phase === "realm" || r.phase === "ember" || r.gold > 0 || r.since > 0;
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
    r.awaiting = null; r.pendingEntry = null; r.itemOffer = null;
    if (o.phase === "walk") { Object.assign(r, { phase: "walk", dev: null, country: null, mon: null, anim: null, after: null }); }
    else if (o.phase === "dev") { Object.assign(r, { phase: "dev", dev: { kind: o.kind === "map" ? "map" : "cave" }, country: { ok: o.ok !== false, pick: null }, mon: null, anim: null, after: null, since: 0 }); }
    else if (o.phase === "country") { Object.assign(r, { phase: "country", dev: { kind: o.kind === "map" ? "map" : "cave" }, country: { ok: o.ok !== false, pick: null }, mon: null, anim: null, after: null }); }
    else if (o.phase === "hunt") { Object.assign(r, { phase: "hunt", dev: null, country: null, mon: null, anim: null, after: null, kills: int(o.kills, 0, 2), realm: null, ember: null }); }
    else if (o.phase === "dragon") { Object.assign(r, { phase: "dragon", dev: null, country: null, mon: null, anim: null, after: null, kills: H.lower.count, realm: null, ember: null }); }
    else if (o.phase === "realm" || o.phase === "ember") {   // o.type 天堂／地獄、o.n 本輪已擊倒隻數（ember 一律撐滿）、o.round、o.ok／o.next（ember）
      const type = o.type === "hell" ? "hell" : "heaven", cap = H.realm[type].cap, n = o.phase === "ember" ? cap : int(o.n, 0, cap - 1);
      Object.assign(r, { phase: o.phase, dev: null, country: null, mon: null, anim: null, after: null, kills: H.lower.count + 1 + n, realm: { type, n, round: int(o.round || 1, 1, 1e6), total: n },
        ember: o.phase === "ember" ? { ok: o.ok !== false, next: o.next === "hell" ? "hell" : "heaven", pressed: false } : null });
    }
    if (Number.isInteger(o.hp)) r.hp = int(o.hp, 1, H.battle.hpMax);
    if (o.force) r.force = o.force;
    return r;
  }

  const api = { PHASES, ATTRS, LEGACY_ATTRS, ITEM_IDS, mix, newMeta, newRun, fix, validRun, run, peek, stamina, need, halted, busy, gift, step, enterCountry, pickCountry, afterCountry, advanceEntrance, countryRate,
    atStep, atStory, useRouteItem, fight, winChance, hpPenalty,
    chance, goldOf, itemDef, makeItemOffer, pickItem, dismissItem, attrSafe, attrActive, allocate, continueRun,
    spawn, strike, releaseCharge, pendingDefeat, continueDefeat, ignite, finishAnim, makeScript, scOk, hpAt, settle, again, leave, inProgress, feedExact, feedable, feedPreview, canFeed, feed, devSet,
    FINISHER_POOLS };
  root.MineHunt = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
