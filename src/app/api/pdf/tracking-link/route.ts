import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";

const SHARE_RECIPIENT_EMAIL = "share@apotto.local";

type RequestBody = {
  pdfId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const { user, companyId, cookieMutations } =
      await getAccountContextFromRequest(request);
    const json = (body: unknown, init?: { status?: number }) => {
      const res = NextResponse.json(body, { status: init?.status });
      applyAuthCookies(res, cookieMutations);
      return res;
    };

    if (!user) return json({ error: "認証が必要です" }, { status: 401 });
    if (!companyId)
      return json({ error: "会社情報が紐づいていません" }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const pdfId = body.pdfId?.trim();

    if (!pdfId) {
      return json({ error: "pdfId が指定されていません" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // PDFの存在確認（削除済みは対象外）
    const { data: pdf, error: pdfError } = await supabase
      .from("pdfs")
      .select("id, is_deleted")
      .eq("id", pdfId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (pdfError) {
      console.error("[pdf/tracking-link] PDF lookup error", pdfError);
      return json({ error: "PDFの確認に失敗しました" }, { status: 500 });
    }

    if (!pdf || pdf.is_deleted) {
      return json({ error: "PDFが見つかりません" }, { status: 404 });
    }

    // 既存の「共有用」トークンがあれば再利用
    const { data: existing, error: existingError } = await supabase
      .from("pdf_send_logs")
      .select("token, is_revoked, sent_at")
      .eq("company_id", companyId)
      .eq("pdf_id", pdfId)
      .eq("recipient_email", SHARE_RECIPIENT_EMAIL)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("[pdf/tracking-link] Token lookup error", existingError);
      return json({ error: "トークンの確認に失敗しました" }, { status: 500 });
    }

    if (existing?.token && !existing.is_revoked) {
      return json({
        success: true,
        pdfId,
        token: existing.token,
        url: `/pdf/${existing.token}`,
        reused: true,
      });
    }

    // 新規トークン発行（pdf_send_logs に登録）
    const token = crypto.randomUUID();
    const { data: inserted, error: insertError } = await supabase
      .from("pdf_send_logs")
      .insert({
        company_id: companyId,
        pdf_id: pdfId,
        token,
        recipient_email: SHARE_RECIPIENT_EMAIL,
        sent_channel: "share",
        sent_at: new Date().toISOString(),
        is_revoked: false,
      })
      .select("token")
      .single();

    if (insertError) {
      console.error("[pdf/tracking-link] Token insert error", insertError);
      return json({ error: "トークンの発行に失敗しました" }, { status: 500 });
    }

    const issuedToken = inserted?.token ?? token;
    return json({
      success: true,
      pdfId,
      token: issuedToken,
      url: `/pdf/${issuedToken}`,
      reused: false,
    });
  } catch (err) {
    console.error("[pdf/tracking-link] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
