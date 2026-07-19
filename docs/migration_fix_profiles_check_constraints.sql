-- Applied 2026-07-19 in production.
--
-- profiles_specialty_check silently rejected every specialty outside a
-- 6-value whitelist (hardware/software/networking/security/billing/other),
-- while the product offers 13 specialties in the New Employee form and also
-- lets specialty default to an arbitrary team name (free text, e.g. any
-- custom team an admin creates). Any agent created with a specialty like
-- "vpn", "email" or "m365" had the profile write hit this check constraint;
-- the API code only console.warn'd, so the admin saw "success" while the
-- new agent silently kept no specialty/team and could never receive routed
-- work. specialty is matched fuzzily by lib/ticket-routing.ts, not
-- validated against an enum — the DB should not re-impose a stale whitelist.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_specialty_check;

-- profiles_role_check never included 'manager', even though the entire app
-- (UserRole type, sidebar nav, admin user editor) treats manager as a
-- first-class role. Creating/promoting a manager failed with a raw DB error.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'agent'::text, 'customer'::text]));
