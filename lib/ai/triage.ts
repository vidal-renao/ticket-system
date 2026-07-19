import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface TriageResult {
  suggested_category:
    | "Networking" | "Hardware" | "Software" | "Security" | "Billing"
    | "Email & Communication" | "Printer & Peripherals" | "VPN & Remote Access"
    | "Microsoft 365" | "Active Directory & Accounts" | "Backup & Recovery"
    | "Performance & Speed" | "Mobile Devices" | "Other";
  suggested_priority: "low" | "medium" | "high" | "critical";
  confidence_score: number;
  sentiment: "calm" | "neutral" | "frustrated" | "urgent" | "angry";
  detected_language: "de" | "fr" | "it" | "en";
  summary: string;
  keywords: string[];
  smart_response: string;
  estimated_resolution_hours: number;
  reasoning: string;
  contains_pii: boolean;
}

export interface TriageResultWithMeta extends TriageResult {
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  processing_time_ms: number;
}

const SYSTEM_PROMPT = `You are an IT Helpdesk AI Triage Engine for a Swiss SME IT support system.

Your job is to analyze incoming support tickets and return precise classification to help IT agents prioritize and respond efficiently.

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.

JSON SCHEMA:
{
  "suggested_category": "Networking" | "Hardware" | "Software" | "Security" | "Billing" | "Email & Communication" | "Printer & Peripherals" | "VPN & Remote Access" | "Microsoft 365" | "Active Directory & Accounts" | "Backup & Recovery" | "Performance & Speed" | "Mobile Devices" | "Other",
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
- critical: System fully down, data loss/breach, >50 users affected, safety risk
- high:     Core functionality impaired, 10-50 users, revenue/compliance at risk
- medium:   Partial degradation, <10 users, workaround available, deadline at risk
- low:      Cosmetic issue, single user, how-to question, minor inconvenience

CATEGORY GUIDELINES:
- Networking:                  WiFi, DNS, firewall, internet connectivity, LAN/WAN, bandwidth
- Hardware:                    Laptops, desktops, monitors, physical damage, USB devices
- Software:                    Applications, OS, crashes, updates, licensing, configuration
- Security:                    Suspicious activity, phishing, malware, access revocation, data leaks
- Billing:                     Invoices, subscriptions, cost allocation, purchase requests
- Email & Communication:       Outlook, Exchange, email delivery, calendar sync, Teams messaging
- Printer & Peripherals:       Printers, scanners, projectors, USB/Bluetooth devices
- VPN & Remote Access:         VPN clients, remote desktop (RDP), TeamViewer, split-tunneling
- Microsoft 365:               Office apps, SharePoint, OneDrive, Teams, licensing, tenant issues
- Active Directory & Accounts: User accounts, password resets, group policies, LDAP, SSO
- Backup & Recovery:           File recovery, backup failures, restore requests, data loss
- Performance & Speed:         Slow PC, high CPU/memory, disk space, application lag
- Mobile Devices:              Smartphones, tablets, MDM enrollment, mobile email, app installs
- Other:                       General questions, onboarding requests, unclear issues

SENTIMENT CALIBRATION:
- angry:      Offensive language, threats, ALL CAPS, "unacceptable"
- frustrated: Repeated issue, "still broken", "again", "since days/weeks"
- urgent:     "ASAP", "deadline", "client waiting", specific time pressure
- neutral:    Matter-of-fact, no emotional language
- calm:       Polite, patient tone, no time pressure

LANGUAGE:
- Detect language from title + description
- Write smart_response in the SAME detected language
- If mixed languages, use the dominant one

PRIVACY (DSG/LPD):
- Set contains_pii: true if you detect: full names, email addresses, IP addresses,
  passwords/credentials, phone numbers, personal health/financial information
- Do NOT reproduce PII in summary, keywords, or smart_response

SMART RESPONSE GUIDELINES:
- 3-5 sentences max
- Acknowledge the issue specifically
- State the next action the agent will take
- Give a realistic timeframe based on priority
- Tone: professional, calm, solution-oriented (Swiss business standard)`;

export interface TriageOrgContext {
  companyName?: string | null;
  companySector?: string | null;
  companyDetails?: string | null;
  activeCategories?: string[];
}

function buildOrgContextBlock(ctx?: TriageOrgContext): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.companyName) {
    lines.push(
      `The ticket was submitted by the company "${ctx.companyName}"${ctx.companySector ? ` (sector: ${ctx.companySector})` : ""}.`
    );
  }
  if (ctx.companyDetails?.trim()) {
    lines.push(`Company background: ${ctx.companyDetails.trim().slice(0, 400)}`);
  }
  if (ctx.activeCategories?.length) {
    lines.push(
      `This organization's active support categories are: ${ctx.activeCategories.join(", ")}. ` +
        `When one of them clearly fits, use its exact name as suggested_category (it takes precedence over the generic list); otherwise fall back to the generic list.`
    );
  }
  if (!lines.length) return "";
  return `\n\nORGANIZATION CONTEXT (use it to ground category, priority, summary and smart_response — e.g. an outage has more impact for a retailer at opening hours than a single-user cosmetic issue):\n- ${lines.join("\n- ")}`;
}

export async function triageTicket(
  title: string,
  description: string,
  signal?: AbortSignal,
  ragContext?: string,
  orgContext?: TriageOrgContext
): Promise<TriageResultWithMeta> {
  const startTime = Date.now();

  const systemPrompt =
    SYSTEM_PROMPT + buildOrgContextBlock(orgContext) + (ragContext ? `\n\n${ragContext}` : "");

  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `TICKET TITLE: ${title}\n\nTICKET DESCRIPTION:\n${description}`,
        },
      ],
    },
    { signal }
  );

  const processingTime = Date.now() - startTime;
  const rawText = response.content[0].type === "text" ? response.content[0].text : "";

  let result: TriageResult;
  try {
    result = JSON.parse(rawText);
  } catch {
    // Fallback if Claude wraps JSON in markdown
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) ||
                      rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    } else {
      throw new Error(`AI returned unparseable response: ${rawText.substring(0, 300)}`);
    }
  }

  return {
    ...result,
    model_used: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    processing_time_ms: processingTime,
  };
}
