import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripeClient";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { companyId, planInterval, email } = body as {
      companyId?: string;
      planInterval?: "3m" | "6m" | "12m";
      email?: string;
    };

    if (!companyId || !planInterval) {
      return NextResponse.json(
        { error: "companyId と planInterval は必須です" },
        { status: 400 },
      );
    }

    const session = await createCheckoutSession({
      companyId,
      planInterval,
      email,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      enabled: session.enabled,
      message: session.enabled
        ? undefined
        : "Stripeは未接続のためスタブレスポンスです",
    });
  } catch (error) {
    console.error("checkout error", error);
    return NextResponse.json(
      { error: "決済セッションの作成に失敗しました" },
      { status: 500 },
    );
  }
}
