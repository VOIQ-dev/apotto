import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/sesClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { to, subject, text, html, templateId, context } = body as {
      to?: string;
      subject?: string;
      text?: string;
      html?: string;
      templateId?: string;
      context?: Record<string, unknown>;
    };

    if (!to || !subject) {
      return NextResponse.json({ error: 'to と subject は必須です' }, { status: 400 });
    }

    const result = await sendEmail({ to, subject, text, html, templateId, context });

    return NextResponse.json({
      status: result.status,
      messageId: result.messageId,
      enabled: result.enabled,
      message: result.enabled ? undefined : 'SESは未接続のためスタブ送信です',
    });
  } catch (error) {
    console.error('send email error', error);
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 });
  }
}





