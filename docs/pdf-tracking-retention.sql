-- PDF送信先別トラッキング + 保持ポリシー（未閲覧7日で失効、閲覧ログ180日保持）
-- 前提:
-- - 既存の `public.pdfs` / `public.pdf_send_logs` / `public.pdf_open_events` が存在する（無ければ docs/saas-schema.sql を先に適用）
-- - 本SQLは「不足カラム/制約/集計テーブル」を追加するための追記です

create extension if not exists "uuid-ossp";

-- =========
-- 1) pdf_send_logs: 送信成功（分母）を記録
-- =========
alter table public.pdf_send_logs
  add column if not exists recipient_company_name text,
  add column if not exists recipient_homepage_url text,
  add column if not exists first_opened_at timestamptz;

-- 送信成功の時刻（既にある場合はスキップ）
alter table public.pdf_send_logs
  add column if not exists sent_at timestamptz default now();

-- 送信先メールはフォーム送信では未取得のケースがあるため、NULL許容を推奨
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pdf_send_logs'
      and column_name = 'recipient_email'
      and is_nullable = 'NO'
  ) then
    alter table public.pdf_send_logs alter column recipient_email drop not null;
  end if;
exception when others then
  -- 権限や環境差異で失敗する場合があるため無視（アプリ側でダミー値を入れる運用も可能）
end;
$$;

create index if not exists idx_pdf_send_logs_pdf_sent_at
  on public.pdf_send_logs(pdf_id, sent_at desc);
create index if not exists idx_pdf_send_logs_homepage_sent_at
  on public.pdf_send_logs(recipient_homepage_url, sent_at desc);
create index if not exists idx_pdf_send_logs_first_opened_at
  on public.pdf_send_logs(first_opened_at);

-- =========
-- 2) pdf_open_events: 閲覧者メール/読了率/滞在（180日保持）
-- =========
alter table public.pdf_open_events
  add column if not exists last_seen_at timestamptz,
  add column if not exists read_percentage_max integer not null default 0,
  add column if not exists max_page_reached integer not null default 1,
  add column if not exists elapsed_seconds_max integer not null default 0;

-- 送信ログ×閲覧者メールの重複を防ぎ、リロード等で肥大しないようにする
do $$
begin
  alter table public.pdf_open_events
    add constraint pdf_open_events_unique_sendlog_viewer unique (pdf_send_log_id, viewer_email);
exception when duplicate_table then
  -- noop
exception when duplicate_object then
  -- already exists
end;
$$;

create index if not exists idx_pdf_open_events_opened_at
  on public.pdf_open_events(opened_at desc);
create index if not exists idx_pdf_open_events_last_seen_at
  on public.pdf_open_events(last_seen_at desc);

-- =========
-- 3) pdf_daily_metrics: 日次集計（180日保持）
-- 未閲覧送信ログを7日で削除しても閲覧率を算出できるようにするためのカウンタ
-- =========
create table if not exists public.pdf_daily_metrics (
  day date not null,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  sent_count integer not null default 0,
  opened_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, pdf_id)
);

create index if not exists idx_pdf_daily_metrics_pdf_day
  on public.pdf_daily_metrics(pdf_id, day desc);

-- =========
-- 4) インクリメント用RPC（原子的に +1 する）
-- =========
create or replace function public.increment_pdf_daily_metrics(
  p_day date,
  p_pdf_id uuid,
  p_sent_delta integer default 0,
  p_opened_delta integer default 0
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.pdf_daily_metrics(day, pdf_id, sent_count, opened_count)
  values (p_day, p_pdf_id, greatest(p_sent_delta, 0), greatest(p_opened_delta, 0))
  on conflict (day, pdf_id)
  do update set
    sent_count = public.pdf_daily_metrics.sent_count + p_sent_delta,
    opened_count = public.pdf_daily_metrics.opened_count + p_opened_delta,
    updated_at = now();
end;
$$;

-- =========
-- 5) 保持/失効ポリシー（推奨）
-- =========
-- - 未閲覧送信ログ: sent_at から 7日経過 かつ first_opened_at is null を失効（is_revoked=true 推奨）
--   ※ 削除すると会社フィルタ時の閲覧率（分母）が欠けてズレるため、分析用途では「失効+保持」が安全
-- - 閲覧ログ: opened_at から 180日経過 を削除
-- これらは Supabase の Scheduled Jobs / Cron (Vercel) / 手動API で実行する






