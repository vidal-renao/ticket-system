# Roadmap

## Implemented

- Multi-role ticketing, comments, assignment, SLA and notifications.
- DE/EN/ES interface.
- AI triage, translation, response suggestions and optional RAG.
- Customer-only public registration and admin-managed staff accounts.
- Security baseline, tests and CI.

## Immediate

- Apply and verify the security migration in staging and production.
- Rotate historical demo credentials and all related sessions.
- Add distributed rate limiting for authentication, registration, webhooks and AI routes.
- Add two-tenant RLS integration tests and core ticket E2E tests.
- Consolidate SQL migrations into a forward-only managed history.
- Eliminate remaining explicit `any` and unused code warnings by feature.

## Medium Term

- Extract large dashboard, queue and analytics queries into typed domain services.
- Add structured logging, error tracking and operational alerts.
- Move deferred AI/email work to a durable queue with retries and idempotency.
- Implement retention jobs and auditable data-subject workflows.
- Add accessibility and performance budgets with measured Lighthouse reports.

## Future Ideas

- Enterprise SSO/SCIM.
- Slack and Microsoft Teams integrations.
- Configurable business calendars and SLA policy editor.
- Payment processing after commercial requirements are defined.

Future ideas are not commitments or implemented product claims.
