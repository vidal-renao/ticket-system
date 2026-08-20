-- Customer onboarding state: make "invited but never got in" visible.
--
-- Alpen Logistics sat in the directory for a day looking like a healthy
-- customer -- is_active true, organization set, reference_code assigned --
-- while its account had no password anyone could use. Nothing in hd_profiles
-- said otherwise, so nothing could have shown it.
--
-- The obvious signal, auth.users.last_sign_in_at, does not work: accepting an
-- invitation creates a full session (implicit grant) even when the invitee
-- never sets a password, so Alpen's last_sign_in_at was populated. The pair
-- that does discriminate is (invited_at, last_seen_at): we invited them, and
-- the AppShell heartbeat has never once fired for them. /reset-password lives
-- outside AppShell, so accepting an invitation cannot set last_seen_at.
--
-- invited_at is ours rather than auth.users.invited_at on purpose: it records
-- an invitation *this* onboarding sent, it costs no Admin API call to read on
-- every render of the directory, and it does not move if GoTrue changes what
-- its own column means.

begin;

alter table public.hd_profiles
  add column if not exists invited_at timestamptz;

comment on column public.hd_profiles.invited_at is
  'When customer onboarding emailed an invitation for this account. NULL for accounts created with a password (agents) or self-registered. Paired with last_seen_at: invited_at IS NOT NULL AND last_seen_at IS NULL means the invitation was never completed -- surfaced in the directory as "No first access".';

-- Partial: only invited accounts are ever a candidate, and they are a small
-- minority of the table. Deliberately not indexing on last_seen_at too -- that
-- column moves on every heartbeat, and an index predicate over it would churn.
create index if not exists idx_hd_profiles_invited_at
  on public.hd_profiles (organization_id)
  where invited_at is not null;

-- Backfill. Only customers, and only where we have not already recorded an
-- invitation. auth.users.invited_at is the sole record that exists for
-- accounts onboarded before this column, so it is read once, here, and never
-- again at runtime.
update public.hd_profiles p
set invited_at = u.invited_at
from auth.users u
where u.id = p.id
  and p.role = 'customer'
  and u.invited_at is not null
  and p.invited_at is null;

commit;
