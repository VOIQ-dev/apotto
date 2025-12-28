import { NextRequest } from 'next/server';

import { crawlAndSummarizeSafe } from '@/lib/crawler';
import {
  sanitizeProductContext,
  type ProductContext,
} from '@/lib/productContext';
import {
  normalizeWithPlaceholder,
  resolvePlaceholder,
} from '@/lib/placeholders';
import { generateSalesCopyStream } from '@/lib/openaiClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RequestBody = {
  sender?: {
    companyName?: string;
    department?: string;
    title?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    subject?: string;
  };
  recipient?: {
    companyName?: string;
    department?: string;
    title?: string;
    contactName?: string;
    email?: string;
    homepageUrl?: string;
  };
  attachments?: Array<{
    name?: string;
    url?: string;
    token?: string;
  }>;
  notes?: string;
  tone?: 'friendly' | 'formal' | 'casual';
  language?: 'ja' | 'en';
  productContext?: ProductContext;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  try {
    const sender = validateSender(body.sender);
    const recipient = validateRecipient(body.recipient);
    const productContext = sanitizeProductContext(body.productContext);

    const attachments = sanitizeAttachments(body.attachments);

    // まずクローリングで企業情報を取得（streamはこの後に開始）
    const siteSummary = await crawlAndSummarizeSafe(recipient.homepageUrl, {
      maxPages: 5,
      maxDepth: 2,
      sameOriginOnly: true,
      timeout: 8000,
    });

    const encoder = new TextEncoder();
    const encode = (text: string) => encoder.encode(text);
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = generateSalesCopyStream({
            sender,
            recipient,
            homepageUrl: recipient.homepageUrl,
            siteSummary,
            notes: body.notes,
            attachments,
            tone: body.tone,
            language: body.language,
            productContext,
          });

          // 先頭チャンクを先読みして、OpenAI側エラー（例: quota）ならフォールバックへ切替
          const iterator = stream[Symbol.asyncIterator]();
          const first = await iterator.next();
          if (first.done) {
            controller.close();
            return;
          }
          controller.enqueue(encode(first.value));

          while (true) {
            const { done, value } = await iterator.next();
            if (done) break;
            controller.enqueue(encode(value));
          }

          controller.close();
        } catch (err) {
          // OpenAI が落ちても 500 にせず、ローカルテンプレで返す（UI側を止めない）
          console.error('[SalesCopyStreamAPI] OpenAI stream failed, fallback', err);
          const fallback = composeFallbackCopy({
            sender,
            recipient,
            siteSummary,
            attachments,
            notes: body.notes,
          });
          controller.enqueue(encode(fallback));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '不明なエラーが発生しました。';
    return new Response(message, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

function validateSender(
  sender: RequestBody['sender']
): NonNullable<RequestBody['sender']> & {
  companyName: string;
  fullName: string;
  email: string;
  subject: string;
} {
  if (!sender) {
    throw new ValidationError('sender が指定されていません。');
  }

  return {
    companyName: normalizeWithPlaceholder(sender.companyName),
    department: normalizeWithPlaceholder(sender.department),
    title: normalizeWithPlaceholder(sender.title),
    fullName: normalizeWithPlaceholder(sender.fullName),
    email: normalizeWithPlaceholder(sender.email),
    phone: normalizeWithPlaceholder(sender.phone),
    subject: normalizeWithPlaceholder(sender.subject),
  };
}

function validateRecipient(
  recipient: RequestBody['recipient']
): Required<Pick<NonNullable<RequestBody['recipient']>, 'homepageUrl'>> &
  Omit<NonNullable<RequestBody['recipient']>, 'homepageUrl'> {
  if (!recipient) {
    throw new ValidationError('recipient が指定されていません。');
  }
  const homepageUrl = recipient.homepageUrl?.trim();
  if (!homepageUrl) {
    throw new ValidationError('recipient.homepageUrl は必須です。');
  }
  return {
    ...recipient,
    homepageUrl,
    companyName: normalizeWithPlaceholder(recipient.companyName),
    department: normalizeWithPlaceholder(recipient.department),
    title: normalizeWithPlaceholder(recipient.title),
    contactName: normalizeWithPlaceholder(recipient.contactName),
    email: normalizeWithPlaceholder(recipient.email),
  };
}

function sanitizeAttachments(
  attachments: RequestBody['attachments']
): Array<{ name: string; url: string; token?: string }> {
  if (!attachments?.length) return [];
  return attachments
    .filter((attachment) => {
      const name = attachment?.name?.trim();
      const url = attachment?.url?.trim();
      return Boolean(name) && Boolean(url);
    })
    .map((attachment) => ({
      name: attachment.name!.trim(),
      url: attachment.url!.trim(),
      token: attachment.token?.trim(),
    }));
}

class ValidationError extends Error {}

function normalizeOutput(text: string, sender: {
  companyName: string;
  fullName: string;
  subject: string;
}) {
  const trimmed = text.trim();
  const hasSubject = /^件名\s*:/m.test(trimmed);
  const hasBody = /本文\s*:/m.test(trimmed);
  let out = trimmed;
  const companyName = resolvePlaceholder(sender.companyName, '弊社');
  const fullName = resolvePlaceholder(sender.fullName, '担当者');
  const defaultSubject = `${companyName}のご提案`;
  const subjectLine = resolvePlaceholder(sender.subject, defaultSubject);
  if (!hasSubject) {
    out = `件名: ${subjectLine}\n` + out;
  }
  if (!hasBody) {
    out = out.replace(/^件名\s*:.+$/m, (line) => `${line}\n本文:`);
  }
  // 本文の末尾が読点/句点等で終わらなければ丁寧な締めと署名を追加
  const closing = `\n\n何卒よろしくお願いいたします。\n${companyName}\n${fullName}`;
  if (!/[。．！!？?」』）)\]]\s*$/.test(out)) {
    out = out + '。';
  }
  if (!out.includes(companyName) || !out.includes(fullName)) {
    out = out + closing;
  }
  return out;
}

