/* =========================================================
   紅晶（免費取得的高級貨幣）：純邏輯（不碰畫面、不碰 localStorage）
   - 瀏覽器：window.Ruby；node 測試：require("js/ruby.js")（tools/ruby-test.js）
   - 規格：Claude outputs/紅晶高級貨幣設計草案_2026-10-04.md（v4 定案）、docs/20_新礦坑檢查表.md
   - 數值：config.ruby（呼叫端傳入程式內建的 DEFAULT_CONFIG.ruby）
   存檔欄位 save.ruby（頂層 save.v 永遠維持 1；舊存檔沒有這塊時 fix 補 0）：
     bal／got／spent      餘額、累計取得、累計花費（整數）
     day  { date, ads, dig, digGot, frz, board }   當天：完整看完的廣告數、挖礦進度點數、挖礦已得顆數、凍結次數、第一張委託板已領
     week { key, boon, frz }                       本週（台灣週一起算）：恩惠已得顆數、凍結已得顆數
     welcome              null｜{ at, srv }        開帳號 20 顆（srv:false＝還沒向伺服器登記）
     crystals             紅岩鑽頭小結晶數（batch 2）
     drops                已經掉過小結晶的鑽頭編號（最近 200 把）
     probes               持有的礦脈探測器（還沒使用）
     cos                  { owned:[外觀id], name, frame }  擁有與裝備中的外觀（白名單 id；畫面只認 config.ruby.cosmetics 裡有的）
     probe                null｜{ mine, left }     使用中的探測器：哪座礦坑、還剩幾次（不放在 m6 的暫存資料裡，離開礦坑不會被清掉）
   ========================================================= */
