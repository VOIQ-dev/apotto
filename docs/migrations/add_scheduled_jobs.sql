-- 予約送信ジョブテーブル
-- フォーム自動送信の予約実行を管理
create table if not exists public.scheduled_jobs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- ジョブ名（識別用）
  name text not null,

  -- ステータス
  status text not null default 'active', -- active / paused / completed / cancelled

  -- スケジュール設定
  schedule_type text not null default 'once', -- once / daily / weekly / monthly
  scheduled_at timestamptz not null, -- 次回実行予定時刻
  timezone text not null default 'Asia/Tokyo',
  
  -- 繰り返し設定（weekly/monthlyの場合）
  day_of_week int, -- 0-6 (日-土) for weekly
  day_of_month int, -- 1-31 for monthly
  hour int not null default 9, -- 実行時刻（時）
  minute int not null default 0, -- 実行時刻（分）

  -- 送信対象
  -- 方法1: 直接リードIDを指定
  lead_ids uuid[],
  -- 方法2: フィルター条件で動的に取得
  filter_conditions jsonb, -- 例: {"send_status": "pending", "max_count": 100}

  -- 送信設定
  send_config jsonb not null, -- 送信者情報、PDF設定などをJSONBで格納
  -- 例: {
  --   "senderProfile": {...},
  --   "pdfIds": ["xxx", "yyy"],
  --   "productContext": {...}
  -- }

  -- 実行履歴
  last_run_at timestamptz,
  last_batch_job_id uuid references public.batch_jobs(id),
  run_count int not null default 0,

  -- タイムスタンプ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- インデックス
create index if not exists idx_scheduled_jobs_company on public.scheduled_jobs(company_id);
create index if not exists idx_scheduled_jobs_status on public.scheduled_jobs(status);
create index if not exists idx_scheduled_jobs_scheduled_at on public.scheduled_jobs(scheduled_at);
create index if not exists idx_scheduled_jobs_active_scheduled on public.scheduled_jobs(status, scheduled_at)
  where status = 'active';

-- RLS 設定
alter table public.scheduled_jobs enable row level security;

-- 会社スコープでの SELECT ポリシー
create policy "company scoped select" on public.scheduled_jobs
  for select using (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- サービスロール（API・バッチ用）は全権限
create policy "service role full access" on public.scheduled_jobs
  for all using (auth.role() = 'service_role');

-- 会社スコープでの INSERT/UPDATE ポリシー
create policy "company scoped insert" on public.scheduled_jobs
  for insert with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "company scoped update" on public.scheduled_jobs
  for update using (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- 更新時のタイムスタンプ自動更新
create or replace function update_scheduled_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger scheduled_jobs_updated_at
  before update on public.scheduled_jobs
  for each row execute function update_scheduled_jobs_updated_at();

-- 次回実行時刻を計算する関数
create or replace function calculate_next_scheduled_at(
  p_schedule_type text,
  p_current_scheduled_at timestamptz,
  p_hour int,
  p_minute int,
  p_day_of_week int default null,
  p_day_of_month int default null,
  p_timezone text default 'Asia/Tokyo'
)
returns timestamptz as $$
declare
  v_next timestamptz;
  v_local timestamp;
begin
  -- 現在の予定時刻をローカルタイムに変換
  v_local := p_current_scheduled_at at time zone p_timezone;
  
  case p_schedule_type
    when 'once' then
      -- 一度きりの場合はnullを返す（完了扱い）
      return null;
    when 'daily' then
      -- 翌日の同時刻
      v_next := (v_local + interval '1 day')::date + 
                make_time(p_hour, p_minute, 0);
    when 'weekly' then
      -- 次の指定曜日
      v_next := v_local + interval '7 days';
      -- 曜日調整（必要に応じて）
      while extract(dow from v_next) != p_day_of_week loop
        v_next := v_next + interval '1 day';
      end loop;
      v_next := v_next::date + make_time(p_hour, p_minute, 0);
    when 'monthly' then
      -- 翌月の指定日
      v_next := (v_local + interval '1 month')::date;
      -- 日付を調整
      v_next := make_date(
        extract(year from v_next)::int,
        extract(month from v_next)::int,
        least(p_day_of_month, extract(day from (date_trunc('month', v_next) + interval '1 month - 1 day'))::int)
      ) + make_time(p_hour, p_minute, 0);
    else
      return null;
  end case;
  
  -- タイムゾーン付きで返す
  return v_next at time zone p_timezone;
end;
$$ language plpgsql;

-- コメント
comment on table public.scheduled_jobs is '予約送信ジョブテーブル - フォーム自動送信の予約実行を管理';
comment on column public.scheduled_jobs.schedule_type is 'スケジュールタイプ: once=一度きり, daily=毎日, weekly=毎週, monthly=毎月';
comment on column public.scheduled_jobs.send_config is '送信設定（送信者情報、PDF設定など）をJSONBで格納';
comment on column public.scheduled_jobs.filter_conditions is 'リード取得のフィルター条件（lead_idsが空の場合に使用）';
