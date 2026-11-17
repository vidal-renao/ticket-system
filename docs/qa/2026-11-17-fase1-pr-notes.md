# Fase 1 — SLA, integridad y auditoría · notas para el PR

Rama `feat/phase1-sla-integrity-audit`. Spec: `specs/2026-11-17-fase1-sla-integridad-auditoria.md`. ADR-018, ADR-019, ADR-020.

## Verificación

- `npm run check`: lint 0 avisos, typecheck, Vitest 43 archivos / 527 tests (antes de la fase: 35 / 350).
- pgTAP en PostgreSQL 16 desechable: `phase1_integrity` 36/36, `sla_pg_cron` 8/8; las migraciones 0001, 0003 y 0004 se aplicaron dos veces (idempotencia). En PostgreSQL sin pg_cron, la migración 0002 termina con NOTICE y no programa nada.
- Comprobado en producción (solo lectura): `hd_notifications` tiene `user_id`, `ticket_id`, `type` y 0 duplicados de incumplimiento, así que el índice único se podrá crear; `pg_cron` (pg_catalog), `pg_net` (extensions) y Vault están disponibles.

## Orden de despliegue

1. Merge y despliegue del código (la creación de tickets del portal pasa a service-role).
2. Migraciones `202611170001`, `202611170003`, `202611170004`.
3. `CRON_SECRET` (≥ 32) en Vercel + mismo valor en Vault (`hd_cron_secret`) → migración `202611170002`.
4. Despliegue de vidal-helpdesk-mcp (escribe en `hd_admin_audit_logs`).

## Desviaciones y decisiones de implementación

- Un fallo al escribir la auditoría de admin no revierte la acción: se registra en el log del servidor (ADR-020).
- La suite histórica `tickets_write_policies` no se modifica: prueba la migración `202608040001` tal como fue. El bloqueo de escritura se prueba en `phase1_integrity`.
- El baseline del esquema queda **pendiente** (runbook en `docs/runbooks/baseline.md`): exige filtrar a mano los objetos HelpDesk del proyecto compartido.

© VIDAL ECOSYSTEM
