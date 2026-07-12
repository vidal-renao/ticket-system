# Constraints

- Derive tenant and role from the authenticated server-side profile.
- Add explicit tenant predicates to every service-role query.
- Public operational endpoints fail closed.
- Staff accounts are admin-managed.
- Database changes require forward-only idempotent migrations.
- Never add credentials, personal passwords or unverified compliance claims.
- Run lint, typecheck, tests and build before completion.
