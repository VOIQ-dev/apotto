import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 企業フォルダ名（今回は固定で VOIQ）
const COMPANY_FOLDER = 'VOIQ';

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: pdfs, error } = await supabase
      .from('pdf_documents')
      .select('id, filename, size_bytes, created_at, unique_url_token')
      .eq('company_name', COMPANY_FOLDER)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('DB error:', error);
      return NextResponse.json({ error: 'PDF一覧の取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ pdfs: pdfs || [] });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}



