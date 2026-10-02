/* =========================================================
   佐佐木恩惠 v2：純邏輯（不碰畫面、不碰 localStorage）
   - 瀏覽器：window.BoonsV2；node 測試：require("js/boons.js")
   - 規格：docs/13、Claude outputs/Sasaki-v2-review-2026-09-29/DIAGNOSIS.md
   存檔欄位（save.boss）：
     schema:2        恩惠自己的格式版本（頂層 save.v 永遠維持 1，改它會整包清檔）
     epoch:0         正式重置世代（伺服器驗證用，尚未啟用，見 RELEASE_GATE）
     tiers:{autoSpeed,sell,toolCut,toolDur}  各 0～max 階
     rewardLv        已經「產生過獎勵」的最高等級
     pending:[{lv,kind:"pick",opts:null|[...]} | {lv,kind:"tool",id} | {lv,kind:"milestone",id,epoch}]  待領，依 lv 排序（同級 milestone 排後面）
     milestones:{ redrockTrial:{epoch,lv,at,via?} }  里程碑最後一次領取紀錄；epoch 等於目前 boss.epoch＝這個世代已領過（via:"device"＝這台裝置的領取紀錄判定已領，未發工具）
     boons:[...]     舊版恩惠：原樣保留、不截斷，v2 不讀
     legacyStray:[]  格式錯誤的待領資料搬到這裡，不直接刪
   ========================================================= */
