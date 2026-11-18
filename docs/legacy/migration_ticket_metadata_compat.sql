-- Forward-only compatibility migration for legacy Ticket System databases.
-- The application and canonical schema use tickets.metadata for extensible,
-- non-workflow presentation data (for example customer rating and VIP labels).

begin;

alter table public.tickets
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.tickets.metadata is
  'Extensible non-workflow ticket attributes. Authorization and lifecycle state must use first-class columns.';

commit;
