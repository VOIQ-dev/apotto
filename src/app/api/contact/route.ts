import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// バリデーションスキーマ
const contactSchema = z.object({
  companyName: z.string().min(1, '会社名は必須です'),
  contactName: z.string().min(1, '担当者名は必須です'),
  email: z.string().email('正しいメールアドレスを入力してください'),
  phone: z.string().optional(),
  content: z.string().optional(), // 備考・問い合わせ内容など
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = contactSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, errors: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { companyName, contactName, email, phone, content } = validation.data;

    // Service Role Keyを使って書き込み権限を持つクライアントを作成
    // 環境変数が設定されていることを前提とする
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseServiceKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is missing');
        return NextResponse.json(
            { success: false, message: 'Server configuration error' },
            { status: 500 }
        );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabaseAdmin.from('contacts').insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      content,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { success: false, message: 'データの保存に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact API error:', error);
    return NextResponse.json(
      { success: false, message: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}

