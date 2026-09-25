/* ===== 雲端存檔（Supabase）=====
   只用瀏覽器內建的 fetch，不載入任何外部函式庫，所以沒網路時整個模組會安靜地失敗，
   遊戲仍然是單機可玩的。

   資料表 public.saves（欄位）：
     user_id uuid  主鍵，= 登入者的 id
     name    text  玩家名稱（方便你在後台一眼看出是誰）
     coins   bigint 金幣（方便後台排序、之後做排行榜）
     ver     text  遊戲版本
     data    jsonb 整包存檔
     updated_at timestamptz

   權限：RLS 開啟，三條規則都是 auth.uid() = user_id，
   所以就算有人拿到 anonKey，也只讀得到自己那一列。 */
(function () {
  "use strict";
  const CFG = window.SUPABASE || {};
  const SESS_KEY = "mine_cloud_v1";
  const ok = () => !!(CFG.url && CFG.anonKey);

  let sess = null;                 // { access_token, refresh_token, expires_at, user:{id,email} }
  let status = "off";              // off | out | in | busy | error
  let lastErr = "";
  const listeners = [];

  try { sess = JSON.parse(localStorage.getItem(SESS_KEY) || "null"); } catch (e) { sess = null; }
  if (ok()) status = sess ? "in" : "out";

  function saveSess(s) {
    sess = s;
    try { s ? localStorage.setItem(SESS_KEY, JSON.stringify(s)) : localStorage.removeItem(SESS_KEY); } catch (e) {}
  }
  function setStatus(s, err) { status = s; lastErr = err || ""; listeners.forEach(f => { try { f(s, lastErr); } catch (e) {} }); }

  /* 標頭：apikey 一定要帶；Authorization 只在「已登入」時帶使用者的 token。
     以前未登入時會把金鑰本身塞進 Authorization，那只有舊版 anon 金鑰（JWT）吃得下，
     新版 sb_publishable_ 金鑰會被拒絕。改成這樣兩種金鑰都能用。 */
  function head(auth) {
    const h = { "apikey": CFG.anonKey, "Content-Type": "application/json" };
    if (auth && sess && sess.access_token) h["Authorization"] = "Bearer " + sess.access_token;
    return h;
  }
  /* 把英文錯誤換成看得懂的中文 */
  const ERR_MAP = [
    [/failed to fetch|networkerror|load failed/i, "連不上雲端（網路斷了，或 Supabase 網址打錯）"],
    [/invalid login credentials/i, "Email 或密碼不對"],
    [/user already registered|already been registered/i, "這個 Email 已經註冊過了，直接登入就好"],
    [/email not confirmed/i, "還沒點驗證信，去收信確認後再登入"],
    [/password should be at least/i, "密碼太短"],
    [/invalid email/i, "Email 格式不對"],
    [/rate limit|too many/i, "太頻繁了，等一下再試"],
    [/relation .*saves.* does not exist/i, "後台還沒建 saves 資料表"],
    [/row-level security|permission denied/i, "資料表權限規則沒設好（RLS）"],
    [/could not find the function|function .* does not exist/i, "後台還沒執行 docs/07 的 SQL（找不到這個指令）"],
    [/relation .*player_profiles.* does not exist/i, "後台還沒建 player_profiles 資料表（請先跑 docs/07 的 SQL）"]
  ];
  function zh(msg) {
    const m = String(msg || "");
    for (const [re, t] of ERR_MAP) if (re.test(m)) return t;
    return m;
  }

  async function jfetch(path, opt) {
    const r = await fetch(CFG.url.replace(/\/+$/, "") + path, opt).catch(e => { throw new Error(zh(e.message)); });
    let body = null;
    const t = await r.text();
    if (t) { try { body = JSON.parse(t); } catch (e) { body = t; } }
    if (!r.ok) {
      const msg = (body && (body.msg || body.message || body.error_description || body.error)) || ("HTTP " + r.status);
      const e = new Error(zh(msg)); e.status = r.status; e.body = body; throw e;
    }
    return body;
  }

  function keepSession(d) {
    if (!d || !d.access_token) return null;
    const s = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000 - 60000,
      user: { id: (d.user || {}).id, email: (d.user || {}).email }
    };
    saveSess(s);
    return s;
  }

  async function refresh() {
    if (!sess || !sess.refresh_token) throw new Error("未登入");
    const d = await jfetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: head(false), body: JSON.stringify({ refresh_token: sess.refresh_token })
    });
    if (!keepSession(d)) throw new Error("換新登入失敗");
  }
  async function withAuth(fn) {
    if (!sess) throw new Error("未登入");
    if (Date.now() > (sess.expires_at || 0)) await refresh();
    try { return await fn(); }
    catch (e) {
      if (e.status === 401) { await refresh(); return await fn(); }
      throw e;
    }
  }

  /* ---------- 帳號 ---------- */
  async function signUp(email, password) {
    setStatus("busy");
    try {
      const d = await jfetch("/auth/v1/signup", {
        method: "POST", headers: head(false), body: JSON.stringify({ email: email, password: password })
      });
      if (keepSession(d)) { setStatus("in"); return { ok: true, signedIn: true }; }
      setStatus("out");
      return { ok: true, signedIn: false };   // 後台開了信箱驗證 → 要先去收信
    } catch (e) { setStatus("error", e.message); return { ok: false, err: e.message }; }
  }
  async function signIn(email, password) {
    setStatus("busy");
    try {
      const d = await jfetch("/auth/v1/token?grant_type=password", {
        method: "POST", headers: head(false), body: JSON.stringify({ email: email, password: password })
      });
      if (!keepSession(d)) throw new Error("登入回應不正確");
      setStatus("in");
      return { ok: true };
    } catch (e) { setStatus("error", e.message); return { ok: false, err: e.message }; }
  }
  async function signOut() {
    try { if (sess) await jfetch("/auth/v1/logout", { method: "POST", headers: head(true) }); } catch (e) {}
    saveSess(null); adminFlag = null; playerIdCache = null; setStatus("out");
  }

  /* ---------- 存檔 ---------- */
  async function pull() {
    if (!ok() || !sess) return null;
    return await withAuth(async () => {
      const rows = await jfetch("/rest/v1/saves?select=*&user_id=eq." + encodeURIComponent(sess.user.id), {
        headers: head(true)
      });
      return (rows && rows[0]) || null;
    });
  }
  /* 上傳（v0.10.3：加上版本號衝突偵測 optimistic concurrency）

     每份存檔帶一個 rev。上傳時用「只有雲端的 rev 跟我手上的一樣才寫得進去」的條件式更新：
       PATCH /saves?user_id=eq.<我>&rev=eq.<我手上的 rev>
     成功 → 回傳被更新的那一列，rev 已經 +1。
     更新到 0 列 → 代表雲端的 rev 已經被別台裝置推進了（或這列還不存在）。
     這時候**絕對不覆蓋**，而是回報 conflict，交給遊戲端跳出「要留哪一邊」讓玩家選。

     updated_at 現在由資料庫的 trigger 填，客戶端送什麼都不算數。 */
  async function push(save, opt) {
    if (!ok() || !sess) return { ok: false, err: "未登入" };
    const uid = sess.user.id;
    const myRev = Number(save.rev || 0);
    const nextRev = myRev + 1;
    const body = (rev) => JSON.stringify({
      name: save.name || "",
      coins: Math.round(save.coins || 0),
      ver: window.GAME_VERSION || "",
      rev: rev,
      data: Object.assign({}, save, { rev: rev })
    });
    const pref = { "Prefer": "return=representation" };
    try {
      // ① 條件式更新
      const rows = await withAuth(() => jfetch(
        "/rest/v1/saves?user_id=eq." + encodeURIComponent(uid) + "&rev=eq." + myRev,
        { method: "PATCH", headers: Object.assign(head(true), pref), body: body(nextRev), keepalive: !!(opt && opt.keepalive) }
      ));
      if (rows && rows.length) {
        save.rev = rows[0].rev;
        setStatus("in");
        return { ok: true, rev: rows[0].rev };
      }
      // ② 沒更新到 → 先看看雲端到底有沒有那一列
      const cur = await pull();
      if (!cur) {
        const ins = await withAuth(() => jfetch("/rest/v1/saves", {
          method: "POST",
          headers: Object.assign(head(true), pref),
          body: JSON.stringify([Object.assign(JSON.parse(body(1)), { user_id: uid })])
        }));
        save.rev = (ins && ins[0] && ins[0].rev) || 1;
        setStatus("in");
        return { ok: true, rev: save.rev, created: true };
      }
      // ③ 有那一列、但 rev 不一樣 → 有別台裝置寫過，不覆蓋
      setStatus("error", "雲端有更新的存檔（別台裝置存過）");
      return { ok: false, conflict: true, remote: cur, err: "雲端有更新的存檔（別台裝置存過）" };
    } catch (e) {
      setStatus("error", e.message);
      return { ok: false, err: e.message };
    }
  }
  /* 玩家在衝突畫面選了「用這台的」→ 接手雲端目前的 rev 再寫一次 */
  async function pushOver(save, remoteRev) {
    save.rev = Number(remoteRev || 0);
    return await push(save);
  }

  /* ---------- 信箱 ---------- */
  let adminFlag = null;                 // null = 還沒查
  async function isAdmin() {
    if (!ok() || !sess) return false;
    if (adminFlag !== null) return adminFlag;
    try {
      const rows = await withAuth(() => jfetch("/rest/v1/admins?select=user_id&user_id=eq." + encodeURIComponent(sess.user.id), { headers: head(true) }));
      adminFlag = !!(rows && rows.length);
    } catch (e) { adminFlag = false; }
    return adminFlag;
  }
  /* 我收得到的信（RLS 已經過濾成「全體信 + 指定給我的信」） */
  async function mailbox() {
    if (!ok() || !sess) return { mail: [], claimed: {} };
    return await withAuth(async () => {
      const [mail, claims] = await Promise.all([
        jfetch("/rest/v1/mail?select=*&order=id.desc&limit=50", { headers: head(true) }),
        jfetch("/rest/v1/mail_claims?select=mail_id&user_id=eq." + encodeURIComponent(sess.user.id), { headers: head(true) })
      ]);
      const claimed = {};
      (claims || []).forEach(c => { claimed[c.mail_id] = true; });
      return { mail: mail || [], claimed: claimed };
    });
  }
  /* 領取：先搶下領取記錄，搶到了才發獎勵。重複領會被主鍵擋掉（409） */
  async function claim(mailId) {
    if (!ok() || !sess) return { ok: false, err: "未登入" };
    try {
      await withAuth(() => jfetch("/rest/v1/mail_claims", {
        method: "POST",
        headers: Object.assign(head(true), { "Prefer": "return=minimal" }),
        body: JSON.stringify([{ user_id: sess.user.id, mail_id: mailId }])
      }));
      return { ok: true };
    } catch (e) {
      if (e.status === 409) return { ok: false, err: "這封信已經領過了" };
      return { ok: false, err: e.message };
    }
  }

  /* ---------- RPC（呼叫資料庫函式） ----------
     一律帶登入者自己的 Bearer token，權限由資料庫端的 is_admin_caller() 決定。
     前端藏不藏按鈕跟安全無關，真正的邊界在 RPC 裡。
     錯誤訊息只轉成中文，絕不把 token 寫進訊息或 console。 */
  async function rpc(name, args) {
    if (!ok()) return { ok: false, err: "雲端未設定" };
    if (!sess) return { ok: false, err: "未登入" };
    try {
      const d = await withAuth(() => jfetch("/rest/v1/rpc/" + name, {
        method: "POST", headers: head(true), body: JSON.stringify(args || {})
      }));
      return { ok: true, data: d };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }

  /* ---------- 玩家 ID ---------- */
  let playerIdCache = null;
  async function myPlayerId(force) {
    if (!ok() || !sess) return null;
    if (playerIdCache && !force) return playerIdCache;
    const r = await rpc("my_player_id", {});
    if (!r.ok) return null;
    playerIdCache = typeof r.data === "string" ? r.data : String(r.data || "");
    return playerIdCache || null;
  }

  /* ---------- 管理員操作（伺服器端會再驗一次身分） ---------- */
  const PID = /^[1-9][0-9]{5}$/;

  async function adminChangePlayerId(curId, newId, note) {
    if (!PID.test(String(curId || ""))) return { ok: false, err: "目前的玩家 ID 必須是六碼數字" };
    if (!PID.test(String(newId || ""))) return { ok: false, err: "新的玩家 ID 必須是六碼數字" };
    if (String(curId) === String(newId)) return { ok: false, err: "新舊玩家 ID 相同，沒有需要修改的地方" };
    const r = await rpc("admin_change_player_id", { cur_id: String(curId), new_id: String(newId), note: note || null });
    return r.ok ? { ok: true, msg: r.data } : r;
  }

  /* m = { mode:"self"|"player"|"all", playerId, title, body, coins, ore, oreQty, tool, toolQty, days } */
  async function adminSend(m) {
    const a = {
      p_title: String(m.title || ""), p_body: String(m.body || ""),
      p_coins: Math.round(Number(m.coins) || 0),
      p_ore: m.ore || null, p_ore_qty: Math.round(Number(m.oreQty) || 0),
      p_tool: m.tool || null, p_tool_qty: Math.round(Number(m.toolQty) || 0),
      p_days: Math.round(Number(m.days) || 30)
    };
    let r;
    if (m.mode === "all") r = await rpc("admin_send_all", a);
    else if (m.mode === "player") {
      if (!PID.test(String(m.playerId || ""))) return { ok: false, err: "玩家 ID 必須是六碼數字" };
      r = await rpc("admin_send_to_player", Object.assign({ p_player_id: String(m.playerId) }, a));
    } else r = await rpc("admin_send_self", a);
    return r.ok ? { ok: true, mailId: r.data } : r;
  }

  async function adminListMail() {
    const r = await rpc("admin_list_mail", {});
    return r.ok ? { ok: true, rows: r.data || [] } : r;
  }
  async function adminUnsend(mailId) {
    const r = await rpc("admin_unsend_mail", { p_mail_id: Math.round(Number(mailId) || 0) });
    return r.ok ? { ok: true, msg: r.data } : r;
  }

  window.Cloud = {
    enabled: ok,
    isAdmin, mailbox, claim,
    myPlayerId, adminChangePlayerId, adminSend, adminListMail, adminUnsend,
    status: () => (ok() ? status : "off"),
    error: () => lastErr,
    user: () => (sess ? sess.user : null),
    onChange: f => listeners.push(f),
    signUp, signIn, signOut, pull, push, pushOver
  };
})();
