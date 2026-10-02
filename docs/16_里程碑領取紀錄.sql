-- =====================================================================
--  深層礦脈｜里程碑（紅岩鑽頭・試用）雲端領取紀錄（階段4-2）
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  前提：先執行 docs/15（本檔要讀 public.game_flags 的 boon_epoch）。
--  順序：先在「測試」專案執行並演練，再在「正式」專案執行。
--  這份可以重複執行；整段包在 begin/commit 裡，中途出錯會全部還原。
--  ⚠ 本檔由 Claude 撰寫，截至 2026-10-02 尚未在任何 Supabase 執行過。
--
--  做的事：
--    1. 新表 public.milestone_claims：每個帳號、每個里程碑、每個恩惠世代最多一筆（主鍵擋重複）。
--       玩家只能讀自己的紀錄，不能直接寫；只能透過下面的 RPC。
--    2. RPC claim_milestone(里程碑, 世代, 是否補登)：
--         'ok'      ＝這次搶到紀錄（可以發）
--         'already' ＝這個帳號在這個世代已經領過（別的裝置／分頁）
--         'stale'   ＝送來的世代跟目前世代不同（舊存檔或格式不對），不寫紀錄
--  遊戲端規則（擁有者 2026-10-02 決定）：
--    - 已登入：先呼叫 RPC；'already' 不發；連不上雲端 → 照發，之後自動補登（p_sync=true）。
--    - 未登入：照舊只靠本機紀錄；之後登入會自動補登。
--    - 補登時回 'already'＝別處也領過：已發的不收回，存檔記 dup:true 供日後盤點。
--  不做的事：不動玩家存檔、不重置、不寄信；不擋存檔上傳（那是 docs/15）。
--
--  解除（遊戲會當成連不上雲端 → 照發並稍後重試補登，等同回到只靠本機紀錄）：
--    drop function if exists public.claim_milestone(text, int, boolean);
--  客服手動清掉某人的紀錄（讓他能再領一次）：
--    delete from public.milestone_claims where user_id = '<uuid>' and milestone = 'redrockTrial';
--
--  ⚠ 誠實限制：防「換裝置／清資料後再領一次」的一般情況，不是防作弊。
-- =====================================================================

begin;

create table if not exists public.milestone_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  milestone  text not null check (milestone ~ '^[A-Za-z0-9_]{1,32}$'),
  epoch      int  not null check (epoch between 0 and 1000000),
  claimed_at timestamptz not null default now(),
  via_sync   boolean not null default false,   -- true＝當下連不上雲端、事後補登
  primary key (user_id, milestone, epoch)
);

alter table public.milestone_claims enable row level security;
drop policy if exists "read own milestone claims" on public.milestone_claims;
create policy "read own milestone claims" on public.milestone_claims for select using (auth.uid() = user_id);
-- 沒有 insert／update／delete 規則 → 只能走 claim_milestone
grant select on public.milestone_claims to authenticated;

comment on table public.milestone_claims is
  '深層礦脈里程碑領取紀錄（docs/16）。主鍵 (user_id, milestone, epoch) 保證每個帳號每個世代只領一次。';


create or replace function public.claim_milestone(p_milestone text, p_epoch int, p_sync boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur int;
  n   int;
begin
  if uid is null then raise exception '請先登入'; end if;
  if p_milestone is null or p_milestone !~ '^[A-Za-z0-9_]{1,32}$' then
    raise exception '里程碑代號格式不對（%）', p_milestone;
  end if;
  select boon_epoch into cur from public.game_flags where id;
  if p_epoch is distinct from coalesce(cur, 0) then return 'stale'; end if;

  insert into public.milestone_claims (user_id, milestone, epoch, via_sync)
  values (uid, p_milestone, p_epoch, coalesce(p_sync, false))
  on conflict (user_id, milestone, epoch) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'already' end;
end $$;

revoke all on function public.claim_milestone(text, int, boolean) from public, anon;
grant execute on function public.claim_milestone(text, int, boolean) to authenticated;

commit;


-- =====================================================================
--  執行後自我檢查（只讀）
-- =====================================================================
-- select count(*) from public.milestone_claims;                         -- 剛套用應為 0
-- select milestone, epoch, count(*) from public.milestone_claims group by 1, 2;   -- 盤點：各里程碑各世代領了幾人
