/* =========================================================
   遊戲本體 Game：畫面、存檔、玩家操作
   ========================================================= */
(function () {
  const E = window.MineEngine;
  const E2 = window.MineEngine2;
  /* 本機隔離測試：只有 localhost／127.0.0.1 且網址帶 ?sandbox=名稱 才生效。
     存檔、設定、備份全部換成另一組 key，雲端模組同時關閉（見 cloud.js），不會碰到正常存檔或正式帳號。 */
  const SANDBOX = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (location.search.match(/[?&]sandbox=([\w-]{1,32})/) || [])[1]) || "";
  const SB = SANDBOX ? "__sandbox_" + SANDBOX : "";
  /* 紅晶（儲值貨幣，2026-10-03 由鉍晶改名）。擁有者 2026-10-03「紅晶的欄位留著，商店的部分鎖起來」：
     正式版：頂部顯示紅晶 0（還沒有雲端錢包）、老闆選單的紅晶商店上鎖（準備中）。
     本機 sandbox：照舊是示意商店（假數字、不寫存檔、不連雲端、按了不會買）。正式開放要等雲端錢包（伺服器把關）做好。 */
  const RUBY_PREVIEW = !!SANDBOX, RUBY_MOCK = 120;
  const RUBY_ICO = '<svg class="ruby-ico" viewBox="0 0 10 10" aria-hidden="true"><use href="#ico-ruby"/></svg>';
  const CFG_KEY = "mine_config_v4" + SB;
  const SAVE_KEY = "mine_save_v1" + SB;
  /* 恩惠 v2 第一次遷移前的整份存檔。集合：{ entries: { 備份id: { at, src, save } } }。
     備份id＝帳號雜湊（沒登入＝anon）＋存檔內容雜湊 → 不同玩家／不同存檔各自一份、互不覆蓋；同一份不重寫。
     帳號只存不可逆的雜湊，不寫 email 或原始 id，也不印到 console／畫面。 */
  const BOON_BACKUP_KEY = "mine_boon_backups_v1" + SB;
  /* 恩惠 v2 開關：只看程式內建的 DEFAULT_CONFIG（編輯器存的設定改不動），
     或「localhost／127.0.0.1＋?sandbox=名稱＋&boonsv2=1」的隔離預覽。正式網址加任何參數都打不開。 */
  const V2_ON = ((((window.DEFAULT_CONFIG || {}).boss || {}).boonsV2 || {}).enabled === true) || (!!SANDBOX && /[?&]boonsv2=1(&|$)/.test(location.search));
  const $ = id => document.getElementById(id);

  /* ---------------- 工具函式 ---------------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = n => Math.floor(n).toLocaleString("en-US");
  /* ---------------- 開發者旗標 ----------------
     save.debug 的開關（顯示設定／顯示抽選／強制設定）存在存檔裡，
     而存檔會同步到雲端 → 以前忘記關的話，痕跡會跟著帳號跑到每一台裝置，
     而且沒有 ?dev=1 就打不開編輯模式去關它。
     v0.10.2：這些開關「只有在開發者模式底下才生效」。設定值照樣保留，
     正常玩的網址一律當作它們是關的，forceSetting 也不可能汙染正式數據。 */
  let devMode = false;
  const dbg = k => devMode && !!save.debug[k];
  const forcedSetting = () => (devMode ? (save.debug.forceSetting || 0) : 0);
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  /* ---------------- 可信台灣遊戲日（階段3B，2026-09-30） ----------------
     所有每日規則（設定、補給次數、委託板、觀測鏡）只看這裡，不再看裝置日期。
     同步：伺服器 game_clock() 給 server_now／game_day／next_reset_at；之後用 performance.now()（單調時鐘，改手機時間也不會動）往前推算。
     todayKey() 取不到可信日期時回傳 null——正式網址絕不退回裝置日期（擁有者 Q1＝A）。
     頁面開著、還沒到下一個台灣午夜時的短暫斷線照常可玩；過了午夜要重新同步成功才算有效。
     sandbox（只限 localhost）：用裝置時間當測試替身；測試可用 window.__MONO_SKEW__ 模擬時間經過。 */
  const TW_MS = 8 * 3600000, DAY_MS = 86400000;
  const LAST_DAY_KEY = "mine_last_day_v1" + SB;      // 上次確認過的台灣日期：只用來做「日期只能前進」與圖鑑／回憶的展示日期
  const mono = () => performance.now() + (SANDBOX ? (Number(window.__MONO_SKEW__) || 0) : 0);
  const twDay = ms => new Date(ms + TW_MS).toISOString().slice(0, 10);
  const twNextReset = ms => (Math.floor((ms + TW_MS) / DAY_MS) + 1) * DAY_MS - TW_MS;
  const clock = { base: null, syncing: null, lastOk: -Infinity, failKind: "", lastFail: null, hold: false, sandbox: false, resetTimer: null, retryTimer: null, lastTry: -Infinity };
  let lastTrustedDay = (typeof store.get(LAST_DAY_KEY) === "string" && store.get(LAST_DAY_KEY)) || "";
  const RESET_GRACE = 60000;   // 過了午夜 60 秒內還沒同步成功 → 視為日期未知
  function trustedNow() { return clock.base ? clock.base.server + (mono() - clock.base.mono) : null; }
  function clockValid() {
    if (!clock.base) return false;
    const now = trustedNow();
    if (now < clock.base.reset) return true;
    return now < clock.base.reset + RESET_GRACE && !(clock.lastFail !== null && clock.lastFail >= clock.base.reset);   // 午夜後的重新同步失敗了 → 未知
  }
  function todayKey() {
    if (!clockValid()) return null;
    const d = twDay(trustedNow());
    if (d > lastTrustedDay) { lastTrustedDay = d; store.set(LAST_DAY_KEY, d); }
    return d;
  }
  const dayOrLast = () => todayKey() || lastTrustedDay || "";   // 純展示（圖鑑首次發現、回憶取得日）：不擋收集
  const dailyOK = () => !!todayKey() && !clock.hold;             // 每日功能（補給、換板、觀測鏡）可用
  function clockUse(r, t0, t1) {   // 檢查一次同步結果 → 可用就回傳 base，否則回傳錯誤種類字串
    if (r && r.ok && r.sandbox) {
      if (!SANDBOX) return "bad";
      const now = Date.now();
      return { server: now, mono: t1, day: twDay(now), reset: twNextReset(now), sandbox: true };
    }
    if (!r || !r.ok) return (r && r.kind) || "server";
    if (t1 - t0 > 10000) return "slow";                    // 往返超過 10 秒：時間不可靠，丟棄
    const d = r.data || {}, s = Date.parse(d.server_now), rs = Date.parse(d.next_reset_at);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.game_day || "") || !isFinite(s) || !isFinite(rs) || rs <= s || twDay(s) !== d.game_day) return "bad";
    const known = clockValid() ? twDay(trustedNow()) : "";
    if (d.game_day < lastTrustedDay || (known && d.game_day < known)) return "bad";   // 日期只能前進
    return { server: s + (t1 - t0) / 2, mono: t1, day: d.game_day, reset: rs };
  }
  function clockSync() {
    if (clock.syncing) return clock.syncing;
    clock.failKind = "";   // 重試開始時，畫面恢復「正在確認」；失敗結果稍後會覆寫
    clock.syncing = (async () => {
      const t0 = mono();
      clock.lastTry = t0;
      let r;
      try { r = window.Cloud && Cloud.gameClock ? await Cloud.gameClock() : (SANDBOX ? { ok: true, sandbox: true } : { ok: false, kind: "server" }); }
      catch (e) { r = { ok: false, kind: "offline" }; }
      const wasDay = todayKey(), res = clockUse(r, t0, mono());
      clearTimeout(clock.retryTimer);
      if (typeof res === "object") {
        clock.base = res; clock.sandbox = !!res.sandbox; clock.lastOk = mono(); clock.failKind = ""; clock.lastFail = null;
        clearTimeout(clock.resetTimer);   // 台灣午夜後 1～20 秒隨機重新同步（分散請求）
        clock.resetTimer = setTimeout(clockSync, Math.max(1000, res.reset - trustedNow() + 1000 + Math.random() * 19000));
      } else {
        clock.failKind = res;
        clock.lastFail = trustedNow() ?? 0;
        if (!clockValid()) clock.retryTimer = setTimeout(clockSync, 15000);   // 日期未知：15 秒後自動再試（玩家也可按重試）
      }
      if (wasDay !== todayKey() || !wasDay) clockChanged();   // 變成有效／無效、換日、或仍在未知（更新確認中→失敗的提示）
      return typeof res === "object";
    })().finally(() => { clock.syncing = null; });
    return clock.syncing;
  }
  /* 每日動作（補給廣告、換板廣告、觀測鏡）之前：上次同步超過 10 分鐘就先同步，失敗就不開始 */
  async function clockFresh() {
    if (!clock.base || clock.hold || mono() - clock.lastOk > 600000) { if (!(await clockSync())) return false; }
    return dailyOK();
  }
  if (SANDBOX && typeof window.__GAME_CLOCK_STUB__ !== "function") {   // 測試替身：同步完成，第一次畫面就能玩
    const now = Date.now(), t = mono();
    clock.base = { server: now, mono: t, day: twDay(now), reset: twNextReset(now), sandbox: true }; clock.sandbox = true; clock.lastOk = t;
  }
  function pwHash(str) { // 密碼雜湊（不把密碼本身寫在程式裡）
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0).toString(36);
  }
  function seeded(str) { // 以字串產生固定亂數（同一天同一礦坑 → 同一個設定）
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  }
  function deepMerge(base, over) {
    if (Array.isArray(base) || typeof base !== "object" || base === null) return over === undefined ? base : over;
    const out = Array.isArray(over) ? over : { ...base };
    if (over && typeof over === "object" && !Array.isArray(over)) {
      for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }

  /* ---------------- 設定檔 ---------------- */
  let stored = store.get(CFG_KEY);
  if (!stored) { // 舊版設定檔：只沿用外觀（版面、顏色、圖片、文字），數值改用新版
    const old = store.get("mine_config_v3");
    if (old) { stored = {}; ["layout", "theme", "images", "texts", "gameTitle"].forEach(k => { if (old[k]) stored[k] = old[k]; }); }
  }
  /* 2026-09-30：非標準鎬子（紅岩鑽頭等，category 不是 pick）一律用程式內建定義。
     編輯器存的設定檔會整個蓋掉 tools 陣列 → 舊設定檔裡沒有這幾把、或被改過數值，都在這裡補回／還原。 */
  function normTools(c) {
    const fixed = (window.DEFAULT_CONFIG.tools || []).filter(t => t.category && t.category !== "pick");
    c.tools = (c.tools || []).filter(t => !fixed.some(f => f.id === t.id)).concat(clone(fixed));
    return c;
  }
  let config = normTools(deepMerge(clone(window.DEFAULT_CONFIG), stored || {}));

  /* ---------------- 存檔 ---------------- */
  function newSave() {
    return {
      v: 1, rev: 0, name: "", coins: 300, uid: 1,
      tools: [], equipped: null,
      ores: {}, dex: {},
      boss: newBoss(),
      unlocked: ["m1"], mineId: "m1",
      plays: {}, plays2: {}, today: { date: todayKey() || "", stats: {} },
      ads: { date: todayKey() || "", count: 0 }, pw: {},
      glass: { date: todayKey() || "", byMine: {} },
      adPending: null, adDone: [], boardCredits: 0,
      senpai: newSenpai(),
      auto: false, debug: { showSetting: false, forceSetting: 0 }
    };
  }
  const BV = window.BoonsV2;
  /* 2026-09-30 擁有者決定 Q1＝A：v2 沒開（正式 enabled:false）時，新存檔用舊版 boss 結構，
     不預寫 schema／epoch／tiers／rewardLv／pending；只有 V2_ON 才用 v2 結構。 */
  const newBoss = () => (V2_ON ? BV.newBoss() : { favor: 0, level: 1, boons: [], req: null, total: 0 });
  /* 恩惠 v2 遷移：三個入口（本機載入、雲端接回、編輯器匯入）都走這裡。
     第一次遷移前把「整份原始存檔」加進 BOON_BACKUP_KEY 的備份集合（每位玩家／每份存檔各一筆，不覆蓋）。
     失敗不清檔：保留原資料、v2 效果全部當 0 階、提示玩家。 */
  let boonFail = false;
  const acctTag = () => { try { const u = window.Cloud && Cloud.user && Cloud.user(); return u && u.id ? "u" + pwHash("acct|" + u.id) : "anon"; } catch (e) { return "anon"; } };
  function boonBackup(raw, src) {
    const all = store.get(BOON_BACKUP_KEY);
    const box = all && all.entries && typeof all.entries === "object" ? all : { entries: {} };
    const id = `${acctTag()}-${pwHash(JSON.stringify(raw))}`;   // 帳號雜湊＋內容雜湊（來源另存在 src）：同一份內容不論從哪裡載入都只備份一次
    if (box.entries[id]) return id;                     // 同一份存檔已備份過：不覆蓋
    box.entries[id] = { at: new Date().toISOString(), src, save: raw };
    if (!store.set(BOON_BACKUP_KEY, box)) throw new Error("備份寫入失敗（瀏覽器空間不足）");   // 備份失敗就不遷移
    return id;
  }
  /* 里程碑的本機領取紀錄（存檔以外）：{ 帳號雜湊: { redrockTrial: [已領的 epoch...] } }。
     用來擋「同一台裝置」的另一個分頁、或接回還沒領過的舊雲端檔再領一次。只有 v2 開啟才讀寫。
     跨裝置／清除瀏覽器資料擋不住 → 發布前需要伺服器 claim 紀錄（階段4，見 RELEASE_GATE）。 */
  const MS_LEDGER_KEY = "mine_milestone_ledger_v1" + SB;
  function msKnown(id, epoch) {   // 目前帳號的紀錄＋「未登入時」的紀錄（未登入領完再登入上傳的是同一份存檔）
    const all = store.get(MS_LEDGER_KEY) || {};
    return [acctTag(), "anon"].some(tag => { const m = all[tag] || {}; return Array.isArray(m[id]) && m[id].includes(epoch); });
  }
  function msGuard(id, epoch) {   // 領取前最後檢查（讀最新的 localStorage，另一個分頁剛領也看得到），通過就先寫紀錄
    if (msKnown(id, epoch)) return false;
    const all = store.get(MS_LEDGER_KEY) || {}, tag = acctTag(), mine = all[tag] = all[tag] || {};
    mine[id] = (Array.isArray(mine[id]) ? mine[id] : []).concat([epoch]);
    if (!store.set(MS_LEDGER_KEY, all)) throw new Error("領取紀錄寫入失敗（瀏覽器空間不足）");
    return true;
  }
  /* 階段4-2：把「srv:false」（未登入或連不上雲端時領的）里程碑補登到雲端領取紀錄（docs/16）。
     ok／already／stale 都算處理完（already＝別處也領過；已經發了就不收回，記 dup 供日後盤點）；連線失敗就停，下次再補。 */
  let msSyncBusy = false;
  async function msSync() {
    if (msSyncBusy || !cloudOn() || cloudBlocked || !v2() || !Cloud.claimMilestone) return;
    const ms = save.boss && save.boss.milestones;
    const ids = ms ? Object.keys(ms).filter(id => ms[id] && ms[id].srv === false && ms[id].at) : [];
    if (!ids.length) return;
    msSyncBusy = true;
    let changed = false;
    try {
      for (const id of ids) {
        const rec = ms[id], sr = await Cloud.claimMilestone(id, rec.epoch, true);
        if (!sr.ok) break;
        if (save.boss.milestones !== ms || ms[id] !== rec) break;   // 等待期間換了存檔
        rec.srv = true; if (sr.result === "already") rec.dup = true; changed = true;
      }
    } finally { msSyncBusy = false; }
    if (changed) persist(true);
  }
  function fixBoss(sv, src) {
    /* v2 關閉：零遷移、零備份。只做舊版原本就有的「沒有 boss 就補一個」，其他欄位一個都不碰。 */
    if (!V2_ON) { if (!sv.boss) sv.boss = newBoss(); boonFail = false; return; }
    try {
      if (SANDBOX && /[?&]failmig=1/.test(location.search)) throw new Error("測試：強制遷移失敗");
      const raw = JSON.parse(JSON.stringify(sv));
      if (sv.boss && sv.boss.schema !== 2) boonBackup(raw, src || "local");   // 先備份成功，才動資料
      BV.fix(sv, config, null, msKnown);
      boonFail = false;
    } catch (e) {
      boonFail = true;
      console.error("恩惠資料轉換失敗：" + (e && e.message));
      setTimeout(() => toast("恩惠資料轉換失敗：進度已保留，恩惠效果暫停"), 300);
    }
  }
  /* v0.10.11：三位前輩的永久信賴進度。
     跟 plays2（離開礦坑就刪）分開放，才不會一離開就歸零。
     wins＝談話成功次數、memories＝已取得的珍貴回憶（{date}）、story＝還沒看完的回憶 {boss, step}。
     舊存檔沒有個別紀錄，since 記下「從哪一版開始算」，不回推。 */
  function newSenpai() { return { since: window.GAME_VERSION || "", wins: { a: 0, b: 0, c: 0 }, memories: {}, story: null }; }
  function fixSenpai(sv) {
    const S = sv.senpai && typeof sv.senpai === "object" ? sv.senpai : (sv.senpai = newSenpai());
    if (!S.wins || typeof S.wins !== "object") S.wins = {};
    ["a", "b", "c"].forEach(k => { S.wins[k] = Math.max(0, Math.floor(Number(S.wins[k]) || 0)); });
    if (!S.memories || typeof S.memories !== "object") S.memories = {};
    if (S.story && !(S.story.boss && Number.isFinite(S.story.step))) S.story = null;
    if (S.story && S.memories[S.story.boss]) S.story = null;   // 已經拿過就不再演
    if (S.since === undefined) S.since = window.GAME_VERSION || "";
    return S;
  }
  let save = store.get(SAVE_KEY);
  let needStarter = false;
  if (!save || save.v !== 1) { save = newSave(); needStarter = true; }
  save.auto = false;
  if (!save.plays2) save.plays2 = {};
  if (!save.pw) save.pw = {};
  fixSenpai(save);
  fixBoss(save, "local");
  fixAds(save);
  delete save.upgrades;
  /* v0.10.3：存檔一律「立即寫入」。
     舊版是 400ms debounce，但自動挖礦間隔 350ms < 400ms，clearTimeout 會一直把寫入往後推，
     結果只要自動還在跑，存檔就永遠不會落地 → 中途關網頁／當機，整段自動揮全部回滾重抽。
     實測 16.8KB 的存檔寫一次只要 0.34ms，佔 350ms 的 0.1%，沒有效能理由要延遲。
     雲端上傳仍然保留 5 秒 debounce（那個是網路請求，不能每揮都打）。 */
  function persist() {
    store.set(SAVE_KEY, save);
    cloudLater();
  }

  /* ---------------- 雲端存檔（自動同步） ---------------- */
  const CLOUD_DELAY = 5000;      // 最後一次動作之後幾毫秒才上傳（避免每一揮都打伺服器）
  /* 2026-09-29：最長等待。自動挖掘每 ~300ms 存一次，單純 debounce 會讓 5 秒計時器永遠被往後推，
     持續自動時雲端一直不上傳。現在「變髒」後最晚 30 秒一定嘗試上傳一次；本機 localStorage 照舊每次立即寫入。 */
  const CLOUD_MAX_WAIT = 30000;
  let cloudTimer = null, cloudBusy = false, cloudDirty = false, cloudDirtySince = 0;
  /* 階段4（docs/15）：雲端拒收（"epoch"＝這台是恩惠重置前的舊存檔／"version"＝遊戲版本太舊）。
     拒收後停止自動上傳，直到玩家接回雲端存檔、登出或重新整理；本機存檔照常寫入、不清除。 */
  let cloudBlocked = null;
  const cloudOn = () => !!(window.Cloud && Cloud.enabled() && Cloud.status() !== "out");
  const epochOf = sv => { const e = Number(sv && sv.boss && sv.boss.epoch); return Number.isFinite(e) && e > 0 ? Math.floor(e) : 0; };
  const staleVs = row => !!(row && row.data && epochOf(save) < epochOf(row.data));   // 這台的恩惠世代比雲端舊 → 不能「用這台的」
  function cloudLater() {
    if (!cloudOn() || cloudBlocked) return;
    if (!cloudDirty || !cloudDirtySince) cloudDirtySince = Date.now();
    cloudDirty = true;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(cloudPush, Math.max(0, Math.min(CLOUD_DELAY, cloudDirtySince + CLOUD_MAX_WAIT - Date.now())));
  }
  async function cloudPush(opt) {
    if (!cloudOn()) return;
    if (cloudBlocked) { clearTimeout(cloudTimer); return { ok: false, blocked: cloudBlocked, err: Cloud.error() }; }
    if (cloudBusy) { clearTimeout(cloudTimer); cloudTimer = setTimeout(cloudPush, 1000); return; }   // 上一次還沒回來：稍後再試，不丟掉這次
    cloudBusy = true; cloudDirty = false; cloudDirtySince = 0;
    const r = await Cloud.push(save, opt);
    cloudBusy = false;
    renderCloud();
    if (!r.ok) { cloudDirty = true; cloudDirtySince = Date.now(); }
    if (r.blocked) { cloudBlocked = r.blocked; clearTimeout(cloudTimer); stopAuto(); showBlocked(); return r; }
    if (r.ok) msSync();   // 上傳成功＝連得上雲端 → 順便補登里程碑領取紀錄
    /* v0.10.3：雲端已經被別台裝置寫過 → 停下來問玩家，不默默覆蓋也不默默放棄 */
    if (r.conflict && r.remote) { clearTimeout(cloudTimer); stopAuto(); showConflict(r.remote); }
    return r;
  }
  /* 兩台裝置撞在一起時的處理畫面 */
  let conflictOpen = false;
  function showConflict(row) {
    if (conflictOpen) return;
    conflictOpen = true;
    const stale = staleVs(row);
    const when = row.updated_at ? new Date(row.updated_at).toLocaleString() : "—";
    const box = $("modalBox");
    box.innerHTML = `<div style="color:#ff5555">存檔撞到了</div>
      <div class="sub" style="margin-top:6px;text-align:left">
        你在別的裝置（或另一個分頁）也玩了這個帳號，雲端的存檔比這台新。${stale ? "" : `<br>
        <b>兩邊只能留一邊</b>，沒選到的會被覆蓋掉。`}
      </div>
      <div class="sub" style="margin-top:8px;text-align:left">
        <b>雲端</b>：${esc(row.name || "（無名）")}　$${fmt(row.coins || 0)}<br>
        <span class="sub">最後存檔 ${when}</span><br><br>
        <b>這台</b>：${esc(save.name || "（無名）")}　$${fmt(save.coins)}
      </div>
      ${stale ? STALE_NOTE : ""}
      <div class="btns"><button class="px-btn" id="cfCloud">用雲端的</button>${stale ? "" : `<button class="px-btn" id="cfLocal">用這台的</button>`}</div>`;
    $("modal").classList.remove("hidden");
    $("cfCloud").onclick = () => {
      $("modal").classList.add("hidden"); conflictOpen = false;
      if (!row.data || row.data.v !== 1) return toast("雲端存檔格式不對");
      if (stale) staleBackup("conflict");
      adoptSave(row);
      toast("已接回雲端存檔");
    };
    if (stale) return;
    $("cfLocal").onclick = async () => {
      $("modal").classList.add("hidden"); conflictOpen = false;
      const r = await Cloud.pushOver(save, row.rev);
      renderCloud();
      if (r && r.blocked) { cloudBlocked = r.blocked; showBlocked(); return; }
      toast(r && r.ok ? "已用這台的存檔覆蓋雲端" : "上傳失敗");
    };
  }
  const STALE_NOTE = `<div class="sub" style="color:#ffcc33;margin-top:8px;text-align:left">這台的存檔是佐佐木恩惠重新整理<b>之前</b>的舊資料，不能再蓋回雲端，只能用雲端的。這台原本的存檔會先另外備份在這台裝置。</div>`;
  /* 接回雲端前，把這台的舊存檔另存一份（最多留 3 份，最新在前）；永遠不直接丟掉本機進度 */
  const STALE_KEY = "mine_stale_save_backup_v1" + SB;
  function staleBackup(why) {
    const list = store.get(STALE_KEY);
    const box = (Array.isArray(list) ? list : []).slice(0, 2);
    box.unshift({ at: new Date().toISOString(), why, ver: window.GAME_VERSION || "", save: JSON.parse(JSON.stringify(save)) });
    if (!store.set(STALE_KEY, box)) console.warn("舊存檔備份寫入失敗（瀏覽器空間不足）");
  }
  /* 雲端拒收畫面（docs/15）：epoch → 只能用雲端的；version → 請重新整理更新遊戲（也可以先用雲端的） */
  let blockedOpen = false;
  async function showBlocked() {
    if (blockedOpen || !cloudBlocked) return;
    blockedOpen = true;
    const kind = cloudBlocked;
    let row = null, pullErr = false;
    try { row = await Cloud.pull(); } catch (e) { pullErr = true; }
    const okRow = !!(row && row.data && row.data.v === 1);
    const head = kind === "version"
      ? `<div style="color:#ff5555">遊戲版本太舊</div>
         <div class="sub" style="margin-top:6px;text-align:left">雲端現在只收新版遊戲的存檔，這台還在跑舊版，所以<b>暫停上傳</b>。<br>
         請按「重新整理」更新遊戲；如果重新整理後還是這個畫面，請把分頁整個關掉再打開。<br>
         這台的存檔還在，不會消失。</div>`
      : `<div style="color:#ff5555">這台的存檔不能再上傳</div>
         <div class="sub" style="margin-top:6px;text-align:left">佐佐木的恩惠已經重新整理過，雲端存的是新的存檔；這台裝置上的是整理<b>之前</b>的舊資料，所以雲端不收。<br>
         請按「用雲端的」接回新存檔。這台原本的存檔會先另外備份在這台裝置，不會直接刪掉。</div>`;
    const cloudInfo = okRow
      ? `<div class="sub" style="margin-top:8px;text-align:left"><b>雲端</b>：${esc(row.name || "（無名）")}　$${fmt(row.coins || 0)}<br>
         <span class="sub">最後存檔 ${row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}</span></div>`
      : `<div class="sub" style="margin-top:8px;color:#ffcc33">${pullErr ? "現在讀不到雲端存檔，請確認網路後按「再試一次」。" : "雲端沒有可用的存檔。"}</div>`;
    $("modalBox").innerHTML = head + cloudInfo + `<div class="btns">
      ${okRow ? `<button class="px-btn" id="bkCloud">用雲端的</button>` : `<button class="px-btn" id="bkRetry">再試一次</button>`}
      ${kind === "version" ? `<button class="px-btn" id="bkReload">重新整理</button>` : ""}</div>`;
    $("modal").classList.remove("hidden");
    const close = () => { $("modal").classList.add("hidden"); blockedOpen = false; };
    const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
    on("bkCloud", () => { close(); staleBackup(kind); adoptSave(row); toast("已接回雲端存檔"); });
    on("bkRetry", () => { close(); showBlocked(); });
    on("bkReload", () => { store.set(SAVE_KEY, save); location.reload(); });
  }
  /* 採用雲端那一份（登入時二選一、衝突時都走這裡） */
  function adoptSave(row) {
    cloudBlocked = null;   // 接回雲端（世代跟雲端一致）→ 解除拒收暫停；若仍被拒，下次上傳會再擋下來
    save = row.data;
    save.rev = Number(row.rev || 0);
    save.auto = false;
    if (!save.plays2) save.plays2 = {};
    if (!save.pw) save.pw = {};
    fixSenpai(save);
    fixBoss(save, "cloud");
    fixAds(save);
    fixToolDur();
    storyFresh = false;
    store.set(SAVE_KEY, save);
    adLeftover();   // 雲端那份帶著待完成廣告 → 視同關頁重開：取消、同日退回
    renderAll();
  }
  function cloudFlush() {           // 關網頁／切到背景時立刻補一次
    if (!cloudOn() || !cloudDirty) return;
    clearTimeout(cloudTimer);
    cloudPush({ keepalive: true });
  }
  window.addEventListener("pagehide", cloudFlush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") cloudFlush(); });

  /* ---------------- 查詢 ---------------- */
  const toolDef = id => config.tools.find(t => t.id === id);
  /* 標準鎬子（category:"pick"）：商店、掉落、地圖建議、效率基準、觀測鏡價、信箱、編輯器只看這五把 */
  const isStd = id => BV.toolCat(config, id) === "pick";
  const stdTools = () => config.tools.filter(t => isStd(t.id));
  const stdOfTier = tier => stdTools().find(t => t.tier === tier);
  const mineDef = id => config.mines.find(m => m.id === id);
  const curMine = () => mineDef(save.mineId) || config.mines[0];
  const catDef = id => config.categories.find(c => c.id === id);
  const rarityColor = r => (config.rarities[r] || config.rarities[0]).color;
  function totalPlays() { return save.tools.reduce((a, t) => a + t.dur, 0); }

  /* ---------------- 恩惠（老闆給的永久加成） ---------------- */
  const RARITY_NAME = ["普通", "藍", "紫", "金"];
  const BOON_COLOR = r => rarityColor([1, 3, 4, 5][r]);
  function boonCount(id, target) {
    if (v2()) return 0;   // v2 開啟：舊恩惠全部不生效（資料照樣保留）
    return save.boss.boons.filter(b => b.id === id && (target === undefined || b.target === target)).length;
  }
  const boonVal = id => ((config.boss.boons[id] || {}).v || 0);
  /* v2 開啟時，舊恩惠（陣列疊加）一律視為 0：favorUp／toolDrop／reqQty／adWood／adStone／各種售價加成都停用 */
  const boonSum = (id, target) => (v2() ? 0 : boonCount(id, target) * boonVal(id));
  /* 恩惠 v2：四種各 0～5 階。v2Rate("sell") → 0.06 之類的比例；遷移失敗時全部當 0 */
  const v2 = () => V2_ON;
  const v2Rate = k => (v2() && !boonFail ? BV.rate(config, k, BV.tier(save.boss, config, k)) : 0);
  /* v2：只有工具標了 boonDurability／boonDiscount 才套恩惠（未來付費／特殊工具預設不套，見 config.tools 註解） */
  function toolMax(id) { const d = toolDef(id), ok = BV.toolFlag(config, id, "boonDurability"); return v2() ? BV.toolMax(d.durability, ok ? v2Rate("toolDur") : 0) : Math.round(d.durability * (1 + (ok ? boonSum("toolDur") : 0))); }   // 紅岩鑽頭等旗標 false：新舊耐久恩惠都不套
  function sellBonus(name, rarity) {
    return v2() ? 1 + v2Rate("sell") : 1 + boonSum("allSell") + boonSum("oreSell", name) + boonSum("raritySell", rarity);
  }
  const toolPrice = t => (v2() ? BV.toolPrice(t.price, BV.toolFlag(config, t.id, "boonDiscount") ? v2Rate("toolCut") : 0) : Math.max(1, Math.round(t.price * Math.max(0.1, 1 - boonSum("shopCut")))));
  const autoWait = () => { const base = (config.play && config.play.autoInterval) || 350; return v2() ? BV.autoInterval(base, v2Rate("autoSpeed")) : base / (1 + boonSum("autoSpeed")); };
  /* 出售金額：v2 是「整筆基本總價 × 加成」最後一次取整到 0.1（低價礦石每階都有感）；舊版維持每顆先取整。
     list = [[礦石名, 數量], ...] */
  function sellTotal(list) {
    if (!v2()) return Math.round(list.reduce((a, [n, c]) => a + itemPrice(n) * c, 0) * 10) / 10;
    return BV.sellTotal(list.reduce((a, [n, c]) => a + basePrice(n) * c, 0), v2Rate("sell"));
  }
  // 工具效率：低階工具挖高階礦坑 → 收益打折（公式 A）
  function toolFactor(tool, mine) {
    const d = toolDef(tool.id); if (!d || !isStd(d.id) || d.tier >= mine.tier) return 1;   // 非標準工具（紅岩鑽頭）：每座礦坑都是正常效率，不打折也不加成
    const need = stdOfTier(mine.tier); if (!need) return 1;
    const f = (d.price / d.durability) / (need.price / need.durability) * ((config.toolPenalty || {}).underMul ?? 0.9);
    return Math.min(1, f);
  }
  const money = n => { const v = Math.round(n * 10) / 10; return v % 1 ? v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : v.toLocaleString("en-US"); };
  const money2 = n => (Math.round(n * 100 + 1e-7) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });   // 單價顯示到 0.01（v2 加價後）

  // 物品名稱 → 屬於哪座礦坑、哪個小役
  function itemIndex() {
    const idx = {};
    config.mines.forEach(m => config.categories.forEach(c => {
      (m.items[c.id] || []).forEach(name => { idx[name] = { mine: m, cat: c, vein: false }; });
      ((m.veinItems || {})[c.id] || []).forEach(name => { idx[name] = { mine: m, cat: c, vein: true }; });
    }));
    return idx;
  }
  function basePrice(name) {
    const m2 = (config.machine2 || {}).prices || {};
    if (m2[name] !== undefined) {
      const mine = config.mines.find(m => m.engine === 2) || {};
      return Math.round(m2[name] * (mine.mult || 1) * 10) / 10;
    }
    const it = itemIndex()[name]; if (!it) return 0;
    const base = it.vein ? (it.cat.veinValue ?? it.cat.value) : it.cat.value;
    return Math.round(base * it.mine.mult * 10) / 10;
  }
  function itemPrice(name) { // 含恩惠加成（v2：只給畫面顯示單價用，實際出售金額以 sellTotal 整筆計算）
    const it = itemIndex()[name]; if (!it) return 0;
    if (v2()) return Math.round(basePrice(name) * sellBonus(name, it.cat.rarity) * 100 + 1e-7) / 100;
    return Math.round(basePrice(name) * sellBonus(name, it.cat.rarity) * 10) / 10;
  }

  function todaySetting(mineId) {
    const f = forcedSetting();
    if (f) return f;
    const k = todayKey(); if (!k) return null;   // 日期未知：沒有設定（揮擊入口已先擋下，這裡只會是除錯顯示）
    const r = seeded(k + "|" + mineId);
    let acc = 0; const dist = config.rules.settingDist;
    for (let i = 0; i < dist.length; i++) { acc += dist[i]; if (r < acc) return i + 1; }
    return 1;
  }
  /* ---------------- 礦脈觀測鏡（v0.10.6） ----------------
     玩家畫面只看得到礦脈現象、等級下限與 E〜S 完整礦紋，看不到內部數值 1〜6。
     傾向類（孤脈／雙脈／深層微光／強烈共鳴）可能失準；
     等級下限（geD/geC/geB/geA）與完整礦紋徽章必定為真。
     每座礦坑每天最多 dailyMax 次，價格逐次 ×repeatMul，跨日自動重置。
     紀錄格式：save.glass.byMine[礦坑id] = [{ k:"reso" } | { k:"badge", g:內部值-1 }, ...] */
  function glassCfg() { return config.glasses || {}; }
  // 觀測資料的格式版本。玩家存檔裡的 v 不等於這個值，就整包清掉。
  const GLASS_V = 2;
  let glassWiped = false;
  function glassState() {
    const k = todayKey();
    if (!k) { if (!save.glass) save.glass = { v: GLASS_V, date: "", byMine: {} }; return save.glass; }   // 日期未知：不換日、不清紀錄
    if (!save.glass || save.glass.date !== k) save.glass = { v: GLASS_V, date: k, byMine: {} };
    glassWipeOld(save.glass);
    return save.glass;
  }
  /* v0.10.5「探礦眼鏡」的舊紀錄一律清除（擁有者決定：不轉換、不退錢）。
     舊存檔沒有 v 欄位，或裡面還留著字串格式的句子，都視為舊資料。
     線上已經有玩家用過舊功能，所以雲端下載回來的存檔也會走到這裡。 */
  function glassWipeOld(st) {
    const old = st.v !== GLASS_V ||
      Object.keys(st.byMine || {}).some(id => (st.byMine[id] || []).some(e => typeof e === "string"));
    if (!old) return;
    const had = Object.keys(st.byMine || {}).some(id => (st.byMine[id] || []).length);
    st.v = GLASS_V; st.byMine = {};
    try { persist(); } catch (_) { }   // 立刻落地，免得舊資料又從雲端／重整回來
    if (had && !glassWiped) {
      glassWiped = true;
      setTimeout(() => toast("觀測鏡換新了，今天的舊紀錄已清除，可以重新觀測"), 400);
    }
  }
  function glassSeen(mineId) { return glassState().byMine[mineId] || []; }
  function glassPrice(mineId) {
    const g = glassCfg(), m = mineDef(mineId);
    const tl = stdOfTier(m.tier) || stdTools()[0];
    return Math.round(tl.price * (g.priceMul ?? 2) * Math.pow(g.repeatMul ?? 2, glassSeen(mineId).length));
  }
  // stage 由 1 起算。先擲完整礦紋，沒中再依 weights 抽一般結果。
  function glassDraw(setting, stage, rnd) {
    const g = glassCfg(), R = rnd || Math.random;
    const bRate = (g.badgeRate || [])[stage - 1] || 0;
    if (R() * 100 < bRate) return { k: "badge", g: setting - 1 };
    const tbl = ((g.weights || {})[setting] || [])[stage - 1] || {};
    const keys = Object.keys(tbl);
    let sum = 0; keys.forEach(k => sum += tbl[k]);
    let x = R() * sum;
    for (const k of keys) if ((x -= tbl[k]) < 0) return { k };
    return { k: keys[0] || "silent" };
  }
  function glassResult(e) { // → { name, icon, color, line, badge }
    const g = glassCfg();
    if (e.k === "badge") {
      const b = (g.badges || [])[e.g] || { g: "?", color: "#fff", line: "" };
      return { name: "完整礦紋　" + b.g + "級", icon: b.g, color: b.color, line: b.line, badge: true };
    }
    const r = (g.results || {})[e.k] || { name: e.k, icon: "?", color: "#fff", line: "" };
    return { name: r.name, icon: r.icon, color: r.color, line: r.line, badge: false };
  }
  /* ---- 觀測專屬畫面（v0.10.7）----
     流程：選礦坑 → 按「開始觀測」扣款 → 轉動鏡片（點 3 下，也會自動推進）→ 揭曉 → 進今日紀錄。
     scopeMine：目前看的礦坑；scopePhase："idle" | "focus" | "done" */
  let scopeMine = null, scopePhase = "idle", scopeTurns = 0, scopePending = null, scopeTimer = null, scopeFrame = 0;
  const SCOPE_FRAMES = ["◍", "◎", "◉", "◎"];
  const SCOPE_TURNS = 3;

  function scopeMines() { return config.mines.filter(m => save.unlocked.includes(m.id)); }
  function scopeReset() {
    // 已經付錢但還在轉鏡片的那一次，一定要先落地，否則切礦坑／離開畫面等於白花錢
    if (scopePhase === "focus" && scopePending && scopeMine) { scopeRecord(); persist(); }
    clearTimeout(scopeTimer); scopeTimer = null;
    scopePhase = "idle"; scopeTurns = 0; scopePending = null; scopeFrame = 0;
  }
  let scopeTalk = "";   // 打開觀測鏡時佐佐木說的一句（固定，不因重繪重抽）
  function openScope(mineId) {
    scopeReset();
    scopeTalk = tline("glass");
    const list = scopeMines();
    scopeMine = mineId || scopeMine || (list[0] || {}).id;
    if (!list.some(m => m.id === scopeMine)) scopeMine = (list[0] || {}).id;
    go("scope");
  }
  function renderScope() {
    const g = glassCfg(), list = scopeMines();
    if (!list.length) { $("scopeMines").innerHTML = '<div class="sub">還沒有解鎖任何礦坑。</div>'; return; }
    if (!scopeMine || !list.some(m => m.id === scopeMine)) scopeMine = list[0].id;
    /* 2026-10-03：購買當下就已寫入紀錄（防重整只扣錢不記次數）；轉鏡中先把這一筆藏起來，揭曉後才顯示 */
    const all = glassSeen(scopeMine), hide = scopePhase === "focus" && scopePending && scopePending.mine === scopeMine ? 1 : 0;
    const m = mineDef(scopeMine), seen = all.slice(0, all.length - hide), n = seen.length;
    const max = g.dailyMax ?? 5, full = all.length >= max, pr = glassPrice(scopeMine);

    $("scopeSub").textContent = `每座礦坑每天 ${max} 次｜每再看一次 ×${g.repeatMul ?? 2} 價`;
    $("scopeMines").innerHTML = list.map(x =>
      `<button data-scope-mine="${x.id}" class="${x.id === scopeMine ? "on" : ""}">${x.name}
        <span class="sub">${(glassSeen(x.id).length) || 0}/${max}</span></button>`).join("");

    // 鏡片區
    const ring = $("scopeRing"), icon = $("scopeIcon");
    ring.className = "scope-ring" + (scopePhase === "focus" ? " focus" : "");
    if (scopePhase === "focus") {
      ring.style.color = "";   // 讓 .focus 的青色生效（上一次結果的顏色不要殘留）
      icon.textContent = SCOPE_FRAMES[scopeFrame % SCOPE_FRAMES.length];
      icon.style.color = "#7fe3ff";
      $("scopeName").textContent = (g.stages || [])[n] || "觀測中";
      $("scopeName").style.color = "#7fe3ff";
      $("scopeSay").textContent = `點擊鏡片轉動焦距……（${scopeTurns}/${SCOPE_TURNS}）`;
    } else if (scopePhase === "done" && scopePending) {
      const r = glassResult(scopePending.e);
      ring.className = "scope-ring done" + (r.badge ? " badge" : "");
      ring.style.color = r.color;
      icon.textContent = r.icon; icon.style.color = r.color;
      icon.style.textShadow = r.badge ? "0 0 14px " + r.color : "none";
      $("scopeName").textContent = `${r.name}`;
      $("scopeName").style.color = r.color;
      $("scopeSay").textContent = r.line;
    } else {
      ring.style.color = ""; icon.style.textShadow = "none";
      icon.textContent = "◎"; icon.style.color = "#6a6a78";
      const last = n ? glassResult(seen[n - 1]) : null;
      $("scopeName").textContent = m.name;
      $("scopeName").style.color = rarityColor(m.tier);
      $("scopeSay").textContent = full ? "鏡片已經到極限了。今天它不會再開口。"
        : last ? last.line : scopeTalk ? `${B().name}：「${scopeTalk}」` : pickOne(g.openLines || ["……要看礦脈？"]);
    }

    // 控制列
    $("scopeCtrl").innerHTML = scopePhase === "focus"
      ? `<button class="px-btn" id="scopeSkip">直接看結果</button>`
      : `<button class="px-btn gold" id="scopeGo" ${full || save.coins < pr || scopePhase === "done" || !dailyOK() ? "disabled" : ""}>
           ${!dailyOK() ? "確認日期後可使用" : full ? "已到極限" : `${(g.stages || [])[n] || "觀測"}　$${fmt(pr)}`}</button>
         <button class="px-btn" id="scopeBack">回老闆那裡</button>`;

    // 今日紀錄
    $("scopeCount").textContent = n ? `${n}/${max} 次` : "";
    $("scopeList").innerHTML = n ? seen.map((e, i) => {
      const r = glassResult(e);
      return `<div class="row scope-row"><div class="n">第${i + 1}次</div>
        <div class="ic${r.badge ? " badge" : ""}" style="color:${r.color}">${r.icon}</div>
        <div class="grow"><span style="color:${r.color};font-weight:bold">${r.name}</span>
          <div class="sub">${(g.stages || [])[i] || ""}｜${r.line}</div></div></div>`;
    }).join("") : '<div class="sub">今天還沒觀測這座礦坑。</div>';
  }

  /* 把這次觀測結果寫進「購買那天」的紀錄（擁有者 Q5＝B 同理）。轉鏡中跨過台灣午夜 → 舊的一天已結束，不寫進新一天
     2026-10-03 起購買當下就寫入（recorded:true），這裡只處理舊流程留下的未寫入情況 */
  function scopeRecord() {
    const st = glassState();
    if (scopePending && scopePending.recorded) {   // 已在購買那天的紀錄裡；跨午夜只需提醒
      if (st.date !== scopePending.day) { toast("觀測中跨過午夜：這次結果算在昨天，不計入今天的紀錄", 4000); return false; }
      return true;
    }
    if (st.date !== scopePending.day) { toast("觀測中跨過午夜：這次結果算在昨天，不計入今天的紀錄", 4000); return false; }
    (st.byMine[scopeMine] || (st.byMine[scopeMine] = [])).push(scopePending.e);
    return true;
  }
  async function scopeBuy() {
    const g = glassCfg(), max = g.dailyMax ?? 5;
    if (scopePhase !== "idle") return;
    if (!(await clockFresh())) { toast("確認日期後可使用"); renderScope(); return; }
    if (scopePhase !== "idle") return;
    if (glassSeen(scopeMine).length >= max) { toast("鏡片已經到極限了"); return; }
    const pr = glassPrice(scopeMine);
    if (save.coins < pr) { toast("錢不夠"); return; }
    save.coins -= pr;
    const st = glassState();
    const list = st.byMine[scopeMine] || (st.byMine[scopeMine] = []);
    const stage = list.length + 1;
    scopePending = { e: glassDraw(todaySetting(scopeMine), stage), stage, day: st.date, mine: scopeMine, recorded: true };
    list.push(scopePending.e);   // 扣錢與記次數同一次存檔：轉鏡中重新整理也不會只扣錢（2026-10-03）
    scopePhase = "focus"; scopeTurns = 0; scopeFrame = 0;
    persist(); renderScope(); renderHud();
    // 佐佐木的階段台詞
    const lines = (g.stageLines || [])[stage - 1];
    if (lines) setTimeout(() => { if (scopePhase === "focus") { $("scopeSay").textContent = pickOne(lines); } }, 260);
    scopeSpin();
  }
  function scopeSpin() { // 鏡片自轉；玩家點擊可以加快
    clearTimeout(scopeTimer);
    scopeTimer = setTimeout(() => {
      if (scopePhase !== "focus") return;
      scopeFrame++;
      $("scopeIcon").textContent = SCOPE_FRAMES[scopeFrame % SCOPE_FRAMES.length];
      if (scopeFrame >= SCOPE_TURNS * 6) { scopeSettle(); return; }   // 沒人點也會自己揭曉
      scopeSpin();
    }, Math.max(60, Math.round((glassCfg().revealMs ?? 1000) / 8)));
  }
  function scopeTap() {
    if (scopePhase !== "focus") return;
    scopeTurns++;
    $("scopeRing").classList.add("focus");
    $("scopeSay").textContent = `點擊鏡片轉動焦距……（${Math.min(scopeTurns, SCOPE_TURNS)}/${SCOPE_TURNS}）`;
    if (scopeTurns >= SCOPE_TURNS) scopeSettle();
  }
  function scopeSettle() {
    if (scopePhase !== "focus" || !scopePending) return;
    clearTimeout(scopeTimer); scopeTimer = null;
    scopeRecord();
    scopePhase = "done";
    persist(); renderScope(); renderHud();
    setTimeout(() => { if (scopePhase === "done") { scopeReset(); renderScope(); } }, 2600);
  }

  function checkDay() {
    const k = todayKey();
    if (!k) return;   // 日期未知：不換日、不重置次數
    if (save.today.date !== k) save.today = { date: k, stats: {} };
    if (save.ads.date !== k) save.ads = { date: k, count: 0 };
  }
  function mineStats(id) {
    return save.today.stats[id] || (save.today.stats[id] = { swings: 0, hits: 0, epic: 0, normalSwings: 0 });
  }

  /* ---------------- 工具 ---------------- */
  function addTool(id, ratio) {
    const max = toolMax(id);
    const t = { uid: save.uid++, id, dur: Math.max(1, Math.round(max * ratio)), max };
    save.tools.push(t);
    return t;
  }
  /* 2026-10-02 恩惠重置後：舊恩惠「新工具耐久」做出來的鎬子，存檔裡的 max 仍比標準高。
     每次載入／接回雲端／匯入都把可套耐久恩惠的工具夾回「目前應有的上限」（toolMax，含目前 v2 耐久階級）；
     目前耐久超過新上限就切到上限。只會往下修：之後靠新版恩惠合法變高的鎬子不受影響（同一世代階級只增不減）。回傳是否有修改。 */
  function fixToolDur() {
    if (!v2() || boonFail || !Array.isArray(save.tools)) return false;
    let n = 0;
    save.tools.forEach(t => {
      if (!t || !toolDef(t.id) || !BV.toolFlag(config, t.id, "boonDurability")) return;
      const cap = toolMax(t.id);
      if (!(Number(t.max) > cap)) return;
      t.max = cap; t.dur = Math.max(1, Math.min(Number(t.dur) || 1, cap)); n++;
    });
    return n > 0;
  }
  function activeTool() {
    const mine = curMine();
    const ok = t => t.dur > 0 && toolDef(t.id);
    let t = save.tools.find(x => x.uid === save.equipped);
    if (t && ok(t)) return t;
    // 自動裝備：①「剛好夠格」的標準鎬子（最低階優先）②非標準工具（紅岩鑽頭，任何礦坑都正常效率；不看 tier）③手上最高階的低階標準鎬子；同組先用耐久少的
    const tierOf = x => toolDef(x.id).tier;
    const grp = x => (!isStd(x.id) ? 1 : tierOf(x) >= mine.tier ? 0 : 2);
    const list = save.tools.filter(ok).sort((a, b) => {
      const ga = grp(a), gb = grp(b);
      if (ga !== gb) return ga - gb;
      return (ga === 0 ? tierOf(a) - tierOf(b) : ga === 2 ? tierOf(b) - tierOf(a) : 0) || a.dur - b.dur;
    });
    t = list[0] || null;
    save.equipped = t ? t.uid : null;
    return t;
  }

  if (needStarter) { addTool("wood", 1); addTool("wood", 1); } // 新手送兩把木鎬

  /* ---------------- 主題 / 版面 / 圖片 套用 ---------------- */
  function applyLook() {
    const th = config.theme, rs = document.documentElement.style;
    rs.setProperty("--bg", th.bg); rs.setProperty("--panel", th.panel); rs.setProperty("--panel-dark", th.panelDark);
    rs.setProperty("--border", th.border); rs.setProperty("--accent", th.accent);
    rs.setProperty("--text", th.text); rs.setProperty("--sub", th.sub); rs.setProperty("--fs", th.fontSize + "px");
    if (th.font) rs.setProperty("--font", th.font);

    const img = config.images || {};
    document.body.style.backgroundImage = img.bg ? `url(${img.bg})` : "";
    const mineImg = img["mine_" + save.mineId] || img.scene;
    $("scene").style.backgroundImage = mineImg ? `url(${mineImg})` : "";
    $("mbName").style.color = rarityColor(curMine().tier);   // 礦坑名稱用礦坑代表色（同地圖）
    $("textbox").style.backgroundImage = img.textbox ? `url(${img.textbox})` : "";
    $("hud").style.backgroundImage = img.hud ? `url(${img.hud})` : "";
    $("nav").style.backgroundImage = img.nav ? `url(${img.nav})` : "";

    document.querySelectorAll("[data-edit]").forEach(el => {
      const L = (config.layout || {})[el.dataset.edit] || {};
      const px = v => (v === undefined || v === "" || v === null ? "" : v + "px");
      el.style.transform = (L.x || L.y) ? `translate(${L.x || 0}px, ${L.y || 0}px)` : "";
      el.style.width = L.w ? L.w + "%" : "";
      el.style.minHeight = px(L.h);
      el.style.fontSize = L.fs ? L.fs + "em" : "";
      el.style.borderRadius = px(L.radius);
      el.style.padding = px(L.pad);
      el.style.backgroundColor = L.bg || "";
      el.style.color = L.color || "";
      el.style.borderColor = L.border || "";
      el.style.opacity = L.opacity !== undefined && L.opacity !== "" ? L.opacity : "";
      el.style.display = L.hidden ? "none" : "";
    });
    $("tbTap").textContent = config.texts.tap;
    $("verTag").textContent = "v" + (window.GAME_VERSION || "?");
    document.title = config.gameTitle;
  }

  /* ---------------- HUD ---------------- */
  function renderHud() {
    $("hudName").textContent = save.name || "玩家";
    $("hudCoins").textContent = fmt(save.coins);
    $("hudPlays").textContent = fmt(totalPlays());
    $("hudRuby").classList.remove("hidden");
    $("hudRubyN").textContent = fmt(RUBY_PREVIEW ? RUBY_MOCK : 0);
  }

  /* ---------------- 第二台機台（三位前輩的考驗） ---------------- */
  const M2 = () => config.machine2;
  const isM2 = () => curMine().engine === 2;
  const FREE2 = ["date", "stIntro", "pick", "dig"];
  function state2() {
    const id = curMine().id;
    if (!save.plays2[id] || !save.plays2[id].counts) save.plays2[id] = E2.newState2();
    return save.plays2[id];
  }
  const bossName2 = id => (M2().bosses.find(b => b.id === id) || {}).name || id;
  function moodBoss() {
    const ids = M2().bosses.map(b => b.id);
    return ids[Math.floor(seeded(todayKey() + "|mood|" + curMine().id) * ids.length) % ids.length];
  }
  function moodLine() {
    const M = M2().mood || {};
    const line = pickOne(M.lines || ["{name}今天心情不錯"]);
    return line.replace("{name}", bossName2(moodBoss()));
  }

  /* ---------------- 挖礦畫面 ---------------- */
  let veinGain = 0;
  let veinRun = null;   // 這一趟礦脈的結算資料（第一台）：揮數、各種礦脈次數、是否進入核心層
  const TYPE_COLOR = { RB: "#4f9dff", BB: "#ffaa00", SBB: "rainbow" };
  const veinName = t => (config.texts.veinName || {})[t] || t;
  function renderMine() { renderMineBase(); storySync(); }
  /* 資訊列中間的「礦脈」「紫」：第一台顯示，第二台不顯示 */
  function mbExtra(show) { ["mbHits", "mbEpic"].forEach(id => $(id).parentElement.classList.toggle("hidden", !show)); }
  function renderMineBase() {
    checkDay();
    if (isM2()) return renderMine2();
    const mine = curMine(), st = save.plays[mine.id] || E.newPlayState(), ms = mineStats(mine.id);
    $("mbName").textContent = mine.name;
    let stateTxt = "";   // 礦脈中名稱已顯示在礦脈看板，右上角不重複（2026-10-03）
    if (dbg("showSetting")) {
      const nm = { normal: "通常", koukaku: "高確", chance: "連續演出", revive: "復活", zencho: "前兆", bonus: "AT" }[st.state];
      stateTxt += ` <span style="color:#ff4fd8">設定${todaySetting(mine.id)}｜${nm}${st.pending ? "(當選" + st.pending + ")" : ""}${st.zenchoType ? "(" + st.zenchoType + ")" : ""}${st.state === "chance" ? `｜${st.chanceIdx}/${st.chanceRounds}回合 ${st.chanceWin ? "會過" + (st.chanceFake ? "(先演失敗)" : "") : "不會過"}` : ""}${st.stock && st.stock.length ? "｜庫存" + st.stock.map(x => x.type).join(",") : ""}</span>`;
    }
    $("mbState").innerHTML = stateTxt;
    $("mbSwings").textContent = fmt(ms.swings) + " 揮";   // 今天在這座礦坑的揮數；換日或離開礦坑歸零
    $("mbHits").textContent = ms.hits;
    $("mbEpic").textContent = ms.epic;
    $("mbSinceL").textContent = "距上次礦脈";       // sinceHit：上次礦脈結束（或進坑）後的揮數，礦脈中顯示 —
    $("mbSince").textContent = st.state === "bonus" ? "—" : fmt(st.sinceHit) + " 揮";
    mbExtra(true); $("mbSince").parentElement.classList.remove("hidden");

    const inBonus = st.state === "bonus";
    $("veinBanner").classList.toggle("hidden", !inBonus);
    $("vbUp").classList.add("hidden");
    $("scene").classList.toggle("vein-on", inBonus && st.bonusType === "SBB");
    if (inBonus) {
      const shownStock = st.stock.filter(x => x.announced).length;
      $("vbChain").innerHTML = colored(veinName(st.bonusType), TYPE_COLOR[st.bonusType]) + ` 第${st.chain}脈` + (shownStock ? ` <span style="color:#ff5555">+${shownStock}</span>` : "");
      $("vbLeft").textContent = st.bonusLeft;
      if (st.atHigh > 0) $("vbChain").innerHTML += (st.chain >= config.rules.bonus.cont.boostAfter
        ? ` <span class="rainbow-text">≋深層共鳴${st.atHigh}</span>`
        : ` <span style="color:${config.rules.omen.colors[6] || "#ffcc33"}">≋共鳴${st.atHigh}</span>`);
      $("vbGain").textContent = money(veinGain);
    }
    const t = activeTool();
    if (t) {
      const d = toolDef(t.id);
      const f = toolFactor(t, mine);
      $("tiName").innerHTML = `<span style="color:${rarityColor(d.rarity)}">${d.name}</span>` + (f < 1 ? ` <span style="color:#ff7755">收益${Math.round(f * 100)}%</span>` : "");
      $("tiBar").style.width = (t.dur / t.max * 100) + "%";
      $("tiBar").style.background = t.dur / t.max > .5 ? "#55ff55" : t.dur / t.max > .2 ? "#ffcc33" : "#ff5555";
      $("tiDur").textContent = t.dur + "/" + t.max;
    } else {
      $("tiName").textContent = "無工具"; $("tiBar").style.width = "0"; $("tiDur").textContent = "";
    }
    $("rollLog").classList.toggle("hidden", !dbg("showRolls"));
    $("btnAuto").textContent = save.auto ? "自動" : "手動";
    $("btnAuto").classList.toggle("on", save.auto);
    renderHud();
  }

  function renderMine2() {
    const mine = curMine(), st = state2(), ms = mineStats(mine.id);
    $("mbName").textContent = mine.name;
    // 擁有者 2026-09-28：畫面上不出現「上位」「報酬」「BONUS」等術語，改成人話
    const PH = { normal: "", date: "談話中", at: "前輩帶路中", stIntro: "獲得前輩的認可吧！", st: "獲得前輩的認可吧！", reward: "自己的紅包 自己爭取", pick: "選擇", dig: "挖掘中", bonus: "前輩的心意" };
    let txt = PH[st.state] ? colored(PH[st.state], config.theme.accent) : "";
    if (dbg("showSetting")) {
      txt += ` <span style="color:#ff4fd8">設定${todaySetting(mine.id)}｜${st.state}｜累${st.counts.a}/${st.counts.b}/${st.counts.c}｜好感${Math.round(st.favor.a * 100)}/${Math.round(st.favor.b * 100)}/${Math.round(st.favor.c * 100)}%${st.stBoss ? "｜對手" + bossName2(st.stBoss) : ""}${st.bonusTotal ? "｜報酬" + st.bonusTotal + "轉" : ""}</span>`;
    }
    $("mbState").innerHTML = txt;
    $("mbSwings").textContent = fmt(ms.swings) + " 揮";   // 今天在這座礦坑的揮數；換日或離開礦坑歸零
    $("mbHits").textContent = ms.hits || 0;
    $("mbEpic").textContent = ms.dates || 0;
    $("mbSinceL").textContent = "距上次談話";       // sinceAt：上次前輩找你談話（或進坑）後的揮數
    $("mbSince").textContent = fmt(st.sinceAt) + " 揮";
    mbExtra(false);                  // 第二台只留「本日」「累計」，礦脈／紫不顯示
    const inRun = ["at", "st", "reward", "pick", "dig", "bonus", "stIntro"].includes(st.state);
    $("mbSince").parentElement.classList.toggle("hidden", inRun);   // 談話成功後的各階段不顯示「距上次談話」（原本的「累計」隱藏規則）
    $("veinBanner").classList.toggle("hidden", !inRun);
    $("vbUp").classList.toggle("hidden", !st.upper);     // 「已獲得最終認可」獨立一行
    $("scene").classList.toggle("vein-on", !!st.upper);
    if (inRun) {
      $("vbChain").innerHTML = (st.state === "bonus" ? `前輩的心意 ${st.bonusTotal}` : st.state === "st" ? `第${st.stRound}關` : st.state === "stIntro" ? `第${st.stRound + 1}關` : st.state === "at" ? "前輩帶路中" : "自己的紅包");
      $("vbLeft").textContent = st.state === "bonus" ? st.bonusLeft : st.state === "st" ? st.stLeft : st.state === "at" ? st.atLeft : "—";
      $("vbGain").textContent = money(st.gain * (mine.mult || 1));
    }
    const t = activeTool();
    if (t) {
      const d = toolDef(t.id), f = toolFactor(t, mine);
      $("tiName").innerHTML = `<span style="color:${rarityColor(d.rarity)}">${d.name}</span>` + (f < 1 ? ` <span style="color:#ff7755">收益${Math.round(f * 100)}%</span>` : "");
      $("tiBar").style.width = (t.dur / t.max * 100) + "%";
      $("tiBar").style.background = t.dur / t.max > .5 ? "#55ff55" : t.dur / t.max > .2 ? "#ffcc33" : "#ff5555";
      $("tiDur").textContent = t.dur + "/" + t.max;
    } else { $("tiName").textContent = "無工具"; $("tiBar").style.width = "0"; $("tiDur").textContent = ""; }
    $("rollLog").classList.toggle("hidden", !dbg("showRolls"));
    $("btnAuto").textContent = save.auto ? "自動" : "手動";
    $("btnAuto").classList.toggle("on", save.auto);
    renderHud();
  }

  function setTextbox(lines, omen, opts) {
    opts = opts || {};
    const box = $("textbox");
    clockMsgOn = false;
    box.classList.remove("omen-rainbow", "hint-blink");
    const oc = config.rules.omen.colors;
    const layoutBorder = ((config.layout || {}).textbox || {}).border || "";
    if (omen === "vein" || oc[omen] === "rainbow") { box.classList.add("omen-rainbow"); box.style.borderColor = ""; }
    else box.style.borderColor = omen > 0 ? oc[omen] : layoutBorder;
    if (opts.blink) box.classList.add("hint-blink");
    const tag = $("tbTag"); tag.textContent = opts.tag || ""; tag.classList.toggle("hidden", !opts.tag);
    if (opts.tag) { tag.style.color = omen > 0 && oc[omen] !== "rainbow" ? oc[omen] : ""; tag.classList.toggle("rainbow-text", oc[omen] === "rainbow"); }
    $("tbTap").textContent = opts.tap || config.texts.tap;
    $("tbLines").innerHTML = lines.map(l => `<div>${l}</div>`).join("");
  }
  function colored(txt, color) { return color === "rainbow" ? `<span class="rainbow-text">${txt}</span>` : `<span style="color:${color}">${txt}</span>`; }

  /* ---------------- 日期未知時的挖礦畫面（階段3B，擁有者 Q1＝A） ----------------
     取不到台灣日期：第一台、第二台、自動挖掘都不揮；敘述框顯示確認中／失敗＋重試。背包、紀錄、設定照常可看。 */
  let clockMsgOn = false;
  const clockChecking = () => !clock.failKind && (!!clock.syncing || !clock.base);
  function showClockMsg() {
    setTextbox(clockChecking()
      ? [colored("正在確認今天的日期…", "#7fe3ff"), colored("需要連上網路（台灣時間）", config.theme.sub)]
      : [colored("需要連上網路確認今天的日期（台灣時間）。", "#ffcc33"), `<button class="px-btn small" id="clockRetry">重試</button>`], 0, { tap: "確認日期後可以挖礦" });
    clockMsgOn = true;
  }
  function dayBlocked() {   // 揮擊入口：日期未知 → 不抽、不耗工具、停自動
    if (todayKey()) return false;
    if (save.auto) { save.auto = false; clearTimeout(autoTimer); }
    renderMineBase(); showClockMsg();
    if (!clock.syncing) clockSync();
    return true;
  }
  /* 開場動畫（2026-10-03 擁有者：用開場動畫取代「確認日期」畫面）：往下挖的像素動畫蓋住整個遊戲，
     日期確認好就收起；確認失敗（沒網路等）也收起，露出原本的「需要連上網路＋重試」。最少 1.4 秒、最多 8 秒。 */
  function splashRun() {
    const sp = $("splash"); if (!sp) return;
    const t0 = Date.now(); let depth = 0;
    const dep = setInterval(() => { depth += 3; $("spDepth").textContent = depth; }, 100);
    const chk = setInterval(() => {
      const t = Date.now() - t0;
      if (t < 1400 && t < 8000) return;
      if (t < 8000 && !todayKey() && !clock.failKind) return;
      clearInterval(dep); clearInterval(chk);
      sp.classList.add("out"); setTimeout(() => sp.remove(), 400);
    }, 100);
  }
  function clockChanged() {   // 時鐘變成有效／無效時，重畫受影響的畫面
    if (currentScreen === "mine" && !save.senpai.story) {
      if (!todayKey()) dayBlocked();
      else if (clockMsgOn) { clockMsgOn = false; setTextbox([colored("日期確認完成，可以挖礦了", config.theme.sub)], 0); renderMine(); }
    }
    if (currentScreen === "shop" && $("modal").classList.contains("hidden")) renderShop();
    if (currentScreen === "scope") renderScope();
    renderClockTag();
  }
  function renderClockTag() {   // 測試替身（只限 localhost）：資訊列角落標示
    const el = $("clockTag"); if (!el) return;
    el.textContent = clock.sandbox ? "測試：裝置日期" : "";
    el.classList.toggle("hidden", !clock.sandbox);
  }

  /* ---------------- 第二台機台：一次點擊 ---------------- */
  function doSwing2(input) {
    if (save.senpai.story) { stopAuto(); return null; }     // 回憶演出中：不抽、不耗工具
    if (dayBlocked()) return null;                          // 台灣日期未知：不揮（Q1＝A）
    checkDay();
    const mine = curMine(), R = M2(), st = state2(), T = R.lines, sub = config.theme.sub;
    const free = FREE2.includes(st.state);
    const tool = activeTool();
    if (!free && !tool) {
      const need = stdOfTier(mine.tier);
      setTextbox([colored(config.texts.noTool, "#ff5555"), colored(`建議使用「${need ? need.name : ""}」以上`, sub), `到${config.boss.name}那裡買，或看廣告領取`], 0);
      setChoices(null); stopAuto(); renderMine();
      return null;
    }
    st.mood = moodBoss();
    const res = E2.step2(R, todaySetting(mine.id), st, Math.random, input || {});
    const ms = mineStats(mine.id);
    const lines = [];
    let bigHtml = null, newFind = false;

    if (!res.free) {
      ms.swings++;
      const phase = res.stateBefore === "normal" ? "normal" : res.stateBefore === "bonus" ? "bonus" : "st";
      const g = ((R.map || {})[phase] || {})[res.cat];
      const name = Array.isArray(g) ? pickOne(g) : g;
      const factor = toolFactor(tool, mine);
      const sfx = pickOne(config.texts.swing);
      if (!name) {
        lines.push(colored(sfx + " " + pickOne(config.texts.rubble), rarityColor(0)));
        bigHtml = colored("·", rarityColor(0));
      } else if (factor < 1 && Math.random() >= factor) {
        lines.push(sfx + " " + colored(name, oreColor(name)) + colored(" 碎掉了…", "#ff7755"));
        bigHtml = `<s>${colored(name, oreColor(name))}</s>`;
      } else {
        const qty = Math.max(1, res.qty || 1);
        save.ores[name] = (save.ores[name] || 0) + qty;
        if (!save.dex[name]) { save.dex[name] = { count: 0, first: dayOrLast() }; newFind = true; }
        save.dex[name].count += qty;
        const price = itemPrice(name);
        lines.push(sfx + " " + colored(name, oreColor(name)) + (qty > 1 ? colored(` ×${qty}`, config.theme.accent) : "") + ` <span style="color:${sub}">$${money(price * qty)}</span>` + (newFind ? colored(" NEW", config.theme.accent) : ""));
        bigHtml = colored(name, oreColor(name)) + (qty > 1 ? colored(` ×${qty}`, config.theme.accent) : "");
      }
      tool.dur--;
      if (tool.dur <= 0) { save.tools = save.tools.filter(t => t.uid !== tool.uid); talk().broke = true; lines.push(colored(config.texts.toolBreak + toolDef(tool.id).name, "#ff5555")); }
    }

    let tag = "", omen = 0, choices = null, skipBig = false;
    const ev = t => res.events.find(e => e.t === t);
    for (const e of res.events) {
      if (e.t === "tenjou") lines.push(colored("……有人在坑口喊你", config.theme.accent));
      if (e.t === "card" && e.boss === moodBoss() && Math.random() < ((M2().mood || {}).hintRate || 0)) lines.push(colored(moodLine(), "#ffcc33"));
      if (e.t === "card" && e.gold) lines.push(colored(`【${bossName2(e.boss)}】` + (T.goldGift || "……有人幫你說了好話"), "#ffcc33"));
      if (e.t === "alsoWants") lines.push(colored(`【${bossName2(e.boss)}】` + (T.alsoWants || "也想找你聊聊"), "#ffcc33"));
      if (e.t === "dateNext") lines.push(colored(`【${bossName2(e.boss)}】` + (T.alsoWants || "也想找你聊聊") + "——", "#ffcc33"));
      if (e.t === "dateStart") {
        // 上次被同一個人拒絕 → 彩蛋台詞取代一般的開場
        const open = (e.again && bl(e.boss, "again", null)) || bl(e.boss, "call", T.call);
        lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(open), config.theme.accent));
        const dep = e.scene && e.scene !== "normal" ? sc(e.boss, e.scene, "depart") : null;
        if (dep) lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(dep), SCENE_COLOR[e.scene]));
        ms.dates = (ms.dates || 0) + 1;
      }
      if (e.t === "dateStep") {
        const pool = (e.scene && e.scene !== "normal" && sc(e.boss, e.scene, "during"))
          || bl(e.boss, e.kind, bl(e.boss, "chat", ["……"]));
        const oc = config.rules.omen.colors;
        lines.push(colored(pickOne(pool), oc[e.color] || "#e8e8e8"));
        omen = Math.max(omen, e.color);
      }
      if (e.t === "dateWin") {
        const pool = (e.scene && e.scene !== "normal" && sc(e.boss, e.scene, "win")) || bl(e.boss, "win", [T.dateWin]);
        lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(pool), "#ffcc33"));
        lines.push(colored(T.atStart, "rainbow")); ms.hits = (ms.hits || 0) + 1;
        if (senpaiWin(e.boss)) lines.push(colored(`【${bossName2(e.boss)}】好像有話要跟你說……`, "#ffcc33"));
      }
      if (e.t === "dateWin" || e.t === "dateLose") { const t = talk(); if (!t.trip) t.trip = { boss: null }; t.trip.boss = e.boss; }   // 這一趟最後談過話的前輩   // 談話結束（成功或失敗）→ 佐佐木下次有機會提起這位前輩
      if (e.t === "dateLose") {
        const pool = (e.scene && e.scene !== "normal" && sc(e.boss, e.scene, "lose")) || bl(e.boss, "lose", [T.dateLose]);
        lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(pool), sub));
      }
      if (e.t === "atEnd") lines.push(colored(T.stIntro, config.theme.accent));
      if (e.t === "upperStart") lines.push(colored(T.upperStart, "rainbow"));
      if (e.t === "askBoss") {
        lines.push(colored(T.askBoss, config.theme.accent));
        choices = M2().bosses.map(b => ({ v: b.id, label: `▶ 「${b.name}前輩，這回讓我試試。」` }));
      }
      if (e.t === "stStart") {
        // stAppear 用 {name} 放前輩名字（例：這回由{name}前輩出題。）；舊設定沒有 {name} 時沿用「文字＋名字」
        const nm = colored(bossName2(e.boss), "#ffcc33");
        lines.push(colored(`第${e.round}關　` + (String(T.stAppear || "").includes("{name}") ? T.stAppear.replace("{name}", nm) : `${T.stAppear} ` + nm), "#e8e8e8"));
        const again = e.same ? bl(e.boss, "again", null) : null;
        const ap = again || bl(e.boss, "appear", null);
        if (ap) lines.push(colored(pickOne(ap), e.same ? "#ffcc33" : sub));
      }
      if (e.t === "stPass" && e.gold) lines.push(colored("金機會牌——直接認可！", "#ffcc33"));
      if (e.t === "stPass") lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "pass", [T.stPass])) + (e.right ? "" : "（勉強認可）") + `　通關 ${e.cleared} 關`, "#ffcc33"));
      if (e.t === "stLose") setTimeout(() => showRunSummary(e, mine), 400);
      if (e.t === "stLose") lines.push(colored(`【${bossName2(e.boss)}】` + pickOne(bl(e.boss, "fail", [T.stLose])) + `　通關 ${e.cleared || 0} 關　收穫 $${money(e.gain * (mine.mult || 1))}`, sub));
      if (e.t === "rewardRoll") lines.push(colored(T.reward, config.theme.accent));
      if (e.t === "askPick") {
        lines.push(colored(T.pick, config.theme.accent));
        choices = [{ v: "drill", label: T.drill }, { v: "shovel", label: T.shovel }];
      }
      if (e.t === "digStart") { clearDigNums(); lines.push(colored(T.digTap, config.theme.accent)); }
      if (e.t === "dig") { addDigNum(e.inc); lines.push(colored(`挖出 +${e.inc}`, e.inc >= 5 ? "#ffcc33" : e.inc >= 3 ? "#55ff55" : sub)); skipBig = true; }
      if (e.t === "announce") {
        lines.push(colored(`${T.announce} ${e.total} 轉！`, "rainbow"));
        if (e.how === "shovel") setTimeout(clearDigNums, 1500);
        bigHtml = colored(e.total + "轉", config.theme.accent);
      }
      if (e.t === "bonusEnd") lines.push(colored(T.bonusEnd + `　收穫 $${money(st.gain * (mine.mult || 1))}`, config.theme.accent));
    }
    const stt = st.state;
    if (stt === "date") {
      // v0.10.0：違和感不再寫在標籤上（以前會洩漏答案）
      const scn = st.dateScene || "normal";
      tag = scn === "normal" ? "≋ 談話中 ≋" : `≋ ${scPlace(st.dateBoss, scn) || "外出"} ≋`;
    }
    // 擁有者 2026-09-28：標籤寫「第 N 次認可」（N＝通關次數），不寫「上位」「報酬」
    else if (stt === "at") tag = "≋ 前輩帶路中 ≋";
    else if (stt === "bonus") tag = st.cleared ? `≋ 第 ${st.cleared} 次認可 ≋` : "≋ 前輩的心意 ≋";
    else if (stt === "st") tag = `≋ 獲得前輩的認可吧！ 第${st.stRound}關 ≋`;
    if (st.upper) omen = 6;
    else if (stt === "st") omen = 2;

    const storyNow = !!save.senpai.story;
    setTextbox(storyNow ? lines.slice(-6) : lines.slice(0, 5), omen, { tag, tap: stt === "dig" ? T.digTap : null });
    setChoices(storyNow ? null : choices);
    if (storyNow) { storyFresh = true; save.auto = false; clearTimeout(autoTimer); }
    if (bigHtml && !skipBig) {
      const big = $("sceneBig");
      big.innerHTML = bigHtml; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    }
    $("sceneSub").textContent = "";
    logRolls(res, ms.swings);
    renderMine();
    persist();
    return { res, st };
  }
  const bl = (boss, key, fallback) => {
    const v = ((M2().bossLines || {})[boss] || {})[key];
    return (v && v.length) ? v : fallback;
  };
  /* 外出／激熱劇本的台詞：sc(前輩, 劇本, 哪一組) */
  const sc = (boss, scene, key) => {
    const v = ((((M2().bossScenes || {})[boss] || {})[scene] || {})[key]);
    return (v && v.length) ? v : null;
  };
  const scPlace = (boss, scene) => ((((M2().bossScenes || {})[boss] || {})[scene] || {}).place) || "";
  const SCENE_COLOR = { strong: "#55aaff", hot: "#ffcc33" };
  /* 鏟子：+N 的數字散落在場景框裡，不重疊 */
  let digCells = [];
  function clearDigNums() { const sc = $("sceneStage"); sc.querySelectorAll(".dig-num").forEach(n => n.remove()); digCells = []; }
  function addDigNum(inc) {
    const sc = $("sceneStage"), cols = 4, rows = 6;
    if (digCells.length >= cols * rows) clearDigNums();
    let cell;
    for (let i = 0; i < 60; i++) { const c = Math.floor(Math.random() * cols * rows); if (!digCells.includes(c)) { cell = c; break; } }
    if (cell === undefined) cell = digCells.length % (cols * rows);
    digCells.push(cell);
    const col = cell % cols, row = Math.floor(cell / cols);
    const el = document.createElement("div");
    el.className = "dig-num";
    el.textContent = "+" + inc;
    el.style.left = (8 + col * (84 / cols) + Math.random() * 6) + "%";
    el.style.top = (8 + row * (84 / rows) + Math.random() * 4) + "%";
    el.style.color = inc >= 5 ? "#ffcc33" : inc >= 3 ? "#55ff55" : "#e8e8e8";
    el.style.fontSize = inc >= 5 ? "1.6em" : inc >= 3 ? "1.3em" : "1.05em";
    sc.appendChild(el);
  }
  // 一輪結束的結算畫面
  function showRunSummary(e, mine) {
    const mult = mine.mult || 1, box = $("modalBox");
    box.innerHTML = `<div class="boss-name">結算</div>
      <div style="margin:10px 0;line-height:1.9;text-align:left">
        通關關數　<b>${e.cleared || 0}</b> 關<br>
        單次最多可挖　<b>${e.maxBonus || 0}</b> 次<br>
        本輪總收穫　<b style="color:${config.theme.accent}">$${money((e.gain || 0) * mult)}</b><br>
        ${e.upper ? '<span style="color:#ffcc33">※ 這一輪獲得過最終認可</span><br>' : ""}
        <span class="sub">最後倒在 ${bossName2(e.boss)} 手上</span>
      </div>
      <div class="btns"><button class="px-btn" id="sumOk">回去挖礦</button></div>`;
    $("modal").classList.remove("hidden");
    $("sumOk").onclick = () => $("modal").classList.add("hidden");
  }
  // 第一台：一趟礦脈結束的結算畫面（樣式同三位前輩台）
  function showVeinSummary(e, run, gain) {
    const box = $("modalBox"), types = (run && run.types) || {};
    const kinds = ["SBB", "BB", "RB"].filter(t => types[t]).map(t => colored(`${veinName(t)}×${types[t]}`, TYPE_COLOR[t])).join("・");
    box.innerHTML = `<div class="boss-name">結算</div>
      <div style="margin:10px 0;line-height:1.9;text-align:left">
        共 <b>${e.chain || 1}</b> 脈${kinds ? `<br><span class="sub">${kinds}</span>` : ""}<br>
        ${run ? `礦脈中揮了　<b>${fmt(run.swings)}</b> 揮<br>` : ""}
        這趟總收穫　<b style="color:${config.theme.accent}">$${money(gain)}</b><br>
        ${run && run.core ? '<span style="color:#ffcc33">※ 這一趟礦脈進入過核心層</span><br>' : ""}
        <span class="sub">${esc(curMine().name)}</span>
      </div>
      <div class="btns"><button class="px-btn" id="sumOk">回去挖礦</button></div>`;
    $("modal").classList.remove("hidden");
    $("sumOk").onclick = () => $("modal").classList.add("hidden");
  }
  function setChoices(list) {
    const box = $("tbChoice");
    if (!list || !list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    box.classList.remove("hidden");
    box.innerHTML = list.map(c => `<button class="px-btn wide" data-m2="${c.v}">${c.label}</button>`).join("");
  }
  function oreColor(name) {
    const it = itemIndex()[name];
    return rarityColor(it ? it.cat.rarity : 1);
  }

  function doSwing() {
    if (save.senpai.story) { renderMine(); return null; }   // 回憶演出中：不抽、不耗工具
    if (isM2()) return doSwing2();
    if (dayBlocked()) return null;                          // 台灣日期未知：不揮（Q1＝A）
    checkDay();
    const mine = curMine(), T = config.texts, rules = config.rules, sub = config.theme.sub;
    const tool = activeTool();
    if (!tool) {
      const need = stdOfTier(mine.tier);
      setTextbox([colored(T.noTool, "#ff5555"), colored(`建議使用「${need ? need.name : ""}」以上`, sub), `到${config.boss.name}那裡買，或看廣告領取`], 0);
      stopAuto(); renderMine();
      return null;
    }
    const st = save.plays[mine.id] || (save.plays[mine.id] = E.newPlayState());
    if (!st.stock) { Object.assign(st, E.newPlayState(), { sinceHit: st.sinceHit || 0 }); } // 舊存檔轉換
    const r = E.swing(rules, todaySetting(mine.id), st, Math.random, mine.tenjou);
    const ms = mineStats(mine.id);
    ms.swings++;
    if (r.stateBefore !== "bonus") { ms.normalSwings++; if (r.cat === "epic") ms.epic++; if (r.cat === "legend") ms.legend = (ms.legend || 0) + 1; }
    const ev = t => r.events.find(e => e.t === t);
    if (ev("bonusStart")) { ms.hits++; veinGain = 0; veinRun = { swings: 0, types: {}, core: false }; }
    if (r.stateBefore === "bonus" && veinRun) veinRun.swings++;

    const lines = [];
    const cat = catDef(r.cat);
    const factor = toolFactor(tool, mine);
    let bigHtml, newFind = false;
    // 違和感：音效字
    let sfx = pickOne(T.swing);
    if (r.hint === "sfx") sfx = T.hintSfx;
    if (r.hint === "silent") sfx = "……";

    if (r.cat === "rubble") {
      lines.push(colored(sfx + " " + (r.hint === "silent" ? "" : pickOne(T.rubble)), rarityColor(cat.rarity)));
      bigHtml = colored("·", rarityColor(0));
    } else if (factor < 1 && Math.random() >= factor) {
      // 工具太弱：礦石被震碎（期望收益 = 工具效率）
      const inVein = r.stateBefore === "bonus";
      const name = pickOne((inVein && mine.veinItems && mine.veinItems[r.cat]) || mine.items[r.cat]);
      lines.push(sfx + " " + colored(name, rarityColor(cat.rarity)) + colored(" 碎掉了…", "#ff7755"));
      bigHtml = `<s>${colored(name, rarityColor(cat.rarity))}</s>`;
    } else {
      const inVein = r.stateBefore === "bonus";
      const name = pickOne((inVein && mine.veinItems && mine.veinItems[r.cat]) || mine.items[r.cat]);
      save.ores[name] = (save.ores[name] || 0) + 1;
      if (!save.dex[name]) { save.dex[name] = { count: 0, first: dayOrLast() }; newFind = true; }
      save.dex[name].count++;
      const price = itemPrice(name);
      if (r.stateBefore === "bonus") veinGain += price;
      lines.push(sfx + " " + colored(name, rarityColor(cat.rarity)) + ` <span style="color:${sub}">$${money(price)}</span>` + (newFind ? colored(" NEW", config.theme.accent) : ""));
      bigHtml = colored(name, rarityColor(cat.rarity));
    }

    const oc = rules.omen.colors;
    const cr = r.chanceRound;
    if (cr) {
      // 連續演出：照回合數的劇本走，顏色只升不降
      const script = (T.chanceScript || {})["r" + cr.total] || [];
      const line = script[cr.idx - 1] || script[script.length - 1] || "";
      if (line) lines.push(colored(line, oc[cr.color]));
      if (cr.upLine && (T.chanceUpLines || []).length) lines.push(colored(pickOne(T.chanceUpLines), oc[cr.color]));
    }
    const isRevive = r.events.some(e => e.t === "revive");
    if (!cr && !isRevive && r.omen > 0 && T.omenLine[r.omen]) lines.push(colored(T.omenLine[r.omen], oc[r.omen]));
    else if (st.state === "koukaku" && Math.random() < 0.25) lines.push(colored(T.koukakuHint, sub));
    if (r.atHigh && !r.events.some(e => e.t === "atHighStart") && Math.random() < 0.3) lines.push(colored(T.atHighHint, oc[6] || "#ffcc33"));
    if (r.hint === "drip") lines.push(colored(T.hintDrip, sub));
    if (r.hint === "glow") lines.push(colored(T.hintGlow, "#ffe0a0"));

    // 事件文字（不直接說出前兆／AT 等術語）
    const enter = ["chanceStart", "fakeStart", "tenjou"];
    for (const e of r.events) {
      if (enter.includes(e.t)) lines.unshift(colored(T.omenEnter, config.theme.accent));
      if (e.t === "chanceLose" && cr) lines.push(colored(T.chanceCollapse, "#ff7755"));
      else if ((e.t === "chanceLose" && !e.short) || e.t === "fakeEnd") lines.push(colored(T.chanceLose, sub));
      if (e.t === "revive") lines.push(colored(T.revive, r.omen === 5 ? "rainbow" : (oc[6] || "#ffcc33")));
      if (e.t === "directWin") lines.push(colored(T.directWin, "#ffaa00"));
      if (e.t === "bonusStart") { if (e.from === "chance") lines.push(colored(T.chanceWin, config.theme.accent)); lines.push(colored(T.bonusStart[e.type], TYPE_COLOR[e.type])); }
      if (e.t === "atHighStart") lines.push(colored(e.deep ? (T.atHighEnterDeep || T.atHighEnter) : T.atHighEnter, e.deep ? "rainbow" : (oc[6] || "#ffcc33")));
      if (e.t === "atHighEnd") lines.push(colored(T.atHighEnd, sub));
      if (e.t === "stock" && e.shown) lines.push(colored(T.stock, "rainbow"));
      if (e.t === "upgrade" && e.shown) lines.push(colored(`${T.upgrade} ${veinName(e.from)}→${veinName(e.to)}`, "rainbow"));
      if (e.t === "bonusChain") lines.push(colored((e.surprise ? T.bonusChainSurprise : T.bonusChain) + " " + T.bonusStart[e.type], TYPE_COLOR[e.type]));
      if (e.t === "upperStart") lines.push(colored(T.upperStart, "rainbow"));
      if (e.t === "veinCap") lines.push(colored(T.veinCap, "#ff7755"));
      if (e.t === "bonusEnd") lines.push(colored(`${T.bonusEnd}　共${e.chain}脈　收穫 $${money(veinGain)}`, config.theme.accent));
      if (veinRun) {   // 結算用：記下這一趟出現過的礦脈種類
        if (e.t === "bonusStart" || e.t === "bonusChain") veinRun.types[e.type] = (veinRun.types[e.type] || 0) + 1;
        if (e.t === "upgrade" && e.shown) { veinRun.types[e.from] = Math.max(0, (veinRun.types[e.from] || 0) - 1); veinRun.types[e.to] = (veinRun.types[e.to] || 0) + 1; }
        if (e.t === "upperStart") veinRun.core = true;
      }
      if (e.t === "bonusEnd") { const run = veinRun, gain = veinGain; veinRun = null; setTimeout(() => showVeinSummary(e, run, gain), 400); }
    }

    // 工具掉落：恩惠加成另外補抽；工具太弱時也會打折
    let drop = r.toolDrop;
    if (!drop && boonSum("toolDrop") > 0) {
      const td0 = rules.toolDrop;
      drop = Math.random() < (r.stateBefore === "bonus" ? td0.bonus : td0.normal) * boonSum("toolDrop");
    }
    if (drop && factor < 1 && Math.random() >= factor) drop = false;
    if (drop) {
      const td = rules.toolDrop;
      let tier = mine.tier;
      if (mine.tier > 1 && Math.random() >= td.sameTier) tier = 1 + Math.floor(Math.random() * (mine.tier - 1));
      const def = stdOfTier(tier) || stdTools()[0];
      addTool(def.id, td.minDur + Math.random() * (td.maxDur - td.minDur));
      lines.push(T.toolDrop + colored(def.name, rarityColor(def.rarity)));
    }

    tool.dur--;
    let broke = false;
    if (tool.dur <= 0) {
      save.tools = save.tools.filter(t => t.uid !== tool.uid);
      lines.push(colored(T.toolBreak + toolDef(tool.id).name, "#ff5555"));
      talk().broke = true;          // 佐佐木之後才知道「上一把用壞了」
      broke = true;
    }

    const boxOmen = (r.stateBefore === "bonus" && st.state === "bonus")
      ? (st.bonusType === "SBB" ? "vein" : (r.atHigh ? 6 : 0))
      : Math.max(0, r.omen);
    setTextbox(lines.slice(0, 5), boxOmen, { tap: r.hint === "tap" ? T.hintTap : null, blink: r.hint === "blink" || isRevive, tag: (r.atHigh && !ev("atHighEnd")) ? (r.atHighDeep ? (T.atHighTagDeep || T.atHighTag) : T.atHighTag) : (r.inOmen && !ev("bonusStart") && !ev("chanceLose") && !ev("fakeEnd") ? T.omenTag : "") });
    const big = $("sceneBig");
    big.innerHTML = bigHtml; big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    $("sceneSub").textContent = "";
    if (cat.rarity >= 4 || ev("bonusStart") || ev("bonusChain")) {
      const sc = $("scene"); sc.classList.remove("shake"); void sc.offsetWidth; sc.classList.add("shake");
    }
    logRolls(r, ms.swings);
    renderMine();
    persist();
    return { r, broke, newFind, cat, st };
  }

  /* ---------------- 測試：抽選紀錄 ---------------- */
  const pctText = (p, D) => (p * 100).toFixed(Math.max(0, Math.round(Math.log10(D)) - 2)) + "%";
  function logRolls(r, swingNo) {
    const box = $("rollLog");
    box.classList.toggle("hidden", !dbg("showRolls"));
    if (!dbg("showRolls")) return;
    const list = r.rolls.filter(x => dbg("showAllRolls") || x.major);
    if (!list.length) return;
    const html = list.map(x => x.info ? `<div class="pk">・${x.label}</div>` : x.pick
      ? `<div class="pk">・${x.label}｜1~${x.total} 抽出 ${x.n} → ${x.result}（${x.ranges.join("／")}）</div>`
      : `<div class="${x.hit ? "hit" : "miss"}">・${x.label} ${pctText(x.p, x.D)}｜1~${x.D.toLocaleString("en-US")} 抽出 ${x.n.toLocaleString("en-US")}（≤${x.need.toLocaleString("en-US")} 當選）→ ${x.hit ? "當選" : "沒中"}</div>`).join("");
    const div = document.createElement("div");
    const cn = (catDef(r.cat) || {}).name || (E2 && E2.NAME2[r.cat]) || r.cat || "—";
    div.innerHTML = `<div class="sw">#${swingNo} ${r.cat ? "挖到 " + cn : "演出"}</div>${html}`;
    box.prepend(div);
    while (box.children.length > 60) box.lastChild.remove();
  }

  /* ---------------- 自動模式 ---------------- */
  let autoTimer = null;
  const AUTO_STOP = ["chanceStart", "fakeStart", "tenjou", "directWin", "bonusStart", "bonusChain", "bonusEnd", "stock", "upgrade", "chanceUp", "revive"];
  function autoStep() {
    if (!save.auto) return;
    if (isM2()) return autoStep2();
    const res = doSwing();
    if (!res) return;
    const stopAt = (config.play && config.play.autoStopOmen) || 3;
    const r = res.r;
    const stop = r.events.some(e => AUTO_STOP.includes(e.t) && !((e.t === "stock" || e.t === "upgrade") && !e.shown)) ||
      (r.omen >= stopAt && r.stateBefore !== "bonus") || res.st.state === "zencho" || res.st.state === "chance" || res.st.state === "revive" ||
      (res.broke && !activeTool());
    if (stop) { stopAuto(); return; }
    autoTimer = setTimeout(autoStep, autoWait());
  }
  // 第二台機台：自動時直接跳過所有對話演出
  // 演出開始就停自動：玩家可以自己點，或再按一次自動＝快速跳過
  const AUTO_STOP2 = ["dateStart", "alsoWants", "dateNext", "dateWin", "upperStart", "askBoss", "askPick", "rewardRoll", "stLose"];
  function autoStep2() {
    if (!save.auto) return;
    const st = state2();
    const input = st.state === "pick" ? { choice: "drill" }
      : (st.state === "stIntro" && st.upper && !st.pickedBoss) ? { choice: st.lastPick || pickOne(M2().bosses).id, auto: true }
      : {};
    const out = doSwing2(input);
    if (!out) return;
    const free = FREE2.includes(out.res.stateBefore);
    if (out.res.events.some(e => AUTO_STOP2.includes(e.t))) { stopAuto(); return; }
    if (!activeTool() && !FREE2.includes(state2().state)) { stopAuto(); return; }
    autoTimer = setTimeout(autoStep2, free ? 90 : autoWait());
  }
  function stopAuto() { save.auto = false; clearTimeout(autoTimer); renderMine(); }
  function toggleAuto() {
    if (save.auto) { stopAuto(); return; }
    if (save.senpai.story) { toast("先把回憶看完"); return; }
    save.auto = true; renderMine(); autoStep();
  }

  /* ---------------- 前輩百次回憶（v0.10.11） ---------------- */
  const MEM = () => (M2().memories || {});
  const memDef = b => { const d = MEM()[b]; return d && Array.isArray(d.lines) && d.lines.length ? d : null; };
  const memNeed = () => Math.max(1, Number(MEM().need) || 100);
  /* 給之後的「深度信賴台詞」判斷用：這位前輩的回憶拿到了沒 */
  const hasMemory = b => !!save.senpai.memories[b];
  let storyFresh = false;     // true＝剛觸發，敘述框還在顯示那一揮的成功結果，先不要蓋掉
  let storyAt = 0;            // 上一次推進的時間，避免連點直接按掉最後確認
  let storyDoneAt = 0;        // 收下回憶的時間
  /* 只在 dateWin 時呼叫。回傳 true＝這一次剛好觸發回憶 */
  function senpaiWin(boss) {
    const S = save.senpai;
    S.wins[boss] = (S.wins[boss] || 0) + 1;
    if (S.wins[boss] >= memNeed() && !S.memories[boss] && !S.story && memDef(boss)) {
      S.story = { boss, step: 0 };
      storyAt = Date.now();
      return true;
    }
    return false;
  }
  function storyLogEl() {
    let el = $("storyLog");
    if (!el) { el = document.createElement("div"); el.id = "storyLog"; el.className = "story-log"; $("sceneStage").appendChild(el); }
    return el;
  }
  /* 每次 renderMine 都會呼叫：有回憶就把上方畫成對話紀錄、下方改成「點擊繼續」；沒有就收掉 */
  function storySync() {
    const S = save.senpai.story, sceneEl = $("scene");
    // 回憶播放中收起「工具耐久／手動／離開」整列，讓出閱讀空間；結束就恢復
    $("scr-mine").classList.toggle("story-mode", !!(S && memDef(S.boss)));
    if (!S) {
      if (sceneEl.classList.contains("story-on")) { sceneEl.classList.remove("story-on"); storyLogEl().innerHTML = ""; }
      return;
    }
    const d = memDef(S.boss);
    if (!d) { save.senpai.story = null; persist(); sceneEl.classList.remove("story-on"); return; }
    const N = d.lines.length, step = Math.min(S.step, N), name = bossName2(S.boss);
    sceneEl.classList.add("story-on");
    sceneEl.classList.remove("vein-on");
    const log = storyLogEl();
    // 展示框只放對話（標題與進度在下方敘述框）；取得的收藏品在收下時才揭曉
    log.innerHTML = d.lines.slice(0, step).map((l, i) => `<div class="story-line${i === step - 1 ? " new" : ""}">${esc(l)}</div>`).join("");
    storyFit(log);
    const tap = step >= N ? "▼ 收下回憶並繼續" : "▼ 點擊繼續";
    if (storyFresh) { $("tbTap").textContent = tap; }
    else {
      setTextbox([colored(`【${esc(name)}】的回憶〈${esc(d.title || "")}〉`, "#ffcc33"),
        colored(step >= N ? "回憶到這裡結束了。" : step ? `${step}／${N}` : `${name}好像有話要跟你說……`, config.theme.sub)],
        0, { tag: "≋ 珍貴回憶 ≋", tap });
    }
    $("textbox").classList.toggle("story-final", step >= N);
    setChoices(null);
  }
  /* 對話往下疊；超出展示框時貼齊最新一句，最舊的從上方淡出（.over 才加淡出遮罩） */
  function storyFit(log) {
    log.scrollTop = log.scrollHeight;
    log.classList.toggle("over", log.scrollHeight > log.clientHeight + 1);
  }
  window.addEventListener("resize", () => { const el = $("storyLog"); if (el && save.senpai.story) storyFit(el); });
  function storyTap() {
    const S = save.senpai.story; if (!S) return;
    const d = memDef(S.boss);
    if (!d) { save.senpai.story = null; persist(); renderMine(); return; }
    const now = Date.now();
    if (S.step < d.lines.length) {
      if (now - storyAt < 150) return;          // 同一下點擊被重複觸發
      S.step++; storyAt = now; storyFresh = false;
      persist(); renderMine(); return;
    }
    if (now - storyAt < 600) return;            // 最後一句剛出來，不讓連點直接按掉
    storyFinish();
  }
  function storyFinish() {
    const S = save.senpai.story; if (!S) return;
    const b = S.boss, d = memDef(b) || {};
    if (!save.senpai.memories[b]) save.senpai.memories[b] = { date: dayOrLast(), wins: save.senpai.wins[b] || 0 };
    save.senpai.story = null;
    storyFresh = false;
    storyDoneAt = Date.now();
    persist();
    $("textbox").classList.remove("story-final");
    renderMine();
    setTextbox([colored(`獲得了「${esc(d.item || "")}」`, "#ffcc33"),
      colored("收在「紀錄」頁〈成就〉的「珍貴回憶」裡", config.theme.sub),
      colored("前輩的心意還在——點擊繼續挖礦", config.theme.accent)], 0);
    const big = $("sceneBig");
    $("sceneSub").textContent = "收藏品・不能出售";
    big.innerHTML = colored(esc(d.item || ""), "#ffcc33"); big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    toast(`獲得「${d.item || ""}」`);
  }

  /* ---------------- 背包（只看，不賣） ---------------- */
  function renderBag() {
    const tools = [...save.tools].sort((a, b) => toolDef(b.id).tier - toolDef(a.id).tier || b.dur - a.dur);
    const act = activeTool(), mine = curMine();
    $("bagPlays").textContent = `合計可挖 ${fmt(totalPlays())} 次`;
    const icon = id => config.images["tool_" + id] ? `<div class="icon" style="background-image:url(${config.images["tool_" + id]})"></div>` : "";
    $("bagTools").innerHTML = tools.length ? tools.map(t => {
      const d = toolDef(t.id), eq = act && act.uid === t.uid, f = toolFactor(t, mine);
      return `<div class="row ${eq ? "equipped" : ""}">${icon(t.id)}
        <div class="grow"><span style="color:${rarityColor(d.rarity)}">${d.name}</span> <span class="sub">${t.dur}/${t.max}</span>${f < 1 ? ` <span style="color:#ff7755;font-size:.8em">此礦坑收益${Math.round(f * 100)}%</span>` : ""}
        <div class="bar"><div class="bar-fill" style="width:${t.dur / t.max * 100}%;background:${t.dur / t.max > .5 ? "#55ff55" : t.dur / t.max > .2 ? "#ffcc33" : "#ff5555"}"></div></div></div>
        ${eq ? '<span class="sub">使用中</span>' : `<button class="px-btn small" data-equip="${t.uid}">裝備</button>`}</div>`;
    }).join("") : '<div class="sub">沒有工具</div>';

    const idx = itemIndex();
    const names = oreNames();
    const total = sellTotal(names.map(n => [n, save.ores[n]]));
    $("bagOres").innerHTML = names.length ? names.map(n => {
      const p = itemPrice(n), c = save.ores[n];
      return `<div class="row"><div class="grow"><span style="color:${rarityColor(idx[n].cat.rarity)}">${n}</span> ×${c}
        <div class="sub">單價 $${money2(p)}</div></div></div>`;
    }).join("") : '<div class="sub">背包是空的</div>';
    $("bagOreTotal").textContent = names.length ? `總價值 $${money(total)}` : "";
    renderHud();
  }
  /* 前輩信賴＋珍貴回憶（收藏品，不是礦石：不進 save.ores、不能賣、不算圖鑑） */
  /* 成就頁（v0.10.12）：目前放前輩信賴與珍貴回憶；挖礦紀錄類成就先保留位置，見 BACKLOG */
  function renderAch() { renderSenpaiBag(); }
  function renderSenpaiBag() {
    const S = save.senpai, need = memNeed(), gold = "#ffcc33";
    const bosses = (M2().bosses || []).filter(b => memDef(b.id));
    $("bagSenpaiSince").textContent = S.since ? `自 v${S.since} 開始記錄` : "自此版本開始記錄";
    $("bagSenpai").innerHTML = bosses.map(b => {
      const w = S.wins[b.id] || 0, got = S.memories[b.id], d = memDef(b.id);
      const pct = Math.min(100, w / need * 100);
      const note = got ? colored(`已獲得：${esc(d.item)}`, gold)
        : (S.story && S.story.boss === b.id) ? colored("回憶還沒看完——回到礦坑點擊繼續", gold)
        : `<span class="sub">獎勵：${esc(b.name)}好像有話要跟你說……</span>`;
      return `<div class="row senpai-row"><div class="grow"><span>${esc(b.name)}</span> <span class="sub">談話成功 ${fmt(Math.min(w, need))}／${need}${w > need ? `（共 ${fmt(w)}）` : ""}</span>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${got ? gold : ""}"></div></div>
        <div class="senpai-note">${note}</div></div></div>`;
    }).join("");
    const owned = bosses.filter(b => S.memories[b.id]);
    $("bagMemCount").textContent = `${owned.length}／${bosses.length}`;
    $("bagMemory").innerHTML = bosses.map(b => {
      const m = S.memories[b.id], d = memDef(b.id);
      return m
        ? `<div class="row memory-row"><div class="grow">${colored(esc(d.item), gold)}<div class="sub">〈${esc(d.title || "")}〉　取得於 ${esc(m.date || "")}｜收藏品・不能出售</div></div></div>`
        : `<div class="row memory-row locked"><div class="grow"><span class="sub">？？？？？</span><div class="sub">與某位前輩談話成功 ${need} 次</div></div></div>`;
    }).join("");
  }
  function oreNames() {
    const idx = itemIndex();
    return Object.keys(save.ores).filter(n => save.ores[n] > 0 && idx[n])
      .sort((a, b) => idx[b].cat.rarity - idx[a].cat.rarity || idx[b].mine.mult - idx[a].mine.mult);
  }
  /* 出售礦石。
     n 可以是 Infinity（全賣）。真正扣的數量一律以**呼叫當下的庫存**為準，
     不相信畫面上比較早取得的數字——玩家可能在拉完滑桿之後又去挖礦或交付委託。 */
  function sell(name, n) {
    const have = save.ores[name] || 0;
    const want = Math.floor(Number(n));
    if (!have) { toast("背包裡沒有這個礦石了"); delete sellQty[name]; renderShop(); return; }
    if (!isFinite(want) && n !== Infinity) { toast("數量不正確"); return; }
    if (n !== Infinity && (!Number.isFinite(want) || want < 1)) { toast("數量要是 1 以上的整數"); return; }
    const c = Math.min(n === Infinity ? have : want, have);
    if (c < 1) return;
    const short = (n !== Infinity && want > have);
    const gain = sellTotal([[name, c]]);
    save.ores[name] -= c; if (save.ores[name] <= 0) delete save.ores[name];
    save.coins = Math.round((save.coins + gain) * 10) / 10;
    sellQty[name] = 1;
    if (((itemIndex()[name] || {}).cat || {}).rarity >= 4) bossLine = TK().rareSell;   // 紫／金礦
    toast(`${short ? `只剩 ${have} 個｜` : ""}賣出 ${name} ×${c}  +$${money(gain)}`);
    persist(); renderShop();
  }
  const sellQty = {};   // 每種礦石目前選的出售數量（只是 UI 狀態，不進存檔）
  /* 滑桿／數字框改動時即時同步，不出售任何東西 */
  function sellSetQty(name, v) {
    const have = save.ores[name] || 0;
    if (!have) { renderShop(); return; }
    const raw = Number(v);
    let q = Math.floor(raw);
    let fixed = !Number.isInteger(raw);          // 小數會被無條件捨去，要讓玩家看得出來
    if (!Number.isFinite(q) || q < 1) { q = 1; fixed = true; }
    if (q > have) { q = have; fixed = true; }
    sellQty[name] = q;
    const range = document.querySelector(`[data-ore-range="${cssQ(name)}"]`);
    const num = document.querySelector(`[data-ore-num="${cssQ(name)}"]`);
    const info = document.querySelector(`[data-ore-info="${cssQ(name)}"]`);
    const btn = document.querySelector(`[data-ore-sell="${cssQ(name)}"]`);
    if (range) range.value = q;
    if (num) num.value = q;
    if (info) {
      info.textContent = `本次出售 ×${q}｜出售後剩餘 ×${have - q}｜可得 $${money(sellTotal([[name, q]]))}`;
      info.style.color = fixed ? "#ffcc33" : "";
      if (fixed) setTimeout(() => { if (info) info.style.color = ""; }, 900);
    }
    if (btn) btn.textContent = `賣出 ${q} 個`;
    return { q, fixed };
  }
  const cssQ = s => String(s).replace(/["\\]/g, "\\$&");

  /* ---------------- 地圖 ---------------- */
  function renderMap() {
    checkDay();
    $("mapList").innerHTML = config.mines.map(m => {
      const unlocked = save.unlocked.includes(m.id), ms = mineStats(m.id);
      const need = stdOfTier(m.tier);
      const here = m.id === save.mineId;
      const epicRate = ms.epic ? `1/${Math.round(ms.normalSwings / ms.epic)}` : "—";
      const btn = here ? '<span class="sub">所在地</span>'
        : unlocked ? `<button class="px-btn small" data-go-mine="${m.id}">${locked(m.id) ? "🔒 " : ""}前往</button>`
        : `<button class="px-btn small" data-unlock="${m.id}" ${save.coins < m.unlock ? "disabled" : ""}>解鎖 $${fmt(m.unlock)}</button>`;
      const side = unlocked ? `<div class="map-btns">${btn}<button class="px-btn small" data-scope-at="${m.id}">觀測 ▶</button></div>` : btn;
      return `<div class="row ${here ? "equipped" : ""} ${unlocked ? "" : "locked"}">
        <div class="grow"><span style="color:${rarityColor(m.tier)}">${m.name}</span> <span class="sub">×${m.mult}</span>
        <div class="sub map-guard">${guardText(m)}</div>
        <div class="sub">${m.engine === 2 ? "玩法不同｜" : ""}建議 ${need ? need.name : "?"}${unlocked ? `｜<span class="nowrap">今日此坑 ${fmt(ms.swings)} 揮</span>` + (m.engine === 2 ? "" : ` <span class="nowrap">礦脈${ms.hits} 紫${epicRate}</span>`) : ""}${unlocked && glassSeen(m.id).length ? "｜" + glassSeen(m.id).map(e => { const r = glassResult(e); return `<span style="color:${r.color};${r.badge ? "border:2px double " + r.color + ";padding:0 4px;" : ""}">${r.icon}</span>`; }).join(" ") : ""}${dbg("showSetting") ? `｜<span style="color:#ff4fd8">設定${todaySetting(m.id)}</span>` : ""}</div></div>${side}</div>`;
    }).join("");
  }
  /* 帳號（2026-10-03）：點頂部名字進來；名字＋雲端存檔／玩家 ID（原本放在地圖頁最下面） */
  let acctBack = "mine";
  function renderAcct() { $("acctName").textContent = save.name || "玩家"; renderCloud(); }

  /* 探索保障（內部叫天井）：顯示的揮數必須跟引擎真正用的門檻一致
     第一種：engine.js 用 mine.tenjou 比 sinceHit → 到達後進入「礦脈前兆」，前兆結束才開礦脈
     前輩礦坑：engine2.js 用 machine2.tenjou 比 sinceAt → 到達後好感度最高的前輩找你談話（成不成功照常抽） */
  function guardText(m) {
    if (m.engine === 2) return `探索保障 ${fmt(M2().tenjou || 0)} 揮：一直沒有前輩找你，就會有前輩主動來談話（不保證成功）`;
    return `探索保障 ${fmt(m.tenjou || 800)} 揮：一直沒碰到礦脈，就會先出現礦脈前兆`;
  }

  /* ---------------- 雲端存檔（介面） ---------------- */
  const CLOUD_TXT = { off: "未設定", out: "未登入", in: "已連線", busy: "同步中…", error: "同步失敗" };
  function renderCloud() {
    const box = $("cloudPanel"); if (!box) return;
    if (!window.Cloud || !Cloud.enabled()) {
      box.innerHTML = `<div class="panel-title">雲端存檔 <span class="sub">未設定</span></div>
        <div class="sub">還沒填入 Supabase 連線資料，目前是單機存檔（換手機會不見）。</div>`;
      return;
    }
    const st = Cloud.status(), u = Cloud.user();
    pidAccount(u);
    const dot = st === "in" || st === "busy" ? "#55ff55" : st === "error" ? "#ff5555" : "#888";
    box.innerHTML = `<div class="panel-title">雲端存檔
        <span class="sub"><span style="color:${dot}">●</span> ${CLOUD_TXT[st] || st}</span></div>
      <div class="sub">${u ? u.email : "登入之後，存檔會自動同步，換手機也接得回來。"}</div>
      ${u ? `<div class="pid-box"><span class="sub">玩家 ID</span>
              <span class="pid-num ${pidStyle === "rainbow" ? "rainbow" : ""}" id="pidNum">${playerId ? esc(playerId) : pid.st === "fail" ? "—" : "……"}</span>
              ${pid.st === "fail" && !playerId ? `<button class="px-btn small" id="pidRetry" ${pid.busy ? "disabled" : ""}>重試</button>` : `<button class="px-btn small" id="pidCopy" ${playerId ? "" : "disabled"}>複製</button>`}</div>
             ${pid.st === "fail" && !playerId ? `<div class="sub" id="pidMsg" style="color:#ffcc33">暫時無法取得玩家 ID${pid.timer ? "，稍後會自動再試一次" : "，可以按「重試」"}。</div>` : ""}
             <div class="sub" style="opacity:.75">需要補發獎勵時，可以把這組 ID 提供給管理員。</div>` : ""}
      ${st === "error" ? `<div class="sub" style="color:#ff5555">${Cloud.error()}</div>` : ""}
      <div class="btns" style="margin-top:8px">
        ${u ? `<button class="px-btn small" id="cldPush">立刻上傳</button>
               <button class="px-btn small" id="cldPull">下載雲端存檔</button>
               <button class="px-btn small" id="cldOut">登出</button>`
            : `<button class="px-btn small" id="cldIn">登入</button>
               <button class="px-btn small" id="cldReg">註冊新帳號</button>`}
      </div>`;
    const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
    on("cldIn", () => askCloudLogin(false));
    on("cldReg", () => askCloudLogin(true));
    on("cldOut", async () => { await Cloud.signOut(); cloudBlocked = null; mailLoaded = false; pidReset(null); adminSeen = false; loadMail(true); renderCloud(); toast("已登出雲端"); });
    on("cldPush", async () => { const r = await cloudPush(); if (r && r.blocked) return showBlocked(); toast(r && r.ok ? "已上傳雲端" : "上傳失敗"); });
    on("cldPull", cloudPullAsk);
    on("pidCopy", () => copyText(playerId, "已複製玩家 ID " + playerId));
    on("pidRetry", () => loadPlayerId(true, true));
    if (u && pid.st === "idle") loadPlayerId();   // 只有「這個帳號還沒問過」才自動問；失敗後不會因為重畫而再打
  }

  /* ---------------- 玩家 ID ----------------
     六碼純數字，由資料庫產生並綁定帳號。前端只是顯示，不參與配號。 */
  /* 2026-09-30：查不到（空結果或請求錯誤）不再「重畫→再查→重畫」無限循環。
     每個帳號在這次頁面生命週期有一份狀態 pid：idle（還沒問）／ok／fail。
     失敗後只照 PID_RETRY 的間隔自動再試有限次，用完就停，只能按「重試」。
     登出、換帳號（user.id 不同）時整份狀態清掉，舊帳號還在路上的回應也會被丟掉（gen）。 */
  const PID_RETRY = [5000, 20000];   // 失敗後自動重試的等待時間（毫秒）；總共最多 1＋2 次自動請求
  let playerId = null, pidStyle = "normal";
  let pid = { acct: null, st: "idle", busy: false, auto: 0, timer: null, gen: 0 };
  function pidReset(acct) {
    clearTimeout(pid.timer);
    pid = { acct, st: "idle", busy: false, auto: 0, timer: null, gen: pid.gen + 1 };
    playerId = null; pidStyle = "normal";
  }
  function pidAccount(u) {
    const acct = u ? String(u.id || u.email || "?") : null;
    if (acct !== pid.acct) pidReset(acct);
  }
  async function loadPlayerId(force, manual) {
    if (!cloudOn() || !window.Cloud.myPlayerProfile) return null;
    pidAccount(Cloud.user());
    if (!pid.acct || pid.busy) return playerId;
    clearTimeout(pid.timer); pid.timer = null;
    if (manual) pid.auto = PID_RETRY.length;   // 手動重試失敗就停在失敗畫面，不再自動排程
    const gen = pid.gen;
    pid.busy = true;
    if (pid.st === "idle") pid.st = "loading";
    if (manual) renderCloud();                 // 重試按鈕先變灰，避免連點
    let p = null;
    try { p = await Cloud.myPlayerProfile(force || pid.st === "fail"); } catch (e) { p = null; }
    if (gen !== pid.gen) return null;          // 等待期間已登出或換帳號：丟掉這個回應
    pid.busy = false;
    if (p && p.player_id) {
      playerId = String(p.player_id); pidStyle = p.id_style || "normal"; pid.st = "ok";
    } else {
      playerId = null; pidStyle = "normal"; pid.st = "fail";
      if (pid.auto < PID_RETRY.length) pid.timer = setTimeout(() => { pid.timer = null; loadPlayerId(true); }, PID_RETRY[pid.auto++]);
    }
    renderCloud();
    return playerId;
  }
  /* 複製：優先用 clipboard API，失敗就退回選取（有些手機瀏覽器擋 clipboard） */
  function copyText(txt, okMsg) {
    if (!txt) return;
    const done = () => toast(okMsg || "已複製");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(txt)).then(done).catch(() => fallback());
    } else fallback();
    function fallback() {
      try {
        const ta = document.createElement("textarea");
        ta.value = String(txt); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
        done();
      } catch (e) { toast("這個瀏覽器不讓複製，請手動抄下來：" + txt); }
    }
  }

  function askCloudLogin(isReg) {
    const box = $("modalBox");
    box.innerHTML = `<div>${isReg ? "註冊雲端帳號" : "登入雲端"}</div>
      <div class="sub" style="margin-top:6px">用來把存檔存到雲端，換手機也接得回來。</div>
      <input id="cEmail" type="email" placeholder="Email" autocomplete="email">
      <input id="cPass" type="password" placeholder="密碼（至少 6 碼）" autocomplete="${isReg ? "new-password" : "current-password"}">
      <div class="sub hidden" id="cErr" style="color:#ff5555"></div>
      <div class="btns"><button class="px-btn" id="cOk">${isReg ? "註冊" : "登入"}</button><button class="px-btn" id="cNo">取消</button></div>`;
    $("modal").classList.remove("hidden");
    const err = m => { const e = $("cErr"); e.textContent = m; e.classList.remove("hidden"); };
    $("cNo").onclick = () => $("modal").classList.add("hidden");
    $("cOk").onclick = async () => {
      const em = ($("cEmail").value || "").trim(), pw = $("cPass").value || "";
      if (!em || !pw) return err("Email 和密碼都要填");
      if (isReg && pw.length < 6) return err("密碼至少 6 碼");
      $("cOk").disabled = true;
      const r = isReg ? await Cloud.signUp(em, pw) : await Cloud.signIn(em, pw);
      $("cOk").disabled = false;
      if (!r.ok) return err(r.err || "失敗");
      if (isReg && !r.signedIn) { $("modal").classList.add("hidden"); renderCloud(); return toast("已寄出驗證信，收信點確認後再登入"); }
      $("modal").classList.add("hidden");
      renderCloud();
      afterLogin();
    };
  }

  /* 登入後：雲端已經有存檔就讓玩家選一邊，沒有就直接上傳 */
  async function afterLogin() {
    let row = null;
    try { row = await Cloud.pull(); } catch (e) { toast("讀取雲端失敗"); renderCloud(); return; }
    loadMail(true);
    if (!row) { await cloudPush(); renderCloud(); return toast("已把這台的存檔上傳雲端"); }
    pickSave(row);
  }
  async function cloudPullAsk() {
    let row = null;
    try { row = await Cloud.pull(); } catch (e) { return toast("讀取雲端失敗"); }
    if (!row) return toast("雲端還沒有存檔");
    pickSave(row);
  }
  function pickSave(row) {
    const stale = staleVs(row);
    const when = row.updated_at ? new Date(row.updated_at).toLocaleString() : "—";
    const box = $("modalBox");
    box.innerHTML = `<div>要留哪一邊的存檔？</div>
      <div class="sub" style="margin-top:8px;text-align:left">
        <b>雲端</b>：${row.name || "（無名）"}　$${fmt(row.coins || 0)}<br>
        <span class="sub">最後上傳 ${when}</span><br><br>
        <b>這台手機</b>：${save.name || "（無名）"}　$${fmt(save.coins)}
      </div>
      ${stale ? STALE_NOTE : `<div class="sub" style="color:#ff5555;margin-top:8px">沒選到的那一邊會被覆蓋掉。</div>`}
      <div class="btns"><button class="px-btn" id="useCloud">用雲端的</button>${stale ? "" : `<button class="px-btn" id="useLocal">用這台的</button>`}</div>`;
    $("modal").classList.remove("hidden");
    $("useCloud").onclick = () => {
      $("modal").classList.add("hidden");
      if (!row.data || row.data.v !== 1) return toast("雲端存檔格式不對");
      if (stale) staleBackup("login");
      adoptSave(row); toast("已接回雲端存檔");
    };
    if (stale) return;
    $("useLocal").onclick = async () => {
      $("modal").classList.add("hidden");
      const r = await Cloud.pushOver(save, row.rev);   // 接手雲端的 rev 再蓋過去
      renderCloud();
      if (r && r.blocked) { cloudBlocked = r.blocked; showBlocked(); return; }
      toast(r && r.ok ? "已用這台的存檔覆蓋雲端" : "上傳失敗");
    };
  }

  /* ---------------- 信箱（雲端發送的公告與獎勵） ---------------- */
  let mailCache = { mail: [], claimed: {} }, mailLoaded = false;
  /* 本機驗收用測試信（只限 localhost＋?sandbox=…&mailtest=1）：一封「免費委託板重置 ×10」，領取紀錄存在 sandbox 的 localStorage，不連雲端 */
  const MAIL_TEST = SANDBOX && /[?&]mailtest=1/.test(location.search), MAIL_TEST_KEY = "mine_mailtest_claims_v1" + SB;
  const mailTestBox = () => ({ mail: [{ id: 900001, title: "（本機測試）免費委託板重置", body: "只在本機測試網址出現，不會寄給任何玩家。", coins: 0, ore_qty: 0, tool_qty: 0, board_resets: 10,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }], claimed: store.get(MAIL_TEST_KEY) || {} });
  function mailTestClaim(id) {
    const c = store.get(MAIL_TEST_KEY) || {};
    if (c[id]) return { ok: false, err: "這封信已經領過了" };
    c[id] = true; store.set(MAIL_TEST_KEY, c);
    return { ok: true };
  }
  function mailUnread() { return mailCache.mail.filter(m => !mailCache.claimed[m.id] && !mailExpired(m)).length; }
  const mailExpired = m => !!(m._expired || (m.expires_at && new Date(m.expires_at) < new Date()));   // _expired＝伺服器已判定過期（裝置時間可能不準）
  function renderMailBadge() {
    const b = $("mailDot"); if (!b) return;
    const n = mailUnread();
    b.textContent = n > 99 ? "99+" : n;
    b.classList.toggle("hidden", n === 0);
  }
  async function loadMail(force) {
    if (!cloudOn()) { mailCache = MAIL_TEST ? mailTestBox() : { mail: [], claimed: {} }; renderMailBadge(); return; }
    if (mailLoaded && !force) return;
    try { mailCache = await Cloud.mailbox(); mailLoaded = true; } catch (e) { mailCache = { mail: [], claimed: {} }; }
    renderMailBadge();
  }
  function mailReward(m) {
    const parts = [];
    if (m.coins) parts.push("$" + fmt(m.coins));
    if (m.ore_name && m.ore_qty) parts.push(m.ore_name + " ×" + m.ore_qty);
    if (m.tool_id && m.tool_qty) { const t = toolDef(m.tool_id); parts.push((t ? t.name : m.tool_id) + " ×" + m.tool_qty); }
    const br = mailCredits(m); if (br) parts.push("免費委託板重置 ×" + br);
    return parts.join("　");
  }
  function mailRow(m) {
    const got = !!mailCache.claimed[m.id], old = mailExpired(m), rw = mailReward(m);
    const when = m.created_at ? new Date(m.created_at).toLocaleDateString() : "";
    const state = old
      ? `<span class="mail-status mail-expired">${got ? "已領取・過期" : "過期"}</span>`
      : got ? '<span class="mail-status">已領取</span>'
      : rw ? `<button class="px-btn small" data-claim="${m.id}">領取</button>`
      : `<button class="px-btn small" data-claim="${m.id}">已讀</button>`;
    return `<div class="row mail-row">
      <div><b>${esc(m.title)}</b> <span class="sub">${when}${m.to_user ? "｜給你的" : ""}</span></div>
      ${m.body ? `<div class="sub mail-body">${esc(m.body)}</div>` : ""}
      ${rw ? `<div class="sub mail-reward">附件：${esc(rw)}</div>` : ""}
      <div class="mail-state">${state}</div>
    </div>`;
  }
  function mailSection(title, list, empty) {
    return `<section class="mail-section" data-mail-section="${title}">
      <div class="mail-section-title"><b>${title}</b><span class="sub">${list.length}</span></div>
      ${list.length ? list.map(mailRow).join("") : `<div class="sub mail-empty">${empty}</div>`}
    </section>`;
  }
  /* 2026-10-03 擁有者要求：未領取／領取紀錄改成切換式分頁（沿用紀錄頁 subtab 樣式）。每次從信箱鈕打開都回到「未領取」 */
  let mailTab = "unread";
  function openMail() {
    const box = $("modalBox");
    const unread = [], settled = [];
    mailCache.mail.forEach(m => (mailCache.claimed[m.id] || mailExpired(m) ? settled : unread).push(m));
    const rows = mailTab === "settled"
      ? mailSection("領取紀錄", settled, "目前沒有已領取或過期信件。")
      : mailSection("未領取", unread, "目前沒有未領取信件。");
    box.innerHTML = `<div>信箱</div>
      <div class="sub" style="margin-top:4px">${cloudOn() ? "" : "要先登入雲端才收得到信。"}</div>
      <div class="subtabs mail-tabs" role="tablist">
        <button class="subtab ${mailTab === "unread" ? "on" : ""}" data-mail-tab="unread" role="tab" aria-selected="${mailTab === "unread"}">未領取 ${unread.length}</button>
        <button class="subtab ${mailTab === "settled" ? "on" : ""}" data-mail-tab="settled" role="tab" aria-selected="${mailTab === "settled"}">領取紀錄 ${settled.length}</button>
      </div>
      <div class="list mail-list">${rows}</div>
      <div class="btns"><button class="px-btn" id="mailRe">重新整理</button>
        ${adminSeen ? '<button class="px-btn" id="mailAdmin">管理信箱</button>' : ""}
        <button class="px-btn" id="mailNo">關閉</button></div>`;
    $("modal").classList.remove("hidden");
    $("mailNo").onclick = () => $("modal").classList.add("hidden");
    $("mailRe").onclick = async () => { await loadMail(true); openMail(); };
    const adm = $("mailAdmin"); if (adm) adm.onclick = () => openAdminMail();
    box.querySelectorAll("[data-claim]").forEach(b => { b.onclick = () => claimMail(+b.dataset.claim, b); });
    box.querySelectorAll("[data-mail-tab]").forEach(b => { b.onclick = () => { mailTab = b.dataset.mailTab; openMail(); }; });
    checkAdmin();   // 查完才會顯示管理按鈕（查到是管理員會重畫一次）
  }
  /* 管理員判斷：等 Cloud.isAdmin() 回 true 才顯示入口。
     這只是「不要讓一般玩家看到按鈕」，真正的安全邊界在資料庫的 RPC。 */
  let adminSeen = false, adminChecking = false;
  async function checkAdmin() {
    if (adminSeen || adminChecking || !cloudOn()) return adminSeen;
    adminChecking = true;
    let r = false;
    try { r = await Cloud.isAdmin(); } catch (e) { r = false; }
    adminChecking = false;
    if (r && !adminSeen) {
      adminSeen = true;
      if (!$("modal").classList.contains("hidden") && $("modalBox").textContent.indexOf("信箱") === 0) openMail();
    }
    return r;
  }
  async function claimMail(id, btn) {
    const m = mailCache.mail.find(x => x.id === id); if (!m) return;
    if (mailExpired(m)) { toast("這封信已過期"); openMail(); return; }
    btn.disabled = true;
    const r = MAIL_TEST ? mailTestClaim(id) : await Cloud.claim(id);
    if (!r.ok) { btn.disabled = false; toast(r.err || "領取失敗"); if (r.expired) { m._expired = true; openMail(); } return; }   // 伺服器判定過期（docs/18）：畫面也改成過期、不再顯示領取鈕
    mailCache.claimed[id] = true;
    if (m.coins) save.coins += m.coins;
    if (m.ore_name && m.ore_qty) save.ores[m.ore_name] = (save.ores[m.ore_name] || 0) + m.ore_qty;
    if (m.tool_id && m.tool_qty && isStd(m.tool_id)) for (let i = 0; i < m.tool_qty; i++) addTool(m.tool_id, 1);   // 信箱只發標準鎬子（試用／付費品不能從這裡取得）
    if (mailCredits(m)) save.boardCredits = normCredits(normCredits(save.boardCredits) + mailCredits(m));
    persist(true); renderAll(); renderMailBadge();
    const rw = mailReward(m);
    toast(rw ? "領取成功：" + rw : "已讀");
    openMail();
  }

  /* ---------------- 管理信箱（v0.10.8） ----------------
     只有 Cloud.isAdmin() 為 true 的帳號會看到入口。
     但前端藏按鈕不是安全機制——每一個動作都是 Supabase RPC，
     資料庫端的 is_admin_caller() 會再驗一次，一般玩家在主控台硬呼叫也會被擋。 */
  const ADM = {                      // 表單狀態（不進存檔）
    tab: "send", mode: "self", playerId: "", title: "", body: "", days: 30,
    coins: 0, ore: "", oreQty: 0, tool: "", toolQty: 0, boardResets: 0,
    sending: false, sentKey: "", lastMailId: null,
    curPid: "", newPid: "", note: "", changing: false,
    styleId: "", styleInfo: null, styling: false,
    rows: null, listing: false, listErr: ""
  };
  const admFormKey = () => JSON.stringify([ADM.mode, ADM.playerId, ADM.title, ADM.body, ADM.days,
    ADM.coins, ADM.ore, ADM.oreQty, ADM.tool, ADM.toolQty, ADM.boardResets]);

  function openAdminMail() {
    const box = $("modalBox");
    const oreOpts = oreNamesAll().map(n => `<option value="${esc(n)}" ${ADM.ore === n ? "selected" : ""}>${esc(n)}</option>`).join("");
    const toolOpts = stdTools().map(t => `<option value="${esc(t.id)}" ${ADM.tool === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");
    const modeBtn = (m, label, danger) =>
      `<button data-adm-mode="${m}" class="${ADM.mode === m ? "on" : ""} ${danger ? "danger" : ""}">${label}</button>`;

    let inner = "";
    if (ADM.tab === "send") {
      inner = `
        <div class="adm-tabs">${modeBtn("self", "先寄給自己")}${modeBtn("player", "指定玩家 ID")}${modeBtn("all", "全體玩家", true)}</div>
        ${ADM.mode === "player" ? `<div class="adm-field"><label>玩家六碼 ID</label>
          <input id="admPid" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="例如 482739" value="${esc(ADM.playerId)}"></div>` : ""}
        ${ADM.mode === "all" ? '<div class="sub adm-warn">全體信會寄給每一個玩家，收回也追不回已領取的獎勵。</div>' : ""}
        <div class="adm-field"><label>標題（必填，最多 60 字）</label>
          <input id="admTitle" type="text" maxlength="60" value="${esc(ADM.title)}"></div>
        <div class="adm-field"><label>內文（最多 1000 字，可換行）</label>
          <textarea id="admBody" maxlength="1000">${esc(ADM.body)}</textarea></div>
        <div class="adm-row">
          <div class="adm-field"><label>金幣 0～1,000,000</label>
            <input id="admCoins" type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${ADM.coins}"></div>
          <div class="adm-field"><label>有效天數 1～365</label>
            <input id="admDays" type="number" inputmode="numeric" min="1" max="365" step="1" value="${ADM.days}"></div>
        </div>
        <div class="adm-row">
          <div class="adm-field"><label>礦石</label>
            <select id="admOre"><option value="">（不附礦石）</option>${oreOpts}</select></div>
          <div class="adm-field"><label>數量 0～999</label>
            <input id="admOreQty" type="number" inputmode="numeric" min="0" max="999" step="1" value="${ADM.oreQty}"></div>
        </div>
        <div class="adm-row">
          <div class="adm-field"><label>工具</label>
            <select id="admTool"><option value="">（不附工具）</option>${toolOpts}</select></div>
          <div class="adm-field"><label>數量 0～99</label>
            <input id="admToolQty" type="number" inputmode="numeric" min="0" max="99" step="1" value="${ADM.toolQty}"></div>
        </div>
        <div class="adm-row">
          <div class="adm-field"><label>免費委託板重置 0～99 次</label>
            <input id="admBoardResets" type="number" inputmode="numeric" min="0" max="99" step="1" value="${ADM.boardResets}"></div>
        </div>
        <div class="adm-preview">${admPreview()}</div>
        ${ADM.lastMailId ? `<div class="sub" style="color:#55ff55;margin-top:6px">上一封已寄出，mail ID = <b>${ADM.lastMailId}</b>。要再寄一封請按「再寄一封」。</div>` : ""}
        <div class="btns" style="margin-top:10px">
          ${ADM.sentKey === admFormKey()
            ? '<button class="px-btn" id="admAgain">再寄一封</button>'
            : `<button class="px-btn" id="admSend" ${ADM.sending ? "disabled" : ""}>${ADM.sending ? "寄送中…" : "寄出"}</button>`}
        </div>`;
    }
    if (ADM.tab === "pid") {
      inner = `
        <div class="sub" style="text-align:left;line-height:1.7">朋友註冊後會拿到隨機的六碼 ID，把他目前的 ID 填進來就能改成指定號碼。
          舊號碼會立刻釋出，之後可以再被配給別人。</div>
        <div class="adm-field"><label>目前的六碼 ID</label>
          <input id="admCur" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${esc(ADM.curPid)}"></div>
        <div class="adm-field"><label>要改成的六碼 ID</label>
          <input id="admNew" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${esc(ADM.newPid)}"></div>
        <div class="adm-field"><label>備註（只有管理員看得到，可留空）</label>
          <input id="admNote" type="text" maxlength="60" value="${esc(ADM.note)}"></div>
        <div class="btns" style="margin-top:10px">
          <button class="px-btn" id="admChange" ${ADM.changing ? "disabled" : ""}>${ADM.changing ? "處理中…" : "修改玩家 ID"}</button>
        </div>

        <div style="border-top:1px solid #2c2c36;margin:14px 0 8px"></div>
        <div class="sub" style="text-align:left;line-height:1.7">
          <b>彩色 ID（特別帳號）</b><br>一般玩家的 ID 是白色，指定為特別的帳號才會是流動的彩虹色。</div>
        <div class="adm-field"><label>要查詢／設定的六碼 ID</label>
          <input id="admStyleId" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${esc(ADM.styleId)}"></div>
        ${ADM.styleInfo ? `<div class="adm-preview">目前：<b style="color:${ADM.styleInfo.id_style === "rainbow" ? "#ff5fd0" : "#f2f2f5"}">${ADM.styleInfo.id_style === "rainbow" ? "彩虹（特別帳號）" : "一般"}</b>
            ｜號碼來源 ${esc(ADM.styleInfo.id_source || "-")}${ADM.styleInfo.admin_note ? "｜備註 " + esc(ADM.styleInfo.admin_note) : ""}</div>` : ""}
        <div class="btns" style="margin-top:8px">
          <button class="px-btn small" id="admStyleGet" ${ADM.styling ? "disabled" : ""}>查詢</button>
          <button class="px-btn small" id="admStyleOn" ${ADM.styling ? "disabled" : ""}>設為彩虹</button>
          <button class="px-btn small" id="admStyleOff" ${ADM.styling ? "disabled" : ""}>設回一般</button>
        </div>`;
    }
    if (ADM.tab === "log") {
      inner = ADM.listing ? '<div class="sub">讀取中…</div>'
        : ADM.listErr ? `<div class="sub adm-warn">${esc(ADM.listErr)}</div>`
        : !ADM.rows ? '<div class="sub">按「重新整理」載入寄件紀錄。</div>'
        : !ADM.rows.length ? '<div class="sub">還沒寄過任何信。</div>'
        : ADM.rows.map(r => {
            const rw = mailReward({ coins: r.coins, ore_name: r.ore_name, ore_qty: r.ore_qty, tool_id: r.tool_id, tool_qty: r.tool_qty, board_resets: r.board_resets });
            return `<div class="adm-mail">
              <div><b>#${r.id}</b> ${esc(r.title)}</div>
              <div class="sub">${esc(r.target)}${r.player_id ? "（" + esc(r.player_id) + "）" : ""}｜已領 ${r.claimed} 人</div>
              ${rw ? `<div class="sub" style="color:#ffcc33">附件：${esc(rw)}</div>` : ""}
              <div class="sub">寄出 ${fmtTime(r.sent_at)}｜到期 ${fmtTime(r.expires_at)}</div>
              <button class="px-btn small" data-adm-unsend="${r.id}" style="margin-top:4px">收回</button>
            </div>`;
          }).join("");
      inner += `<div class="btns" style="margin-top:10px"><button class="px-btn" id="admReload">重新整理</button></div>`;
    }

    box.innerHTML = `<div>管理信箱</div>
      <div class="adm-tabs" style="margin-top:8px">
        <button data-adm-tab="send" class="${ADM.tab === "send" ? "on" : ""}">寄信</button>
        <button data-adm-tab="pid" class="${ADM.tab === "pid" ? "on" : ""}">玩家 ID 管理</button>
        <button data-adm-tab="log" class="${ADM.tab === "log" ? "on" : ""}">寄件紀錄</button>
      </div>
      <div style="max-height:56vh;overflow:auto">${inner}</div>
      <div class="btns" style="margin-top:8px"><button class="px-btn" id="admBack">回信箱</button></div>`;
    $("modal").classList.remove("hidden");
    admBind();
  }

  function admPreview() {
    const who = ADM.mode === "all" ? '<span class="adm-warn">全體玩家</span>'
      : ADM.mode === "player" ? `指定玩家 ${esc(ADM.playerId || "（還沒填）")}` : "只有你自己";
    const rw = mailReward({ coins: +ADM.coins || 0, ore_name: ADM.ore, ore_qty: +ADM.oreQty || 0, tool_id: ADM.tool, tool_qty: +ADM.toolQty || 0, board_resets: +ADM.boardResets || 0 });
    const exp = new Date(Date.now() + (+ADM.days || 30) * 86400000);
    return `<b>玩家會看到這樣：</b><br>
      收件範圍：${who}<br>
      標題：${esc(ADM.title) || "<span class='adm-warn'>（還沒填）</span>"}<br>
      內文：${ADM.body ? esc(ADM.body).replace(/\n/g, "<br>") : "（空白）"}<br>
      附件：${rw ? esc(rw) : "（無，純公告）"}<br>
      到期：${exp.toLocaleDateString()}${+ADM.boardResets > 0 ? '<br><span class="adm-warn">免費委託板重置需要先套用 docs/14 的 SQL；新版遊戲上傳前不要寄給玩家（舊版領了會拿不到）。</span>' : ""}`;
  }
  function fmtTime(t) { return t ? new Date(t).toLocaleString() : "—"; }
  function oreNamesAll() {
    const out = [];
    config.mines.forEach(m => config.categories.forEach(c => {
      (m.items[c.id] || []).forEach(n => { if (out.indexOf(n) < 0) out.push(n); });
      ((m.veinItems || {})[c.id] || []).forEach(n => { if (out.indexOf(n) < 0) out.push(n); });
    }));
    Object.keys((config.machine2 || {}).prices || {}).forEach(n => { if (out.indexOf(n) < 0) out.push(n); });
    return out;
  }

  function admBind() {
    const box = $("modalBox"), on = (id, ev, f) => { const e = $(id); if (e) e[ev] = f; };
    box.querySelectorAll("[data-adm-tab]").forEach(b => { b.onclick = () => { ADM.tab = b.dataset.admTab; openAdminMail(); }; });
    box.querySelectorAll("[data-adm-mode]").forEach(b => { b.onclick = () => { ADM.mode = b.dataset.admMode; ADM.sentKey = ""; openAdminMail(); }; });
    $("admBack").onclick = () => openMail();

    /* mode: "text"（原樣）、"num"（只留數字、存成數字）、"pid"（只留數字、最多六碼、存成字串） */
    const live = (id, key, mode) => {
      const e = $(id); if (!e) return;
      e.oninput = () => {
        if (mode === "pid") {
          const v = e.value.replace(/[^\d]/g, "").slice(0, 6);
          if (e.value !== v) e.value = v;      // 直接把非數字從畫面上拿掉
          ADM[key] = v;
        } else if (mode === "num") {
          const v = e.value.replace(/[^\d]/g, "");
          if (e.value !== v) e.value = v;
          ADM[key] = v === "" ? "" : +v;
        } else ADM[key] = e.value;
        ADM.sentKey = "";
        const pv = box.querySelector(".adm-preview"); if (pv) pv.innerHTML = admPreview();
      };
    };
    live("admPid", "playerId", "pid"); live("admTitle", "title"); live("admBody", "body");
    live("admCoins", "coins", "num"); live("admDays", "days", "num");
    live("admOreQty", "oreQty", "num"); live("admToolQty", "toolQty", "num"); live("admBoardResets", "boardResets", "num");
    live("admCur", "curPid", "pid"); live("admNew", "newPid", "pid"); live("admNote", "note");
    { const e = $("admStyleId"); if (e) e.oninput = () => {
        const v = e.value.replace(/[^\d]/g, "").slice(0, 6);
        if (e.value !== v) e.value = v;
        if (v !== ADM.styleId) ADM.styleInfo = null;   // 換了號碼就別再顯示上一個人的狀態
        ADM.styleId = v;
      }; }
    on("admOre", "onchange", e => { ADM.ore = e.target.value; ADM.sentKey = ""; openAdminMail(); });
    on("admTool", "onchange", e => { ADM.tool = e.target.value; ADM.sentKey = ""; openAdminMail(); });

    on("admAgain", "onclick", () => { ADM.sentKey = ""; ADM.lastMailId = null; openAdminMail(); });
    on("admSend", "onclick", () => admSend());
    on("admChange", "onclick", () => admChangeId());
    on("admReload", "onclick", () => admLoadLog());
    on("admStyleGet", "onclick", () => admStyle("get"));
    on("admStyleOn", "onclick", () => admStyle("rainbow"));
    on("admStyleOff", "onclick", () => admStyle("normal"));
    box.querySelectorAll("[data-adm-unsend]").forEach(b => { b.onclick = () => admUnsend(+b.dataset.admUnsend); });
    if (ADM.tab === "log" && !ADM.rows && !ADM.listing && !ADM.listErr) admLoadLog();
  }

  /* 送出前的前端檢查。資料庫端會再驗一次同樣的規則，這裡只是早點告訴玩家。 */
  function admValidate() {
    const t = String(ADM.title || "").trim();
    if (!t) return "標題不能空白";
    if (t.length > 60) return "標題最多 60 字";
    if (String(ADM.body || "").length > 1000) return "內文最多 1000 字";
    const d = +ADM.days;
    if (!Number.isInteger(d) || d < 1 || d > 365) return "有效天數要在 1～365 之間";
    const c = +ADM.coins || 0;
    if (!Number.isInteger(c) || c < 0 || c > 1000000) return "金幣要在 0～1,000,000 之間";
    const oq = +ADM.oreQty || 0, tq = +ADM.toolQty || 0;
    if (!Number.isInteger(oq) || oq < 0 || oq > 999) return "礦石數量要在 0～999 之間";
    if (!Number.isInteger(tq) || tq < 0 || tq > 99) return "工具數量要在 0～99 之間";
    const br = +ADM.boardResets || 0;
    if (!Number.isInteger(br) || br < 0 || br > 99) return "免費委託板重置次數要在 0～99 之間";
    if (oq > 0 && !ADM.ore) return "有填礦石數量就要選礦石";
    if (tq > 0 && !ADM.tool) return "有填工具數量就要選工具";
    if (ADM.mode === "player" && !/^[1-9][0-9]{5}$/.test(String(ADM.playerId || ""))) return "玩家 ID 必須是 100000～999999 的六碼數字";
    return "";
  }

  function admSend() {
    if (ADM.sending) return;
    const bad = admValidate();
    if (bad) return toast(bad);
    const key = admFormKey();
    if (ADM.sentKey === key) return toast("這一封已經寄過了，要再寄請按「再寄一封」");

    const go = async () => {
      ADM.sending = true; openAdminMail();
      const r = await Cloud.adminSend({
        mode: ADM.mode, playerId: ADM.playerId, title: String(ADM.title).trim(), body: ADM.body,
        coins: +ADM.coins || 0, ore: ADM.ore || null, oreQty: +ADM.oreQty || 0,
        tool: ADM.tool || null, toolQty: +ADM.toolQty || 0, days: +ADM.days || 30, boardResets: +ADM.boardResets || 0
      });
      ADM.sending = false;
      if (!r.ok) { openAdminMail(); return toast(r.err || "寄送失敗"); }
      ADM.sentKey = key; ADM.lastMailId = r.mailId; ADM.rows = null;
      openAdminMail();
      toast("寄出成功，mail ID = " + r.mailId);
    };

    // 全體信要兩層確認；其他兩種一層
    if (ADM.mode === "all") admConfirm("⚠ 寄給全體玩家", admConfirmBody(), () => admConfirm("再確認一次", admConfirmBody() + '<br><span class="adm-warn">按下去就會寄給所有人。</span>', go));
    else admConfirm(ADM.mode === "player" ? "寄給玩家 " + esc(ADM.playerId) : "寄給自己", admConfirmBody(), go);
  }
  function admConfirmBody() {
    const rw = mailReward({ coins: +ADM.coins || 0, ore_name: ADM.ore, ore_qty: +ADM.oreQty || 0, tool_id: ADM.tool, tool_qty: +ADM.toolQty || 0, board_resets: +ADM.boardResets || 0 });
    return `標題：<b>${esc(String(ADM.title).trim())}</b><br>附件：${rw ? esc(rw) : "（無）"}<br>有效 ${+ADM.days || 30} 天`;
  }
  function admConfirm(head, html, yes) {
    const box = $("modalBox");
    box.innerHTML = `<div>${head}</div><div class="adm-preview">${html}</div>
      <div class="btns" style="margin-top:12px">
        <button class="px-btn" id="acYes">確定</button><button class="px-btn" id="acNo">取消</button></div>`;
    $("acYes").onclick = () => yes();
    $("acNo").onclick = () => openAdminMail();
  }

  async function admChangeId() {
    if (ADM.changing) return;
    ADM.changing = true; openAdminMail();
    const r = await Cloud.adminChangePlayerId(ADM.curPid, ADM.newPid, ADM.note);
    ADM.changing = false;
    if (!r.ok) { openAdminMail(); return toast(r.err || "修改失敗"); }
    const msg = `玩家 ID 已修改：${ADM.curPid} → ${ADM.newPid}`;
    ADM.curPid = ""; ADM.newPid = ""; ADM.note = "";
    openAdminMail(); toast(msg);
  }

  /* 查詢／切換某個玩家的 ID 樣式 */
  async function admStyle(mode) {
    if (ADM.styling) return;
    if (!/^[1-9][0-9]{5}$/.test(String(ADM.styleId || ""))) return toast("玩家 ID 必須是 100000～999999 的六碼數字");
    ADM.styling = true; openAdminMail();
    let r;
    if (mode === "get") r = await Cloud.adminGetPlayer(ADM.styleId);
    else r = await Cloud.adminSetIdStyle(ADM.styleId, mode);
    ADM.styling = false;
    if (!r.ok) { ADM.styleInfo = null; openAdminMail(); return toast(r.err || "操作失敗"); }
    if (mode === "get") { ADM.styleInfo = r.player; openAdminMail(); return; }
    // 設定成功後重查一次，畫面上顯示的就是資料庫的真實狀態
    const g = await Cloud.adminGetPlayer(ADM.styleId);
    ADM.styleInfo = g.ok ? g.player : null;
    if (String(ADM.styleId) === String(playerId)) loadPlayerId(true);   // 改到自己就即時更新
    openAdminMail(); toast(r.msg || "已更新");
  }

  async function admLoadLog() {
    ADM.listing = true; ADM.listErr = ""; openAdminMail();
    const r = await Cloud.adminListMail();
    ADM.listing = false;
    if (!r.ok) { ADM.listErr = r.err || "讀取失敗"; ADM.rows = null; }
    else { ADM.rows = r.rows; ADM.listErr = ""; }
    openAdminMail();
  }
  function admUnsend(id) {
    const row = (ADM.rows || []).find(x => x.id === id) || {};
    admConfirm("收回第 " + id + " 號信",
      `標題：<b>${esc(row.title || "")}</b><br>已經有 <b>${row.claimed || 0}</b> 個人領過。<br>
       <span class="adm-warn">已領取的獎勵不會被拿回來。</span>`,
      async () => {
        const r = await Cloud.adminUnsend(id);
        if (!r.ok) { openAdminMail(); return toast(r.err || "收回失敗"); }
        ADM.rows = null; ADM.tab = "log"; openAdminMail(); admLoadLog();
        toast(r.msg || "已收回");
      });
  }

  /* 「全部賣出」要先確認：它會連委託板需要的礦石一起賣掉 */
  function askSellAll(kinds, cnt, sum) {
    const box = $("modalBox");
    box.innerHTML = `<div>全部賣出？</div>
      <div class="sub" style="margin-top:8px;line-height:1.7">
        會賣掉 <b>${kinds}</b> 種礦石、共 <b>${cnt}</b> 個，可得 <b>$${money(sum)}</b>。<br>
        <span style="color:#ff7755">這裡面可能包含委託板需要的礦石，賣掉就要重挖。</span>
      </div>
      <div class="btns" style="margin-top:12px">
        <button class="px-btn" id="saYes">確定全部賣出</button>
        <button class="px-btn" id="saNo">取消</button></div>`;
    $("modal").classList.remove("hidden");
    $("saNo").onclick = () => $("modal").classList.add("hidden");
    $("saYes").onclick = () => {
      $("modal").classList.add("hidden");
      const names = oreNames(); if (!names.length) return renderShop();
      const s2 = sellTotal(names.map(n => [n, save.ores[n]]));
      if (names.some(n => ((itemIndex()[n] || {}).cat || {}).rarity >= 4)) bossLine = TK().rareSell;
      save.coins = Math.round((save.coins + s2) * 10) / 10; save.ores = {};
      Object.keys(sellQty).forEach(k => delete sellQty[k]);
      toast(`全部賣出 +$${money(s2)}`); persist(); renderShop();
    };
  }

  /* ---------------- 圖鑑 ---------------- */
  let dexMine = null;   // 圖鑑目前看的礦坑（2026-10-03：一次一座，不再整串往下滑）
  function renderDex() {
    let got = 0, all = 0;
    if (!config.mines.some(m => m.id === dexMine)) dexMine = save.mineId;
    const per = {};
    const html = config.mines.map(m => {
      let g = 0, a = 0;
      const cells = config.categories.filter(c => c.id !== "rubble").flatMap(c => (m.items[c.id] || []).concat((m.veinItems || {})[c.id] || []).map(n => {
        all++; a++; const d = save.dex[n]; if (d) { got++; g++; }
        return d ? `<div class="dex-cell"><div style="color:${rarityColor(c.rarity)}">${n}</div><div class="n">×${d.count}</div></div>`
                 : `<div class="dex-cell"><div style="color:${rarityColor(0)}">？？？</div><div class="n" style="color:${rarityColor(c.rarity)}">${config.rarities[c.rarity].name}</div></div>`;
      })).join("");
      per[m.id] = `${g}/${a}`;
      return m.id === dexMine ? `<div class="dex-mine"><div class="dex-grid">${cells}</div></div>` : "";
    }).join("");
    $("dexTabs").innerHTML = config.mines.map(m =>
      `<button data-dex-mine="${m.id}" class="${m.id === dexMine ? "on" : ""}">${esc(m.name)} <span class="sub">${per[m.id]}</span></button>`).join("");
    $("dexList").innerHTML = html;
    $("dexCount").textContent = `${got}/${all}`;
  }

  /* ---------------- 礦坑老闆 佐佐木 ---------------- */
  let bossView = "menu", bossLine = null;
  const B = () => config.boss;

  /* ---------------- 佐佐木的情境台詞（v0.10.13 本機） ----------------
     save.boss.talk：舊存檔沒有 → 用到時才補預設；次數從這一版開始記，不從等級反推。
       lines   交付過的委託「項目」數（一行算一次）
       boards  整張委託全部完成的次數
       lastVisit / lastLeave  上次進店／離店時間（毫秒）
       broke   有工具真的挖到壞掉，還沒被佐佐木提過
       trip    正在「三位前輩的考驗」這一趟：{ boss }＝這一趟最後談過話（成功或失敗）的前輩
       after   剛從前輩礦坑離開的有效狀態 { boss }：離開時建立；下一次進店抽一次閒聊後就清掉，
               或者還沒去店裡就又走進前輩礦坑，也清掉（避免之後每次進店都重抽）
       chatIdx 每位前輩下一次說第幾句（兩句輪流）
       dealAt  這次進店交付委託的時間（給「錢還沒捂熱」用，說過就清掉）
     每次最多一句：操作結果／錯誤 ＞ 前輩閒聊與進店情境 ＞ 一般招呼。
     同一個畫面重繪不會重抽（talkView / talkText）。 */
  const TK = () => B().talk || {};
  function talk() {
    const bs = save.boss;
    if (!bs.talk || typeof bs.talk !== "object") bs.talk = {};
    const t = bs.talk;
    if (!t.since) t.since = window.GAME_VERSION || "";
    t.lines = Math.max(0, t.lines | 0); t.boards = Math.max(0, t.boards | 0);
    t.lastVisit = +t.lastVisit || 0; t.lastLeave = +t.lastLeave || 0; t.dealAt = +t.dealAt || 0;
    t.broke = !!t.broke;
    if (!t.chatIdx || typeof t.chatIdx !== "object") t.chatIdx = {};
    delete t.chat; delete t.lastChatAt;                      // 舊版（談話結束就排閒聊）的欄位，已停用
    if (t.trip && typeof t.trip !== "object") t.trip = null;
    if (t.after && typeof t.after !== "object") t.after = null;
    return t;
  }
  function talkStage() {   // 0 完全不熟／1 開始熟悉／2 非常熟：只看恩惠等級
    const S = TK().stages || [], lv = save.boss.level || 1;
    let s = 0;
    S.forEach((c, i) => { if (i && c.lv && lv >= c.lv) s = i; });
    return s;
  }
  /* 前輩礦坑的「這一趟」與「剛離開」 */
  function senpaiTripStart() { const t = talk(); t.trip = { boss: null }; t.after = null; }
  function senpaiTripEnd() { const t = talk(); t.after = { boss: (t.trip && t.trip.boss) || null }; t.trip = null; }
  /* 剛離開前輩礦坑後的第一次進店：抽一次，回傳台詞或 null；不管有沒有抽中，有效狀態都清掉 */
  function senpaiChat() {
    const t = talk(), K = TK(), a = t.after;
    if (!a) return null;
    t.after = null;
    if (!(Math.random() < (K.chatChance ?? 0.4))) return null;
    if (a.boss && hasMemory(a.boss) && (K.hidden || {})[a.boss]) return K.hidden[a.boss];
    const ids = Object.keys(K.chat || {}); if (!ids.length) return null;
    const b = a.boss && K.chat[a.boss] ? a.boss : pickOne(ids), pool = K.chat[b], i = (t.chatIdx[b] || 0) % pool.length;
    t.chatIdx[b] = (i + 1) % pool.length;
    return pool[i];
  }
  function tline(key, stage) {   // 兩句：[生客, 熟悉後]；三句：[生客, 熟悉中, 信得過]
    const v = TK()[key], s = stage === undefined ? talkStage() : stage;
    if (!Array.isArray(v)) return v || "";
    return v.length >= 3 ? v[Math.min(s, v.length - 1)] : v[s >= 1 ? 1 : 0];
  }
  function lowTool() {
    const tl = activeTool();
    return !!tl && tl.max > 0 && tl.dur / tl.max <= (TK().lowToolRatio ?? 0.15);
  }
  let talkView = null, talkText = "", menuText = "";
  /* 進店（從挖礦／背包／地圖／紀錄進來；從觀測鏡回來不算） */
  function shopEnter() {
    const t = talk(), K = TK(), now = Date.now();
    let line = senpaiChat();          // 剛從前輩礦坑離開：這次進店抽一次（抽中就優先說）
    if (line) { /* 前輩閒聊／隱藏台詞 */ }
    else if (t.lastLeave && now - t.lastLeave < (K.shortReturnSec ?? 120) * 1000) line = K.shortReturn;
    else if (lowTool()) line = K.lowTool;
    else if (t.lastVisit && now - t.lastVisit > (K.longAwayHours ?? 72) * 3600000) line = K.longAway;
    else if (!oreNames().length) line = K.emptyBag;
    else line = tline("enter");
    t.lastVisit = now; t.dealAt = 0;
    menuText = line || tline("enter"); talkView = null;
    persist();
  }
  function shopLeave() { talk().lastLeave = Date.now(); persist(); }
  /* 進入某個分頁時的台詞（只在切換分頁時決定一次） */
  function viewLine(view) {
    const t = talk(), s = talkStage();
    if (view === "menu") return menuText || tline("enter");
    if (view === "board") { const req = checkRequest(); return req.lines.length && req.lines.every(l => l.done) ? TK().boardDone : tline("board"); }
    if (view === "sell") {
      const n = Object.values(save.ores).reduce((a, c) => a + (c > 0 ? c : 0), 0);
      return s >= 1 && n >= (TK().heavyBag ?? 40) ? tline("sell") : tline("sell", 0);
    }
    if (view === "buy") {
      const broke = t.broke; if (broke) { t.broke = false; persist(); }   // 提過一次就清掉，不留到以後
      return broke && s >= 1 ? tline("buy") : tline("buy", 0);
    }
    if (view === "ruby") return "深處偶爾才挖得到的紅晶。……紅成這樣的，我這輩子也沒見過幾顆。想要什麼，拿它來換。";
    if (view === "boons") return (v2() ? BV.filled(save.boss, config) + pendingN() > 0 : save.boss.boons.length) ? tline("boons") : B().lines.noBoon;
    return "";
  }
  const levelNeed = lv => B().levelNeed.base + B().levelNeed.step * Math.floor(lv / B().levelNeed.every);
  function weighted(obj) { // {key: weight} 或 [weights] → key / index
    const keys = Object.keys(obj), tot = keys.reduce((a, k) => a + obj[k], 0);
    let r = Math.random() * tot;
    for (const k of keys) { r -= obj[k]; if (r < 0) return Array.isArray(obj) ? +k : k; }
    return Array.isArray(obj) ? keys.length - 1 : keys[keys.length - 1];
  }
  /* v0.10.13 委託板（擁有者 2026-09-28 決定）
     每個遊戲日（沿用 todayKey）先給 1 張；可另外看廣告重置 B().boardResets 次（預設 2），每張固定 B().boardLines 項（預設 5）且互不相同。
     → 一天最多 3 張、15 項。取消舊的每 8 小時自動換板。
     save.boss.req    = { day, no（今日第幾張）, lines }
     save.boss.reqAds = { date, count }：委託板重置廣告的今日次數，跟領補給的 save.ads 完全分開；存在存檔裡，重整不會重來。
     舊存檔的 req 只有 slot（8 小時制、1～3 項）→ 第一次載入就換成當日第 1 張 5 項板；恩惠、礦石、金錢都不動。 */
  function makeRequest(no, day) {
    const n = Math.max(1, B().boardLines || 5), lines = [], used = new Set();
    for (let i = 0; i < n * 60 && lines.length < n; i++) {
      const m = pickOne(config.mines), cat = weighted(B().catWeights);
      const pool = (cat !== "common" && Math.random() < B().veinChance && m.veinItems && m.veinItems[cat]) || m.items[cat];
      if (!pool || !pool.length) continue;
      const name = pickOne(pool); if (used.has(name)) continue;
      used.add(name);
      const [lo, hi] = B().qty[cat];
      const base = lo + Math.floor(Math.random() * (hi - lo + 1));
      lines.push({ name, cat, qty: base, done: false });
    }
    return { day: day || todayKey(), no: no || 1, lines };
  }
  function boardAds() {
    const bs = save.boss, k = todayKey();
    if (!k) return bs.reqAds && typeof bs.reqAds === "object" ? bs.reqAds : { date: "", count: 0 };   // 日期未知：不換日、不歸零
    if (!bs.reqAds || typeof bs.reqAds !== "object" || bs.reqAds.date !== k) bs.reqAds = { date: k, count: 0 };
    return bs.reqAds;
  }
  const boardResetLeft = () => Math.max(0, (B().boardResets ?? 2) - boardAds().count);
  /* 永久免費委託板重置（2026-10-01 擁有者決定）：save.boardCredits＝剩餘次數，信箱 board_resets 領取增加，永不過期、不隨換日歸零。
     有次數時重置委託板先扣 1 次，不看廣告、不動 boss.reqAds／ads；用完才回到每日廣告重置。仍需可信台灣遊戲日。 */
  function normCredits(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(9999, Math.floor(n)) : 0; }   // 上限 9999；載入存檔時（檔頭）就會呼叫，不能依賴後面才宣告的 const
  function mailCredits(m) { const n = Number(m && m.board_resets); return Number.isInteger(n) && n > 0 ? Math.min(99, n) : 0; }   // 只認正整數（資料庫限制 0～99）
  const boardCredits = () => normCredits(save.boardCredits);
  let freeBusy = false;
  async function useFreeReset() {
    if (freeBusy || adActive) return;
    freeBusy = true;
    try {
      $("modal").classList.add("hidden");
      if (!(await clockFresh())) { toast("確認日期後可使用"); return; }
      const day = todayKey();
      if (!day || clock.hold) { toast("確認日期後可使用"); return; }
      if (save.adPending) { toast("還有一個廣告沒看完"); return; }
      const have = boardCredits();
      if (have <= 0) return;
      const bs = save.boss, cur = checkRequest();
      const next = makeRequest(((cur && cur.day === day && cur.no) || 1) + 1, day);
      if (!next.lines.length) { toast("換板失敗，免費次數沒有扣除"); return; }
      const old = bs.req;
      save.boardCredits = have - 1; bs.req = next;
      if (!store.set(SAVE_KEY, save)) { save.boardCredits = have; bs.req = old; toast("存檔失敗，免費次數沒有扣除"); return; }   // 扣次＋換板＋存檔同一次完成
      cloudLater();
      bossView = "board"; talkView = null;
      toast(`換了一張新委託｜免費重置剩 ${save.boardCredits} 次`);
    } finally {
      freeBusy = false;
      renderShop();
    }
  }
  function checkRequest() {
    const bs = save.boss, k = todayKey();
    if (!k) return bs.req && Array.isArray(bs.req.lines) ? bs.req : { day: "", no: 0, lines: [] };   // 日期未知：不建立新板（畫面也不給交付）
    if (!bs.req || bs.req.day !== k || !Array.isArray(bs.req.lines)) {   // 換日（或舊的 8 小時制存檔）→ 當日第 1 張
      bs.req = makeRequest(1); boardAds(); persist();
    }
    return bs.req;
  }
  /* 看廣告重置委託板：有未交付的先確認；廣告看完才換板。次數在「開始看」時就先扣開始那天的（擁有者 Q5＝B），取消／失敗會退回 */
  function askBoardReset() {
    if (!dailyOK()) { toast("確認日期後可使用"); return; }
    const free = boardCredits() > 0, go = free ? useFreeReset : watchBoardAd;
    if (!free && boardResetLeft() <= 0) return;
    const req = checkRequest(), left = req.lines.filter(l => !l.done).length;
    if (!left) { go(); return; }
    const box = $("modalBox");
    box.innerHTML = `<div class="boss-name">換一張委託</div>
      <div style="margin:10px 0;line-height:1.7">這張還有 <b>${left}</b> 項沒交付。<br><span style="color:#ff7755">換板後，未完成的委託會消失。</span></div>
      <div class="btns"><button class="px-btn" id="brYes">${free ? `免費換板（剩 ${boardCredits()} 次）` : "看廣告換板"}</button><button class="px-btn" id="brNo">取消</button></div>`;
    $("modal").classList.remove("hidden");
    $("brNo").onclick = () => $("modal").classList.add("hidden");
    $("brYes").onclick = () => go();
  }
  async function watchBoardAd() {
    if (adActive) return;
    if (!(await clockFresh())) { $("modal").classList.add("hidden"); toast("確認日期後可使用"); renderShop(); return; }
    if (boardResetLeft() <= 0) { $("modal").classList.add("hidden"); return; }
    const s = adStart("board");
    if (!s.p) { $("modal").classList.add("hidden"); adStartFail(s.err); renderShop(); return; }
    adShow(s.p, "（委託板廣告示意）", "看完才會換板；中途取消不扣次數", "brCancel", r => {
      if (!r) toast("已取消，委託板沒有變動");
      else if (!r.ok) toast("這次廣告已失效，委託板沒有變動");
      else if (r.cross) toast("換了一張新委託｜這次廣告算在昨天的次數，今天的次數沒有被扣。", 4000);
      else toast(`換了一張新委託｜今日可重置剩 ${boardResetLeft()} 次`);
      if (r && r.ok) { bossView = "board"; talkView = null; }
      renderShop();
    });
  }

  /* ---------------- 待完成廣告（階段3B，AD_STATE_MACHINE.md；擁有者 Q2＝A、Q5＝B） ----------------
     補給（save.ads，每天 adDailyLimit 次）與換板（save.boss.reqAds，每天 boardResets 次）次數分開算，
     但整份存檔同一時間只能有一個待完成廣告 save.adPending = { id, kind, day, startedAt }。
     開始：先扣「開始那天」的 1 次＋寫 adPending＋寫 localStorage 鎖（擋另一個分頁），同一次寫入。
     完成：id 已在 adDone → 不重發；重讀最新存檔，adPending 不是這個 id（被取消／逾時／別處處理）→ 不發；
           否則發獎、記入 adDone（最近 20 筆）、清 adPending，同一次寫入。完成時不再扣任何次數（跨午夜不扣新一天）。
     取消／失敗／關頁／逾時 10 分鐘：還是開始那天就退回 1 次；已換日就不動新一天。 */
  const AD_LOCK_KEY = "mine_ad_lock_v1" + SB;
  const AD_TIMEOUT = 600000;
  let adActive = null;   // 這個分頁正在播的廣告 { id, timer }
  const adLimit = kind => (kind === "board" ? (B().boardResets ?? 2) : config.rules.adDailyLimit);
  function adCounter(kind) { if (kind === "board") return boardAds(); checkDay(); return save.ads; }   // 先換日，再看次數
  function adLockLive(id) {   // 鎖有主（未過期）；有給 id 時只看是不是這個 id
    const l = store.get(AD_LOCK_KEY), now = trustedNow();
    return !!(l && l.id && (!id || l.id === id) && now !== null && l.until > now);
  }
  function adUnlock(id) { const l = store.get(AD_LOCK_KEY); if (l && l.id === id) store.del(AD_LOCK_KEY); }
  function fixAds(sv) {   // 三個載入入口共用：舊存檔補欄位（頂層 v 不動）
    if (!sv.adPending || typeof sv.adPending !== "object" || !sv.adPending.id) sv.adPending = null;
    if (!Array.isArray(sv.adDone)) sv.adDone = [];
    sv.boardCredits = normCredits(sv.boardCredits);
  }
  function adLeftover() {   // 載入時有殘留的待完成廣告（上次關頁／當機／雲端那份）＝取消（Q2＝A）；另一個分頁正在播的，等它的鎖過期再處理
    const p = save.adPending; if (!p) return;
    if (adLockLive(p.id)) { setTimeout(adLeftover, Math.max(1000, store.get(AD_LOCK_KEY).until - trustedNow() + 500)); return; }
    adCancel(p.id);
  }
  function adStart(kind) {
    const day = todayKey();
    if (!day || clock.hold) return { err: "day" };
    if (save.adPending || adLockLive()) return { err: "busy" };
    const ctr = adCounter(kind);
    if (ctr.count >= adLimit(kind)) return { err: "limit" };
    const now = trustedNow();
    const p = { id: "ad" + Math.floor(now).toString(36) + Math.random().toString(36).slice(2, 8), kind, day, startedAt: now };
    ctr.count++;
    save.adPending = p;
    store.set(AD_LOCK_KEY, { id: p.id, until: now + AD_TIMEOUT });
    persist();
    return { p };
  }
  function adDrop(id) {   // 這個廣告已在別處取消／發過：只清掉本分頁記憶體裡卡住的待完成（同日退回），不另外寫檔
    const p = save.adPending; if (!p || p.id !== id) return;
    const ctr = p.kind === "board" ? save.boss.reqAds : save.ads;
    if (ctr && ctr.date === p.day && ctr.count > 0 && !(save.adDone || []).includes(id)) ctr.count--;
    save.adPending = null;
  }
  function adComplete(id) {
    const disk = store.get(SAVE_KEY) || {};
    if ((save.adDone || []).includes(id) || (Array.isArray(disk.adDone) && disk.adDone.includes(id))) { adDrop(id); return { ok: false, err: "repeat" }; }
    const p = save.adPending;
    if (!p || p.id !== id) return { ok: false, err: "gone" };
    /* 最新存檔沒有這個待完成：可能是別處取消了，也可能只是另一個分頁把整份存檔蓋過去。
       取消／完成一定會釋放鎖 → 鎖還在這個 id 上＝沒有被別處處理，照常完成；鎖也不在＝已被取消，不發獎。 */
    const lock = store.get(AD_LOCK_KEY);
    if (!(disk.adPending && disk.adPending.id === id) && !(lock && lock.id === id)) { adDrop(id); return { ok: false, err: "gone" }; }
    const now = trustedNow();
    if (now === null || now - p.startedAt > AD_TIMEOUT) { adCancel(id); return { ok: false, err: "timeout" }; }
    const out = adGrant(p);
    save.adDone = (save.adDone || []).concat([id]).slice(-20);
    save.adPending = null;
    persist();
    adUnlock(id);
    return Object.assign({ ok: true, p }, out);
  }
  function adCancel(id) {
    const p = save.adPending;
    if (!p || p.id !== id) { adUnlock(id); return false; }
    const ctr = p.kind === "board" ? save.boss.reqAds : save.ads;
    if (ctr && ctr.date === p.day && ctr.count > 0) ctr.count--;   // 還是開始那天 → 退回；已換日 → 舊的一天已結束，不動新一天
    save.adPending = null;
    persist();
    adUnlock(id);
    return true;
  }
  function adGrant(p) {   // 發獎（完成時呼叫一次）
    const today = todayKey(), cross = !!today && today !== p.day;
    if (p.kind === "board") {
      const bs = save.boss;
      if (cross) { checkRequest(); bs.req = makeRequest(((bs.req && bs.req.no) || 1) + 1, today); }   // 新一天先有第 1 張，再用這次獎勵換掉；新一天次數完整
      else bs.req = makeRequest(((bs.req && bs.req.day === p.day && bs.req.no) || 1) + 1, p.day);
      return { cross };
    }
    /* 2026-10-01 擁有者決定：領補給暫時固定為鑽石鎬；舊版 adWood／adStone 不再改變補給內容。 */
    const toolId = config.rules.adSupplyTool || "diamond", qty = Math.max(1, config.rules.adSupplyQty | 0);
    for (let i = 0; i < qty; i++) addTool(toolId, 1);
    const msg = `獲得 ${toolDef(toolId).name} ×${qty}`;
    return { cross, msg };
  }
  function adStartFail(err) {
    toast(err === "day" ? "確認日期後可使用" : err === "busy" ? "還有一個廣告沒看完" : "今日次數已用完");
  }
  /* 廣告畫面（示意）：只負責倒數與取消，次數與獎勵都交給 adComplete／adCancel */
  function adShow(p, title, note, cancelId, onDone) {
    let sec = 5;
    const box = $("modalBox");
    adActive = { id: p.id, timer: null };
    const end = () => { if (adActive) clearTimeout(adActive.timer); adActive = null; $("modal").classList.add("hidden"); };
    const tick = () => {
      if (!adActive || adActive.id !== p.id) return;
      box.innerHTML = `<div>${title}</div><div style="font-size:2em;margin:16px 0">${sec}</div><div class="sub">${note}</div>
        <div class="btns"><button class="px-btn" id="${cancelId}">取消</button></div>`;
      $(cancelId).onclick = () => { end(); adCancel(p.id); onDone(null); };
      if (sec-- <= 0) { end(); onDone(adComplete(p.id)); return; }
      adActive.timer = setTimeout(tick, 1000);
    };
    $("modal").classList.remove("hidden"); tick();
  }
  window.addEventListener("pagehide", () => { if (adActive) { const id = adActive.id; adActive = null; adCancel(id); } });   // 關頁＝取消（Q2＝A）
  const lineQty = l => Math.max(1, Math.ceil(l.qty * Math.pow(1 - boonVal("reqQty"), boonCount("reqQty"))));   // v2：boonCount＝0 → 原數量
  function addFavor(pts) {
    const bs = save.boss, gained = [], lv0 = bs.level;
    pts = Math.round(pts * (1 + boonSum("favorUp")) * 10) / 10;
    bs.favor += pts; bs.total += pts;
    while (bs.favor >= levelNeed(bs.level)) {
      bs.favor -= levelNeed(bs.level); bs.level++;
      if (!v2()) gained.push(rollBoon());
    }
    bs.favor = Math.round(bs.favor * 10) / 10;
    /* v2：每一級都排進待領（跨多級不漏）。v2 關閉時讓 rewardLv 跟著等級走，日後開啟不會一次補發舊等級 */
    if (v2() && !boonFail) BV.queue(save, config, msKnown);
    else if (!boonFail && bs.schema === 2) bs.rewardLv = bs.level;   // 只更新已存在的欄位；v2 關閉時不替舊存檔新增 rewardLv
    return { pts, gained, ups: bs.level - lv0 };
  }
  function rollBoon() {
    const r = weighted(B().boonRarity);
    const ids = Object.keys(B().boons).filter(id => B().boons[id].r === r);
    const id = pickOne(ids), b = { id, r };
    if (id === "oreSell") { // 隨機指定一種礦石（以已發現的為主）
      const known = Object.keys(save.dex).filter(n => itemIndex()[n] && itemIndex()[n].cat.id !== "rubble");
      b.target = pickOne(known.length ? known : Object.keys(itemIndex()));
    }
    if (id === "raritySell") b.target = 1 + Math.floor(Math.random() * 5);
    save.boss.boons.push(b);
    return b;
  }
  function boonLabel(b) {
    const d = B().boons[b.id]; if (!d) return b.id;
    if (b.id === "oreSell") return `「${b.target}」售價 +${Math.round(d.v * 100)}%`;
    if (b.id === "raritySell") return `${config.rarities[b.target].name}色礦石售價 +${Math.round(d.v * 100)}%`;
    return d.name;
  }
  function oreOrigin(name) {
    const it = itemIndex()[name]; if (!it) return;
    const box = $("modalBox");
    box.innerHTML = `<div style="color:${rarityColor(it.cat.rarity)};font-size:1.2em">${name}</div>
      <div style="margin:10px 0;line-height:1.7">產地：<b>${it.mine.name}</b><br>稀有度：${config.rarities[it.cat.rarity].name}${it.vein ? "<br><span style='color:#ffaa00'>只在礦脈中才挖得到</span>" : ""}<br>基本售價 $${money(basePrice(name))}｜背包 ${save.ores[name] || 0} 個</div>
      <div class="btns"><button class="px-btn" id="mdClose">知道了</button></div>`;
    $("modal").classList.remove("hidden");
    $("mdClose").onclick = () => $("modal").classList.add("hidden");
  }
  function deliver(i) {
    if (!todayKey()) return;   // 日期未知：不交付（板子可能已經是昨天的）
    const req = checkRequest(), l = req.lines[i]; if (!l || l.done) return;
    const need = lineQty(l);
    if ((save.ores[l.name] || 0) < need) { bossLine = B().lines.noEnough; renderShop(); return; }
    save.ores[l.name] -= need; if (save.ores[l.name] <= 0) delete save.ores[l.name];
    // v2：委託酬勞＝基本售價 × 數量 × 交付倍率，不吃出售加價（與委託板顯示一致）
    const coins = Math.round(basePrice(l.name) * (v2() ? 1 : sellBonus(l.name, catDef(l.cat).rarity)) * need * B().deliverMul * 10) / 10;
    save.coins = Math.round((save.coins + coins) * 10) / 10; l.done = true;
    let pts = B().points[l.cat] || 1;
    const allDone = req.lines.every(x => x.done);
    if (allDone) pts += B().completeBonus;
    const fr = addFavor(pts);
    const t = talk(), first = t.lines === 0;
    t.lines++; if (allDone) t.boards++;
    t.dealAt = Date.now();
    bossLine = allDone ? tline("allDone") : first ? TK().firstDeliver : tline("deliver");
    toast(`交付 ${l.name} ×${need}  +$${money(coins)}  恩惠+${fr.pts}`);
    persist(true); renderShop();
    if (fr.gained.length) showBoons(fr.gained);
    if (fr.ups && v2()) offerPick();
  }
  function showBoons(list) {
    const box = $("modalBox");
    box.innerHTML = `<div class="boss-name">${B().name}</div><div style="margin:8px 0">「${tline("levelUp")}」</div>
      <div style="margin:6px 0">恩惠等級 → Lv${save.boss.level}</div>
      ${list.map(b => `<div class="boon-get" style="border-color:${BOON_COLOR(b.r)};color:${BOON_COLOR(b.r)}">【${RARITY_NAME[b.r]}】${boonLabel(b)}</div>`).join("")}
      <div class="btns"><button class="px-btn" id="mdClose">收下</button></div>`;
    $("modal").classList.remove("hidden");
    $("mdClose").onclick = () => $("modal").classList.add("hidden");
  }

  /* ---------------- 恩惠 v2：顯示與選獎 ---------------- */
  const pctTxt = r => `${Math.round(r * 1000) / 10}%`;
  const bvDef = k => BV.kindDef(config, k), bvMax = k => BV.maxOf(config, k);
  const bvTier = k => BV.tier(save.boss, config, k);
  function bvEffect(k, t) {   // 某一階的效果說明（畫面與實際計算用同一組函式）
    const r = BV.rate(config, k, t);
    if (k === "autoSpeed") return `自動挖掘速度 +${pctTxt(r)}`;
    if (k === "sell") return `出售 +${pctTxt(r)}`;
    if (k === "toolCut") return `買鎬子 -${pctTxt(r)}`;
    if (k === "toolDur") return `新鎬子耐久 +${pctTxt(r)}`;
    return pctTxt(r);
  }
  const pips = (t, max) => `<span class="boon-pips" aria-label="${t}／${max}階">${Array.from({ length: max }, (_, i) => `<i class="${i < t ? "on" : ""}"></i>`).join("")}</span>`;
  const pendingN = () => (v2() && !boonFail ? save.boss.pending.length : 0);
  /* 能不能現在跳出選獎：只在佐佐木店裡、沒有前輩回憶在演、沒有其他視窗開著時；否則只在按鈕旁顯示「可選 N」 */
  const pickSafe = () => currentScreen === "shop" && !(save.senpai && save.senpai.story) && $("modal").classList.contains("hidden");
  function offerPick(force) {
    if (!pendingN() || !(force || pickSafe())) { if (currentScreen === "shop") renderShop(); return; }
    if (BV.prepare(save, config)) persist(true);   // 候選一產生就存檔：重整不重抽
    const p = save.boss.pending[0], left = save.boss.pending.length - 1, box = $("modalBox");
    const head = `<div class="boss-name">${B().name}</div><div style="margin:8px 0">「${tline("levelUp")}」</div>
      <div class="boon-lv">恩惠 Lv${p.lv} 的謝禮${left ? `<span class="sub">（之後還有 ${left} 個）</span>` : ""}</div>`;
    if (p.kind === "milestone") {
      const tid = BV.msTool(config, p.id), d = toolDef(tid) || { name: p.id, rarity: 0 };
      box.innerHTML = head + `<div class="boon-note">恩惠 Lv${p.lv} 的特別謝禮（每位玩家只有一次，不會占掉這一級的恩惠選擇）：</div>
        <div class="boon-card tool"><div class="boon-card-name" style="color:${rarityColor(d.rarity)}">${esc(d.name)} ×1</div>
        <div class="sub">全新・耐久 ${toolMax(tid)}（固定，不吃耐久恩惠）｜所有已解鎖礦坑都能用，收益跟合適的鎬子一樣</div></div>
        <div class="btns"><button class="px-btn" data-bv-claim="${p.lv}" data-bv-kind="${esc(p.id)}">收下</button><button class="px-btn" id="bvLater">稍後</button></div>`;
    } else if (p.kind === "tool") {
      const d = toolDef(p.id) || { name: p.id, rarity: 0 };
      box.innerHTML = head + `<div class="boon-note">四種恩惠都已滿階。這一級送你：</div>
        <div class="boon-card tool"><div class="boon-card-name" style="color:${rarityColor(d.rarity)}">${esc(d.name)} ×1</div>
        <div class="sub">全新・耐久 ${toolMax(p.id)}（依升級當下已解鎖的最高礦坑決定）</div></div>
        <div class="btns"><button class="px-btn" data-bv-claim="${p.lv}" data-bv-kind="">收下</button><button class="px-btn" id="bvLater">稍後</button></div>`;
    } else {
      box.innerHTML = head + `<div class="boon-note">${p.opts.length > 1 ? `從 ${p.opts.length} 種裡選 1 種升一階` : "只剩這一種還能升階"}</div>` +
        p.opts.map(k => { const t = bvTier(k); return `<button class="boon-card" data-bv-pick="${k}" aria-pressed="false">
          <div class="boon-card-name">${esc(bvDef(k).name)}</div>${pips(t, bvMax(k))}
          <div class="sub">第 ${t} 階 → 第 ${t + 1} 階／${bvMax(k)}</div>
          <div class="boon-card-eff">${t ? bvEffect(k, t) : "尚未取得"} → <b>${bvEffect(k, t + 1)}</b></div></button>`; }).join("") +
        `<div class="sub boon-pick-hint" id="bvHint">先點一種恩惠，再按「確定」。</div>
        <div class="btns"><button class="px-btn" id="bvOk" data-bv-claim="${p.lv}" data-bv-kind="" disabled>確定</button><button class="px-btn" id="bvLater">稍後再選</button></div>`;
    }
    $("modal").classList.remove("hidden");
    $("bvLater").onclick = () => { $("modal").classList.add("hidden"); if (currentScreen === "shop") renderShop(); };
    /* 2026-10-02 擁有者要求：選恩惠要兩步（點卡片＝選取，按「確定」才升階），避免誤觸 */
    box.querySelectorAll("[data-bv-pick]").forEach(c => c.onclick = () => {
      box.querySelectorAll("[data-bv-pick]").forEach(x => { const on = x === c; x.classList.toggle("selected", on); x.setAttribute("aria-pressed", on ? "true" : "false"); });
      const ok = $("bvOk"); ok.dataset.bvKind = c.dataset.bvPick; ok.disabled = false;
      $("bvHint").textContent = `選擇「${bvDef(c.dataset.bvPick).name}」，按「確定」升一階。`;
    });
    box.querySelectorAll("[data-bv-claim]").forEach(b => b.onclick = async () => {
      if (!b.dataset.bvKind && b.id === "bvOk") return;   // 還沒選
      box.querySelectorAll("[data-bv-claim], [data-bv-pick]").forEach(x => { x.disabled = true; });   // 連點只算一次
      const lv = Number(b.dataset.bvClaim), kind = b.dataset.bvKind || null;
      /* 階段4-2：里程碑先問雲端領取紀錄（已登入時）。雲端說別處領過 → 不發；連不上 → 照發，之後 msSync 補紀錄（擁有者決定） */
      let guard = msGuard, srv = false;
      if (p.kind === "milestone" && cloudOn() && Cloud.claimMilestone) {
        b.textContent = "確認中…";
        const sr = await Cloud.claimMilestone(p.id, save.boss.epoch);
        const q = save.boss.pending[0];
        if (!q || q !== p) { $("modal").classList.add("hidden"); if (currentScreen === "shop") renderShop(); return; }   // 等待期間存檔換了（例如接回雲端）
        if (sr.ok && sr.result === "stale") { $("modal").classList.add("hidden"); toast("這份存檔是舊資料，請先改用雲端的存檔再領取"); return; }
        if (sr.ok && sr.result === "already") guard = () => "server";
        srv = !!(sr.ok && sr.result === "ok");
      }
      let r;
      try { r = BV.claim(save, config, lv, kind, addTool, guard); }
      catch (e) { $("modal").classList.add("hidden"); toast("領取失敗：瀏覽器空間不足，謝禮還留著"); return; }
      $("modal").classList.add("hidden");
      if (!r.ok) {
        if (r.why === "done" || r.why === "server") persist(true);   // 存檔內已有紀錄、或雲端說已領過 → 清掉待領並存檔
        /* why==="device"（另一個分頁剛領）：這裡不主動存檔，避免這個分頁的舊存檔立刻蓋掉另一分頁剛寫入、含試用的存檔（多分頁本來就是後寫蓋前寫，見 RELEASE_GATE） */
        toast(r.why === "device" ? "這份謝禮在這台裝置已經領過了（可能是另一個分頁）" : r.why === "server" ? "這份謝禮這個帳號已經在別的裝置領過了" : "這份謝禮已經領過了"); if (currentScreen === "shop") renderShop(); return;
      }
      if (r.kind === "milestone") save.boss.milestones[r.id].srv = srv;   // false＝雲端還沒有這筆領取紀錄，之後補
      persist(true);
      if (r.kind === "milestone" && !srv) setTimeout(msSync, 0);
      toast(r.kind === "milestone" ? `收下 ${(toolDef(r.tool) || {}).name} ×1（耐久 ${toolMax(r.tool)}）` : r.kind === "tool" ? `收下 ${(toolDef(r.id) || {}).name || r.id} ×1` : `${bvDef(r.choice).name} → 第 ${r.tier} 階`);
      if (pendingN()) offerPick(true); else if (currentScreen === "shop") renderShop();
    });
  }

  function renderShop() {
    checkDay();
    const bs = save.boss, L = B().lines;
    $("bossName").textContent = B().name;
    $("bossLv").innerHTML = `恩惠 Lv${bs.level}　<span class="sub">${money(bs.favor)}/${levelNeed(bs.level)}</span>`;
    $("bossFavorBar").style.width = Math.min(100, bs.favor / levelNeed(bs.level) * 100) + "%";
    const view = bossView;
    // 台詞：有操作結果就用它；否則同一分頁沿用進來時決定的那句，不因重繪重抽
    if (bossLine) { talkText = bossLine; talkView = view; }
    else if (talkView !== view) { talkText = viewLine(view); talkView = view; }
    let say = talkText, body = "";
    const back = `<button class="px-btn wide boss-opt" data-boss="menu">◀ 返回</button>`;

    const dayOK = dailyOK(), wait = '<span class="sub">確認日期後可使用</span>';
    if (view === "menu") {
      const req = checkRequest(), left = req.lines.filter(l => !l.done).length;
      const adLeft = config.rules.adDailyLimit - save.ads.count;
      body = `<div class="boss-opts">
        <div class="boss-group">委託</div>
        <button class="px-btn wide boss-opt" data-boss="board" ${dayOK ? "" : "disabled"}>▶ 看委託板 ${!dayOK ? wait : `<span class="sub">${left ? `剩${left}項` : "已完成"}</span>`}</button>
        <button class="px-btn wide boss-opt" data-boss="boons">▶ 我的恩惠 ${v2() ? (pendingN() ? `<span class="boon-tag">可選 ${pendingN()}</span>` : `<span class="sub">共${BV.filled(bs, config)}／${BV.cap(config)}階</span>`) : `<span class="sub">${bs.boons.length}個</span>`}</button>
        <div class="boss-group">買賣</div>
        <button class="px-btn wide boss-opt" data-boss="sell">▶ 賣礦石</button>
        <button class="px-btn wide boss-opt" data-boss="buy">▶ 買鎬子</button>
        ${RUBY_PREVIEW ? `<button class="px-btn wide boss-opt" data-boss="ruby">▶ 紅晶商店 <span class="sub ruby-num">${RUBY_ICO} ${fmt(RUBY_MOCK)}</span></button>`
          : `<button class="px-btn wide boss-opt" disabled>▶ 紅晶商店 <span class="sub">🔒 準備中</span></button>`}
        <div class="boss-group">其他</div>
        <button class="px-btn wide boss-opt" data-boss="glass" ${dayOK ? "" : "disabled"}>▶ ${(config.glasses || {}).name || "礦脈觀測鏡"} ${dayOK ? '<span class="sub">看今天的礦脈徵兆</span>' : wait}</button>
        <button class="px-btn wide boss-opt" data-boss="ad" ${adLeft <= 0 || !dayOK ? "disabled" : ""}>▶ 領補給（看廣告） ${dayOK ? `<span class="sub">今日剩${adLeft}次</span>` : wait}</button>
        <button class="px-btn wide boss-opt quiet" data-boss="bye">▶ 離開</button></div>`;
    }
    if (view === "board" && !todayKey()) body = `<div class="board"><div class="board-head">委託板</div><div class="sub">需要連上網路確認今天的日期（台灣時間）。確認日期後可使用。</div></div>` + back;
    else if (view === "board") {
      const req = checkRequest(), idx = itemIndex();
      const rl = boardResetLeft(), fc = boardCredits();
      body = `<div class="board"><div class="board-head">委託板 <span class="sub">今日第 ${req.no || 1} 張｜${fc > 0 ? `免費重置剩 ${fc} 次` : `今日可重置剩 ${rl} 次`}</span></div>` +
        req.lines.map((l, i) => {
          const known = !!save.dex[l.name], it = idx[l.name], color = rarityColor(it ? it.cat.rarity : 0);
          const need = lineQty(l), have = save.ores[l.name] || 0;
          const nameHtml = known ? `<a class="ore-link" data-origin="${l.name}" style="color:${color}">${l.name}</a>`
            : `<span style="color:${rarityColor(0)}">？？？</span> <span class="sub">(${config.rarities[it ? it.cat.rarity : 0].name})</span>`;
          const pay = Math.round(basePrice(l.name) * need * B().deliverMul * 10) / 10;
          return `<div class="row board-line ${l.done ? "done" : ""}"><div class="grow">${nameHtml} ×${need}
            <div class="sub">酬勞 $${money(pay)}＋恩惠${B().points[l.cat]}點${l.done ? "" : `｜包包 <span style="color:${have >= need ? "#55ff55" : "inherit"}">${have}/${need}</span>`}</div></div>
            ${l.done ? '<span class="sub">✔ 已交付</span>' : `<button class="px-btn small" data-deliver="${i}" ${have >= need ? "" : "disabled"}>交付</button>`}</div>`;
        }).join("") + `<div class="sub" style="margin-top:6px">全部完成再加 ${B().completeBonus} 點｜點礦石名稱可查產地</div>
        <button class="px-btn wide" id="btnBoardReset" style="margin-top:8px;min-height:48px" ${(fc > 0 || rl > 0) && dayOK ? "" : "disabled"}>${!dayOK ? "確認日期後可使用" : fc > 0 ? `▶ 免費重置委託板（剩 ${fc} 次）` : rl > 0 ? `▶ 看廣告換一張新委託（今日剩 ${rl} 次）` : "今日的委託板重置次數已用完"}</button></div>` + back;
    }
    if (view === "sell") {
      const idx = itemIndex(), names = oreNames();
      const total = sellTotal(names.map(n => [n, save.ores[n]])), sr = v2Rate("sell");
      const rows = names.map(n => {
        const p = itemPrice(n), c = save.ores[n];
        const q = Math.min(Math.max(1, sellQty[n] || 1), c);   // 記住玩家選過的數量，但不能超過現有庫存
        sellQty[n] = q;
        return `<div class="row sell-row" data-ore-row="${esc(n)}">
          <div class="sell-head">
            <span style="color:${rarityColor(idx[n].cat.rarity)}">${esc(n)}</span>
            <span class="sub">持有 ×${c}｜單價 $${money2(p)}</span>
          </div>
          <div class="sell-pick">
            <input type="range" class="sell-range" data-ore-range="${esc(n)}" min="1" max="${c}" step="1" value="${q}">
            <input type="number" class="sell-num" data-ore-num="${esc(n)}" min="1" max="${c}" step="1" value="${q}"
                   inputmode="numeric" pattern="[0-9]*">
            <button class="px-btn small" data-ore-max="${esc(n)}">最大</button>
          </div>
          <div class="sell-info">
            <span class="sub" data-ore-info="${esc(n)}">本次出售 ×${q}｜出售後剩餘 ×${c - q}｜可得 $${money(sellTotal([[n, q]]))}</span>
            <button class="px-btn small" data-ore-sell="${esc(n)}">賣出 ${q} 個</button>
          </div>
        </div>`;
      }).join("");
      body = `<div class="board"><div class="board-head">收購 <span class="sub">合計 $${money(total)}</span>${sr ? ` <span class="boon-tag">出售加價 +${pctTxt(sr)}</span>` : ""} ${names.length ? '<button class="px-btn small" id="btnSellAll">全部賣出</button>' : ""}</div>
        <div class="list">${rows || '<div class="sub">背包是空的</div>'}</div>
        ${names.length ? `<div class="sub" style="margin-top:6px">拉滑桿或直接打數字都可以，按「賣出」才會真的賣掉。委託板需要的礦石記得留著。${sr ? `<br>恩惠加價 +${pctTxt(sr)}：每次出售的整筆金額一起計算，最後取到 0.1。` : ""}</div>` : ""}</div>` + back;
    }
    if (view === "buy") {
      const cut = v2() ? v2Rate("toolCut") : boonSum("shopCut"), dur = v2Rate("toolDur");
      body = `<div class="board"><div class="board-head">鎬子 ${cut ? `<span class="boon-tag">恩惠折扣 -${pctTxt(cut)}</span>` : ""}${dur ? ` <span class="boon-tag">新鎬子耐久 +${pctTxt(dur)}</span>` : ""}</div><div class="list">` + stdTools().map(t => {
        const pr = toolPrice(t);
        return `<div class="row"><div class="grow"><span style="color:${rarityColor(t.rarity)}">${t.name}</span>
        <div class="sub">耐久 ${toolMax(t.id)}｜每揮 $${(pr / toolMax(t.id)).toFixed(1)}｜適合 ${config.mines.filter(m => m.tier === t.tier).map(m => m.name).join("、")}</div></div>
        <button class="px-btn small" data-buy="${t.id}" ${save.coins < pr ? "disabled" : ""}>$${fmt(pr)}</button></div>`;
      }).join("") + `</div></div>` + back;
    }
    if (view === "ruby" && RUBY_PREVIEW) {
      // 示意：商品與價格都是暫定，按鈕只跳提示，不會扣任何東西
      const item = (name, note, price) => `<div class="row"><div class="grow">${name}<div class="sub">${note}</div></div>
        <button class="px-btn small ruby-buy" data-ruby-mock="1">${RUBY_ICO} ${price}</button></div>`;
      const pack = (n, bonus, nt) => `<div class="row"><div class="grow">${RUBY_ICO} <b class="ruby-n">${fmt(n)}</b>${bonus ? ` <span class="boon-tag ruby-tag">多送 ${bonus}</span>` : ""}</div>
        <button class="px-btn small ruby" data-ruby-mock="1">NT$${nt}</button></div>`;
      const sec = t => `<div class="ruby-sec">${t}</div>`;
      body = `<div class="board ruby-board"><div class="board-head">紅晶商店 <span class="sub ruby-num">持有 ${RUBY_ICO} ${fmt(RUBY_MOCK)}</span></div>
        <div class="ruby-note">示意畫面：商品、價格都還沒定，按了不會扣東西。</div>
        ${sec("儲值")}${pack(60, 0, 30)}${pack(330, 30, 150)}${pack(1090, 110, 490)}
        ${sec("方便")}${item("補給券", "領補給不用看廣告，一張用一次", 20)}${item("委託板重置券", "換一張新的委託板", 30)}${item("觀測鏡加一次", "今天這座礦坑多看一次", 15)}
        ${sec("外觀")}${item('<span class="pid-num rainbow" style="font-size:1em;letter-spacing:.05em">彩虹玩家 ID</span>', "帳號頁的 ID 變成流動彩虹", 300)}${item('<span style="color:#7fe3ff">名字顏色</span>', "頂部名字換顏色", 150)}${item("敘述框外框", "換一種像素外框", 200)}
        ${sec("道具")}${item('<span style="color:#ff7755">紅岩鑽頭</span>', "耐久 1000 的特殊鑽頭", 680)}${item("礦脈探測器", "接下來一段揮數更容易碰到礦脈", 50)}
      </div>` + back;
    }
    if (view === "boons" && v2()) {
      const n = pendingN();
      body = `<div class="board"><div class="board-head">我的恩惠 <span class="sub">共${BV.filled(bs, config)}／${BV.cap(config)}階｜累計恩惠 ${money(bs.total)}點</span></div>` +
        (boonFail ? '<div class="boon-note" style="color:#ff7755">恩惠資料轉換失敗：進度都還在，恩惠效果暫停，請回報。</div>' : "") +
        (n ? `<button class="px-btn wide" id="btnBoonPick" style="margin:4px 0 8px;min-height:48px">▶ 領取升級謝禮 <span class="boon-tag">可選 ${n}</span></button>` : "") +
        BV.KINDS.map(k => { const t = bvTier(k), mx = bvMax(k), full = t >= mx;
          return `<div class="row boon-row ${full ? "full" : ""}"><div class="grow"><div class="boon-row-head"><span>${esc(bvDef(k).name)}</span>${pips(t, mx)}<span class="boon-lvtxt">${full ? "滿階" : `${t}／${mx}階`}</span></div>
            <div class="sub">目前：${t ? bvEffect(k, t) : "尚未取得"}${full ? "" : `｜下一階：${bvEffect(k, t + 1)}`}</div>
            <div class="sub">每階 ${bvEffect(k, 1)}，最多 ${mx} 階（${bvEffect(k, mx)}）</div></div></div>`; }).join("") +
        `<div class="boon-rules sub"><b>怎麼拿恩惠</b><br>・每升一級，從還沒滿階的恩惠裡隨機出 2 種讓你選 1 種升一階；<b>每一種出現的機率都一樣</b>，沒有稀有度。<br>・已經滿階的不會再出現；只剩 1 種沒滿時就只出那 1 種。<br>・四種全部滿階後，每升一級改送 1 把標準鎬子（木／石／鐵／金／鑽石鎬中，依升級當下已解鎖的最高礦坑決定）。</div>` +
        (bs.boons.length ? `<div class="sub" style="margin-top:4px">舊版恩惠紀錄 ${bs.boons.length} 個：新版不生效，資料照樣保留。</div>` : "") + `</div>` + back;
    }
    else if (view === "boons") {
      const groups = {};
      bs.boons.forEach(b => { const k = b.id + "|" + (b.target ?? ""); (groups[k] = groups[k] || { b, n: 0 }).n++; });
      const list = Object.values(groups).sort((x, y) => y.b.r - x.b.r);
      body = `<div class="board"><div class="board-head">我的恩惠 <span class="sub">共${bs.boons.length}個｜累計恩惠 ${money(bs.total)}點</span></div>` +
        (list.length ? list.map(g => `<div class="row"><div class="grow" style="color:${BOON_COLOR(g.b.r)}">【${RARITY_NAME[g.b.r]}】${boonLabel(g.b)}</div><span>×${g.n}</span></div>`).join("")
          : '<div class="sub">還沒有恩惠。完成委託提升恩惠等級，每升一級抽一個。</div>') +
        `<div class="sub" style="margin-top:6px">機率：普通${B().boonRarity[0]}%／藍${B().boonRarity[1]}%／紫${B().boonRarity[2]}%／金${B().boonRarity[3]}%，可以重複疊加</div></div>` + back;
    }
    $("bossSay").textContent = say || "";
    $("bossBody").innerHTML = body;
    bossLine = null;
    renderHud();
  }
  function bossGo(v) {
    // 離開：一句不擋路的短提示，不留到下次進店
    if (v === "bye") { const w = tline("bye"); bossView = "menu"; go("mine"); toast(`${B().name}：「${w}」`); return; }
    // 補給：看廣告「之前」就說；領完再換一句
    if (v === "ad") { if (!dailyOK()) { toast("確認日期後可使用"); return; } if (adActive || save.ads.count >= config.rules.adDailyLimit) return; talkText = tline("adBefore"); talkView = bossView; $("bossSay").textContent = talkText; watchAd(); return; }
    if (v === "glass") { if (!dailyOK()) { toast("確認日期後可使用"); return; } openScope(); return; }
    bossView = v; renderShop();
  }

  async function watchAd() {
    if (adActive) return;
    if (!(await clockFresh())) { toast("確認日期後可使用"); renderShop(); return; }
    const s = adStart("supply");
    if (!s.p) { adStartFail(s.err); renderShop(); return; }
    adShow(s.p, "（廣告示意）", "之後會換成真實廣告｜中途取消不扣次數", "adCancelBtn", r => {
      if (!r) { toast("已取消，沒有扣次數"); renderShop(); return; }
      if (!r.ok) { toast("這次廣告已失效，沒有發放補給"); renderShop(); return; }
      bossLine = talkStage() >= 1 && lowTool() ? tline("adAfter") : tline("adAfter", 0);
      if (r.cross) toast(r.msg + "｜這次廣告算在昨天的次數，今天的次數沒有被扣。", 4000); else toast(r.msg); renderShop();
    });
  }

  /* ---------------- 共用 UI ---------------- */
  let toastTimer;
  function toast(msg, ms) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms || 1600);
  }
  function askName(first) {
    const box = $("modalBox");
    box.innerHTML = `<div>${first ? "歡迎來到「" + config.gameTitle + "」" : "修改名稱"}</div>
      <input id="nameInput" maxlength="12" placeholder="輸入你的名字" value="${save.name || ""}">
      <div class="btns"><button class="px-btn" id="nameOk">確定</button></div>`;
    $("modal").classList.remove("hidden");
    $("nameOk").onclick = () => {
      const v = $("nameInput").value.trim();
      if (!v) return;
      save.name = v; $("modal").classList.add("hidden"); persist(true); renderHud(); if (currentScreen === "acct") renderAcct();
    };
  }

  const lockOf = id => ((config.locks || {})[id]) || null;
  const locked = id => !!lockOf(id) && !save.pw[id];
  function askPassword(id, onOk) {
    const box = $("modalBox"), mine = mineDef(id);
    box.innerHTML = `<div>「${mine.name}」需要密碼</div>
      <div class="sub" style="margin-top:6px">坑口上了鎖。</div>
      <input id="pwInput" inputmode="numeric" maxlength="16" placeholder="輸入密碼">
      <div class="sub hidden" id="pwErr" style="color:#ff5555">密碼不對</div>
      <div class="btns"><button class="px-btn" id="pwOk">開鎖</button><button class="px-btn" id="pwNo">取消</button></div>`;
    $("modal").classList.remove("hidden");
    $("pwInput").focus();
    const tryIt = () => {
      const v = ($("pwInput").value || "").trim();
      if (pwHash(v) === lockOf(id)) {
        save.pw[id] = true; persist(true);
        $("modal").classList.add("hidden");
        toast("坑口的鎖開了");
        onOk();
      } else {
        $("pwErr").classList.remove("hidden");
        $("pwInput").value = "";
      }
    };
    $("pwOk").onclick = tryIt;
    $("pwInput").onkeydown = e => { if (e.key === "Enter") tryIt(); };
    $("pwNo").onclick = () => $("modal").classList.add("hidden");
  }

  function leaveMine() {
    if (save.senpai.story) { toast("先把回憶看完"); return; }
    const mine = curMine();
    const box = $("modalBox");
    box.innerHTML = `<div style="line-height:1.7">真的要離開嗎<br><span class="sub">離開了礦坑之後，坑洞將會坍塌，搜尋的結果也將重置喔…</span></div>
      <div class="btns"><button class="px-btn" id="lvOk">離開</button><button class="px-btn" id="lvNo">留下</button></div>`;
    $("modal").classList.remove("hidden");
    $("lvNo").onclick = () => $("modal").classList.add("hidden");
    $("lvOk").onclick = () => {
      stopAuto(); clearM2UI();
      if (mine.engine === 2) senpaiTripEnd();          // 確實從前輩礦坑離開
      $("modal").classList.add("hidden");
      go("map");
      delete save.plays[mine.id];
      delete save.plays2[mine.id];
      save.today.stats[mine.id] = { swings: 0, hits: 0, epic: 0, normalSwings: 0 };
      toast("坑洞坍塌了，" + mine.name + " 的搜尋結果已重置");
      persist(true); renderMap();
    };
  }

  let currentScreen = "mine";
  let recTab = "dex";          // 紀錄頁目前的子分頁：dex＝圖鑑、ach＝成就
  function clearM2UI() { const b = $("tbChoice"); if (b) { b.classList.add("hidden"); b.innerHTML = ""; } }
  function renderRec() {
    document.querySelectorAll("[data-rec]").forEach(b => { const on = b.dataset.rec === recTab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $("recDex").classList.toggle("hidden", recTab !== "dex");
    $("recAch").classList.toggle("hidden", recTab !== "ach");
    (recTab === "dex" ? renderDex : renderAch)();
  }
  function go(name) {
    if (name === "dex" || name === "ach") { recTab = name; name = "rec"; }   // 舊的入口名稱 → 紀錄頁的子分頁
    clearM2UI();
    if (name !== "mine") stopAuto();
    if (name === "shop" && currentScreen !== "shop") bossView = "menu";
    if (name === "shop" && currentScreen !== "shop" && currentScreen !== "scope") shopEnter();
    if (currentScreen === "shop" && name !== "shop" && name !== "scope") shopLeave();
    if (name !== "scope") scopeReset();
    currentScreen = name;
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === "scr-" + name));
    document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.go === (name === "scope" ? "shop" : name)));   // 觀測鏡屬於老闆，導覽亮「老闆」
    renderAll();
  }
  function renderAll() {
    applyLook();
    ({ mine: renderMine, bag: renderBag, map: renderMap, rec: renderRec, shop: renderShop, scope: renderScope, acct: renderAcct })[currentScreen]();
    renderHud();
  }

  /* ---------------- 事件綁定 ---------------- */
  $("nav").addEventListener("click", e => { const b = e.target.closest("button[data-go]"); if (b && !window.Editor?.isPicking()) go(b.dataset.go); });
  // 賣礦石：滑桿與數字框雙向同步（只改數字，不會賣出任何東西）
  $("bossBody").addEventListener("input", e => {
    const r = e.target.closest("[data-ore-range]"), n = e.target.closest("[data-ore-num]");
    if (r) sellSetQty(r.dataset.oreRange, r.value);
    else if (n) sellSetQty(n.dataset.oreNum, n.value);
  });
  // 數字框離開焦點時，把空白／非數字補回合法值
  $("bossBody").addEventListener("change", e => {
    const n = e.target.closest("[data-ore-num]");
    if (n) sellSetQty(n.dataset.oreNum, n.value);
  });

  // 礦脈觀測鏡：專屬畫面的互動
  $("scr-scope").addEventListener("click", e => {
    if (window.Editor?.isPicking()) return;
    const pick = e.target.closest("[data-scope-mine]");
    if (pick) { scopeReset(); scopeMine = pick.dataset.scopeMine; renderScope(); return; }
    if (e.target.closest("#scopeGo")) { scopeBuy(); return; }
    if (e.target.closest("#scopeSkip")) { scopeSettle(); return; }
    if (e.target.closest("#scopeBack")) { go("shop"); return; }
    if (e.target.closest("#scopeLens")) { scopeTap(); return; }
  });

  $("textbox").addEventListener("click", e => {
    if (window.Editor?.isPicking()) return;
    if (save.senpai.story) { storyTap(); return; }
    if (e.target.closest("#clockRetry")) { clockSync(); showClockMsg(); return; }
    if (Date.now() - storyDoneAt < 600) return;     // 剛收下回憶：連點的後幾下不要直接揮出去
    if (save.auto) { stopAuto(); return; }
    doSwing();
  });
  $("btnAuto").addEventListener("click", () => { if (!window.Editor?.isPicking()) toggleAuto(); });
  $("btnLeave").addEventListener("click", () => { if (!window.Editor?.isPicking()) leaveMine(); });
  $("scr-rec").addEventListener("click", e => {
    const b = e.target.closest("[data-rec]"); if (!b || window.Editor?.isPicking()) return;
    recTab = b.dataset.rec; renderRec(); $("scr-rec").scrollTop = 0;
  });
  $("hudName").addEventListener("click", () => { if (!window.Editor?.isPicking() && currentScreen !== "acct") { acctBack = currentScreen; go("acct"); } });
  document.addEventListener("click", e => {
    if (window.Editor?.isPicking()) return;
    const link = e.target.closest("[data-origin]"); if (link) { oreOrigin(link.dataset.origin); return; }
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    if (t.id === "btnBoardReset") { askBoardReset(); return; }
    if (t.id === "acctRename") { askName(false); return; }
    if (d.dexMine) { dexMine = d.dexMine; renderDex(); return; }
    if (d.rubyMock) { toast("示意畫面：還沒開放購買"); return; }
    if (t.id === "hudRuby") { if (!RUBY_PREVIEW) { toast("紅晶商店準備中，敬請期待"); return; } go("shop"); bossView = "ruby"; renderShop(); return; }
    if (t.id === "acctBack") { go(acctBack === "acct" ? "mine" : acctBack); return; }
    if (d.jump) { go("shop"); bossView = d.jump; renderShop(); return; }   // 背包 → 老闆的收購／買鎬子
    if (d.scopeAt) { if (!dailyOK()) { toast("確認日期後可使用"); return; } openScope(d.scopeAt); return; }   // 地圖 → 觀測鏡（選好礦坑）
    if (t.id === "btnBoonPick") { offerPick(true); return; }
    if (t.id === "btnSellAll") {
      const names = oreNames(); if (!names.length) return;
      const cnt = names.reduce((a, n) => a + save.ores[n], 0), sum = sellTotal(names.map(n => [n, save.ores[n]]));
      askSellAll(names.length, cnt, sum);
    }
    if (d.m2) { doSwing2({ choice: d.m2 }); return; }
    if (d.boss) bossGo(d.boss);
    if (d.deliver !== undefined) deliver(+d.deliver);
    if (d.equip) { save.equipped = +d.equip; const tt = save.tools.find(x => x.uid === +d.equip); if (tt) { const f = toolFactor(tt, curMine()); if (f < 1) toast(`工具等級不足：這座礦坑收益剩 ${Math.round(f * 100)}%`); } persist(); renderBag(); }
    if (d.oreMax) { const have = save.ores[d.oreMax] || 0; sellSetQty(d.oreMax, have); }
    if (d.oreSell) sell(d.oreSell, sellQty[d.oreSell] || 1);
    if (d.sell1) sell(d.sell1, 1);                    // 舊按鈕若還在別處被用到，行為不變
    if (d.sellall) sell(d.sellall, Infinity);
    if (d.goMine) {
      if (save.senpai.story) { toast("先把回憶看完再出發"); go("mine"); return; }
      if (locked(d.goMine)) { askPassword(d.goMine, () => { const b = document.querySelector(`[data-go-mine="${d.goMine}"]`); if (b) b.click(); }); return; }
      const from = curMine();
      if (from.engine === 2 && from.id !== d.goMine) { delete save.plays2[from.id]; toast("離開了「" + from.name + "」，累積全部歸零"); }
      if (from.engine === 2 && from.id !== d.goMine) senpaiTripEnd();        // 從前輩礦坑換到別座＝離開
      if (mineDef(d.goMine).engine === 2 && from.id !== d.goMine) senpaiTripStart();   // 走進前輩礦坑＝新的一趟
      save.mineId = d.goMine; save.equipped = null; clearM2UI(); persist();
      if (!(from.engine === 2 && from.id !== d.goMine)) toast("前往 " + mineDef(d.goMine).name);
      go("mine");
    }
    if (d.unlock) { const m = mineDef(d.unlock); if (save.coins >= m.unlock) { save.coins -= m.unlock; save.unlocked.push(m.id); persist(); toast("解鎖 " + m.name); renderMap(); renderHud(); } }
    if (d.buy) { const tl = toolDef(d.buy); if (!tl || !isStd(tl.id)) return; /* 只有標準鎬子能用金幣買 */ const pr = toolPrice(tl); if (save.coins >= pr) { save.coins -= pr; addTool(tl.id, 1); const t = talk(); bossLine = t.dealAt ? TK().boughtAfterDeliver : TK().bought; t.dealAt = 0; persist(); toast("購買 " + tl.name); renderShop(); } }
  });
  let clockSeenDay = todayKey();
  setInterval(() => { // 每 5 秒：可信日期換日／變成未知 → 重畫；委託板開著時跨日 → 換成新的一天（當日第 1 張、重置次數歸零）
    const k = todayKey();
    if (k !== clockSeenDay) { clockSeenDay = k; clockChanged(); }
    if (!k && !clock.syncing && mono() - clock.lastTry > 15000) clockSync();   // 日期未知（午夜同步計時器被延誤、或重試計時器沒排到）→ 再試
    if (currentScreen !== "shop" || bossView !== "board" || !$("modal").classList.contains("hidden")) return;
    if (k && save.boss.req && save.boss.req.day !== k) renderShop();
  }, 5000);
  setInterval(clockSync, 600000);   // 每 10 分鐘重新同步（裝置睡眠時單調時鐘可能停走）
  /* 分頁到背景：停自動、存檔；回到前景且離開超過 60 秒：先重新同步，完成前每日功能暫停用（clock.hold） */
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = { m: mono(), d: Date.now() }; stopAuto(); persist(true); return; }
    const away = hiddenAt ? Math.max(mono() - hiddenAt.m, Date.now() - hiddenAt.d) : 0;
    hiddenAt = null;
    if (away <= 60000) return;
    clock.hold = true; clockChanged();
    clockSync().finally(() => { clock.hold = false; clockChanged(); });
  });

  /* ---------------- 對外介面（給編輯模式用） ---------------- */
  window.Game = {
    get config() { return config; },
    get save() { return save; },
    defaults: () => clone(window.DEFAULT_CONFIG),
    setConfig(c, keep) { config = normTools(c); if (keep !== false) { if (!store.set(CFG_KEY, c)) toast("儲存失敗：圖片可能太大"); } renderAll(); },
    resetConfig() { store.del(CFG_KEY); config = normTools(clone(window.DEFAULT_CONFIG)); renderAll(); },
    stdTools: () => stdTools().map(t => t.id),
    setSave(s) { save = s; if (!save.plays2) save.plays2 = {}; fixSenpai(save); fixBoss(save, "import"); fixAds(save); fixToolDur(); storyFresh = false; persist(true); adLeftover(); renderAll(); },
    resetSave() { store.del(SAVE_KEY); save = newSave(); addTool("wood", 1); addTool("wood", 1); persist(true); renderAll(); askName(true); },
    persist, renderAll, toast, todaySetting, go, swing: () => doSwing(),
    setLock(id, pw) { config.locks = config.locks || {}; if (pw) { config.locks[id] = pwHash(pw); delete save.pw[id]; } else { delete config.locks[id]; } store.set(CFG_KEY, config); persist(true); renderAll(); },
    clearLockMemory(id) { delete save.pw[id]; persist(true); renderAll(); },
    m2: {
      get state() { return isM2() ? state2() : null; },
      isHere: () => isM2(),
      favor(boss) { const st = state2(); if (boss === "all") { st.favor.a = st.favor.b = st.favor.c = 1; } else st.favor[boss] = 1; persist(true); renderAll(); },
      setFavor(boss, v) { const st = state2(); st.favor[boss] = Math.max(0, Math.min(1, v)); persist(true); renderAll(); },
      senpai(boss, n) { fixSenpai(save); save.senpai.wins[boss] = Math.max(0, n | 0); persist(true); renderAll(); },   // 開發者：直接設定某位前輩的成功次數
      counts(boss, n) { const st = state2(); st.counts[boss] = Math.max(0, (st.counts[boss] || 0) + n); persist(true); renderAll(); },
      card(cat) { state2().forceCat = cat; renderAll(); },
      date(boss, win) {
        if (!todayKey()) return;
        const st = state2();
        E2.forceDate(M2(), todaySetting(curMine().id), st, boss, Math.random, win !== false);
        persist(true); go("mine");
      },
      at(boss) {
        const st = state2();
        Object.assign(st, { state: "at", atLeft: config.machine2.at.length, gain: 0, stRound: 0, upper: false, pickedBoss: null, sinceAt: 0, dateBoss: boss || "a" });
        persist(true); go("mine");
      },
      upper(on) { const st = state2(); st.upper = on !== false; st.pickedBoss = null; persist(true); renderAll(); },
      stBoss(boss) { const st = state2(); st.stBoss = boss; st.pickedBoss = boss; persist(true); renderAll(); },
      bonus(n) { const st = state2(); st.bonusTotal = n; st.bonusLeft = n; st.state = "bonus"; persist(true); go("mine"); },
      reset() { const id = curMine().id; delete save.plays2[id]; persist(true); renderAll(); }
    },
    addFavor: p => { const r = addFavor(p); persist(true); renderAll(); if (r.gained.length) showBoons(r.gained); if (r.ups && v2()) offerPick(); },
    /* 開發者（恩惠 v2）：直接設定階數／清空／全滿；只給編輯器與本機測試用 */
    boonsV2: {
      setTier(k, n) { if (!v2() || !BV.KINDS.includes(k)) return; save.boss.tiers[k] = Math.max(0, Math.min(BV.maxOf(config, k), n | 0)); save.boss.pending.forEach(p => { if (p.kind === "pick") p.opts = null; }); persist(true); renderAll(); },
      maxAll() { if (!v2()) return; BV.KINDS.forEach(k => { save.boss.tiers[k] = BV.maxOf(config, k); }); save.boss.pending.forEach(p => { if (p.kind === "pick") p.opts = null; }); persist(true); renderAll(); },
      reset() { if (!v2()) return; BV.KINDS.forEach(k => { save.boss.tiers[k] = 0; }); save.boss.pending = []; save.boss.rewardLv = save.boss.level; persist(true); renderAll(); },
      offer: () => offerPick(true),
      get failed() { return boonFail; },
      get on() { return v2(); },
      /* 備份清單只回傳 id、時間、來源、等級（不含帳號資料）；restore 用備份覆蓋目前存檔（之後照常遷移） */
      backups() { const b = (store.get(BOON_BACKUP_KEY) || {}).entries || {}; return Object.keys(b).map(id => ({ id, at: b[id].at, src: b[id].src, lv: ((b[id].save || {}).boss || {}).level, boons: (((b[id].save || {}).boss || {}).boons || []).length })); },
      backupSave(id) { const e = ((store.get(BOON_BACKUP_KEY) || {}).entries || {})[id]; return e ? clone(e.save) : null; },
      restore(id) { const e = ((store.get(BOON_BACKUP_KEY) || {}).entries || {})[id]; if (!e) return false; window.Game.setSave(clone(e.save)); return true; },
      sellTotal, autoWait, toolPrice, toolMax
    },
    newRequest: () => { const k = todayKey(); if (!k) return; const r = save.boss.req; save.boss.req = makeRequest(((r && r.day === k && r.no) || 0) + 1); persist(true); renderAll(); },   // 開發者：直接換板（不扣廣告次數）
    toolFactor, itemPrice, basePrice,
    /* 階段3B：唯讀的時鐘狀態（不含任何帳號資料）；重新同步只是再問一次伺服器，不能指定日期 */
    clockInfo: () => ({ day: todayKey(), last: lastTrustedDay, fail: clock.failKind, hold: clock.hold, sandbox: clock.sandbox, syncing: !!clock.syncing }),
    clockSync: () => clockSync()
  };
  if (SANDBOX) {
    window.Game.__ad = { start: adStart, complete: adComplete, cancel: adCancel };   // 只限 localhost 隔離測試：重送完成事件等案例
    window.Game.__mail = {
      set(data) { mailCache = clone(data || { mail: [], claimed: {} }); mailLoaded = true; renderMailBadge(); },
      open: openMail,
      unread: mailUnread
    };
  }

  /* ---------------- 啟動 ---------------- */
  applyLook();
  setTextbox([colored(pickOne(["點擊這裡揮鎬", "準備好了嗎？"]), config.theme.sub)], 0);
  if (window.Cloud) Cloud.onChange(() => { if (currentScreen === "map") renderCloud(); });
  $("mailBtn").addEventListener("click", async () => {
    if (window.Editor?.isPicking()) return;
    await loadMail(true); mailTab = "unread"; openMail();
  });
  loadMail();
  if (fixToolDur()) persist(true);   // 本機存檔：舊恩惠留下的過高耐久上限修回標準
  setTimeout(msSync, 3000);   // 開遊戲時補登上次沒送到的里程碑領取紀錄

  /* ---------------- 開發者模式：只有我進得去 ----------------
     1. 網址要帶 ?dev=1
     2. 而且 → 本機開檔（自己電腦測試）或 雲端帳號在 admins 名單裡
     玩家版根本不會下載 editor.js。 */
  async function tryDevMode() {
    if (!/[?&]dev=1/.test(location.search)) return;
    const local = location.protocol === "file:" || /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
    if (!local) {
      if (!window.Cloud || !Cloud.enabled() || !Cloud.user()) return;
      if (!(await Cloud.isAdmin())) return;
    }
    devMode = true;
    const sc = document.createElement("script");
    sc.src = "js/editor.js?v=" + (window.GAME_VERSION || "");
    sc.onload = () => { $("editFab").classList.remove("hidden"); renderAll(); };
    document.body.appendChild(sc);
  }
  tryDevMode();

  glassState();   // 一開遊戲就檢查／清除舊版觀測鏡的紀錄（不必等玩家打開觀測畫面）
  adLeftover();   // 上次關頁／當機留下的待完成廣告 → 取消（Q2＝A）
  renderAll();
  renderClockTag();
  if (!todayKey()) showClockMsg();   // 還沒拿到台灣日期：先顯示確認中（被開場動畫蓋住；失敗時動畫收起後看得到重試）
  splashRun();
  clockSync();
  if (!save.name) askName(true);
})();
