-- =====================================================================
--  深層礦脈｜信件領取：伺服器也檢查「過期」與「收件人」
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  擁有者授權：2026-10-03「先處理掉a1跟a2」。
--  這份可以重複執行；整段包在 begin/commit 裡，中途出錯會全部還原。
--
--  原本：mail_claims 的新增規則只檢查 auth.uid() = user_id，
--        過期信只靠遊戲畫面不給按，懂技術的人仍可直接寫入領取紀錄。
--  現在：新增領取紀錄時，資料庫另外確認這封信
--          1. 存在，而且是寄給全體或寄給自己；
--          2. 沒有過期（expires_at 為空或晚於現在）。
--        不符合 → 資料庫拒絕（RLS），遊戲顯示「這封信已經過期了」。
--  不做的事：不改信件、不改已有的領取紀錄、不改玩家存檔、不改任何 RPC。
--
--  還原（回到原本只檢查本人的規則）：
--    drop policy if exists "my claims insert" on public.mail_claims;
--    create policy "my claims insert" on public.mail_claims for insert with check (auth.uid() = user_id);
-- =====================================================================

begin;

drop policy if exists "my claims insert" on public.mail_claims;
create policy "my claims insert" on public.mail_claims for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.mail m
      where m.id = mail_claims.mail_id
        and (m.to_user is null or m.to_user = auth.uid())
        and (m.expires_at is null or m.expires_at > now())
    )
  );

commit;

-- =====================================================================
--  執行後自我檢查（只讀）
-- =====================================================================
-- select policyname, with_check from pg_policies where tablename = 'mail_claims';
