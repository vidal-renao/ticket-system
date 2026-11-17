# Runbook — SLA sweep (pg_cron every 5 minutes)

ADR-018 · migration `202611170002_sla_pg_cron.sql`.

## Set up (once)

1. Vercel → ticket-system → Environment Variables → `CRON_SECRET` (Production), a random value of at least 32 characters (`openssl rand -base64 32`). Redeploy.
2. Supabase SQL editor: `select vault.create_secret('<same value>', 'hd_cron_secret');`
3. Apply (or re-apply) `202611170002_sla_pg_cron.sql`.

## Verify (after set-up and after any rotation)

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'hd-sla-every-5-min';

select status, return_message, start_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'hd-sla-every-5-min')
 order by start_time desc limit 5;

select status_code, created from net._http_response order by created desc limit 5;
```

| `status_code` | Meaning | Action |
|---|---|---|
| 200 | The sweep ran | — |
| 401 | The Vault value differs from `CRON_SECRET`, or the Vault secret was deleted (the header becomes NULL) | Make both values equal |
| 503 | `CRON_SECRET` unset or shorter than 32 characters in Vercel | Set it and redeploy |
| 500 | The ticket scan failed; the cursor of that run is kept | Check Vercel runtime logs for `[cron/sla]` |

There is no automatic alert: check this table after every rotation and include it in the weekly operations review.

## Schedules

- pg_cron: `*/5 * * * *`.
- Vercel (backup): `2 0 * * *`, deliberately off the five-minute grid so the two never start together (the SLA audit write is read-then-insert).

## Rotate

```sql
select vault.update_secret((select id from vault.secrets where name = 'hd_cron_secret'), '<new value>');
```
Then update `CRON_SECRET` in Vercel to the same value and redeploy. Verify as above.

## Roll back

```sql
select cron.unschedule('hd-sla-every-5-min');
```

© VIDAL ECOSYSTEM
