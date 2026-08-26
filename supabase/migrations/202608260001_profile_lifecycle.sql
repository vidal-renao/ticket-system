-- Retiring a person without destroying what they did.
--
-- There was no way to remove an account, and the reason there must never be a
-- physical one is written into the foreign keys of this instance:
--
--   auth.users        --DELETE--> hd_profiles           CASCADE
--     hd_profiles     --DELETE--> hd_ticket_comments    CASCADE
--     hd_profiles     --DELETE--> hd_notifications      CASCADE
--     hd_profiles     --DELETE--> hd_customers_info     CASCADE
--     hd_profiles     <---------- hd_tickets.assigned_to    NO ACTION
--     hd_profiles     <---------- rag_knowledge_*           RESTRICT
--
-- So deleting a customer who has ever commented erases their comments from
-- tickets belonging to other people, and deleting one who was ever assigned
-- work fails outright on a foreign key. One of those is loud and one is
-- silent, and the silent one is worse. Neither belongs behind a button.
--
-- deleted_at/deleted_by instead, matching hd_tickets exactly -- same column
-- names, same restore path, same typed confirmation in the route. The history
-- stays: a comment keeps its author, a ticket keeps the person it is about,
-- and an administrator can put the account back.

begin;

alter table public.hd_profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.hd_profiles (id) on delete set null;

comment on column public.hd_profiles.deleted_at is
  'Soft delete. Non-NULL hides the account from every directory and listing and bars it from signing in; dependent history (comments, tickets, audit rows) is deliberately left intact. Restorable. There is no physical delete path from the application -- see this migration''s header for the cascades that make one unsafe.';

comment on column public.hd_profiles.deleted_by is
  'The administrator who deleted the account. SET NULL rather than CASCADE: if that administrator is later deleted themselves, the record that this account was deleted must survive them.';

-- Partial, because a deleted profile is rare and every listing asks the same
-- question -- "this organization, not deleted". Matches the shape of the
-- queries rather than the shape of the column.
create index if not exists idx_hd_profiles_active_by_org
  on public.hd_profiles (organization_id)
  where deleted_at is null;

-- is_active changes meaning here, so say what it means now.
--
-- It already removed an agent from automatic routing (findAutomaticAssignment
-- filters on it) and blocked manual assignment, but it did not stop anyone
-- signing in -- the login route never looked at it. An administrator who
-- clicked "Deactivate", under a trash-can icon, got someone who could still
-- log in and, if a customer, still open tickets. From here it is one state:
-- false means frozen, and frozen means banned in GoTrue as well.
comment on column public.hd_profiles.is_active is
  'FALSE means frozen: barred from signing in (auth.users.banned_until is set alongside it) and, for an agent, out of automatic routing and ineligible for manual assignment. Reversible. NULL reads as active -- the column predates this and defaults to true.';

commit;
