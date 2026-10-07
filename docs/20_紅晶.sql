-- =====================================================================
--  深層礦脈｜紅晶（2026-10-05 設計 v4）伺服器部分
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  前提：已套用 docs/07、08、14、18（正式專案都已套用）。
--  這份可以重複執行；整段包在 begin/commit 裡，中途出錯會全部還原。
--  ⚠ 本檔由 Claude 撰寫。套用前先跑 Claude outputs/Ruby-2026-10-05/QA-rollback.sql（結尾必定還原）；
--    要不要套用由擁有者決定。
--
--  做的事：
--    1. 信件新增「紅晶」附件：public.mail.ruby（0～9999，預設 0）；三支管理員寄信 RPC 多 p_ruby 參數（預設 0，
--       舊前端不傳也照常寄）；寄件紀錄 admin_list_mail 多回傳 ruby。
--    2. 「一輩子只能領一次」的紀錄 public.lifetime_claims＋RPC claim_lifetime（開帳號 20 顆＝'rubyWelcome'）。
--       跟恩惠世代（docs/16 milestone_claims）分開：恩惠重置不會讓人重領。
--    3. 外觀：外觀清單 cosmetic_catalog、玩家擁有 player_cosmetics、player_profiles 的裝備欄位
--       （equipped_name_color／equipped_frame），以及 RPC：my_cosmetics、claim_client_cosmetic、equip_my_cosmetic。
--       清單內容：14 件（紅晶版 8、成就版 6；擁有者 2026-10-07 定案），見第 3 節。
--    4. 對外公開的玩家卡片 RPC public_player_card：只回玩家 ID、ID 樣式、名字顏色、外框（之後排行榜沿用）。
--    5. 權限：玩家只能讀自己的擁有紀錄、只能改自己的裝備，而且只能裝備清單裡有、自己擁有、欄位相符的項目；
--       資料庫只存白名單 id，不收顏色碼或程式碼。彩虹 ID（id_style）照舊只有管理員能改。
--  不做的事：不寄信、不動玩家存檔、不動 mail_claims、不動恩惠世代與 milestone_claims。
--
--  ⚠ 誠實限制（設計 v4 第六節）：紅晶存在玩家存檔裡，伺服器沒辦法確認玩家真的花了紅晶；
--    懂技術的人可以直接呼叫 claim_client_cosmetic 登記「已購買」。能保證的是：不能塞任意樣式、不能改別人的資料。
--    將來紅晶若改成可以付費，必須改成伺服器扣款。
--  ⚠ 寄紅晶前：線上遊戲要先更新到認得 ruby 欄位的版本，舊版玩家按「領取」會記成已領卻拿不到紅晶。
--
--  解除（遊戲會自動退回：不能寄紅晶、開帳號紅晶只靠本機紀錄、外觀只顯示預設）：
--    見檔尾「還原」段落。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 信件：紅晶附件
-- ---------------------------------------------------------------------
alter table public.mail add column if not exists ruby int not null default 0;
alter table public.mail drop constraint if exists mail_ruby_range;
alter table public.mail add constraint mail_ruby_range check (ruby between 0 and 9999);

create or replace function public.check_ruby(p_ruby int)
returns void
language plpgsql
immutable
as $$
begin
  if p_ruby is null or p_ruby < 0 or p_ruby > 9999 then
    raise exception '紅晶要在 0～9999 之間（你填了 %）', p_ruby;
  end if;
end $$;

-- 先刪舊簽名（docs/14 的 10／9 個參數版本），避免同名不同參數造成「選不到函式」
drop function if exists public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int, int);
drop function if exists public.admin_send_self(text, text, bigint, text, int, text, int, int, int);
drop function if exists public.admin_send_all(text, text, bigint, text, int, text, int, int, int);

create or replace function public.admin_send_to_player(
  p_player_id text, p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30,
  p_board_resets int default 0,
  p_ruby int default 0
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
  perform public.check_ruby(p_ruby);

  select p.user_id into uid from public.player_profiles p where p.player_id = p_player_id;
  if uid is null then raise exception '找不到玩家 ID %，沒有寄出任何信', p_player_id; end if;

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, board_resets, ruby, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_board_resets, p_ruby, uid,
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int, int, int) from public, anon;
grant execute on function public.admin_send_to_player(text, text, text, bigint, text, int, text, int, int, int, int) to authenticated;

