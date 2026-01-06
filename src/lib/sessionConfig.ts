/**
 * セッション管理の設定
 * 同時ログイン制限のためのセッションID管理
 */

export const SESSION_COOKIE_NAME = "apotto_session_id";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7日間
};
