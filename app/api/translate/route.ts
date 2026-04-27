import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const LANG_NAMES: Record<string, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { text?: string; targetLanguage?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { text, targetLanguage } = body;
  if (!text?.trim()) return NextResponse.json({ error: "Missing text" }, { status: 400 });
  if (!targetLanguage) return NextResponse.json({ error: "Missing targetLanguage" }, { status: 400 });

  const langName = LANG_NAMES[targetLanguage];
  if (!langName) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `Translate the following IT support text to ${langName}. Return only the translated text, no explanation.`,
    messages: [{ role: "user", content: text }],
  });

  if (response.content[0].type !== "text") {
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }

  return NextResponse.json({ translatedText: response.content[0].text.trim() });
}
