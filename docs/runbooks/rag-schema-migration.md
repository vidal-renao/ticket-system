# RAG schema migration runbook

## Scope

Apply `supabase/migrations/202607250001_rag_foundation_v2.sql` only to an isolated Supabase Preview Branch. It is additive and intentionally preserves legacy `knowledge_chunks` and `match_knowledge_chunks`. Direct production application is prohibited.

## Preflight

1. Confirm a clean repository and reviewed migration checksum.
2. Confirm Preview project identity without printing URLs, keys or connection strings.
3. Export metadata only: vector extension/version, migration history, legacy/v2 tables, vector dimensions, indexes, functions, policies, constraints and grants.
4. Stop if runtime differs materially, existing embeddings contradict 1536 dimensions, dependencies are unknown, or any destructive change/backfill is required.

## Apply and verify

Use the approved Supabase migration mechanism for Preview. Do not use SQL Editor against production. The opt-in runner supports two positively identified targets:

```powershell
./scripts/test-rag-foundation.ps1 -TargetMode Local `
  -DatabaseUrl 'postgresql://...@127.0.0.1/..._rag_preview_test'

./scripts/test-rag-foundation.ps1 -TargetMode SupabasePreview `
  -PreviewBranchName '<preview-branch-name>' `
  -DatabaseUrl 'postgresql://...'
```

Local mode requires a loopback host and the `_rag_preview_test` suffix. Preview mode first calls `supabase branches get` for the requested branch under parent project `focgfmhgfmhmcbywwsej`; it fails closed unless the metadata identifies a healthy, non-default, non-persistent child branch and its 20-character child project ref matches the database host or user identity. This metadata check occurs before `psql`. The production ref itself is rejected in every mode. The runner never logs the connection string, applies both real migrations, executes `supabase/tests/rag_foundation.sql`, proves re-execution fails fast and repeats the deterministic two-session sanitization race three times. Run `docs/sql/rag-foundation-verification.sql` separately as read-only metadata inspection; it is not a migration.

Verify five tables, vector(1536), named composite FKs/checks/indexes, forced RLS, minimal grants, authenticated RPC without tenant input, backend RPC restricted to service role, trigger-helper revocations, deterministic output without embedding, controlled ready-to-stale invalidation, active-source parity, approval invalidation, completed/failed job history and exclusion of stale/deleted/non-current content.

## Rollback

First disable any v2 feature flag/consumer and stop jobs. Preserve metadata evidence. In Preview only, after `pg_depend` inspection confirms no consumers, remove RPCs, triggers and `rag_*` tables in reverse dependency order. Do not touch legacy objects or drop `vector`. Production rollback requires a separately reviewed forward migration.

## Fixture cleanup

The committed TypeScript fixtures are inert. The pgTAP suite rolls back its transaction, while the concurrency harness removes its synthetic rows by exact ID after every iteration. Any other Preview rows must use documented synthetic UUIDs/names and be removed by exact ID inside a reviewed transaction. Never use broad deletes or copy production data. Migration objects remain in a disposable local database or Preview branch until that environment is separately deleted; fixture cleanup is not schema rollback.

## Drift detection

Compare migration history and the verification query output with reviewed source: table/column types, constraints, indexes, `relrowsecurity`/`relforcerowsecurity`, policies, routine security and grants. Any unexpected object, dimension, policy or dependency is a stop condition.

## Stop conditions

Stop on tenant leakage, RLS/grant mismatch, approval bypass, unknown legacy consumers, incompatible vector dimension, provider/secret requirement, real-data requirement, destructive SQL, direct production target or reactivated Audit workflow.
