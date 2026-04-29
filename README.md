# HelpDesk AI — Swiss SME IT Support Platform

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude-Sonnet_4.6-D97706?logo=anthropic&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?logo=vercel&logoColor=white)
![DSG/LPD](https://img.shields.io/badge/Compliance-DSG%2FnDSG-DC2626?logo=shield&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-DE%20%7C%20EN%20%7C%20ES-6366F1)

> AI-powered IT helpdesk SaaS designed for Swiss SMEs. Intelligent ticket triage, multilingual support (DE/EN/ES), SLA tracking, and full DSG/nDSG compliance.

---

## Business Context

Swiss SMEs face a unique challenge: IT support requests arrive in multiple languages, span multiple time zones, and must comply with the Federal Act on Data Protection (DSG/nDSG, effective September 2023). Traditional helpdesk tools are either too heavyweight for teams under 50 or lack the compliance controls required for Swiss data residency.

**HelpDesk AI** closes this gap with:
- **Claude Sonnet 4.6 triage** — automatic priority, category, and sentiment classification in under 3 seconds
- **Multilingual-native** — interface and AI responses in DE/EN/ES; ticket language auto-detected
- **SLA enforcement** — configurable SLA policies with breach prediction and real-time alerting
- **Privacy-first architecture** — PII scrubbing, per-org data retention, and DSG Art. 6 compliance built into the data pipeline, not bolted on

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 15 App Router (Vercel Edge)                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  [locale]/(auth)  │  │  [locale]/(app)  │  │  /api        │  │
│  │  · /login         │  │  · /dashboard    │  │  · /tickets  │  │
│  └──────────────────┘  │  · /queue         │  │  · /tickets  │  │
│                         │  · /tickets/[id] │  │    /[id]     │  │
│                         │  · /analytics    │  │  · /ai/      │  │
│                         │  · /settings     │  │    feedback  │  │
│                         └──────────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Server Actions                                                 │
│  · suggest-reply.ts   AI auto-reply generation                 │
│  · translate-text.ts  Real-time ticket translation             │
│  · org-settings.ts    PII scrubbing toggle (admin)             │
├─────────────────────────────────────────────────────────────────┤
│  AI Layer (lib/ai/)                                             │
│  · triage.ts          Ticket classification + smart response   │
│  · pii-scrubber.ts    Regex PII redaction (email/phone/IP)     │
├─────────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL + RLS)                                   │
│  organizations → profiles → tickets → ai_analysis             │
│                          → ticket_comments                     │
│                          → categories                          │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-tenant Isolation

Every query is scoped by `organization_id`. Row Level Security (RLS) policies enforce:
- **Customers** — read/write only their own tickets
- **Agents/Managers** — read/write all tickets within their org
- **Admins** — full org control including settings

---

## AI Pipeline

```
Customer submits ticket
       │
       ▼
POST /api/tickets  →  Insert ticket (status: open, priority: medium)
       │
       ▼  [async, fire-and-forget, 30s timeout]
runAITriage()
       │
       ├─ pii_scrubbing_enabled? → scrubPII(title, description)
       │
       ▼
Claude Sonnet 4.6
       │
       ├─ suggested_category     (Networking/Hardware/Software/Security/Billing)
       ├─ suggested_priority     (low/medium/high/critical)
       ├─ confidence_score       (0–100)
       ├─ sentiment              (calm/neutral/frustrated/urgent/angry)
       ├─ detected_language      (de/fr/it/en)
       ├─ smart_response         (draft reply in detected language)
       ├─ contains_pii           (boolean — DSG compliance flag)
       └─ estimated_resolution_hours
       │
       ▼
ai_analysis table  →  Auto-update ticket priority (if confidence ≥ 60%)
```

### Smart Auto-reply

Agents trigger on-demand via `✨ AI Suggest Response`:
- Claude generates a contextual reply in the ticket's **detected language**
- Tone adapts: **conciliatory** for `frustrated`/`angry` sentiment; **professional** otherwise
- Response populates the textarea for agent review — never auto-sent

### Real-time Translation

Any ticket description or comment can be translated to the agent's active UI locale (DE/EN/ES) with a single click. Translation is cached client-side — no repeat API calls on toggle.

---

## DSG/nDSG Compliance

| Control | Implementation |
|---|---|
| PII Detection | Claude flags `contains_pii` in every triage; displayed as amber badge |
| PII Scrubbing | Org-level toggle: regex redacts emails, phones, IPs before sending to Anthropic |
| Data Retention | `retention_delete_at` per ticket; `data_retention_days` per org |
| Consent Tracking | `data_processing_consent` + `consent_given_at` in profiles |
| Audit Trail | `ai_analysis` is INSERT-only (immutable); ticket mutations tracked via `updated_at` |
| Access Control | RLS on all tables; multi-tenant isolation by `organization_id` |
| DPA | `dpa_signed_at` field on organizations |

