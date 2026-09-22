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

  function head(auth) {
    const h = { "apikey": CFG.anonKey, "Content-Type": "application/json" };
    h["Authorization"] = "Bearer " + (auth && sess ? sess.access_token : CFG.anonKey);
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
    [/row-level security|permission denied/i, "資料表權限規則沒設好（RLS）"]
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
    saveSess(null); adminFlag = null; setStatus("out");
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
  async function push(save, opt) {
    if (!ok() || !sess) return { ok: false, err: "未登入" };
    const row = {
      user_id: sess.user.id,
      name: save.name || "",
      coins: Math.round(save.coins || 0),
      ver: window.GAME_VERSION || "",
      data: save,
      updated_at: new Date().toISOString()
    };
    const body = JSON.stringify([row]);
    try {
      await withAuth(() => jfetch("/rest/v1/saves", {
        method: "POST",
        headers: Object.assign(head(true), { "Prefer": "resolution=merge-duplicates,return=minimal" }),
        body: body,
        keepalive: !!(opt && opt.keepalive)
      }));
      setStatus("in");
      return { ok: true };
    } catch (e) { setStatus("error", e.message); return { ok: false, err: e.message }; }
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

  window.Cloud = {
    enabled: ok,
    isAdmin, mailbox, claim,
    status: () => (ok() ? status : "off"),
    error: () => lastErr,
    user: () => (sess ? sess.user : null),
    onChange: f => listeners.push(f),
    signUp, signIn, signOut, pull, push
  };
})();
