# AI-Powered Helpdesk Ticket System 🇨🇭

[![Stack: Next.js 15](https://img.shields.io/badge/Framework-Next.js%2015-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Database: Supabase](https://img.shields.io/badge/Database-Supabase-active?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![AI: Claude Sonnet 4.6](https://img.shields.io/badge/AI-Claude%20Sonnet%204.6-7c3aed?style=for-the-badge&logo=anthropic)](https://anthropic.com/)
[![Compliance: DSG/nDSG](https://img.shields.io/badge/Compliance-DSG%2FnDSG-blue?style=for-the-badge)](https://www.fedlex.admin.ch/eli/cc/1993/1945_1945_1945/de)

**AI-Powered SaaS Infrastructure** de alto rendimiento diseñada específicamente para el ecosistema empresarial suizo. Este sistema optimiza las operaciones de soporte técnico mediante triaje inteligente, análisis de sentimiento y cumplimiento estricto de la privacidad de datos.

---

## 🏛️ Business Context
Esta infraestructura no es solo un gestor de tickets; es un motor de eficiencia operativa:
* **Swiss Quality Standard:** Interfaz multi-idioma nativa (DE, FR, IT, EN).
* **DSG/nDSG Compliant:** Implementación de PII Scrubbing (limpieza de datos sensibles) antes de procesar con IA.
* **AI-Driven Triage:** Clasificación automática de prioridad y categoría basada en el contexto semántico del usuario.
* **RAG Ready:** Sistema de recuperación aumentada para respuestas basadas en documentación técnica interna.

---

## 🏗️ Architecture & Directory Structure

| Capa | Propósito |
| :--- | :--- |
| `app/` | Routing de Next.js con soporte para i18n dinámico y layouts administrativos. |
| `components/` | Librería de componentes UI optimizada con Tailwind CSS y accesibilidad ARIA. |
| `lib/ai/` | El core del sistema: Lógica de Triage (Claude) y RAG Stack (OpenAI Embeddings). |
| `docs/` | Esquemas de base de datos SQL, políticas RLS y documentación de migración. |
| `middleware.ts` | Guardián de autenticación y detección de localización (Swiss locale detection). |

### Infrastructure Overview
```text
├── app/                  # Next.js App Router (i18n)
├── components/           # UI Components (Shadcn/Tailwind)
├── lib/                  
│   ├── ai/               # Claude & RAG Implementation
│   └── supabase/         # Client & Server DB logic
├── docs/                 # SQL Migrations & Schema
└── middleware.ts         # Auth & Localization
