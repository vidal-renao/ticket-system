# ADR-002: Embedding provider

**Status:** Proposed, legal review required.

Recommend OpenAI `text-embedding-3-small` at 1536 dimensions for MVP because the repository already implements its TypeScript adapter and schema, minimizing migration risk. Official OpenAI documentation identifies the model and default dimension; current commercial limits and data processing must be rechecked at procurement time: <https://platform.openai.com/docs/guides/embeddings>.

Alternative: OpenAI `text-embedding-3-large` when evaluation demonstrates material recall benefit; it has higher dimensionality/cost and requires a new embedding generation. A non-OpenAI provider remains a portability option after an official-doc, regional-processing and benchmark review.

Store provider/model/dimension per chunk and an embedding profile/generation. Never mix incompatible vectors. Migrate by parallel indexing, offline evaluation, shadow retrieval, atomic generation switch and retained rollback window. Risks: external processing/privacy, residency, cost, rate limits, model lifecycle and lock-in.

