# Service Role Audit

Status for Fase 2 RBAC hardening.

## Necessary

- `lib/auth/permissions.ts`: reads current profile with service role after `auth.getUser()`. This avoids RLS recursion/null-profile edge cases while centralizing permission decisions.
- `app/api/tickets/route.ts`: background AI triage uses service role for async `ai_analysis`, category lookup, org settings, RAG and ticket AI patch.
- `app/api/auth/register/route.ts`: validates org/team and upserts profile/customer info during signup.
- `app/api/admin/users/route.ts`: uses `auth.admin.createUser`, which requires service role.
- `app/actions/org-settings.ts`: provisioning/updating organization settings still uses service role intentionally.

## Replaceable

- Server pages currently using service role for reads: tickets, queue, dashboard, analytics, admin, team, inbox, settings. These can move gradually to authenticated Supabase client once RLS is fully deployed and tested.
- `app/api/auth/login/route.ts`: profile lookup can move to authenticated client after profile self-select RLS is confirmed in production.

## Dangerous

- `app/[locale]/(app)/tickets/[id]/page.tsx`: service-role ticket and comment reads require strict manual checks. Fase 2 now filters internal comments after `canViewInternalMessages`, but this should move to RLS-backed authenticated reads.
- `app/api/comments/route.ts` and `app/api/tickets/[id]/route.ts`: service-role writes are guarded by the central helper now, but should be replaced by authenticated client + RLS after migration rollout.
- Broad list pages using service role can accidentally overexpose rows if a future manual filter is missed.
