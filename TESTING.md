# Testing Strategy

## Layers

| Layer | Purpose |
| --- | --- |
| Unit | Validation, authorization helpers, SLA and lifecycle calculations |
| Integration | Route Handler plus Supabase behavior, RLS and tenant isolation |
| Component | Forms, loading/error/empty states and accessibility behavior |
| E2E | Login, customer ticket flow, agent handling and admin user flow |

## Commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Minimum Criteria

- Security regressions require a test that fails before the fix.
- Every authorization test includes unauthenticated, wrong-role and wrong-tenant cases.
- SLA tests use fixed clocks and boundary timestamps.
- Route tests assert status and stable public error shape without matching provider internals.
- RLS changes are validated against two organizations and all four roles in a disposable database.

The current suite covers bearer fail-closed behavior and rejection of public staff registration. Database integration, component and E2E coverage remain required before a production-ready verdict.

## User identity (Phase 4A.14)

Vitest validates the `selfServiceProfileSchema`, `createIndividualCustomerSchema` and `createCompanyCustomerSchema` Zod contracts, including that role/organization_id/customer_type/reference_code have no field in any of them (so a manipulated payload cannot supply them even before the server-side code path ignores the raw body). `supabase/tests/user_identity.sql` runs 42 real pgTAP assertions against an ephemeral PostgreSQL 17.6 (the `identity-foundation` CI job): role-code mapping, the `customer_type` CHECK (including the transitional NULL state a bare `handle_new_user()` insert produces), auto-generation on INSERT/UPDATE once role/customer_type become resolvable, immutability across a role promotion, uniqueness, format validation, column-grant enforcement (`authenticated` can edit self-service fields but not customer_type/reference_code/role/organization_id), and `logos` Storage bucket/RLS parity with `avatars`. A prior version of this CI job's failure gate anchored `not ok` to column 0 and silently passed 3 real assertion failures (a `customer_type IN (...)` NULL-operand CHECK bug, and a test that expected reference_code to change on role promotion when immutability requires it not to) — both are now fixed and regression-covered.

## RAG foundation

Vitest validates Zod contracts, including embedding-job active/terminal terminology and same-version retry lineage, the maximum application result count, embedding profile, opaque session-derived tenant context, adapter output/error mapping and static migration invariants. `scripts/test-rag-foundation.ps1` has explicit `Local` and `SupabasePreview` modes: local requires loopback plus an `_rag_preview_test` database; Preview resolves the requested branch through official Supabase CLI metadata before any database access and then requires its disposable child project ref to match the connection identity. The known production ref is rejected before any connection attempt. The runner applies the real migrations, executes 82 pgTAP tenant/RPC/lifecycle/job/grant/constraint tests, proves fail-fast re-execution and repeats the two-connection race three times. Each iteration waits for a unique SQL-emitted lock barrier before starting the conflicting transaction and rejects SQLSTATE `40P01`, `55P03` or `57014`, any process timeout and any invalid committed final state. None of these PostgreSQL tests has been executed in this workspace; final independent review remains required before Preview execution.
