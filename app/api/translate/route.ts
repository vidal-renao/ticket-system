import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { denialResponse, requireActiveAiMember } from "@/lib/ai/guard";
import { translateRequestSchema } from "@/lib/ai/limits";
import { consumeAiQuota } from "@/lib/ai/quota";
import { translateSupportText } from "@/lib/ai/translate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 1. Who: an active member of an organization, read from their own profile.
  const member = await requireActiveAiMember(await createClient());
  if (!member.ok) return denialResponse(member);

  // 2. What: bounded input, checked before any budget is spent on it.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = translateRequestSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // 3. How often: per-user and per-organization quota, counted atomically.
  const quota = await consumeAiQuota(createServiceClientStatic(), {
    userId: member.userId,
    organizationId: member.organizationId,
    endpoint: "translate",
  });
  if (!quota.allowed) return denialResponse({ ok: false, ...quota });

  const translation = await translateSupportText(parsed.data.text, parsed.data.targetLanguage);
  if (!translation.ok) {
    return NextResponse.json({ error: "Translation unavailable" }, { status: 503 });
  }

  return NextResponse.json({ translatedText: translation.text });
}
