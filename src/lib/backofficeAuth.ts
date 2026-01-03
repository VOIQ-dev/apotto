import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as jose from "jose";

export const BACKOFFICE_AUTH_COOKIE = "backoffice_auth";

/**
 * JWT署名用のシークレットを取得
 */
function getJWTSecret(): Uint8Array {
  const secret = process.env.BACKOFFICE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "BACKOFFICE_JWT_SECRET が設定されていません。64文字以上のランダムな文字列を設定してください。",
    );
  }
  if (secret.length < 32) {
    throw new Error("BACKOFFICE_JWT_SECRET は32文字以上である必要があります。");
  }
  return new TextEncoder().encode(secret);
}

/**
 * JWT トークンを生成
 */
export async function createBackofficeAuthToken(
  username: string,
): Promise<string> {
  const secret = getJWTSecret();

  return await new jose.SignJWT({ username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 7日間有効
    .setJti(crypto.randomUUID()) // ユニークなトークンID
    .sign(secret);
}

/**
 * JWT トークンを検証
 */
export async function verifyBackofficeAuthToken(
  token: string,
): Promise<{ valid: boolean; username?: string }> {
  try {
    const secret = getJWTSecret();
    const { payload } = await jose.jwtVerify(token, secret);

    if (payload.role !== "admin") {
      return { valid: false };
    }

    return {
      valid: true,
      username: String(payload.username ?? ""),
    };
  } catch (error) {
    // トークンが無効、期限切れ、署名が不正など
    return { valid: false };
  }
}

/**
 * リクエストからBackoffice認証状態を確認
 */
export async function isBackofficeAuthenticated(
  request: NextRequest,
): Promise<boolean> {
  const token = request.cookies.get(BACKOFFICE_AUTH_COOKIE)?.value;
  if (!token) {
    return false;
  }

  const result = await verifyBackofficeAuthToken(token);
  return result.valid;
}

/**
 * Backoffice認証が必要なエンドポイントで使用
 * 認証されていない場合はエラーレスポンスを返す
 */
export async function requireBackofficeAuth(
  request: NextRequest,
): Promise<NextResponse | null> {
  const isAuthenticated = await isBackofficeAuthenticated(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Backoffice認証Cookieを設定（JWTトークンを含む）
 */
export function setBackofficeAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(BACKOFFICE_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Backoffice認証Cookieをクリア
 */
export function clearBackofficeAuthCookie(response: NextResponse) {
  response.cookies.set(BACKOFFICE_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
