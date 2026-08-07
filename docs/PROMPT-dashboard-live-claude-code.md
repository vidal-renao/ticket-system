# Prompt para Claude Code — Dashboard operativo EN VIVO (ticket-system)

> Pásale este fichero a Claude Code junto con `vidal-helpdesk-dashboard.jsx` (referencia visual).
> Objetivo en una frase: un panel `/dashboard` protegido que refleja el estado del helpdesk **en tiempo real** — se actualiza solo cada vez que se crea/actualiza/cierra un ticket, se añade un comentario o se registra un evento de auditoría. El email diario se queda; esto es el panel operativo que faltaba.

---

## 1. Contexto del proyecto

- Repo: `vidal-renao/ticket-system`. Stack: **Next.js 15 (App Router) + TypeScript + Tailwind + Supabase**, deploy en **Vercel**.
- Supabase project ref: `focgfmhgfmhmcbywwsej` (eu-west-1). Los datos del helpdesk viven en el schema **`public`**.
- **Fuente de verdad de tipos:** usa el `database.types.ts` generado del repo (o `supabase gen types typescript`). Las columnas de `tickets` de abajo están **confirmadas contra la BD en vivo**; para el resto de tablas, confía en los tipos generados / introspecciona, no inventes.

---

## 2. Modelo de datos real (confirmado)

**`public.tickets`** (RLS activa) — columnas relevantes:
```
ticket_number bigint · title text · description text
status text            -- valores observados: open | in_progress | closed
priority text          -- critical | high | medium | low
category text · source text · detected_language text · contains_pii bool
organization_id uuid · assigned_to uuid · assigned_team_id uuid · created_by uuid
created_at · first_response_at · resolved_at · closed_at (timestamptz)
sla_breached bool · sla_response_breached bool · sla_resolution_breached bool
response_due_at · resolution_due_at (timestamptz)
review_status text · deleted_at timestamptz   -- filtrar siempre deleted_at IS NULL
```

**`public.organizations`**: `name`, `tier`, `plan` (hoy hay 1 org: "Vidal Real Estate", enterprise — pero **NO lo hardcodees**, filtra por el org del usuario vía RLS).

**`public.ticket_comments`** (27 filas) y **`public.ai_analysis`** (análisis IA por ticket: `suggested_priority`, `sentiment`, `summary`, `confidence_score`, `detected_language`): introspecciona columnas exactas desde los tipos del repo.

**`public.ticket_audit_logs`**: `action`, `resource_type`, `resource_id`, `actor_role`, `old_values jsonb`, `new_values jsonb`, `created_at`. Es el log semántico de cambios — úsalo para enriquecer el feed de actividad.

**`helpdesk.audit_runs`** (histórico SLA, 275 filas): schema `helpdesk` **NO expuesto a PostgREST** → inalcanzable por anon. Léelo **solo server-side con service_role** a través de la vista `public.audit_runs` (security_invoker, service_role-only, creada en el fix 4A.16). Campos útiles: `reporting_period_start`, `status`, `provider_confirmed_at`, `provider_message_id`, `payload_snapshot` (contiene el HTML del email con el % compliance).

---

## 3. Arquitectura requerida

- **Server Component** (`app/dashboard/page.tsx`): valida sesión, hace el **fetch inicial** de tickets del org del usuario (cliente autenticado → RLS filtra) + llama a la API de auditoría. Pasa `initialData` al cliente.
- **Client Component** (`DashboardClient.tsx`): recibe `initialData` y se **suscribe a Supabase Realtime**:
  - `postgres_changes` en `public.tickets` (event `*`)
  - `postgres_changes` en `public.ticket_comments` (INSERT)
  - `postgres_changes` en `public.ticket_audit_logs` (INSERT)
  - Hace merge en estado local (React state), recalcula KPIs y empuja al feed de actividad.
- **API route** (`app/api/audit/route.ts`): server-only, usa **service_role** para leer `public.audit_runs` (última entrega + histórico 30d para sparkline). El service key **nunca** sale al cliente.
- **Auth:** la ruta exige sesión. El usuario debe ser miembro del org; el cliente autenticado + RLS garantiza que solo ve lo suyo.

---

## 4. ⚠️ Requisitos críticos de Realtime (esto es lo que la gente olvida y provoca "no pasa nada en silencio")

1. **Publicación:** Realtime no emite hasta que las tablas estén en la publicación. Crea migración:
   ```sql
   -- supabase/migrations/xxxx_dashboard_realtime.sql
   alter publication supabase_realtime add table
     public.tickets, public.ticket_comments, public.ticket_audit_logs;
   ```
2. **RLS + Realtime:** Realtime **respeta RLS**. El cliente del navegador debe crearse **con la sesión del usuario** (token JWT) para que emita solo las filas autorizadas. Verifica que existen policies `SELECT` para el miembro del org en las tres tablas; si Realtime no llega nada, casi siempre es esto o el punto 1.
3. **Reconexión:** maneja el estado del canal (`SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT`) y reintenta. Muestra un indicador visual de "Realtime conectado / reconectando".

