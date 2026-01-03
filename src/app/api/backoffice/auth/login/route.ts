import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { timingSafeEqual } from "crypto";

import {
  setBackofficeAuthCookie,
  createBackofficeAuthToken,
} from "@/lib/backofficeAuth";
import { BackofficeLoginSchema, formatZodErrors } from "@/lib/schemas";
import {
  checkRateLimit,
  RateLimitPresets,
  addRateLimitHeaders,
} from "@/lib/rateLimit";
import { ErrorMessages, createErrorResponse, logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Backoffice認証情報を取得
 * デフォルト値は削除され、環境変数の設定が必須になりました
 */
function getBackofficeCredentials() {
  const username = process.env.BACKOFFICE_USERNAME;
  const passwordHash = process.env.BACKOFFICE_PASSWORD_HASH;

  // デバッグ用ログ
  console.log("[DEBUG] BACKOFFICE_USERNAME:", username);
  console.log(
    "[DEBUG] BACKOFFICE_PASSWORD_HASH:",
    passwordHash ? `${passwordHash.substring(0, 20)}...` : "undefined",
  );

  if (!username || !passwordHash) {
    throw new Error(
      "BACKOFFICE_USERNAME と BACKOFFICE_PASSWORD_HASH を設定してください。" +
        "\nパスワードハッシュの生成方法: " +
        "\nnode -e \"require('bcryptjs').hash('your-password', 10).then(console.log)\"",
    );
  }

  return { username, passwordHash };
}

/**
 * タイミング攻撃対策のための定数時間文字列比較
 * 文字列長が異なる場合でも一定時間かけて比較
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  // 長い方の長さに合わせてパディング
  const maxLen = Math.max(a.length, b.length);
  const aPadded = a.padEnd(maxLen, "\0");
  const bPadded = b.padEnd(maxLen, "\0");

  try {
    return timingSafeEqual(Buffer.from(aPadded), Buffer.from(bPadded));
  } catch {
    // バッファ長が異なる場合（理論上は発生しないはず）
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // レート制限チェック（管理者ログインは厳格に）
    const rateLimitResult = checkRateLimit(request, RateLimitPresets.strict);

    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        createErrorResponse(ErrorMessages.RATE_LIMIT.TOO_MANY_LOGIN_ATTEMPTS, {
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        }),
        { status: 429 },
      );
      addRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const rawBody = await request.json().catch(() => ({}));

    // Zodバリデーション
    const validation = BackofficeLoginSchema.safeParse(rawBody);

    if (!validation.success) {
      const { message, fields } = formatZodErrors(validation.error);
      const response = NextResponse.json(
        { error: message, errors: fields },
        { status: 400 },
      );
      addRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const { username: inputUser, password: inputPass } = validation.data;

    const { username, passwordHash } = getBackofficeCredentials();

    // デバッグ用ログ
    console.log("[DEBUG] Input username:", inputUser);
    console.log("[DEBUG] Expected username:", username);
    console.log("[DEBUG] Input password:", inputPass);

    // タイミング攻撃対策: ユーザー名も定数時間比較
    const usernameMatch = timingSafeStringEqual(inputUser, username);
    console.log("[DEBUG] Username match:", usernameMatch);

    // bcryptで安全にパスワード検証（内部的に定数時間比較を実装）
    const passwordMatch = await compare(inputPass, passwordHash);
    console.log("[DEBUG] Password match:", passwordMatch);

    // 両方がマッチしない場合はエラー（短絡評価を使わない）
    if (!usernameMatch || !passwordMatch) {
      // タイミング攻撃を防ぐため、どちらが間違っているかを示さない
      return NextResponse.json(
        createErrorResponse(ErrorMessages.AUTH.INVALID_CREDENTIALS),
        { status: 401 },
      );
    }

    // JWT トークンを生成
    const token = await createBackofficeAuthToken(username);

    const res = NextResponse.json({ success: true });
    setBackofficeAuthCookie(res, token);
    addRateLimitHeaders(res.headers, rateLimitResult);
    return res;
  } catch (err) {
    logError("backoffice/auth/login", err);
    return NextResponse.json(
      createErrorResponse(ErrorMessages.SERVER.INTERNAL_ERROR),
      { status: 500 },
    );
  }
}
