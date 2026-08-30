import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { legacyToCanonicalStatus } from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { buildSlaDeadlinePatch, getSlaPolicyForTicket } from "@/lib/sla";
import { notifyOrgManagers, notifyTicketAssigned } from "@/lib/notifications";
import { sendEmail, ticketEmailSubject } from "@/lib/email";
import { inferTicketCategory, ROUTING_AWAITING_AVAILABILITY } from "@/lib/ticket-routing";
import { findAutomaticAssignment, runAITriage, scheduleBackground } from "@/lib/ai/triage-runner";
import { adminTicketSchema } from "@/lib/validation/security";
import { isAssignable } from "@/lib/user-lifecycle";

/**
 * An administrator files a ticket on a customer's behalf -- the phone call, the
 * corridor conversation, the email that landed somewhere other than the ingest
 * address.
 *
 * A separate door from POST /api/tickets rather than a relaxed guard on it,
 * because the two differ in who the ticket belongs to. The portal route takes
 * the author from the session and refuses anyone who is not a customer; that
 * refusal is load-bearing and stays exactly as strict. Here the author is named
 * in the request and the session only says who is allowed to name them.
 *
 * The ticket is indistinguishable from one the customer filed themselves --
 * same routing, same SLA clock, same AI triage, same notifications -- because
 * it *is* their ticket. Only `source` and the audit trail remember that
 * somebody else typed it.
 *
 * Written with the service client, and not by choice: the RLS insert policy is
 * `created_by = auth.uid()`, so a session-scoped write could only ever create a
 * ticket owned by the administrator. The tenant and the customer's membership
 * of it are checked here instead, above the database.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const svc = createServiceClientStatic();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await getCurrentProfile(svc, user.id);
  if (!actor || actor.role !== "admin" || !actor.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const organizationId = actor.organization_id;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = adminTicketSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // The named author has to be a customer of this tenant. Not an agent, not an
  // administrator: a ticket's author is who it is *about*, and the whole
  // customer-facing lifecycle -- resolution sign-off, reopen, the portal view
  // -- reads created_by as the customer.
  const { data: customer } = await svc
    .from("hd_profiles")
    .select("id, role, organization_id, full_name, is_active, deleted_at")
    .eq("id", input.customer_id)
    .maybeSingle();

  if (!customer || customer.organization_id !== organizationId || customer.role !== "customer") {
    return NextResponse.json({ error: "No such customer in this organization" }, { status: 404 });
  }

  // A frozen or deleted customer cannot be given new work. The picker already
  // leaves them out; this is the check that matters, because the id arrives in
  // the request and the picker is only a suggestion.
  if (!isAssignable(customer)) {
    return NextResponse.json(
      { error: "This customer's account is closed" },
      { status: 409 }
    );
  }

  const title = input.title;
  const description = input.description;

  const assignment = await findAutomaticAssignment(svc, organizationId, {
    teamId: input.team_id ?? null,
    categoryName: inferTicketCategory(title, description),
  });
  const createdAt = new Date().toISOString();
  const slaPolicy = await getSlaPolicyForTicket(svc, organizationId, input.priority);
  const slaPatch = buildSlaDeadlinePatch(
    {
      id: "",
      organization_id: organizationId,
      priority: input.priority,
      status: "open",
      created_at: createdAt,
      resolved_at: null,
    },
    slaPolicy
  );

  const { data: ticket, error } = await svc
    .from("hd_tickets")
    .insert({
      title,
      description,
      organization_id: organizationId,
      created_by: customer.id,
      status: "open",
      priority: input.priority,
      source: "admin",
      created_at: createdAt,
      ...slaPatch,
      ...(assignment.assignedTo && { assigned_to: assignment.assignedTo, assigned_at: createdAt }),
      ...(assignment.categoryId && { category_id: assignment.categoryId }),
      metadata: {
        // Who actually typed it. created_by is the customer, and without this
        // there would be nothing in the row itself to say the customer never
        // opened the portal -- which matters when they say they never filed it.
        created_on_behalf_by: user.id,
        ...(assignment.unassignedReason === "no_agents_available" && {
          routing_status: ROUTING_AWAITING_AVAILABILITY,
        }),
      },
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/admin/tickets]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (assignment.assignedTo) {
    await logTicketLifecycleEvents({
      ticketId: ticket.id,
      organizationId,
      // The administrator, not the customer: the audit trail answers "who did
      // this", and the customer did nothing.
      actorId: user.id,
      actorRole: actor.role,
      oldStatus: "new",
      newStatus: legacyToCanonicalStatus(ticket.status, ticket.assigned_to),
      oldAssignee: null,
      newAssignee: assignment.assignedTo,
    });

    await notifyTicketAssigned(svc, {
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      previousAssignee: null,
      nextAssignee: assignment.assignedTo,
    });
  } else {
    await notifyOrgManagers(organizationId, {
      ticketId: ticket.id,
      type: "ticket.unassigned",
      title: "Ticket needs routing",
      message: `${formatTicketNumber(ticket.ticket_number)}: ${ticket.title} has no matching specialist and awaits manual assignment.`,
    });
  }

  const { data: organization } = await svc
    .from("organizations")
    .select("support_email")
    .eq("id", organizationId)
    .single();

  await sendEmail({
    to: organization?.support_email,
    subject: ticketEmailSubject(ticket.ticket_number, ticket.title),
    text:
      `A new ticket was filed on a customer's behalf.\n\n` +
      `${formatTicketNumber(ticket.ticket_number)}: ${ticket.title}\n` +
      `Customer: ${customer.full_name ?? customer.id}\n` +
      `Priority: ${ticket.priority}\n\n${ticket.description}`,
  });

  scheduleBackground(
    runAITriage(ticket.id, title, description, organizationId, input.priority, user.id)
  );

  return NextResponse.json({ ticket }, { status: 201 });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
