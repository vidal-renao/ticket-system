# Applying the `hd_` prefix — verification runbook

Order of application, decided up front:

1. SQL in production (`supabase/migrations/202608150001_schema_prefix_hd.sql`)
2. Deploy `ticket-system` immediately
3. Deploy `vidal-helpdesk-mcp` next — it is a cron consumer and tolerates more
   margin, but it must not be left behind for long

Rollback: `docs/sql/rollback_schema_prefix_hd.sql`, plus reverting **both**
deploys. Database and code are one change in two places.

Placeholders used below: `$TS_HOST` (ticket-system production hostname),
`$MCP_HOST` (helpdesk MCP hostname), `$AUDIT_CRON_SECRET` (the bearer the
health endpoint expects).

---

## Step 0 — Before the SQL: baselines

Without these, a post-change failure cannot be told apart from something that
was already broken.

**0.1 — Snapshot.** Manual, taken by the operator. Nothing special is needed
beyond the standard Supabase backup: the change alters no column, constraint,
index, policy, trigger, grant or row, and all seven tables are empty
(confirmed: 0 rows in each). The one thing worth capturing that a backup does
not give you in readable form is the current function definitions, for
comparison rather than restore — the rollback file already contains them
verbatim:

```sql
select n.nspname, p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('private_public','current_profile_org_id'), ('private_public','current_profile_role'),
  ('public','handle_new_user'), ('public','rve_set_reference_code'),
  ('public','trg_auto_assign_on_ai_analysis'), ('public','tickets_guard_customer_update'))
order by 1, 2;
```

**0.2 — Baseline the known landmine.** `public.trg_auto_assign_on_ai_analysis`
calls `public.assign_ticket_to_agent()`, **which does not exist in this
database**. Its trigger is `AFTER INSERT` on the analysis table, so every
insert for a ticket with `assigned_to IS NULL` already fails today and rolls
back. This is pre-existing and the rename does not change it. Record it now so
it is not misread as fallout:

```sql
select count(*) as should_be_zero
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'assign_ticket_to_agent';
```

**0.3 — Baseline the health endpoint** (it must be green *before* you start):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $AUDIT_CRON_SECRET" \
  https://$MCP_HOST/api/health/audit
# expect: 200
```

---

## Step 1 — Apply the SQL

Paste `supabase/migrations/202608150001_schema_prefix_hd.sql` into the Supabase
SQL editor and run it. It is wrapped in `begin; … commit;` and ends with three
assertions; if any fires, the whole thing rolls back and **nothing has
changed** — stop, do not deploy, and read the exception message.

On success it emits:

```
NOTICE:  hd_ prefix migration: 7 tables renamed, 5 functions rewritten, publication verified
```

At this moment production runs the **old code against the new schema**. The
window is open. Everything from here is about closing it.

---

## Step 2 — Verify the database, before deploying anything

Do not skip ahead. If this step is wrong, deploying makes diagnosis harder.

**2.1 — The seven tables moved, and nothing was left behind:**

```sql
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and relname in ('hd_tickets','hd_profiles','hd_notifications','hd_ticket_comments',
                  'hd_ticket_audit_logs','hd_ai_analysis','hd_customers_info',
                  'tickets','profiles','notifications','ticket_comments',
                  'ticket_audit_logs','ai_analysis','customers_info')
order by relname;
-- expect: exactly the 7 hd_* names, and none of the 7 old ones
```

**2.2 — No function anywhere still reads an old name.** This is the check that
would have caught the whole problem class; note the newline normalisation,
because the bodies contain literal `\r\n` and a line-anchored search misses
them:

```sql
select n.nspname || '.' || p.proname as still_broken
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private_public')
  and regexp_replace(p.prosrc, '[\r\n\t]+', ' ', 'g')
      ~* '\m(from|join|into|update|exists\s*\(\s*select\s+1\s+from)\s+(public\.)?(tickets|profiles|notifications|ticket_comments|ticket_audit_logs|ai_analysis|customers_info)\M';
-- expect: 0 rows
```

**2.3 — The four published tables are still published, under the new names:**

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename like 'hd_%' order by tablename;
-- expect exactly: hd_notifications, hd_ticket_audit_logs, hd_ticket_comments, hd_tickets
```

**2.4 — Triggers, policies and inbound foreign keys followed the tables:**

```sql
select c.relname, count(*) filter (where t.tgname is not null) as triggers,
       (select count(*) from pg_policy where polrelid = c.oid) as policies,
       (select count(*) from pg_constraint where confrelid = c.oid and contype = 'f') as inbound_fks
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pg_trigger t on t.tgrelid = c.oid and not t.tgisinternal
where n.nspname = 'public' and c.relname like 'hd_%'
group by c.oid, c.relname order by c.relname;
-- expect (unchanged from before): hd_ai_analysis 1/1/0 · hd_customers_info 1/5/0
--   hd_notifications 0/2/0 · hd_profiles 3/3/14 · hd_ticket_audit_logs 0/1/0
--   hd_ticket_comments 0/2/0 · hd_tickets 1/3/3
```

The 14 inbound FKs on `hd_profiles` are other applications' tables pointing at
it. If that number dropped, stop and roll back.

---

## Step 3 — (a) Signup still works, instance-wide

**Run this before deploying the web app.** `public.handle_new_user` is a
database trigger on `auth.users`; it does not care what code is deployed. It is
also the check with the widest blast radius on this instance — it fires for
every signup from every project — so it is the first thing to confirm and the
fastest to attribute.

Sign up a throwaway user through the ticket-system portal (or any auth entry
point on this instance) and then:

