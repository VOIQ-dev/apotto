import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';
import { applyAuthCookies, getAccountContextFromRequest } from '@/lib/routeAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'pdf-assets';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // 認証 + 会社スコープ（管理操作のため admin のみ許可）
    const { user, companyId, role, cookieMutations } =
      await getAccountContextFromRequest(request);
    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    if (!user) return json({ error: '認証が必要です' }, { status: 401 });
    if (!companyId) return json({ error: '会社情報が紐づいていません' }, { status: 403 });
    if (role !== 'admin') return json({ error: '権限がありません' }, { status: 403 });

    const { id } = await context.params;
    const pdfId = String(id ?? '').trim();
    if (!pdfId) {
      return json({ error: 'id が指定されていません' }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    const { data: pdf, error: pdfError } = await supabase
      .from('pdfs')
      .select('id, storage_path, is_deleted')
      .eq('id', pdfId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (pdfError) {
      console.error('[pdf/by-id] DB error', pdfError);
      return json({ error: '削除に失敗しました' }, { status: 500 });
    }

    if (!pdf) {
      return json({ error: 'PDFが見つかりません' }, { status: 404 });
    }

    if (!pdf.is_deleted && pdf.storage_path) {
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([pdf.storage_path]);
      if (storageError) {
        console.error('[pdf/by-id] Storage delete error', storageError);
      }
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('pdfs')
      .update({ is_deleted: true, deleted_at: nowIso })
      .eq('id', pdfId)
      .eq('company_id', companyId);

    if (updateError) {
      console.error('[pdf/by-id] PDF update error', updateError);
      return json({ error: '削除に失敗しました' }, { status: 500 });
    }

    // 送信ログの有効性も失効扱いにする（pdf.is_deleted で閲覧不可になるが、明示しておく）
    const { error: revokeError } = await supabase
      .from('pdf_send_logs')
      .update({
        is_revoked: true,
        revoked_at: nowIso,
        revoked_reason: 'deleted',
      })
      .eq('pdf_id', pdfId)
      .eq('company_id', companyId);
    if (revokeError) {
      console.error('[pdf/by-id] send_logs revoke error', revokeError);
    }

    return json({ success: true });
  } catch (err) {
    console.error('[pdf/by-id] Unexpected error', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}





