"use server";

import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { requireActiveAiMember } from "@/lib/ai/guard";
import { translateActionSchema } from "@/lib/ai/limits";
import { consumeAiQuota } from "@/lib/ai/quota";
import { translateSupportText } from "@/lib/ai/translate";

/**
 * Same gate as /api/translate -- active membership, bounded input, quota --
 * and the same provider call (lib/ai/translate.ts). Errors are generic on
 * purpose: this result is rendered in a browser.
 */
export async function translateText(
  text: string,
  targetLocale: string
): Promise<{ translation: string } | { error: string }> {
  const member = await requireActiveAiMember(await createClient());
  if (!member.ok) return { error: member.error };

  const parsed = translateActionSchema.safeParse({ text, targetLanguage: targetLocale });
  if (!parsed.success) return { error: "Invalid input" };

  const quota = await consumeAiQuota(createServiceClientStatic(), {
    userId: member.userId,
    organizationId: member.organizationId,
    endpoint: "translate_action",
  });
  if (!quota.allowed) {
    return {
      error:
        quota.status === 429
          ? "Too many requests"
          : quota.status === 403
            ? "Forbidden"
            : "Translation unavailable",
    };
  }

  const translation = await translateSupportText(parsed.data.text, parsed.data.targetLanguage);
  if (!translation.ok) return { error: "Translation unavailable" };
  return { translation: translation.text };
}
