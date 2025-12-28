import { NextRequest } from 'next/server';

import {
  sanitizeProductContext,
  type ProductContext,
} from '@/lib/productContext';
import { normalizeWithPlaceholder } from '@/lib/placeholders';
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

    const stream = await generateSalesCopyStream({
      sender,
      recipient,
      homepageUrl: recipient.homepageUrl,
      siteSummary: body.notes ?? '',
      notes: body.notes,
      attachments: sanitizeAttachments(body.attachments),
      tone: body.tone,
      language: body.language,
      productContext,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
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




