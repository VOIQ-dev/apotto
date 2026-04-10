import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabaseServer";
import {
  applyAuthCookies,
  getAccountContextFromRequest,
} from "@/lib/routeAuth";

const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "pdf-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const body = (await request.json().catch(() => ({}))) as {
      storagePath?: string;
      filename?: string;
      size?: number;
    };

    const storagePath = body.storagePath?.trim();
    const filename = body.filename?.trim();
    const size = body.size ?? 0;

    if (!storagePath || !filename) {
      return json(
        { error: "storagePath と filename は必須です" },
        { status: 400 },
      );
    }

    if (!storagePath.startsWith(`${companyId}/`)) {
      return json({ error: "不正なストレージパスです" }, { status: 403 });
    }

    const supabase = createSupabaseServiceClient();

    const { data: fileList, error: listError } = await supabase.storage
      .from(bucketName)
      .list(companyId, {
        search: storagePath.replace(`${companyId}/`, ""),
        limit: 1,
      });

    if (listError || !fileList || fileList.length === 0) {
      console.error(
        "[pdf/confirm-upload] file not found in storage:",
        listError,
      );
      return json(
        {
          error:
            "ストレージにファイルが見つかりません。アップロードが完了していない可能性があります。",
        },
        { status: 404 },
      );
    }

    const { data: inserted, error: dbError } = await supabase
      .from("pdfs")
      .insert({
        original_filename: filename,
        storage_path: storagePath,
        size_bytes: size,
        company_id: companyId,
        is_deleted: false,
      })
      .select("id, storage_path")
      .single();

    if (dbError) {
      console.error("[pdf/confirm-upload] DB insert error:", dbError);
      const { error: removeError } = await supabase.storage
        .from(bucketName)
        .remove([storagePath]);
      if (removeError) {
        console.error("[pdf/confirm-upload] Rollback failed:", removeError);
      }
      return json(
        { error: "データベースへの保存に失敗しました" },
        { status: 500 },
      );
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 3600);

    if (signedUrlError) {
      console.error("[pdf/confirm-upload] Signed URL error:", signedUrlError);
    }

    return json({
      success: true,
      id: inserted?.id ?? null,
      storagePath,
      signedUrl: signedUrlData?.signedUrl ?? null,
      filename,
      size,
    });
  } catch (err) {
    console.error("[pdf/confirm-upload] Unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
