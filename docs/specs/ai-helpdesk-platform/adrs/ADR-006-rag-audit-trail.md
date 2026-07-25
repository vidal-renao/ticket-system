# ADR-006: RAG audit trail

**Status:** Proposed. Persist retrieval filters/candidates/scores, selected immutable chunk/version IDs, response, confidence, gaps, model/prompt/embedding versions and timings. Citations are assembled server-side from retrieved rows. Content-heavy telemetry is minimized/redacted with separate retention; trace integrity must survive model and document version changes.

