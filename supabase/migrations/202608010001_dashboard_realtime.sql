-- ============================================================================
-- Realtime publication for the live operations console (/ops)
--
-- Supabase Realtime only emits postgres_changes for tables that are members of
-- the `supabase_realtime` publication. This adds the three tables the console
-- subscribes to. Nothing else changes: no columns, no policies, no grants.
--
-- Scope notes:
--   * This Supabase project shares the `public` schema with other applications,
--     and `supabase_realtime` already publishes tables owned by them
--     (aura_core.products, cuadrante.schedule_exceptions). ALTER PUBLICATION
--     ... ADD TABLE is strictly additive and leaves those memberships intact.
--   * REPLICA IDENTITY is intentionally left at DEFAULT. The console consumes
--     INSERT and UPDATE only; removal from the view is a soft delete
--     (deleted_at set by an UPDATE), so no DELETE payload is required.
--   * Realtime evaluates RLS per subscriber, so the existing SELECT policies
--     (tickets_read_enterprise_scope, ticket_comments_read_authorized,
--     ticket_audit_logs_staff_read) remain the only authorization boundary.
--
-- Rollback (forward-only per ADR-006 — only if reverting this exact migration):
--   ALTER PUBLICATION supabase_realtime DROP TABLE
--     public.tickets, public.ticket_comments, public.ticket_audit_logs;
-- ============================================================================

do $$
declare
  target_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'publication supabase_realtime does not exist';
  end if;

  foreach target_table in array array['tickets', 'ticket_comments', 'ticket_audit_logs']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end
$$;
