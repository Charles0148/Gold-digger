/* =========================================================
   預設設定檔 DEFAULT_CONFIG
   - 編輯模式改的東西會「覆蓋」在這份之上（存在瀏覽器裡）
   - 編輯模式「匯出設定」得到的 JSON，交給 Claude 就能寫回這裡
   ========================================================= */
(function (root) {
  const DEFAULT_CONFIG = {
    version: 3,
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
    // value = 平常挖到的基本售價；veinValue = 礦脈中挖到「脈晶」的基本售價（都 × 礦坑倍率）
    categories: [
      { id: "rubble", name: "碎石", rarity: 0, value: 0, veinValue: 0 },
      { id: "common", name: "普通礦", rarity: 1, value: 1, veinValue: 2.47 },
      { id: "good", name: "綠礦（Replay）", rarity: 2, value: 1, veinValue: 4.12 },
      { id: "rare", name: "藍礦（Bell）", rarity: 3, value: 2, veinValue: 8.24 },
      { id: "epic", name: "紫礦（機會）", rarity: 4, value: 5, veinValue: 20.6 },
      { id: "legend", name: "金礦（強機會）", rarity: 5, value: 15, veinValue: 49.44 }
    ],

    rules: {
      /* ① 通常／高確／連續演出／前兆 的小役機率（碎石 = 剩下的） */
      itemTable: {
        common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
        good: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125],
        rare: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06],
        epic: [0.011, 0.01127, 0.01154, 0.0119, 0.01235, 0.0128],   // 設定差：判別要素
        legend: [0.0036, 0.00369, 0.00378, 0.00396, 0.00414, 0.00441]  // 約 1/280～1/220
      },

      /* ② 金礦（強機會牌） */
      gold: {
        direct: { normal: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], koukaku: [0.3, 0.3, 0.309, 0.318, 0.327, 0.345] },
        lenWeights: [40, 20, 15, 15, 10]   // 連續演出 1～5 揮的權重（1 揮 = 沒直擊就結束）
      },
      /* ③ 紫礦（機會牌）進入連續演出的機率 */
      purple: {
        chance: { normal: [0.21, 0.21, 0.2163, 0.2226, 0.2226, 0.2289], koukaku: [0.8, 0.8, 0.809, 0.818, 0.827, 0.845] },
        lenWeights: [30, 30, 25, 15]       // 2～5 揮的權重
      },
      /* ④ 其他小役進入連續演出的機率（很低） */
      other: {
        chance: { normal: [0.00126, 0.00126, 0.001323, 0.001386, 0.001449, 0.001512], koukaku: [0.036, 0.036, 0.0369, 0.0378, 0.0387, 0.0396] }
      },
      /* ⑤ 連續演出（v0.5：進入時就決定回合數與結果，演出只負責表現）
         回合數 1～5，回合數越多通關率越高；顏色只會往上升，不會往下掉 */
      chance: {
        lenWeights: {                              // 各觸發來源抽到 1～5 回合的權重
          gold:   [38, 25, 18, 13, 6],
          purple: [55, 25, 12, 6, 2],
          other:  [62, 24, 9, 4, 1]
        },
        winRate: {                                 // 各回合數的通關率（設定1～6）
          r1: [0.06, 0.0618, 0.0642, 0.0672, 0.0696, 0.072],
          r2: [0.15, 0.1545, 0.1605, 0.168, 0.174, 0.18],
          r3: [0.35, 0.3605, 0.3745, 0.392, 0.406, 0.42],
          r4: [0.6, 0.618, 0.642, 0.672, 0.696, 0.72],
          r5: [0.9, 0.927, 0.963, 0.97, 0.97, 0.97]
        },
        upEpic: 1,          // 演出中挖到紫礦（機會牌）→ 通關率往上幾階
        upFloorEpic: 3,     // 紫礦升格後，顏色至少升到（3 = 綠）
        upFloorLegend: 4,   // 金礦（強機會牌）直接通關，顏色至少升到（4 = 紅）
        colorStart: [25, 50, 20, 5, 0, 0],   // 第1回合的顏色權重（白藍黃綠紅彩）
        colorWin: [0, 18, 17, 25, 40, 0],    // 會通關時，最後一回合的顏色權重
        colorLose: [0, 48, 28, 21, 3, 0],    // 不會通關時，最後一回合的顏色權重
        upLineRate: 0.5,                     // 顏色升級時額外插一句話的機率
        revive: { fakeLose: 0.2 }            // 已通關但先演失敗、下一揮復活的機率
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
        /* 延伸（連莊）抽選：礦脈中每一揮都抽，直到確定下一隻為止
           p = base[種類][設定] + add[挖到的小役][設定]
           一條礦脈從頭到尾「至少抽中一次」的機率 = 通過率 */
        cont: {
          boostAfter: 5,            // 連到第 5 隻（含）之後改用 high
          low: {
            base: { RB: [0.01676, 0.01732, 0.01792, 0.0185, 0.01911, 0.01971], BB: [0.00404, 0.00415, 0.00429, 0.00441, 0.00455, 0.00468], SBB: [0, 0, 0, 0, 0, 0] },
            add: { rare: [0.003, 0.0031, 0.0031, 0.0032, 0.0032, 0.0033], epic: [0.03, 0.0306, 0.0312, 0.0318, 0.0324, 0.033], legend: [0.25, 0.255, 0.26, 0.265, 0.27, 0.275] }
          },
          high: {
            base: { RB: [0.03994, 0.04162, 0.0434, 0.04523, 0.04717, 0.04916], BB: [0.0084, 0.00886, 0.00937, 0.00991, 0.0105, 0.01111], SBB: [0, 0, 0, 0, 0, 0] },
            add: { rare: [0.01, 0.0102, 0.0103, 0.0105, 0.0106, 0.0108], epic: [0.08, 0.0813, 0.0826, 0.0838, 0.0851, 0.0864], legend: [0.5, 0.508, 0.516, 0.524, 0.532, 0.54] }
          }
        },
        upgrade: {                                 // 已有下一隻時再挖到金礦 → 抽升格
          RBtoBB: [0.5, 0.5, 0.518, 0.536, 0.554, 0.59],
          BBtoSBB: [0.1, 0.1, 0.109, 0.118, 0.127, 0.145]
        },
        announceRate: 0.5                          // 連莊當下演出告知的機率（否則最後一揮才揭曉）
      },
      /* ⑧ AT 中的小役機率 */
      bonusTable: {
        RB: { common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25], good: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], rare: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], epic: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08], legend: [0.033, 0.033, 0.033, 0.033, 0.033, 0.033] },
        BB: { common: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], good: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], rare: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25], epic: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06], legend: [0.017, 0.017, 0.017, 0.017, 0.017, 0.017] },
        SBB: { common: [0.18, 0.18, 0.18, 0.18, 0.18, 0.18], good: [0.28, 0.28, 0.28, 0.28, 0.28, 0.28], rare: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], epic: [0.14, 0.14, 0.14, 0.14, 0.14, 0.14], legend: [0.04, 0.04, 0.04, 0.04, 0.04, 0.04] }
      },

      /* ⑨ 高確 */
      koukaku: {
        enter: {
          rubble: [0.001, 0.001, 0.00109, 0.00118, 0.00127, 0.00145],
          common: [0.001, 0.001, 0.00109, 0.00118, 0.00127, 0.00145],
          good: [0.004, 0.004, 0.00445, 0.0049, 0.00535, 0.0058],
          rare: [0.05, 0.0518, 0.0545, 0.059, 0.0635, 0.068],
          epic: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
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

      /* ⑪ 期待度顏色（只在地鳴中出現）：[白, 藍, 黃, 綠, 紅, 彩]
            權重只給 藍～紅；彩色 = 確定 SBB，由 sbbRainbow 另外抽選 */
      omen: {
        names: ["白", "藍", "黃", "綠", "紅", "彩", "金"],
        colors: ["#e8e8e8", "#4f9dff", "#ffe14d", "#4cff6a", "#ff4d4d", "rainbow", "#ffcc33"],
        // 「金」= 復活演出專用（index 6），不會出現在任何權重表裡
        normal: [1, 0, 0, 0, 0, 0],
        koukaku: [1, 0, 0, 0, 0, 0],
        fake: [0, 80, 20, 0, 0, 0],          // 假地鳴：沒有任何抽選 → 只出低色
        chanceLow: [0, 55, 35, 10, 0, 0],    // 連續演出中、這一揮當選率低（< highP）且沒中
        chanceHigh: [0, 10, 25, 40, 25, 0],  // 連續演出中、這一揮當選率高（≥ highP，例如挖到紫／金）但沒中
        chanceWin: [0, 5, 15, 35, 45, 0],    // 連續演出中已當選
        zencho: [0, 10, 20, 35, 35, 0],      // 確定的前兆（天井、直擊）
        highP: 0.30,
        sbbRainbow: 0.40
      },

      toolDrop: { normal: 0.001, bonus: 0.004, sameTier: 0.1, minDur: 0.2, maxDur: 0.6 },
      settingDist: [0.3, 0.25, 0.2, 0.12, 0.08, 0.05],
      adDailyLimit: 10
    },
    play: { autoInterval: 350, autoStopOmen: 3 },

    /* ---------- 工具（耐久度 = 可揮次數） ---------- */
    tools: [
      { id: "wood", tier: 1, name: "木鎬", durability: 60, price: 110, rarity: 1 },
      { id: "stone", tier: 2, name: "石鎬", durability: 120, price: 330, rarity: 2 },
      { id: "iron", tier: 3, name: "鐵鎬", durability: 200, price: 800, rarity: 3 },
      { id: "gold", tier: 4, name: "金鎬", durability: 300, price: 1650, rarity: 4 },
      { id: "diamond", tier: 5, name: "鑽石鎬", durability: 500, price: 3650, rarity: 5 }
    ],
    // 低階工具挖高階礦坑：收益 ×（工具每揮成本 ÷ 該礦坑對應工具每揮成本）× underMul
    toolPenalty: { underMul: 0.9 },

    /* ---------- 礦坑老闆 佐佐木 ---------- */
    boss: {
      name: "佐佐木",
      reqHours: 8,                                   // 幾小時換一張委託
      lineWeights: [30, 45, 25],                     // 委託 1/2/3 行的權重
      catWeights: { common: 40, good: 30, rare: 20, epic: 8, legend: 2 },
      qty: { common: [8, 20], good: [4, 10], rare: [2, 5], epic: [1, 2], legend: [1, 1] },
      points: { common: 2, good: 3, rare: 4, epic: 6, legend: 8 },
      completeBonus: 1,                              // 整張委託完成再加幾點
      veinChance: 0.15,                              // 綠以上有多少機率要求「脈晶」
      deliverMul: 1.5,                               // 交付金額 = 基本售價 × 此倍率
      levelNeed: { base: 25, step: 10, every: 5 },   // 升級所需點數：base + step × floor(等級 / every)
      boonRarity: [60, 28, 10, 2],                   // 普通 / 藍 / 紫 / 金
      boons: {
        adWood:     { r: 0, v: 1,    name: "看廣告多拿 1 把木鎬" },
        favorUp:    { r: 0, v: 0.10, name: "恩惠點數 +10%" },
        autoSpeed:  { r: 0, v: 0.05, name: "自動挖礦速度 +5%" },
        oreSell:    { r: 1, v: 0.05, name: "指定礦石售價 +5%" },
        toolDrop:   { r: 1, v: 0.10, name: "工具掉落率 +10%" },
        reqQty:     { r: 1, v: 0.05, name: "委託需求數量 -5%" },
        raritySell: { r: 2, v: 0.03, name: "指定稀有度售價 +3%" },
        toolDur:    { r: 2, v: 0.03, name: "新工具耐久 +3%" },
        adStone:    { r: 2, v: 0.05, name: "看廣告有 5% 機率多拿石鎬" },
        allSell:    { r: 3, v: 0.01, name: "全部礦石售價 +1%" },
        shopCut:    { r: 3, v: 0.01, name: "買鎬子價格 -1%" }
      },
      lines: {
        greet: ["……來了啊。今天想做什麼？", "礦坑還安分嗎？", "嗯，是你啊。"],
        board: "委託都在這。挖到了就拿來。",
        noEnough: "數量不夠。再去挖吧。",
        deliver: "……做得不錯。這是酬勞。",
        allDone: "這張全部完成了。下一張晚點再來看。",
        sell: "要賣什麼？照行情收。",
        buy: "鎬子都在這。挑一把吧。",
        boons: "這些是我給你的。別弄丟了。",
        noBoon: "……還早呢。多幫我跑幾趟再說。",
        levelUp: "你幫了我不少。這個拿去吧。",
        ad: "外頭有人在發補給，去排個隊吧。",
        bye: "路上小心。"
      }
    },

    /* ---------- 礦坑（地圖） ---------- */
    mines: [
      { id: "m1", tenjou: 800, tier: 1, name: "淺層洞窟", mult: 1, unlock: 0,
        items: { common: ["石塊", "燧石"], good: ["煤炭"], rare: ["銅礦"], epic: ["紫水晶"], legend: ["遠古化石"] },
        veinItems: { common: ["石英脈塊"], good: ["翠綠脈晶"], rare: ["湛藍脈晶"], epic: ["幽紫脈晶"], legend: ["洞窟金核"] } },
      { id: "m2", tenjou: 800, tier: 2, name: "煤灰坑道", mult: 1.5, unlock: 300,
        items: { common: ["頁岩", "煤渣"], good: ["鐵砂"], rare: ["銀礦"], epic: ["青金石"], legend: ["礦工的懷錶"] },
        veinItems: { common: ["灰燼脈塊"], good: ["煤翠脈晶"], rare: ["煤藍脈晶"], epic: ["煤紫脈晶"], legend: ["坑道金核"] } },
      { id: "m3", tenjou: 800, tier: 3, name: "鏽鐵礦山", mult: 2.2, unlock: 1000,
        items: { common: ["玄武岩", "鏽塊"], good: ["鐵礦"], rare: ["黃銅礦"], epic: ["紅寶石"], legend: ["失落的齒輪核心"] },
        veinItems: { common: ["鏽紅脈塊"], good: ["銅翠脈晶"], rare: ["鐵藍脈晶"], epic: ["鏽紫脈晶"], legend: ["礦山金核"] } },
      { id: "m4", tenjou: 1000, tier: 4, name: "熔岩深淵", mult: 3, unlock: 3000,
        items: { common: ["黑曜石屑", "焦岩"], good: ["火晶石"], rare: ["白金礦"], epic: ["藍寶石"], legend: ["炎龍之鱗"] },
        veinItems: { common: ["熔岩脈塊"], good: ["焰翠脈晶"], rare: ["焰藍脈晶"], epic: ["焰紫脈晶"], legend: ["深淵金核"] } },
      { id: "m5", tenjou: 1000, tier: 5, name: "星核裂谷", mult: 4, unlock: 8000,
        items: { common: ["星塵岩", "虛空石"], good: ["秘銀"], rare: ["鑽石"], epic: ["星辰碎片"], legend: ["世界之心"] },
        veinItems: { common: ["星塵脈塊"], good: ["星翠脈晶"], rare: ["星藍脈晶"], epic: ["星紫脈晶"], legend: ["裂谷金核"] } }
    ],

    /* ---------- 文字（盡量少，可在編輯模式修改） ---------- */
    texts: {
      swing: ["鏗！", "咚！", "喀啦！", "鏘！"],
      rubble: ["……只有碎石", "……碎石", "……什麼都沒有"],
      omenLine: ["", "岩壁微微發亮", "聽見了風聲", "腳下在震動", "赤紅的光從縫隙透出", "整座礦山在呼應你"],
      omenTag: "≋ 地鳴 ≋",
      omenEnter: "……腳下傳來低沉的地鳴",
      koukakuHint: "空氣變得潮濕了",
      chanceGo: "▶ 繼續往深處挖",
      chanceScript: {
        r1: ["岩壁裂開一道縫，裡面吹出冷風"],
        r2: ["礦道往下延伸，愈走愈窄", "盡頭有一台翻倒的礦車"],
        r3: ["礦道往下延伸，愈走愈窄", "一台翻倒的礦車，輪子還在慢慢轉", "車斗底下壓著一個破舊的探險包"],
        r4: ["礦道往下延伸，愈走愈窄", "一台翻倒的礦車，輪子還在慢慢轉", "探險包裡掉出半張手繪地圖", "木梁上掛著一盞油燈，火焰是綠色的"],
        r5: ["礦道往下延伸，愈走愈窄", "一台翻倒的礦車，輪子還在慢慢轉", "探險包裡掉出半張手繪地圖", "木梁上掛著一盞油燈，火焰是綠色的", "前方有一道被封住的木門……門後有東西在呼吸"]
      },
      chanceUpLines: ["油燈的火焰突然變亮", "礦車自己滾了一下", "地圖上多出一條沒見過的路線", "水聲變大了", "腳下的岩層發出低鳴"],
      chanceWin: "門後是一整片沒被挖過的礦脈！",
      chanceCollapse: "上方傳來碎石聲……坑道坍塌了",
      revive: "……等等，塌落的縫隙裡透出光",
      chanceLose: "……地鳴平息了",
      fakeEnd: "……地鳴平息了",
      directWin: "金光炸裂！",
      veinName: { RB: "小礦脈", BB: "大礦脈", SBB: "星辰礦脈" },
      bonusStart: { RB: "◆ 挖到小礦脈了 ◆", BB: "★ 挖到大礦脈了 ★", SBB: "✦ 星辰礦脈現身 ✦" },
      stock: "礦脈延伸！",
      upgrade: "礦脈變得更粗了！",
      bonusChain: "礦脈延伸！",
      bonusChainSurprise: "……岩層還在震動！礦脈延伸！",
      bonusEnd: "礦脈枯竭了",
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
