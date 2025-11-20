-- お問い合わせ情報を保存するテーブル
create table public.contacts (
  id uuid not null default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  content text,
  created_at timestamp with time zone not null default now(),
  constraint contacts_pkey primary key (id)
);

-- RLSの設定 (必要に応じて調整。今回はサーバーサイドからの書き込みを想定)
alter table public.contacts enable row level security;

-- 匿名ユーザーでもINSERTできるようにする (またはAPIルートでService Roleキーを使うなら不要だが、念のため)
-- 今回はNext.jsのAPIルートからService Roleで書き込む想定なので、RLSポリシーは厳密にはAPI側で制御されるが、
-- 安全のためデフォルトはOFFにしておくのが無難。ここではあえてポリシーを追加せず、
-- APIルートで supabaseAdmin (Service Role) を使う方針とする。

