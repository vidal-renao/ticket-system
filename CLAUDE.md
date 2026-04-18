# VIDAL ECOSYSTEM — MASTER ENGINEERING STANDARD

## IDENTIDAD
**Vidal Reñao** — Senior Engineer & AI-Powered SaaS Architect  
Ubicación: Basel, Switzerland · Mercado objetivo: Swiss & DACH SMEs  
Especialización: AI-Powered SaaS Infrastructure · Swiss DSG/nDSG Compliance · Microsoft 365 Enterprise

## STACK GLOBAL
| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router, RSC) |
| Language | TypeScript strict mode |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth + Entra ID (enterprise) |
| AI | Claude Sonnet 4.6 (Anthropic) |
| Deployment | Vercel |
| i18n | next-intl (ES / DE / EN) |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion 12 |

## COMANDOS (TRIGGERS)
| Comando | Acción |
|---|---|
| `/ghost` | Tono ejecutivo / humano — para comunicaciones cliente |
| `/uda` | Análisis raíz + arquitectura: leer código → diagnosticar → proponer |
| `/ooda` | Guía técnica paso a paso — orientada a implementación |
| `L99` | Modo experto senior: sin simplificaciones, edge-cases incluidos |
| `/godmode` | Profundidad máxima — arquitectura, trade-offs, alternativas |
| `/audit` | Auditoría de seguridad: OWASP Top 10, RLS, secrets, injection |

## REGLAS DE EJECUCIÓN (NO NEGOCIABLES)
1. **Sin relleno** — directo a la solución. Cero "analizando...", "explorando...", "perfecto!".
2. **Clean Architecture**: separación de capas, single responsibility, dependency inversion.
3. **Tipado estricto**: sin `any`, sin `as unknown`, interfaces > types para contratos públicos.
4. **SOLID en todo**: especialmente Open/Closed en features IA y Single Responsibility en Server Actions.
5. **Docs estándar suizo**: Mermaid (arquitectura), Shields.io (badges), ADRs (decisiones), SEO estructurado.
6. **Autonomía**: actualizar README al detectar cambios en APIs, Schema o variables de entorno.
7. **Seguridad primero**: validar en boundaries (input usuario, APIs externas). No validar código interno.
8. **No over-engineering**: 0 abstracciones especulativas. Solo la complejidad que la tarea requiere.

## REGLAS DE EJECUCIÓN (PROTOCOLO DE EFICIENCIA)
1. **Sin preámbulos** — Ninguna respuesta empieza con "Voy a...", "Entendido", "Perfecto!", "Claro que sí", "Analizando...".
2. **Edición atómica** — Un tool call por cambio lógico. Nunca leer + editar en pasos separados si el contenido ya es conocido.
3. **Cero charla** — Sin confirmaciones de recepción. Sin resúmenes al final de lo que ya es visible en el diff.
4. **Paralelismo máximo** — Todas las tool calls independientes en un único mensaje. Read + Read + Grep en paralelo, nunca en serie.
5. **No repetir el prompt** — Nunca reformular la tarea antes de ejecutarla. Directo al tool call.
6. **Respuesta mínima viable** — Solo el output que el usuario necesita. Sin explicar lo que ya es obvio por el código.
7. **Herramientas directas** — Glob/Grep/Read para búsquedas simples. Agent solo para exploración multi-paso abierta.
8. **Sin confirmaciones intermedias** — En tareas con instrucciones claras, no preguntar "¿Continúo?". Ejecutar hasta el final.
9. **Commits en cadena** — git add + commit + push en un solo Bash call encadenado con `&&`. Sin verificaciones intermedias cuando el diff es claro.
10. **Memoria no-redundante** — Guardar en memoria solo lo no-derivable del código o `git log`. Nunca guardar lo que leer el archivo ya revela.

## COMPLIANCE SWISS DSG / nDSG
- **RLS obligatorio** en todas las tablas Supabase con datos de usuario
- **Audit logs inmutables** para operaciones críticas (INSERT-only, sin UPDATE/DELETE)
- **PII Detection** antes de persistir datos sensibles — usar Claude API si aplica
- **Retención definida** por proyecto — documentar en ADR
- **Sin transferencia de datos** fuera de jurisdicción suiza sin consentimiento explícito
- **Modelo de amenazas** documentado en proyectos con datos de terceros

## ARQUITECTURA DE REFERENCIA
```
app/
├── [locale]/           ← next-intl routing
│   ├── (auth)/         ← auth group
│   ├── (dashboard)/    ← protected routes
│   └── layout.tsx      ← locale metadata + OG
├── api/                ← Route Handlers (edge-compatible)
│   └── webhooks/       ← external integrations
components/
├── ui/                 ← primitives (Button, Card, Input)
├── sections/           ← page sections (no business logic)
└── features/           ← domain components con lógica
lib/
├── supabase/           ← client + server + middleware
├── ai/                 ← Claude API wrappers
└── validations/        ← Zod schemas (single source of truth)
middleware.ts           ← next-intl + Supabase session refresh
```

