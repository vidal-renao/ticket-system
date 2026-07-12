# Current Truth

Fecha de auditoria inicial: 2026-07-12

## Resumen ejecutivo

HelpDesk AI es una aplicacion SaaS multi-tenant de ticketing para pymes suizas. El producto incluye portal de cliente, cola de agentes, administracion, analitica, SLA, notificaciones, correo entrante, internacionalizacion DE/EN/ES y asistencia mediante Anthropic/OpenAI.

El proyecto compila y tiene una base funcional amplia, pero el estado inicial no es apto para produccion. Existen controles de autorizacion incompletos en SQL y endpoints privilegiados que fallan abiertos si sus secretos no estan configurados. Tambien hay credenciales de demostracion persistidas en scripts versionados, dependencias con vulnerabilidades conocidas, ausencia total de tests y CI, y documentacion que afirma cumplimiento DSG/nDSG sin evidencia operativa suficiente.

Veredicto inicial: **NOT READY**.

## Producto y actores

| Area | Estado observado |
| --- | --- |
| Objetivo | Gestion de soporte IT con triage asistido por IA y seguimiento de SLA |
| Cliente | Crea tickets, consulta sus tickets, comenta y usa soporte asistido |
| Agente | Gestiona cola, asignacion, comentarios, traduccion y respuestas sugeridas |
| Manager | Accede a operacion y analitica de la organizacion |
| Admin | Gestiona usuarios, categorias y configuracion organizativa |
| Funcionalidades parciales | Checkout es un stub; RAG depende de migraciones y `OPENAI_API_KEY`; correo y cron dependen de secretos no documentados en el ejemplo de entorno |
| Funcionalidades abandonadas o divergentes | README y migraciones describen variantes distintas del esquema; existen varios scripts de seed y reparacion con credenciales fijas |

## Stack real

| Capa | Implementacion observada |
| --- | --- |
| Frontend | Next.js 15.5.15 App Router, React 19.2.5, TypeScript 5.9.3, Tailwind CSS 4.2.2, Framer Motion, Lucide, Sonner |
| Routing e i18n | App Router con rutas `[locale]`; next-intl 4.9.1; DE por defecto, EN y ES |
| Estado y datos | React Server Components, componentes cliente, Server Actions y llamadas REST; sin store global |
| Backend | Route Handlers de Next.js y Server Actions desplegables en Vercel |
| Datos | Supabase PostgreSQL en esquema `public`, Supabase Auth y RLS |
| IA | Anthropic para triage, traduccion y respuestas; OpenAI embeddings para RAG |
| Operacion | Vercel y Vercel Cron para SLA; no hay workflow CI versionado |
| Calidad | TypeScript strict; ESLint instalado pero comando roto; sin formatter, tests, coverage ni CI |

## Arquitectura actual

- `app/`: rutas, pantallas, Route Handlers y Server Actions.
- `components/`: UI agrupada por area, con parte de la logica de interaccion y datos.
- `lib/`: autorizacion, visibilidad, SLA, notificaciones, email, IA y clientes Supabase.
- `docs/`: multiples snapshots y migraciones SQL no consolidadas.
- `scripts/`: seeds y scripts de recuperacion con operaciones destructivas y credenciales fijas.
- `messages/` e `i18n/`: catalogos y routing internacionalizado.

La aplicacion usa clientes `service_role` de forma extensa en rutas y paginas. Esto evita RLS y desplaza la seguridad a filtros manuales por consulta. Algunas rutas lo hacen correctamente, pero el patron aumenta el riesgo de IDOR y fuga cross-tenant y ya existen politicas SQL que no incluyen el tenant.

## Modelo de datos observado

La migracion declarada como final define `organizations`, `profiles`, `categories`, `sla_policies`, `tickets`, `ticket_comments`, `ticket_attachments`, `ai_analysis`, `audit_logs`, `notifications` y `knowledge_chunks`, con indices de operacion, triggers de timestamps/SLA/auditoria y RLS.

No existe evidencia en el repositorio que permita asegurar cual combinacion de migraciones esta aplicada en produccion. `schema.sql`, `migration_v1_final.sql`, `migration_differential.sql`, `migration_schema_consistency.sql`, `migration_phase1_routing.sql` y `migration_rls_profiles_fix.sql` contienen estados parcialmente solapados.

