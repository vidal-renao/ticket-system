# Runbook — reproducible schema baseline

**Goal (spec REQ-F1-07):** an empty PostgreSQL plus `supabase/migrations/` reproduces the HelpDesk AI schema in production.

**Status:** Pending. The production project (`focgfmhgfmhmcbywwsej`) is shared with other applications, so a plain `supabase db dump` would include their objects. The baseline must contain only HelpDesk objects.

## Scope of the baseline

- Tables, sequences, indexes, constraints, triggers and RLS policies of every `public.hd_*` table, plus `public.organizations`, `public.categories`, `public.sla_policies`.
- Functions used by those objects: `public.current_profile_role()`, `public.current_profile_org_id()`, `private_public.*`, `public.hd_*` functions and HelpDesk trigger functions.
- Grants on those objects.
- **Excluded:** every other prefix or schema (`waai_*`, `lumen_*`, `jobfit_*`, `nat_*`, `cos_*`, `scout_*`, `omnisciencia`, `rolewise`, `cuadrante`, `hub`, `aura_core`, `lumen_invoice`, …) and any row data.

## Procedure (read-only against production)

1. Dump the schema only:
   ```bash
   supabase db dump --db-url "$PROD_DB_URL" --schema public,private_public -f /tmp/full_schema.sql
   ```
2. Keep only the objects in scope above (filter by name), review the result by hand, and save it as `supabase/migrations/000000000000_baseline.sql`, with a header stating the date and the production migration it reflects.
3. Rename the existing dated migrations only if needed so they sort after the baseline; never edit their content (AGENTS.md rule 7).
4. Verify in CI: an empty PostgreSQL + baseline + every later migration must apply cleanly, and all pgTAP suites must pass.
5. Mark the baseline as applied in production's migration history without running it (`supabase migration repair --status applied 000000000000`).

## Local development (decision D6-A)

```bash
supabase start          # local stack in Docker
supabase db reset       # applies supabase/migrations/ to the local database
```

Hosted staging is deferred until the Supabase Pro plan (branching).

© VIDAL ECOSYSTEM