---

## Security & Infrastructure (Hardened)

- **PostgreSQL Hardening:** Fixed Search Path on all functions (`SET search_path = public`).
- **Access Control:** Restricted `EXECUTE` permissions on RPCs to authenticated users only.
- **Auth Policy:** 12-character high-entropy password requirement.
- **Compliance:** Swiss DSG compliant via strict Row Level Security (RLS).

---

## Feature Matrix

| Feature | Customer | Agent | Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| Submit tickets | ✓ | | | |
| View own tickets | ✓ | | | |
| View all org tickets | | ✓ | ✓ | ✓ |
| Queue view | | ✓ | ✓ | ✓ |
| AI triage panel | | ✓ | ✓ | ✓ |
| AI suggest reply | | ✓ | ✓ | ✓ |
| Translate ticket | ✓ | ✓ | ✓ | ✓ |
| Analytics dashboard | | | ✓ | ✓ |
| Settings / PII toggle | | | | ✓ |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router (RSC + Server Actions) | 15 |
| Language | TypeScript strict mode | 5 |
| Database | Supabase (PostgreSQL + RLS) | — |
| Auth | Supabase Auth | — |
| AI | Anthropic Claude Sonnet 4.6 | — |
| Styling | Tailwind CSS v4 | 4 |
| i18n | next-intl (DE/EN/ES, `localePrefix: as-needed`) | 3 |
| Deployment | Vercel (Edge-compatible) | — |
| Notifications | Sonner | — |
| Icons | Lucide React | — |

---

## Local Development

### Prerequisites

- Node.js 20+
- Supabase project (or local `supabase start`)
- Anthropic API key

### Setup

```bash
git clone <repo>
cd "Ticket System"
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=<shared-secret-for-vercel-cron>
RESEND_API_KEY=re_...
EMAIL_FROM="HelpDesk AI <support@your-domain.com>"
EMAIL_INGEST_SECRET=<shared-secret-for-email-webhook>
```

### Database

Run `docs/migration_differential.sql` in the Supabase SQL editor. This creates:
- `organizations`, `profiles`, `tickets`, `categories`, `ai_analysis`, `ticket_comments`, `notifications`
- RLS policies for multi-tenant isolation
- Auto-profile trigger on user signup
- `ticket_number` auto-increment per org
- `ticket_ref()` computed column (`TK-0001` format)

```bash
npm run dev        # http://localhost:3000
npm run build      # Production build
```

---

## Project Structure

```
app/
├── [locale]/
│   ├── (auth)/login/         ← Public auth route
│   └── (app)/
│       ├── dashboard/        ← Executive KPIs (manager/admin)
│       ├── queue/            ← Live ticket queue (staff)
│       ├── tickets/          ← Ticket list + detail
│       ├── analytics/        ← AI metrics, SLA prediction
│       └── settings/         ← Org settings (admin)
├── api/
│   ├── tickets/              ← POST create, GET/PATCH detail
│   └── ai/feedback/          ← AI triage feedback loop
app/actions/
├── suggest-reply.ts          ← Smart auto-reply
├── translate-text.ts         ← Real-time translation
└── org-settings.ts           ← PII scrubbing toggle
components/
├── ai/AITriagePanel.tsx      ← AI analysis display + feedback
├── layout/
│   ├── Sidebar.tsx           ← Navigation + locale switcher (ARIA)
│   └── LocaleSwitcher.tsx    ← Keyboard-accessible DE/EN/ES switcher
├── settings/
│   └── PIIScrubbingToggle.tsx
├── tickets/
│   ├── NewTicketForm.tsx     ← ARIA-compliant form (label/id)
│   ├── TicketComments.tsx    ← Comments + AI suggest + translate
│   └── TranslateButton.tsx
lib/
├── ai/
│   ├── triage.ts             ← Claude Sonnet 4.6 triage engine
│   └── pii-scrubber.ts       ← Regex PII redaction
├── supabase/                 ← client / server / types
└── utils.ts
messages/
├── de.json                   ← German (default locale)
├── en.json
└── es.json
```

---

## Roadmap

- [ ] Phase 1 — Swiss High-End UI: skeleton loaders, glassmorphism hero, Framer Motion transitions
- [ ] Email ingestion via webhook → auto ticket creation
- [ ] Slack / Teams notifications for SLA breach
- [ ] Custom SLA policy editor
- [ ] Microsoft Entra ID (SSO) integration

---

*Built by [Vidal Reñao](https://vidalrenao.ch) · Basel, Switzerland · Powered by Claude Sonnet 4.6*
