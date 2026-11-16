# Fase 0 — Endurecimiento · notas para el PR (QA de la especificación)

Rama `fix/phase0-hardening` · alcance T3–T9 (app). T2 (MCP) va en su propio repo.

## Decisiones de implementación que no estaban cerradas en la spec

1. **Qué significa "el email falló" (REQ-F0-04, D1-C).**
   - *Recuperación de contraseña:* `sendEmail()` devuelve `delivered: false` (`not_configured`, `send_failed`, `no_recipient`).
   - *Alta de cliente:* la única señal disponible es el error de `inviteUserByEmail`. Se considera fallo de email solo si el código es `over_email_send_rate_limit` o el mensaje es "Error sending … email" / "email rate limit exceeded" (`isInviteEmailFailure`). Un invite correcto significa que Supabase Auth aceptó el mensaje; los rebotes posteriores no son observables.
2. **Fallback del alta.** Si el invite falla por email, GoTrue no crea la cuenta. Con `ADMIN_LINK_HANDOFF=true` la ruta crea la cuenta con `generateLink({ type: "invite" })` y entrega ese enlace al admin. Con el flag apagado responde 502 y no crea nada. **Supuesto no verificado contra producción:** que GoTrue revierte el usuario cuando falla el envío.
3. **El magic link "de cortesía" se elimina.** Antes se generaba en cada alta. Con un invite entregado ya no se emite ningún enlace; si el cliente no termina de poner contraseña, el admin usa el restablecimiento.
4. **Auditoría.** `hd_ticket_audit_logs` es por ticket y no admite eventos de cuenta. La emisión queda en log estructurado (`[audit] access link issued`: actor, destinatario, organización, tipo, entrega, decisión; nunca el enlace ni el email). Tabla de auditoría de administración: Fase 1.
5. **Cuota: fallo cerrado.** Si `hd_consume_ai_quota` no existe o falla, los endpoints responden 503. **La migración `202611160001` debe aplicarse antes de desplegar el código.**
6. **RLS de `hd_customers_info`.** Se añade el helper `public.hd_is_same_org_profile(uuid)` (SECURITY DEFINER, `search_path` fijo) porque la tabla no tiene `organization_id`. La migración aborta si `public.current_profile_role()` / `current_profile_org_id()` no existen o si la función que realmente lee `hd_profiles` no es SECURITY DEFINER con `search_path` fijo. En producción (verificado en solo lectura el 2026-11-16) las funciones `public.*` son envoltorios SECURITY INVOKER sobre `private_public.*` (DEFINER); la comprobación acepta esa forma y se probó con pgTAP en ambas formas.
7. **Chat:** el panel envía solo los últimos 19 turnos para respetar el máximo de 20 del servidor.

## Verificación

- `npm run check`: lint 0 avisos, typecheck, Vitest.
- pgTAP ejecutado en PostgreSQL 16 local desechable (CI usa 17): `ai_quota` 36/36, `customers_info_rls` 38/38, `user_identity` 42/42, `tickets_write_policies` 22/22. Migraciones aplicadas dos veces (idempotencia). Prueba de concurrencia manual: 24 llamadas paralelas con límite 5 → exactamente 5 aceptadas.
- **No aplicado a ninguna base de datos real. Sin despliegue.**

## Pendiente de autorización del propietario

- Aplicar `202611160001_ai_quota.sql` y `202611160002_customers_info_rls.sql` en producción (antes: `select * from pg_policies where tablename = 'hd_customers_info';` como copia para rollback).
- Definir `ADMIN_LINK_HANDOFF` en Vercel (`true` solo en la demo).
- `docs/migration_differential.sql` conserva el UUID real del admin (legado, Fase 1).

© VIDAL ECOSYSTEM
