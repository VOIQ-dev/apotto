-- 同時ログイン制限のためのセッションID管理カラム追加
-- 実行方法: Supabase SQL Editorで実行

-- accountsテーブルにcurrent_session_idカラムを追加
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS current_session_id text;

-- インデックス追加（セッション検証のパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_accounts_session
ON public.accounts(current_session_id)
WHERE current_session_id IS NOT NULL;

-- コメント追加
COMMENT ON COLUMN public.accounts.current_session_id IS '現在有効なセッションID。新規ログイン時に更新され、古いセッションは無効化される。';

