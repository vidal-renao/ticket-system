# System Architecture — AI-Powered Helpdesk

## Tech Stack

| Layer        | Technology                          | Rationale                              |
|--------------|-------------------------------------|----------------------------------------|
| Frontend     | Next.js 15 (App Router)             | RSC + streaming, SEO, Vercel-native    |
| Styling      | Tailwind CSS v4 + shadcn/ui         | Dark-Premium UI, composable components |
| Auth         | Supabase Auth                       | Built-in RLS integration, OAuth ready  |
| Database     | Supabase PostgreSQL                 | RLS, real-time, edge functions         |
| AI Engine    | Claude Sonnet 4.6 (Anthropic API)   | Best reasoning/cost ratio for triage   |
| File Storage | Supabase Storage                    | Same platform, RLS-protected buckets   |
| Hosting      | Vercel                              | Zero-config Next.js, edge network      |
| Email        | Resend                              | Transactional, developer-friendly      |

---

## Portal Architecture (3 Views)

```
┌─────────────────────────────────────────────────────────┐
│                    TICKET SYSTEM                         │
├───────────────┬──────────────────┬──────────────────────┤
│ CUSTOMER      │ AGENT            │ MANAGER              │
│ PORTAL        │ WORKSPACE        │ DASHBOARD            │
├───────────────┼──────────────────┼──────────────────────┤
│ Submit ticket │ Queue view       │ SLA overview         │
│ Track status  │ AI triage panel  │ Volume metrics       │
│ Chat history  │ Smart responses  │ Agent performance    │
│               │ Internal notes   │ Category breakdown   │
│               │ Assign/escalate  │ Audit log viewer     │
└───────────────┴──────────────────┴──────────────────────┘
```

---

## Key Metrics (Executive Dashboard)

- **SLA Compliance Rate** — % tickets resolved within SLA window
- **AI Accuracy Rate** — % cases where agent accepted AI suggestion
- **MTTR** — Mean Time To Resolution by category/priority
- **Ticket Volume** — Daily/weekly trend by category
- **Agent Load** — Open tickets per agent
- **Customer CSAT** — Optional post-resolution survey score

---

## DSG/LPD Compliance Summary

| Requirement              | Implementation                                     |
|--------------------------|----------------------------------------------------|
| Data minimization        | Only fields necessary for support are stored       |
| Purpose limitation       | AI analysis data never used for marketing          |
| Storage limitation       | `retention_delete_at` auto-cleanup per org policy  |
| Integrity & security     | RLS + audit logs + immutable audit trail           |
| Right to erasure         | `anonymized_at` field + storage deletion function  |
| Data processing records  | `organizations.dpa_signed_at` + audit_logs table   |
| PII detection            | AI flags PII in tickets, restricts access          |
| Breach notification      | Security category tickets trigger alert workflow   |

---

## Folder Structure (Next.js 15)

```
Ticket System/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (customer)/
│   │   ├── tickets/
│   │   │   ├── page.tsx         # List view
│   │   │   ├── new/page.tsx     # Submit form
│   │   │   └── [id]/page.tsx    # Detail view
│   ├── (agent)/
│   │   ├── queue/page.tsx       # Ticket queue
│   │   └── tickets/[id]/page.tsx
│   ├── (manager)/
│   │   └── dashboard/page.tsx
│   └── api/
│       ├── tickets/route.ts
│       ├── tickets/[id]/route.ts
│       └── ai/triage/route.ts
├── components/
│   ├── tickets/
│   ├── ai/
│   │   ├── TriagePanel.tsx      # Shows AI analysis to agent
│   │   └── SmartResponseBox.tsx
│   └── dashboard/
├── lib/
│   ├── ai/triage.ts             # Claude integration
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── sla/calculator.ts
├── docs/
│   ├── schema.sql
│   ├── ai-workflow.md
│   └── architecture.md
└── supabase/
    ├── migrations/
    └── seed.sql
```
