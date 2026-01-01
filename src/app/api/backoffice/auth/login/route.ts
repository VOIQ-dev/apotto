import { NextRequest, NextResponse } from "next/server";

import { setBackofficeAuthCookie } from "@/lib/backofficeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  username?: string;
  password?: string;
};

function getBackofficeCredentials() {
  const username =
    process.env.BACKOFFICE_USERNAME ||
    process.env.BACKOFFICE_USER ||
    "VOIQ-2025";
  const password = process.env.BACKOFFICE_PASSWORD || "VOIQ-2025";
  return { username, password };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const inputUser = String(body.username ?? "").trim();
    const inputPass = String(body.password ?? "");

    if (!inputUser || !inputPass) {
      return NextResponse.json(
        { error: "username と password は必須です" },
        { status: 400 },
      );
    }

    const { username, password } = getBackofficeCredentials();
    if (inputUser !== username || inputPass !== password) {
      return NextResponse.json(
        { error: "ユーザー名またはパスワードが正しくありません" },
        { status: 401 },
      );
    }

    const res = NextResponse.json({ success: true });
    setBackofficeAuthCookie(res);
    return res;
  } catch (err) {
    console.error("[backoffice/auth/login] Unexpected error", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました" },
      { status: 500 },
    );
  }
}
