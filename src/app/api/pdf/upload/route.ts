import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'pdf-assets';

// 企業フォルダ名（今回は固定で VOIQ）
const COMPANY_FOLDER = 'VOIQ';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが指定されていません' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDFファイルのみアップロード可能です' }, { status: 400 });
    }

    // 50MB 制限
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは50MB以下にしてください' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ユニークトークン生成
    const token = crypto.randomUUID();
    const storagePath = `${COMPANY_FOLDER}/${token}.pdf`;

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
      return NextResponse.json({ error: 'ストレージへのアップロードに失敗しました' }, { status: 500 });
    }

    // DB に PDF メタ情報を保存（pdf_documents テーブル）
    const { error: dbError } = await supabase.from('pdf_documents').insert({
      filename: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      unique_url_token: token,
      company_name: COMPANY_FOLDER,
    });

    if (dbError) {
      console.error('DB insert error:', dbError);
      // ロールバック: アップロードしたファイルを削除
      await supabase.storage.from(bucketName).remove([storagePath]);
      return NextResponse.json({ error: 'データベースへの保存に失敗しました' }, { status: 500 });
    }

    // ユニーク URL を生成（相対パス）
    const uniqueUrl = `/pdf/${token}`;

    return NextResponse.json({
      success: true,
      token,
      uniqueUrl,
      filename: file.name,
      size: file.size,
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}



