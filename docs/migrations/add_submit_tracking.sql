-- 送信回数と最終送信日の追跡機能を追加
-- 実行日: 2026-01-31

-- 1. submit_count 列を追加（送信回数）
ALTER TABLE public.lead_lists 
ADD COLUMN IF NOT EXISTS submit_count integer DEFAULT 0;

-- 2. last_submitted_at 列を追加（最終送信日時）
ALTER TABLE public.lead_lists 
ADD COLUMN IF NOT EXISTS last_submitted_at timestamptz;

-- 3. error_message 列を追加（失敗時のエラーメッセージ保存用）
ALTER TABLE public.lead_lists 
ADD COLUMN IF NOT EXISTS error_message text;

-- 4. 既存の成功/失敗データのsubmit_countを1に設定
UPDATE public.lead_lists 
SET submit_count = 1 
WHERE send_status IN ('success', 'failed', 'blocked') 
  AND submit_count = 0;

-- 5. 既存の成功/失敗データのlast_submitted_atをupdated_atに設定
UPDATE public.lead_lists 
SET last_submitted_at = updated_at 
WHERE send_status IN ('success', 'failed', 'blocked') 
  AND last_submitted_at IS NULL;

-- 6. インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_lead_lists_submit_count ON public.lead_lists(submit_count);
CREATE INDEX IF NOT EXISTS idx_lead_lists_last_submitted ON public.lead_lists(last_submitted_at);

-- コメント追加
COMMENT ON COLUMN public.lead_lists.submit_count IS '送信回数（送信するたびにインクリメント）';
COMMENT ON COLUMN public.lead_lists.last_submitted_at IS '最終送信日時';
COMMENT ON COLUMN public.lead_lists.error_message IS '送信失敗時のエラーメッセージ';
