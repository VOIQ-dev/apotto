-- SaaS版 apotto 用のデータモデル（Supabase/PostgreSQL想定）
create extension if not exists "uuid-ossp";

-- 会社
create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  domain text,
  status text not null default 'active', -- active / inactive
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- アカウント（1社専属、招待→初回ログインで active）
create table if not exists public.accounts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'member', -- admin / member
  status text not null default 'invited', -- invited / active / inactive
  invited_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email)
);

-- PDFメタ
create table if not exists public.pdfs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text,
  original_filename text not null,
  storage_path text not null,
  size_bytes bigint not null,
  mime_type text,
  file_hash text,
  uploaded_by_account_id uuid references public.accounts(id),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pdfs_company on public.pdfs(company_id);
create index if not exists idx_pdfs_hash on public.pdfs(file_hash);

-- PDF送信ログ（受信者単位の署名トークンを管理、有効期限なし）
create table if not exists public.pdf_send_logs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  token text not null unique,
  recipient_email text not null,
  recipient_name text,
  sent_by_account_id uuid references public.accounts(id),
  sent_channel text default 'email', -- email / form 等
  sent_at timestamptz default now(),
  is_revoked boolean not null default false, -- PDF削除等で無効化
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pdf_send_logs_company on public.pdf_send_logs(company_id);
create index if not exists idx_pdf_send_logs_pdf on public.pdf_send_logs(pdf_id);
create index if not exists idx_pdf_send_logs_recipient on public.pdf_send_logs(recipient_email);

-- PDF開封イベント（アクセスログ）
create table if not exists public.pdf_open_events (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  pdf_send_log_id uuid not null references public.pdf_send_logs(id) on delete cascade,
  viewer_email text not null,
  ip_address text,
  user_agent text,
  referrer text,
  geo_city text,
  geo_country text,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_pdf_open_events_company on public.pdf_open_events(company_id);
create index if not exists idx_pdf_open_events_send_log on public.pdf_open_events(pdf_send_log_id);
create index if not exists idx_pdf_open_events_viewer on public.pdf_open_events(viewer_email);

-- サブスクリプション（Stripe Checkout）
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  plan_interval text not null, -- 1m / 3m / 6m / 12m
  status text not null, -- trialing / active / past_due / canceled 等
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stripe_subscription_id)
);
create index if not exists idx_subscriptions_company on public.subscriptions(company_id);

-- メールテンプレ（用途別、必要なら多言語）
create table if not exists public.email_templates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  purpose text not null, -- signup_invite / signup_completed / pdf_view_notice など
  locale text not null default 'ja-JP',
  subject_template text not null,
  body_template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, purpose, locale)
);

-- メール送信イベント（SES）
create table if not exists public.email_events (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  template_id uuid references public.email_templates(id),
  to_email text not null,
  to_name text,
  context jsonb, -- 送信理由や関連リソースIDを格納
  status text not null, -- queued / sent / failed / bounced / complained / opened / clicked
  ses_message_id text,
  error text,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_email_events_to_email on public.email_events(to_email);
create index if not exists idx_email_events_company on public.email_events(company_id);

-- リードリスト（AgGrid管理用）
create table if not exists public.lead_lists (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  homepage_url text not null,
  company_name text not null,
  contact_name text,
  department text,
  title text,
  email text,
  send_status text not null default 'pending', -- pending / success / failed
  pdf_send_log_id uuid references public.pdf_send_logs(id),
  is_appointed boolean not null default false,
  is_ng boolean not null default false,
  import_file_name text, -- インポート元のCSVファイル名
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, homepage_url)
);
create index if not exists idx_lead_lists_company on public.lead_lists(company_id);
create index if not exists idx_lead_lists_status on public.lead_lists(send_status);

-- 送信先マスタ（任意）
create table if not exists public.company_contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  email text not null,
  title text,
  department text,
  phone text,
  note text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email)
);
create index if not exists idx_company_contacts_company on public.company_contacts(company_id);

-- 監査ログ（重要操作）
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_account_id uuid references public.accounts(id),
  action_type text not null, -- pdf_upload / pdf_delete / pdf_token_revoke / signup_invite / subscription_update など
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_company_time on public.audit_logs(company_id, occurred_at desc);

-- 保持ポリシーの目安（クレンジングジョブで削除/匿名化する想定）
-- pdf_open_events: 90〜180日
-- email_events: 30〜90日（開封ログ相当）
-- audit_logs: 1年

-- =========
-- RLS 設定の例（会社スコープを強制）
-- ※実環境では service role で管理操作を行い、anon/role 別に適宜調整してください。
-- =========
alter table public.companies enable row level security;
alter table public.accounts enable row level security;
alter table public.pdfs enable row level security;
alter table public.pdf_send_logs enable row level security;
alter table public.pdf_open_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_events enable row level security;
alter table public.company_contacts enable row level security;
alter table public.lead_lists enable row level security;
alter table public.audit_logs enable row level security;

-- 会社所属ユーザーのみが同一 company_id の行にアクセスできる例
create policy "company scoped select" on public.accounts
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.pdfs
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.pdf_send_logs
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.pdf_open_events
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.subscriptions
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.email_templates
  for select using (company_id is null or company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.email_events
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.company_contacts
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.lead_lists
  for select using (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped select" on public.audit_logs
  for select using (company_id = auth.jwt() ->> 'company_id'::text);

-- サービスロールは全権限（API やバッチ用途）
create policy "service role full access" on public.accounts
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.pdfs
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.pdf_send_logs
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.pdf_open_events
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.subscriptions
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.email_templates
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.email_events
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.company_contacts
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.lead_lists
  for all using (auth.role() = 'service_role');
create policy "service role full access" on public.audit_logs
  for all using (auth.role() = 'service_role');

-- INSERT/UPDATE ポリシー例（会社IDの固定を強制）
create policy "company scoped insert" on public.pdf_send_logs
  for insert with check (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped insert" on public.pdf_open_events
  for insert with check (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped insert" on public.email_events
  for insert with check (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped insert" on public.company_contacts
  for insert with check (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped insert" on public.lead_lists
  for insert with check (company_id = auth.jwt() ->> 'company_id'::text);
create policy "company scoped insert" on public.audit_logs
  for insert with check (company_id = auth.jwt() ->> 'company_id'::text);
