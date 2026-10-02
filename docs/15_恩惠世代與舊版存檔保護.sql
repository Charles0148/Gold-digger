-- =====================================================================
--  深層礦脈｜恩惠世代與舊版存檔保護（階段4）
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  順序：先在「測試」專案執行並演練，再在「正式」專案執行。
--  這份可以重複執行；整段包在 begin/commit 裡，中途出錯會全部還原。
--  ⚠ 本檔由 Claude 撰寫，截至 2026-10-02 尚未在任何 Supabase 執行過。
--
--  做的事：
--    1. 新表 public.game_flags（只有一列）：
--         boon_epoch        恩惠重置世代，起始 0
--         min_save_version  允許寫入雲端存檔的最低遊戲版本，起始 '0'（＝不檢查）
--       任何人可讀（不含個資）；只有管理員能透過 RPC 改。
--    2. public.saves 加 before insert or update 觸發器 saves_guard，兩道關卡：
--         a. 世代：data.boss.epoch（沒有就當 0）＜ boon_epoch
--              UPDATE → 拒絕（錯誤訊息 SAVE_EPOCH_STALE）
--              INSERT → 雲端本來沒有存檔、沒有東西會被蓋掉，
--                       改把 data.boss.epoch 補成目前世代後放行（擁有者 Q6＝B：未登入本機玩家不另外處理）
--         b. 版本：ver 欄位（遊戲每次上傳都寫入「自己這支程式」的版本）＜ min_save_version
--              → 拒絕（錯誤訊息 SAVE_VERSION_OLD）。版本逐段比數字：0.10.14 ＞ 0.10.9。
--       只檢查玩家自己的請求（角色 authenticated／anon）；
--       管理員在 SQL Editor 或 security definer 函式裡做的正式重置不受影響。
--    3. 管理員 RPC：admin_save_guard()（查看）、admin_set_save_guard(世代, 最低版本)（調整）。
--  不做的事：
--    - 不動任何玩家存檔、不重置恩惠、不改 rev、不寄信。
--    - 起始值都是 0 → 套用當下完全沒有效果。正式重置當下才把兩個值調高。
--
--  解除（回到現狀，只要這一行；game_flags 留著無害）：
--    drop trigger if exists saves_guard on public.saves;
--
--  ⚠ 誠實限制：這是防「舊裝置／舊快取把舊恩惠誤蓋回雲端」，不是防作弊；
--    懂技術的人仍可偽造版本號或世代。紅岩鑽頭跨裝置防重領是下一個獨立步驟。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 旗標表（固定一列）
-- ---------------------------------------------------------------------
create table if not exists public.game_flags (
  id               boolean primary key default true check (id),
  boon_epoch       int  not null default 0 check (boon_epoch between 0 and 1000000),
  min_save_version text not null default '0' check (min_save_version ~ '^[0-9]{1,9}(\.[0-9]{1,9}){0,5}$'),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
insert into public.game_flags (id) values (true) on conflict (id) do nothing;

alter table public.game_flags enable row level security;
drop policy if exists "anyone reads flags" on public.game_flags;
create policy "anyone reads flags" on public.game_flags for select using (true);
-- 沒有 insert／update／delete 規則 → 玩家改不到；只能走下面的管理員 RPC
grant select on public.game_flags to anon, authenticated;

comment on table public.game_flags is
  '深層礦脈全域旗標（docs/15）。boon_epoch＝恩惠重置世代；min_save_version＝允許寫入雲端存檔的最低遊戲版本，''0''＝不檢查。';


-- ---------------------------------------------------------------------
-- 2. 版本號 → 數字陣列（逐段比較用）
--    '0.10.14' → {0,10,14}；'0.10.14-test' → {0,10,14}；'' 或 null → {}
--    Postgres 的 int[] 由左到右逐格比較：{0,10,14} > {0,10,9}，{0,10} < {0,10,0}
-- ---------------------------------------------------------------------
create or replace function public.ver_num(p text)
returns int[]
language sql
immutable
as $$
  select coalesce(array_agg(coalesce(substring(seg from '^[0-9]{1,9}')::int, 0) order by ord), '{}'::int[])
  from unnest(string_to_array(coalesce(btrim(p), ''), '.')) with ordinality as t(seg, ord)
  where coalesce(btrim(p), '') <> ''
$$;


-- ---------------------------------------------------------------------
-- 3. 觸發器：世代＋最低版本
--    刻意「不是」security definer：current_user 才會是發出請求的角色。
-- ---------------------------------------------------------------------
create or replace function public.saves_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f        public.game_flags%rowtype;
  min_v    int[];
  my_epoch int;
begin
  -- 只管玩家自己透過 API 送來的寫入；管理員正式重置（postgres／security definer）不擋
  if current_user not in ('authenticated', 'anon') then return new; end if;

  select * into f from public.game_flags where id;
  if not found then return new; end if;

  -- b. 最低版本（'0' 或全 0 ＝不檢查）
  min_v := public.ver_num(f.min_save_version);
  if coalesce((select max(x) from unnest(min_v) x), 0) > 0
     and public.ver_num(new.ver) < min_v then
    raise exception using
      errcode = 'P0001',
      message = 'SAVE_VERSION_OLD',
      detail  = format('遊戲版本 %s 低於最低要求 %s', coalesce(nullif(new.ver, ''), '（空白）'), f.min_save_version),
      hint    = '請重新整理頁面，更新到最新版遊戲後再上傳。';
  end if;

  -- a. 世代（data.boss.epoch 缺值或不是數字都當 0）
  if f.boon_epoch > 0 then
    my_epoch := case when jsonb_typeof(new.data #> '{boss,epoch}') = 'number'
                     then greatest(-1, least(2000000000, floor((new.data #>> '{boss,epoch}')::numeric)))::int else 0 end;
    if my_epoch < f.boon_epoch then
      if tg_op = 'INSERT' and jsonb_typeof(new.data -> 'boss') = 'object' then
        -- 雲端原本沒有這位玩家的存檔：沒有東西會被蓋掉，補上目前世代後放行
        new.data := jsonb_set(new.data, '{boss,epoch}', to_jsonb(f.boon_epoch), true);
      elsif tg_op = 'INSERT' then
        null;   -- 存檔裡根本沒有 boss（理論上不會發生）：不硬塞，放行
      else
        raise exception using
          errcode = 'P0001',
          message = 'SAVE_EPOCH_STALE',
          detail  = format('存檔世代 %s 早於目前世代 %s', my_epoch, f.boon_epoch),
          hint    = '這台裝置的存檔是佐佐木恩惠重置前的舊資料，請改用雲端的存檔。';
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists saves_guard on public.saves;
create trigger saves_guard before insert or update on public.saves
  for each row execute function public.saves_guard();


-- ---------------------------------------------------------------------
-- 4. 管理員 RPC
-- ---------------------------------------------------------------------
create or replace function public.admin_save_guard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare f public.game_flags%rowtype;
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;
  select * into f from public.game_flags where id;
  return jsonb_build_object(
    'boon_epoch', coalesce(f.boon_epoch, 0),
    'min_save_version', coalesce(f.min_save_version, '0'),
    'trigger_on', exists (select 1 from pg_trigger where tgname = 'saves_guard' and tgrelid = 'public.saves'::regclass and not tgisinternal),
    'updated_at', f.updated_at);
end $$;

-- p_boon_epoch／p_min_version 傳 null ＝ 那一項不改
create or replace function public.admin_set_save_guard(p_boon_epoch int default null, p_min_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_caller() then raise exception '你不是管理員'; end if;
  if p_boon_epoch is not null and (p_boon_epoch < 0 or p_boon_epoch > 1000000) then
    raise exception '世代要在 0～1000000 之間（你填了 %）', p_boon_epoch;
  end if;
  if p_min_version is not null and p_min_version !~ '^[0-9]{1,9}(\.[0-9]{1,9}){0,5}$' then
    raise exception '最低版本格式要像 0.10.15（你填了 %）', p_min_version;
  end if;
  update public.game_flags set
    boon_epoch       = coalesce(p_boon_epoch, boon_epoch),
    min_save_version = coalesce(p_min_version, min_save_version),
    updated_at       = now(),
    updated_by       = auth.uid()
  where id;
  return public.admin_save_guard();
end $$;

revoke all on function public.admin_save_guard() from public, anon;
revoke all on function public.admin_set_save_guard(int, text) from public, anon;
grant execute on function public.admin_save_guard() to authenticated;
grant execute on function public.admin_set_save_guard(int, text) to authenticated;

commit;


-- =====================================================================
--  執行後自我檢查（可以單獨選取執行；只讀，不改資料）
-- =====================================================================
-- select * from public.game_flags;                                   -- 應為 boon_epoch 0、min_save_version '0'
-- select public.ver_num('0.10.14') > public.ver_num('0.10.9');       -- 應為 true
-- select public.ver_num('0.10') < public.ver_num('0.10.0');          -- 應為 true
-- select tgname from pg_trigger where tgrelid = 'public.saves'::regclass and not tgisinternal;  -- 應看到 saves_guard、saves_touch

-- =====================================================================
--  演練用（測試專案；正式專案要另開任務再授權）
-- =====================================================================
-- 調高（管理員登入遊戲後由前端呼叫 RPC，或在 SQL Editor 直接改表）：
--   update public.game_flags set boon_epoch = 1, min_save_version = '0.10.15', updated_at = now() where id;
-- 還原：
--   update public.game_flags set boon_epoch = 0, min_save_version = '0', updated_at = now() where id;
-- 解除觸發器：
--   drop trigger if exists saves_guard on public.saves;
