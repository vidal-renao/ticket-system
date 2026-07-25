# RAG schema migration runbook

## Scope

Apply `supabase/migrations/202607250001_rag_foundation_v2.sql` only to an isolated Supabase Preview Branch. It is additive and intentionally preserves legacy `knowledge_chunks` and `match_knowledge_chunks`. Direct production application is prohibited.

## Preflight

1. Confirm a clean repository and reviewed migration checksum.
2. Confirm Preview project identity without printing URLs, keys or connection strings.
3. Export metadata only: vector extension/version, migration history, legacy/v2 tables, vector dimensions, indexes, functions, policies, constraints and grants.
4. Stop if runtime differs materially, existing embeddings contradict 1536 dimensions, dependencies are unknown, or any destructive change/backfill is required.

## Apply and verify

Use the approved Supabase migration mechanism for Preview. Do not use SQL Editor against production. The opt-in `scripts/test-rag-foundation.ps1` runner accepts only a database whose name ends in `_rag_preview_test`, creates the synthetic legacy prerequisites, applies both real migration files and runs `supabase/tests/rag_foundation.sql`. Run `docs/sql/rag-foundation-verification.sql` separately as read-only metadata inspection; it is not a migration. Run the paired sanitization concurrency scripts in two sessions.

Verify five tables, vector(1536), named composite FKs/checks/indexes, forced RLS, minimal grants, authenticated RPC without tenant input, backend RPC restricted to service role, trigger-helper revocations, deterministic output without embedding, ready-content immutability, approval invalidation, job history and exclusion of stale/deleted/non-current content.

## Rollback

First disable any v2 feature flag/consumer and stop jobs. Preserve metadata evidence. In Preview only, after `pg_depend` inspection confirms no consumers, remove RPCs, triggers and `rag_*` tables in reverse dependency order. Do not touch legacy objects or drop `vector`. Production rollback requires a separately reviewed forward migration.

## Fixture cleanup

The committed TypeScript fixtures are inert. Any Preview rows must use the documented synthetic UUIDs/names and be removed by exact ID inside a reviewed transaction. Never use broad deletes or copy production data.

## Drift detection

Compare migration history and the verification query output with reviewed source: table/column types, constraints, indexes, `relrowsecurity`/`relforcerowsecurity`, policies, routine security and grants. Any unexpected object, dimension, policy or dependency is a stop condition.

## Stop conditions

Stop on tenant leakage, RLS/grant mismatch, approval bypass, unknown legacy consumers, incompatible vector dimension, provider/secret requirement, real-data requirement, destructive SQL, direct production target or reactivated Audit workflow.
