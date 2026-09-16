/* =========================================================
   預設設定檔 DEFAULT_CONFIG
   - 編輯模式改的東西會「覆蓋」在這份之上（存在瀏覽器裡）
   - 編輯模式「匯出設定」得到的 JSON，交給 Claude 就能寫回這裡
   ========================================================= */
(function (root) {
  const DEFAULT_CONFIG = {
    version: 2,
    gameTitle: "深層礦脈",

    /* ---------- 稀有度（文字顏色分級） ---------- */
    rarities: [
      { id: 0, name: "碎石", color: "#8a8a8a" },
      { id: 1, name: "普通", color: "#e8e8e8" },
      { id: 2, name: "綠", color: "#55ff55" },
      { id: 3, name: "藍", color: "#55aaff" },
      { id: 4, name: "紫", color: "#d070ff" },
      { id: 5, name: "金", color: "#ffaa00" }
    ],

    /* ---------- 小役（每揮一次抽一個） ---------- */
    // value = 第1層礦坑的基本售價
    categories: [
      { id: "rubble", name: "碎石", rarity: 0, value: 0 },
      { id: "common", name: "普通礦", rarity: 1, value: 1 },
      { id: "good", name: "綠礦（Replay）", rarity: 2, value: 2 },
      { id: "rare", name: "藍礦（Bell）", rarity: 3, value: 4 },
      { id: "epic", name: "紫礦（機會）", rarity: 4, value: 10 },
      { id: "legend", name: "金礦（強機會）", rarity: 5, value: 30 }
    ],

    rules: {
      /* ① 通常／高確／連續演出／前兆 的小役機率（碎石 = 剩下的） */
      itemTable: {
        common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
        good: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125],
        rare: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06],
        epic: [0.0110, 0.0113, 0.0116, 0.0120, 0.0125, 0.0130],   // 設定差：判別要素
        legend: [0.0036, 0.0037, 0.0038, 0.0040, 0.0042, 0.0045]  // 約 1/280～1/220
      },

      /* ② 金礦（強機會牌） */
      gold: {
        direct: { normal: [0.20, 0.20, 0.20, 0.20, 0.20, 0.20], koukaku: [0.30, 0.30, 0.31, 0.32, 0.33, 0.35] },
        lenWeights: [40, 20, 15, 15, 10]   // 連續演出 1～5 揮的權重（1 揮 = 沒直擊就結束）
      },
      /* ③ 紫礦（機會牌）進入連續演出的機率 */
      purple: {
        chance: { normal: [0.30, 0.30, 0.31, 0.32, 0.32, 0.33], koukaku: [0.80, 0.80, 0.81, 0.82, 0.83, 0.85] },
        lenWeights: [30, 30, 25, 15]       // 2～5 揮的權重
      },
      /* ④ 其他小役進入連續演出的機率（很低） */
      other: {
        chance: { normal: [0.0018, 0.0018, 0.0019, 0.0020, 0.0021, 0.0022], koukaku: [0.036, 0.036, 0.037, 0.038, 0.039, 0.040] }
      },
      /* ⑤ 連續演出中每揮的 AT 當選率（沒有機會牌也有基本機率） */
      chance: {
        base: [0.14, 0.142, 0.145, 0.148, 0.152, 0.155],
        epicAdd: [0.35, 0.35, 0.36, 0.37, 0.38, 0.40],
        legendAdd: [0.75, 0.75, 0.76, 0.77, 0.78, 0.80]
      },

      /* ⑥ 當選時抽 RB / BB / SBB（權重） */
      bonusDraw: {
        first: { RB: 60, BB: 39, SBB: 1 },
        fromEpic: { RB: 58, BB: 39, SBB: 3 },     // 發展中靠紫礦當選 → SBB 機會增加
        fromLegend: { RB: 55, BB: 39, SBB: 6 },   // 靠金礦當選 → SBB 機會更高
        next: { RB: 15, BB: 80, SBB: 5 }          // 連莊的下一隻
      },

      /* ⑦ AT */
      bonus: {
        length: { RB: 15, BB: 60, SBB: 100 },
        continue: {                                // AT 中挖到金礦 → 抽一次連莊
          RB: [0.78, 0.79, 0.80, 0.81, 0.82, 0.84],
          BB: [0.78, 0.79, 0.80, 0.81, 0.82, 0.84],
          SBB: [0.88, 0.88, 0.89, 0.90, 0.91, 0.92]
        },
        upgrade: {                                 // 已有下一隻時再挖到金礦 → 抽升格
          RBtoBB: [0.50, 0.50, 0.52, 0.54, 0.56, 0.60],
          BBtoSBB: [0.10, 0.10, 0.11, 0.12, 0.13, 0.15]
        },
        announceRate: 0.5                          // 連莊當下演出告知的機率（否則最後一揮才揭曉）
      },
      /* ⑧ AT 中的小役機率 */
      bonusTable: {
        RB: { common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25], good: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30], rare: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30], epic: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08], legend: [0.033, 0.033, 0.033, 0.033, 0.033, 0.033] },
        BB: { common: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30], good: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30], rare: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25], epic: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06], legend: [0.017, 0.017, 0.017, 0.017, 0.017, 0.017] },
        SBB: { common: [0.18, 0.18, 0.18, 0.18, 0.18, 0.18], good: [0.28, 0.28, 0.28, 0.28, 0.28, 0.28], rare: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30], epic: [0.14, 0.14, 0.14, 0.14, 0.14, 0.14], legend: [0.04, 0.04, 0.04, 0.04, 0.04, 0.04] }
      },

      /* ⑨ 高確 */
      koukaku: {
        enter: {
          rubble: [0.001, 0.001, 0.0011, 0.0012, 0.0013, 0.0015],
          common: [0.001, 0.001, 0.0011, 0.0012, 0.0013, 0.0015],
          good: [0.004, 0.004, 0.0045, 0.005, 0.0055, 0.006],
          rare: [0.05, 0.052, 0.055, 0.06, 0.065, 0.07],
          epic: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30],
          legend: [0, 0, 0, 0, 0, 0]
        },
        drop: 0.1
      },
      zencho: { min: 3, max: 8 },                                  // 天井後的前兆長度
      fakeZencho: { normal: 0.004, koukaku: 0.02, min: 2, max: 6 }, // 假前兆（ガセ）

      /* ⑩ 違和感（確定演出）：只在已確定 AT（前兆／連續演出）或已確定連莊但尚未告知時出現
            出現 = 確定；暗示的種類則偏向 RB / BB / SBB */
      hints: {
        rate: 0.35,
        ids: ["sfx", "drip", "glow", "tap", "silent", "blink"],
        //          sfx  drip glow tap silent blink
        weights: {
          RB:   [30, 40, 5, 10, 5, 10],
          BB:   [20, 5, 35, 25, 5, 10],
          SBB:  [5, 0, 20, 15, 35, 25]
        }
      },

      /* 敘述框期待度顏色：[白, 綠, 藍, 紫, 金, 虹] 權重 */
      omen: {
        names: ["白", "綠", "藍", "紫", "金", "虹"],
        colors: ["#e8e8e8", "#55ff55", "#55aaff", "#d070ff", "#ffaa00", "rainbow"],
        normal: [930, 55, 13, 2, 0, 0],
        koukaku: [700, 200, 80, 20, 0, 0],
        fake: [300, 330, 250, 115, 5, 0],
        chanceLose: [250, 300, 280, 150, 20, 0],
        chanceWin: [80, 150, 250, 300, 170, 50],
        zencho: [150, 250, 280, 250, 55, 15]
      },

      toolDrop: { normal: 0.0015, bonus: 0.006, sameTier: 0.2, minDur: 0.2, maxDur: 0.6 },
      settingDist: [0.30, 0.25, 0.20, 0.12, 0.08, 0.05],
      adDailyLimit: 10
    },
    play: { autoInterval: 350, autoStopOmen: 3 },

    /* ---------- 工具（耐久度 = 可揮次數） ---------- */
    tools: [
      { id: "wood", tier: 1, name: "木鎬", durability: 60, price: 110, rarity: 1 },
      { id: "stone", tier: 2, name: "石鎬", durability: 120, price: 660, rarity: 2 },
      { id: "iron", tier: 3, name: "鐵鎬", durability: 200, price: 2900, rarity: 3 },
      { id: "gold", tier: 4, name: "金鎬", durability: 300, price: 11000, rarity: 4 },
      { id: "diamond", tier: 5, name: "鑽石鎬", durability: 500, price: 45000, rarity: 5 }
    ],
    upgrade: { maxLevel: 5, costMul: 6, durabilityPerLv: 0.10, valuePerLv: 0.02 },

    /* ---------- 礦坑（地圖） ---------- */
    mines: [
      { id: "m1", tenjou: 200, tier: 1, name: "淺層洞窟", mult: 1, unlock: 0,
        items: { common: ["石塊", "燧石"], good: ["煤炭"], rare: ["銅礦"], epic: ["紫水晶"], legend: ["遠古化石"] } },
      { id: "m2", tenjou: 400, tier: 2, name: "煤灰坑道", mult: 3, unlock: 1500,
        items: { common: ["頁岩", "煤渣"], good: ["鐵砂"], rare: ["銀礦"], epic: ["青金石"], legend: ["礦工的懷錶"] } },
      { id: "m3", tenjou: 600, tier: 3, name: "鏽鐵礦山", mult: 8, unlock: 10000,
        items: { common: ["玄武岩", "鏽塊"], good: ["鐵礦"], rare: ["黃銅礦"], epic: ["紅寶石"], legend: ["失落的齒輪核心"] } },
      { id: "m4", tenjou: 800, tier: 4, name: "熔岩深淵", mult: 20, unlock: 50000,
        items: { common: ["黑曜石屑", "焦岩"], good: ["火晶石"], rare: ["白金礦"], epic: ["藍寶石"], legend: ["炎龍之鱗"] } },
      { id: "m5", tenjou: 1000, tier: 5, name: "星核裂谷", mult: 50, unlock: 250000,
        items: { common: ["星塵岩", "虛空石"], good: ["秘銀"], rare: ["鑽石"], epic: ["星辰碎片"], legend: ["世界之心"] } }
    ],

    /* ---------- 文字（盡量少，可在編輯模式修改） ---------- */
    texts: {
      swing: ["鏗！", "咚！", "喀啦！", "鏘！"],
      rubble: ["……只有碎石", "……碎石", "……什麼都沒有"],
      omenLine: ["", "岩壁微微發亮", "聽見了風聲", "腳下在震動", "金色的光從縫隙透出", "整座礦山在呼應你"],
      koukakuHint: "空氣變得潮濕了",
      chanceStart: "……礦道深處有動靜",
      chanceGo: "▶ 繼續挖掘",
      chanceLose: "……什麼也沒發生",
      directWin: "金光炸裂！",
      fakeEnd: "……震動停止了",
      bonusStart: { RB: "◆ RB 小礦脈 ◆", BB: "★ BB 大礦脈 ★", SBB: "✦ SBB 超級礦脈 ✦" },
      stock: "連莊確定！",
      upgrade: "升格！",
      bonusChain: "連莊！",
      bonusChainSurprise: "……還沒結束！連莊！",
      bonusEnd: "礦脈枯竭了",
      tenjouStart: "天井到達",
      hintSfx: "……鏗？",
      hintDrip: "遠處傳來水滴聲",
      hintGlow: "岩壁上的紋路亮了一下",
      hintTap: "▽ 點擊",
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
