/* 深層礦脈：稱號存檔正規化與條件判定（純邏輯，方便 Node 測試） */
(function (root) {
  const BOSSES = ["a", "b", "c"];
  const n = v => Math.max(0, Math.floor(Number(v) || 0));
  const get = (o, path) => path.split(".").reduce((v, k) => v && v[k], o);

  function freshStat() {
    return {
      v: 1, swings: 0, loginDays: 0, lastLoginDay: "", questsCompleted: 0, toolsBroken: 0,
      freeze: { normal: 0, senpai: 0 }, veinsEntered: 0, mineSwings: {}
    };
  }

  function fix(save) {
    let changed = false;
    if (!save.stat || typeof save.stat !== "object" || Array.isArray(save.stat)) { save.stat = freshStat(); changed = true; }
    const s = save.stat;
    ["swings", "loginDays", "questsCompleted", "toolsBroken", "veinsEntered"].forEach(k => {
      const v = n(s[k]); if (s[k] !== v) { s[k] = v; changed = true; }
    });
    if (typeof s.lastLoginDay !== "string") { s.lastLoginDay = ""; changed = true; }
    if (!s.freeze || typeof s.freeze !== "object") { s.freeze = { normal: 0, senpai: 0 }; changed = true; }
    ["normal", "senpai"].forEach(k => { const v = n(s.freeze[k]); if (s.freeze[k] !== v) { s.freeze[k] = v; changed = true; } });
    if (!s.mineSwings || typeof s.mineSwings !== "object" || Array.isArray(s.mineSwings)) { s.mineSwings = {}; changed = true; }
    Object.keys(s.mineSwings).forEach(k => { const v = n(s.mineSwings[k]); if (s.mineSwings[k] !== v) { s.mineSwings[k] = v; changed = true; } });
    if (s.v !== 1) { s.v = 1; changed = true; }

    if (!save.titles || typeof save.titles !== "object" || Array.isArray(save.titles)) { save.titles = { owned: [], equipped: null, grantVersion: 0 }; changed = true; }
    const t = save.titles;
    if (!Array.isArray(t.owned)) { t.owned = []; changed = true; }
    const own = [...new Set(t.owned.filter(x => typeof x === "string"))];
    if (own.length !== t.owned.length) { t.owned = own; changed = true; }
    if (t.equipped !== null && typeof t.equipped !== "string") { t.equipped = null; changed = true; }
    if (t.grantVersion !== 1) { t.grantVersion = 1; changed = true; }
    return changed;
  }

  function progress(def, ctx) {
    const save = ctx.save || {}, stat = save.stat || freshStat(), wins = ((save.senpai || {}).wins || {}), memories = ((save.senpai || {}).memories || {});
    let value = 0, target = n(def.target || 1), done = false, text = "";
    switch (def.kind) {
      case "start": value = 1; target = 1; break;
      case "stat": value = n(get(stat, def.path)); break;
      case "unlocked": value = (save.unlocked || []).includes(def.key) ? 1 : 0; target = 1; break;
      case "mineSwings": value = n((stat.mineSwings || {})[def.key]); break;
      case "mineSwingsAll": {
        const vals = (def.keys || []).map(k => n((stat.mineSwings || {})[k]));
        value = vals.length ? Math.min(...vals) : 0;
        text = `最低進度 ${value.toLocaleString("en-US")}／${target.toLocaleString("en-US")}`;
        break;
      }
      case "dexCat": value = ctx.dexCats && ctx.dexCats.has(def.key) ? 1 : 0; target = 1; break;
      case "dexName": value = save.dex && save.dex[def.key] ? 1 : 0; target = 1; break;
      case "dexCount": value = n(ctx.dexCount); break;
      case "bossEach": {
        const bosses = Array.isArray(def.bosses) && def.bosses.length ? def.bosses : BOSSES;
        value = Math.min(...bosses.map(k => n(wins[k])));
        text = `最低進度 ${value.toLocaleString("en-US")}／${target.toLocaleString("en-US")}`;
        break;
      }
      case "bossTotal": value = BOSSES.reduce((a, k) => a + n(wins[k]), 0); break;
      case "memory": value = memories[def.key] ? 1 : 0; target = 1; break;
      case "memoriesAll": value = BOSSES.filter(k => memories[k]).length; target = 3; break;
      case "bossLevel": value = n((save.boss || {}).level); break;
      case "boonAll": {
        const tiers = (save.boss || {}).tiers || {};
        value = (ctx.boonKinds || []).filter(k => n(tiers[k]) >= 1).length;
        target = (ctx.boonKinds || []).length || 4;
        break;
      }
      case "rubyGot": value = n(((save.ruby || {}).got)); break;
      case "cosmetics": {
        const owned = (((save.ruby || {}).cos || {}).owned);
        value = Array.isArray(owned) ? new Set(owned).size : 0;
        break;
      }
    }
    done = value >= target;
    if (!text) text = `目前 ${value.toLocaleString("en-US")}／${target.toLocaleString("en-US")}`;
    return { value, target, done, text };
  }

  function check(save, defs, ctx) {
    fix(save);
    const set = new Set(save.titles.owned), added = [];
    (defs || []).forEach(def => {
      if (!set.has(def.id) && progress(def, ctx).done) { set.add(def.id); added.push(def); }
    });
    save.titles.owned = [...set];
    if (save.titles.equipped && !set.has(save.titles.equipped)) save.titles.equipped = null;
    if (!save.titles.equipped && set.has("new_miner")) save.titles.equipped = "new_miner";
    return added;
  }

  const api = { BOSSES, freshStat, fix, progress, check };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TitleSystem = api;
})(typeof window !== "undefined" ? window : globalThis);
