import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { applyAuthCookies, getAccountContextFromRequest } from '@/lib/routeAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'pdf-assets';

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json({ error: 'トークンが指定されていません' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // DB から PDF 情報を取得（送信ログ経由でトークンを判定）
    const { data: sendLog, error: dbError } = await supabase
      .from('pdf_send_logs')
      .select('*, pdf:pdfs(storage_path, original_filename, size_bytes, is_deleted)')
      .eq('token', token)
      .single();

    if (dbError || !sendLog) {
      return NextResponse.json({ error: 'PDFが見つかりません' }, { status: 404 });
    }

    // 削除済み・失効済みの扱い
    if (sendLog.is_revoked || sendLog.pdf?.is_deleted) {
      return NextResponse.json({ error: 'この資料は削除されました' }, { status: 410 });
    }

    const pdfDoc = sendLog.pdf;
    if (!pdfDoc?.storage_path) {
      return NextResponse.json({ error: 'PDFの参照先が不正です' }, { status: 500 });
    }

    // Signed URL を生成（1時間有効）
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(pdfDoc.storage_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Signed URL error:', signedUrlError);
      return NextResponse.json({ error: 'PDFのURLを生成できませんでした' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pdf: {
        id: sendLog.pdf_id,
        filename: pdfDoc.original_filename,
        size: pdfDoc.size_bytes,
        createdAt: sendLog.created_at,
        signedUrl: signedUrlData.signedUrl,
        token,
      },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json({ error: 'トークンが指定されていません' }, { status: 400 });
    }

    // 管理操作は admin のみ許可（※暫定デモ管理者 cookie は許可）
    const isLegacyAdmin = request.cookies.get('apotto_auth')?.value === '1';
    let scopedCompanyId: string | null = null;
    let cookieMutations = [] as Parameters<typeof applyAuthCookies>[1];

    if (!isLegacyAdmin) {
      const ctx = await getAccountContextFromRequest(request);
      cookieMutations = ctx.cookieMutations;

      const json = (body: unknown, init?: { status?: number }) => {
        const res = NextResponse.json(body, { status: init?.status });
        applyAuthCookies(res, cookieMutations);
        return res;
      };

      if (!ctx.user) return json({ error: '認証が必要です' }, { status: 401 });
      if (!ctx.companyId) return json({ error: '会社情報が紐づいていません' }, { status: 403 });
      if (ctx.role !== 'admin') return json({ error: '権限がありません' }, { status: 403 });

      scopedCompanyId = ctx.companyId;
    }

    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 送信ログ経由で対象PDFを取得
    let logQ = supabase
      .from('pdf_send_logs')
      .select('pdf_id, company_id, pdf:pdfs(storage_path)')
      .eq('token', token);
    if (scopedCompanyId) {
      logQ = logQ.eq('company_id', scopedCompanyId);
    }
    const { data: sendLog, error: dbError } = await logQ.single();

    if (dbError || !sendLog) {
      return json({ error: 'PDFが見つかりません' }, { status: 404 });
    }

    // Supabaseの型が配列になる場合に備える
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfRecord = Array.isArray((sendLog as any).pdf) ? (sendLog as any).pdf[0] : (sendLog as any).pdf;

    // Storage から削除
    if (pdfRecord?.storage_path) {
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([pdfRecord.storage_path]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
      }
    }

    // PDFを削除フラグ化し、トークンを失効
    const [{ error: pdfError }, { error: revokeError }] = await Promise.all([
      (scopedCompanyId
        ? supabase
            .from('pdfs')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', sendLog.pdf_id)
            .eq('company_id', scopedCompanyId)
        : supabase
            .from('pdfs')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', sendLog.pdf_id)),
      (scopedCompanyId
        ? supabase
            .from('pdf_send_logs')
            .update({
              is_revoked: true,
              revoked_at: new Date().toISOString(),
              revoked_reason: 'deleted',
            })
            .eq('token', token)
            .eq('company_id', scopedCompanyId)
        : supabase
            .from('pdf_send_logs')
            .update({
              is_revoked: true,
              revoked_at: new Date().toISOString(),
              revoked_reason: 'deleted',
            })
            .eq('token', token)),
    ]);

    if (pdfError) {
      console.error('DB delete error:', pdfError);
      return json({ error: '削除に失敗しました' }, { status: 500 });
    }
    if (revokeError) {
      console.error('Token revoke error:', revokeError);
      return json({ error: '削除に失敗しました' }, { status: 500 });
    }

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}

// HEAD: トークンの有効性だけをチェック
export async function HEAD(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { data: sendLog, error } = await supabase
      .from('pdf_send_logs')
      .select('is_revoked, pdf:pdfs(is_deleted)')
      .eq('token', token)
      .single();

    if (error || !sendLog) return new NextResponse(null, { status: 404 });

    // Supabaseの型が配列になる場合に備える
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfRecord = Array.isArray((sendLog as any).pdf) ? (sendLog as any).pdf[0] : (sendLog as any).pdf;

    if (sendLog.is_revoked || pdfRecord?.is_deleted) return new NextResponse(null, { status: 410 });
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

