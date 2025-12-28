import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import { formatTokyoDay, incrementPdfDailyMetrics } from "@/lib/pdfTracking";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendLogInput = {
  pdf_id?: string;
  pdfId?: string;
  token?: string;
  recipient_company_name?: string;
  recipientCompanyName?: string;
  recipient_homepage_url?: string;
  recipientHomepageUrl?: string;
  recipient_email?: string;
  recipientEmail?: string;
  sent_at?: string;
  sentAt?: string;
};

type RequestBody = {
  log?: SendLogInput;
  logs?: SendLogInput[];
} & SendLogInput;

function normalizeOne(input: SendLogInput) {
  const pdfId = String(input.pdf_id ?? input.pdfId ?? "").trim();
  const token = String(input.token ?? "").trim();
  const recipientCompanyName = String(
    input.recipient_company_name ?? input.recipientCompanyName ?? "",
  ).trim();
  const recipientHomepageUrl = String(
    input.recipient_homepage_url ?? input.recipientHomepageUrl ?? "",
  ).trim();
  const recipientEmail = String(
    input.recipient_email ?? input.recipientEmail ?? "",
  )
    .trim()
    .toLowerCase();

  const rawSentAt = String(input.sent_at ?? input.sentAt ?? "").trim();
  const sentAtIso =
    rawSentAt && !Number.isNaN(Date.parse(rawSentAt))
      ? new Date(rawSentAt).toISOString()
      : new Date().toISOString();

  return {
    pdfId,
    token,
    recipientCompanyName: recipientCompanyName || null,
    recipientHomepageUrl: recipientHomepageUrl || null,
    recipientEmail: recipientEmail || null,
    sentAtIso,
  };
}

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
      return json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!companyId) {
      return json({ error: "会社情報が紐づいていません" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const inputs: SendLogInput[] = body.logs?.length
      ? body.logs
      : body.log
        ? [body.log]
        : body.token || body.pdfId || body.pdf_id
          ? [body]
          : [];

    if (inputs.length === 0) {
      return json({ error: "logs が指定されていません" }, { status: 400 });
    }

    const normalized = inputs.map(normalizeOne);
    const invalid = normalized.find((l) => !l.pdfId || !l.token);
    if (invalid) {
      return json({ error: "pdf_id と token は必須です" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // PDFが同一会社に属していることを確認
    const pdfIds = Array.from(new Set(normalized.map((l) => l.pdfId)));
    const { data: ownedPdfs, error: pdfErr } = await supabase
      .from("pdfs")
      .select("id")
      .eq("company_id", companyId)
      .in("id", pdfIds)
      .limit(5000);
    if (pdfErr) {
      console.error("[pdf/send-log] pdf ownership check failed", pdfErr);
      return json({ error: "PDFの確認に失敗しました" }, { status: 500 });
    }
    const ownedSet = new Set(
      (ownedPdfs ?? []).map((r) => String((r as { id: unknown }).id)),
    );
    const missing = pdfIds.filter((id) => !ownedSet.has(id));
    if (missing.length > 0) {
      return json(
        {
          error: "会社に紐づかないPDFが含まれています",
          missingPdfIds: missing,
        },
        { status: 400 },
      );
    }

    // Insert send logs (one row per recipient×pdf)
    const rows = normalized.map((l) => ({
      company_id: companyId,
      pdf_id: l.pdfId,
      token: l.token,
      recipient_company_name: l.recipientCompanyName,
      recipient_homepage_url: l.recipientHomepageUrl,
      recipient_email: l.recipientEmail,
      sent_at: l.sentAtIso,
      sent_channel: "form",
      is_revoked: false,
    }));

    const { error: insertError } = await supabase
      .from("pdf_send_logs")
      .insert(rows);
    if (insertError) {
      console.error("[pdf/send-log] insert failed", insertError);
      return json({ error: "送信ログの保存に失敗しました" }, { status: 500 });
    }

    // 閲覧用URLを生成
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const viewUrls = rows.map((row) => ({
      token: row.token,
      recipient_company_name: row.recipient_company_name,
      recipient_email: row.recipient_email,
      url: `${baseUrl}/pdf/${row.token}`,
    }));

    // ログ出力
    console.log("[pdf/send-log] 閲覧用URL一覧:");
    viewUrls.forEach((item, index) => {
      console.log(
        `  [${index + 1}] ${item.recipient_company_name || "(企業名なし)"} (${item.recipient_email || "(メールなし)"}) → ${item.url}`,
      );
    });

    // Increment daily metrics (sent_count) grouped by day+pdf
    const grouped = new Map<
      string,
      { day: string; pdfId: string; count: number }
    >();
    for (const l of normalized) {
      const day = formatTokyoDay(new Date(l.sentAtIso));
      const key = `${day}:${l.pdfId}`;
      const prev = grouped.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        grouped.set(key, { day, pdfId: l.pdfId, count: 1 });
      }
    }

    for (const g of grouped.values()) {
      const inc = await incrementPdfDailyMetrics(supabase, {
        day: g.day,
        pdfId: g.pdfId,
        sentDelta: g.count,
        openedDelta: 0,
      });
      if (!inc.ok) {
        console.warn(
          "[pdf/send-log] increment_pdf_daily_metrics failed",
          inc.error,
        );
      }
    }

    return json({ success: true, count: normalized.length, viewUrls });
  } catch (err) {
    console.error("[pdf/send-log] Unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