```sql
select u.id, u.email, u.created_at, p.id is not null as profile_created, p.role
from auth.users u
left join public.hd_profiles p on p.id = u.id
where u.email = '<throwaway address>';
-- expect: one row, profile_created = true, role = 'customer'
```

A failure here looks like the signup itself erroring out, not like a missing
row — the trigger aborts and the insert into `auth.users` rolls back. **If
signup fails, roll back immediately.** Do not attempt a forward fix; three
other applications share this trigger point.

Clean up the throwaway user afterwards.

---

## Step 4 — Deploy `ticket-system`

Merge/deploy `feat/schema-prefix-hd`. Wait for the deployment to report ready
before continuing; a half-deployed app produces confusing results in step 5.

---

## Step 5 — (b) Creating a ticket from the portal

Log in as a customer and open a ticket through the portal. Then:

```sql
select id, ticket_number, status, assigned_to, created_by, created_at
from public.hd_tickets order by created_at desc limit 1;
-- expect: the ticket you just created, with a ticket_number continuing the
-- existing sequence (ticket_number_seq keeps its value across the rename)
```

Then walk one lap of the paths that write the other tables:

| What to do | What to check |
|---|---|
| Post a public comment | `select count(*) from public.hd_ticket_comments;` increments |
| Post an internal note as staff | `select type, user_id from public.hd_notifications order by created_at desc limit 1;` |
| Change the ticket status as an agent | `select action from public.hd_ticket_audit_logs order by created_at desc limit 1;` |
| Open the customer's record | the `hd_customers_info` join renders, no 500 |

**Expected non-failure:** AI triage may fail to persist its analysis. That is
the pre-existing `assign_ticket_to_agent` defect baselined in step 0.2, not
fallout from the rename. Confirm the shape of the error before treating it as
anything else:

```sql
-- Postgres logs will show, if it fires:
--   ERROR:  function assign_ticket_to_agent(uuid) does not exist
select count(*) from public.hd_ai_analysis;   -- likely still 0
```

---

## Step 6 — (d) The Realtime channels

The application subscribes at **seven** points. Six of them can receive events;
**one never could**, and that is not a regression:

| # | Where | Table | Published? |
|---|---|---|---|
| 1 | `ops/useOpsRealtime.ts:89` | `hd_tickets` INSERT | yes |
| 2 | `ops/useOpsRealtime.ts:103` | `hd_tickets` UPDATE | yes |
| 3 | `ops/useOpsRealtime.ts:115` | `hd_ticket_comments` INSERT | yes |
| 4 | `ops/useOpsRealtime.ts:127` | `hd_ticket_audit_logs` INSERT | yes |
| 5 | `components/layout/AppShell.tsx:188` | `hd_notifications` INSERT | yes |
| 6 | `components/tickets/TicketComments.tsx:125` | `hd_ticket_comments` INSERT | yes |
| 7 | `components/tickets/AISupportChat.tsx:46` | `hd_profiles` UPDATE | **no** |

Point 7 subscribes to a table that is not in `supabase_realtime` and never was.
Realtime does not error on this — it silently sends nothing. It is out of scope
here; flagging it so its silence is not read as rename damage.

Test with **two browser sessions**, because a subscription that is filtered or
unauthorised also fails silently — a single session refreshing proves nothing:

- **Session A**: admin on `/ops`. **Session B**: agent, opens a ticket and
  posts a comment → A's console must update **without a refresh** (covers 1–4).
- **Session B** posts an internal note assigned to A → A's bell must increment
  **without a refresh** (covers 5).
- Both sessions on the same ticket detail page; B comments → A's thread appends
  **without a refresh** (covers 6).

If a channel is silent, check `realtime.setAuth(access_token)` is being called
on that client before assuming the publication is at fault: without it the
policies evaluate as `anon` and the server sends nothing, with no error.

---

## Step 7 — Deploy `vidal-helpdesk-mcp`

Deploy `feat/schema-prefix-hd` from that repo. Until this lands, the SLA audit
and the health probe are querying tables that no longer exist.

---

## Step 8 — (c) The dead-man's switch

```bash
curl -s -H "Authorization: Bearer $AUDIT_CRON_SECRET" \
  https://$MCP_HOST/api/health/audit | tee /dev/stderr | \
  grep -q '"supabase": "ok"' && echo HEALTH_OK || echo HEALTH_FAILED
```

Expect HTTP 200 and `"supabase": "ok"`, `"supabaseError": null`,
`"schema": "public"`, `"organizationId": "set"`.

This endpoint's whole job is to probe `hd_tickets` directly, so a
`"supabase": "error"` here with a message mentioning a missing relation means
the deploy did not take. Compare against the step 0.3 baseline.

Then confirm the audit pipeline itself, which is the part that fails *silently*
and is the reason this coordination matters:

```sql
select id, created_at, overall_severity, findings_count
from public.audit_runs order by created_at desc limit 3;
```

The next scheduled run must produce a row. `audit_runs` belongs to the MCP and
is not part of the rename; it is the evidence that the renamed tables are
readable from that side.

---

## Rollback triggers

Roll back — `docs/sql/rollback_schema_prefix_hd.sql` **and** revert both
deploys — on any of:

- Step 1 assertions fire (already rolled back; just stop)
- Step 2.2 returns any row
- Step 2.4 shows fewer than 14 inbound FKs on `hd_profiles`
- **Step 3 signup fails** — instance-wide, do not attempt a forward fix
- Step 5 cannot create a ticket

Do **not** roll back for: `hd_ai_analysis` staying at 0 rows (step 0.2), or
channel 7 in step 6 being silent. Both are pre-existing.