## Validacion inicial

| Comando | Resultado inicial |
| --- | --- |
| `npm ci` | Correcto tras limpiar una instalacion parcial; 391 paquetes instalados |
| `npx tsc --noEmit` | Correcto |
| `npm run lint` | Fallido: `next lint` abre configuracion interactiva y esta deprecado |
| Tests | No existe script ni suite de tests |
| `npm run build` | Correcto; 73 paginas generadas, warning de cache Webpack por string de 215 KiB |
| `npm audit` | 8 vulnerabilidades: 3 high, 4 moderate, 1 low |

## Hallazgos priorizados

### P0

1. `/api/admin/setup` y `/api/email/inbound` aceptan solicitudes sin autenticacion cuando falta su secreto. El primer endpoint puede promover una identidad fija a admin usando `service_role`; el segundo puede crear tickets y comentarios privilegiados.
2. Las politicas RLS de comentarios y `ai_analysis` no delimitan correctamente por ticket y organizacion. Un usuario autenticado puede alcanzar datos de otros tenants segun la migracion aplicada.
3. La politica de actualizacion del perfil propio solo protege `id`; permite modificar campos sensibles como `role` u `organization_id` mediante acceso directo a Supabase. Esto habilita escalada de privilegios.
4. Hay contrasenas conocidas y correos reales versionados en migraciones y scripts de seed/recuperacion. Deben considerarse comprometidas y rotarse.

### P1

1. El registro publico transforma el tipo `employee` en rol `agent` usando un UUID de organizacion como unico factor de vinculacion. No existe invitacion firmada, expirable y de un solo uso.
2. El uso generalizado de `service_role` en la aplicacion evita la defensa RLS y exige filtros manuales consistentes en cada consulta.
3. Next.js 15.5.15 y dependencias transitivas presentan vulnerabilidades conocidas, incluidas variantes de bypass de middleware, SSRF y DoS.
4. No hay tests de autorizacion, aislamiento tenant, ciclo de ticket, SLA ni endpoints privilegiados.
5. No hay CI que bloquee cambios sin typecheck, lint, tests, build y audit.

### P2

1. `next lint` no es un control utilizable y no existe configuracion ESLint propia.
2. Hay paginas de 426 a 806 lineas y componentes de hasta 419 lineas, con consultas y presentacion acopladas.
3. Variables de entorno se leen con aserciones no nulas dispersas; no hay validacion central ni error operativo claro.
4. Los logs de autenticacion incluyen identificadores y nombres de cookies; no hay logging estructurado ni redaccion consistente.
5. README y `.env.local.example` tienen texto con encoding corrupto y datos internos de una organizacion concreta.
6. No hay estrategia de migraciones verificable, rollback documentado ni fuente de verdad unica para el esquema.

### P3

1. Checkout y varias capacidades de roadmap aparecen en la UI/documentacion sin implementacion final.
2. El sistema visual tiene componentes base, pero no existe contrato documentado de tokens y variantes.
3. La validacion visual automatizada no pudo ejecutarse en esta sesion por falta del controlador de navegador integrado.

## Claims que no pueden sostenerse todavia

- No se puede afirmar cumplimiento DSG/nDSG solo por usar RLS y PII scrubbing. Faltan evidencia de residencia, contratos/DPA, retencion ejecutada, derechos del interesado, inventario de tratamientos, respuesta a incidentes y verificacion de controles.
- No existe medicion Lighthouse versionada ni presupuesto de rendimiento.
- No existe evidencia automatizada de aislamiento multi-tenant.

## Orden de estabilizacion recomendado

1. Cerrar endpoints fail-open, credenciales versionadas y escalada de rol/perfil.
2. Aplicar una migracion RLS correctiva e idempotente con pruebas de aislamiento.
3. Restringir el registro de agentes a un flujo administrado o invitaciones seguras.
4. Actualizar dependencias vulnerables y establecer lint, tests y CI obligatorios.
5. Centralizar entorno, logging y errores; consolidar la fuente de verdad de migraciones.
6. Refactorizar por features solo despues de asegurar comportamiento con tests.

