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
