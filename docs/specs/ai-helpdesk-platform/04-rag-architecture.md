# RAG architecture

```text
approved source -> validation -> extraction -> sanitization -> chunking
-> embedding job -> pgvector -> tenant-scoped retrieval -> optional rerank
-> context budget -> grounded generation -> citations/confidence/gaps
-> human gate -> audited action
```

Sources begin with manually uploaded manuals, procedures, FAQs, technical documentation, SLA policies and authored articles. Closed-ticket solutions enter only after explicit curation, privacy review and consent policy; raw comments are not indexed by default.

Validation checks authorization, declared/observed MIME, size, malware result and source policy. Extraction is isolated and non-executable. Sanitization strips active content and labels all retrieved text as untrusted evidence. Chunking preserves page/section/location, order and content hash.

Retrieval receives tenant identity from trusted context, never tool input. The SQL/RPC predicate includes `organization_id`, active version and deletion state before vector ranking. Low evidence produces `grounded=false`, explicit gaps and no action.

Response contract:

```json
{"answer":"...","confidence":0.0,"grounded":false,"evidence":[],"gaps":[],"recommendation":{"text":"...","action":null},"requires_human_approval":true,"trace_id":"..."}
```

Each evidence item contains document/version/section/chunk identifiers, title and relevance. The server constructs citations from retrieved rows; the model cannot invent identifiers. Persist model, embedding model/dimension, prompt version, filters, candidates, chosen chunks, latency and token/cost metadata.

## Phase 4A implementation inventory

| Component | Exists | Completeness | Consumer | Risk | Decision |
|---|---:|---|---|---|---|
| Legacy `knowledge_chunks` | local SQL | partial | `lib/ai/rag.ts` | deployed shape/data unknown | preserve |
| Legacy `match_knowledge_chunks` | local SQL | partial | AI triage | accepts trusted org only in service path | preserve/revoke non-server |
| Versioned `rag_*` model | Phase 4A migration | foundation | future ingestion/retrieval | Preview untested | canonical v2 |
| Ingestion/embeddings | no | absent | none | PII/provider boundary | Phase 4B |
| Grounded citations | design only | absent | none | fabrication | later phase |

Phase 4A uses exact cosine search with a relational retrieval-filter index. No ANN index is created until Preview supplies tenant distribution, row count, filtered recall and latency. Official guidance: <https://github.com/pgvector/pgvector#filtering> and <https://supabase.com/docs/guides/ai/vector-indexes>.

