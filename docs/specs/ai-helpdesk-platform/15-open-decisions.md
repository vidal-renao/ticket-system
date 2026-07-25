# Open decisions

Owner review is required before implementation:

1. Which document classes and customer data may be embedded, in which processing region, and under what retention/deletion policy?
2. Are curated closed-ticket resolutions permitted, and who certifies quality/consent?
3. Which roles approve customer replies, critical priority, closure and cross-team reassignment?
4. Is MCP permanently single-tenant per deployment or must future identity delegation be designed?
5. What are target retrieval quality, latency and monthly cost budgets?
6. Which production/staging Supabase projects exist, and can a read-only metadata audit confirm vector deployment?
7. What is the authoritative VIP definition and conflict precedence with SLA policy?
8. Must the daily compliance email remain MCP-owned, and who reconciles `delivery_unknown`?

Provisional decisions are recorded in the ADRs. Embedding choice remains conditional on legal/data-residency approval. These questions do not prevent owner review, but Phase 4A cannot start until decisions 1, 3, 4 and 6 are resolved.

