import { describe, expect, it } from "vitest";
import { canonicalRoutingLabel, inferTicketCategory, selectFreestAgent, selectSpecialistAgent } from "../../lib/ticket-routing";

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