## ESTÁNDARES UI/UX (SWISS QUALITY)
- **Dark mode nativo**: background `#060606`, glassmorphism con `rgba(255,255,255,0.04)`
- **Grid system**: max-w-6xl, px-6, gap-5/gap-6
- **Paleta personalizada**: prohibido colores por defecto de Tailwind sin customización — siempre paletas semánticas propias
- **Tipografía**: Geist Sans variable, `tracking-tight` en headings, `line-height: 1.7` en cuerpo, `font-mono tabular-nums` en datos numéricos
- **Sombras por capas**: nunca `shadow-md` plano — usar sombras tintadas multi-capa con baja opacidad (ej. `shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.4)]`)
- **Jerarquía visual**: sistema de 3 capas (base → elevado → flotante) con elevación real mediante border + shadow
- **Badges Shields.io**: stack, compliance, deployment status en READMEs
- **Diagramas Mermaid**: arquitectura, flujos de datos, ERD en docs/

## PROTOCOLO DE QA VISUAL & PIXEL PERFECT

### Ojo Crítico — Accesibilidad y Jerarquía
- **WCAG AA mínimo**: contraste de texto ≥ 4.5:1 sobre fondos oscuros; verificar con DevTools > Accessibility
- **Espaciados consistentes**: usar exclusivamente valores del sistema de espaciado de Tailwind (múltiplos de 4px); prohibido `margin: 3px` o valores ad-hoc
- **Jerarquía tipográfica clara**: máximo 3 niveles de tamaño por vista — H1 (`text-xl`+), label (`text-sm`), dato auxiliar (`text-xs`)
- **Color no es el único indicador**: todo estado de error/éxito/warning debe tener texto o icono además del color

### Responsive & Touch
- **Botones y targets táctiles**: mínimo `44×44px` en mobile — usar `min-h-[44px] min-w-[44px]` en elementos interactivos
- **Breakpoints obligatorios**: diseñar primero para `lg` (desktop app), verificar que no rompa en `md` y `sm`
- **Overflow controlado**: todo contenedor con texto variable debe tener `truncate` o `overflow-hidden` — prohibido desbordamiento horizontal en producción
- **Grid fluido**: `grid-cols-1 lg:grid-cols-N` — nunca columnas fijas sin fallback

### Interactividad — Estados Obligatorios
- **Hover**: todo elemento clicable debe cambiar visualmente en hover (`hover:bg-*` o `hover:opacity-*`)
- **Focus-visible**: `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none` en todos los elementos interactivos — nunca eliminar outline sin reemplazarlo
- **Active**: feedback táctil en botones — `active:scale-[0.97]` o `active:opacity-80`
- **Disabled**: estado visual claramente diferenciado — `opacity-40 cursor-not-allowed pointer-events-none`
- **Loading**: nunca dejar un botón sin feedback tras click — usar spinner o estado de texto

### Rendimiento de Animaciones
- **Solo `transform` y `opacity`**: prohibido animar `width`, `height`, `top`, `left`, `background-color` directamente — causan layout thrashing
- **Prohibido `transition-all`**: declarar propiedades explícitas — `transition-[transform,opacity]`
- **Duración estándar**: micro-interacciones `150ms`, transiciones de estado `200-250ms`, animaciones de entrada `300ms`
- **Easing**: preferir `ease-out` para entradas, `ease-in` para salidas, `spring` (Framer Motion) para elementos físicos
- **`will-change` con moderación**: solo en elementos con animación continua — no aplicar globalmente

## GESTIÓN DEL ECOSISTEMA
- Al entrar en un subproyecto: leer su `README.md` y estructura antes de actuar
- Mantener siempre los estándares globales — el contexto específico nunca los anula
- Propagar cambios de estándar al master (`VIDAL ECOSYSTEM/CLAUDE.md`) primero, luego a subproyectos
- Cada proyecto tiene su propio ADR para decisiones arquitectónicas locales

## PROYECTOS ACTIVOS (Abril 2026)
| Proyecto | Estado | Stack destacado |
|---|---|---|
| `limpiezas-najip-maritza` | Producción (dnamar.ch) | Next.js 16, Tailwind 4, Resend |
| `invoice-auto` | Avanzado | Claude Vision AI, Supabase, PWA |
| `cv-platform` | Production-ready | Node.js/Express, PostgreSQL, Twilio |
| `matchpoint-ai` | Fase 3 MVP | Claude Sonnet 4.6, 4D matching |
| `vidal-pro-portfolio` | Publicado | Next.js 16, next-intl, Framer Motion |
| `Ticket System` | En desarrollo | Next.js 15, AI Triaging, DSG |
| `vidal-standards` | Referencia | Este repositorio |
