# HelpDesk AI

![Next.js](https://img.shields.io/badge/Next.js-15.5.20-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

HelpDesk AI es una plataforma SaaS de soporte IT para pymes suizas. Centraliza tickets, asignacion de agentes, comentarios, SLA, notificaciones y analitica, con triage y asistencia de respuesta mediante IA en una interfaz DE/EN/ES.

El producto aplica principios de privacidad por diseno: aislamiento por organizacion, RLS, minimizacion antes de enviar contenido a proveedores de IA y trazabilidad de cambios. Estos controles son una base tecnica para DSG/nDSG y GDPR; no constituyen por si solos una certificacion legal.

## Capacidades

- Portal de cliente para alta, seguimiento, reapertura y comentarios de tickets.
- Cola operativa para agentes, managers y administradores.
- Estados, prioridades, categorias, asignacion automatica y politicas SLA.
- Triage, traduccion y respuestas sugeridas mediante Anthropic.
- Base de conocimiento RAG opcional mediante embeddings de OpenAI y pgvector.
- Notificaciones, correo entrante y cron diario de evaluacion SLA.
- Administracion de usuarios y configuracion de privacidad por organizacion.

El checkout existe como stub y no procesa pagos. Las capacidades futuras se mantienen en [ROADMAP.md](./ROADMAP.md).

## Arquitectura

| Ruta | Responsabilidad |
| --- | --- |
| `app/[locale]/` | Rutas publicas, autenticacion y aplicacion internacionalizada |
| `app/api/` | Route Handlers HTTP, cron, correo e integraciones |
| `app/actions/` | Server Actions autenticadas |
| `components/` | UI por dominio y componentes base |
| `lib/` | Autorizacion, datos, SLA, IA, email y validacion |
| `docs/` | Esquema y migraciones SQL |
| `tests/` | Tests de seguridad y logica critica |

Consulta [ARCHITECTURE.md](./ARCHITECTURE.md), [DOMAIN.md](./DOMAIN.md) y [SECURITY.md](./SECURITY.md) antes de modificar flujos de datos o permisos.

## Requisitos

- Node.js 20 o superior.
- Proyecto Supabase con PostgreSQL y Auth.
- Proyecto Vercel para despliegue y cron.
- Clave Anthropic para funciones de IA.
- Clave OpenAI solo si se activa RAG.
- Resend solo si se activa correo saliente.

## Configuracion local

```bash
npm ci
cp .env.local.example .env.local
npm run dev
```

Completa `.env.local` sin reutilizar secretos entre entornos. Los secretos de `CRON_SECRET`, `EMAIL_INGEST_SECRET` y `SETUP_SECRET` deben ser aleatorios y tener al menos 32 caracteres.

Variables esenciales:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL publica del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anonima protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones servidor; nunca exponer al cliente |
| `ANTHROPIC_API_KEY` | Triage, traduccion y respuestas sugeridas |
| `OPENAI_API_KEY` | Embeddings RAG opcionales |
| `CRON_SECRET` | Autenticacion fail-closed de `/api/cron/sla` |
| `EMAIL_INGEST_SECRET` | Autenticacion fail-closed de `/api/email/inbound` |
| `SETUP_SECRET` | Proteccion de la operacion excepcional de setup |
| `SETUP_ADMIN_USER_ID` | UUID del usuario para setup controlado |
| `SETUP_ORGANIZATION_ID` | UUID de organizacion para setup controlado |

## Base de datos

El estado de produccion debe verificarse con el historial del proyecto Supabase. Para un entorno nuevo, revisa y aplica de forma controlada:

1. `docs/migration_v1_final.sql`
2. `docs/migration_schema_consistency.sql`
3. `docs/migration_phase1_routing.sql`
4. `docs/migration_rls_profiles_fix.sql`
5. `docs/migration_security_hardening.sql`
6. `docs/rag_migration.sql` solo si RAG esta habilitado

No ejecutes migraciones directamente en produccion sin backup, revision del diff y prueba en staging. La migracion de hardening revoca la capacidad del usuario de cambiar `role`, `organization_id` e `is_active`, y corrige el alcance tenant de comentarios, adjuntos y analisis IA.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

`npm run seed:full` es destructivo y solo funciona si se establece deliberadamente `ALLOW_DESTRUCTIVE_SEED=I_UNDERSTAND` junto con todas las variables `SEED_*`.

## Seguridad operativa

- El registro publico crea unicamente usuarios `customer`.
- Agentes y managers se crean desde administracion autenticada.
- Los endpoints privilegiados devuelven `503` si falta su secreto y `401` si el token no coincide.
- `service_role` se limita a codigo servidor y exige filtros tenant explicitos.
- Las credenciales demo no se versionan ni se imprimen en logs.
- Rota inmediatamente cualquier credencial que haya existido en el historial Git.

Consulta [SECURITY.md](./SECURITY.md) para amenazas, respuesta y disclosure.

## CI y despliegue

GitHub Actions ejecuta instalacion determinista, lint, typecheck, tests, build y auditoria de vulnerabilidades high. Vercel debe desplegar solo despues de superar CI y disponer de todas las variables del entorno objetivo.

Antes de promover a produccion:

1. Aplicar y verificar migraciones en staging.
2. Probar aislamiento entre dos organizaciones con usuarios reales de test.
3. Verificar cron y webhooks con secretos distintos a desarrollo.
4. Confirmar politicas de retencion, proveedores, DPA y residencia de datos.
5. Medir Lighthouse y accesibilidad; no publicar puntuaciones no verificadas.

## Estado

El estado previo y los riesgos encontrados estan documentados en [CURRENT_TRUTH.md](./CURRENT_TRUTH.md). Los cambios relevantes se registran en [CHANGELOG.md](./CHANGELOG.md).
