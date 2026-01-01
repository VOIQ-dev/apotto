import Stripe from "stripe";
import { isStripeEnabled } from "./featureFlags";
import { createSupabaseServiceClient } from "./supabaseServer";

type PlanInterval = "3m" | "6m" | "12m";

type CheckoutInput = {
  companyId: string;
  planInterval: PlanInterval;
  email?: string;
};

type CheckoutSession = {
  id: string;
  url: string;
  enabled: boolean;
};

const stripeApiVersion =
  "2025-11-17.clover" satisfies Stripe.StripeConfig["apiVersion"];

function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY が未設定です");
  }
  return new Stripe(secret, { apiVersion: stripeApiVersion });
}

function priceIdForInterval(interval: PlanInterval): string {
  const mapping: Record<PlanInterval, string | undefined> = {
    "3m": process.env.STRIPE_PRICE_ID_3M,
    "6m": process.env.STRIPE_PRICE_ID_6M,
    "12m": process.env.STRIPE_PRICE_ID_12M,
  };
  const price = mapping[interval];
  if (!price) throw new Error(`Price ID for ${interval} が未設定です`);
  return price;
}

function resolveBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * Stripe未設定時はモックレスポンスを返す。
 */
export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutSession> {
  if (!isStripeEnabled()) {
    return {
      id: "test_session_mock",
      url: "/billing/success?session_id=test_session_mock&mode=disabled",
      enabled: false,
    };
  }

  const stripe = getStripe();
  const priceId = priceIdForInterval(input.planInterval);
  const baseUrl = resolveBaseUrl();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing/cancel`,
    customer_email: input.email,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: 30, // トライアル1ヶ月（カードなし想定）
      metadata: {
        companyId: input.companyId,
        planInterval: input.planInterval,
      },
    },
  };

  const metadata: Stripe.MetadataParam = {
    companyId: input.companyId,
    planInterval: input.planInterval,
  };
  if (input.email) {
    metadata.email = input.email;
  }
  params.metadata = metadata;

  const session = await stripe.checkout.sessions.create(params);

  return {
    id: session.id,
    url: session.url ?? "",
    enabled: true,
  };
}

type WebhookResult = { ok: boolean };

function intervalFromSubscription(
  sub: Stripe.Subscription,
): PlanInterval | null {
  const item = sub.items.data[0];
  const interval = item?.plan?.interval;
  const count = item?.plan?.interval_count ?? 1;
  if (interval === "month") {
    if (count === 3) return "3m";
    if (count === 6) return "6m";
    if (count === 12) return "12m";
  }
  if (interval === "year") return "12m";
  return null;
}

async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  metadata?: Record<string, string | undefined>,
) {
  const companyId = metadata?.companyId || sub.metadata?.companyId;
  const email = metadata?.email || sub.metadata?.email;
  if (!companyId) {
    console.warn("[stripe] companyId missing on subscription", sub.id);
    return;
  }

  const planInterval =
    (metadata?.planInterval as PlanInterval) ||
    (sub.metadata?.planInterval as PlanInterval) ||
    intervalFromSubscription(sub);

  // 最新APIで型から落ちているフィールドを安全に参照
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySub = sub as any;
  const currentPeriodStart = anySub.current_period_start as
    | number
    | null
    | undefined;
  const currentPeriodEnd = anySub.current_period_end as
    | number
    | null
    | undefined;
  const canceledAt = anySub.canceled_at as number | null | undefined;
  const cancelAtPeriodEnd = anySub.cancel_at_period_end as boolean | undefined;
  const trialEnd = anySub.trial_end as number | null | undefined;

  const supabase = createSupabaseServiceClient();
  await supabase.from("subscriptions").upsert(
    {
      company_id: companyId,
      stripe_customer_id:
        typeof sub.customer === "string" ? sub.customer : null,
      stripe_subscription_id: sub.id,
      plan_interval: planInterval ?? "3m",
      status: sub.status,
      trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
      current_period_start: currentPeriodStart
        ? new Date(currentPeriodStart * 1000).toISOString()
        : null,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: cancelAtPeriodEnd ?? false,
      canceled_at: canceledAt
        ? new Date(canceledAt * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  // 自動アカウント発行（存在しない場合のみ招待状態で作成）
  if (email) {
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("email", email)
      .maybeSingle();

    if (!existing) {
      await supabase.from("accounts").insert({
        company_id: companyId,
        email,
        status: "invited",
        invited_at: new Date().toISOString(),
        role: "admin",
      });
    }
  }
}

/**
 * Webhookハンドラ。Stripe無効時は何もしない。
 */
export async function handleStripeWebhook(
  payload: string,
  signature: string | null,
): Promise<WebhookResult> {
  if (!isStripeEnabled()) {
    return { ok: true };
  }

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET が未設定です");
  }

  const stripe = getStripe();
  if (!signature) {
    throw new Error("Stripe-Signature ヘッダがありません");
  }

  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    endpointSecret,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertSubscriptionFromStripe(sub, {
          companyId: session.metadata?.companyId,
          planInterval: session.metadata?.planInterval,
          email: session.metadata?.email,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripe(sub, sub.metadata);
      break;
    }
    default:
      // ignore others
      break;
  }

  return { ok: true };
}
