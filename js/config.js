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

    /* ---------- 稱號（擁有者 2026-10-06 定案，共 50 個） ----------
       rarity：0 一般／1 珍貴／2 稀有／3 傳說。取得後永久保留；傳說未取得時隱藏條件。 */
    titles: [
      { id:"new_miner", name:"新來的礦工", rarity:0, kind:"start", condition:"開始遊戲", intro:"今天起，你也是深入地底的一員。" },
      { id:"swing_1k", name:"手上有繭了", rarity:0, kind:"stat", path:"swings", target:1000, condition:"累計揮鎬 1,000 次", intro:"握過一千次鎬柄，雙手開始記住礦坑的重量。" },
      { id:"swing_10k", name:"鎬聲不斷", rarity:1, kind:"stat", path:"swings", target:10000, condition:"累計揮鎬 10,000 次", intro:"只要鎬聲還在回響，你就不會停下。" },
      { id:"swing_100k", name:"礦坑的回音", rarity:2, kind:"stat", path:"swings", target:100000, condition:"累計揮鎬 100,000 次", intro:"數不清的揮擊，已成為地底最熟悉的聲音。" },
      { id:"swing_1m", name:"地底不滅的鎬聲", rarity:3, kind:"stat", path:"swings", target:1000000, condition:"累計揮鎬 1,000,000 次", intro:"百萬次揮擊之後，你的鎬聲已成為地底永不消失的回音。" },
      { id:"broken_100", name:"鎬子的墳場", rarity:2, kind:"stat", path:"toolsBroken", target:100, condition:"累計用壞 100 把鎬子", intro:"每一把壞掉的鎬子，都替你留下了一段路。" },
      { id:"days_7", name:"熟面孔", rarity:0, kind:"stat", path:"loginDays", target:7, condition:"累計登入 7 天", intro:"坑口的人已經開始認得你了。" },
      { id:"days_30", name:"坑口的常客", rarity:1, kind:"stat", path:"loginDays", target:30, condition:"累計登入 30 天", intro:"你來得太勤，連礦塵都像在等你。" },
      { id:"days_100", name:"在這裡待了很久的人", rarity:2, kind:"stat", path:"loginDays", target:100, condition:"累計登入 100 天", intro:"許多礦工來了又走，而你仍在這裡。" },
      { id:"days_365", name:"與礦同行", rarity:3, kind:"stat", path:"loginDays", target:365, condition:"累計登入 365 天", intro:"一整年的日子，都有礦坑陪你走過。" },

      { id:"unlock_m2", name:"煤灰沾袖", rarity:0, kind:"unlocked", key:"m2", condition:"解鎖煤灰坑道", intro:"袖口的第一層煤灰，是礦工的起點。" },
      { id:"unlock_m3", name:"一身鏽味", rarity:1, kind:"unlocked", key:"m3", condition:"解鎖鏽鐵礦山", intro:"鏽鐵的氣味，已經洗不掉了。" },
      { id:"unlock_m4", name:"熔岩邊的人", rarity:1, kind:"unlocked", key:"m4", condition:"解鎖熔岩深淵", intro:"你曾站在熱浪前，仍選擇繼續向下。" },
      { id:"unlock_m5", name:"星核的見證者", rarity:2, kind:"unlocked", key:"m5", condition:"解鎖星核裂谷", intro:"裂谷深處的星光，曾映進你的眼裡。" },
      { id:"unlock_m6", name:"前輩帶出來的人", rarity:1, kind:"unlocked", key:"m6", condition:"解鎖三位前輩的考驗", intro:"走過三位前輩的考驗，你已不再只是新人。" },
      { id:"m1_3k", name:"洞窟老手", rarity:0, kind:"mineSwings", key:"m1", target:3000, condition:"在淺層洞窟累計揮鎬 3,000 次", intro:"淺層洞窟的每一處回音，你都聽得懂。" },
      { id:"m1_m5_1k", name:"礦脈地圖都在腦子裡", rarity:2, kind:"mineSwingsAll", keys:["m1","m2","m3","m4","m5"], target:1000, condition:"m1～m5 每座礦坑各累計揮鎬 1,000 次", intro:"不必攤開地圖，你已知道每條路通往何處。" },
      { id:"world_heart", name:"世界之心的主人", rarity:2, kind:"dexName", key:"世界之心", condition:"取得世界之心", intro:"你曾把地底最深處的心跳握在手中。" },

      { id:"ore_green", name:"綠光入袋", rarity:0, kind:"dexCat", key:"good", condition:"第一次取得綠色礦石", intro:"第一抹綠光，讓你的礦工生涯有了顏色。" },
      { id:"ore_blue", name:"藍光入袋", rarity:1, kind:"dexCat", key:"rare", condition:"第一次取得藍色礦石", intro:"幽藍礦光，照亮了更深的一段路。" },
      { id:"ore_purple", name:"紫色的預感", rarity:1, kind:"dexCat", key:"epic", condition:"第一次取得紫色礦石", intro:"紫光出現時，你知道好東西就在附近。" },
      { id:"ore_gold", name:"金光一閃", rarity:2, kind:"dexCat", key:"legend", condition:"第一次取得金色礦石", intro:"那一瞬金光，足以讓所有辛苦都有了答案。" },
      { id:"ore_50", name:"礦石鑑定家", rarity:2, kind:"dexCount", target:50, condition:"發現 50 種不同礦石（不含碎石）", intro:"礦石才露出一角，你就知道它的名字。" },

      { id:"senpai_each_20", name:"前輩的小幫手", rarity:1, kind:"bossEach", target:20, condition:"岩倉、赤井、霧島談話成功各 20 次", intro:"前輩有事時，已經會第一個想到你。" },
      { id:"iwakura_100", name:"岩倉的同行者", rarity:2, kind:"memory", key:"a", condition:"取得岩倉的 100 次珍貴回憶", intro:"你和岩倉走過的路，已經足以稱為回憶。" },
      { id:"akai_100", name:"赤井的夥伴", rarity:2, kind:"memory", key:"b", condition:"取得赤井的 100 次珍貴回憶", intro:"赤井願意把背後交給你，這就夠了。" },
      { id:"kirishima_100", name:"霧島的晚輩", rarity:2, kind:"memory", key:"c", condition:"取得霧島的 100 次珍貴回憶", intro:"霧島很少稱讚人，但他記得你的努力。" },
      { id:"senpai_memories_all", name:"三條路的交會", rarity:3, kind:"memoriesAll", condition:"取得三位前輩的 100 次珍貴回憶", intro:"三段珍貴回憶，終於在你手中交會。" },
      { id:"senpai_total_1k", name:"三人的不解之緣", rarity:3, kind:"bossTotal", target:1000, condition:"三位前輩談話成功合計 1,000 次", intro:"一起走過這麼久，前輩們早已習慣有你在身旁。" },
      { id:"iwakura_500", name:"礦燈下的知己", rarity:3, kind:"bossEach", bosses:["a"], target:500, condition:"與岩倉談話成功 500 次", intro:"許多話已經不必說出口，一個眼神就能明白彼此。" },
      { id:"iwakura_1000", name:"一生摯友", rarity:3, kind:"bossEach", bosses:["a"], target:1000, condition:"與岩倉談話成功 1,000 次", intro:"千次同行之後，你已成為岩倉最不願失去的朋友。" },
      { id:"akai_500", name:"鑿聲搭檔", rarity:3, kind:"bossEach", bosses:["b"], target:500, condition:"與赤井談話成功 500 次", intro:"再難走的礦道，只要你在身旁，赤井就敢繼續向前。" },
      { id:"akai_1000", name:"生死相託", rarity:3, kind:"bossEach", bosses:["b"], target:1000, condition:"與赤井談話成功 1,000 次", intro:"他敢毫不猶豫地把背後交給你，因為你從未讓他失望。" },
      { id:"kirishima_500", name:"銘心後輩", rarity:3, kind:"bossEach", bosses:["c"], target:500, condition:"與霧島談話成功 500 次", intro:"在那道嚴格的目光中，你終於看見了毫不保留的認可。" },
      { id:"kirishima_1000", name:"霧島的驕傲", rarity:3, kind:"bossEach", bosses:["c"], target:1000, condition:"與霧島談話成功 1,000 次", intro:"如今霧島提起你時，嚴肅的語氣裡也藏不住驕傲。" },
      { id:"senpai_each_500", name:"前輩們的老朋友", rarity:3, kind:"bossEach", target:500, condition:"岩倉、赤井、霧島談話成功各 500 次", intro:"五百次相遇之後，留下的不只是認可，而是真正的交情。" },
      { id:"senpai_each_1000", name:"礦脈盡頭的同行者", rarity:3, kind:"bossEach", target:1000, condition:"岩倉、赤井、霧島談話成功各 1,000 次", intro:"走過千次回憶，無論礦脈通往哪裡，你們仍會並肩前行。" },

      { id:"boss_lv5", name:"店裡的熟客", rarity:0, kind:"bossLevel", target:5, condition:"佐佐木恩惠達到 Lv5", intro:"佐佐木看見你進門，已經懶得問要買什麼。" },
      { id:"boss_lv15", name:"佐佐木的得力幫手", rarity:1, kind:"bossLevel", target:15, condition:"佐佐木恩惠達到 Lv15", intro:"有些麻煩事，佐佐木只放心交給你。" },
      { id:"boss_lv30", name:"佐佐木留的位置", rarity:2, kind:"bossLevel", target:30, condition:"佐佐木恩惠達到 Lv30", intro:"櫃檯裡總有一個位置留給你，有些事佐佐木只願意交給你。" },
      { id:"quests_25", name:"跑腿的", rarity:0, kind:"stat", path:"questsCompleted", target:25, condition:"累計完成 25 件委託", intro:"礦坑裡的大事小事，最後總會找到你。" },
      { id:"quests_250", name:"委託板小能手", rarity:2, kind:"stat", path:"questsCompleted", target:250, condition:"累計完成 250 件委託", intro:"再滿的委託板，到了你手裡也會被清空。" },
      { id:"boons_all", name:"佐佐木的心意", rarity:1, kind:"boonAll", condition:"佐佐木四種恩惠都至少取得一階", intro:"佐佐木給出的四份心意，你一樣也沒錯過。" },

      { id:"freeze_once", name:"礦坑安靜的那一刻", rarity:3, kind:"stat", path:"freeze.normal", target:1, condition:"第一次在一般礦坑經歷地底凍結", intro:"礦坑深處，時間曾在你面前停了一瞬。" },
      { id:"freeze_twice", name:"寂靜再次降臨", rarity:3, kind:"stat", path:"freeze.normal", target:2, condition:"在一般礦坑累計經歷地底凍結 2 次", intro:"那份不可能忘記的寂靜，竟然再次出現。" },
      { id:"freeze_senpai", name:"前輩也沉默了", rarity:3, kind:"stat", path:"freeze.senpai", target:1, condition:"在三位前輩的考驗中經歷地底凍結", intro:"那一瞬間，連身旁的前輩都停下了腳步。" },
      { id:"vein_once", name:"前輩的心意", rarity:1, kind:"stat", path:"veinsEntered", target:1, condition:"第一次進入「前輩的心意」", intro:"你曾走進一條只為信任而開啟的礦脈。" },
      { id:"vein_25", name:"順著礦脈走", rarity:2, kind:"stat", path:"veinsEntered", target:25, condition:"累計進入「前輩的心意」25 次", intro:"你已學會聽從礦脈，而不是只相信眼睛。" },

      { id:"ruby_1000", name:"掌心有紅光", rarity:1, kind:"rubyGot", target:1000, condition:"累計取得紅晶 1,000 顆", intro:"紅晶的微光，在你掌心累積成了一段旅程。" },
      { id:"cosmetics_6", name:"衣櫃裡有礦味", rarity:1, kind:"cosmetics", target:6, condition:"名字顏色與外框合計擁有 6 件", intro:"你的收藏證明，礦工也可以很講究。" }
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
        colorLose: [0, 48, 28, 21, 1.1, 0],  // 不會通關時，最後一回合的顏色權重（紅權重 1.1 → 紅色通關率約 89%）
        upLineRate: 0.5,                     // 顏色升級時額外插一句話的機率
        revive: { fakeLose: 0.2 }            // 已通關但先演失敗、下一揮復活的機率
      },

      /* ⑥ 當選時抽 RB / BB / SBB（權重） */
      bonusDraw: {
        first: { RB: 60, BB: 39, SBB: 1 },
        fromEpic: { RB: 58, BB: 39, SBB: 3 },     // 發展中靠紫礦當選 → SBB 機會增加
        fromLegend: { RB: 55, BB: 39, SBB: 6 },   // 靠金礦當選 → SBB 機會更高
        next: { RB: 15, BB: 80, SBB: 5 },        // 連莊的下一隻
        upper: { RB: 0, BB: 70, SBB: 30 },       // 上位（連到第 upperAfter 隻之後）：不再出小礦脈
        upperAfter: 10
      },

      /* ⑦ AT */
      /* 地底凍結（2026-10-03 擁有者）：通常／高確時每揮抽一次；星辰礦脈開場＋庫存 stock 條星辰（擁有者最後定：保底 4 條＝開場 1＋庫存 3）。
         試算：機械割約 +9～10%（設定1～6）。改數值後要跑 node tools/sim.js */
      freeze: { rate: 1 / 16384, stock: 3 },
      bonus: {
        length: { RB: 12, BB: 50, SBB: 84 },
        cap: { swings: 700 },   // 一次礦脈（含所有延伸）的總揮數上限，類似實機的有利區間上限
        /* 延伸（連莊）抽選：礦脈中每一揮都抽，直到確定下一隻為止
           p = base[種類][設定] + add[挖到的小役][設定]
           一條礦脈從頭到尾「至少抽中一次」的機率 = 通過率 */
        cont: {
          boostAfter: 5,            // 連到第 5 隻（含）之後改用 high
          low: {   // 通常狀態（v0.6：基本機率壓到幾乎沒有，改由機會牌主導）
            base: { RB: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001], BB: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001], SBB: [0, 0, 0, 0, 0, 0] },
            add: { rare: [0, 0, 0, 0, 0, 0], epic: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05], legend: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4] }
          },
          high: { // 連到第 5 隻之後
            base: { RB: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002], BB: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002], SBB: [0, 0, 0, 0, 0, 0] },
            add: { rare: [0, 0, 0, 0, 0, 0], epic: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08], legend: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55] }
          },
          /* 礦脈中的高確（畫面上叫「礦層共鳴」）：挖到機會牌 → 有機率進入，期間延伸率大幅提高 */
          atHigh: {
            enterEpic: [0.3, 0.315, 0.335, 0.36, 0.38, 0.4],
            enterLegend: [0.5, 0.518, 0.542, 0.572, 0.596, 0.62],
            len: { RB: 5, BB: 12, SBB: 20 },
            contEpic: [0.7, 0.709, 0.721, 0.736, 0.748, 0.76],
            contLegend: [0.90, 0.90, 0.90, 0.90, 0.90, 0.90],
            base: 0.002,
            /* 連到第 boostAfter 隻（含）之後，共鳴也一起加強（深層共鳴） */
            boost: {
              enterEpic: [0.5, 0.518, 0.542, 0.572, 0.596, 0.62],
              enterLegend: [0.75, 0.7605, 0.7745, 0.792, 0.806, 0.82],
              contEpic: [0.85, 0.853, 0.857, 0.862, 0.866, 0.87],
              contLegend: [1, 1, 1, 1, 1, 1],
              len: { RB: 7, BB: 16, SBB: 24 }
            }
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
      adDailyLimit: 10,
      adSupplyTool: "diamond",   // 2026-10-01 擁有者決定：領補給暫時固定為鑽石鎬
      adSupplyQty: 1
    },
    play: { autoInterval: 350, autoStopOmen: 3 },

    /* ---------- 工具（耐久度 = 可揮次數） ---------- */
    tools: [
      /* 工具分類（2026-09-29，恩惠 v2）：category＝pick 標準鎬子／special 特殊鎬子／probe 消耗型探測器／event 活動・收藏／paid 付費道具。
         rewardEligible：可被「恩惠滿階謝禮」送出；boonDiscount：可套鎬子購買折扣；boonDurability：可套新鎬子耐久。
         三個旗標「沒寫就當 false」——之後新增的工具（例如紅岩鑽頭、探測器）必須在各自的任務裡明文決定，不會被自動套用或誤送。 */
      { id: "wood", tier: 1, name: "木鎬", durability: 60, price: 110, rarity: 1, category: "pick", rewardEligible: true, boonDiscount: true, boonDurability: true },
      { id: "stone", tier: 2, name: "石鎬", durability: 120, price: 330, rarity: 2, category: "pick", rewardEligible: true, boonDiscount: true, boonDurability: true },
      { id: "iron", tier: 3, name: "鐵鎬", durability: 200, price: 800, rarity: 3, category: "pick", rewardEligible: true, boonDiscount: true, boonDurability: true },
      { id: "gold", tier: 4, name: "金鎬", durability: 300, price: 1650, rarity: 4, category: "pick", rewardEligible: true, boonDiscount: true, boonDurability: true },
      { id: "diamond", tier: 5, name: "鑽石鎬", durability: 500, price: 3650, rarity: 5, category: "pick", rewardEligible: true, boonDiscount: true, boonDurability: true },
      /* 2026-09-30 階段2（擁有者 Q2～Q4）：紅岩鑽頭。不是標準鎬子——商店、掉落、地圖建議、效率基準、滿階謝禮、編輯器「每種各+1」都不會用到。
         ・耐久固定 1000，不吃「新鎬子耐久」與購買折扣（三個旗標 false）；沒有 price＝不能用金幣買。
         ・所有已解鎖礦坑都是正常效率（不打折、也不加成），不增加產量或稀有機率；tier 只給背包排序用，不參與效率判定。
         ・這兩把的定義固定來自程式內建值（game.js normTools），編輯器存的舊設定檔不會蓋掉或刪掉。
         redrock（完整版）2026-10-05 起用紅晶在紅晶商店購買（價格見 ruby.shop），分類 paid 改名 premium（高級；紅晶不是用錢買的）。 */
      /* drill：紅岩鑽頭的「礦脈中不扣耐久」（哪些狀態、每把上限見 ruby.mines[礦坑].drillFree）；crystal：用完掉 1 顆小結晶（試用版不掉）；兩把到手耐久都吃小結晶加成（擁有者 2026-10-05） */
      { id: "redrockTrial", tier: 5, name: "紅岩鑽頭・試用", durability: 1000, rarity: 5, category: "special", trial: true, drill: true, rewardEligible: false, boonDiscount: false, boonDurability: false },
      { id: "redrock", tier: 5, name: "紅岩鑽頭", durability: 1000, rarity: 5, category: "premium", drill: true, crystal: true, rewardEligible: false, boonDiscount: false, boonDurability: false }
    ],
    // 低階工具挖高階礦坑：收益 ×（工具每揮成本 ÷ 該礦坑對應工具每揮成本）× underMul
    toolPenalty: { underMul: 0.9 },

    /* ---------- 礦脈觀測鏡（v0.10.6，原「探礦眼鏡」） ----------
       玩家畫面**不得**出現設定1〜6、高設定、奇／偶數設定、設定N以上、確定／濃厚等字眼。
       內部仍用 1〜6（setting）計算，只在程式、模擬器與技術文件中使用。

       兩種情報的真實性不同，這是刻意的：
         • 傾向類（孤脈／雙脈／深層微光／強烈共鳴）＝**機率傾向，可能失準**
         • 等級下限（geD/geC/geB/geA）與完整礦紋徽章 ＝ **必定為真**
       weights[內部值][觀測次序 0-4] 每一列合計必須是 100，
       且 geX 只能出現在對應內部值以上。tools/sim.js 會逐項檢查。      */
    glasses: {
      name: "礦脈觀測鏡",
      priceMul: 2,      // 第一次價格 = 該礦坑建議鎬子價格 × 這個倍率
      repeatMul: 2,     // 同一天同一礦坑，第 n 次價格 ×repeatMul^(n-1)
      dailyMax: 5,      // 每座礦坑每天最多觀測次數
      revealMs: 1000,   // 揭曉演出長度（毫秒）
      stages: ["初步觀測", "追加觀測", "精密觀測", "深層觀測", "最終觀測"],
      openLines: [
        "要看礦脈？先說好，看到的只是徵兆，準不準還不一定。",
        "這鏡片跟了我很多年。看光，比看人準。",
        "把眼睛放亮。真正有用的東西，通常只閃一下。"
      ],
      stageLines: [
        ["先別急著下判斷。礦脈第一眼，最會騙人。", "先看個輪廓。今天它願不願意開口，還不知道。"],
        ["嗯……剛才那道光不像偶然。再看一次。", "有點意思。鏡片開始抓到它的脾氣了。"],
        ["從這裡開始才看得仔細。慢慢看，別急。", "霧散了一些。接下來看到的，份量會更重。"],
        ["別眨眼。深層的回光，只會出現一瞬間。", "這次要是刻出紋路，就不是普通的徵兆了。"],
        ["最後一次。看清楚了，今天它不會再開口。", "鏡片已經轉到底了。看得到什麼，就看這一下。"]
      ],
      // 一般觀測結果（傾向類可能失準；geX 必定為真）
      results: {
        silent: { name: "礦脈沉默", icon: "◌", color: "#8d8d8d", line: "霧還沒散。它今天不肯說話。" },
        odd:    { name: "孤脈反應", icon: "◐", color: "#9fd0ff", line: "回光總是單獨跳動。今天偏向單脈。" },
        even:   { name: "雙脈反應", icon: "◑", color: "#9fd0ff", line: "光總是成雙回來。雙脈的氣息比較重。" },
        glow:   { name: "深層微光", icon: "✦", color: "#ffd76a", line: "深處有點亮。礦氣比平常活了一些。" },
        reso:   { name: "強烈共鳴", icon: "✸", color: "#ff8a4c", line: "整條礦脈都在回應。今天值得多留一會。" },
        geD:    { name: "D級以上", icon: "▲", color: "#a8e6a1", line: "淺層雜質退了。至少能看見D級的紋路。" },
        geC:    { name: "C級以上", icon: "▲", color: "#7fe3ff", line: "三層脈光已經穩住。至少是C級。" },
        geB:    { name: "B級以上", icon: "▲", color: "#ffd76a", line: "深層出現完整金紋。B級以下不會有這種光。" },
        geA:    { name: "A級以上", icon: "▲", color: "#ff8a4c", line: "星晶正在共鳴。至少是A級礦脈。" }
      },
      // 完整礦紋徽章：index = 內部值 − 1，抽中時必定與當日真實內部值相符
      badgeRate: [0, 0, 0, 0.5, 2],   // 第1〜5次觀測出現完整礦紋的機率（%）
      badges: [
        { g: "E", color: "#8d8d8d", line: "……紋路很淡，只有一道。E級。今天先別追得太深。" },
        { g: "D", color: "#a8e6a1", line: "兩道淺紋合上了。D級，算是醒著。" },
        { g: "C", color: "#7fe3ff", line: "三層回光穩住了。C級，今天可以期待一下。" },
        { g: "B", color: "#ffd76a", line: "四道礦紋全亮了。B級，這座坑值得守。" },
        { g: "A", color: "#ff8a4c", line: "五芒晶紋成形了。A級……今天的礦氣很旺。" },
        { g: "S", color: "#ff4fd8", line: "六道虹脈同時共鳴……S級。這種景象，我也很少見。" }
      ],
      // weights[內部值][觀測次序-1]，每列合計 100
      weights: {
        1: [{ silent: 70, odd: 20, even: 4, glow: 5, reso: 1 },
            { silent: 64, odd: 24, even: 5, glow: 6, reso: 1 },
            { silent: 58, odd: 27, even: 6, glow: 7, reso: 2 },
            { silent: 54, odd: 30, even: 6, glow: 8, reso: 2 },
            { silent: 50, odd: 33, even: 7, glow: 8, reso: 2 }],
        2: [{ silent: 66, odd: 5, even: 20, glow: 6, reso: 1, geD: 2 },
            { silent: 60, odd: 5, even: 23, glow: 7, reso: 2, geD: 3 },
            { silent: 53, odd: 6, even: 26, glow: 8, reso: 2, geD: 5 },
            { silent: 47, odd: 6, even: 28, glow: 9, reso: 3, geD: 7 },
            { silent: 42, odd: 6, even: 30, glow: 10, reso: 3, geD: 9 }],
        3: [{ silent: 58, odd: 18, even: 5, glow: 12, reso: 3, geD: 3, geC: 1 },
            { silent: 50, odd: 20, even: 5, glow: 14, reso: 4, geD: 5, geC: 2 },
            { silent: 42, odd: 22, even: 5, glow: 16, reso: 5, geD: 7, geC: 3 },
            { silent: 35, odd: 23, even: 5, glow: 18, reso: 6, geD: 9, geC: 4 },
            { silent: 29, odd: 24, even: 5, glow: 19, reso: 7, geD: 11, geC: 5 }],
        4: [{ silent: 46, odd: 5, even: 20, glow: 18, reso: 6, geD: 3, geC: 1.5, geB: 0.5 },
            { silent: 38, odd: 5, even: 21, glow: 20, reso: 8, geD: 4, geC: 3, geB: 1 },
            { silent: 30, odd: 5, even: 22, glow: 22, reso: 10, geD: 5, geC: 4, geB: 2 },
            { silent: 23, odd: 5, even: 23, glow: 23, reso: 12, geD: 6, geC: 5, geB: 3 },
            { silent: 18, odd: 5, even: 23, glow: 24, reso: 14, geD: 7, geC: 5, geB: 4 }],
        5: [{ silent: 34, odd: 16, even: 4, glow: 22, reso: 16, geD: 4, geC: 2, geB: 1.5, geA: 0.5 },
            { silent: 26, odd: 17, even: 4, glow: 23, reso: 19, geD: 5, geC: 3, geB: 2, geA: 1 },
            { silent: 19, odd: 18, even: 4, glow: 23, reso: 22, geD: 5, geC: 4, geB: 3, geA: 2 },
            { silent: 13, odd: 19, even: 4, glow: 23, reso: 25, geD: 5, geC: 4, geB: 4, geA: 3 },
            { silent: 9, odd: 19, even: 4, glow: 22, reso: 28, geD: 5, geC: 4, geB: 5, geA: 4 }],
        6: [{ silent: 28, odd: 4, even: 16, glow: 24, reso: 20, geD: 4, geC: 2, geB: 1.5, geA: 0.5 },
            { silent: 20, odd: 4, even: 17, glow: 24, reso: 24, geD: 5, geC: 3, geB: 2, geA: 1 },
            { silent: 13, odd: 4, even: 18, glow: 24, reso: 28, geD: 5, geC: 4, geB: 3, geA: 1 },
            { silent: 8, odd: 4, even: 18, glow: 23, reso: 31, geD: 5, geC: 4, geB: 4, geA: 3 },
            { silent: 4, odd: 4, even: 18, glow: 22, reso: 34, geD: 5, geC: 4, geB: 5, geA: 4 }]
      },
      // v0.10.7：舊版「探礦眼鏡」的紀錄一律清除，不轉換（見 game.js 的 glassWipeOld）
      dataVersion: 2,
      /* 2026-10-05 紅晶：第 6、7 次觀測（只收紅晶，第 1～5 次照舊收金幣）。表格照 Codex 實算版本（紅晶設計 v4 第五節）：
         100 萬次模擬猜中內部值：看到第 5 次 63%、第 6 次 74%、第 7 次 88%；已因完整礦紋完全確定：2.5%／12%／34%。
         ruby.weights[內部值][0＝第6次, 1＝第7次] 每列合計 100；geX 只出現在對應內部值以上（tools/sim.js 檢查）。
         遊戲讀程式內建值（game.js glassRuby），編輯器存的舊設定檔不會蓋掉。 */
      ruby: {
        prices: [15, 30],
        /* 2026-10-05 擁有者：玩家畫面不出現「設定」字眼，改成佐佐木用紅晶強化觀測鏡的說法（Claude＋Codex 討論，方案 2） */
        stages: ["紅晶精調觀測", "紅晶極限觀測"],
        notes: ["佐佐木以紅晶精調礦脈觀測鏡，下一次能看得更仔細。", "佐佐木將礦脈觀測鏡強化到極限，下一次能看見更深處的礦紋。"],   // 審查員（2026-10-05）：不承諾「更準確」
        buyHints: ["佐佐木完成精調——這次能看得更仔細。", "佐佐木完成極限強化——這次能看見更深處的礦紋。"],
        badgeRate: [10, 25],
        stageLines: [
          [ "紅晶給我。……別碰鏡片，我替你把焦距重新磨準。", "好了。這次霧會散得更開，看到的東西也更可信。" ],
          [ "還要再往下看？行。這次連紅晶一起燒進鏡片裡。", "這已經是它的極限了。看清楚，別浪費這一下。" ]
        ],
        weights: {
          1: [{ silent: 30, odd: 50, even: 5, glow: 10, reso: 5 },
              { silent: 15, odd: 70, even: 2, glow: 8, reso: 5 }],
          2: [{ silent: 20, odd: 5, even: 40, glow: 10, reso: 5, geD: 20 },
              { silent: 10, odd: 2, even: 55, glow: 5, reso: 3, geD: 25 }],
          3: [{ silent: 15, odd: 25, even: 5, glow: 15, reso: 10, geD: 15, geC: 15 },
              { silent: 5, odd: 35, even: 2, glow: 7, reso: 6, geD: 15, geC: 30 }],
          4: [{ silent: 10, odd: 5, even: 25, glow: 15, reso: 15, geD: 10, geC: 10, geB: 10 },
              { silent: 4, odd: 2, even: 25, glow: 7, reso: 7, geD: 10, geC: 15, geB: 30 }],
          5: [{ silent: 5, odd: 15, even: 5, glow: 15, reso: 20, geD: 5, geC: 10, geB: 10, geA: 15 },
              { silent: 3, odd: 15, even: 2, glow: 7, reso: 8, geD: 5, geC: 10, geB: 15, geA: 35 }],
          6: [{ silent: 3, odd: 3, even: 12, glow: 12, reso: 25, geD: 5, geC: 10, geB: 15, geA: 15 },
              { silent: 2, odd: 1, even: 8, glow: 4, reso: 20, geD: 5, geC: 10, geB: 20, geA: 30 }]
        }
      }
    },

    /* ---------- 紅晶（免費取得的高級貨幣，2026-10-05 設計 v4 定案） ----------
       規格：Claude outputs/紅晶高級貨幣設計草案_2026-10-04.md、docs/20_新礦坑檢查表.md。純邏輯在 js/ruby.js。
       紅晶不能用錢買、不能換金幣、不能交易。遊戲一律讀程式內建值（game.js 的 RC），編輯器存的設定檔改不動。
       每日以台灣遊戲日（todayKey）換日；每週從台灣時間週一 00:00 算。日期未知時不換日、不發恩惠和凍結的紅晶。 */
    ruby: {
      welcome: 20,                                   // 開帳號：每個帳號一輩子一次（要登入）
      ads: { enabled: false, at: [3, 6, 10, 12] },   // 當天第 N 次「完整看完」的廣告（補給＋換板合併）各 +1；網頁示意廣告不給 → enabled:false，上架接真廣告才開
      board: 2,                                      // 當天第 1 張委託板全部完成
      dig: { need: 42000, dailyCap: 4 },             // 挖礦進度條：累積滿 need 點得 1 顆；每天最多 dailyCap 顆（所有礦坑合計）；換日歸零
      boon: { per: 1, weekCap: 7 },                  // 恩惠每升 1 級
      freeze: { per: 2, dailyTimes: 2, weekCap: 8 }, // 地底凍結
      maxBal: 999999,
      probe: {   // 礦脈探測器（第 3 批）：接下來 count 次「通常狀態」的挖掘，機會牌機率 ×ruby.mines[礦坑].probe.mult，沒有保底
        count: 10,
        desc: "使用後的十次挖掘，更容易遇到機會牌。",   // 玩家看到的說明（擁有者：刻意寫得模糊；審查員 2026-10-05：不寫「抽選」「機率」「大幅」與驚嘆號）
        useLines: ["探測器嗡地一聲亮了起來……接下來的幾下，好好挖。", "儀器的指針開始亂跳。礦坑好像在回應什麼。"],
        endLine: "探測器的光熄了。"
      },
      drill: {   // 紅岩鑽頭（第 2 批）
        crystalDur: 10,   // 每顆小結晶：之後拿到的紅岩鑽頭耐久 +10（拿到當下決定，不設上限；試用版也吃）
        buyLines: ["……紅岩鑽頭。礦脈裡那股勁，連鑽頭都磨不動它。", "拿好。礦脈越深，你越會知道它的好。", "用到最後別丟。它會留點東西給你。"],
        freeLines: ["鑽頭透出紅光——礦脈裡，它一點也不會磨損。", "紅岩鑽頭在礦脈裡嗡嗡作響，刃口完好如初。"],
        freeLines2: ["鑽頭透出紅光——跟著前輩的時候，它一點也不會磨損。", "紅岩鑽頭跟著前輩嗡嗡作響，刃口完好如初。"],   // 三位前輩的考驗
        capLine: "紅岩鑽頭的紅光暗了下來……之後會照常磨損。",
        crystalLine: "紅岩鑽頭碎開，留下一顆小結晶。（之後拿到的紅岩鑽頭耐久 +{dur}）",
        trialEndLine: "試用的紅岩鑽頭用完了。"
      },
      shop: { redrock: 175, probe: 330, boardTicket: 25, nameColor: 120, frame: 220 },
      /* 外觀（擁有者 2026-10-05 看圖核准；星辰框不用）。src：ruby＝紅晶商店整組購買（華麗）／ach＝成就獎勵（樸素，哪個成就送哪款討論中）。
         id 與 docs/20 SQL 的 cosmetic_catalog 對應（只存白名單 id，不存顏色碼）。樣式在 css/style.css 的 .nc-*／.fr-* */
      cosmetics: [
        { id: "name_ruby",  slot: "name",  src: "ruby", label: "紅晶" },
        { id: "name_gold",  slot: "name",  src: "ruby", label: "熔金" },
        { id: "name_star",  slot: "name",  src: "ruby", label: "星辰紫" },
        { id: "name_ice",   slot: "name",  src: "ruby", label: "冰晶" },
        { id: "name_jade",  slot: "name",  src: "ruby", label: "翠脈" },
        { id: "name_dusk",  slot: "name",  src: "ruby", label: "夕焰" },
        { id: "name_moss",  slot: "name",  src: "ach",  label: "苔綠" },
        { id: "name_slate", slot: "name",  src: "ach",  label: "石青" },
        { id: "name_amber", slot: "name",  src: "ach",  label: "琥珀" },
        { id: "frame_ruby", slot: "frame", src: "ruby", label: "紅晶框" },
        { id: "frame_gold", slot: "frame", src: "ruby", label: "金紋框" },
        { id: "frame_iron", slot: "frame", src: "ach",  label: "鐵框" },
        { id: "frame_wood", slot: "frame", src: "ach",  label: "木框" },
        { id: "frame_bronze", slot: "frame", src: "ach", label: "銅框" }
      ],
      /* 每座礦坑的紅晶設定（docs/20 第三、五節）。放在這裡（以礦坑 id 為 key）而不是 mines 陣列裡：
         編輯器存的設定檔會整個蓋掉 mines 陣列，新欄位會不見。沒列出的礦坑一律「不適用」（docs/20 第四節安全預設）。
         progress.perDur：每扣 1 點耐久累積幾點；probe.mult：探測器機率倍數；drillFree：紅岩鑽頭不扣耐久的狀態。 */
      mines: {
        m1: { kind: "standard", progress: { perDur: 14 }, probe: { mult: 8 }, drillFree: { phases: ["bonus"], maxPerTool: 0 }, freezeReward: true },
        m2: { kind: "standard", progress: { perDur: 17 }, probe: { mult: 8 }, drillFree: { phases: ["bonus"], maxPerTool: 0 }, freezeReward: true },
        m3: { kind: "standard", progress: { perDur: 21 }, probe: { mult: 8 }, drillFree: { phases: ["bonus"], maxPerTool: 0 }, freezeReward: true },
        m4: { kind: "standard", progress: { perDur: 26 }, probe: { mult: 8 }, drillFree: { phases: ["bonus"], maxPerTool: 0 }, freezeReward: true },
        m5: { kind: "standard", progress: { perDur: 30 }, probe: { mult: 8 }, drillFree: { phases: ["bonus"], maxPerTool: 0 }, freezeReward: true },
        /* m6 探測器（擁有者 2026-10-05 選 A）：用下去後連續 10 次付費轉都扣次數、不暫停；通常 ×5（容易被找去談話）、
           帶路／一轉定勝負／前輩獎賞機會牌 ×3、認可抽選（ST）機會牌 ×1.5（一般關通過率約 72%→86%） */
        m6: { kind: "character", progress: { perDur: 35 }, probe: { mult: 5, states: { at: 3, st: 1.5, reward: 3, bonus: 3 } }, drillFree: { phases: ["at", "st", "reward", "bonus"], maxPerTool: 0 }, freezeReward: true }   // maxPerTool 0＝不限。m6 鑽頭（擁有者 2026-10-05 選 3）：帶路、認可抽選、一轉定勝負、前輩獎賞都不扣，不設上限；一把約 1760 轉
      }
    },

    /* ---------- 礦坑老闆 佐佐木 ---------- */
    boss: {
      name: "佐佐木",
      boardLines: 5,                                 // v0.10.13：每張委託板固定幾項（項目互不相同）
      boardResets: 2,                                // 每天可看廣告重置委託板幾次（跟「領補給」廣告分開計數）
      catWeights: { common: 40, good: 30, rare: 20, epic: 8, legend: 2 },
      qty: { common: [8, 20], good: [4, 10], rare: [2, 5], epic: [1, 2], legend: [1, 1] },
      points: { common: 2, good: 3, rare: 4, epic: 6, legend: 8 },
      completeBonus: 1,                              // 整張委託完成再加幾點
      veinChance: 0.15,                              // 綠以上有多少機率要求「脈晶」
      deliverMul: 1.5,                               // 交付金額 = 基本售價 × 此倍率
      levelNeed: { base: 25, step: 10, every: 5 },   // 升級所需點數：base + step × floor(等級 / every)
      /* 佐佐木恩惠 v2（擁有者 2026-09-29 定案，docs/13）：四種各 5 階、固定階幅，每升一級從未滿階的恩惠「等機率」抽兩種選一。
         2026-10-02 正式開啟（擁有者授權，與 docs/17 恩惠正式重置同一次切換；v0.10.15）。
         game.js 只讀 DEFAULT_CONFIG 的這個值，編輯器存的設定改不動它。
         開啟時舊的 boons／boonRarity 完全不讀（資料保留在存檔，方便回滾）。 */
      boonsV2: {
        enabled: true,
        offer: 2,                                    // 每級提供幾個候選（只剩一種未滿就只給一個）
        kinds: {
          autoSpeed: { step: 0.04, max: 5, name: "自動挖掘速度" },   // 間隔 = 基礎 ÷ (1 + 比例)
          sell:      { step: 0.02, max: 5, name: "礦石出售加價" },   // 只作用玩家出售；整筆總價最後一次取整到 0.1
          toolCut:   { step: 0.01, max: 5, name: "鎬子購買折扣" },   // 只套用 boonDiscount:true 的工具；售價至少 1
          toolDur:   { step: 0.02, max: 5, name: "新鎬子耐久" }      // 只套用 boonDurability:true 的工具，且只影響之後取得的新工具
        },
        maxedReward: true,                           // 四種全滿後，每升一級送「升級當下已解鎖最高礦坑對應的標準鎬子 ×1」
        /* 滿階謝禮的固定對照表（礦坑 tier → 工具 id）。只會送這裡列出、且工具本身 category:"pick" 與 rewardEligible:true 的標準鎬子；
           之後新增的特殊／活動／付費工具即使同 tier，也不會被誤送。 */
        rewardTiers: { 1: "wood", 2: "stone", 3: "iron", 4: "gold", 5: "diamond" },
        /* 里程碑（固定一次、不抽選、不取代該級的恩惠選擇、不進滿階謝禮）：每個 epoch 最多領一次。
           已經超過 lv 的 v2 存檔在啟用後補排一次；未到 lv 不排。 */
        milestones: { redrockTrial: { lv: 25, tool: "redrockTrial" } }
      },
      boonRarity: [60, 28, 10, 2],                   // 舊版（v2 開啟時不使用）：普通 / 藍 / 紫 / 金
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
        boons: "之前答應你的，都記在這。",               // v0.10.13 起由 talk.boons 決定；舊句「別弄丟了」不符恩惠性質已改
        noBoon: "……還早呢。多幫我跑幾趟再說。",
        levelUp: "這個給你。幫了忙，總不能只讓你拿一句謝謝。",
        ad: "外頭在發工具，需要就去拿。",
        bye: "路上小心。"
      },
      /* v0.10.13：佐佐木依操作與熟悉程度變化的台詞。
         熟悉度只看恩惠等級（擁有者 2026-09-28 決定）：Lv1～20 完全不熟／Lv21～40 開始熟悉／Lv41 以上非常熟。
         兩句的 [完全不熟, 熟悉後]：開始熟悉以上用第二句；三句的 [完全不熟, 開始熟悉, 非常熟]：照階段取。
         talk.lines（交付項目數）只做統計，不影響熟悉度。 */
      talk: {
        stages: [
          { name: "完全不熟" },
          { name: "開始熟悉", lv: 21 },
          { name: "非常熟", lv: 41 }
        ],
        shortReturnSec: 120,       // 離開後幾秒內回來算「短時間回店」
        longAwayHours: 72,         // 幾小時沒進店算「久未進店」
        lowToolRatio: 0.15,        // 使用中的工具耐久 ≤ 此比例算「快斷了」
        heavyBag: 40,              // 背包礦石總數 ≥ 此數才說「這袋蠻重的」
        chatChance: 0.4,           // 從「三位前輩的考驗」離開後第一次進店，抽中前輩閒聊的機率（只抽這一次）
        enter:      ["看看吧。要找什麼再叫我。", "來啦？旁邊那張椅子沒壞，可以坐。"],
        board:      ["有把握再接，不用一次搬齊。", "我就知道你會先看這張。缺什麼？我幫你看看。"],
        boardDone:  "今天的你都搬完了。怎麼，比我還急著開工？",
        sell:       ["放這邊，我秤一下。", "今天這袋蠻重的。你先休息，我來。"],
        buy:        ["拿起來試試，握得順比較要緊。", "又把上一把用壞啦？拿來我看看，你是不是老拿它撬石頭。"],
        boons:      ["之前答應你的，都記在這。", "我都記著，不會少你的。你幫過我的忙，我還沒忘。"],
        glass:      ["鏡片別用手摸。來，往這邊看。", "手先擦擦。我剛把鏡片擦乾淨。"],
        adBefore:   ["外頭在發工具，需要就去拿。", "去拿一把吧。手上有備用的，心裡也踏實。"],
        adAfter:    ["拿到了？收好。", "有了就別硬撐那把快斷的。省工具不是這樣省。"],
        bye:        ["路上小心。", "水帶了沒？……好，去吧。"],
        firstDeliver: "嗯，數量對了。錢拿好。",
        deliver:    ["……做得不錯。這是酬勞。", "你的東西放這邊就行。我先把這筆記完。", "你辦事我放心。來，這是你的。"],
        allDone:    ["齊了？好，這下不用到處找人問了。", "齊了？好，這下不用到處找人問了。", "今天又讓你跑了一趟。坐一下？我去添點水。"],
        levelUp:    ["這個給你。幫了忙，總不能只讓你拿一句謝謝。", "替你留的。別客氣，我又沒說要收錢。"],
        emptyBag:   "空手也能進來。只是別擋著門，我這還要做生意。",
        rareSell:   "先別倒！這顆另外放。……你在哪挖到的？",
        bought:     "拿穩。用起來哪裡不順，下次跟我說。",
        boughtAfterDeliver: "錢還沒拿熱就花回來了。好啦，這把給你。",
        lowTool:    "你那把柄都鬆了，還打算帶下去？",
        shortReturn: "忘了什麼？",
        longAway:   "有陣子沒見了。最近在哪座坑忙？",
        /* 前輩單方面閒聊（擁有者已接受的原句）：只有從「三位前輩的考驗」離開後第一次進店才抽一次；
           這一趟最後談過話的前輩＝說誰（沒談過話就三位隨機）；每位兩句輪流。與恩惠等級無關。 */
        chat: {
          a: ["下回碰到岩倉，跟她說，她訂的植物圖鑑到了。有空再來拿，不急。",
              "岩倉昨天穿了條新裙子來，站在門口不肯進來，嫌我這裡灰多。結果還不是坐了一下午。"],
          b: ["見到赤井，幫我催一下那口鍋。說借兩天，我都快忘記它長什麼樣了。",
              "赤井上回拿了袋餅乾回去，隔天說自己一塊都沒吃到。他家那幾個，手可快了。"],
          c: ["碰到霧島，叫他有空過來坐。他是我老朋友了，每次來卻站著講兩句就走。",
              "霧島前幾天幫我修了這張椅子。我還沒開口，他就嫌它晃，自己拿工具去了。"]
        },
        /* 隱藏台詞：抽中閒聊時，若這一趟最後談過話的前輩＝a/b/c，且玩家已持有那位前輩的珍貴回憶，改說這一句（每位一種） */
        hidden: {
          a: "岩倉說她終於找到一個人，肯陪她走那條小路，還肯聽她把話說完。……是你吧？她肯把心裡話講給你聽，是真把你當朋友了。",
          b: "赤井前幾天說，有人陪他等完最後一桶衣服，還幫忙一件件摺好。……是你吧？那傢伙肯跟你說家裡的事，是真把你當兄弟了。",
          c: "霧島跑來跟我借刨刀，說要重新削幾枚手裏劍。……十一歲以後，他就沒碰過那些東西了。你要跟他學，可別嫌他囉嗦。"
        }
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
      ,
      { id: "m6", engine: 2, tenjou: 999, tier: 3, name: "三位前輩的考驗", mult: 2.2, unlock: 5000,
        items: { common: ["碎鐵砂", "廢礦渣"], good: ["前輩的舊釘"], rare: ["工班的徽章"], epic: ["岩倉的礦燈", "赤井的鑿子", "霧島的懷錶"], legend: ["岩倉的金牌", "赤井的金鑿", "霧島的金錶"] },
        veinItems: { common: ["工棚的鐵屑", "工班的鑰匙", "工資袋", "零錢袋"], good: ["班長的筆記", "加班費"], rare: ["岩倉的信任", "赤井的信任", "霧島的信任"], epic: ["岩倉的肯定", "赤井的肯定", "霧島的肯定", "岩倉的紅包", "赤井的紅包", "霧島的紅包"], legend: ["岩倉的獎金袋", "赤井的獎金袋", "霧島的獎金袋"] } }
    ],

    /* ---------- 進入礦坑的密碼（存的是雜湊，不是密碼本身） ---------- */
    locks: {},   // 2026-10-03 擁有者：前輩台（m6）解鎖，大家都可以玩（原本 m6 有密碼）

    /* ---------- 第二台機台：三位前輩的考驗（獨立引擎） ---------- */
    machine2: {
      tenjou: 999,
      /* 地底凍結（2026-10-03 擁有者）：通常時每揮抽一次；三人好感度 100%、隨機一人帶你直接進上位，而且「不消耗任何好感度」——
         這一輪結束後三位前輩的好感度仍然全滿。
         試算：機械割約 +8～10%。 */
      freeze: { rate: 1 / 16384 },
      bosses: [
        /* date = 約會通過率（v0.10.0：固定值，好感度只決定「會不會被找」，不再影響通過率）
           越難抽到機會牌的前輩，通過率越高 */
        { id: "a", name: "岩倉", card: "岩倉的礦燈", date: [0.27, 0.2775, 0.2875, 0.3, 0.31, 0.32], hit: [0.9, 0.903, 0.907, 0.912, 0.916, 0.92] },
        { id: "b", name: "赤井", card: "赤井的鑿子", date: [0.46, 0.469, 0.481, 0.496, 0.508, 0.52], hit: [0.8, 0.806, 0.814, 0.824, 0.832, 0.84] },
        { id: "c", name: "霧島", card: "霧島的懷錶", date: [0.76, 0.769, 0.781, 0.796, 0.808, 0.82], hit: [0.7, 0.709, 0.721, 0.736, 0.748, 0.76] }
      ],
      /* 通常時的小役（cardA/B/C = 三位前輩的機會牌） */
      itemTable: {
        /* v0.9.5：三位前輩的機會牌機率拉近（設定1 約 1/102、1/169、1/308；
           設定6 越難的前輩改善越多 → 1/102、1/135、1/205） */
        goldA: [0.00156, 0.00156, 0.00156, 0.00156, 0.00156, 0.00156],
        goldB: [0.00093, 0.00096, 0.00101, 0.00107, 0.00111, 0.00116],
        goldC: [0.00052, 0.00056, 0.00061, 0.00068, 0.00073, 0.00078],
        cardA: [0.00977, 0.00977, 0.00977, 0.00977, 0.00977, 0.00977],
        cardB: [0.00591, 0.00613, 0.00643, 0.0068, 0.00709, 0.00739],
        cardC: [0.00325, 0.00349, 0.00382, 0.00423, 0.00455, 0.00488],
        bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125],
        replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137],
        common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
      },
      /* AT 與 BONUS 的小役（機率同通常，收益不同） */
      atTable: {
        goldA: [0.0016, 0.0016, 0.0016, 0.0016, 0.0016, 0.0016], goldB: [0.0008, 0.0008, 0.0008, 0.0008, 0.0008, 0.0008], goldC: [0.0004, 0.0004, 0.0004, 0.0004, 0.0004, 0.0004],
        cardA: [0.025, 0.025, 0.025, 0.025, 0.025, 0.025], cardB: [0.0111, 0.0111, 0.0111, 0.0111, 0.0111, 0.0111], cardC: [0.0045, 0.0045, 0.0045, 0.0045, 0.0045, 0.0045],
        bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
      },
      bonusTable: {
        goldA: [0.004, 0.004, 0.004, 0.004, 0.004, 0.004], goldB: [0.002, 0.002, 0.002, 0.002, 0.002, 0.002], goldC: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001],
        cardA: [0.025, 0.025, 0.025, 0.025, 0.025, 0.025], cardB: [0.0111, 0.0111, 0.0111, 0.0111, 0.0111, 0.0111], cardC: [0.0045, 0.0045, 0.0045, 0.0045, 0.0045, 0.0045],
        bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
      },
      at: { length: 10 },
      st: {
        length: 10,
        appear: [34, 33, 33],                       // 一般 ST：哪位前輩出現的權重
        otherPass: [0.25, 0.2575, 0.2675, 0.28, 0.29, 0.3]
      },
      /* ST 中的小役：對手越難，他的機會牌出現率越高（讓每關整體通關率接近 80/70/60%） */
      stTable: {
        a: { goldA: [0.0016, 0.0016, 0.0016, 0.0016, 0.0016, 0.0016], goldB: [0.0008, 0.0008, 0.0008, 0.0008, 0.0008, 0.0008], goldC: [0.0004, 0.0004, 0.0004, 0.0004, 0.0004, 0.0004], cardA: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], cardB: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], cardC: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25] },
        b: { goldA: [0.0016, 0.0016, 0.0016, 0.0016, 0.0016, 0.0016], goldB: [0.0008, 0.0008, 0.0008, 0.0008, 0.0008, 0.0008], goldC: [0.0004, 0.0004, 0.0004, 0.0004, 0.0004, 0.0004], cardA: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], cardB: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], cardC: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25] },
        c: { goldA: [0.0016, 0.0016, 0.0016, 0.0016, 0.0016, 0.0016], goldB: [0.0008, 0.0008, 0.0008, 0.0008, 0.0008, 0.0008], goldC: [0.0004, 0.0004, 0.0004, 0.0004, 0.0004, 0.0004], cardA: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], cardB: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], cardC: [0.105, 0.105, 0.105, 0.105, 0.105, 0.105], bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25] }
      },
      /* 上位 ST：三種機會牌 1:1:1 */
      stTableUpper: {
        goldA: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001], goldB: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001], goldC: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001],
        cardA: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08], cardB: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08], cardC: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
        bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
      },
      upper: {
        /* 抽選時機：通關第 N 關「之後」（準備下一關時才抽、才演出） */
        rounds: { "1": [0.15, 0.1635, 0.1815, 0.204, 0.222, 0.24], "3": [0.1, 0.109, 0.121, 0.136, 0.148, 0.16], "7": [0.6, 0.6525, 0.7225, 0.81, 0.88, 0.95], "10": [1, 1, 1, 1, 1, 1] },
        reward: { low: [30, 55], mid: [45, 80], card: [70, 100], gold: [150, 300] },   // 上位後每次通關的轉數（保底 30 以上）
        hitRight: [0.9, 0.9045, 0.9105, 0.918, 0.924, 0.93],
        hitWrong: [0.7, 0.712, 0.728, 0.748, 0.764, 0.78]
      },
      /* 一轉定勝負 → BONUS 轉數 */
      rewardTable: {
        goldA: [0.0016, 0.0016, 0.0016, 0.0016, 0.0016, 0.0016], goldB: [0.0008, 0.0008, 0.0008, 0.0008, 0.0008, 0.0008], goldC: [0.0004, 0.0004, 0.0004, 0.0004, 0.0004, 0.0004],
        cardA: [0.025, 0.025, 0.025, 0.025, 0.025, 0.025], cardB: [0.0111, 0.0111, 0.0111, 0.0111, 0.0111, 0.0111], cardC: [0.0045, 0.0045, 0.0045, 0.0045, 0.0045, 0.0045],
        bell: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125], replay: [0.137, 0.137, 0.137, 0.137, 0.137, 0.137], common: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
      },
      reward: { low: [10, 20], mid: [18, 50], card: [45, 100], gold: [100, 300] },
      /* 鏟子（v0.10.0 改）：大部分是 +1/+2/+3/+5，轉數很多的時候才會夾帶
         幾個「大跳」（+25、+50、+100…）當驚喜。總和一定等於實際轉數。 */
      dig: {
        minTaps: 6, maxTaps: 30,
        perTap: 7,                       // 每幾轉配一下點擊（決定這次要點幾下）
        incs: [1, 2, 3, 5], incWeights: [40, 30, 20, 10],
        bigIncs: [10, 25, 50, 100, 200], // 大跳可用的漂亮數字
        bigAfter: 3                      // 前幾下不會出現大跳（先醞釀）
      },
      bonusQty: [30, 40, 30],   // BONUS 每轉挖到 1／2／3 個礦石的權重
      /* 每一轉的收益（第 1 層基準，再乘礦坑倍率）：AT／ST／BONUS 三種階段 */
      /* 礦石對應表：通常時挖到的 ↔ AT/ST/BONUS 中挖到的（兩套不同礦石、不同價格） */
      map: {
        normal: { cardA: "岩倉的礦燈", cardB: "赤井的鑿子", cardC: "霧島的懷錶", goldA: "岩倉的金牌", goldB: "赤井的金鑿", goldC: "霧島的金錶", bell: "工班的徽章", replay: "前輩的舊釘", common: ["碎鐵砂", "廢礦渣"] },
        st:     { cardA: "岩倉的信任", cardB: "赤井的信任", cardC: "霧島的信任", goldA: "岩倉的肯定", goldB: "赤井的肯定", goldC: "霧島的肯定", bell: "班長的筆記", replay: "工棚的鐵屑", common: ["工班的鑰匙"] },
        bonus:  { cardA: "岩倉的紅包", cardB: "赤井的紅包", cardC: "霧島的紅包", goldA: "岩倉的獎金袋", goldB: "赤井的獎金袋", goldC: "霧島的獎金袋", bell: "加班費", replay: "工資袋", common: ["零錢袋"] }
      },
      /* 這台礦石的基本售價（會再乘礦坑倍率）。機械割就是用這些基本價算的 */
      prices: {
        "岩倉的礦燈": 2.5, "赤井的鑿子": 4.0, "霧島的懷錶": 7.5, "工班的徽章": 1.0, "前輩的舊釘": 0.5, "碎鐵砂": 0.5, "廢礦渣": 0.5,
        "岩倉的金牌": 6.0, "赤井的金鑿": 9.0, "霧島的金錶": 15.0,
        "岩倉的信任": 6, "赤井的信任": 8, "霧島的信任": 12, "岩倉的肯定": 15, "赤井的肯定": 18, "霧島的肯定": 25, "班長的筆記": 3, "工棚的鐵屑": 1.5, "工班的鑰匙": 1.5,
        "岩倉的紅包": 12.1, "赤井的紅包": 15.4, "霧島的紅包": 22.0, "岩倉的獎金袋": 30.25, "赤井的獎金袋": 38.5, "霧島的獎金袋": 52.25, "加班費": 7.7, "工資袋": 3.85, "零錢袋": 3.85
      },
      /* 今日心情：每天隨機一位前輩心情好，該位的約會通過率提高（玩家看得到暗示） */
      mood: {
        bonus: 0.05,
        hintRate: 0.15,          // 挖到該位機會牌時，額外出現暗示的機率
        lines: ["{name}今天看起來心情不錯", "聽說{name}今天心情很好", "{name}哼著歌走過去"]
      },

      /* 好感度＝「被找去談話」的機率（內部，玩家看不到）
         紫色機會牌：該前輩 +1~10%；金色機會牌：對應的前輩們 +5~30%（保底 5%）
         好感度 100% → 必定被找去談話，而且該次約會必定過關 */
      favor: {
        purpleMin: 0.01, purpleMax: 0.10,
        goldMin: 0.05, goldMax: 0.30,
        goldTargets: { goldA: ["a", "c"], goldB: ["b", "c"], goldC: ["a", "b", "c"] }
      },

      /* 約會（談話）：長度與信賴度顏色
         - 一般 5～15 轉；違和感長度（1～2 轉或 16～20 轉）＝確定過關
         - 每一轉抽一個信賴度顏色（白藍黃綠紅）：紅色越多越容易過關 */
      date: {
        steps: [5, 15],                    // 一般長度（三種劇本共用）
        oddChance: [0.12, 0.12, 0.13, 0.14, 0.15, 0.16],   // 會過的時候，用「違和感長度」演出的機率
        shortLen: [1, 2], longLen: [20, 30],               // 違和感長度（出現＝確定過關）
        upAt: 3, hotAt: 4,                 // 顏色 ≥3 用 up 台詞、≥4 用 hot 台詞
        /* 劇本抽選：結果先定案，再抽「要用哪一套演出」
           normal＝礦坑內談話、strong＝外出、hot＝激熱
           失敗時也抽得到外出（機率低），所以外出不是確定，只是高信賴度 */
        scene: {
          win:  { strong: 0.30, hot: 0.08 },
          lose: { strong: 0.065, hot: 0.005 }
        },
        /* 期待度顏色（0白 1藍 2黃 3綠 4紅）：循序漸進、只升不降
           - colorTarget：這場最後會升到哪一階的權重
           - 失敗時「紅」的權重是 0 → 紅色出現＝確定過關
           - colorCeil：這套劇本 × 這個結果 的上限（外出但會失敗 → 最多到綠）
           - colorFloor：這套劇本的起始色（激熱一開場就是綠） */
        colorTarget: {
          win:  [0, 10, 22, 30, 38],
          lose: [18, 32, 28, 22, 3.6]     // v0.10.4：失敗時也有少量紅 → 紅色通關率約 89%（與第一台一致）
        },
        colorCeil: {
          normal: { win: 4, lose: 4 },    // 礦坑內談話：失敗也可能到紅
          strong: { win: 4, lose: 3 },    // 外出但會失敗 → 最多到綠（保留原設計）
          hot:    { win: 4, lose: 3 }
        },
        colorFloor: { normal: 0, strong: 1, hot: 3 },
        colorStartAt: 0.35                 // 大約演到幾成之後才開始升色
      },
      /* ===== 前輩百次回憶（v0.10.11）=====
         與某位前輩談話成功（dateWin）累積到 need 次時觸發一次專屬回憶。
         lines 依順序每點一次追加一句；之後要加長直接往陣列後面加即可。
         item＝看完後取得的收藏（不是礦石：沒有價格、不能賣、不算圖鑑）。 */
      memories: {
        need: 100,
        next: [500, 1000],                 // 之後的回憶門檻（2026-10-03）：內容還沒寫，只在成就頁占位顯示
        a: {
          title: "還是像平常一樣",
          item: "岩倉的植物筆記",
          lines: [
            "休假的早上，岩倉約你到礦坑外的小路碰面。",
            "她換下工作服，肩上掛著布袋，手裡夾著一本翻舊的植物圖鑑。",
            "圖鑑下面還壓著一本掌心大的筆記本，邊角已經有些磨白。",
            "經過路邊的小店時，老闆娘笑著招呼：「小姑娘，今天也出來散步啊？」",
            "岩倉停了一下，仍然很有禮貌地點頭：「是，今天天氣很好。」",
            "走遠以後，她才輕輕嘆了一口氣。",
            "「只要離開礦坑，大家就會突然把我當成需要照顧的小女生。」",
            "「我知道他們沒有惡意，所以也不好說什麼。」",
            "她拉了拉身上的衣服：「我也不是討厭穿成這樣。」",
            "「只是每個人一看到，連說話的方式都變了。」",
            "岩倉忽然停下，蹲在路邊撥開一片葉子。",
            "「這是腎蕨。下面那一排一排的不是蟲卵，你不要亂擦。」",
            "她見你盯著手裡的圖鑑，笑了一下。",
            "「我以前想學這個。植物學。」",
            "「那時候圖鑑看得比課本還勤，連書背都快被我翻掉了。」",
            "「不過家裡覺得，喜歡歸喜歡，還是早點出去工作比較實際。」",
            "「我一反駁，他們就說我從小就叛逆。」",
            "她聳了聳肩：「他們覺得我不聽話，我只是覺得他們從來沒聽懂。」",
            "岩倉站起來，拍掉手套上的土。",
            "「後來朋友帶我進礦坑，我反而待得下來。」",
            "「裡面沒有人喊我小姑娘，也沒有人搶著替我拿東西。」",
            "「搬得動就搬，做錯了就挨罵。累是很累，可是很輕鬆。」",
            "「大家把我當兄弟相處。我很喜歡那樣。」",
            "她往前走了幾步，又慢慢停下來。",
            "「還有一件事，我一直沒跟礦坑的人說。」",
            "岩倉低頭翻著圖鑑，明明沒有在找哪一頁。",
            "「我喜歡女孩子。」",
            "「以前也喜歡過一個比我小一點的女生。」",
            "「我那時候總想幫她，怕她吃虧，也怕她被別人欺負。」",
            "「結果大概靠得太近了。她被我嚇到，後來一直躲著我。」",
            "岩倉把圖鑑闔起來：「那陣子，我確實懷疑過自己。」",
            "「現在想想，是我太急了。她會害怕也很正常。」",
            "「已經過去了，我也沒有怪她。」",
            "她安靜了一會兒，耳朵有些紅。",
            "「我告訴你，是因為我們也認識很久了。」",
            "「你一直都把我當岩倉。明天回礦坑，最重的那箱也照樣留給我吧。」",
            "她從圖鑑下面抽出那本小筆記，放到你手上。",
            "「這本給你。有空翻翻吧，上面還有我畫的小圖。」她笑了笑，「畫得很精美喔。」",
            "「不要把自己的夢想丟著不管。就算家裡不同意，也要努力去爭取……這句也算是說給我自己聽的。」",
            "她看著你，語氣平靜下來：「我沒什麼不一樣。跟大家一樣，都是在努力過自己的日子。」"
          ]
        },
        b: {
          title: "等最後一桶",
          item: "赤井家的紙鶴",
          lines: [
            "深夜的自助洗衣店裡，只剩最後一排燈還亮著。",
            "赤井把兩大袋衣服放到地上，長長吐了一口氣。",
            "「兄弟，先說好。今天叫你來不是要你請客。」",
            "他踢了踢其中一袋：「只是這袋東西真的很重。」",
            "你幫忙把衣服分開，赤井熟練地投幣、倒入洗衣粉。",
            "「家裡六個人，衣服就跟會自己生衣服一樣。」",
            "「老二現在會幫忙了，不過他每次都把深色跟淺色混在一起。」",
            "赤井笑了一聲：「上次洗完，小妹的白衣服全變成粉紅色。」",
            "洗衣機開始轉動，店裡只剩下規律的水聲。",
            "赤井坐到塑膠椅上，手裡反覆轉著一枚硬幣。",
            "「這種時間，我其實不太習慣。」",
            "「家裡安靜下來的時候，我就會想到以前。」",
            "他盯著洗衣機裡翻動的衣服：「爸媽出事那天，家裡也是這麼安靜。」",
            "「那時候我十六歲，老二才十歲。」",
            "「最小的那個只有三歲，連發生什麼事都不知道。」",
            "「大人拿了一個信封給我，說是爸媽留下來的錢。」",
            "「看起來不少，真的開始用以後，才發現根本撐不了多久。」",
            "「房租、吃飯、上學，隨便算一算就快沒了。」",
            "他把硬幣收進口袋：「所以我就下礦了。」",
            "「那時候很多人問我怕不怕。」",
            "赤井扯了一下嘴角：「當然怕啊。十六歲欸，怎麼可能不怕。」",
            "「可是爸媽也是在那裡工作。」",
            "「我一直說，他們會在下面保護我。其實只是這樣講，我比較敢走進去。」",
            "「每次平安出來，我都會想……他們看到的話，應該還算滿意吧。」",
            "赤井低著頭，又把那枚硬幣拿出來轉。",
            "「有時候真的太累，我會躲起來哭一下。」",
            "「不能在家裡哭。那幾個看到，一定會跟著亂。」",
            "「所以哭完就洗把臉，回去繼續煮飯。」",
            "他靠回椅背：「我是最大的嘛。總要有一個人看起來靠得住。」",
            "「不過你別擺出那種想幫我扛一半的表情。」",
            "「他們不是我的負擔。誰敢這樣講，我真的會翻臉。」",
            "「要幫忙的話，下次陪小妹寫作業就好。她現在的算術很可怕。」",
            "「老二也十八歲了，最近一直說想跟我一起下礦。」",
            "「我叫他慢慢來。至少先把自己想做什麼弄清楚。」",
            "赤井停了一下，小聲補了一句：「不要只是因為看我太累。」",
            "洗衣機響起提示音，你起身陪他把衣服一件件摺好。",
            "收完最後一件，赤井從外套內袋拿出一個小盒子。",
            "盒子裡放著幾隻有些褪色的紙鶴：「我第一次上學的時候，媽媽摺給我的。她那時候摺了很多，現在也不可能再有新的了。」",
            "他挑出其中一隻，放到你手上：「最早的那隻我可不給。這隻給你，已經很夠意思了啊。」",
            "赤井提起洗好的衣服，朝你笑了一下：「收好。下次來我家，那五個要是問起，就說是我給的，免得他們以為你偷拿。」"
          ]
        },
        c: {
          title: "第三枚手裏劍",
          item: "霧島的第三枚手裏劍",
          lines: [
            "黃昏時，霧島帶你來到礦坑外一間廢棄的舊工寮。",
            "他撥開門上的蜘蛛網，熟練地轉了幾下生鏽的鎖。",
            "「以前休息的地方。現在沒人用了。」",
            "工寮後方的木牆上，留著許多深淺不一的切痕。",
            "霧島摸過那些痕跡：「我練習留下的。」",
            "他在牆邊坐下，話忽然多了起來。",
            "「父親以前說，他有個同事，私下還在做職業忍者。」",
            "「不是表演。是收了錢，替人辦事的那種。」",
            "「我那時候真的很迷。每天跑山路、爬樹、練腳步，還要學怎麼不發出聲音。」",
            "「最認真的時候，連吃飯拿筷子都在練。」",
            "霧島指向牆角：「手裏劍也是在這裡削的。」",
            "「一共兩枚。都是我自己做的。」",
            "「其中一枚給了弟弟。他到現在還留著。」",
            "霧島沉默片刻，從地上撿起一小塊舊木料。",
            "「後來父親得了癌症。母親出去找工作，總是做不久。」",
            "「弟弟還小，我就把這些收起來，下礦去了。」",
            "「這些年去神社，我只求家裡平安，父親能夠安息。」",
            "「弟弟現在是經理。我們不太說得上話。」",
            "他低頭看著木料：「不過也好。他走到了和我不一樣的地方。」",
            "「只是偶爾會想，如果當年沒有放下，我能走到哪裡。」",
            "說話間，他已用小刀把木料削出四道短刃。",
            "霧島仔細磨平每個尖角，將新做好的木製手裏劍交給你。",
            "「拿著。第三枚。這枚是你的。」",
            "他起身拍掉木屑：「明天清晨五點，帶來。既然收了，就得練。」"
          ]
        }
      },

      /* ===== 外出劇本（v0.10.0）=====
         strong＝外出、hot＝激熱。每套四組：depart 出發／during 現場／win 成功／lose 失敗。
         現場台詞會依當下的期待度顏色上色，顏色只升不降。 */
      bossScenes: {
        a: {
          strong: {
            place: "森林",
            depart: ["「今天不下坑。」她把礦燈掛回牆上，「跟我走。」", "「你知道坑口那條路再往上走是什麼嗎？」"],
            during: [
              "樹林裡比礦坑亮太多，你一時睜不開眼",
              "她蹲下來撥開落葉，「你看，這個叫鹿蹄草，長在這種地方代表土是酸的。」",
              "「噓。」她突然按住你的手——一隻山羌正低頭喝水",
              "「家裡要我早點工作。」她講得很輕，「後來是朋友帶我下坑。」",
              "她摘了一片葉子給你聞，「這個揉開會有薄荷味，礦工頭痛的時候會嚼。」",
              "「這棵樹的年輪比整座礦坑還老。」她拍了拍樹幹",
              "她說了一長串葉脈的分類，講到一半自己笑了，「你根本沒在聽對不對。」"
            ],
            win: ["「……你聽得懂我在講什麼。」她愣了一下，「很久沒人聽我講完了。」", "「明天開始跟我下坑。」"],
            lose: ["天色暗了，她站起來拍掉褲子上的土，「回去吧。」", "「今天講太多了。」她把葉子扔掉"]
          },
          hot: {
            place: "街上",
            depart: ["「等我十分鐘。」她把工作服脫了，你差點沒認出她", "「……幹嘛那樣看我。我也是會穿別的衣服的。」"],
            during: [
              "她站在鏡子前面把裙擺轉了半圈",
              "「這件是不是很漂亮？你先別看價錢，看裙擺啦！」",
              "你這才發現她比在坑裡矮了半個頭——她平常都穿工作靴",
              "「這件我休假穿就好。穿去酒館，那些人又要大驚小怪。」",
              "她拿起一支髮夾，看了很久又放回去",
              "「這件配工作靴會不會很怪？」她一邊挑衣服一邊說，「算了，休假就別想工作了。」",
              "店員問她「要幫朋友也挑一件嗎」，她笑著擺手：「不用啦，這個人只穿工作服。」"
            ],
            win: ["「……今天謝謝你。」她把礦燈塞回你手上，「明天正式開始。」", "「我就知道找你來沒錯。再陪我看一家，最後一家！」"],
            lose: ["她把衣服放回架上，「算了，我還是穿工作服好看。」", "「……當我沒說。」她走得很快"]
          }
        },
        b: {
          strong: {
            place: "酒館",
            depart: ["「收工！走走走，我請客。」他勾住你的肩膀就往外拖", "「你這種臉色就是要喝一杯啦。」"],
            during: [
              "他把杯子往桌上一放，泡沫溢出來",
              "「五！十！」整桌人跟著喊，赤井輸了一拳，臉都紅了",
              "「我跟你講那個班長喔——」他講到一半自己先笑出來",
              "他站起來跟隔壁桌對喊，被老闆娘罵了一句才坐下",
              "「我十六歲就下坑了啦，你算晚的。」他灌了一大口",
              "「欸你酒量不錯欸。」他重重拍你的背",
              "他開始吹自己一個人推過三台礦車，全桌沒人信"
            ],
            win: ["「兄弟啦。」他把鑿子塞到你手上，「以後有事喊我。」", "「你這人可以。走，明天帶你。」"],
            lose: ["「啊……我喝多了。」他揮揮手，「你先回去。」", "他趴在桌上睡著了"]
          },
          hot: {
            place: "他家",
            depart: ["「……欸。」他難得吞吞吐吐，「要不要來我家吃飯。」", "他走在前面沒回頭，「不要跟別人講。」"],
            during: [
              "門一開，五個弟弟妹妹同時衝出來抱住他的腿",
              "「哥！」最小的那個第一個衝過來抱住他",
              "他把飯鍋端上桌：「碗在那邊，自己拿。來我家不用等人招呼。」",
              "「我爸媽走得早，兩個都是在坑裡。」他一邊替最小的盛飯一邊說，語氣跟平常完全不一樣",
              "牆上貼著小學的獎狀，名字不是他的",
              "「別看他們吵，收碗一個比一個快。欸，那個偷跑的不算！」",
              "小妹問你「你是不是我哥的朋友」，赤井趕快把她抱走"
            ],
            win: ["「……今天讓你看到這些。」他抓了抓頭，「你是自己人了。」", "「明天開始，我教你真的東西。」"],
            lose: ["「今天先這樣。」他把門帶上，「小孩要睡了。」", "他送你到巷口，沒有再說話"]
          }
        },
        c: {
          strong: {
            place: "封坑口",
            depart: ["他轉身就走，走了十步才說「跟上。」", "「你應該看一次。」"],
            during: [
              "他停在一段用木板封死的坑道前，沒有說話",
              "風從縫裡灌出來，礦燈晃了一下",
              "「民國七十年。」他說，「十七個人。」",
              "木板上有名字，被刻得很深",
              "「他們那天也是覺得撐得住。」",
              "他伸手摸了其中一個名字，停了很久",
              "「我要你記住這個味道。」他說，「聞到就跑。」"
            ],
            win: ["「……你沒有跑掉。」他終於轉過來看你，「可以。」", "他把懷錶收回口袋，「跟我來。」"],
            lose: ["他看了你一眼，自己先走下去了", "「還不行。」他說完就沒有下文"]
          },
          hot: {
            place: "礦山神社",
            depart: ["「今天不下坑。」他把懷錶放進口袋，「陪我走一段。」", "他往山上走，方向跟礦坑完全相反"],
            during: [
              "神社很小，鳥居的漆掉得差不多了",
              "他在石階上坐下來，難得看他這樣放鬆",
              "「我小時候想當忍者。」他說。你以為自己聽錯了",
              "「就在這裡練，從那塊石頭跳到這裡。」他指了指，「摔斷過手。」",
              "「後來我爸得了癌症。」他停了很久，「我媽出去找工作。弟弟還小。」",
              "「我就下坑了。十一歲。」",
              "他從口袋拿出懷錶，「這是我爸的。他走後，我一直帶著。」",
              "他靠著石階，說話的語氣慢了下來"
            ],
            win: ["「……很久沒跟人講這些了。」他笑出聲來，這次是真的笑了。「走吧。」", "「往後有拿不準的，來問我。別自己硬撐。」說完，他笑了一下"],
            lose: ["他把懷錶收起來，「講太多了。」", "他站起來就往山下走，沒有等你"]
          }
        }
      },

      /* 每位前輩的台詞（chat＝一般、up＝開始認真/當你兄弟/嘴角動了、hot＝確信度最高） */
      bossLines: {
        a: {
          again: ["「又是你？」她笑了出來", "「你怎麼老是碰到我。」"],
          call: ["「喂，新來的——過來一下。」", "「你，對，就是你。」"],
          chat: ["岩倉把礦燈轉了個方向，看著你", "「你剛才那個握法，是誰教你的啊？」", "你講了個坑道裡的笑話，她噴笑出來", "「哈哈哈，你這人真的很怪。」", "她一邊笑一邊把圖紙摺起來"],
          up: ["她笑到一半突然停下來，「等等，你真的不知道？」", "「……坐下。我教你。」", "她把礦燈放低，開始在地上畫給你看"],
          hot: ["「這個你記牢，會救命。」她的眼神完全不一樣了", "她把手上的活全放下，認真看著你", "「聽好，只講一次。」"],
          win: ["「……好。我認可你了。」", "「燈給你拿。跟上。」"],
          lose: ["「今天先這樣吧。」她笑著揮手", "「下次再來玩啊。」"],
          appear: ["岩倉把礦燈插在岩壁上"],
          pass: ["「這次算你行。」"],
          fail: ["「……回去再練。」"]
        },
        b: {
          again: ["「欸又是我啦？」", "「兄弟，我們真有緣。」"],
          call: ["「欸欸，那個誰——過來。」", "赤井朝你揮了揮鑿子。"],
          chat: ["「你幾號進來的啊？」", "赤井邊嚼東西邊跟你講話", "「昨天那個班長超扯，你聽我說。」", "他把鑿子在手上轉了兩圈", "「你這樣不行啦，會斷。」"],
          up: ["「……喂，你這人還不錯欸。」", "他拍了你的肩膀一下", "「兄弟，我跟你說個秘密。」"],
          hot: ["「兄弟，以後有事找我。」", "他把自己的鑿子塞到你手上", "「你是我兄弟了啊，記住。」"],
          win: ["「嗯。還行。」", "「走啦兄弟。」"],
          lose: ["「啊……你還是先練基本的。」", "他聳聳肩走了"],
          appear: ["赤井把鑿子架在肩上"],
          pass: ["「勉強及格。」"],
          fail: ["「太慢了。」"]
        },
        c: {
          again: ["「……又是你。」", "霧島看了懷錶一眼，沒說話"],
          call: ["霧島看了你一眼，沒說話。", "「……跟我來。」"],
          chat: ["霧島掏出懷錶，看了一下", "他一句話都沒說", "坑道裡只剩懷錶的聲音", "「……」", "他把懷錶闔上"],
          up: ["他的嘴角動了一下", "「……你倒是敢問。」", "他停下腳步，看著你"],
          hot: ["霧島的肩膀放鬆下來，話也多了一點", "「哼。」他把懷錶收起來，語氣軟了些", "「你這小子。」他的語氣難得鬆了下來"],
          win: ["「……跟上。別掉隊。」他轉身時，嘴角終於揚了起來"],
          lose: ["「時間不對。」", "他轉身就走了"],
          appear: ["霧島把懷錶收進口袋"],
          pass: ["「可以了。」"],
          fail: ["「……時間到了。」"]
        }
      },
      lines: {
        /* 前輩台的地底凍結＝一場夢（2026-10-03 擁有者：夢到跟三位前輩去路邊攤吃燒烤，大家和樂融融）。
           talk：who＝a/b/c 是前輩說話，沒有 who 是旁白；cheers＝乾杯那一下爆火花。greet＝醒來後帶你走的那位前輩說的話。 */
        dream: {
          drowsy: "眼皮……好重……", title: "在夢中",
          scene: ["路邊攤的燈泡黃黃的，炭火劈啪作響。", "烤肉的香味混著夜風飄過來。"],
          talk: [
            { who: "b", text: "「來來來！今天我請！兄弟你給我坐好！」" },
            { who: "a", text: "「你上次也這樣講，最後還不是我付的。」" },
            { who: "c", text: "「……這串，你先吃。」" },
            { text: "他把剛烤好的肉串推到你面前。" },
            { who: "b", text: "「霧島前輩居然會讓肉給人？！」" },
            { who: "a", text: "「他只是怕燙啦。」她笑著看你，「多吃一點。」" },
            { who: "c", text: "「……吃就是了。」他嘴角好像動了一下。" },
            { who: "b", text: "「乾杯！敬我們的新兄弟！」" },
            { text: "三個人的杯子碰在一起──", cheers: true },
            { text: "笑聲越來越遠……" }
          ],
          wake: "……你醒了。", hold: "長按睜開眼睛", reveal: "★ 夢醒時分 ★",
          greet: {
            a: "「東西都帶好了嗎？剛剛看你一直在恍神。」她笑了笑，「走吧，我們都在。」",
            b: "「醒啦兄弟？剛剛講好的，你還記得吧？出發囉！」",
            c: "「……剛才的事，記得就好。」他把礦燈遞給你，「走。」"
          },
          colors: { a: "#8fd694", b: "#ff9466", c: "#a9bcdf" }
        },
        call: ["……喂，新來的。過來一下。", "你最近挖得不錯。過來聊聊。"],
        dateStep: ["前輩看著你", "「……」", "你把手上的東西交出去——"],
        dateWin: "「……好。我認可你了。」",
        dateLose: "「還差得遠呢。再來。」",
        atStart: "★ 前輩帶你進了深處 ★",
        stIntro: "三個人從坑道裡走出來……",
        stAppear: "這回由{name}前輩出題。",   // {name}＝前輩名字
        stPass: "「這次算你行。」",
        stLose: "「……回去再練。」",
        reward: "「做得不錯。這是給你的，讓我看看你的本事。」",
        pick: "要用哪個？",
        drill: "▶ 強力鑽頭（一次揭曉）",
        shovel: "▶ 鏟子（自己挖）",
        digTap: "▽ 用力挖",
        announce: "這次的報酬是",
        upperStart: "★ 三人同時點頭了 ★",
        askBoss: "這次要挑戰誰？",
        alsoWants: "也想找你聊聊",
        goldGift: "……有人幫你說了好話",
        bonusEnd: "這趟辛苦了。"
      }
    },

    /* ---------- 文字（盡量少，可在編輯模式修改） ---------- */
    texts: {
      /* 歡迎字條（2026-10-03，GPT 擬稿；擁有者要口語有人味，第二版）：每次打開遊戲在敘述框逐字播放一句；{name}＝玩家名字 */
      welcome: ["歡迎！今天是個下礦的好日子！", "嘿，{name}，今天一起挖吧！", "{name}，便當帶了沒？", "{name}，先伸個懶腰再下礦吧。", "{name}來啦！今天手氣一定不錯。",
        "礦燈亮了，我們慢慢挖。", "累了就休息一下，別硬撐喔。", "安全帽戴好，寶貝在下面等你。", "腰還好嗎？今天慢慢來就好。", "走吧，今天也挖個痛快！"],
      freeze: { talk: ["這個...好像也是...", "我從來沒辦法", "看見的風景", "恭喜你...成功...達成了..."], hold: "長按揭曉", title: "✦ 星辰直通 ✦" },   // 擁有者 2026-10-03 親自寫的台詞
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
      atHighTag: "≋ 礦層在共鳴 ≋",
      atHighTagDeep: "≋ 礦脈深層共鳴 ≋",
      atHighEnterDeep: "……整座礦山開始共鳴",
      atHighEnter: "……整片岩層開始共鳴",
      atHighHint: "岩層還在震動",
      atHighEnd: "共鳴平息了",
      upgrade: "礦脈變得更粗了！",
      bonusChain: "礦脈延伸！",
      bonusChainSurprise: "……岩層還在震動！礦脈延伸！",
      bonusEnd: "礦脈枯竭了",
      veinCap: "……這條礦脈被挖到極限了",
      upperStart: "★ 礦脈進入核心層 ★",
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
