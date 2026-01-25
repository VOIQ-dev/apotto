-- バッチジョブテーブル（フォーム自動送信の非同期処理管理）
create table if not exists public.batch_jobs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- ジョブステータス
  status text not null default 'pending', -- pending / running / completed / failed / cancelled

  -- 進捗情報
  total_items int not null,
  completed_items int not null default 0,
  failed_items int not null default 0,

  -- 対象リードID配列
  lead_ids uuid[] not null,

  -- 処理結果詳細（各リードの success/fail 情報を JSONB で格納）
  -- 例: [{"leadId": "xxx", "success": true, "url": "..."}, ...]
  results jsonb,

  -- エラーメッセージ（ジョブ全体がfailedの場合）
  error_message text,

  -- タイムスタンプ
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- インデックス
create index if not exists idx_batch_jobs_company on public.batch_jobs(company_id);
create index if not exists idx_batch_jobs_status on public.batch_jobs(status);
create index if not exists idx_batch_jobs_created on public.batch_jobs(created_at desc);

-- RLS 設定
alter table public.batch_jobs enable row level security;

-- 会社スコープでの SELECT ポリシー
create policy "company scoped select" on public.batch_jobs
  for select using (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- サービスロール（API・バッチ用）は全権限
create policy "service role full access" on public.batch_jobs
  for all using (auth.role() = 'service_role');

-- 会社スコープでの INSERT ポリシー
create policy "company scoped insert" on public.batch_jobs
  for insert with check (company_id = (auth.jwt() ->> 'company_id')::uuid);
