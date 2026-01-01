// 定期実行用のログクレンジングスクリプト
// 例: node scripts/cleanup-logs.mjs

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です');
  process.exit(1);
}

const DRY_RUN = (process.env.DRY_RUN || 'true').toLowerCase() === 'true';

const ACCESS_RETENTION_DAYS = parseInt(process.env.ACCESS_LOG_RETENTION_DAYS || '180', 10);
const OPEN_RETENTION_DAYS = parseInt(process.env.OPEN_LOG_RETENTION_DAYS || '90', 10);
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10);

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function purge(table, column, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const { data, error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .lt(column, cutoffIso)
    .select('*');

  if (error) {
    console.error(`[${table}] delete error`, error);
    return;
  }
  console.log(`[${table}] deleted ${count ?? data?.length ?? 0} rows older than ${cutoffIso}`);
}

async function run() {
  console.log('--- cleanup start ---', { DRY_RUN, ACCESS_RETENTION_DAYS, OPEN_RETENTION_DAYS, AUDIT_RETENTION_DAYS });

  if (DRY_RUN) {
    console.log('DRY_RUN=true のため削除は行いません');
    return;
  }

  await purge('pdf_open_events', 'opened_at', OPEN_RETENTION_DAYS);
  await purge('email_events', 'created_at', OPEN_RETENTION_DAYS); // 開封ログ相当
  await purge('audit_logs', 'occurred_at', AUDIT_RETENTION_DAYS);
  await purge('pdf_open_events', 'created_at', ACCESS_RETENTION_DAYS); // 念のため created_at でもクレンジング

  console.log('--- cleanup done ---');
}

run().catch((err) => {
  console.error('cleanup failed', err);
  process.exit(1);
});






