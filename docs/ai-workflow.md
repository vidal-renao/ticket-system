# AI Triage Workflow — Technical Specification

## Overview

Every ticket submitted goes through the **AI Triage Engine** before a human agent sees it.
The engine uses Claude Sonnet 4.6 to analyze the raw ticket content and returns a structured
JSON payload stored in the `ai_analysis` table.

---

## Architecture: Request Flow

```
User submits ticket
       │
       ▼
[Next.js API Route]  POST /api/tickets
       │
       ├── 1. Insert ticket row (status: 'open')
       │
       ├── 2. Call AI Triage Engine (async, non-blocking for user)
       │         │
       │         ▼
       │   [Claude Sonnet 4.6 API]
       │         │
       │         ▼
       │   Parse & validate JSON response
       │         │
       │         ▼
       │   INSERT into ai_analysis
       │         │
       │         ▼
       │   UPDATE ticket (priority, category_id, detected_language)
       │         │
       │         ▼
       │   NOTIFY assigned agent (if auto-assign enabled)
       │
       └── 3. Return ticket ID to user immediately
```

---

## System Prompt (Production-Ready)

```
You are an IT Helpdesk AI Triage Engine for a Swiss SME IT support system.

Your job is to analyze incoming support tickets and return a precise classification
to help IT agents prioritize and respond efficiently.

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.

JSON SCHEMA:
{
  "suggested_category": "Networking" | "Hardware" | "Software" | "Security" | "Billing" | "Other",
  "suggested_priority": "low" | "medium" | "high" | "critical",
  "confidence_score": <number: 0-100>,
  "sentiment": "calm" | "neutral" | "frustrated" | "urgent" | "angry",
  "detected_language": "de" | "fr" | "it" | "en",
  "summary": "<string: 1-2 sentence technical summary of the problem>",
  "keywords": ["<keyword>", ...],
  "smart_response": "<string: professional suggested reply in the SAME language as the ticket>",
  "estimated_resolution_hours": <integer>,
  "reasoning": "<string: brief explanation of why this category and priority were chosen>",
  "contains_pii": <boolean: true if ticket contains names, emails, IPs, passwords or sensitive data>
}

PRIORITY DECISION MATRIX:

| Priority | Criteria                                                                 |
|----------|--------------------------------------------------------------------------|
| critical | System fully down, data loss/breach, >50 users affected, safety risk     |
| high     | Core functionality impaired, 10–50 users, revenue/compliance at risk     |
| medium   | Partial degradation, <10 users, workaround available, deadline at risk   |
| low      | Cosmetic issue, single user, how-to question, minor inconvenience        |

CATEGORY GUIDELINES:
- Networking: VPN, WiFi, DNS, firewall, connectivity, bandwidth, switching/routing
- Hardware:   Laptops, printers, monitors, phones, peripherals, power, physical damage
- Software:   Applications, OS, crashes, updates, licensing, configuration, integrations
- Security:   Password resets, suspicious activity, phishing, access revocation, data leaks
- Billing:    Invoices, subscriptions, cost allocation, purchase requests, licensing costs
- Other:      General questions, onboarding requests, unclear issues

SENTIMENT CALIBRATION:
- angry:      Offensive language, threats, ALL CAPS, "unacceptable", "scandal"
- frustrated: Repeated issue, "still broken", "again", "since days/weeks"
- urgent:     "ASAP", "deadline", "client waiting", specific time pressure
- neutral:    Matter-of-fact, no emotional language
- calm:       Polite, patient tone, no time pressure

LANGUAGE:
- Detect the ticket language from title + description
- Write smart_response in the SAME detected language
- If mixed languages, use the dominant one

PRIVACY (DSG/LPD):
- Set contains_pii: true if you detect: full names, email addresses, IP addresses,
  passwords/credentials, phone numbers, personal health/financial information
- Do NOT reproduce PII in the summary, keywords, or smart_response

SMART RESPONSE GUIDELINES:
- 3–5 sentences max
- Acknowledge the issue specifically
- State the next action the agent will take
- Give a realistic timeframe based on priority SLA
- End with availability for follow-up questions
- Tone: professional, calm, solution-oriented (Swiss business standard)
```

---

## Implementation: TypeScript Module

```typescript
// lib/ai/triage.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface TriageResult {
  suggested_category: 'Networking' | 'Hardware' | 'Software' | 'Security' | 'Billing' | 'Other';
  suggested_priority: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number;
  sentiment: 'calm' | 'neutral' | 'frustrated' | 'urgent' | 'angry';
  detected_language: 'de' | 'fr' | 'it' | 'en';
  summary: string;
  keywords: string[];
  smart_response: string;
  estimated_resolution_hours: number;
  reasoning: string;
  contains_pii: boolean;
}

const SYSTEM_PROMPT = `...` // (the full prompt above)

export async function triageTicket(
  title: string,
  description: string
): Promise<TriageResult> {
  const startTime = Date.now();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `TICKET TITLE: ${title}\n\nTICKET DESCRIPTION:\n${description}`,
      },
    ],
  });

  const processingTime = Date.now() - startTime;
  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse and validate JSON
  let result: TriageResult;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`AI returned invalid JSON: ${rawText.substring(0, 200)}`);
  }

  // Return enriched with model metadata
  return {
    ...result,
    // Stored in ai_analysis separately:
    // model_used: response.model,
    // input_tokens: response.usage.input_tokens,
    // output_tokens: response.usage.output_tokens,
    // processing_time_ms: processingTime,
    // raw_response: response,
  };
}
```

