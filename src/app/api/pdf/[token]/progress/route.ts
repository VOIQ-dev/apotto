import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';
import { clampInt } from '@/lib/pdfTracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ token: string }>;
};

type RequestBody = {
  viewer_email?: string;
  viewerEmail?: string;
  email?: string;
  read_percentage?: number;
  readPercentage?: number;
  max_page_reached?: number;
  maxPageReached?: number;
  elapsed_seconds?: number;
  elapsedSeconds?: number;
};

function extractViewerEmail(body: RequestBody): string {
  return String(body.viewer_email ?? body.viewerEmail ?? body.email ?? '')
    .trim()
    .toLowerCase();
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token) {
      return NextResponse.json(
        { error: 'トークンが指定されていません' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const viewerEmail = extractViewerEmail(body);
    if (!viewerEmail) {
      return NextResponse.json(
        { error: 'viewer_email は必須です' },
        { status: 400 }
      );
    }

    const readPercentage = clampInt(
      body.read_percentage ?? body.readPercentage ?? 0,
      0,
      100
    );
    const maxPageReached = clampInt(
      body.max_page_reached ?? body.maxPageReached ?? 1,
      1,
      99999
    );
    const elapsedSeconds = clampInt(
      body.elapsed_seconds ?? body.elapsedSeconds ?? 0,
      0,
      365 * 24 * 60 * 60
    );

    const supabase = createSupabaseServiceClient();

    const { data: sendLog, error: dbError } = await supabase
      .from('pdf_send_logs')
      .select('id, company_id, pdf_id, is_revoked, pdf:pdfs(is_deleted)')
      .eq('token', token)
      .maybeSingle();

    if (dbError || !sendLog) {
      return NextResponse.json({ error: 'PDFが見つかりません' }, { status: 404 });
    }

    // Supabase の埋め込み結果は型的に配列扱いになることがあるため、単体に正規化する
    const pdfEmbedded = (sendLog as { pdf?: unknown }).pdf;
    const pdfDoc = (Array.isArray(pdfEmbedded) ? pdfEmbedded[0] : pdfEmbedded) as
      | { is_deleted?: unknown }
      | null
      | undefined;

    if (sendLog.is_revoked || Boolean(pdfDoc?.is_deleted)) {
      return NextResponse.json(
        { error: 'この資料は削除されました' },
        { status: 410 }
      );
    }

    const nowIso = new Date().toISOString();

    // 既存レコードを取得し、maxを維持する
    const { data: existing, error: existingError } = await supabase
      .from('pdf_open_events')
      .select('read_percentage_max, max_page_reached, elapsed_seconds_max')
      .eq('pdf_send_log_id', sendLog.id)
      .eq('viewer_email', viewerEmail)
      .maybeSingle();

    if (existingError) {
      console.error('[pdf/progress] select failed', existingError);
    }

    const nextRead = Math.max(existing?.read_percentage_max ?? 0, readPercentage);
    const nextPage = Math.max(existing?.max_page_reached ?? 1, maxPageReached);
    const nextElapsed = Math.max(existing?.elapsed_seconds_max ?? 0, elapsedSeconds);

    const { error: upsertError } = await supabase
      .from('pdf_open_events')
      .upsert(
        {
          company_id: (sendLog as { company_id?: unknown }).company_id ?? null,
          pdf_send_log_id: sendLog.id,
          pdf_id: sendLog.pdf_id,
          viewer_email: viewerEmail,
          last_seen_at: nowIso,
          read_percentage_max: nextRead,
          max_page_reached: nextPage,
          elapsed_seconds_max: nextElapsed,
        },
        { onConflict: 'pdf_send_log_id,viewer_email' }
      );

    if (upsertError) {
      console.error('[pdf/progress] upsert failed', upsertError);
      return NextResponse.json(
        { error: '閲覧情報の更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pdf/progress] Unexpected error:', err);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}