create or replace function public.admin_send_self(
  p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30,
  p_board_resets int default 0,
  p_ruby int default 0
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
  perform public.check_ruby(p_ruby);

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, board_resets, ruby, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_board_resets, p_ruby, auth.uid(),
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.admin_send_self(text, text, bigint, text, int, text, int, int, int, int) from public, anon;
grant execute on function public.admin_send_self(text, text, bigint, text, int, text, int, int, int, int) to authenticated;

create or replace function public.admin_send_all(
  p_title text, p_body text default '',
  p_coins bigint default 0,
  p_ore text default null, p_ore_qty int default 0,
  p_tool text default null, p_tool_qty int default 0,
  p_days int default 30,
  p_board_resets int default 0,
  p_ruby int default 0
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
  perform public.check_ruby(p_ruby);

  insert into public.mail (title, body, coins, ore_name, ore_qty, tool_id, tool_qty, board_resets, ruby, to_user, expires_at)
  values (p_title, coalesce(p_body, ''), p_coins, p_ore, p_ore_qty, p_tool, p_tool_qty, p_board_resets, p_ruby, null,
          now() + (p_days || ' days')::interval)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.admin_send_all(text, text, bigint, text, int, text, int, int, int, int) from public, anon;
grant execute on function public.admin_send_all(text, text, bigint, text, int, text, int, int, int, int) to authenticated;

drop function if exists public.admin_list_mail();
create function public.admin_list_mail()
returns table (
  id bigint, title text, body text,
  coins bigint, ore_name text, ore_qty int, tool_id text, tool_qty int, board_resets int, ruby int,
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
           m.coins, m.ore_name, m.ore_qty, m.tool_id, m.tool_qty, m.board_resets, m.ruby,
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


-- ---------------------------------------------------------------------
-- 2. 一輩子只能領一次（開帳號 20 顆紅晶）
-- ---------------------------------------------------------------------
create table if not exists public.lifetime_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  claim      text not null check (claim in ('rubyWelcome')),   -- 白名單：之後要加新的一次性獎勵再擴充
  claimed_at timestamptz not null default now(),
  via_sync   boolean not null default false,                   -- true＝當下連不上雲端、事後補登
  primary key (user_id, claim)
);
alter table public.lifetime_claims enable row level security;
drop policy if exists "read own lifetime claims" on public.lifetime_claims;
create policy "read own lifetime claims" on public.lifetime_claims for select using (auth.uid() = user_id);
grant select on public.lifetime_claims to authenticated;   -- 沒有寫入規則 → 只能走 claim_lifetime

-- 回傳 'ok'＝這次搶到（可以發）／'already'＝這個帳號已經領過
create or replace function public.claim_lifetime(p_claim text, p_sync boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception '請先登入'; end if;
  if p_claim is distinct from 'rubyWelcome' then raise exception '不認得的一次性獎勵（%）', p_claim; end if;
  insert into public.lifetime_claims (user_id, claim, via_sync) values (uid, p_claim, coalesce(p_sync, false))
  on conflict (user_id, claim) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'already' end;
end $$;
revoke all on function public.claim_lifetime(text, boolean) from public, anon;
grant execute on function public.claim_lifetime(text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 3. 外觀（名字顏色、敘述框外框）
-- ---------------------------------------------------------------------
create table if not exists public.cosmetic_catalog (
  id           text primary key check (id ~ '^[a-z][a-z0-9_]{2,40}$'),   -- 例：name_ruby_crimson、frame_ach_m5
  slot         text not null check (slot in ('name_color', 'frame')),
  source_type  text not null check (source_type in ('ruby', 'achievement', 'event')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  active       boolean not null default true,
  sort         int not null default 0
);
alter table public.cosmetic_catalog enable row level security;
drop policy if exists "catalog readable" on public.cosmetic_catalog;
create policy "catalog readable" on public.cosmetic_catalog for select using (true);
grant select on public.cosmetic_catalog to anon, authenticated;   -- 清單公開；只有管理員（SQL Editor）能改
-- 清單內容（擁有者 2026-10-07 定案；id 與 js/config.js 的 ruby.cosmetics 一致）。重複執行只會更新名稱／排序，不會重複新增
insert into public.cosmetic_catalog (id, slot, source_type, display_name, sort) values
  ('name_ruby',    'name_color', 'ruby',        '紅晶',   10),
  ('name_gold',    'name_color', 'ruby',        '熔金',   20),
  ('name_star',    'name_color', 'ruby',        '星辰紫', 30),
  ('name_ice',     'name_color', 'ruby',        '冰晶',   40),
  ('name_jade',    'name_color', 'ruby',        '翠脈',   50),
  ('name_dusk',    'name_color', 'ruby',        '夕焰',   60),
  ('name_moss',    'name_color', 'achievement', '苔綠',   70),
  ('name_slate',   'name_color', 'achievement', '石青',   80),
  ('name_amber',   'name_color', 'achievement', '琥珀',   90),
  ('frame_ruby',   'frame',      'ruby',        '紅晶框', 110),
  ('frame_gold',   'frame',      'ruby',        '金紋框', 120),
  ('frame_iron',   'frame',      'achievement', '鐵框',   130),
  ('frame_wood',   'frame',      'achievement', '木框',   140),
  ('frame_bronze', 'frame',      'achievement', '銅框',   150)
on conflict (id) do update set slot = excluded.slot, source_type = excluded.source_type, display_name = excluded.display_name, sort = excluded.sort;

create table if not exists public.player_cosmetics (
  user_id     uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null references public.cosmetic_catalog(id),
  source      text not null check (source in ('ruby', 'achievement', 'event', 'admin')),
  txn         text check (txn is null or txn ~ '^[A-Za-z0-9_-]{1,64}$'),   -- 遊戲端的購買編號（同一筆不重複登記）
  acquired_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);
alter table public.player_cosmetics enable row level security;
drop policy if exists "read own cosmetics" on public.player_cosmetics;
create policy "read own cosmetics" on public.player_cosmetics for select using (auth.uid() = user_id);
grant select on public.player_cosmetics to authenticated;   -- 沒有寫入規則 → 只能走 RPC

alter table public.player_profiles add column if not exists equipped_name_color text references public.cosmetic_catalog(id) on delete set null;
alter table public.player_profiles add column if not exists equipped_frame      text references public.cosmetic_catalog(id) on delete set null;
-- player_profiles 原本就沒有玩家 update 規則（docs/07）→ 玩家不能直接改裝備欄位，只能走 equip_my_cosmetic

-- 自己的外觀：{ owned: [id...], name_color, frame }
create or replace function public.my_cosmetics()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then raise exception '請先登入'; end if;
  select p.equipped_name_color, p.equipped_frame into r from public.player_profiles p where p.user_id = uid;
  return json_build_object(
    'owned', coalesce((select json_agg(c.cosmetic_id order by c.acquired_at) from public.player_cosmetics c where c.user_id = uid), '[]'::json),
    'name_color', r.equipped_name_color,
    'frame', r.equipped_frame);
end $$;
revoke all on function public.my_cosmetics() from public, anon;
grant execute on function public.my_cosmetics() to authenticated;

-- 登記遊戲端取得的外觀（紅晶購買／成就獎勵）。只接受清單裡「啟用中」而且來源是 ruby／achievement 的項目；
-- 活動（event）外觀只能由管理員發。回傳 'ok'／'already'
create or replace function public.claim_client_cosmetic(p_id text, p_txn text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); src text; n int;
begin
  if uid is null then raise exception '請先登入'; end if;
  select c.source_type into src from public.cosmetic_catalog c where c.id = p_id and c.active;
  if src is null then raise exception '沒有這個外觀（%）', p_id; end if;
  if src not in ('ruby', 'achievement') then raise exception '這個外觀不能自己登記'; end if;
  if p_txn is not null and p_txn !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception '購買編號格式不對'; end if;
  insert into public.player_cosmetics (user_id, cosmetic_id, source, txn) values (uid, p_id, src, p_txn)
  on conflict (user_id, cosmetic_id) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'already' end;
end $$;
revoke all on function public.claim_client_cosmetic(text, text) from public, anon;
grant execute on function public.claim_client_cosmetic(text, text) to authenticated;

-- 裝備（p_id 為 null＝卸下）。只能改自己的；必須擁有、清單啟用中、欄位相符
create or replace function public.equip_my_cosmetic(p_slot text, p_id text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); sl text;
begin
  if uid is null then raise exception '請先登入'; end if;
  if p_slot not in ('name_color', 'frame') then raise exception '欄位只能是 name_color 或 frame'; end if;
  if p_id is not null then
    select c.slot into sl from public.cosmetic_catalog c where c.id = p_id and c.active;
    if sl is null then raise exception '沒有這個外觀（%）', p_id; end if;
    if sl <> p_slot then raise exception '這個外觀不能放在這個欄位'; end if;
    if not exists (select 1 from public.player_cosmetics o where o.user_id = uid and o.cosmetic_id = p_id) then
      raise exception '你還沒有這個外觀';
    end if;
  end if;
  if p_slot = 'name_color' then update public.player_profiles set equipped_name_color = p_id where user_id = uid;
  else update public.player_profiles set equipped_frame = p_id where user_id = uid; end if;
  if not found then raise exception '還沒有玩家 ID，請稍後再試'; end if;
  return 'ok';
end $$;
revoke all on function public.equip_my_cosmetic(text, text) from public, anon;
grant execute on function public.equip_my_cosmetic(text, text) to authenticated;

-- 管理員發外觀（活動獎勵、客服補發）
create or replace function public.admin_grant_cosmetic(p_player_id text, p_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid; n int;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;
  select p.user_id into uid from public.player_profiles p where p.player_id = p_player_id;
  if uid is null then raise exception '找不到玩家 ID %', p_player_id; end if;
  if not exists (select 1 from public.cosmetic_catalog c where c.id = p_id) then raise exception '沒有這個外觀（%）', p_id; end if;
  insert into public.player_cosmetics (user_id, cosmetic_id, source) values (uid, p_id, 'admin')
  on conflict (user_id, cosmetic_id) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'already' end;
end $$;
revoke all on function public.admin_grant_cosmetic(text, text) from public, anon;
grant execute on function public.admin_grant_cosmetic(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. 對外公開的玩家卡片（排行榜沿用）：只回這四個欄位，不回 user_id、email 或其他私人資料
-- ---------------------------------------------------------------------
create or replace function public.public_player_card(p_player_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record;
begin
  if p_player_id !~ '^[1-9][0-9]{5}$' then return null; end if;
  select p.player_id, p.id_style,
         case when nc.active then p.equipped_name_color end as name_color,
         case when fr.active then p.equipped_frame end as frame
    into r
    from public.player_profiles p
    left join public.cosmetic_catalog nc on nc.id = p.equipped_name_color
    left join public.cosmetic_catalog fr on fr.id = p.equipped_frame
   where p.player_id = p_player_id;
  if r.player_id is null then return null; end if;
  return json_build_object('player_id', r.player_id, 'id_style', coalesce(r.id_style, 'normal'),
                           'name_color', r.name_color, 'frame', r.frame);
end $$;
revoke all on function public.public_player_card(text) from public;
grant execute on function public.public_player_card(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
--  執行後自我檢查（只讀）
-- =====================================================================
-- select column_name, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'mail' and column_name = 'ruby';             -- 應有一列，預設 0
-- select count(*) from public.lifetime_claims;                                                   -- 剛套用應為 0
-- select count(*) from public.cosmetic_catalog;                                                  -- 剛套用應為 14
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'player_profiles' and column_name like 'equipped_%';   -- 應有兩列

-- =====================================================================
--  還原（需要時才執行；會刪掉紅晶信件欄位以外的新資料）
-- =====================================================================
-- begin;
-- drop function if exists public.public_player_card(text);
-- drop function if exists public.admin_grant_cosmetic(text, text);
-- drop function if exists public.equip_my_cosmetic(text, text);
-- drop function if exists public.claim_client_cosmetic(text, text);
-- drop function if exists public.my_cosmetics();
-- alter table public.player_profiles drop column if exists equipped_name_color, drop column if exists equipped_frame;
-- drop table if exists public.player_cosmetics;
-- drop table if exists public.cosmetic_catalog;
-- drop function if exists public.claim_lifetime(text, boolean);
-- drop table if exists public.lifetime_claims;
-- -- 信件：重新執行 docs/14 即可回到沒有 p_ruby 的寄信函式（mail.ruby 欄位留著不影響）
-- commit;
