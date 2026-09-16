/* =========================================================
   編輯模式 Editor
   - 版面：點選畫面元素 → 拖曳移動、調大小顏色
   - 主題 / 圖片 / 文字 / 數值：直接改設定檔
   - 模擬：用和遊戲同一套引擎跑數萬揮，驗證機率
   - 匯出：把改好的設定 JSON 交給 Claude 寫回程式
   ========================================================= */
(function () {
  const G = window.Game, E = window.MineEngine;
  const ed = document.getElementById("editor");
  const fab = document.getElementById("editFab");
  const clone = o => JSON.parse(JSON.stringify(o));
  let draft = null, tab = "layout", picking = false, selected = null;

  const commit = (keep) => G.setConfig(draft, keep);
  const getPath = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
  function setPath(o, p, v) { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => { if (a[k] == null) a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  /* ---------------- 開關 ---------------- */
  fab.onclick = () => {
    const open = ed.classList.contains("hidden");
    ed.classList.toggle("hidden", !open);
    document.body.classList.toggle("editing", open);
    if (open) { draft = clone(G.config); render(); }
    else { setPicking(false); select(null); }
  };
  function setPicking(v) { picking = v; document.body.classList.toggle("picking", v); document.body.style.touchAction = v ? "none" : ""; }

  /* ---------------- 外框 ---------------- */
  const TABS = [["layout", "版面"], ["theme", "顏色"], ["images", "圖片"], ["texts", "文字"], ["numbers", "數值"], ["sim", "模擬"], ["data", "存檔/測試"]];
  function render() {
    ed.innerHTML = `
      <div class="ed-head"><span class="ttl">✎ 編輯模式</span>
        <button class="ed-btn" id="edMini">縮小</button>
        <button class="ed-btn" id="edClose">關閉</button></div>
      <div class="ed-tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? "active" : ""}">${n}</button>`).join("")}</div>
      <div class="ed-body" id="edBody"></div>`;
    ed.querySelector("#edMini").onclick = () => { ed.classList.toggle("mini"); ed.querySelector("#edMini").textContent = ed.classList.contains("mini") ? "展開" : "縮小"; };
    ed.querySelector("#edClose").onclick = () => fab.onclick();
    ed.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; if (tab !== "layout") setPicking(false); render(); });
    const body = ed.querySelector("#edBody");
    ({ layout: tabLayout, theme: tabTheme, images: tabImages, texts: tabTexts, numbers: tabNumbers, sim: tabSim, data: tabData })[tab](body);
  }

  const screenJump = () => `<div class="ed-flex">切換畫面：${[["mine", "挖礦"], ["bag", "背包"], ["map", "地圖"], ["dex", "圖鑑"], ["shop", "工坊"]].map(([k, n]) => `<button class="ed-btn" data-jump="${k}">${n}</button>`).join("")}</div>`;
  function bindJump(body) { body.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => { G.go(b.dataset.jump); if (selected) select(null); }); }

  /* ================= 版面 ================= */
  function tabLayout(body) {
    const L = selected ? (draft.layout[selected.dataset.edit] || {}) : null;
    body.innerHTML = `
      ${screenJump()}
      <div class="ed-flex"><button class="ed-btn ${picking ? "on" : ""}" id="pk">${picking ? "● 點選模式開啟中" : "開啟點選模式"}</button>
      <button class="ed-btn danger" id="rstAll">重設全部版面</button></div>
      <div class="ed-note">開啟點選模式後，點畫面上的虛線區塊來選取；按住拖曳可以移動位置。點選模式中遊戲按鈕不會作用。</div>
      ${selected ? `
        <div class="ed-sec">已選取：${esc(selected.dataset.label || selected.dataset.edit)}</div>
        ${num("X 位移(px)", "x", L.x, -300, 300)}${num("Y 位移(px)", "y", L.y, -300, 300)}
        ${num("寬度(%)", "w", L.w, 20, 100)}${num("最小高度(px)", "h", L.h, 0, 600)}
        ${num("字級(倍)", "fs", L.fs, 0.5, 3, 0.05)}${num("內距(px)", "pad", L.pad, 0, 40)}
        ${num("圓角(px)", "radius", L.radius, 0, 40)}${num("透明度", "opacity", L.opacity, 0, 1, 0.05)}
        ${col("背景色", "bg", L.bg)}${col("文字色", "color", L.color)}${col("邊框色", "border", L.border)}
        <div class="ed-row"><label>隱藏</label><input type="checkbox" data-lk="hidden" ${L.hidden ? "checked" : ""}></div>
        <div class="ed-flex"><button class="ed-btn" id="rstOne">重設此元素</button><button class="ed-btn" id="unsel">取消選取</button></div>`
      : `<div class="ed-note">尚未選取元素。</div>`}`;
    bindJump(body);
    body.querySelector("#pk").onclick = () => { setPicking(!picking); render(); };
    body.querySelector("#rstAll").onclick = () => { if (confirm("重設所有版面調整？")) { draft.layout = {}; commit(); render(); } };
    if (!selected) return;
    const id = selected.dataset.edit;
    const upd = (k, v) => { draft.layout[id] = draft.layout[id] || {}; if (v === "" || v === null) delete draft.layout[id][k]; else draft.layout[id][k] = v; commit(); };
    body.querySelectorAll("[data-lk]").forEach(inp => {
      const k = inp.dataset.lk;
      const h = () => {
        if (inp.type === "checkbox") upd(k, inp.checked || null);
        else if (inp.type === "color") upd(k, inp.value);
        else upd(k, inp.value === "" ? "" : +inp.value);
        const twin = body.querySelector(`[data-twin="${k}"]`); if (twin && inp !== twin) twin.value = inp.value;
      };
      inp.oninput = h;
    });
    body.querySelectorAll("[data-twin]").forEach(r => r.oninput = () => { const t = body.querySelector(`[data-lk="${r.dataset.twin}"]`); t.value = r.value; t.oninput(); });
    body.querySelectorAll("[data-clr]").forEach(b => b.onclick = () => { upd(b.dataset.clr, ""); render(); });
    body.querySelector("#rstOne").onclick = () => { delete draft.layout[id]; commit(); render(); };
    body.querySelector("#unsel").onclick = () => { select(null); render(); };
  }
  function num(label, k, v, min, max, step) {
    step = step || 1;
    return `<div class="ed-row"><label>${label}</label><div style="display:grid;grid-template-columns:1fr 70px;gap:6px">
      <input type="range" min="${min}" max="${max}" step="${step}" value="${v ?? ""}" data-twin="${k}">
      <input type="number" step="${step}" value="${v ?? ""}" data-lk="${k}" placeholder="預設"></div></div>`;
  }
  function col(label, k, v) {
    return `<div class="ed-row"><label>${label}</label><div class="ed-flex" style="margin:0;align-items:center">
      <input type="color" value="${v || "#000000"}" data-lk="${k}"> <span class="ed-note" style="margin:0">${v || "預設"}</span>
      ${v ? `<button class="ed-btn" data-clr="${k}">清除</button>` : ""}</div></div>`;
  }

  function select(el) {
    document.querySelectorAll(".edit-selected").forEach(e => e.classList.remove("edit-selected"));
    selected = el; if (el) el.classList.add("edit-selected");
  }
  // 點選 + 拖曳
  let drag = null;
  document.addEventListener("pointerdown", e => {
    if (!picking || ed.contains(e.target) || e.target === fab) return;
    const el = e.target.closest("[data-edit]"); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    select(el);
    const id = el.dataset.edit; const L = draft.layout[id] || {};
    drag = { id, sx: e.clientX, sy: e.clientY, ox: L.x || 0, oy: L.y || 0, moved: false };
    render();
  }, true);
  document.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = Math.round(e.clientX - drag.sx), dy = Math.round(e.clientY - drag.sy);
    if (Math.abs(dx) + Math.abs(dy) < 4 && !drag.moved) return;
    drag.moved = true;
    draft.layout[drag.id] = draft.layout[drag.id] || {};
    draft.layout[drag.id].x = drag.ox + dx; draft.layout[drag.id].y = drag.oy + dy;
    commit(false);
  });
  document.addEventListener("pointerup", () => { if (drag) { if (drag.moved) { commit(); render(); } drag = null; } });
  document.addEventListener("click", e => { if (picking && !ed.contains(e.target) && e.target !== fab) { e.preventDefault(); e.stopPropagation(); } }, true);

  /* ================= 顏色 ================= */
  function tabTheme(body) {
    const th = draft.theme;
    const themeRows = [["bg", "背景"], ["panel", "面板"], ["panelDark", "深色面板/外框"], ["border", "邊線"], ["accent", "強調色"], ["text", "文字"], ["sub", "次要文字"]]
      .map(([k, n]) => `<div class="ed-row"><label>${n}</label><input type="color" data-p="theme.${k}" value="${th[k]}"></div>`).join("");
    body.innerHTML = `
      <div class="ed-row"><label>遊戲名稱</label><input type="text" data-p="gameTitle" value="${esc(draft.gameTitle)}"></div>
      <div class="ed-sec">介面主題</div>${themeRows}
      <div class="ed-row"><label>基本字級(px)</label><input type="number" data-p="theme.fontSize" data-num value="${th.fontSize}"></div>
      <div class="ed-sec">稀有度（文字顏色分級）</div>
      ${draft.rarities.map((r, i) => `<div class="ed-row"><label><span style="color:${r.color}">■</span> 等級${i}</label>
        <div class="ed-flex" style="margin:0"><input type="color" data-p="rarities.${i}.color" value="${r.color}">
        <input type="text" style="width:90px" data-p="rarities.${i}.name" value="${esc(r.name)}"></div></div>`).join("")}
      <div class="ed-sec">敘述框期待度顏色</div>
      <div class="ed-note">「虹」固定為彩虹動畫。</div>
      ${draft.rules.omen.colors.map((c, i) => c === "rainbow" ? "" : `<div class="ed-row"><label>${draft.rules.omen.names[i]}</label><input type="color" data-p="rules.omen.colors.${i}" value="${c}"></div>`).join("")}`;
    bindP(body);
  }
  function bindP(body) {
    body.querySelectorAll("[data-p]").forEach(inp => {
      inp.onchange = inp.oninput = () => {
        let v = inp.value;
        if (inp.hasAttribute("data-num")) v = +v;
        if (inp.hasAttribute("data-lines")) v = v.split("\n").map(s => s.trim()).filter(Boolean);
        setPath(draft, inp.dataset.p, v); commit();
      };
    });
  }

  /* ================= 圖片 ================= */
  function imageSlots() {
    return [["bg", "整體背景"], ["hud", "頂部資訊列"], ["scene", "場景區（通用）"], ["textbox", "敘述框"], ["nav", "底部導覽"]]
      .concat(draft.mines.map(m => ["mine_" + m.id, "場景：" + m.name]))
      .concat(draft.tools.map(t => ["tool_" + t.id, "工具圖示：" + t.name]));
  }
  function tabImages(body) {
    const img = draft.images || (draft.images = {});
    body.innerHTML = `<div class="ed-note">上傳後會自動縮小（最長邊 ${480}px，保留像素感）並存在這台裝置。圖片太多可能超過瀏覽器容量，建議用 PNG 像素圖。<br>
      正式版本請把圖片檔交給 Claude 放進 images 資料夾。</div>
      ${imageSlots().map(([k, n]) => `<div class="ed-img"><span>${n}</span>
        <div class="pv" style="${img[k] ? `background-image:url(${img[k]})` : ""}"></div>
        <label class="ed-btn">上傳<input type="file" accept="image/*" data-img="${k}" hidden></label>
        <button class="ed-btn danger" data-rm="${k}" ${img[k] ? "" : "disabled"}>移除</button></div>`).join("")}`;
    body.querySelectorAll("[data-img]").forEach(inp => inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          const MAX = 480, sc = Math.min(1, MAX / Math.max(im.width, im.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
          const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false;
          cx.drawImage(im, 0, 0, cv.width, cv.height);
          img[inp.dataset.img] = cv.toDataURL("image/png");
          commit(); render();
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    body.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { delete img[b.dataset.rm]; commit(); render(); });
  }

  /* ================= 文字 ================= */
  function tabTexts(body) {
    const T = draft.texts;
    const single = [["veinStart", "礦脈開始"], ["veinContinue", "礦脈延續"], ["veinEnd", "礦脈結束"], ["fakeEnd", "假前兆結束"], ["koukakuHint", "高確暗示"], ["tenjou", "天井"], ["toolDrop", "工具掉落"], ["toolBreak", "工具損壞"], ["noTool", "沒有工具"], ["tap", "點擊提示"]];
    body.innerHTML = `
      <div class="ed-note">多行欄位：一行一個，遊戲會隨機挑一句。</div>
      <div class="ed-sec">揮擊音效字</div><textarea rows="3" data-p="texts.swing" data-lines>${T.swing.join("\n")}</textarea>
      <div class="ed-sec">挖到碎石</div><textarea rows="3" data-p="texts.rubble" data-lines>${T.rubble.join("\n")}</textarea>
      <div class="ed-sec">期待度文字（白→虹，第1行為白色通常不顯示）</div>
      ${T.omenLine.map((l, i) => `<div class="ed-row"><label>${draft.rules.omen.names[i]}</label><input type="text" data-p="texts.omenLine.${i}" value="${esc(l)}"></div>`).join("")}
      <div class="ed-sec">事件文字</div>
      ${single.map(([k, n]) => `<div class="ed-row"><label>${n}</label><input type="text" data-p="texts.${k}" value="${esc(T[k])}"></div>`).join("")}
      <div class="ed-sec">礦坑與礦石名稱（名稱不可重複）</div>
      ${draft.mines.map((m, mi) => `<div class="ed-row"><label>礦坑${mi + 1}</label><input type="text" data-p="mines.${mi}.name" value="${esc(m.name)}"></div>
        ${draft.categories.filter(c => c.id !== "rubble").map(c => `<div class="ed-row"><label style="color:${draft.rarities[c.rarity].color}">　${c.name}</label>
          <input type="text" data-p="mines.${mi}.items.${c.id}" data-csv value="${esc((m.items[c.id] || []).join("、"))}"></div>`).join("")}`).join("")}
      <div class="ed-sec">工具名稱</div>
      ${draft.tools.map((t, i) => `<div class="ed-row"><label>第${t.tier}階</label><input type="text" data-p="tools.${i}.name" value="${esc(t.name)}"></div>`).join("")}`;
    bindP(body);
    body.querySelectorAll("[data-csv]").forEach(inp => inp.onchange = inp.oninput = () => {
      setPath(draft, inp.dataset.p, inp.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean)); commit();
    });
  }

  /* ================= 數值 ================= */
  const CAT_N = { rubble: "碎石", common: "普通", good: "優良", rare: "稀有", epic: "史詩", legend: "傳說" };
  function table6(title, path, cats, note) {
    const obj = getPath(draft, path);
    return `<div class="ed-sec">${title}</div>${note ? `<div class="ed-note">${note}</div>` : ""}<div class="ed-scroll"><table class="ed-table">
      <tr><th></th>${[1, 2, 3, 4, 5, 6].map(s => `<th>設定${s}</th>`).join("")}</tr>
      ${cats.map(c => `<tr><th>${CAT_N[c] || c}</th>${obj[c].map((v, i) => `<td><input type="number" step="any" data-n="${path}.${c}.${i}" value="${v}"></td>`).join("")}</tr>`).join("")}
      </table></div>`;
  }
  function arr6(title, path, note) {
    const a = getPath(draft, path);
    return `<div class="ed-sec">${title}</div>${note ? `<div class="ed-note">${note}</div>` : ""}<div class="ed-scroll"><table class="ed-table">
      <tr>${a.map((_, i) => `<th>設定${i + 1}</th>`).join("")}</tr><tr>${a.map((v, i) => `<td><input type="number" step="any" data-n="${path}.${i}" value="${v}"></td>`).join("")}</tr></table></div>`;
  }
  const field = (label, path) => `<div class="ed-row"><label>${label}</label><input type="number" step="any" data-n="${path}" value="${getPath(draft, path)}"></div>`;
  function tabNumbers(body) {
    const R = draft.rules; draft.play = draft.play || { autoInterval: 350, autoStopOmen: 3 };
    const itemCats = ["common", "good", "rare", "epic", "legend"], allCats = ["rubble", ...itemCats];
    body.innerHTML = `
      <div class="ed-note">機率用小數：0.01 = 1%。改完到「模擬」分頁跑一次，確認初當機率與機械割。</div>
      ${table6("① 小役機率（通常/高確/前兆）", "rules.itemTable", itemCats, "碎石 = 1 − 其他加總")}
      ${table6("② 礦脈中的小役機率", "rules.veinTable", itemCats)}
      ${table6("③ 礦脈當選率｜通常", "rules.veinWin.normal", allCats, "抽到該小役時當選礦脈的機率")}
      ${table6("④ 礦脈當選率｜高確", "rules.veinWin.koukaku", allCats)}
      ${table6("⑤ 通常→高確 移行率", "rules.toKoukaku", allCats)}
      ${arr6("⑥ 礦脈延續率", "rules.vein.continue")}
      ${arr6("⑦ 每日設定分配比例（加總=1）", "rules.settingDist")}
      <div class="ed-sec">⑧ 其他</div>
      ${field("高確轉落率", "rules.koukakuDrop")}${field("前兆最短(揮)", "rules.zencho.min")}${field("前兆最長(揮)", "rules.zencho.max")}
      ${field("假前兆率(通常)", "rules.fakeZencho.normal")}${field("假前兆率(高確)", "rules.fakeZencho.koukaku")}
      ${field("假前兆最短", "rules.fakeZencho.min")}${field("假前兆最長", "rules.fakeZencho.max")}
      ${field("礦脈長度(揮)", "rules.vein.length")}${field("天井(揮)", "rules.tenjou")}
      ${field("工具掉落率(通常)", "rules.toolDrop.normal")}${field("工具掉落率(礦脈)", "rules.toolDrop.vein")}
      ${field("掉落同階機率", "rules.toolDrop.sameTier")}${field("掉落耐久下限", "rules.toolDrop.minDur")}${field("掉落耐久上限", "rules.toolDrop.maxDur")}
      ${field("每日廣告次數", "rules.adDailyLimit")}${field("自動模式間隔(ms)", "play.autoInterval")}${field("自動停止期待度(0~5)", "play.autoStopOmen")}
      <div class="ed-sec">⑨ 期待度顏色權重</div><div class="ed-scroll"><table class="ed-table">
        <tr><th></th>${R.omen.names.map(n => `<th>${n}</th>`).join("")}</tr>
        ${[["normal", "通常"], ["koukaku", "高確"], ["fake", "假前兆"], ["zencho", "真前兆"]].map(([k, n]) => `<tr><th>${n}</th>${R.omen[k].map((v, i) => `<td><input type="number" step="any" data-n="rules.omen.${k}.${i}" value="${v}"></td>`).join("")}</tr>`).join("")}
      </table></div>
      <div class="ed-sec">⑩ 小役售價（第1層基準）</div>
      ${draft.categories.map((c, i) => field(c.name, `categories.${i}.value`)).join("")}
      <div class="ed-sec">⑪ 工具</div><div class="ed-scroll"><table class="ed-table"><tr><th>工具</th><th>耐久</th><th>價格</th></tr>
        ${draft.tools.map((t, i) => `<tr><th>${t.name}</th><td><input type="number" data-n="tools.${i}.durability" value="${t.durability}"></td><td><input type="number" data-n="tools.${i}.price" value="${t.price}"></td></tr>`).join("")}</table></div>
      ${field("升級上限", "upgrade.maxLevel")}${field("升級費用倍率", "upgrade.costMul")}${field("每級耐久加成", "upgrade.durabilityPerLv")}${field("每級售價加成", "upgrade.valuePerLv")}
      <div class="ed-sec">⑫ 礦坑</div><div class="ed-scroll"><table class="ed-table"><tr><th>礦坑</th><th>售價倍率</th><th>解鎖費用</th></tr>
        ${draft.mines.map((m, i) => `<tr><th>${m.name}</th><td><input type="number" step="any" data-n="mines.${i}.mult" value="${m.mult}"></td><td><input type="number" data-n="mines.${i}.unlock" value="${m.unlock}"></td></tr>`).join("")}</table></div>`;
    body.querySelectorAll("[data-n]").forEach(inp => inp.onchange = () => {
      if (inp.value === "" || isNaN(+inp.value)) { inp.value = getPath(draft, inp.dataset.n); return; }
      setPath(draft, inp.dataset.n, +inp.value); commit();
    });
  }

  /* ================= 模擬 ================= */
  function tabSim(body) {
    body.innerHTML = `
      <div class="ed-note">使用「目前的設定數值」跑模擬（和遊戲同一套引擎）。<br>
      初當 = 平均幾揮當選一次礦脈（不含礦脈中）；機械割 = 挖到的價值 ÷ 工具花費（100% 以上玩家賺）。</div>
      <div class="ed-row"><label>礦坑</label><select id="simMine">${draft.mines.map((m, i) => `<option value="${i}">${m.name}</option>`).join("")}</select></div>
      <div class="ed-row"><label>每個設定揮幾次</label><select id="simN"><option>100000</option><option selected>500000</option><option>2000000</option></select></div>
      <button class="ed-btn primary" id="simGo">開始模擬（設定1～6）</button>
      <div id="simOut" style="margin-top:10px"></div>`;
    body.querySelector("#simGo").onclick = () => {
      const mi = +body.querySelector("#simMine").value, n = +body.querySelector("#simN").value;
      const out = body.querySelector("#simOut"); const rows = []; let s = 1;
      out.innerHTML = "模擬中…";
      const step = () => {
        const r = E.simulate(draft, s, n, mi); rows.push(r);
        out.innerHTML = `模擬中… 設定${s}/6`;
        if (++s <= 6) setTimeout(step, 10); else show();
      };
      const pct = v => (v * 100).toFixed(1) + "%";
      const show = () => {
        out.innerHTML = `<div class="ed-scroll"><table class="ed-table">
          <tr><th>設定</th><th>初當</th><th>機械割</th><th>平均連</th><th>天井率</th><th>史詩(通常)</th><th>礦脈收入占比</th></tr>
          ${rows.map((r, i) => `<tr><th>${i + 1}</th><td>1/${r.hitRate.toFixed(0)}</td><td>${pct(r.rtp)}</td><td>${r.avgChain.toFixed(2)}</td>
            <td>${r.hits ? pct(r.tenjou / r.hits) : "-"}</td><td>1/${r.epicRate.toFixed(0)}</td><td>${pct(r.veinIncomeShare)}</td></tr>`).join("")}
          </table></div>
          <div class="ed-sec">期待度顏色：出現時「真的在前兆中」的比例</div>
          <div class="ed-scroll"><table class="ed-table"><tr><th>設定</th>${draft.rules.omen.names.map(n => `<th>${n}</th>`).join("")}</tr>
          ${rows.map((r, i) => `<tr><th>${i + 1}</th>${r.omen.map(o => `<td>${o.shown ? pct(o.real / o.shown) : "-"}</td>`).join("")}</tr>`).join("")}</table></div>
          <button class="ed-btn" id="simCopy">複製結果文字（貼給朋友/AI 驗證）</button>`;
        out.querySelector("#simCopy").onclick = () => {
          const txt = `礦坑:${draft.mines[mi].name} 每設定${n}揮\n設定|初當|機械割|平均連|天井率|史詩\n` +
            rows.map((r, i) => `${i + 1}|1/${r.hitRate.toFixed(0)}|${pct(r.rtp)}|${r.avgChain.toFixed(2)}|${r.hits ? pct(r.tenjou / r.hits) : "-"}|1/${r.epicRate.toFixed(0)}`).join("\n");
          copy(txt);
        };
      };
      setTimeout(step, 30);
    };
  }

  /* ================= 存檔 / 測試 ================= */
  function tabData(body) {
    const S = G.save;
    body.innerHTML = `
      <div class="ed-sec">設定檔（你在編輯模式改的所有東西）</div>
      <div class="ed-flex">
        <button class="ed-btn primary" id="cfgDl">下載設定檔 .json</button>
        <button class="ed-btn" id="cfgCopy">複製設定 JSON</button>
        <label class="ed-btn">匯入設定<input type="file" accept=".json,application/json" id="cfgUp" hidden></label>
        <button class="ed-btn danger" id="cfgReset">還原成預設</button></div>
      <div class="ed-note">把下載的 json 放進「挖礦遊戲」資料夾，告訴 Claude「套用設定檔」，就會寫回正式程式。</div>
      <div class="ed-sec">測試工具</div>
      <div class="ed-row"><label>顯示設定/狀態</label><input type="checkbox" id="dbgShow" ${S.debug.showSetting ? "checked" : ""}></div>
      <div class="ed-row"><label>強制設定</label><select id="dbgForce"><option value="0">不強制（每日隨機）</option>${[1, 2, 3, 4, 5, 6].map(s => `<option value="${s}" ${S.debug.forceSetting === s ? "selected" : ""}>設定${s}</option>`).join("")}</select></div>
      <div class="ed-flex"><button class="ed-btn" id="dbgCoin">+$10,000</button><button class="ed-btn" id="dbgTools">每種工具各+1</button><button class="ed-btn" id="dbgUnlock">解鎖全部礦坑</button></div>
      <div class="ed-sec">玩家存檔</div>
      <div class="ed-flex">
        <button class="ed-btn" id="svDl">下載存檔</button>
        <label class="ed-btn">匯入存檔<input type="file" accept=".json" id="svUp" hidden></label>
        <button class="ed-btn danger" id="svReset">刪除存檔重新開始</button></div>
      <div class="ed-note">存檔目前只存在這台裝置的瀏覽器。之後接帳號系統時，會用同樣的格式上傳雲端。</div>`;
    const $b = id => body.querySelector("#" + id);
    $b("cfgDl").onclick = () => download("mine-config.json", draft);
    $b("cfgCopy").onclick = () => copy(JSON.stringify(stripImages(draft), null, 2));
    $b("cfgUp").onchange = e => readJson(e.target.files[0], j => { draft = j; commit(); G.toast("已匯入設定"); render(); });
    $b("cfgReset").onclick = () => { if (confirm("還原所有設定（版面、顏色、圖片、文字、數值）？")) { G.resetConfig(); draft = clone(G.config); render(); } };
    $b("dbgShow").onchange = e => { S.debug.showSetting = e.target.checked; G.persist(true); G.renderAll(); };
    $b("dbgForce").onchange = e => { S.debug.forceSetting = +e.target.value; G.persist(true); G.renderAll(); };
    $b("dbgCoin").onclick = () => { S.coins += 10000; G.persist(true); G.renderAll(); };
    $b("dbgTools").onclick = () => {
      G.config.tools.forEach(t => { const max = Math.round(t.durability * (1 + (S.upgrades[t.id] || 0) * G.config.upgrade.durabilityPerLv)); S.tools.push({ uid: S.uid++, id: t.id, dur: max, max }); });
      G.persist(true); G.renderAll(); G.toast("已加入工具");
    };
    $b("dbgUnlock").onclick = () => { S.unlocked = G.config.mines.map(m => m.id); G.persist(true); G.renderAll(); };
    $b("svDl").onclick = () => download("mine-save.json", S);
    $b("svUp").onchange = e => readJson(e.target.files[0], j => { G.setSave(j); G.toast("已匯入存檔"); });
    $b("svReset").onclick = () => { if (confirm("確定刪除存檔？")) G.resetSave(); };
  }
  function stripImages(c) { const o = clone(c); o.images = Object.fromEntries(Object.keys(o.images || {}).map(k => [k, "(圖片略)"])); return o; }
  function download(name, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function copy(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => G.toast("已複製"), () => {
      const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); G.toast("已複製"); } catch (e) {} t.remove();
    });
  }
  function readJson(f, cb) {
    if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { cb(JSON.parse(rd.result)); } catch (e) { alert("檔案格式錯誤"); } };
    rd.readAsText(f);
  }

  window.Editor = { isPicking: () => picking };
})();
