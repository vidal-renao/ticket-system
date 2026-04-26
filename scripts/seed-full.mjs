/**
 * Full cleanup + seed for Vidal HelpDesk AI
 * Usage: node scripts/seed-full.mjs
 *
 * Reads env from .env.local automatically via dotenv.
 * Keeps: Org 921f56a8 + Admin profile ee677b39
 * Cleans: all other orgs, profiles, tickets, comments, AI analysis, notifications, audit_logs
 * Seeds:  admin confirm, 2 agents, 1 customer, 5 tickets, AI triage
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dependency needed)
try {
  const envPath = join(__dirname, "../.env.local");
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env.local not found, using existing env */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const KEEP_ORG_ID     = "921f56a8-b2fe-4f24-bae9-fdf4863d4240";
const KEEP_ADMIN_ID   = "ee677b39-906f-4027-a01c-69024c8c23f5";
const ADMIN_EMAIL     = "vidalrenao.lab@outlook.com";
const ADMIN_PASSWORD  = "Admin2026!";

const AGENT_HARDWARE = {
  id: "0dfadf30-2c7f-4b99-a8d8-c8086efd26d5",
  email: "agent.hardware@vidallab.ch",
  password: "Agent2026!",
  full_name: "Markus Weber",
  role: "agent",
  specialty: "Hardware",
};

const AGENT_SOFTWARE = {
  id: "b1c3d4e5-f6a7-8901-bcde-f01234567890",
  email: "agent.software@vidallab.ch",
  password: "Agent2026!",
  full_name: "Laura Keller",
  role: "agent",
  specialty: "Software",
};

const CUSTOMER = {
  id: "c2d4e6f8-a1b2-3456-cdef-012345678901",
  email: "contact@zurich-fintech.ch",
  password: "Customer2026!",
  full_name: "Daniel Meier",
  role: "customer",
  company_name: "Zürich FinTech AG",
  industry: "finance",
  business_details: "Schweizer Fintech-Unternehmen für KMU-Zahlungslösungen, Basel.",
  tax_id: "CHE-456.789.012",
};

// ─── PHASE 1: CONFIRM ADMIN ───────────────────────────────────────────────────
async function confirmAdmin() {
  console.log("\n📋 Confirming admin user…");
  const { data: users } = await svc.auth.admin.listUsers();
  const existing = users?.users?.find(u => u.email === ADMIN_EMAIL);

  if (existing) {
    await svc.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password: ADMIN_PASSWORD,
      user_metadata: { full_name: "Vidal Reñao" },
    });
    console.log(`  ✅ Admin confirmed: ${ADMIN_EMAIL} (id: ${existing.id})`);
    // Ensure profile exists with correct UUID
    await svc.from("profiles").upsert({
      id: existing.id,
      organization_id: KEEP_ORG_ID,
      role: "admin",
      full_name: "Vidal Reñao",
      is_active: true,
      locale: "de",
      timezone: "Europe/Zurich",
      data_processing_consent: true,
    }, { onConflict: "id" });
    console.log(`  ✅ Admin profile upserted`);
  } else {
    // Create admin user with specific UUID
    const { data: created, error } = await svc.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Vidal Reñao" },
    });
    if (error) { console.error("  ❌ Could not create admin:", error.message); return; }
    console.log(`  ✅ Admin created: ${ADMIN_EMAIL}`);
    await svc.from("profiles").upsert({
      id: created.user.id,
      organization_id: KEEP_ORG_ID,
      role: "admin",
      full_name: "Vidal Reñao",
      is_active: true,
      locale: "de",
      timezone: "Europe/Zurich",
      data_processing_consent: true,
    }, { onConflict: "id" });
  }
}

