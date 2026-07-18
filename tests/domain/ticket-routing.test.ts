import { describe, expect, it } from "vitest";
import { inferTicketCategory, selectSpecialistAgent } from "../../lib/ticket-routing";

describe("enterprise ticket routing", () => {
  const candidates = [
    { id: "software-b", specialty: "Software", activeTickets: 1 },
    { id: "hardware-a", specialty: "Hardware", activeTickets: 0 },
    { id: "software-a", specialty: "Applications", activeTickets: 1 },
  ];

  it("routes only to a matching specialist", () => {
    expect(selectSpecialistAgent(candidates, { categoryName: "Software" })?.id).toBe("software-a");
  });

  it("leaves unmatched work unassigned", () => {
    expect(selectSpecialistAgent(candidates, { categoryName: "Legal" })).toBeNull();
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
});
