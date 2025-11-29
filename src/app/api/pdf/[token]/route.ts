import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // DB から PDF 情報を取得
    const { data: pdfDoc, error: dbError } = await supabase
      .from('pdf_documents')
      .select('*')
      .eq('unique_url_token', token)
      .single();

    if (dbError || !pdfDoc) {
      return NextResponse.json({ error: 'PDFが見つかりません' }, { status: 404 });
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
        id: pdfDoc.id,
        filename: pdfDoc.filename,
        size: pdfDoc.size_bytes,
        createdAt: pdfDoc.created_at,
        signedUrl: signedUrlData.signedUrl,
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // DB から PDF 情報を取得
    const { data: pdfDoc, error: dbError } = await supabase
      .from('pdf_documents')
      .select('storage_path')
      .eq('unique_url_token', token)
      .single();

    if (dbError || !pdfDoc) {
      return NextResponse.json({ error: 'PDFが見つかりません' }, { status: 404 });
    }

    // Storage から削除
    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([pdfDoc.storage_path]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
    }

    // DB から削除
    const { error: deleteError } = await supabase
      .from('pdf_documents')
      .delete()
      .eq('unique_url_token', token);

    if (deleteError) {
      console.error('DB delete error:', deleteError);
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}

