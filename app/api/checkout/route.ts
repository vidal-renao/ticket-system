import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session for the selected plan.
 *
 * TODO: Add STRIPE_SECRET_KEY to Vercel environment variables and install stripe:
 *   npm install stripe
 *
 * Body: { planId: "starter" | "pro", annual: boolean, locale: string }
 */

const STRIPE_PRICES: Record<string, { monthly: string; annual: string }> = {
  // TODO: Replace with real Stripe price IDs from your Stripe dashboard
  starter: {
    monthly: "price_starter_monthly_placeholder",
    annual: "price_starter_annual_placeholder",
  },
  pro: {
    monthly: "price_pro_monthly_placeholder",
    annual: "price_pro_annual_placeholder",
  },
};

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to enable payments." },
      { status: 503 }
    );
  }

  const { planId, annual, locale } = await request.json() as {
    planId: string;
    annual: boolean;
    locale: string;
  };

  const prices = STRIPE_PRICES[planId];
  if (!prices) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = annual ? prices.annual : prices.monthly;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.vidallab.ch";
  const prefix = locale === "de" ? "" : `/${locale}`;

  // Optionally attach Supabase user to the checkout session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Dynamic import so the build doesn't fail if stripe is not installed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stripe: any;
  try {
    // @ts-expect-error stripe is an optional peer dependency
    const { default: Stripe } = await import("stripe");
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });
  } catch {
    return NextResponse.json(
      { error: "Stripe SDK not installed. Run: npm install stripe" },
      { status: 503 }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}${prefix}/dashboard?checkout=success`,
    cancel_url: `${appUrl}${prefix}#pricing`,
    ...(user?.email && { customer_email: user.email }),
    metadata: { supabase_user_id: user?.id ?? "", plan: planId, locale },
    subscription_data: {
      trial_period_days: 14,
    },
  });

  return NextResponse.json({ url: session.url });
}
