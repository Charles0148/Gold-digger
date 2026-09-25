-- =====================================================================
--  深層礦脈 v0.10.10｜玩家 ID 顯示樣式（彩色 = 特別帳號的標記）
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  可以重複執行。必須先跑過 docs/07_管理員信箱UI升級.sql。
--
--  一般玩家的 ID 是白色素面；被管理員指定為「特別」的帳號才是彩虹漸層。
--  切換方式：遊戲裡 信箱 → 管理信箱 → 玩家 ID 管理。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 樣式欄位
-- ---------------------------------------------------------------------
alter table public.player_profiles
  add column if not exists id_style text not null default 'normal';

alter table public.player_profiles drop constraint if exists player_profiles_id_style_ok;
alter table public.player_profiles
  add constraint player_profiles_id_style_ok check (id_style in ('normal', 'rainbow'));

comment on column public.player_profiles.id_style is
  'normal = 一般白色；rainbow = 彩虹漸層（特別帳號）。只有管理員能改。';


-- ---------------------------------------------------------------------
-- 2. 玩家端：拿自己的 ID 與樣式
--    舊的 my_player_id() 保留不動（只回傳號碼），這裡多一個回傳完整資料的。
-- ---------------------------------------------------------------------
create or replace function public.my_player_profile()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare pid text; sty text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;

  select p.player_id, p.id_style into pid, sty
    from public.player_profiles p where p.user_id = auth.uid();

  if pid is null then
    pid := public.assign_player_id(auth.uid());
    sty := 'normal';
  end if;

  return json_build_object('player_id', pid, 'id_style', coalesce(sty, 'normal'));
end $$;

revoke all on function public.my_player_profile() from public, anon;
grant execute on function public.my_player_profile() to authenticated;


-- ---------------------------------------------------------------------
-- 3. 管理員：查一個玩家、切換樣式
-- ---------------------------------------------------------------------
create or replace function public.admin_get_player(p_player_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;
  if p_player_id !~ '^[1-9][0-9]{5}$' then
    raise exception '玩家 ID 必須是 100000～999999 的六碼數字（你填了 %）', p_player_id;
  end if;

  select p.player_id, p.id_style, p.id_source, p.admin_note, p.created_at, p.updated_at
    into r from public.player_profiles p where p.player_id = p_player_id;
  if r.player_id is null then raise exception '找不到玩家 ID %', p_player_id; end if;

  return json_build_object(
    'player_id', r.player_id, 'id_style', r.id_style, 'id_source', r.id_source,
    'admin_note', r.admin_note, 'created_at', r.created_at, 'updated_at', r.updated_at);
end $$;

revoke all on function public.admin_get_player(text) from public, anon;
grant execute on function public.admin_get_player(text) to authenticated;


create or replace function public.admin_set_id_style(p_player_id text, p_style text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員，不能修改玩家 ID 樣式'; end if;
  if p_player_id !~ '^[1-9][0-9]{5}$' then
    raise exception '玩家 ID 必須是 100000～999999 的六碼數字（你填了 %）', p_player_id;
  end if;
  if p_style not in ('normal', 'rainbow') then
    raise exception '樣式只能是 normal 或 rainbow（你填了 %）', p_style;
  end if;

  update public.player_profiles set id_style = p_style where player_id = p_player_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '找不到玩家 ID %，沒有任何變更', p_player_id; end if;

  return format('玩家 %s 的 ID 樣式已設為 %s', p_player_id,
                case p_style when 'rainbow' then '彩虹（特別帳號）' else '一般' end);
end $$;

revoke all on function public.admin_set_id_style(text, text) from public, anon;
grant execute on function public.admin_set_id_style(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. 管理員名單裡的帳號預設給彩虹（只動 id_style 還是預設值 normal 的那些，
--    所以你之後手動關掉它不會被這份 SQL 重新打開）
-- ---------------------------------------------------------------------
update public.player_profiles p
   set id_style = 'rainbow'
  from public.admins a
 where a.user_id = p.user_id
   and p.id_style = 'normal'
   and not exists (select 1 from public.player_profiles q
                    where q.user_id = p.user_id and q.id_style = 'rainbow');


-- =====================================================================
--  跑完可以用這行確認
-- =====================================================================
--   select player_id, id_style, id_source from public.player_profiles order by id_style desc, player_id;
