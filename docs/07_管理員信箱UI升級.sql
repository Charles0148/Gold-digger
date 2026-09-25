-- =====================================================================
--  深層礦脈 v0.10.8｜玩家 ID + 管理員信箱 UI 升級
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  這份可以重複執行（全部都是 create if not exists / create or replace）
--
--  這份做三件事：
--    A. 修掉既有 send_to / unsend_mail 的權限漏洞（重要，先看下面說明）
--    B. 建立 player_profiles（六碼玩家 ID）與相關 RPC
--    C. 建立管理員信箱 UI 要用的 RPC
-- =====================================================================


-- ---------------------------------------------------------------------
-- A. 安全性修正（重要）
--
--    舊的 send_to / unsend_mail 是 security definer，裡面卻用
--        current_user in ('postgres','supabase_admin')
--    當作「我在 SQL Editor 執行」的判斷。
--    問題：security definer 會把執行身分切換成函式擁有者（postgres），
--    所以 current_user 在函式內部**永遠**是 postgres —— 那個條件對任何
--    呼叫者都成立，等於管理員檢查形同虛設。任何登入玩家都能自己寄獎勵信。
--
--    正確做法是用 session_user：它在 security definer 底下仍然是真正的
--    連線身分（SQL Editor = postgres；玩家透過 PostgREST 進來不是），
--    再加一道 auth.uid() is null 當保險。
--
--    下面這個共用函式就是唯一的權限判斷入口，之後所有管理 RPC 都呼叫它。
-- ---------------------------------------------------------------------
--  注意：這裡用 security definer，因為一般玩家對 public.admins 沒有 select 權限，
--  用 invoker 會變成「權限不足」錯誤而不是乾脆回 false。definer 只回傳一個布林值，
--  不會洩漏 admins 的內容。
create or replace function public.is_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
$$;

grant execute on function public.is_admin_caller() to authenticated;

comment on function public.is_admin_caller() is
  '管理員判斷的唯一入口。用 session_user 而非 current_user，因為 security definer 會把 current_user 換成函式擁有者。';


-- 既有 mail 的「管理員可寫」政策原本直接查 public.admins，
-- 那需要呼叫者本身有 admins 的 select 權限。改成呼叫 is_admin_caller()
-- （security definer）之後，不管權限怎麼設都是同一套判斷。
grant select on public.admins to authenticated;
-- Supabase 預設就會把 public schema 的表授權給 authenticated，這裡寫出來是為了
-- 讓這份 SQL 在任何環境（含本機測試庫）跑起來行為一致。真正的保護是 RLS。
grant select on public.mail to authenticated;
grant select, insert on public.mail_claims to authenticated;

drop policy if exists "admin writes" on public.mail;
create policy "admin writes" on public.mail for all
  using (public.is_admin_caller())
  with check (public.is_admin_caller());


-- ---------------------------------------------------------------------
-- B. 玩家 ID（player_profiles）
-- ---------------------------------------------------------------------
create table if not exists public.player_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  player_id  text not null,
  id_source  text not null default 'auto',   -- auto = 隨機配號、admin = 管理員改號
  admin_note text,                           -- 只有管理員讀得到
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 六碼純數字，100000～999999（不得有前導 0）
alter table public.player_profiles drop constraint if exists player_profiles_player_id_format;
alter table public.player_profiles
  add constraint player_profiles_player_id_format
  check (player_id ~ '^[1-9][0-9]{5}$');

-- 這條 UNIQUE 是「同一個號碼只能有一個人用」的最終防線。
-- 自動配號與管理員改號共用它，所以併發搶號最多只有一個會成功。
create unique index if not exists player_profiles_player_id_key
  on public.player_profiles (player_id);

alter table public.player_profiles enable row level security;

-- 玩家只讀得到自己那一列，而且沒有任何 insert/update 政策
--（配號與改號一律走下面的 security definer RPC，玩家改不了自己的號碼）
grant select on public.player_profiles to authenticated;

drop policy if exists "read own profile" on public.player_profiles;
create policy "read own profile" on public.player_profiles
  for select using (auth.uid() = user_id);

-- updated_at 由資料庫維護，客戶端送什麼都不算數
create or replace function public.touch_player_profiles()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists player_profiles_touch on public.player_profiles;
create trigger player_profiles_touch before update on public.player_profiles
  for each row execute function public.touch_player_profiles();