function composeFallbackCopy({
  sender,
  recipient,
  siteSummary,
  attachments = [],
  notes,
}: {
  sender: { companyName: string; fullName: string; subject: string };
  recipient: {
    companyName?: string;
    contactName?: string;
    department?: string;
  };
  siteSummary: string;
  attachments?: Array<{ name: string; url: string }>;
  notes?: string;
}) {
  const recipientContact = resolvePlaceholder(recipient.contactName);
  const recipientDepartment = resolvePlaceholder(recipient.department);
  const recipientCompany = resolvePlaceholder(recipient.companyName, '貴社');
  const greeting = recipientContact
    ? `${recipientContact}様`
    : recipientDepartment
    ? `${recipientDepartment}ご担当者様`
    : `${recipientCompany}ご担当者様`;

  const senderCompany = resolvePlaceholder(sender.companyName, '弊社');
  const senderName = resolvePlaceholder(sender.fullName, '担当者名未設定');
  const subject =
    resolvePlaceholder(sender.subject) ||
    `【${recipientCompany}向け】業務効率化のご提案`;

  // サイト要約から具体的な情報を抽出
  const sitePreview = siteSummary.slice(0, 150).replace(/\n+/g, ' ');

  const attachSection = attachments.length > 0
    ? `\n\n詳細につきましては、以下の資料をご参照ください。\n${attachments.map((a, i) => `${i + 1}. ${a.name}\n   ${a.url}`).join('\n')}`
    : '';

  const notesSection = notes?.trim() ? `\n\n【補足】\n${notes.trim()}` : '';

  const body = `${greeting}

突然のご連絡失礼いたします。
${senderCompany}の${senderName}と申します。

貴社のWebサイトを拝見し、${sitePreview}という点に大変興味を持ちました。

弊社では、同業界の企業様に対して業務効率化や生産性向上のご支援をさせていただいており、貴社にもお役立ていただける可能性があると考え、ご連絡差し上げました。${attachSection}${notesSection}

もしご興味をお持ちいただけましたら、15分程度のオンライン打ち合わせでご説明させていただけますと幸いです。

お忙しいところ恐縮ですが、ご検討のほどよろしくお願いいたします。

${senderCompany}
${senderName}`;

  return normalizeOutput(`件名: ${subject}\n\n本文:\n${body}`, sender);
}




