import { z } from "zod";

/**
 * Bounds for the interactive AI endpoints (/api/translate, /api/ai/wiki-chat
 * and the translateText action). Approved in Phase 0, DECISIONS.md ADR-017.
 *
 * The request counts are enforced in PostgreSQL by hd_consume_ai_quota; the
 * size bounds are enforced here, before the provider is called, because the
 * provider bills by input size and neither endpoint had a ceiling.
 */
export const AI_LIMITS = {
  userPerHour: 30,
  userPerDay: 200,
  orgPerDay: 1000,
  maxTextChars: 5000,
  maxChatMessages: 20,
  maxChatTotalChars: 12000,
} as const;

/** The value stored in hd_ai_usage.endpoint; mirrored by a CHECK constraint. */
export type AiEndpoint = "translate" | "translate_action" | "wiki_chat";

const text = z
  .string()
  .max(AI_LIMITS.maxTextChars)
  .refine((value) => value.trim().length > 0, "Text is required");

export const translateRequestSchema = z.object({
  text,
  targetLanguage: z.enum(["de", "en", "es"]),
});

/** The server action additionally serves French and Italian. */
export const translateActionSchema = z.object({
  text,
  targetLanguage: z.enum(["de", "en", "es", "fr", "it"]),
});

export type TranslationLanguage = z.infer<typeof translateActionSchema>["targetLanguage"];

export const wikiChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        // No "system": the system prompt is the server's, never the caller's.
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(AI_LIMITS.maxChatTotalChars),
      })
    )
    .min(1)
    .max(AI_LIMITS.maxChatMessages)
    .refine(
      (messages) =>
        messages.reduce((total, message) => total + message.content.length, 0) <=
        AI_LIMITS.maxChatTotalChars,
      "Conversation is too long"
    ),
});
