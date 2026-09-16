/* =========================================================
   預設設定檔 DEFAULT_CONFIG
   - 編輯模式改的東西會「覆蓋」在這份之上（存在瀏覽器裡）
   - 編輯模式「匯出設定」得到的 JSON，交給 Claude 就能寫回這裡
   ========================================================= */
(function (root) {
  const DEFAULT_CONFIG = {
    version: 1,
    gameTitle: "深層礦脈",

    /* ---------- 稀有度（文字顏色分級） ---------- */
    rarities: [
      { id: 0, name: "粗糙", color: "#8a8a8a" },
      { id: 1, name: "普通", color: "#e8e8e8" },
      { id: 2, name: "優良", color: "#55ff55" },
      { id: 3, name: "稀有", color: "#55aaff" },
      { id: 4, name: "史詩", color: "#d070ff" },
      { id: 5, name: "傳說", color: "#ffaa00" }
    ],

    /* ---------- 小役（每揮一次抽一個） ---------- */
    // rarity 對應上面的稀有度；value = 第1層礦坑的基本售價
    categories: [
      { id: "rubble", name: "碎石", rarity: 0, value: 0 },
      { id: "common", name: "普通礦", rarity: 1, value: 1 },
      { id: "good", name: "優良礦", rarity: 2, value: 3 },
      { id: "rare", name: "稀有礦", rarity: 3, value: 8 },
      { id: "epic", name: "史詩礦", rarity: 4, value: 25 },
      { id: "legend", name: "傳說寶物", rarity: 5, value: 150 }
    ],

    rules: {
      /* 通常 / 高確 / 前兆 時的小役機率（碎石 = 剩下的機率） */
      itemTable: {
        common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
        good: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
        rare: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
        epic: [0.0110, 0.0113, 0.0116, 0.0120, 0.0125, 0.0130], // 設定差：判別要素
        legend: [0.0005, 0.0005, 0.0005, 0.0005, 0.0005, 0.0005]
      },
      /* 礦脈（AT）中的小役機率（碎石 = 剩下的機率） */
      veinTable: {
        common: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30],
        good: [0.36, 0.36, 0.36, 0.36, 0.36, 0.36],
        rare: [0.20, 0.20, 0.20, 0.20, 0.20, 0.20],
        epic: [0.10, 0.10, 0.10, 0.10, 0.10, 0.10],
        legend: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01]
      },

      /* 礦脈當選率：抽到某個小役時，當選礦脈的機率（設定1~6） */
      veinWin: {
        normal: {
          rubble: [0.0004, 0.00042, 0.00045, 0.0005, 0.00055, 0.0006],
          common: [0.0004, 0.00042, 0.00045, 0.0005, 0.00055, 0.0006],
          good: [0.0016, 0.0017, 0.0019, 0.0021, 0.0023, 0.0026],
          rare: [0.008, 0.0085, 0.009, 0.010, 0.011, 0.012],
          epic: [0.10, 0.105, 0.11, 0.12, 0.13, 0.14],
          legend: [1, 1, 1, 1, 1, 1]
        },
        koukaku: {
          rubble: [0.005, 0.0052, 0.0055, 0.006, 0.0065, 0.007],
          common: [0.005, 0.0052, 0.0055, 0.006, 0.0065, 0.007],
          good: [0.016, 0.017, 0.018, 0.02, 0.022, 0.024],
          rare: [0.06, 0.063, 0.066, 0.07, 0.075, 0.08],
          epic: [0.24, 0.25, 0.26, 0.27, 0.29, 0.30],
          legend: [1, 1, 1, 1, 1, 1]
        }
      },

      /* 通常 → 高確 移行率（抽到某小役且沒當選時） */
      toKoukaku: {
        rubble: [0.001, 0.001, 0.0011, 0.0012, 0.0013, 0.0015],
        common: [0.001, 0.001, 0.0011, 0.0012, 0.0013, 0.0015],
        good: [0.015, 0.016, 0.017, 0.018, 0.02, 0.022],
        rare: [0.075, 0.078, 0.08, 0.085, 0.09, 0.1],
        epic: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
        legend: [0, 0, 0, 0, 0, 0]
      },
      koukakuDrop: 0.1,            // 高確每揮一次轉落回通常的機率（平均約 10 揮）

      zencho: { min: 3, max: 8 },  // 當選後，前兆持續幾揮
      fakeZencho: { normal: 0.004, koukaku: 0.02, min: 2, max: 6 }, // 假前兆（ガセ）

      vein: {
        length: 25,                                   // 一次礦脈幾揮
        continue: [0.28, 0.29, 0.30, 0.32, 0.34, 0.36] // 礦脈結束時的延續率
      },
      tenjou: 800,                  // 天井：通常+高確累計幾揮必定當選

      toolDrop: { normal: 0.0015, vein: 0.006, sameTier: 0.2, minDur: 0.2, maxDur: 0.6 }, // 工具掉落（同階機率、剩餘耐久比例）

      /* 敘述框期待度顏色：[白, 綠, 藍, 紫, 金, 虹] 權重 */
      omen: {
        names: ["白", "綠", "藍", "紫", "金", "虹"],
        colors: ["#e8e8e8", "#55ff55", "#55aaff", "#d070ff", "#ffaa00", "rainbow"],
        normal: [930, 55, 13, 2, 0, 0],
        koukaku: [700, 200, 80, 20, 0, 0],
        fake: [300, 330, 250, 115, 5, 0],
        zencho: [150, 250, 280, 250, 55, 15]
      },

      settingDist: [0.30, 0.25, 0.20, 0.12, 0.08, 0.05], // 每天各礦坑分到設定1~6的比例
      adDailyLimit: 10
    },

    /* ---------- 工具（耐久度 = 可揮次數） ---------- */
    tools: [
      { id: "wood", tier: 1, name: "木鎬", durability: 60, price: 120, rarity: 1 },
      { id: "stone", tier: 2, name: "石鎬", durability: 120, price: 720, rarity: 2 },
      { id: "iron", tier: 3, name: "鐵鎬", durability: 200, price: 3200, rarity: 3 },
      { id: "gold", tier: 4, name: "金鎬", durability: 300, price: 12000, rarity: 4 },
      { id: "diamond", tier: 5, name: "鑽石鎬", durability: 500, price: 50000, rarity: 5 }
    ],
    upgrade: { maxLevel: 5, costMul: 6, durabilityPerLv: 0.10, valuePerLv: 0.02 },

    /* ---------- 礦坑（地圖） ---------- */
    mines: [
      { id: "m1", tier: 1, name: "淺層洞窟", mult: 1, unlock: 0,
        items: { common: ["石塊", "燧石"], good: ["煤炭"], rare: ["銅礦"], epic: ["紫水晶"], legend: ["遠古化石"] } },
      { id: "m2", tier: 2, name: "煤灰坑道", mult: 3, unlock: 1500,
        items: { common: ["頁岩", "煤渣"], good: ["鐵砂"], rare: ["銀礦"], epic: ["青金石"], legend: ["礦工的懷錶"] } },
      { id: "m3", tier: 3, name: "鏽鐵礦山", mult: 8, unlock: 10000,
        items: { common: ["玄武岩", "鏽塊"], good: ["鐵礦"], rare: ["金礦"], epic: ["紅寶石"], legend: ["失落的齒輪核心"] } },
      { id: "m4", tier: 4, name: "熔岩深淵", mult: 20, unlock: 50000,
        items: { common: ["黑曜石屑", "焦岩"], good: ["火晶石"], rare: ["白金礦"], epic: ["藍寶石"], legend: ["炎龍之鱗"] } },
      { id: "m5", tier: 5, name: "星核裂谷", mult: 50, unlock: 250000,
        items: { common: ["星塵岩", "虛空石"], good: ["秘銀"], rare: ["鑽石"], epic: ["星辰碎片"], legend: ["世界之心"] } }
    ],

    /* ---------- 文字（盡量少，可在編輯模式修改） ---------- */
    texts: {
      swing: ["鏗！", "咚！", "喀啦！", "鏘！"],
      rubble: ["……只有碎石", "……碎石", "……什麼都沒有"],
      omenLine: ["", "岩壁微微發亮", "聽見了風聲", "腳下在震動", "金色的光從縫隙透出", "整座礦山在呼應你"],
      koukakuHint: "空氣變得潮濕了",
      veinStart: "★ 礦脈出現 ★",
      veinContinue: "礦脈延續！",
      veinEnd: "礦脈枯竭了",
      fakeEnd: "……震動停止了",
      tenjou: "天井到達！",
      toolDrop: "挖到了工具：",
      toolBreak: "壞掉了：",
      noTool: "沒有可用的工具",
      tap: "▼ 點擊"
    },

    /* ---------- 版面 / 主題 / 圖片（編輯模式寫入） ---------- */
    theme: {
      bg: "#1b1b1f", panel: "#2b2b31", panelDark: "#141417",
      border: "#5a5a64", accent: "#ffcc33", text: "#e8e8e8", sub: "#9a9aa5",
      fontSize: 16
    },
    layout: {},
    images: {}
  };

  root.DEFAULT_CONFIG = DEFAULT_CONFIG;
  if (typeof module !== "undefined") module.exports = DEFAULT_CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
