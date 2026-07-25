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

