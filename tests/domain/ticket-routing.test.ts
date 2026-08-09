import { describe, expect, it } from "vitest";
import {
  canonicalRoutingLabel,
  inferTicketCategory,
  routeTicket,
  ROUTING_AWAITING_AVAILABILITY,
  selectFreestAgent,
  selectSpecialistAgent,
} from "../../lib/ticket-routing";
import { isAwaitingAvailability } from "../../lib/ticket-presentation";
import { effectivePresence } from "../../lib/presence";

describe("enterprise ticket routing", () => {
  const candidates = [
    { id: "software-b", specialty: "Software", activeTickets: 1 },
    { id: "hardware-a", specialty: "Hardware", activeTickets: 0 },
    { id: "software-a", specialty: "Applications", activeTickets: 1 },
  ];

  it("routes only to a matching specialist", () => {
    expect(selectSpecialistAgent(candidates, { categoryName: "Software" })?.id).toBe("software-a");
  });

  it("reports no specialist for unmatched work", () => {
    // The specialist matcher itself stays strict; the overflow fallback above
    // it is what keeps such a ticket from landing unassigned.
    expect(selectSpecialistAgent(candidates, { categoryName: "Legal" })).toBeNull();
  });

  it("overflows unmatched work to the freest agent org-wide", () => {
    expect(selectSpecialistAgent(candidates, { categoryName: "Legal" })).toBeNull();
    expect(selectFreestAgent(candidates)?.id).toBe("hardware-a");
  });

  it("breaks an overflow tie deterministically, by id", () => {
    expect(selectFreestAgent([
      { id: "b", specialty: "Software", activeTickets: 2 },
      { id: "a", specialty: "Hardware", activeTickets: 2 },
    ])?.id).toBe("a");
  });

  it("has nobody to overflow to in an organization without agents", () => {
    expect(selectFreestAgent([])).toBeNull();
  });

  it("does not reorder the caller's candidate array", () => {
    const original = [...candidates];
    selectFreestAgent(candidates);
    expect(candidates).toEqual(original);
  });

  it("prefers the least busy matching specialist", () => {
    expect(selectSpecialistAgent([
      { id: "a", specialty: "Software", activeTickets: 4 },
      { id: "b", specialty: "Software", activeTickets: 2 },
    ], { categoryName: "Software" })?.id).toBe("b");
  });

  it("infers obvious software requests without AI", () => {
    expect(inferTicketCategory("CRM error", "The software application crashes on login")).toBe("software");
  });

  it("maps a new agent's specialty/team selection onto the same canonical category as a ticket's", () => {
    // A new employee onboarded with specialty "vpn" (New Employee form value)
    // and a team literally named "Network" must both resolve to the same
    // bucket as a ticket categorized "VPN & Remote Access", so backlog
    // inheritance on agent creation actually finds matching work.
    expect(canonicalRoutingLabel("vpn")).toBe("networking");
    expect(canonicalRoutingLabel("Network")).toBe("networking");
    expect(canonicalRoutingLabel("VPN & Remote Access")).toBe("networking");
  });

  it("keeps unrelated labels distinct", () => {
    expect(canonicalRoutingLabel("billing")).not.toBe(canonicalRoutingLabel("networking"));
    expect(canonicalRoutingLabel("Legal")).toBe("legal");
  });
});

