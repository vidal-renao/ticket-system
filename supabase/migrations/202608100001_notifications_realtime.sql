-- ============================================================================
-- Realtime publication for the notification bell
--
-- Supabase Realtime only emits postgres_changes for tables that are members of
-- the `supabase_realtime` publication. `public.notifications` was never added,
-- so the bell has always depended on its 15-second poll. This adds the one
-- table. Nothing else changes: no columns, no policies, no grants.
--
-- Scope notes:
--   * This Supabase project shares the `public` schema with other applications
--     (aura_core.products, cuadrante.schedule_exceptions are published here
--     too). ALTER PUBLICATION ... ADD TABLE is strictly additive and leaves
--     those memberships intact.
--   * REPLICA IDENTITY is left at DEFAULT. The bell consumes INSERT only: a
--     read receipt is applied optimistically in the client and re-confirmed by
--     the poll, and notifications are never deleted.
--   * Authorization is unchanged and still comes from RLS, which Realtime
--     evaluates per subscriber. `notifications` has rowsecurity enabled and
--     policy `users_own_notifications` (ALL) with `user_id = auth.uid()`, so a
--     subscriber receives only their own rows. The socket must therefore carry
--     the user's JWT via realtime.setAuth(); without it the server evaluates
--     the policy as `anon` and silently sends nothing.
--
-- Rollback (forward-only per ADR-006 — only if reverting this exact migration):
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'publication supabase_realtime does not exist';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