// ─── PHASE 2: CLEAN UP ────────────────────────────────────────────────────────
async function cleanUp() {
  console.log("\n🗑️  Cleaning up data…");

  // Audit logs
  const { error: a1 } = await svc.from("audit_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log(`  audit_logs:       ${a1 ? "❌ " + a1.message : "✅ cleared"}`);

  // Notifications
  const { error: n1 } = await svc.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log(`  notifications:    ${n1 ? "❌ " + n1.message : "✅ cleared"}`);

  // AI analysis
  const { error: ai } = await svc.from("ai_analysis").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log(`  ai_analysis:      ${ai ? "❌ " + ai.message : "✅ cleared"}`);

  // Ticket comments
  const { error: tc } = await svc.from("ticket_comments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log(`  ticket_comments:  ${tc ? "❌ " + tc.message : "✅ cleared"}`);

  // Tickets
  const { error: t1 } = await svc.from("tickets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log(`  tickets:          ${t1 ? "❌ " + t1.message : "✅ cleared"}`);

  // Profiles (keep admin)
  const { error: p1 } = await svc.from("profiles").delete().neq("id", KEEP_ADMIN_ID);
  console.log(`  profiles:         ${p1 ? "❌ " + p1.message : "✅ kept admin only"}`);

  // Customers info
  const { error: ci } = await svc.from("customers_info").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log(`  customers_info:   ${ci ? "❌ " + ci.message : "✅ cleared"}`);

  // Other orgs (keep main)
  const { error: o1 } = await svc.from("organizations").delete().neq("id", KEEP_ORG_ID);
  console.log(`  organizations:    ${o1 ? "❌ " + o1.message : "✅ kept main org"}`);
}

// ─── PHASE 3: ENSURE TEAMS ───────────────────────────────────────────────────
async function ensureTeams() {
  console.log("\n🏗️  Ensuring teams…");
  const TEAMS = [
    { name: "Hardware", description: "Hardware & Peripheral Support" },
    { name: "Software", description: "Software & Applications Support" },
    { name: "Network", description: "Network & Connectivity Support" },
  ];
  const teamMap = {};
  for (const team of TEAMS) {
    const { data: existing } = await svc.from("teams").select("id").eq("organization_id", KEEP_ORG_ID).eq("name", team.name).single();
    if (existing) {
      teamMap[team.name] = existing.id;
    } else {
      const { data: created } = await svc.from("teams").insert({ organization_id: KEEP_ORG_ID, ...team }).select("id").single();
      teamMap[team.name] = created?.id;
    }
    console.log(`  ✅ Team: ${team.name} (${teamMap[team.name]})`);
  }
  return teamMap;
}

// ─── PHASE 4: SEED AGENTS ────────────────────────────────────────────────────
async function seedUser(user, teamId) {
  const { data: users } = await svc.auth.admin.listUsers();
  const existing = users?.users?.find(u => u.email === user.email);
  let userId;

  if (existing) {
    await svc.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password: user.password,
      user_metadata: { full_name: user.full_name },
    });
    userId = existing.id;
  } else {
    const { data: created, error } = await svc.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });
    if (error) throw new Error(`Could not create ${user.email}: ${error.message}`);
    userId = created.user.id;
  }

  await svc.from("profiles").upsert({
    id: userId,
    organization_id: KEEP_ORG_ID,
    role: user.role,
    full_name: user.full_name,
    specialty: user.specialty ?? null,
    team_id: teamId ?? null,
    is_active: true,
    availability_status: "online",
    locale: "de",
    timezone: "Europe/Zurich",
    data_processing_consent: true,
  }, { onConflict: "id" });

  return userId;
}

async function seedCustomer(user) {
  const userId = await seedUser(user, null);
  await svc.from("customers_info").upsert({
    id: userId,
    company_name: user.company_name,
    industry: user.industry,
    business_details: user.business_details,
    tax_id: user.tax_id,
  }, { onConflict: "id" });
  return userId;
}

