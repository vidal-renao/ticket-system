# Contributing

## Workflow

1. Create a focused branch from current `main`.
2. Read `AGENTS.md` and relevant architecture/domain/security documents.
3. Write a small spec for meaningful behavior changes.
4. Implement with tests and documentation.
5. Run all verification commands locally.
6. Open a pull request describing behavior, risk, migration and rollback.

## Commits

Use imperative, scoped messages such as `Harden inbound email authentication`. Do not combine unrelated refactors with security or schema changes.

## Pull Requests

A PR must state:

- Problem and user impact.
- Changed authorization and tenant boundaries.
- Database/environment changes and rollout order.
- Tests run and their actual result.
- Remaining risks and rollback approach.

CI must pass before merge. Production migrations require staging evidence and review by an owner familiar with Supabase RLS.

## Definition of Done

Follow the Definition of Done in `AGENTS.md`. A successful build alone is not sufficient.
