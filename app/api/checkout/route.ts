import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/checkout
 * Stripe Checkout — stub until STRIPE_SECRET_KEY is configured.
 *
 * To activate:
 *   1. npm install stripe
 *   2. Add STRIPE_SECRET_KEY to Vercel environment variables
 *   3. Replace this stub with the full Stripe session logic
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Payments not yet configured. Contact support to upgrade your plan." },
    { status: 503 }
  );
}
