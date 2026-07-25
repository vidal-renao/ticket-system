# Rollout and rollback

Local uses synthetic tenants/documents and provider mocks. Staging uses separate Supabase/project credentials, allowlisted test recipients and no production document copy. Production has separate keys, storage, schedules, rate limits and explicit feature flags.

Deploy additive schema first, then dual-write/observe where needed, backfill approved content, shadow retrieval, staff-only drafts, approval-gated actions and finally measured expansion. Vector generations and prompt/schema versions are independently switchable.

Rollback disables feature flags and workers, preserves audit/run state, stops new ingestion, returns to the prior retrieval generation and leaves ticket operations functional. Do not drop new data during emergency rollback. External ambiguous delivery becomes `delivery_unknown` and is reconciled, not blindly retried.

Stop conditions include any tenant-boundary failure, fabricated citation, approval bypass, unexplained destructive effect, migration inconsistency, unacceptable provider data processing, runaway cost or inability to correlate actions. The disabled GitHub Audit workflow (ID 294419190) is not part of rollout and remains disabled.

Phase 4A must run first on a Supabase Preview Branch following `docs/runbooks/rag-schema-migration.md`. Rollback initially disables all v2 consumers; because v2 has no production consumer or backfill, objects may be removed only in Preview after evidence export and dependency inspection. Production direct application is prohibited.

