import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5分（バッチ処理用に延長）
export const runtime = "nodejs";

// Railway のワーカーURL（環境変数で設定）
const WORKER_URL = process.env.AUTO_SUBMIT_WORKER_URL;

type BatchItem = {
  url: string;
  company?: string;
  department?: string;
  title?: string;
  person?: string;
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { items, debug } = body as { items?: BatchItem[]; debug?: boolean };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Response(
      JSON.stringify({
        error: "items array is required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ワーカーURLが設定されていない場合はエラー
  if (!WORKER_URL) {
    console.error(
      "[auto-submit/batch] AUTO_SUBMIT_WORKER_URL is not configured",
    );
    return new Response(
      JSON.stringify({
        error: "Worker URL not configured",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    console.log(
      `[auto-submit/batch] Forwarding ${items.length} items to worker`,
    );

    // Railway ワーカーにリクエストを転送（SSEをプロキシ）
    const workerResponse = await fetch(`${WORKER_URL}/auto-submit/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items, debug }),
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`[auto-submit/batch] Worker error: ${errorText}`);
      return new Response(JSON.stringify({ error: "Worker request failed" }), {
        status: workerResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SSEレスポンスをそのままプロキシ
    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");

    return new Response(workerResponse.body, {
      status: 200,
      headers,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    console.error(`[auto-submit/batch] Error: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