---

## API Route: POST /api/tickets

```typescript
// app/api/tickets/route.ts
import { createClient } from '@/lib/supabase/server';
import { triageTicket } from '@/lib/ai/triage';

export async function POST(request: Request) {
  const supabase = createClient();
  const { title, description } = await request.json();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user profile + org
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  // 1. Create ticket (initial state, no AI yet)
  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({
      title,
      description,
      organization_id: profile.organization_id,
      created_by: user.id,
      status: 'open',
      priority: 'medium', // Temporary until AI runs
    })
    .select()
    .single();

  if (error) return Response.json({ error }, { status: 500 });

  // 2. Run AI triage asynchronously (non-blocking)
  runAITriage(ticket.id, title, description, profile.organization_id, supabase);

  // 3. Return ticket immediately to user
  return Response.json({ ticket }, { status: 201 });
}

async function runAITriage(
  ticketId: string,
  title: string,
  description: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>
) {
  try {
    const startTime = Date.now();
    const result = await triageTicket(title, description);

    // Resolve category_id from suggested category name
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', result.suggested_category)
      .single();

    // Insert AI analysis
    await supabase.from('ai_analysis').insert({
      ticket_id: ticketId,
      suggested_category: result.suggested_category,
      suggested_priority: result.suggested_priority,
      confidence_score: result.confidence_score,
      sentiment: result.sentiment,
      detected_language: result.detected_language,
      summary: result.summary,
      keywords: result.keywords,
      smart_response: result.smart_response,
      estimated_resolution_hours: result.estimated_resolution_hours,
      reasoning: result.reasoning,
      contains_pii_detected: result.contains_pii,
      model_used: 'claude-sonnet-4-6',
      processing_time_ms: Date.now() - startTime,
    });

    // Update ticket with AI-suggested values
    await supabase
      .from('tickets')
      .update({
        priority: result.suggested_priority,
        category_id: category?.id ?? null,
        detected_language: result.detected_language,
        contains_pii: result.contains_pii,
      })
      .eq('id', ticketId);

  } catch (error) {
    console.error('[AI Triage] Failed for ticket', ticketId, error);
    // Ticket still exists with default values — agent handles manually
  }
}
```

---

## Example Input / Output

### Input
```
Title: "No puedo conectarme a la VPN desde ayer y tengo reunión con cliente en 2 horas"
Description: "Desde ayer por la tarde no puedo conectarme a la VPN de la empresa.
He reiniciado el portátil varias veces. El error que me aparece es 'Authentication failed'.
Mi colega Juan Pérez tiene el mismo problema. Tengo una reunión importante con un cliente
a las 14:00 y necesito acceso a los documentos del servidor."
```

### Output (Claude Response)
```json
{
  "suggested_category": "Networking",
  "suggested_priority": "high",
  "confidence_score": 94.5,
  "sentiment": "urgent",
  "detected_language": "es",
  "summary": "Two users cannot connect to corporate VPN since yesterday afternoon due to an authentication failure. A client-facing meeting in 2 hours creates time pressure.",
  "keywords": ["VPN", "authentication failed", "connectivity", "multiple users", "deadline"],
  "smart_response": "Hemos recibido tu solicitud y la estamos tratando con prioridad alta dado el impacto en tu reunión de las 14:00. Nuestro equipo ya está investigando el fallo de autenticación en la VPN. Te pedimos que, mientras tanto, compruebes si puedes acceder a los documentos necesarios a través del portal web. Te daremos una actualización antes de las 13:30.",
  "estimated_resolution_hours": 4,
  "reasoning": "VPN authentication failure affecting multiple users with an imminent business deadline qualifies as High priority. Not Critical as the issue is contained and a web portal workaround may exist.",
  "contains_pii": true
}
```

---

## PII Handling (DSG/LPD)

When `contains_pii: true` is returned:

1. The `tickets.contains_pii` flag is set to `TRUE`
2. The ticket is tagged in the UI with a `[PII]` badge visible to agents/admins only
3. The `audit_logs` records all access to this ticket
4. The ticket is excluded from AI training exports
5. On `retention_delete_at`, all content is overwritten with `[ANONYMIZED]` and
   attachments are deleted from Supabase Storage

---

## Confidence Score Thresholds

| Score   | Behavior                                                  |
|---------|-----------------------------------------------------------|
| ≥ 85    | Auto-apply AI suggestions to ticket (priority + category) |
| 60–84   | Apply suggestions but show "Review AI decision" banner    |
| < 60    | Flag for manual review, don't auto-apply priority          |

---

## Agent Feedback Loop

When an agent overrides the AI suggestion:
- `ai_analysis.category_accepted` / `priority_accepted` → set to `FALSE`
- Optional `agent_feedback` text captured
- Data exported monthly for prompt tuning evaluation

This creates a **continuous improvement loop** without retraining the model —
just refining the system prompt based on disagreement patterns.
