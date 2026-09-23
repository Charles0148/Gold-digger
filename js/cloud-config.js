/* ===== 雲端設定（Supabase）=====
   在 Supabase 後台：Project Settings → API Keys
   - Project URL           貼到 url
   - publishable key       貼到 anonKey（舊版的 anon key 也吃得下）
   這兩個值本來就是公開的（寫在網頁裡給瀏覽器用），不是密碼。
   真正的保護是資料表的 RLS 規則：每個人只讀得到自己那一列。
   兩個都留空 = 雲端功能關閉，遊戲照常單機玩。 */
window.SUPABASE = {
  url: "https://jwifgznhuhevkllokamx.supabase.co",
  anonKey: "sb_publishable_zJcUES-UBXeONkTS4HUkxQ_66UXr_n0"
};
