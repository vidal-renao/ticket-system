import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * RAG (Retrieval-Augmented Generation) for AI triage.
 *
 * Prerequisites:
 *   - npm install openai
 *   - OPENAI_API_KEY set in .env.local / Vercel env vars
 *   - docs/rag_migration.sql executed in Supabase
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS  = 1536;
const MAX_INPUT_CHARS = 8_000; // ~2k tokens — well within model limit

export interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  category: string | null;
  similarity: number;
}

/**
 * Returns a lazy OpenAI client.
 * Throws at call-time (not import-time) if the key is missing,
 * so the rest of the app still boots without OPENAI_API_KEY.
 */
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Generates a 1536-dim embedding for the given text using
 * OpenAI text-embedding-3-small.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client   = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, MAX_INPUT_CHARS),
    dimensions: EMBEDDING_DIMS,
  });
  return response.data[0].embedding;
}

/**
 * Queries the `match_knowledge_chunks` RPC in Supabase.
 * Returns up to `maxChunks` articles whose cosine similarity
 * exceeds `threshold`.
 *
 * Gracefully returns [] if:
 *   - OPENAI_API_KEY is not set
 *   - The pgvector extension / RPC is not installed
 *   - The embedding query fails for any reason
 */
export async function retrieveRelevantKnowledge(
  svc: SupabaseClient,
  orgId: string,
  text: string,
  maxChunks  = 3,
  threshold  = 0.50
): Promise<KnowledgeChunk[]> {
  let embedding: number[];
  try {
    embedding = await generateEmbedding(text);
  } catch (err) {
    // Missing key or OpenAI quota — degrade silently
    console.warn("[RAG] Embedding skipped:", err instanceof Error ? err.message : err);
    return [];
  }

  const { data, error } = await svc.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    org_id:          orgId,
    match_count:     maxChunks,
    match_threshold: threshold,
  });

  if (error) {
    // RPC not installed yet or pgvector missing — degrade silently
    console.warn("[RAG] match_knowledge_chunks failed:", error.message);
    return [];
  }

  return (data ?? []) as KnowledgeChunk[];
}

/**
 * Formats retrieved chunks into a prompt-injectable context block.
 * Returns an empty string when no chunks are available so the
 * triage prompt is unchanged in the no-RAG path.
 */
export function buildRAGContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return "";

  const articles = chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.title}${c.category ? ` (${c.category})` : ""}\n${c.content}`
    )
    .join("\n\n");

  return [
    "RELEVANT KNOWLEDGE BASE ARTICLES (use as supporting context only — do not reproduce verbatim):",
    articles,
    "---",
  ].join("\n");
}
