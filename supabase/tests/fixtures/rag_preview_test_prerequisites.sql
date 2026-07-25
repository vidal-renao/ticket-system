\set ON_ERROR_STOP on

-- Preview-only test dependency. Core Supabase tables, roles and helpers must
-- already exist and are deliberately not synthesized in Preview mode.
CREATE EXTENSION IF NOT EXISTS pgtap;
