"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const LOCALE_NAMES: Record<string, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
};

export async function translateText(
  text: string,
  targetLocale: string
): Promise<{ translation: string } | { error: string }> {
  if (!text.trim()) return { error: "Empty text" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const targetLang = LOCALE_NAMES[targetLocale] ?? "English";
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Translate the following IT support text to ${targetLang}.

STRICT INSTRUCTIONS:
- Return ONLY the translated text — no preamble, no explanation, no quotes
- Preserve original formatting: line breaks, lists, punctuation
- Translate faithfully; do not summarize, rephrase, or omit content
- Context: professional IT helpdesk (Swiss SME)
- Privacy: translate as-is; do not reproduce, store, or comment on any personal identifiers (names, emails, IPs)

TEXT:
${text}`,
      },
    ],
  });

  if (response.content[0].type !== "text") return { error: "AI returned no text" };
  return { translation: response.content[0].text.trim() };
}
