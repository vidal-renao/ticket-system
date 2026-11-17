# Legacy SQL — do not execute

These files are the original bootstrap and hardening scripts of HelpDesk AI, written **before** the `hd_` table prefix (`supabase/migrations/202608150001_schema_prefix_hd.sql`) and before migrations moved to `supabase/migrations/`.

- They reference table names that no longer exist (`tickets`, `profiles`, `ai_analysis`, …).
- Running any of them against the current database will fail or, worse, partially recreate obsolete objects.
- They are kept only as history and as context for older CHANGELOG/SDD entries.

The source of truth for the schema is `supabase/migrations/` plus the baseline described in `docs/runbooks/baseline.md`.

© VIDAL ECOSYSTEM