(function (root) {
  "use strict";
  const KINDS = ["autoSpeed", "sell", "toolCut", "toolDur"];
  const V2 = config => ((config && config.boss) || {}).boonsV2 || {};
  const kindDef = (config, k) => (V2(config).kinds || {})[k] || { step: 0, max: 0, name: k };
  const maxOf = (config, k) => Math.max(0, Math.floor(Number(kindDef(config, k).max) || 0));
  const r4 = x => Math.round(x * 10000) / 10000;
  const int = (x, d) => (Number.isFinite(Number(x)) ? Math.floor(Number(x)) : d);

  function newBoss() {
    return { favor: 0, level: 1, boons: [], req: null, total: 0,
      schema: 2, epoch: 0, tiers: { autoSpeed: 0, sell: 0, toolCut: 0, toolDur: 0 }, rewardLv: 1, pending: [] };
  }

  /* 冪等遷移：缺欄位才補、數值夾在合法範圍；不刪舊 boons，不動 boss 以外任何欄位。
     onFirst(原始 boss 的複本) 只在「這份存檔第一次升到 schema 2」時呼叫一次（給呼叫端做本機備份）。
     回傳 { migrated } */
  function fix(sv, config, onFirst, known) {
    if (!sv.boss || typeof sv.boss !== "object" || Array.isArray(sv.boss)) sv.boss = newBoss();
    const bs = sv.boss;
    bs.level = Math.max(1, int(bs.level, 1));
    bs.favor = Number.isFinite(Number(bs.favor)) ? Math.max(0, Number(bs.favor)) : 0;
    bs.total = Number.isFinite(Number(bs.total)) ? Math.max(0, Number(bs.total)) : 0;
    if (!Array.isArray(bs.boons)) { stray(bs, { boons: bs.boons }); bs.boons = []; }
    let migrated = false;
    if (bs.schema !== 2) {
      if (onFirst) onFirst(JSON.parse(JSON.stringify(bs)));
      bs.schema = 2;
      // 舊玩家過去的升級不補發新選獎（避免憑空多 20 階）；正式重置後本來就從 Lv1 開始
      bs.rewardLv = bs.level;
      migrated = true;
    }
    bs.epoch = Math.max(0, int(bs.epoch, 0));
    if (!bs.tiers || typeof bs.tiers !== "object" || Array.isArray(bs.tiers)) bs.tiers = {};
    KINDS.forEach(k => { bs.tiers[k] = Math.min(maxOf(config, k), Math.max(0, int(bs.tiers[k], 0))); });
    bs.rewardLv = Math.min(bs.level, Math.max(1, int(bs.rewardLv, bs.level)));
    if (!Array.isArray(bs.pending)) { if (bs.pending != null) stray(bs, { pending: bs.pending }); bs.pending = []; }
    if (!bs.milestones || typeof bs.milestones !== "object" || Array.isArray(bs.milestones)) { if (bs.milestones != null) stray(bs, { milestones: bs.milestones }); bs.milestones = {}; }
    Object.keys(bs.milestones).forEach(id => { const r = bs.milestones[id];
      if (!r || typeof r !== "object" || !Number.isFinite(r.epoch)) { stray(bs, { milestone: id, r }); delete bs.milestones[id]; } });
    const seen = {};
    bs.pending = bs.pending.filter(p => {
      const key = p && p.kind === "milestone" ? "m:" + p.id : p && p.lv;
      const ok = p && typeof p === "object" && Number.isFinite(p.lv) && !seen[key] &&
        ((p.kind === "pick" && (p.opts == null || (Array.isArray(p.opts) && p.opts.every(o => KINDS.includes(o))))) ||
         (p.kind === "tool" && typeof p.id === "string") ||
         (p.kind === "milestone" && !!msDefs(config)[p.id] && p.epoch === bs.epoch));   // 別的世代留下的里程碑待領不能領
      if (ok) seen[key] = 1; else stray(bs, p);
      return ok;
    });
    sortPending(bs);
    queueMilestones(sv, config, known);
    return { migrated };
  }
  const sortPending = bs => bs.pending.sort((a, b) => a.lv - b.lv || (a.kind === "milestone") - (b.kind === "milestone"));

  /* ---------- 里程碑（紅岩鑽頭・試用：Lv25 固定一次，每個 epoch 最多一次） ----------
     known(id, epoch)：呼叫端（game.js）查「這台裝置在這個帳號／世代已經發過」→ 直接記成已領、不排待領、不發工具。
     這只是本機保護；跨裝置、清除瀏覽器資料後接回舊雲端檔，要等伺服器 epoch／claim 紀錄（階段4）才擋得住。 */
  const msDefs = config => V2(config).milestones || {};
  const msDone = (bs, id) => { const r = (bs.milestones || {})[id]; return !!r && r.epoch === bs.epoch; };
  function msTool(config, id) {   // 里程碑工具必須真的存在，而且不是標準鎬子
    const d = msDefs(config)[id], t = d && (config.tools || []).find(x => x.id === d.tool);
    return t && toolCat(config, t.id) !== "pick" ? t.id : null;
  }
  function queueMilestones(sv, config, known) {
    const bs = sv.boss, defs = msDefs(config); let n = 0;
    if (!bs.milestones || typeof bs.milestones !== "object") bs.milestones = {};
    Object.keys(defs).forEach(id => {
      const d = defs[id], lv = int(d && d.lv, 0);
      const drop = () => { bs.pending = bs.pending.filter(p => !(p.kind === "milestone" && p.id === id)); };
      if (msDone(bs, id)) return drop();
      if (lv < 1 || bs.level < lv || !msTool(config, id)) return;
      if (known && known(id, bs.epoch)) { bs.milestones[id] = { epoch: bs.epoch, lv, at: null, via: "device" }; return drop(); }
      if (bs.pending.some(p => p.kind === "milestone" && p.id === id)) return;
      bs.pending.push({ lv, kind: "milestone", id, epoch: bs.epoch }); n++;
    });
    if (n) sortPending(bs);
    return n;
  }
  function stray(bs, x) { (bs.legacyStray = Array.isArray(bs.legacyStray) ? bs.legacyStray : []).push(x); }

  const tier = (bs, config, k) => Math.min(maxOf(config, k), Math.max(0, int(((bs || {}).tiers || {})[k], 0)));
  const rate = (config, k, t) => r4(t * (Number(kindDef(config, k).step) || 0));       // 0.04×3 → 0.12
  const cap = config => KINDS.reduce((a, k) => a + maxOf(config, k), 0);
  const filled = (bs, config) => KINDS.reduce((a, k) => a + tier(bs, config, k), 0);
  const openKinds = (bs, config) => KINDS.filter(k => tier(bs, config, k) < maxOf(config, k));
  const pendingPicks = bs => (bs.pending || []).filter(p => p.kind === "pick").length;

  /* 工具旗標：沒寫就當 false。編輯器存的舊設定檔（tools 陣列整個被覆蓋、沒有旗標）時，
     同 id 的內建工具以 DEFAULT_CONFIG 的旗標為準；不在內建清單裡的新工具一律 false。 */
  function toolFlag(config, id, flag) {
    const t = (config.tools || []).find(x => x.id === id);
    if (t && t[flag] !== undefined) return t[flag] === true;
    const d = ((root.DEFAULT_CONFIG || {}).tools || []).find(x => x.id === id);
    return !!(d && d[flag] === true);
  }
  const toolCat = (config, id) => {
    const t = (config.tools || []).find(x => x.id === id), d = ((root.DEFAULT_CONFIG || {}).tools || []).find(x => x.id === id);
    return (t && t.category) || (d && d.category) || "";
  };
  /* 可以當「滿階通用謝禮」的工具：列在 rewardTiers、category＝pick、rewardEligible＝true、而且設定裡真的有這把 */
  function rewardable(config, id) {
    return !!id && (config.tools || []).some(x => x.id === id) && toolCat(config, id) === "pick" && toolFlag(config, id, "rewardEligible");
  }
  /* 升級當下已解鎖的最高礦坑（含第二台）→ 固定對照表 rewardTiers 的標準鎬子；該 tier 不合格就往下找 */
  function bestPick(sv, config) {
    const tiers = (config.mines || []).filter(m => (sv.unlocked || []).includes(m.id)).map(m => m.tier);
    const map = V2(config).rewardTiers || {};
    for (let t = tiers.length ? Math.max(...tiers) : 1; t >= 1; t--) if (rewardable(config, map[t])) return map[t];
    return null;
  }

  /* 把 rewardLv 之後到目前等級的每一級都排進待領（跨多級不漏）。
     種類在這一刻決定：還有空階（扣掉已排隊的選擇）就是選擇，否則是鎬子，鎬種立即固定。回傳新增幾筆。 */
  function queue(sv, config, known) {
    const bs = sv.boss; let n = 0;
    while (bs.rewardLv < bs.level) {
      bs.rewardLv++;
      if (filled(bs, config) + pendingPicks(bs) < cap(config)) bs.pending.push({ lv: bs.rewardLv, kind: "pick", opts: null });
      else if (V2(config).maxedReward !== false && bestPick(sv, config)) bs.pending.push({ lv: bs.rewardLv, kind: "tool", id: bestPick(sv, config) });
      else continue;
      n++;
    }
    return n + queueMilestones(sv, config, known);
  }

  /* 輪到第一筆時才產生候選（之後固定，呼叫端要立即存檔）。
     候選失效（例如編輯器改過階數）才重抽；一種都不剩就改成鎬子。回傳是否有改動。 */
  function prepare(sv, config, rnd) {
    const bs = sv.boss, p = bs.pending[0]; if (!p) return false;
    if (p.kind === "tool") {   // 已固定的鎬種只有在設定把它移除／取消可贈送時才換（避免送出不存在或付費道具）
      if (rewardable(config, p.id)) return false;
      const id = bestPick(sv, config);
      if (id) p.id = id; else bs.pending.shift();
      return true;
    }
    if (p.kind !== "pick") return false;
    const open = openKinds(bs, config);
    if (p.opts && p.opts.length && p.opts.every(o => open.includes(o)) &&
        p.opts.length === Math.min(open.length, Math.max(1, V2(config).offer || 2))) return false;
    if (!open.length) {
      const id = bestPick(sv, config);
      if (id) bs.pending[0] = { lv: p.lv, kind: "tool", id }; else bs.pending.shift();
      return true;
    }
    const pool = open.slice(), opts = [], want = Math.min(pool.length, Math.max(1, V2(config).offer || 2));
    while (opts.length < want) opts.push(pool.splice(Math.floor((rnd || Math.random)() * pool.length), 1)[0]);
    p.opts = opts.sort((a, b) => KINDS.indexOf(a) - KINDS.indexOf(b));
    return true;
  }

  /* 領取第一筆。lv 必須對得上（防連點／舊畫面重送）；成功就移除。
     addTool 由呼叫端提供（走正常新工具流程＋耐久恩惠）。 */
  /* 里程碑：guard(id, epoch) 由呼叫端提供（查並寫入本機領取紀錄），回傳 false＝這台裝置已經發過 → 記成已領、不發。
     順序：驗證 → guard → 寫 milestones 紀錄 → 移除待領 → addTool；呼叫端接著立即存檔。全部同步執行，連點／重畫只會成功一次。 */
  function claim(sv, config, lv, choice, addTool, guard) {
    const bs = sv.boss, p = bs.pending[0];
    if (!p || p.lv !== lv) return { ok: false, why: "stale" };
    if (p.kind === "milestone") {
      const tool = msTool(config, p.id);
      if (choice !== p.id || p.epoch !== bs.epoch || !tool) return { ok: false, why: "bad" };
      if (msDone(bs, p.id)) { bs.pending.shift(); return { ok: false, why: "done" }; }
      const g = guard ? guard(p.id, bs.epoch) : true;   // false＝這台裝置發過；"server"＝雲端領取紀錄說這個帳號已在別處領過（階段4-2）
      if (g === false || g === "server") {
        const via = g === "server" ? "server" : "device";
        bs.milestones[p.id] = { epoch: bs.epoch, lv: p.lv, at: null, via }; bs.pending.shift();
        return { ok: false, why: via };
      }
      bs.milestones[p.id] = { epoch: bs.epoch, lv: p.lv, at: new Date().toISOString() };
      bs.pending.shift();
      if (addTool) addTool(tool, 1);
      return { ok: true, kind: "milestone", id: p.id, tool };
    }
    if (p.kind === "pick") {
      if (!p.opts || !p.opts.includes(choice) || tier(bs, config, choice) >= maxOf(config, choice)) return { ok: false, why: "bad" };
      bs.tiers[choice] = tier(bs, config, choice) + 1;
      bs.pending.shift();
      return { ok: true, kind: "pick", choice, tier: bs.tiers[choice] };
    }
    if (p.kind === "tool") {
      bs.pending.shift();
      if (addTool) addTool(p.id, 1);
      return { ok: true, kind: "tool", id: p.id };
    }
    return { ok: false, why: "bad" };
  }

  /* 效果計算：UI 與實際計算共用 */
  const autoInterval = (base, r) => base / (1 + r);                                   // 350/(1+0.2) ≈ 291.7ms
  const toolPrice = (price, r) => Math.max(1, Math.round(price * Math.max(0.1, 1 - r)));
  const toolMax = (dur, r) => Math.max(1, Math.round(dur * (1 + r)));
  const sellTotal = (baseSum, r) => Math.round(baseSum * (1 + r) * 10 + 1e-7) / 10;   // 整筆一次取整到 0.1

  const api = { KINDS, newBoss, fix, tier, toolCat, queueMilestones, msDone, msTool, rate, cap, filled, openKinds, bestPick, rewardable, toolFlag, queue, prepare, claim,
    autoInterval, toolPrice, toolMax, sellTotal, kindDef, maxOf };
  root.BoonsV2 = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
