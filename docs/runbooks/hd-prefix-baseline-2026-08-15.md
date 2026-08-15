# `hd_` prefix — step 0 baseline

Captured read-only from production (`focgfmhgfmhmcbywwsej`) on 2026-08-15,
**before** any part of the rename was applied. Step 2 of
[hd-prefix-application.md](hd-prefix-application.md) compares against these
numbers; anything that differs and is not explained here is a regression.

## 0.2 — The known landmine

```
assign_ticket_to_agent_count = 0
```

`public.trg_auto_assign_on_ai_analysis` calls a function that does not exist.
Its trigger is `AFTER INSERT` on the analysis table, so inserts for a ticket
with `assigned_to IS NULL` already fail and roll back **today**. Pre-existing.
Not caused by the rename, not fixed by it.

## Per-table structure

Every one of these must be identical after the rename, under the `hd_` name.

| Table | Triggers | Policies | Indexes | Inbound FKs | Outbound FKs | RLS |
|---|---|---|---|---|---|---|
| `ai_analysis` | 1 | 1 | 1 | 0 | 1 | on |
| `customers_info` | 1 | 5 | 2 | 0 | 1 | on |
| `notifications` | 0 | 2 | 2 | 0 | 2 | on |
| `profiles` | 3 | 3 | 11 | **14** | 2 | on |
| `ticket_audit_logs` | 0 | 1 | 3 | 0 | 2 | on |
| `ticket_comments` | 0 | 2 | 3 | 0 | 2 | on |
| `tickets` | 1 | 3 | 12 | 3 | 9 | on |

**34 indexes total.** The 14 inbound FKs on `profiles` are other applications'
tables pointing at it — the single most sensitive number on this page. If it
drops, roll back.

## Policy names (all keep these names — the rename is cosmetic for them)

| Table | Policies |
|---|---|
| `ai_analysis` | `ai_analysis_read_authorized` (r) |
| `customers_info` | `Customer Info Access` (all), `Users can view their own company info` (r), `admins_manage_org_customer_info` (all), `customers_manage_own_info` (all), `staff_read_org_customer_info` (r) |
| `notifications` | `service_insert_notifications` (a), `users_own_notifications` (all) |
| `profiles` | `admins_manage_profiles` (all), `profiles_read_authorized` (r), `profiles_self_update` (w) |
| `ticket_audit_logs` | `ticket_audit_logs_staff_read` (r) |
| `ticket_comments` | `ticket_comments_create_authorized` (a), `ticket_comments_read_authorized` (r) |
| `tickets` | `customers_create_tickets` (a), `tickets_read_enterprise_scope` (r), `tickets_update_enterprise_scope` (w) |

## Triggers (all follow their table automatically)

| Table | Trigger → function |
|---|---|
| `ai_analysis` | `ai_analysis_auto_assign` → `trg_auto_assign_on_ai_analysis` (AFTER INSERT) |
| `customers_info` | `customers_info_updated_at` → `set_updated_at` |
| `profiles` | `profiles_reference_code_immutable` → `rve_reference_code_immutable` |
| `profiles` | `profiles_set_employee_id` → `trg_set_employee_id` |
| `profiles` | `profiles_set_reference_code` → `rve_set_reference_code` |
| `tickets` | `tickets_customer_update_guard` → `tickets_guard_customer_update` |

`auth.users` carries four triggers, only one of which is ours:
`on_auth_user_created` → `public.handle_new_user`. The other three
(`omni_on_auth_user_created`, `rolewise_on_auth_user_created`,
`waai_on_auth_user_created`) belong to other applications and touch none of
these tables.

## Realtime publication

```
supabase_realtime → notifications, ticket_audit_logs, ticket_comments, tickets
```

Four of the seven. `profiles`, `ai_analysis` and `customers_info` are not
published — which is why the `AISupportChat` subscription to `profiles` has
never received an event.

## Row counts and sequence

| | |
|---|---|
| All seven tables | **0 rows** |
| `ticket_number_seq.last_value` | **75** |
| `auth.users` | **25** |

Two falsifiable expectations follow from this:

- **Step 3 (signup):** `auth.users` goes 25 → 26, and `hd_profiles` gains its
  first row, with `role = 'customer'`.
- **Step 5 (create ticket):** the first ticket created through the portal is
  **TK-0076**. The sequence is independent of the table name, so a number that
  restarts at 1 means something went wrong with the default.

## Not captured here

- **0.1 function definitions** — already reproduced verbatim in
  [../sql/rollback_schema_prefix_hd.sql](../sql/rollback_schema_prefix_hd.sql),
  which is the artifact that would actually restore them.
- **0.3 health endpoint** — needs `AUDIT_CRON_SECRET`, which the operator
  holds. Run the curl in step 0.3 of the runbook and confirm 200 before
  starting.
