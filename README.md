# 深層礦脈（挖礦遊戲）

以日本 SLOT 隨機性為基礎的手機直式文字挖礦遊戲。純網頁，不需要安裝任何東西。

## 文件

- `docs/01_脈絡總覽.md`：遊戲是什麼、SLOT 對照、決策紀錄（給所有人看）
- `docs/02_AI驗證用技術規格.md`：演算法和數值（給 AI 驗證）
- `docs/03_玩家試玩回饋表.md`：給試玩朋友填寫

## 在自己電腦上看

直接用 Chrome 打開 `index.html` 就能玩。
想用手機試玩，需要先放到 GitHub Pages（見下方）。

## 放到 GitHub Pages（免費網址）

1. 到 github.com，右上角「+」→ **New repository**，名稱例如 `mine-game`，設定為 **Public** → Create。
2. 在新 repository 的頁面點 **uploading an existing file**，把這個資料夾裡的**所有檔案和資料夾**拖進去（`index.html` 必須在最外層）→ **Commit changes**。
3. 到 **Settings** → 左側 **Pages** → Branch 選 `main`、資料夾選 `/ (root)` → **Save**。
4. 等 1～2 分鐘，網址會出現在同一頁，格式是 `https://你的帳號.github.io/mine-game/`。把這個網址傳給朋友即可。
5. 之後更新遊戲時，重新上傳改過的檔案（同名會覆蓋）→ Commit。

## 編輯模式工作流程

1. 點遊戲左上角的 **✎**。
2. 在「版面／顏色／圖片／文字／數值」分頁調整，改動會立即套用並存在這台裝置。
3. 到「模擬」分頁確認機率沒有跑掉。
4. 到「存檔/測試」分頁 → **下載設定檔**，把 `mine-config.json` 放進這個資料夾。
5. 跟 Claude 說「套用設定檔」，就會寫回 `js/config.js`，所有人都會看到新版本。
