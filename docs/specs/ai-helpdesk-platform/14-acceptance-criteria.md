# Acceptance criteria

- No third application or duplicate ticket-domain logic exists.
- Metadata verification distinguishes repository intent from deployed fact.
- A manually approved document can be versioned, indexed and deleted with lineage.
- Every vector query filters the trusted organization inside SQL/RPC before ranking.
- Every chunk traces to organization, source, document/version, location, index, hash, embedding model/dimension and lifecycle state.
- Grounded responses expose confidence, evidence, gaps and trace ID; insufficient evidence abstains; citations cannot be model-invented.
- Sensitive effects require an authorized, unexpired approval bound to the exact payload.
- Duplicate events/calls have one durable effect and return the prior outcome.
- Ticket and workflow state remain independent.
- Operators can follow one correlation ID through retrieval, generation, approval and action without viewing secrets/PII.
- Dashboard roles and public demo isolation pass accessibility/security tests.
- SLA audit delivery preserves its idempotent five-state semantics.
- Rollback is rehearsed in staging and ticket basics remain available.

