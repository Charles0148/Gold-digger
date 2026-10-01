-- =====================================================================
--  深層礦脈｜信件新增「免費委託板重置次數」獎勵
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  順序：先在「測試」專案執行並驗收，再在「正式」專案執行。
--  這份可以重複執行；整段包在 begin/commit 裡，中途出錯會全部還原。
--
--  做的事：
--    1. public.mail 新增欄位 board_resets（0～99，預設 0）。
--    2. 三支管理員寄信 RPC 多一個參數 p_board_resets（預設 0）。
--       舊版前端不傳這個參數也照常能寄信（向下相容）。
--    3. admin_list_mail 多回傳 board_resets，寄件紀錄才看得到。
--  不做的事：
--    - 不寄任何信、不動 mail_claims、不動玩家存檔。
--    - check_mail_input、舊的 send_to / send_mail / unsend_mail 完全不改。
--
--  ⚠ 重要：目前線上版（0.10.13 以前）不認得這種獎勵，玩家在舊版按「已讀」
--    會記成已領取卻拿不到次數。新版遊戲上傳之前，不要寄含免費重置的信。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 信件欄位
-- ---------------------------------------------------------------------
alter table public.mail add column if not exists board_resets int not null default 0;
alter table public.mail drop constraint if exists mail_board_resets_range;
alter table public.mail add constraint mail_board_resets_range check (board_resets between 0 and 99);


-- ---------------------------------------------------------------------
-- 2. 寄信 RPC（先刪舊簽名，避免同名不同參數造成「選不到函式」）
-- ---------------------------------------------------------------------
drop function if exists public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int);
drop function if exists public.admin_send_self(text, text, bigint, text, int, text, int, int);
drop function if exists public.admin_send_all(text, text, bigint, text, int, text, int, int);

create or replace function public.check_board_resets(p_board_resets int)
returns void
language plpgsql
immutable
as $$
begin
  if p_board_resets is null or p_board_resets < 0 or p_board_resets > 99 then
    raise exception '免費委託板重置次數要在 0～99 之間（你填了 %）', p_board_resets;
  end if;
end $$;


-- 寄給指定玩家（用六碼玩家 ID）
create or replace function public.admin_send_to_player(
  p_player_id text, p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30,
  p_board_resets int default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid; new_id bigint;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員，不能發信'; end if;
  if p_player_id !~ '^[1-9][0-9]{5}$' then
    raise exception '玩家 ID 必須是 100000～999999 的六碼數字（你填了 %）', p_player_id;
  end if;
  perform public.check_mail_input(p_title, p_body, p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_days);
  perform public.check_board_resets(p_board_resets);

  select p.user_id into uid from public.player_profiles p where p.player_id = p_player_id;
  if uid is null then raise exception '找不到玩家 ID %，沒有寄出任何信', p_player_id; end if;

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, board_resets, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_board_resets, uid,
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int, int) from public, anon;
grant execute on function public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int, int) to authenticated;


-- 寄給自己（最安全的測試方式）
create or replace function public.admin_send_self(
  p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30,
  p_board_resets int default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_id bigint;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員，不能發信'; end if;
  if auth.uid() is null then raise exception '請先登入再寄給自己'; end if;
  perform public.check_mail_input(p_title, p_body, p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_days);
  perform public.check_board_resets(p_board_resets);

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, board_resets, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_board_resets, auth.uid(),
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.admin_send_self(text, text, bigint, text, int, text, int, int, int) from public, anon;
grant execute on function public.admin_send_self(text, text, bigint, text, int, text, int, int, int) to authenticated;


-- 寄給全體
create or replace function public.admin_send_all(
  p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30,
  p_board_resets int default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_id bigint;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員，不能發信'; end if;
  perform public.check_mail_input(p_title, p_body, p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_days);
  perform public.check_board_resets(p_board_resets);

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, board_resets, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_board_resets, null,
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.admin_send_all(text, text, bigint, text, int, text, int, int, int) from public, anon;
grant execute on function public.admin_send_all(text, text, bigint, text, int, text, int, int, int) to authenticated;


-- ---------------------------------------------------------------------
-- 3. 寄件紀錄（回傳欄位變了，必須先 drop 才能重建）
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_mail();
create function public.admin_list_mail()
returns table (
  id bigint, title text, body text,
  coins bigint, ore_name text, ore_qty int, tool_id text, tool_qty int, board_resets int,
  target text, player_id text,
  claimed bigint, sent_at timestamptz, expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;
  return query
    select m.id, m.title, m.body,
           m.coins, m.ore_name, m.ore_qty, m.tool_id, m.tool_qty, m.board_resets,
           case when m.to_user is null then '全體' else '指定玩家' end,
           p.player_id,
           (select count(*) from public.mail_claims c where c.mail_id = m.id),
           m.created_at, m.expires_at
      from public.mail m
      left join public.player_profiles p on p.user_id = m.to_user
     order by m.id desc
     limit 50;
end $$;

revoke all on function public.admin_list_mail() from public, anon;
grant execute on function public.admin_list_mail() to authenticated;

commit;

-- 讓 API 立刻認得新參數（不執行也會在幾分鐘內自動更新）
notify pgrst, 'reload schema';


-- =====================================================================
--  執行後自我檢查（只讀，不會改資料）：應該看到 board_resets 一列，預設 0
-- =====================================================================
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'mail' and column_name = 'board_resets';
