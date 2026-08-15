import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchesTicketQuery, ticketRefTokens } from "@/lib/ticket-search";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 400;
const RESULT_LIMIT = 8;

/**
 * Autocomplete feed for the ticket search box.
 *
 * Reads with the caller's own client, so the tickets RLS policy decides what
 * is visible: a customer only ever sees their own, an agent their assigned
 * ones, managers and admins the whole organization. Matching reuses
 * matchesTicketQuery, the same matcher every ticket list uses, so "TK-0042",
 * "0042" and "42" all resolve to the same ticket.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("hd_tickets")
    .select("id, ticket_number, title, status, priority")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = (data ?? [])
    .filter((ticket) =>
      matchesTicketQuery(query, [
        ticket.title,
        ticket.status,
        ticket.priority,
        ...ticketRefTokens(ticket.ticket_number),
      ])
    )
    .slice(0, RESULT_LIMIT)
    .map((ticket) => ({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
    }));

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
