-- =====================================================================
--  深層礦脈｜佐佐木恩惠正式重置（世代 0 → 1）
--  用法：Supabase → SQL Editor → New query → 整份貼上 → Run
--  前提：已執行 docs/14、docs/15、docs/16。
--  擁有者授權：2026-10-02「這四件事情要一次全部一起做完」（不做測試演練）。
--  這份可以重複執行：已經是世代 1 的存檔不會再被動；整段包在 begin/commit 裡，
--  最後的自我檢查不通過會整批取消（一筆都不改）。
--
--  做的事：
--    1. 先把每位玩家「重置前的整份存檔」複製到 public.boon_reset_backup（批次 2026-10-02-epoch1）。
--       這張表玩家讀不到也改不到（RLS 開啟、沒有任何規則）。
--    2. 每份雲端存檔的 data.boss 改成新版恩惠的起點：
--         level 1、favor 0、total 0、boons []（舊恩惠收回）、
--         schema 2、epoch 1、四種恩惠 0 階、rewardLv 1、pending []、milestones {}、
--         佐佐木對話統計 talk 清掉（熟悉度從頭開始）；
--         保留目前的委託板 req 與當天換板次數 reqAds。
--       boss 以外（金幣、背包、工具、玩家 ID、前輩信賴、免費重置次數…）完全不動。
--       rev +1 → 其他裝置上的舊存檔會被判定「存檔撞到了」，且只能用雲端的。
--    3. game_flags：boon_epoch = 1、min_save_version = '0.10.15'
--       → 舊存檔（世代 0）與舊版遊戲（0.10.14 以前）都不能再寫回雲端（docs/15）。
--  不做的事：不寄信（補償另外執行）、不動 mail／mail_claims／player_profiles。
--
--  復原（會失去重置之後的所有進度，只在出大事時用）：
--    begin;
--    update public.saves s set data = b.old_data || jsonb_build_object('rev', s.rev + 1), rev = s.rev + 1
--      from public.boon_reset_backup b where b.batch = '2026-10-02-epoch1' and b.user_id = s.user_id;
--    update public.game_flags set boon_epoch = 0, min_save_version = '0', updated_at = now() where id;
--    commit;
-- =====================================================================

begin;

do $$ begin
  if to_regclass('public.game_flags') is null then raise exception '請先執行 docs/15'; end if;
  if to_regclass('public.milestone_claims') is null then raise exception '請先執行 docs/16'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. 重置前備份
-- ---------------------------------------------------------------------
create table if not exists public.boon_reset_backup (
  batch        text not null,
  user_id      uuid not null,
  rev          bigint,
  ver          text,
  old_boss     jsonb,
  old_data     jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (batch, user_id)
);
alter table public.boon_reset_backup enable row level security;
revoke all on public.boon_reset_backup from anon, authenticated;

create or replace function pg_temp.save_epoch(d jsonb) returns int language sql immutable as $$
  select case when jsonb_typeof(d #> '{boss,epoch}') = 'number' then floor((d #>> '{boss,epoch}')::numeric)::int else 0 end
$$;

insert into public.boon_reset_backup (batch, user_id, rev, ver, old_boss, old_data)
select '2026-10-02-epoch1', s.user_id, s.rev, s.ver, s.data -> 'boss', s.data
from public.saves s
where pg_temp.save_epoch(s.data) < 1
on conflict (batch, user_id) do nothing;

-- ---------------------------------------------------------------------
-- 2. 重置（只動世代 < 1 的存檔）
-- ---------------------------------------------------------------------
update public.saves s set
  data = jsonb_set(s.data, '{boss}',
           jsonb_build_object(
             'favor', 0, 'level', 1, 'boons', '[]'::jsonb, 'total', 0,
             'schema', 2, 'epoch', 1,
             'tiers', jsonb_build_object('autoSpeed', 0, 'sell', 0, 'toolCut', 0, 'toolDur', 0),
             'rewardLv', 1, 'pending', '[]'::jsonb, 'milestones', '{}'::jsonb,
             'req', coalesce(s.data #> '{boss,req}', 'null'::jsonb))
           || case when jsonb_typeof(s.data #> '{boss,reqAds}') = 'object'
                   then jsonb_build_object('reqAds', s.data #> '{boss,reqAds}') else '{}'::jsonb end,
           true)
         || jsonb_build_object('rev', s.rev + 1),
  rev = s.rev + 1
where pg_temp.save_epoch(s.data) < 1;

-- ---------------------------------------------------------------------
-- 3. 世代與最低版本
-- ---------------------------------------------------------------------
update public.game_flags set boon_epoch = 1, min_save_version = '0.10.15', updated_at = now() where id;

-- ---------------------------------------------------------------------
-- 4. 自我檢查：不通過就整批取消
-- ---------------------------------------------------------------------
do $$
declare n_left int; n_saves int; n_bk int; n_bad int;
begin
  select count(*) into n_left from public.saves where pg_temp.save_epoch(data) < 1;
  select count(*) into n_saves from public.saves;
  select count(*) into n_bk from public.boon_reset_backup b join public.saves s using (user_id) where b.batch = '2026-10-02-epoch1';
  select count(*) into n_bad from public.saves
   where (data #>> '{boss,level}')::int <> 1 or jsonb_array_length(data #> '{boss,boons}') <> 0
      or (data ->> 'rev')::bigint <> rev or (data #>> '{boss,schema}')::int <> 2;
  if n_left <> 0 then raise exception '還有 % 份存檔沒有重置，整批取消', n_left; end if;
  if n_bk <> n_saves then raise exception '備份 % 份、存檔 % 份，數量不符，整批取消', n_bk, n_saves; end if;
  if n_bad <> 0 then raise exception '% 份存檔重置後內容不對，整批取消', n_bad; end if;
  if (select boon_epoch from public.game_flags where id) <> 1 then raise exception '世代沒有設成 1，整批取消'; end if;
  raise notice '重置完成：% 份存檔、備份 % 份', n_saves, n_bk;
end $$;

commit;

-- =====================================================================
--  執行後核對（只讀）
-- =====================================================================
-- select count(*), min(data #>> '{boss,level}'), max(data #>> '{boss,level}'), min(rev) from public.saves;
-- select batch, count(*) from public.boon_reset_backup group by 1;
-- select * from public.game_flags;
