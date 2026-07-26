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

Local mode requires a loopback host (`localhost`, `127.0.0.1` or `::1`, matched via `System.Uri.IsLoopback` so a bracketed IPv6 literal is recognized correctly) and the `_rag_preview_test` suffix. Preview mode first calls `supabase branches get` for the requested branch under parent project `focgfmhgfmhmcbywwsej`; it fails closed unless the metadata identifies a healthy, non-default, non-persistent child branch. It then requires **every project ref extractable from the connection URL** (a `db.<ref>.supabase.co` host, a `postgres.<ref>` pooler username, or both) to agree with that verified branch ref — a connection is rejected if no ref is extractable, if any extractable ref disagrees with the verified branch, or if a host ref and a username ref disagree with each other, even if one of them happens to match (`scripts/lib/PreviewIdentity.ps1`, `Test-PreviewConnectionIdentity`). This metadata and identity check occurs before `psql`. The production ref itself is rejected in every mode. The runner never logs the connection string, password, or username; psql connection flags are rebuilt without an embedded password (`New-PsqlConnectionArguments`), the password travels only via a `PGPASSWORD` environment override scoped to each child process. Every external process invocation (`scripts/lib/ProcessArguments.ps1`) builds its command line by quoting each argument independently (`ConvertTo-Win32QuotedArgument`, a port of .NET's own `ArgumentList` escaping — Windows PowerShell 5.1 runs on .NET Framework, which does not expose `ProcessStartInfo.ArgumentList`) and passes the result to `Start-Process -ArgumentList` as a single pre-quoted string, never as an unquoted array, so a `--file` path containing spaces (e.g. under this repository's own "VIDAL ECOSYSTEM" parent directory) is never silently re-split. The runner applies both real migrations, executes `supabase/tests/rag_foundation.sql`, proves re-execution fails fast and repeats the deterministic two-session sanitization race three times. Run `docs/sql/rag-foundation-verification.sql` separately as read-only metadata inspection; it is not a migration.

Verify five tables, vector(1536), named composite FKs/checks/indexes, forced RLS, minimal grants (including that PUBLIC and anon can execute neither retrieval RPC), authenticated RPC without tenant input, backend RPC restricted to service role, trigger-helper revocations, deterministic output without embedding, controlled ready-to-stale invalidation (including that every protected chunk-identity column — `organization_id`, `document_id`, `document_version_id`, `chunk_index` — is individually immutable once ready), active-source parity, approval invalidation, completed/failed job history, embedding-job retries (only a `failed` or `stale` predecessor may be retried — enforced identically by the SQL trigger and by `embeddingJobRetryPairSchema` in `lib/rag/schemas.ts`; a `pending`/`processing`/`completed` predecessor, a predecessor from another tenant or document version, a non-consecutive attempt number and self-reference are all rejected), and exclusion of stale/deleted/non-current content from both retrieval RPCs. `supabase/tests/rag_foundation.sql` runs 100 pgTAP assertions (`plan(100)`); update that count in lockstep with the file.

## Rollback

First disable any v2 feature flag/consumer and stop jobs. Preserve metadata evidence. In Preview only, after `pg_depend` inspection confirms no consumers, remove RPCs, triggers and `rag_*` tables in reverse dependency order. Do not touch legacy objects or drop `vector`. Production rollback requires a separately reviewed forward migration.

## Fixture cleanup

The committed TypeScript fixtures are inert. The pgTAP suite rolls back its transaction, while the concurrency harness removes its synthetic rows by exact ID after every iteration. Any other Preview rows must use documented synthetic UUIDs/names and be removed by exact ID inside a reviewed transaction. Never use broad deletes or copy production data. Migration objects remain in a disposable local database or Preview branch until that environment is separately deleted; fixture cleanup is not schema rollback.

## Drift detection

Compare migration history and the verification query output with reviewed source: table/column types, constraints, indexes, `relrowsecurity`/`relforcerowsecurity`, policies, routine security and grants. Any unexpected object, dimension, policy or dependency is a stop condition.

## Stop conditions

Stop on tenant leakage, RLS/grant mismatch, approval bypass, unknown legacy consumers, incompatible vector dimension, provider/secret requirement, real-data requirement, destructive SQL, direct production target or reactivated Audit workflow.