// ─── PHASE 5: AI TRIAGE ──────────────────────────────────────────────────────
async function runTriage(title, description) {
  if (!ANTHROPIC_API_KEY) {
    console.warn("  ⚠️  No ANTHROPIC_API_KEY — skipping AI triage");
    return null;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are an IT Helpdesk AI Triage Engine. Respond ONLY with valid JSON matching this schema exactly:
{"suggested_category":"Networking"|"Hardware"|"Software"|"Security"|"Billing"|"Other","suggested_priority":"low"|"medium"|"high"|"critical","confidence_score":0-100,"sentiment":"calm"|"neutral"|"frustrated"|"urgent"|"angry","detected_language":"de"|"en"|"es","summary":"...","keywords":["..."],"smart_response":"...","estimated_resolution_hours":int,"reasoning":"...","contains_pii":bool}`,
      messages: [{ role: "user", content: `Title: ${title}\n\nDescription: ${description}` }],
    }),
  });

  if (!res.ok) { console.warn("  ⚠️  AI triage API error:", res.status); return null; }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  }
}

// ─── DEMO TICKETS ─────────────────────────────────────────────────────────────
function makeTickets(customerId) {
  const now = new Date();
  const ago = (h) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

  return [
    {
      title: "Laptop startet nicht mehr nach Windows-Update",
      description: "Nach dem automatischen Windows-Update vom letzten Dienstag startet mein Dell Latitude 5530 nicht mehr. Der Bildschirm bleibt nach dem BIOS-Logo schwarz. Ich habe bereits versucht, den Akku zu entfernen und neu zu starten, ohne Erfolg. Ich benötige meinen Laptop dringend für eine Präsentation morgen früh.",
      priority: "high",
      created_at: ago(3),
    },
    {
      title: "VPN connection drops every 30 minutes",
      description: "Since last Monday, our Cisco AnyConnect VPN disconnects every 30 minutes exactly. This affects 12 employees working remotely. We've checked our router settings and nothing has changed. The event log shows 'Authentication timeout' but our passwords are correct. This is severely impacting our productivity.",
      priority: "critical",
      created_at: ago(8),
    },
    {
      title: "Microsoft 365 no puede sincronizar correos",
      description: "Desde ayer por la tarde, Outlook no sincroniza los correos electrónicos nuevos. El cliente muestra 'Intentando conectar...' constantemente. He verificado mi contraseña y funciona en el portal web de Outlook. El problema ocurre tanto en Windows como en el iPhone. Tengo pendiente una propuesta importante de cliente.",
      priority: "medium",
      created_at: ago(24),
    },
    {
      title: "Verdächtiger Login-Versuch auf unserem Firmenserver",
      description: "Unser IT-Monitoring hat heute Nacht 47 fehlgeschlagene Login-Versuche auf dem Hauptserver von einer unbekannten IP-Adresse (195.234.xx.xx) aus Russland gemeldet. Ein Versuch war erfolgreich. Ich habe das Konto bereits gesperrt, aber wir brauchen eine forensische Analyse und müssen wissen, ob Daten kompromittiert wurden.",
      priority: "critical",
      created_at: ago(1),
    },
    {
      title: "Invoice for software subscription incorrect amount",
      description: "We received the invoice for our Microsoft 365 Business Premium subscription for Q2 2026. The amount is CHF 4,800 but our contract states CHF 3,200 for 20 users. There's a discrepancy of CHF 1,600 that we need resolved before the payment deadline on May 15th. Please review and issue a corrected invoice.",
      priority: "low",
      created_at: ago(48),
    },
  ].map(t => ({ ...t, created_by: customerId, organization_id: KEEP_ORG_ID, status: "open", source: "portal" }));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Vidal HelpDesk AI — Full Seed\n" + "=".repeat(50));

  await confirmAdmin();
  await cleanUp();

  const teams = await ensureTeams();

  console.log("\n👤 Seeding users…");
  const hwAgentId = await seedUser(AGENT_HARDWARE, teams["Hardware"]);
  console.log(`  ✅ Agent Hardware: ${AGENT_HARDWARE.email} (${hwAgentId})`);

  const swAgentId = await seedUser(AGENT_SOFTWARE, teams["Software"]);
  console.log(`  ✅ Agent Software: ${AGENT_SOFTWARE.email} (${swAgentId})`);

  const customerId = await seedCustomer(CUSTOMER);
  console.log(`  ✅ Customer: ${CUSTOMER.email} (${customerId})`);

  console.log("\n🎫 Seeding tickets + AI triage…");
  const tickets = makeTickets(customerId);

  for (const ticketData of tickets) {
    const createdAt = ticketData.created_at;
    const { data: ticket, error: tErr } = await svc.from("tickets").insert({
      ...ticketData,
      response_due_at: new Date(new Date(createdAt).getTime() + 4 * 60 * 60 * 1000).toISOString(),
      resolution_due_at: new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }).select("id, ticket_number").single();

    if (tErr) { console.error(`  ❌ Ticket insert error: ${tErr.message}`); continue; }
    console.log(`  🎫 TK-${String(ticket.ticket_number).padStart(4, "0")}: ${ticketData.title.slice(0, 50)}…`);

    const triage = await runTriage(ticketData.title, ticketData.description);
    if (triage) {
      await svc.from("ai_analysis").insert({
        ticket_id: ticket.id,
        suggested_category: triage.suggested_category ?? "Other",
        suggested_priority: triage.suggested_priority ?? ticketData.priority,
        confidence_score: triage.confidence_score ?? 75,
        sentiment: triage.sentiment ?? "neutral",
        detected_language: triage.detected_language ?? "de",
        summary: triage.summary ?? "",
        keywords: triage.keywords ?? [],
        smart_response: triage.smart_response ?? "",
        estimated_resolution_hours: triage.estimated_resolution_hours ?? 24,
        reasoning: triage.reasoning ?? "",
        contains_pii_detected: triage.contains_pii ?? false,
        model_used: "claude-sonnet-4-6",
        input_tokens: 0,
        output_tokens: 0,
        processing_time_ms: 0,
      });
      console.log(`    🤖 AI: ${triage.suggested_category} / ${triage.suggested_priority} / sentiment: ${triage.sentiment}`);
    }

    // Assign to agent based on category
    const cat = triage?.suggested_category ?? "";
    const assignTo = cat === "Hardware" ? hwAgentId : cat === "Software" ? swAgentId : null;
    if (assignTo) {
      await svc.from("tickets").update({ assigned_to: assignTo, status: "open" }).eq("id", ticket.id);
    }
  }

  console.log("\n✅ Seed complete!");
  console.log("\nCredentials:");
  console.log(`  Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Agent HW: ${AGENT_HARDWARE.email} / ${AGENT_HARDWARE.password}`);
  console.log(`  Agent SW: ${AGENT_SOFTWARE.email} / ${AGENT_SOFTWARE.password}`);
  console.log(`  Customer: ${CUSTOMER.email} / ${CUSTOMER.password}`);
  console.log(`\n  → Login: https://ticket-system-sigma-pink.vercel.app/login`);
}

main().catch(e => { console.error("❌ Seed failed:", e); process.exit(1); });
