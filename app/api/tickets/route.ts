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

export async function POST(request: Request) {
  const supabase = await createClient();
  const svc = createServiceClientStatic();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; description?: string; team_id?: string; priority?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, description, team_id, priority: rawPriority } = body;
  const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;
  type Priority = (typeof VALID_PRIORITIES)[number];
  const priority: Priority = VALID_PRIORITIES.includes(rawPriority as Priority)
    ? (rawPriority as Priority)
    : "medium";
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 }
    );
  }

  const profile = await getCurrentProfile(svc, user.id);

  if (!profile?.organization_id) {
    console.error("[POST /api/tickets] Missing organization on profile", {
      userId: user.id,
      role: profile?.role ?? null,
    });
    return NextResponse.json({ error: "User has no organization" }, { status: 400 });
  }

  if (profile.role !== "customer") {
    return NextResponse.json({ error: "Only customers can create portal tickets" }, { status: 403 });
  }

  const assignment = await findAutomaticAssignment(svc, profile.organization_id, {
    teamId: team_id ?? null,
    categoryName: inferTicketCategory(title.trim(), description.trim()),
  });
  const createdAt = new Date().toISOString();
  const slaPolicy = await getSlaPolicyForTicket(svc, profile.organization_id, priority);
  const slaPatch = buildSlaDeadlinePatch(
    {
      id: "",
      organization_id: profile.organization_id,
      priority,
      status: "open",
      created_at: createdAt,
      resolved_at: null,
    },
    slaPolicy
  );

  const { data: ticket, error } = await supabase
    .from("hd_tickets")
    .insert({
      title: title.trim(),
      description: description.trim(),
      organization_id: profile.organization_id,
      created_by: user.id,
      status: "open",
      priority,
      source: "portal",
      created_at: createdAt,
      ...slaPatch,
      ...(assignment.assignedTo && { assigned_to: assignment.assignedTo, assigned_at: createdAt }),
      ...(assignment.categoryId && { category_id: assignment.categoryId }),
      // No owner because nobody was reachable, not because the ticket is new.
      // The queue reads this to say so out loud.
      ...(assignment.unassignedReason === "no_agents_available" && {
        metadata: { routing_status: ROUTING_AWAITING_AVAILABILITY },
      }),
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/tickets]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (assignment.assignedTo) {
    await logTicketLifecycleEvents({
      ticketId: ticket.id,
      organizationId: profile.organization_id,
      actorId: user.id,
      actorRole: profile.role,
      oldStatus: "new",
      newStatus: legacyToCanonicalStatus(ticket.status, ticket.assigned_to),
      oldAssignee: null,
      newAssignee: assignment.assignedTo,
    });

    await notifyTicketAssigned(supabase, {
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      previousAssignee: null,
      nextAssignee: assignment.assignedTo,
    });
  } else {
    // No matching specialist: the ticket sits in the administrator intake
    // queue, so administrators must be told there is unrouted work.
    await notifyOrgManagers(profile.organization_id, {
      ticketId: ticket.id,
      type: "ticket.unassigned",
      title: "Ticket needs routing",
      message: `${formatTicketNumber(ticket.ticket_number)}: ${ticket.title} has no matching specialist and awaits manual assignment.`,
    });
  }

  const { data: organization } = await svc
    .from("organizations")
    .select("support_email")
    .eq("id", profile.organization_id)
    .single();

  await sendEmail({
    to: organization?.support_email,
    subject: ticketEmailSubject(ticket.ticket_number, ticket.title),
    text: `A new ticket was created.\n\n${formatTicketNumber(ticket.ticket_number)}: ${ticket.title}\nPriority: ${ticket.priority}\n\n${ticket.description}`,
  });

  scheduleBackground(
    runAITriage(ticket.id, title.trim(), description.trim(), profile.organization_id, priority, user.id)
  );

  return NextResponse.json({ ticket }, { status: 201 });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}

