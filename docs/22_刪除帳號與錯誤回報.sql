-- =====================================================================
--  深層礦脈｜刪除帳號＋錯誤回報（2026-10-08）
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  前提：已套用 docs/07、08、14～18、20（正式專案都已套用）。
--  這份可以重複執行；整段包在 begin/commit 裡，中途出錯會全部還原。
--  ⚠ 本檔由 Claude 撰寫。套用前先跑 rollback 測試（結尾必定還原）；要不要套用由擁有者決定。
--
--  做的事：
--    1. RPC delete_my_account()：玩家刪除「自己的」帳號。
--       刪 auth.users 那一列 → 存檔、玩家 ID、信箱領取、寄給他的信、里程碑／一次性領取、外觀、錯誤紀錄
--       全部靠既有的 on delete cascade 一起刪；另外手動刪恩惠重置前備份 boon_reset_backup（那張沒有 cascade）。
--       管理員帳號不能從遊戲內刪（避免把唯一的管理員刪掉），要刪先到 admins 表移除。
--    2. 錯誤紀錄 public.client_errors＋RPC report_client_error()：遊戲出錯時自動回報。
--       未登入也能回報（user_id 留空）；登入時記帳號（擁有者 2026-10-08 選「記玩家 ID」），刪帳號時一起刪。
--       防灌爆：每欄長度上限、同一帳號（或未登入的同一訊息）10 分鐘內同樣錯誤只記一次、
--       同一帳號每小時最多 30 筆、全體每分鐘最多 60 筆；超過 30 天的紀錄自動刪除。
--       玩家不能讀這張表（沒有任何讀取規則），只有擁有者在後台看。
--  不做的事：不動既有資料表與函式；不寄信；不改存檔規則。
--
--  看錯誤（擁有者在 SQL Editor 執行，會顯示玩家 ID）：
--    select e.at, p.player_id, e.ver, e.msg, e.src, e.ua
--    from public.client_errors e left join public.player_profiles p on p.user_id = e.user_id
--    order by e.at desc limit 100;
--
--  解除：見檔尾「還原」段落（遊戲會自動退回：刪除帳號按鈕顯示失敗、錯誤回報靜靜失敗不影響遊戲）。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 刪除自己的帳號
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception '請先登入'; end if;
  if exists (select 1 from public.admins a where a.user_id = uid) then
    raise exception '管理員帳號不能從遊戲內刪除';
  end if;
  delete from public.boon_reset_backup where user_id = uid;
  delete from auth.users where id = uid;     -- 其餘資料表都是 on delete cascade
  return 'deleted';
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- 2. 錯誤回報
-- ---------------------------------------------------------------------
create table if not exists public.client_errors (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  ver     text,
  msg     text not null,
  src     text,
  stack   text,
  ua      text
);
create index if not exists client_errors_at_idx on public.client_errors (at);
create index if not exists client_errors_user_idx on public.client_errors (user_id, at);
alter table public.client_errors enable row level security;   -- 沒有任何 policy → 玩家讀不到也寫不進，只能走 RPC
revoke all on public.client_errors from anon, authenticated;

-- 回傳 'ok'＝記下了／'dup'＝10 分鐘內記過同樣的／'limit'＝超過上限沒記
create or replace function public.report_client_error(
  p_ver text, p_msg text, p_src text default null, p_stack text default null, p_ua text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); m text := left(coalesce(p_msg, ''), 300);
begin
  if m = '' then return 'limit'; end if;
  if (select count(*) from public.client_errors where at > now() - interval '1 minute') >= 60 then
    return 'limit';
  end if;
  if uid is not null and (select count(*) from public.client_errors
        where user_id = uid and at > now() - interval '1 hour') >= 30 then
    return 'limit';
  end if;
  if exists (select 1 from public.client_errors
        where user_id is not distinct from uid and msg = m and at > now() - interval '10 minutes') then
    return 'dup';
  end if;
  insert into public.client_errors (user_id, ver, msg, src, stack, ua)
  values (uid, left(p_ver, 20), m, left(p_src, 200), left(p_stack, 2000), left(p_ua, 200));
  delete from public.client_errors where at < now() - interval '30 days';
  return 'ok';
end $$;
revoke all on function public.report_client_error(text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text) to anon, authenticated;

commit;

-- =====================================================================
--  還原（需要時才執行；會刪掉所有錯誤紀錄）
-- =====================================================================
-- begin;
-- drop function if exists public.report_client_error(text, text, text, text, text);
-- drop table if exists public.client_errors;
-- drop function if exists public.delete_my_account();
-- commit;
