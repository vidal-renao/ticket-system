import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { buildSlaDeadlinePatch, getSlaPolicyForTicket } from "@/lib/sla";
import { createTicketNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

interface InboundEmailPayload {
  from?: string;
  sender?: string;
  subject?: string;
  text?: string;
  html?: string;
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_INGEST_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: InboundEmailPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const from = extractEmail(body.from ?? body.sender ?? "");
  const subject = body.subject?.trim() || "Email support request";
  const content = (body.text ?? stripHtml(body.html ?? "")).trim();

  if (!from || !content) {
    return NextResponse.json({ error: "from and text/html are required" }, { status: 400 });
  }

  const svc = createServiceClientStatic();
  const senderProfile = await findProfileByEmail(svc, from);
  if (!senderProfile?.organization_id) {
    return NextResponse.json({ error: "Sender not recognized" }, { status: 404 });
  }

  const ticketNumber = extractTicketNumber(subject);
  if (ticketNumber) {
    const { data: ticket } = await svc
      .from("tickets")
      .select("id, created_by, assigned_to, organization_id, ticket_number")
      .eq("organization_id", senderProfile.organization_id)
      .eq("ticket_number", ticketNumber)
      .single();

    if (ticket) {
      const { data: comment, error } = await svc
        .from("ticket_comments")
        .insert({
          ticket_id: ticket.id,
          author_id: senderProfile.id,
          content,
          is_internal: false,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const recipientId = ticket.assigned_to ?? ticket.created_by;
      if (recipientId && recipientId !== senderProfile.id) {
        await createTicketNotification(svc, {
          userId: recipientId,
          ticketId: ticket.id,
          type: "comment.public",
          title: "New email reply",
          message: `TK-${String(ticket.ticket_number).padStart(4, "0")} received an email reply.`,
        });
      }

      return NextResponse.json({ ok: true, mode: "append", comment });
    }
  }

  const priority = "medium";
  const createdAt = new Date().toISOString();
  const policy = await getSlaPolicyForTicket(svc, senderProfile.organization_id, priority);
  const slaPatch = buildSlaDeadlinePatch(
    {
      id: "",
      organization_id: senderProfile.organization_id,
      priority,
      status: "open",
      created_at: createdAt,
      resolved_at: null,
    },
    policy
  );

  const { data: ticket, error } = await svc
    .from("tickets")
    .insert({
      organization_id: senderProfile.organization_id,
      created_by: senderProfile.id,
      title: subject,
      description: content,
      priority,
      status: "open",
      source: "email",
      created_at: createdAt,
      ...slaPatch,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, mode: "create", ticket });
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0].toLowerCase() ?? null;
}

function extractTicketNumber(subject: string) {
  const match = subject.match(/TK-(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

async function findProfileByEmail(
  svc: ReturnType<typeof createServiceClientStatic>,
  email: string
) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) return null;

  const { data: profile } = await svc
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