---

## 5. UI / diseño — "console suizo" (dark), reusar la referencia adjunta

Adjunto `vidal-helpdesk-dashboard.jsx` como **referencia visual y de estructura** (misma paleta, tipografía y secciones). Portarlo a la arquitectura de arriba, no reescribir la estética desde cero.

**Tokens:**
- Fondo `#0B0F14` · paneles `#121A23` · hairlines `#1E2A36` · texto `#E6EDF3` · muted `#8A99A8`
- Acento de marca (oro): `#E0A82E` (compliance/firma). Estados: emerald `#10B981` · blue `#3B82F6` · amber `#F59E0B` · red `#EF4444` · slate `#64748B`
- Tipografía: `Segoe UI` para UI, `Cascadia Code`/mono para datos/timestamps/nº de ticket
- Prioridades: critical rojo · high ámbar · medium azul · low slate. Estados: open ámbar · in_progress azul · closed slate.

**Secciones (todas se actualizan en vivo salvo la de auditoría):**
1. **Top bar:** marca `VIDAL ECOSYSTEM`, org del usuario, badge "Swiss DSG", **indicador de estado Realtime** (punto verde pulsante = conectado).
2. **Ribbon de KPIs** (mono, tabular): compliance %, activos, abiertos, en progreso, cerrados, SLA breaches, VIP risks, total. Recalculados en cada evento.
3. **Gráficos** (Recharts): estado (donut) · prioridad (barras horizontales) · flujo mensual creados vs resueltos.
4. **Tabla de tickets:** filtros por estado/prioridad + búsqueda por título/nº. Cuando llega un INSERT/UPDATE por Realtime, la fila afectada hace un **highlight momentáneo** (~1.5s).
5. **Feed de actividad en vivo:** merge de `tickets` + `ticket_comments` + `ticket_audit_logs` en un timeline (creado → primera respuesta → comentario → resuelto → cerrado), evento nuevo entra por arriba con animación de entrada.
6. **Panel de auditoría SLA** (server data, no realtime): última entrega, `provider_confirmed`, cron `0 6 * * *`, sparkline de compliance 30d.

---

## 6. Implementación

- Helpers Supabase: `lib/supabase/client.ts` (browser, anon key + sesión → Realtime) y `lib/supabase/server.ts` (service_role, solo server, para auditoría).
- **Recharts** para gráficos. **Sin `localStorage`/`sessionStorage`** (usa React state).
- Debounce del recálculo de KPIs si llegan ráfagas de eventos.
- Responsive hasta móvil, foco de teclado visible, `prefers-reduced-motion` respetado (desactiva pulsos/entradas animadas).

**Estructura de ficheros sugerida:**
```
app/dashboard/page.tsx                 # server: sesión + fetch inicial
app/dashboard/DashboardClient.tsx      # client: realtime + estado
app/dashboard/_components/*            # ribbon, charts, table, feed, audit-panel
app/api/audit/route.ts                 # service_role: audit_runs
lib/supabase/{client,server}.ts
supabase/migrations/xxxx_dashboard_realtime.sql
```

---

## 7. Criterios de aceptación (defínelos como checklist y valídalos)

- [ ] Abro `/dashboard` en dos pestañas; creo o cierro un ticket en una → la otra se actualiza **sin refrescar** en < 2 s.
- [ ] KPIs, gráficos, tabla y feed reflejan el cambio de forma consistente.
- [ ] Añadir un comentario o un `ticket_audit_logs` aparece en el feed en vivo.
- [ ] El **service_role key nunca llega al bundle del cliente** (verifícalo con `grep -r "service_role" .next` → 0 resultados; y que no esté en ningún `"use client"`).
- [ ] RLS real: un usuario de otro org no ve tickets ajenos (probar con dos sesiones si es viable, o razonar sobre las policies).
- [ ] `npm run build` pasa y despliega en Vercel sin errores de tipos.
- [ ] `prefers-reduced-motion` desactiva animaciones.

---

## 8. Fuera de alcance (no tocar)

- El pipeline de email/audit cron (`vidal-helpdesk-mcp`) **ya funciona** — no lo modifiques.
- El dead-man's-switch del monitor externo es **otro workflow**, no va aquí.
- No cambies el esquema salvo la migración de publicación Realtime del punto 4.

---

## 9. Antes de empezar — confírmame

1. Introspecciona `ticket_comments` y `ai_analysis` y dime las columnas exactas que vas a usar en el feed.
2. Verifica si ya existe autenticación/sesión en el repo (layout, middleware) para colgar la ruta protegida; si no, dímelo antes de crear login desde cero.
3. Confirma que las policies RLS de `SELECT` sobre las tres tablas cubren al miembro del org; si falta alguna, propón la migración (sin aplicarla) y espera visto bueno.