(function (root) {
  "use strict";
  const int = (x, lo, hi) => { const n = Math.floor(Number(x)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
  const DAY_MS = 86400000;
  const newDay = date => ({ date: date || "", ads: 0, dig: 0, digGot: 0, frz: 0, board: false });
  const newWeek = key => ({ key: key || "", boon: 0, frz: 0 });
  function newRuby() { return { bal: 0, got: 0, spent: 0, day: newDay(""), week: newWeek(""), welcome: null, crystals: 0, drops: [], probes: 0, probe: null, cos: { owned: [], name: null, frame: null } }; }

  /* "2026-10-05"（台灣日期）→ 那一週週一的日期字串。格式不對回 "" */
  function weekKey(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return "";
    const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
    const dow = (new Date(t).getUTCDay() + 6) % 7;   // 週一＝0
    return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
  }

  /* 冪等修補：缺欄位補 0、數值夾在合法範圍。不動 save.ruby 以外任何欄位 */
  function fix(sv, rc) {
    const max = (rc && rc.maxBal) || 999999;
    const R = sv.ruby && typeof sv.ruby === "object" && !Array.isArray(sv.ruby) ? sv.ruby : (sv.ruby = newRuby());
    R.bal = int(R.bal, 0, max); R.got = int(R.got, 0, 1e9); R.spent = int(R.spent, 0, 1e9);
    const d = R.day && typeof R.day === "object" ? R.day : (R.day = newDay(""));
    d.date = typeof d.date === "string" ? d.date : "";
    d.ads = int(d.ads, 0, 999); d.dig = int(d.dig, 0, 1e9); d.digGot = int(d.digGot, 0, 999); d.frz = int(d.frz, 0, 999); d.board = d.board === true;
    const w = R.week && typeof R.week === "object" ? R.week : (R.week = newWeek(""));
    w.key = typeof w.key === "string" ? w.key : ""; w.boon = int(w.boon, 0, 999); w.frz = int(w.frz, 0, 999);
    if (!(R.welcome && typeof R.welcome === "object" && R.welcome.at)) R.welcome = null;
    R.crystals = int(R.crystals, 0, 1e6);
    R.drops = Array.isArray(R.drops) ? R.drops.filter(x => Number.isFinite(x)).slice(-200) : [];
    R.probes = int(R.probes, 0, 999);
    const okId = x => typeof x === "string" && /^[a-z][a-z0-9_]{2,40}$/.test(x);
    const c = R.cos && typeof R.cos === "object" ? R.cos : (R.cos = {});
    c.owned = Array.isArray(c.owned) ? c.owned.filter(okId).filter((x, i, a) => a.indexOf(x) === i).slice(0, 200) : [];
    c.name = okId(c.name) && c.owned.includes(c.name) ? c.name : null;
    c.frame = okId(c.frame) && c.owned.includes(c.frame) ? c.frame : null;
    if (!(R.probe && typeof R.probe === "object" && typeof R.probe.mine === "string" && int(R.probe.left, 0, 99) > 0)) R.probe = null;
    else R.probe.left = int(R.probe.left, 0, 99);
    return R;
  }

  /* 換日／換週：day＝可信台灣日期；null（日期未知）→ 不換、回傳 false（呼叫端不得發每日／每週來源） */
  function roll(sv, day) {
    const R = sv.ruby;
    if (!day) return false;
    if (R.day.date !== day) R.day = newDay(day);
    const wk = weekKey(day);
    if (wk && R.week.key !== wk) R.week = newWeek(wk);
    return true;
  }

  function add(sv, rc, n) {
    const R = sv.ruby, max = (rc && rc.maxBal) || 999999;
    n = int(n, 0, max);
    const real = Math.min(n, max - R.bal);
    R.bal += real; R.got += real;
    return real;
  }
  /* 購買：先檢查餘額，扣款成功回 true；不會變負數 */
  function spend(sv, price) {
    const R = sv.ruby, p = int(price, 0, 1e9);
    if (!(p > 0) || R.bal < p) return false;
    R.bal -= p; R.spent += p;
    return true;
  }

  /* ---- 各種來源：都回傳這次實際發了幾顆 ---- */
  // 廣告：完整看完才呼叫。網頁示意廣告 rc.ads.enabled=false → 照樣計數、不發
  function onAd(sv, rc, day) {
    if (!roll(sv, day)) return 0;
    const d = sv.ruby.day, A = rc.ads || {};
    d.ads++;
    return A.enabled && (A.at || []).includes(d.ads) ? add(sv, rc, 1) : 0;
  }
  // 當天第一張委託板全部完成
  function onBoard(sv, rc, day, boardNo) {
    if (!roll(sv, day) || boardNo !== 1 || sv.ruby.day.board) return 0;
    sv.ruby.day.board = true;
    return add(sv, rc, rc.board || 0);
  }
  // 挖礦進度：units＝這次累積的點數（＝扣掉的耐久 × 礦坑 perDur）。到每日上限後不再累積
  function onDig(sv, rc, day, units) {
    if (!roll(sv, day)) return 0;
    const d = sv.ruby.day, D = rc.dig || {}, need = D.need || 0, cap = D.dailyCap || 0;
    if (!(need > 0) || d.digGot >= cap) { d.dig = 0; return 0; }
    d.dig += int(units, 0, 1e6);
    let n = 0;
    while (d.dig >= need && d.digGot < cap) { d.dig -= need; d.digGot++; n++; }
    if (d.digGot >= cap) d.dig = 0;
    return n ? add(sv, rc, n) : 0;
  }
  // 恩惠升級：levels＝這次升了幾級；每週上限
  function onBoon(sv, rc, day, levels) {
    if (!roll(sv, day)) return 0;
    const w = sv.ruby.week, B = rc.boon || {};
    const n = Math.max(0, Math.min(int(levels, 0, 999) * (B.per || 0), (B.weekCap || 0) - w.boon));
    w.boon += n;
    return n ? add(sv, rc, n) : 0;
  }
  // 地底凍結：每天次數上限＋每週顆數上限（所有礦坑合計）
  function onFreeze(sv, rc, day) {
    if (!roll(sv, day)) return 0;
    const R = sv.ruby, F = rc.freeze || {};
    if (R.day.frz >= (F.dailyTimes || 0)) return 0;
    const n = Math.max(0, Math.min(F.per || 0, (F.weekCap || 0) - R.week.frz));
    if (!n) return 0;
    R.day.frz++; R.week.frz += n;
    return add(sv, rc, n);
  }
  // 開帳號 20 顆：這份存檔還沒領過才發（帳號一輩子一次由伺服器紀錄把關，見 docs/20 SQL）
  function onWelcome(sv, rc, at, srv) {
    const R = sv.ruby;
    if (R.welcome) return 0;
    R.welcome = { at: at || new Date().toISOString(), srv: !!srv };
    return add(sv, rc, rc.welcome || 0);
  }

  /* 今天的進度（畫面用） */
  function today(sv, rc, day) {
    const R = sv.ruby, sameDay = !!day && R.day.date === day, sameWeek = !!day && R.week.key === weekKey(day);
    const d = sameDay ? R.day : newDay(day), w = sameWeek ? R.week : newWeek("");
    const D = rc.dig || {}, F = rc.freeze || {}, B = rc.boon || {};
    return {
      dig: { got: d.digGot, cap: D.dailyCap || 0, pct: d.digGot >= (D.dailyCap || 0) ? 1 : (D.need ? d.dig / D.need : 0) },
      board: { got: d.board, amount: rc.board || 0 },
      freeze: { times: d.frz, cap: F.dailyTimes || 0, week: w.frz, weekCap: F.weekCap || 0 },
      boon: { week: w.boon, weekCap: B.weekCap || 0 },
      ads: { done: d.ads, enabled: !!(rc.ads || {}).enabled, at: (rc.ads || {}).at || [] }
    };
  }

  const api = { newRuby, weekKey, fix, roll, add, spend, onAd, onBoard, onDig, onBoon, onFreeze, onWelcome, today };
  root.Ruby = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
