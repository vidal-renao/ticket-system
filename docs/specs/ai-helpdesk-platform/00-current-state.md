# Current state

Status as inspected on 2026-07-25. Runtime deployment claims require owner/platform confirmation.

| Capability | Evidence | Status |
|---|---|---|
| Ticket UI/API | Next.js App Router routes, actions and dashboard | Implemented |
| Auth and tenancy | Supabase Auth, profiles, `organization_id`, RLS | Implemented |
| Roles | customer, agent, manager, admin | Implemented |
| AI triage | Anthropic background analysis on ticket creation | Implemented |
| RAG retrieval | OpenAI embedding + `match_knowledge_chunks` call; errors collapse to no context | Partial |
| pgvector | Local SQL enables `vector`, vector(1536), IVFFlat and RPC | Documented/code only; deployment unverified |
| Knowledge ingestion | No extraction, validation, versioning or job pipeline found | Not existing |
| Grounded answers/citations | No durable answer/citation trace | Not existing |
| Wiki chat | Generic Anthropic stream without retrieval or citations | Implemented, not RAG |
| AI feedback | Updates `ai_analysis`; ticket tenant predicate relies on RLS | Partial |
| MCP | Eight tools, stdio and authenticated `/mcp` | Implemented in MCP repo |
| SLA delivery | Idempotent five-state delivery design in MCP | Implemented; deployment not re-verified |
| Operational dashboard | Ticket/SLA views exist; workflow/RAG/KB operations absent | Partial |

The historical `docs/rag_migration.sql` is evidence of intent, not evidence that production has the extension, table, index, RPC, RLS or embeddings. No production data or PII was queried.

Principal gaps: canonical knowledge lifecycle, ingestion, tenant-safe retrieval identity, citations, workflow state, approvals, observability, evaluation and environment promotion.

