# Domain model

Existing aggregates remain authoritative: Organization, Profile, Customer, Team, Category, Ticket, Comment, Attachment, SLA Policy, AI Analysis, Notification and Ticket Audit Log.

New bounded concepts:

- Knowledge Source: approved origin, policy and owner.
- Knowledge Document: stable logical document within a source.
- Document Version: immutable extracted/sanitized revision.
- Knowledge Chunk: traceable retrieval unit for one version.
- Embedding Job: asynchronous indexing attempt and model contract.
- Retrieval Run: query, filters, candidates, timings and model metadata.
- RAG Answer: generated draft, confidence, grounded flag, gaps and prompt/model version.
- RAG Citation: immutable link from answer to exact chunk/version/location.
- Workflow Run/Event: orchestration state separate from ticket state.
- Human Approval: requested action, evidence, decision, actor and expiry.

All new durable entities carry `organization_id`. References across entities must either use composite tenant-safe constraints or be validated in tenant-scoped SQL. Ticket status and workflow status are independent state machines.

Invariants: a chunk belongs to exactly one immutable document version; an answer cites only chunks from its retrieval run and organization; superseded/deleted content is excluded from new retrieval; approval cannot authorize a materially changed payload; audit events are append-only.

