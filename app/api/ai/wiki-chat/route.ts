import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { summarizeProviderError } from "@/lib/ai/provider-error";
import { denialResponse, requireActiveAiMember } from "@/lib/ai/guard";
import { wikiChatRequestSchema } from "@/lib/ai/limits";
import { consumeAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a Swiss IT support assistant for HelpDesk AI.
Answer in the user's language (DE/EN/ES).
Be concise, professional, and solution-oriented.
Help users with IT support questions and guide them through common troubleshooting steps.
If you cannot solve the issue, advise the user to wait for an available agent.`;

/**
 * The only failure body the browser ever sees. Provider errors (billing state,
 * request ids, rate limits) stay in the server log (AGENTS.md rule 10); the
 * chat panel shows its own translated "not available" message for this code.
 */
const UNAVAILABLE = { error: "assistant_unavailable" } as const;

function logProviderFailure(stage: string, error: unknown) {
  // Status and error class only — never the message or the conversation.
  console.error("[wiki-chat] AI provider unavailable", { stage, ...summarizeProviderError(error) });
}

export async function POST(request: Request) {
  // Active member of an organization, read from the caller's own profile.
  const member = await requireActiveAiMember(await createClient());
  if (!member.ok) return denialResponse(member);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Bounded history, and only user/assistant turns: the system prompt is the
  // server's. Unknown keys (the panel also sends `locale`) are dropped.
  const parsed = wikiChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { messages } = parsed.data;

  // Fail closed without configuration instead of letting the SDK throw.
  if (!process.env.ANTHROPIC_API_KEY) {
    logProviderFailure("config", new Error("ANTHROPIC_API_KEY missing"));
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }

  // Counted only once the request could actually be served. A quota store
  // that cannot answer is the same generic 503 the panel already understands.
  const quota = await consumeAiQuota(createServiceClientStatic(), {
    userId: member.userId,
    organizationId: member.organizationId,
    endpoint: "wiki_chat",
  });
  if (!quota.allowed) return denialResponse({ ok: false, ...quota });

  let stream: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>;
  try {
    const client = new Anthropic();
    // Errors such as an exhausted credit balance surface here, before any
    // byte has been streamed, so the client gets a clean 503.
    stream = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    });
  } catch (error) {
    logProviderFailure("request", error);
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (error) {
        // Mid-stream failure: end the stream; an empty or cut answer is
        // treated as unavailable by the chat panel.
        logProviderFailure("stream", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
