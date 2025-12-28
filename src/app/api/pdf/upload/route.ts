import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabaseServer';
import { applyAuthCookies, getAccountContextFromRequest } from '@/lib/routeAuth';

const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'pdf-assets';

export async function POST(request: NextRequest) {
  try {
    const { user, companyId, cookieMutations } =
      await getAccountContextFromRequest(request);

    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    if (!user) {
      return json({ error: '認証が必要です' }, { status: 401 });
    }
    if (!companyId) {
      return json({ error: '会社情報が紐づいていません' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return json({ error: 'ファイルが指定されていません' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return json({ error: 'PDFファイルのみアップロード可能です' }, { status: 400 });
    }

    // 50MB 制限
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json({ error: 'ファイルサイズは50MB以下にしてください' }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // ユニークトークン生成
    const token = crypto.randomUUID();
    const storagePath = `${companyId}/${token}.pdf`;

    // Storage にアップロード
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, arrayBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return json(
        { error: 'ストレージへのアップロードに失敗しました' },
        { status: 500 }
      );
    }

    // DB に PDF メタ情報を保存（pdfs テーブル）
    const { data: inserted, error: dbError } = await supabase
      .from('pdfs')
      .insert({
        original_filename: file.name,
        storage_path: storagePath,
        size_bytes: file.size,
        company_id: companyId,
        is_deleted: false,
      })
      .select('id, storage_path')
      .single();

    if (dbError) {
      console.error('DB insert error:', dbError);
      // ロールバック: アップロードしたファイルを削除
      await supabase.storage.from(bucketName).remove([storagePath]);
      return json(
        { error: 'データベースへの保存に失敗しました' },
        { status: 500 }
      );
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 3600);

    if (signedUrlError) {
      console.error('Signed URL error:', signedUrlError);
    }

    return json({
      success: true,
      id: inserted?.id ?? null,
      storagePath,
      signedUrl: signedUrlData?.signedUrl ?? null,
      filename: file.name,
      size: file.size,
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}







