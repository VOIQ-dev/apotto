import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/stripeClient";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const result = await handleStripeWebhook(rawBody, signature);
    return NextResponse.json({ ok: result.ok });
  } catch (error) {
    console.error("stripe webhook error", error);
    return NextResponse.json({ error: "webhook error" }, { status: 400 });
  }
}
