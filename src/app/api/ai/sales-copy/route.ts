import { NextRequest } from "next/server";

import { generateSalesCopy } from "@/lib/openaiClient";
import { crawlAndSummarizeSafe } from "@/lib/crawler";
import {
  normalizeWithPlaceholder,
  resolvePlaceholder,
} from "@/lib/placeholders";
import { ProductContext, sanitizeProductContext } from "@/lib/productContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
    meetingUrl?: string;
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
  tone?: "friendly" | "formal" | "casual";
  language?: "ja" | "en";
  productContext?: ProductContext;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  try {
    const sender = validateSender(body.sender);
    const recipient = validateRecipient(body.recipient);
    const productContext = sanitizeProductContext(body.productContext);
    console.info("[SalesCopyAPI] Request validated", {
      homepageUrl: recipient.homepageUrl,
      tone: body.tone,
      language: body.language,
      notesLength: body.notes?.length ?? 0,
      attachments: body.attachments?.length ?? 0,
    });

    // 複数ページをクローリングして企業情報を構造的に抽出
    const siteSummary = await crawlAndSummarizeSafe(recipient.homepageUrl, {
      maxPages: 5,
      maxDepth: 2,
      sameOriginOnly: true,
      timeout: 8000,
    });

    let text: string | null = null;
    try {
      const result = await generateSalesCopy({
        sender,
        recipient,
        homepageUrl: recipient.homepageUrl,
        siteSummary,
        notes: body.notes,
        attachments: sanitizeAttachments(body.attachments),
        tone: body.tone,
        language: body.language,
        productContext,
      });
      text = normalizeOutput(result.text, {
        companyName: sender.companyName,
        fullName: sender.fullName,
        subject: sender.subject,
        email: sender.email,
        phone: sender.phone,
      });
    } catch (error) {
      console.error("[SalesCopyAPI] OpenAI generation failed, falling back", {
        homepageUrl: recipient.homepageUrl,
        error: error instanceof Error ? error.message : "unknown OpenAI error",
      });
      // OpenAI失敗時も500にせず、ローカルテンプレでフォールバック生成
      text = composeFallbackCopy({
        sender,
        recipient,
        siteSummary,
        attachments: sanitizeAttachments(body.attachments),
        notes: body.notes,
      });
    }

    return createJsonResponse({
      success: true,
      message: text,
      meta: { characters: text.length, sourceUrl: recipient.homepageUrl },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました。";
    const status = error instanceof ValidationError ? 400 : 500;
    return createJsonResponse({ success: false, message }, status);
  }
}

function createJsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validateSender(sender: RequestBody["sender"]): NonNullable<
  RequestBody["sender"]
> & {
  companyName: string;
  fullName: string;
  email: string;
  subject: string;
} {
  if (!sender) {
    throw new ValidationError("sender が指定されていません。");
  }

  return {
    companyName: normalizeWithPlaceholder(sender.companyName),
    department: normalizeWithPlaceholder(sender.department),
    title: normalizeWithPlaceholder(sender.title),
    fullName: normalizeWithPlaceholder(sender.fullName),
    email: normalizeWithPlaceholder(sender.email),
    phone: normalizeWithPlaceholder(sender.phone),
    subject: normalizeWithPlaceholder(sender.subject),
    meetingUrl: sender.meetingUrl?.trim() || undefined,
  };
}

function validateRecipient(
  recipient: RequestBody["recipient"],
): Required<Pick<NonNullable<RequestBody["recipient"]>, "homepageUrl">> &
  Omit<NonNullable<RequestBody["recipient"]>, "homepageUrl"> {
  if (!recipient) {
    throw new ValidationError("recipient が指定されていません。");
  }
  const homepageUrl = recipient.homepageUrl?.trim();
  if (!homepageUrl) {
    throw new ValidationError("recipient.homepageUrl は必須です。");
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
  attachments: RequestBody["attachments"],
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

function normalizeOutput(
  text: string,
  sender: {
    companyName: string;
    fullName: string;
    subject: string;
    email?: string;
    phone?: string;
  },
) {
  const trimmed = text.trim();
  const hasSubject = /^件名\s*:/m.test(trimmed);
  const hasBody = /本文\s*:/m.test(trimmed);
  let out = trimmed;
  const companyName = resolvePlaceholder(sender.companyName, "弊社");
  const fullName = resolvePlaceholder(sender.fullName, "担当者");
  const defaultSubject = `${companyName}のご提案`;
  const subjectLine = resolvePlaceholder(sender.subject, defaultSubject);
  if (!hasSubject) {
    out = `件名: ${subjectLine}\n\n` + out;
  }
  if (!hasBody) {
    out = out.replace(/^件名\s*:.+$/m, (line) => `${line}\n本文:`);
  }
  // 本文の末尾が読点/句点等で終わらなければ丁寧な締めと署名を追加
  const email =
    sender.email && sender.email !== "{{MISSING}}"
      ? `\nEmail: ${sender.email}`
      : "";
  const phone =
    sender.phone && sender.phone !== "{{MISSING}}"
      ? `\nTEL: ${sender.phone}`
      : "";
  const closing = `\n\n===================\n${companyName}\n${fullName}${email}${phone}\n===================`;
  if (!/[。．！!？?」』）)\]]\s*$/.test(out)) {
    out = out + "。";
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
  const recipientCompany = resolvePlaceholder(recipient.companyName, "貴社");
  const greeting = recipientContact
    ? `${recipientContact}様`
    : recipientDepartment
      ? `${recipientDepartment}ご担当者様`
      : `${recipientCompany}ご担当者様`;

  const senderCompany = resolvePlaceholder(sender.companyName, "弊社");
  const senderName = resolvePlaceholder(sender.fullName, "担当者名未設定");
  const subject =
    resolvePlaceholder(sender.subject) ||
    `【${recipientCompany}向け】業務効率化のご提案`;

  // サイト要約から具体的な情報を抽出
  const sitePreview = siteSummary.slice(0, 150).replace(/\n+/g, " ");

  const attachSection =
    attachments.length > 0
      ? `\n\n━━━━━━━━━━━━━━━\n■ 資料\n${attachments.map((a) => `・${a.name}\n  ${a.url}`).join("\n")}\n━━━━━━━━━━━━━━━`
      : "";

  const notesSection = notes?.trim() ? `\n\n【補足】\n${notes.trim()}` : "";

  const body = `${greeting}

お世話になっております。${senderCompany}の${senderName}です。
突然のご連絡となり誠に恐れ入ります。

貴社のWebサイトを拝見し、${sitePreview}という点に大変興味を持ちました。

━━━━━━━━━━━━━━━
■ ご相談概要
弊社では、同業界の企業様に対して業務効率化や生産性向上のご支援をさせていただいており、
貴社にもお役立ていただける可能性があると考え、ご連絡差し上げました。${attachSection}
━━━━━━━━━━━━━━━
${notesSection}

少しでもご興味がございましたら、
オンラインにてご説明させていただきたく存じます。

以上、お手数ですが、ご確認のほどよろしくお願い申し上げます。`;

  return `件名: ${subject}\n\n本文:\n${body}`;
}
