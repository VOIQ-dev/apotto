import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type RequestBody = {
  viewer_email?: string;
  viewerEmail?: string;
  email?: string;
  session_id?: string;
  sessionId?: string;
};

// 30分ルールのフォールバック用
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function extractViewerEmail(body: RequestBody): string {
  return String(body.viewer_email ?? body.viewerEmail ?? body.email ?? "")
    .trim()
    .toLowerCase();
}

function extractSessionId(body: RequestBody): string {
  return String(body.session_id ?? body.sessionId ?? "").trim();
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token) {
      return NextResponse.json(
        { error: "トークンが指定されていません" },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const viewerEmail = extractViewerEmail(body);
    const sessionId = extractSessionId(body);

    if (!viewerEmail) {
      return NextResponse.json(
        { error: "viewer_email は必須です" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();
    const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "pdf-assets";

    // PDF送信ログ取得
    const { data: sendLog, error: dbError } = await supabase
      .from("pdf_send_logs")
      .select(
        "id, company_id, pdf_id, is_revoked, created_at, pdf:pdfs(storage_path, original_filename, size_bytes, is_deleted)",
      )
      .eq("token", token)
      .maybeSingle();

    if (dbError || !sendLog) {
      return NextResponse.json(
        { error: "PDFが見つかりません" },
        { status: 404 },
      );
    }

    // Supabase の埋め込み結果は型的に配列扱いになることがあるため、単体に正規化する
    const pdfEmbedded = (sendLog as { pdf?: unknown }).pdf;
    const pdfDoc = (
      Array.isArray(pdfEmbedded) ? pdfEmbedded[0] : pdfEmbedded
    ) as
      | {
          storage_path?: unknown;
          original_filename?: unknown;
          size_bytes?: unknown;
          is_deleted?: unknown;
        }
      | null
      | undefined;

    if (sendLog.is_revoked || Boolean(pdfDoc?.is_deleted)) {
      return NextResponse.json(
        { error: "この資料は削除されました" },
        { status: 410 },
      );
    }

    const storagePath = String(pdfDoc?.storage_path ?? "").trim();
    if (!storagePath) {
      return NextResponse.json(
        { error: "PDFの参照先が不正です" },
        { status: 500 },
      );
    }

    // Signed URL（1時間有効）
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("[pdf/open] Failed to create signed URL:", signedUrlError);
      return NextResponse.json(
        { error: "署名付きURLの生成に失敗しました" },
        { status: 500 },
      );
    }

    const nowIso = new Date().toISOString();

    // 既存のセッション情報を確認
    const { data: existing } = await supabase
      .from("pdf_open_events")
      .select("last_session_id, last_seen_at")
      .eq("pdf_send_log_id", sendLog.id)
      .eq("viewer_email", viewerEmail)
      .maybeSingle();

    // セッション判定（session_idがあれば正確に、なければ30分ルール）
    let isNewSession: boolean;
    if (sessionId) {
      // session_idがある場合: 正確に判定
      isNewSession =
        !existing?.last_session_id || existing.last_session_id !== sessionId;
    } else {
      // session_idがない場合: 30分ルールでフォールバック
      const lastSeen = existing?.last_seen_at;
      isNewSession =
        !lastSeen ||
        Date.now() - new Date(lastSeen).getTime() > THIRTY_MINUTES_MS;
    }

    // 初回開封の場合、pdf_send_logs.first_opened_atを更新
    if (!existing) {
      const { error: updateError } = await supabase
        .from("pdf_send_logs")
        .update({ first_opened_at: nowIso })
        .eq("id", sendLog.id)
        .is("first_opened_at", null);

      if (updateError) {
        console.error("[pdf/open] first_opened_at update failed", updateError);
      }
    }

    // 新規セッションなら閲覧回数をインクリメント
    if (isNewSession) {
      const { error: rpcError } = await supabase.rpc("increment_open_count", {
        log_id: sendLog.id,
      });
      if (rpcError) {
        console.error("[pdf/open] increment_open_count failed", rpcError);
      }
    }

    // 開封イベント記録（session_idを含める）
    const { error: upsertError } = await supabase
      .from("pdf_open_events")
      .upsert(
        {
          company_id: (sendLog as { company_id?: unknown }).company_id ?? null,
          pdf_send_log_id: sendLog.id,
          pdf_id: sendLog.pdf_id,
          viewer_email: viewerEmail,
          opened_at: existing ? undefined : nowIso, // 初回のみ設定
          last_seen_at: nowIso,
          read_percentage_max: existing ? undefined : 0,
          max_page_reached: existing ? undefined : 1,
          elapsed_seconds_max: existing ? undefined : 0,
          last_session_id: sessionId || null,
        },
        { onConflict: "pdf_send_log_id,viewer_email", ignoreDuplicates: false },
      );

    if (upsertError) {
      console.error("[pdf/open] upsert failed", upsertError);
    }

    return NextResponse.json({
      success: true,
      pdf: {
        id: sendLog.pdf_id,
        filename: String(pdfDoc?.original_filename ?? ""),
        size: Number(pdfDoc?.size_bytes ?? 0),
        createdAt: sendLog.created_at,
        signedUrl: signedUrlData.signedUrl,
        token,
      },
    });
  } catch (err) {
    console.error("[pdf/open] Unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
