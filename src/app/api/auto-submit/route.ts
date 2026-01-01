import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

// Railway のワーカーURL（環境変数で設定）
const WORKER_URL = process.env.AUTO_SUBMIT_WORKER_URL;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, company, person, name, email, phone, subject, message, debug } =
    body ?? {};

  if (!url || typeof url !== "string") {
    return new Response(
      JSON.stringify({
        success: false,
        logs: ["Invalid url"],
        note: "url is required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ワーカーURLが設定されていない場合はエラー
  if (!WORKER_URL) {
    console.error("[auto-submit] AUTO_SUBMIT_WORKER_URL is not configured");
    return new Response(
      JSON.stringify({
        success: false,
        logs: ["Worker URL not configured"],
        note: "AUTO_SUBMIT_WORKER_URL environment variable is required",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Railway ワーカーにリクエストを転送
    const workerResponse = await fetch(`${WORKER_URL}/auto-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        company,
        person,
        name,
        email,
        phone,
        subject,
        message,
        debug,
      }),
    });

    const result = await workerResponse.json();

    return new Response(JSON.stringify(result), {
      status: workerResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    console.error(`[auto-submit] Worker request failed: ${msg}`);
    return new Response(
      JSON.stringify({
        success: false,
        logs: ["Worker request failed", msg],
        note: `Failed to connect to worker: ${msg}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
