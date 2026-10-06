"use strict";
const assert = require("assert");
const config = require("../js/config.js");
const TS = require("../js/titles.js");

const defs = config.titles;
const base = () => ({
  v: 1, dex: {}, unlocked: ["m1"], boss: { level: 1, tiers: {} },
  senpai: { wins: { a: 0, b: 0, c: 0 }, memories: {} }
});
const ctx = (save, over) => Object.assign({ save, dexCats: new Set(), dexCount: 0, boonKinds: ["a", "b", "c", "d"] }, over || {});

assert.strictEqual(defs.length, 50, "稱號必須正好 50 個");
assert.strictEqual(new Set(defs.map(x => x.id)).size, 50, "稱號 id 不可重複");
assert.strictEqual(new Set(defs.map(x => x.name)).size, 50, "稱號名稱不可重複");
defs.forEach(d => {
  assert.ok(d.id && d.name && d.condition && d.intro, `稱號資料不完整：${d.id || "?"}`);
  assert.ok(d.name.length <= 9, `HUD 超過 9 字：${d.name}`);
  assert.ok(Number.isInteger(d.rarity) && d.rarity >= 0 && d.rarity <= 3, `稀有度錯誤：${d.name}`);
});

{
  const save = base();
  TS.fix(save);
  const got = TS.check(save, defs, ctx(save));
  assert.deepStrictEqual(got.map(x => x.id), ["new_miner"], "新存檔只應直接拿到新來的礦工");
  assert.strictEqual(save.titles.equipped, "new_miner", "新稱號應預設戴上");
}

{
  const save = base(); TS.fix(save);
  save.senpai.wins = { a: 500, b: 0, c: 0 };
  let got = TS.check(save, defs, ctx(save)).map(x => x.id);
  assert.ok(got.includes("iwakura_500"), "岩倉 500 次專屬稱號未發放");
  assert.ok(!got.includes("senpai_each_500"), "只有岩倉達標時不可發三人 500 次稱號");
  save.senpai.wins = { a: 500, b: 500, c: 500 };
  got = TS.check(save, defs, ctx(save)).map(x => x.id);
  assert.ok(got.includes("akai_500") && got.includes("kirishima_500") && got.includes("senpai_each_500"), "三人 500 次發放錯誤");
}

{
  const save = base(); TS.fix(save);
  save.stat.swings = 1000000; save.stat.toolsBroken = 100; save.stat.loginDays = 365;
  save.stat.questsCompleted = 250; save.stat.freeze = { normal: 2, senpai: 1 }; save.stat.veinsEntered = 25;
  save.stat.mineSwings = { m1: 3000, m2: 1000, m3: 1000, m4: 1000, m5: 1000, m6: 1 };
  save.unlocked = ["m1", "m2", "m3", "m4", "m5", "m6"];
  save.dex["世界之心"] = { count: 1 };
  save.senpai.wins = { a: 1000, b: 1000, c: 1000 };
  save.senpai.memories = { a: {}, b: {}, c: {} };
  save.boss = { level: 30, tiers: { a: 1, b: 1, c: 1, d: 1 } };
  save.ruby = { got: 1000, cos: { owned: [1,2,3,4,5,6] } };
  const got = TS.check(save, defs, ctx(save, { dexCats: new Set(["good", "rare", "epic", "legend"]), dexCount: 50 }));
  assert.strictEqual(save.titles.owned.length, 50, `全條件達標應取得 50 個，實際 ${save.titles.owned.length}`);
  assert.strictEqual(got.length, 50, "第一次全條件補發數量錯誤");
  save.stat.swings = 0;
  TS.check(save, defs, ctx(save));
  assert.ok(save.titles.owned.includes("swing_1m"), "取得後不得因數值降低被收回");
}

{
  const save = { stat: { swings: -8, freeze: null }, titles: { owned: ["x", "x", 1], equipped: 9 } };
  TS.fix(save);
  assert.strictEqual(save.stat.swings, 0, "負數統計未修正");
  assert.deepStrictEqual(save.titles.owned, ["x"], "稱號清單未去重／清除錯誤值");
  assert.strictEqual(save.titles.equipped, null, "錯誤裝備值未清除");
}

console.log("title-test: 50/50 catalog, unlock, migration and permanence checks passed");
