import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';
import { formatTokyoDay } from '@/lib/pdfTracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAINTENANCE_API_KEY = process.env.MAINTENANCE_API_KEY;

type CleanupResult = {
  success: true;
  deleted: {
    unopenedSendLogs: number;
    previewSendLogs: number;
    oldOpenEvents: number;
    oldDailyMetrics: number;
  };
  thresholds: {
    unopenedBefore: string;
    keepOpenEventsDays: number;
    keepDailyMetricsDays: number;
  };
};

function requireKey(request: NextRequest) {
  if (!MAINTENANCE_API_KEY) return;
  const header = request.headers.get('x-api-key')?.trim();
  if (header !== MAINTENANCE_API_KEY) {
    throw new Error('Unauthorized');
  }
}

export async function POST(request: NextRequest) {
  try {
    requireKey(request);

    const supabase = createSupabaseServiceClient();

    const now = Date.now();
    const sevenDaysAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const keepOpenEventsDays = 180;
    const keepDailyMetricsDays = 180;
    const openEventsBeforeIso = new Date(
      now - keepOpenEventsDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const dailyBeforeDay = formatTokyoDay(
      new Date(now - keepDailyMetricsDays * 24 * 60 * 60 * 1000)
    );

    // 1) Preview/temporary logs: recipient_homepage_url is null → 7日で削除（DB肥大防止）
    const { data: previewDeleted, error: previewError } = await supabase
      .from('pdf_send_logs')
      .delete()
      .lt('created_at', sevenDaysAgoIso)
      .is('recipient_homepage_url', null)
      .select('id');

    if (previewError) {
      console.error('[cleanup] preview delete failed', previewError);
    }

    // 2) Unopened send logs (denominator candidates):
    // sent_at < 7日 かつ first_opened_at is null → 削除ではなく失効（is_revoked=true）
    // ※ 送信実績（分母）を残してダッシュボードの閲覧率がズレないようにする
    // ※ open_events が存在するものは失効しない（first_opened_at が未更新のケース対策）
    let unopenedRevokedCount = 0;
    const batchSize = 1000;
    const maxBatches = 50;

    for (let i = 0; i < maxBatches; i += 1) {
      const { data: candidates, error: selectError } = await supabase
        .from('pdf_send_logs')
        .select('id')
        .eq('is_revoked', false)
        .lt('sent_at', sevenDaysAgoIso)
        .is('first_opened_at', null)
        .not('recipient_homepage_url', 'is', null)
        .neq('recipient_homepage_url', '')
        .order('sent_at', { ascending: true })
        .limit(batchSize);

      if (selectError) {
        console.error('[cleanup] unopened candidates select failed', selectError);
        break;
      }
      if (!candidates || candidates.length === 0) break;

      const ids = candidates.map((c) => c.id as string);
      const { data: openedRows, error: openedError } = await supabase
        .from('pdf_open_events')
        .select('pdf_send_log_id')
        .in('pdf_send_log_id', ids);

      if (openedError) {
        console.error('[cleanup] open_events lookup failed', openedError);
        // open events を確認できない場合は削除しない
        break;
      }

      const openedSet = new Set(
        (openedRows ?? [])
          .map((r) => (r as { pdf_send_log_id?: string }).pdf_send_log_id)
          .filter(Boolean) as string[]
      );
      const deletable = ids.filter((id) => !openedSet.has(id));
      if (deletable.length === 0) {
        // 全部opened扱いなら次バッチへ（ただしsent_atが古い順なので通常は起きにくい）
        continue;
      }

      const { data: revoked, error: revokeError } = await supabase
        .from('pdf_send_logs')
        .update({ is_revoked: true })
        .in('id', deletable)
        .select('id');

      if (revokeError) {
        console.error('[cleanup] unopened revoke failed', revokeError);
        break;
      }

      unopenedRevokedCount += revoked?.length ?? deletable.length;

      // candidates が batchSize 未満なら完了
      if (candidates.length < batchSize) break;
    }

    // 3) Old open events (180日)
    const { data: openDeleted, error: openDeleteError } = await supabase
      .from('pdf_open_events')
      .delete()
      .lt('opened_at', openEventsBeforeIso)
      .select('id');

    if (openDeleteError) {
      console.error('[cleanup] open_events delete failed', openDeleteError);
    }

    // 4) Old daily metrics (180日)
    const { data: metricDeleted, error: metricDeleteError } = await supabase
      .from('pdf_daily_metrics')
      .delete()
      .lt('day', dailyBeforeDay)
      .select('day');

    if (metricDeleteError) {
      console.error('[cleanup] pdf_daily_metrics delete failed', metricDeleteError);
    }

    const result: CleanupResult = {
      success: true,
      deleted: {
        unopenedSendLogs: unopenedRevokedCount,
        previewSendLogs: previewDeleted?.length ?? 0,
        oldOpenEvents: openDeleted?.length ?? 0,
        oldDailyMetrics: metricDeleted?.length ?? 0,
      },
      thresholds: {
        unopenedBefore: sevenDaysAgoIso,
        keepOpenEventsDays,
        keepDailyMetricsDays,
      },
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}





