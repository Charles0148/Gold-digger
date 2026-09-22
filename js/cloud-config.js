/* ===== 雲端設定（Supabase）=====
   在 Supabase 後台：Settings → API
   - Project URL      貼到 url
   - anon public key  貼到 anonKey
   這兩個值本來就是公開的（寫在網頁裡給瀏覽器用），不是密碼。
   真正的保護是資料表的 RLS 規則：每個人只讀得到自己那一列。
   兩個都留空 = 雲端功能關閉，遊戲照常單機玩。 */
window.SUPABASE = {
  url: "",
  anonKey: ""
};