-- 內部用：隨機產生一個還沒被占用的六碼 ID 並寫進去。
-- 靠 UNIQUE constraint 擋撞號（不是先 select 看「好像沒人用」就當作鎖定），
-- 撞到就重抽，最多 200 次。
create or replace function public.assign_player_id(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  i int := 0;
begin
  if target is null then
    raise exception '缺少 user_id';
  end if;

  loop
    i := i + 1;
    if i > 200 then
      raise exception '配發玩家 ID 失敗：連續 200 次都撞號，請聯絡管理員';
    end if;

    candidate := (100000 + floor(random() * 900000))::int::text;

    begin
      insert into public.player_profiles (user_id, player_id, id_source)
      values (target, candidate, 'auto');
      return candidate;
    exception
      when unique_violation then
        -- 這個 user_id 已經有號碼了 → 直接回傳既有的，不要再配一個
        if exists (select 1 from public.player_profiles p where p.user_id = target) then
          return (select p.player_id from public.player_profiles p where p.user_id = target);
        end if;
        -- 否則是 player_id 撞號 → 換一個再試
    end;
  end loop;
end $$;

revoke all on function public.assign_player_id(uuid) from public, anon, authenticated;


-- 玩家端唯一會呼叫的：拿自己的六碼 ID，沒有就當場建立。
create or replace function public.my_player_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare pid text;
begin
  if auth.uid() is null then
    raise exception '請先登入';
  end if;

  select p.player_id into pid from public.player_profiles p where p.user_id = auth.uid();
  if pid is not null then
    return pid;
  end if;

  return public.assign_player_id(auth.uid());
end $$;

grant execute on function public.my_player_id() to authenticated;


-- 管理員改號：單一、不可分割的 update，撞號時整筆失敗。
create or replace function public.admin_change_player_id(
  cur_id  text,
  new_id  text,
  note    text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  n int;
begin
  if not public.is_admin_caller() then
    raise exception '你不是管理員，不能修改玩家 ID';
  end if;

  if cur_id !~ '^[1-9][0-9]{5}$' then
    raise exception '目前的玩家 ID 必須是 100000～999999 的六碼數字（你填了 %）', cur_id;
  end if;
  if new_id !~ '^[1-9][0-9]{5}$' then
    raise exception '新的玩家 ID 必須是 100000～999999 的六碼數字（你填了 %）', new_id;
  end if;

  if cur_id = new_id then
    raise exception '新舊玩家 ID 相同（%），沒有需要修改的地方', cur_id;
  end if;

  select p.user_id into target from public.player_profiles p where p.player_id = cur_id;
  if target is null then
    raise exception '找不到玩家 ID %，沒有任何變更', cur_id;
  end if;

  -- UNIQUE constraint 是最終防撞線：新號被別人搶走時整筆失敗，舊號原封不動
  begin
    update public.player_profiles
       set player_id = new_id,
           id_source = 'admin',
           admin_note = coalesce(note, admin_note)
     where user_id = target;
  exception
    when unique_violation then
      raise exception '玩家 ID % 已經被其他玩家使用，% 沒有變更', new_id, cur_id;
  end;

  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '改號失敗，沒有任何變更';
  end if;

  -- 舊號在這一刻就釋出了：沒有任何保留紀錄會擋住它被重新配發
  return format('玩家 ID 已修改：%s → %s', cur_id, new_id);
end $$;

revoke all on function public.admin_change_player_id(text, text, text) from public, anon;
grant execute on function public.admin_change_player_id(text, text, text) to authenticated;


-- 既有玩家回填（可重複執行，已有號碼的不會被動到）
do $$
declare u record;
begin
  for u in
    select au.id from auth.users au
    left join public.player_profiles p on p.user_id = au.id
    where p.user_id is null
  loop
    perform public.assign_player_id(u.id);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- C. 管理員信箱 UI 用的 RPC
--
--    共用的輸入檢查：標題 ≤60、內文 ≤1000、天數 1～365、
--    金幣 0～1,000,000、礦石數量 0～999、工具數量 0～99。
--    這些**同時**在資料庫驗一次，不能只靠前端。
-- ---------------------------------------------------------------------
create or replace function public.check_mail_input(
  p_title text, p_body text, p_coins bigint,
  p_ore text, p_ore_qty int,
  p_tool text, p_tool_qty int,
  p_days int
)
returns void
language plpgsql
immutable
as $$
begin
  if coalesce(trim(p_title), '') = '' then raise exception '標題不能空白'; end if;
  if length(p_title) > 60 then raise exception '標題最多 60 字（你填了 % 字）', length(p_title); end if;
  if length(coalesce(p_body, '')) > 1000 then raise exception '內文最多 1000 字（你填了 % 字）', length(p_body); end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception '有效天數要在 1～365 之間（你填了 %）', p_days; end if;
  if p_coins < 0 or p_coins > 1000000 then raise exception '金幣要在 0～1,000,000 之間（你填了 %）', p_coins; end if;
  if p_ore_qty < 0 or p_ore_qty > 999 then raise exception '礦石數量要在 0～999 之間（你填了 %）', p_ore_qty; end if;
  if p_tool_qty < 0 or p_tool_qty > 99 then raise exception '工具數量要在 0～99 之間（你填了 %）', p_tool_qty; end if;
  if p_ore_qty > 0 and coalesce(trim(p_ore), '') = '' then raise exception '有填礦石數量就必須選礦石'; end if;
  if p_tool_qty > 0 and coalesce(trim(p_tool), '') = '' then raise exception '有填工具數量就必須選工具'; end if;
end $$;


-- 寄給指定玩家（用六碼玩家 ID）
create or replace function public.admin_send_to_player(
  p_player_id text, p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30
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

  select p.user_id into uid from public.player_profiles p where p.player_id = p_player_id;
  if uid is null then raise exception '找不到玩家 ID %，沒有寄出任何信', p_player_id; end if;

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, uid,
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int) from public, anon;
grant execute on function public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int) to authenticated;


-- 寄給自己（最安全的測試方式）
create or replace function public.admin_send_self(
  p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30
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

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, auth.uid(),
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.admin_send_self(text, text, bigint, text, int, text, int, int) from public, anon;
grant execute on function public.admin_send_self(text, text, bigint, text, int, text, int, int) to authenticated;


-- 寄給全體
create or replace function public.admin_send_all(
  p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30
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

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, null,
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.admin_send_all(text, text, bigint, text, int, text, int, int) from public, anon;
grant execute on function public.admin_send_all(text, text, bigint, text, int, text, int, int) to authenticated;


-- 最近 50 封寄件紀錄（收件人只顯示六碼玩家 ID，不回傳 Email 或完整 UUID）
create or replace function public.admin_list_mail()
returns table (
  id bigint, title text, body text,
  coins bigint, ore_name text, ore_qty int, tool_id text, tool_qty int,
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
           m.coins, m.ore_name, m.ore_qty, m.tool_id, m.tool_qty,
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


-- 收回一封信（只刪 mail，不碰 mail_claims、不碰玩家存檔）
create or replace function public.admin_unsend_mail(p_mail_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare n int; t text;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;

  select m.title into t from public.mail m where m.id = p_mail_id;
  if t is null then raise exception '找不到第 % 號信', p_mail_id; end if;

  select count(*) into n from public.mail_claims c where c.mail_id = p_mail_id;
  delete from public.mail m where m.id = p_mail_id;

  return format('已收回第 %s 號信「%s」。已經有 %s 個人領過，領過的獎勵不會被收回去。', p_mail_id, t, n);
end $$;

revoke all on function public.admin_unsend_mail(bigint) from public, anon;
grant execute on function public.admin_unsend_mail(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- D. 舊函式的權限修正（把 A 段說的漏洞補起來）
--    只改權限判斷那一行，行為完全不變。
-- ---------------------------------------------------------------------
create or replace function public.send_to(
  email text, title text, body text default '', coins bigint default 0,
  ore text default null, ore_qty int default 0,
  tool text default null, tool_qty int default 0,
  days int default 30
) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid; new_id bigint;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員，不能發信'; end if;
  select id into uid from auth.users u where u.email = send_to.email;
  if uid is null then raise exception '找不到這個 Email 的玩家：%', email; end if;
  if coins < 0 or coins > 1000000 then raise exception '金幣要在 0 ~ 1,000,000 之間'; end if;
  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, to_user, expires_at)
  values (title, body, coins, ore, ore_qty, tool, tool_qty, uid, now() + (days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.unsend_mail(mail_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;
  select count(*) into n from public.mail_claims c where c.mail_id = unsend_mail.mail_id;
  delete from public.mail m where m.id = unsend_mail.mail_id;
  return format('已收回第 %s 號信，已經有 %s 個人領過了（領過的不會被收回去）', mail_id, n);
end $$;

create or replace function public.send_mail(
  title text, body text default '', coins bigint default 0,
  ore text default null, ore_qty int default 0,
  tool text default null, tool_qty int default 0,
  days int default 30
) returns bigint language plpgsql security invoker as $$
declare new_id bigint;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員，不能發信'; end if;
  if coalesce(trim(title), '') = '' then raise exception '標題不能空白'; end if;
  if coins < 0 or coins > 1000000 then raise exception '金幣要在 0 ~ 1,000,000 之間（你填了 %）', coins; end if;
  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, to_user, expires_at)
  values (title, body, coins, ore, ore_qty, tool, tool_qty, null, now() + (days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;


-- =====================================================================
--  跑完之後可以用這幾行確認
-- =====================================================================
-- 看所有玩家的 ID（Table Editor → player_profiles 也看得到同樣內容）
--   select player_id, user_id, id_source, created_at, updated_at
--   from public.player_profiles order by created_at;
--
-- 看發過哪些信
--   select * from public.admin_list_mail();
--
-- 手動改號（平常請用遊戲裡的管理介面）
--   select public.admin_change_player_id('482739', '123456', '朋友指定號碼');