describe("routing respects who is actually available", () => {
  const online = (id: string, specialty: string, activeTickets = 0) => ({ id, specialty, activeTickets, available: true });
  const away = (id: string, specialty: string, activeTickets = 0) => ({ id, specialty, activeTickets, available: false });

  it("skips an offline specialist in favour of an available one", () => {
    const decision = routeTicket([away("offline-sw", "Software"), online("online-sw", "Software", 9)], {
      categoryName: "Software",
    });
    expect(decision.agent?.id).toBe("online-sw");
    expect(decision.reason).toBe("specialist");
  });

  it("overflows to an available generalist rather than waking the right specialist", () => {
    // The hardware specialist is away, so a hardware ticket goes to whoever is
    // actually reachable -- an imperfect owner beats no owner.
    const decision = routeTicket([away("hw", "Hardware"), online("sw", "Software", 3)], {
      categoryName: "Hardware",
    });
    expect(decision.agent?.id).toBe("sw");
    expect(decision.reason).toBe("overflow");
  });

  it("leaves the ticket unassigned when everyone is away", () => {
    const decision = routeTicket([away("hw", "Hardware"), away("sw", "Software")], { categoryName: "Software" });
    expect(decision.agent).toBeNull();
    expect(decision.reason).toBe("no_agents_available");
  });

  it("tells an empty roster apart from an unreachable one", () => {
    // Different problems: one is a staffing gap, the other a shift gap. Only
    // the second one means "wait, somebody will come back".
    expect(routeTicket([], { categoryName: "Software" }).reason).toBe("no_agents");
    expect(routeTicket([away("sw", "Software")], { categoryName: "Software" }).reason).toBe("no_agents_available");
  });

  it("treats a candidate with no presence information as available", () => {
    // Callers that route without heartbeat data must keep working exactly as
    // they did before availability entered the picture.
    const decision = routeTicket([{ id: "sw", specialty: "Software", activeTickets: 0 }], { categoryName: "Software" });
    expect(decision.agent?.id).toBe("sw");
  });

  it("still balances load among the available", () => {
    const decision = routeTicket(
      [online("busy", "Software", 7), online("free", "Software", 1), away("freest", "Software", 0)],
      { categoryName: "Software" }
    );
    expect(decision.agent?.id).toBe("free");
  });
});

describe("an unassigned ticket says why it has no owner", () => {
  const awaiting = { routing_status: ROUTING_AWAITING_AVAILABILITY };

  it("distinguishes a ticket nobody could take from one that is merely new", () => {
    expect(isAwaitingAvailability({ assignedTo: null, metadata: awaiting })).toBe(true);
    expect(isAwaitingAvailability({ assignedTo: null, metadata: {} })).toBe(false);
    expect(isAwaitingAvailability({ assignedTo: null, metadata: null })).toBe(false);
  });

  it("drops the marker as soon as somebody owns the ticket", () => {
    // Nothing has to clear the metadata: taking the ticket is enough, so the
    // label can never go stale on an assigned ticket.
    expect(isAwaitingAvailability({ assignedTo: "agent-1", metadata: awaiting })).toBe(false);
  });

  it("survives other metadata being present", () => {
    expect(isAwaitingAvailability({ assignedTo: null, metadata: { is_vip: true, ...awaiting } })).toBe(true);
  });

  it("ignores metadata that is not an object", () => {
    expect(isAwaitingAvailability({ assignedTo: null, metadata: "awaiting_availability" })).toBe(false);
    expect(isAwaitingAvailability({ assignedTo: null, metadata: [awaiting] })).toBe(false);
  });
});

describe("availability is the declared signal, degraded by heartbeat", () => {
  const now = Date.parse("2026-08-09T12:00:00Z");
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const isAvailable = (status: string, lastSeen?: string | null) =>
    effectivePresence(status, lastSeen, now) === "online";

  it("routes to an online agent with a fresh heartbeat", () => {
    expect(isAvailable("online", minutesAgo(1))).toBe(true);
  });

  it("does not route to a busy agent, however fresh the heartbeat", () => {
    expect(isAvailable("busy", minutesAgo(1))).toBe(false);
  });

  it("does not route to an agent who declared online but stopped reporting", () => {
    // A closed laptop still reads "online" in the profile row.
    expect(isAvailable("online", minutesAgo(10))).toBe(false);
  });

  it("does not route to an agent who has never sent a heartbeat", () => {
    expect(isAvailable("online", null)).toBe(false);
  });

  it("trusts the declared status when heartbeats are unavailable entirely", () => {
    // getLastSeenMap yields undefined on a database without the presence
    // migration; routing must not stall everywhere in that case.
    expect(isAvailable("online", undefined)).toBe(true);
  });
});
