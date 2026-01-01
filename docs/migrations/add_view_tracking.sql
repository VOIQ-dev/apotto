-- ===========================================
-- 閲覧データ蓄積機能 マイグレーション
-- ===========================================
-- 実行方法: Supabase SQL Editorで実行

-- 1. pdf_send_logsに閲覧回数カラム追加
ALTER TABLE pdf_send_logs 
ADD COLUMN IF NOT EXISTS total_open_count INT DEFAULT 0;

-- 2. pdf_open_eventsに累積時間とセッションID追加
ALTER TABLE pdf_open_events 
ADD COLUMN IF NOT EXISTS elapsed_seconds_total INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_session_id TEXT;

-- 3. 閲覧回数インクリメント用RPC関数
CREATE OR REPLACE FUNCTION increment_open_count(log_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE pdf_send_logs 
  SET total_open_count = COALESCE(total_open_count, 0) + 1
  WHERE id = log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 既存データの初期化（オプション）
-- 既存のpdf_open_eventsからtotal_open_countを計算して設定
-- UPDATE pdf_send_logs psl
-- SET total_open_count = (
--   SELECT COUNT(DISTINCT viewer_email)
--   FROM pdf_open_events poe
--   WHERE poe.pdf_send_log_id = psl.id
-- )
-- WHERE EXISTS (
--   SELECT 1 FROM pdf_open_events poe WHERE poe.pdf_send_log_id = psl.id
-- );

-- ===========================================
-- 確認用クエリ
-- ===========================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'pdf_send_logs' AND column_name = 'total_open_count';
--
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'pdf_open_events' AND column_name IN ('elapsed_seconds_total', 'last_session_id');


