# 🏛️ Vidal Ecosystem: L99 SaaS Master Blueprint

## 📋 Descripción
Protocolo maestro de arquitectura y despliegue para soluciones SaaS Enterprise. Este documento garantiza el cumplimiento del estándar "Swiss High-End" (ES/EN/DE), seguridad multi-tenant y optimización SEO/IA.

## 🚀 Prompt de Activación (Full Version)
> **Uso:** Copiar íntegramente en Claude Code para inicializar o escalar el proyecto.

Vidal aquí. [TOKEN_MODE: COMPACT/CLEAN/DIRECT]. 
[SKILLS_ACTIVE: frontend-design, ui-ux-pro-max, webapp-testing, web-accessibility, design-tokens, performance-audit]

OBJETIVO: Transformación integral a SaaS Global Trilingüe (ES, EN, DE) - Ecosistema Vidal L99.

1. DIRECCIÓN DE ARTE & UI/UX (Swiss High-End Standard):
- Estética: "Swiss Minimalist" (inter-var font, espaciado de 8px, bordes rounded-lg).
- Tokens: Dark/Light mode (Azul Zúrich, Gris Industrial, Blanco Alpino).
- UX: Skeletons, transiciones i18n y Hero con Glassmorphism.

2. SEO, BRANDING & INDEXACIÓN:
- Corporate Footer: "© 2026 Vidal Ecosystem. All rights reserved." + Sitemap + Enlaces Legales.
- Technical SEO: robots.txt, sitemap.ts y JSON-LD (SoftwareApplication).
- Semantic Web: Metadatos dinámicos por locale.

3. INFRAESTRUCTURA SQL & SEGURIDAD:
- Automatización: Trigger 'on_auth_user_created' (Perfil + Org con slug UNIQUE).
- RLS: Aislamiento multi-tenant total.
- Seed Data: Categorías ITIL en ES/EN/DE.

4. DASHBOARD & AI LOGIC: ✅ IMPLEMENTADO
- /tickets: Data-table trilingüe con badge 'AI Priority' (⚡ indigo, confidence ≥ 60%, diff only). ✅
- /analytics: KPIs (AI analyzed, avg confidence, PII detected, SLA at risk), Sentiment Distribution, Priority Distribution, SLA Breach Prediction, AI Accuracy. ✅
- Smart Auto-reply: Botón '✨ AI Suggest Response' (staff only) en TicketComments — Server Action `app/actions/suggest-reply.ts` → Claude Sonnet 4.6, idioma detectado, tono conciliador para frustrated/angry, editable antes de enviar. ✅
- AI Real-time Translation: Botón discreto '🌐 Translate → [LOCALE]' en descripción del ticket y por cada comentario — Server Action `app/actions/translate-text.ts` → Claude Sonnet 4.6, locale activo como target (DE/EN/ES), traducción cacheada en estado local (sin re-llamadas), toggle show/hide, texto en itálica con fondo indigo sutil. `TranslateButton` client component reutilizable. ✅

5. AUDITORÍA, QA & COMPLIANCE: ✅ IMPLEMENTADO
- PII Scrubbing: Toggle admin en /settings — Server Action `org-settings.ts` lee/escribe `organizations.settings.pii_scrubbing_enabled` (JSONB, sin migración). `lib/ai/pii-scrubber.ts` con regex (email, Swiss/intl phones, IPv4). Inyectado en `runAITriage()` antes de llamar a Claude. `PIIScrubbingToggle` client component con `role="switch"` ARIA. ✅
- ARIA Accessibility: `aria-current="page"` en nav activo, `aria-label` en botones icon-only, `htmlFor`/`id` en todos los form inputs, `role="list/listitem"` en ticket list, `aria-hidden="true"` en iconos decorativos. ✅
- LocaleSwitcher: `components/layout/LocaleSwitcher.tsx` — `role="group"`, `aria-pressed` per locale button, keyboard-navigable, integrado en Sidebar. `i18n/navigation.ts` con `createNavigation`. ✅
- README L99: Shields.io (Next.js, TS, Supabase, Tailwind, Claude, Vercel, DSG/LPD, i18n), Business Context Swiss market, AI Pipeline diagram, DSG/nDSG compliance table, Feature Matrix por rol, Project Structure. ✅

---
*Nota: Este archivo se actualiza con cada mejora implementada en el Ecosistema.*