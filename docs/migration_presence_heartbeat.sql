-- Presence heartbeat: real connection tracking for staff availability.
--
-- The self-declared profiles.availability_status alone cannot prove a user is
-- actually connected (closed laptops keep showing "online"). The app shell now
-- POSTs /api/profile/heartbeat every 60 seconds; presence displayed anywhere in
-- the product is availability_status downgraded to offline when last_seen_at is
-- older than 3 minutes (see lib/presence.ts).
--
-- Apply in the Supabase SQL editor (idempotent).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.last_seen_at IS
  'Last liveness heartbeat from an authenticated session. Presence = availability_status AND last_seen_at within 3 minutes.';

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON profiles (organization_id, last_seen_at DESC)
  WHERE role IN ('agent', 'manager', 'admin');
