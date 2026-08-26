import { describe, expect, it } from "vitest";
import { adminTicketSchema } from "../../lib/validation/security";

const valid = {
  customer_id: "11111111-1111-4111-8111-111111111111",
  title: "VPN drops every ten minutes",
  description: "Reported by phone. Started after the Tuesday update.",
};

describe("the ticket an administrator files for a customer", () => {
  it("accepts the minimum a phone call produces", () => {
    const parsed = adminTicketSchema.parse(valid);
    expect(parsed.customer_id).toBe(valid.customer_id);
    // Priority is the one field an administrator taking a call should not have
    // to think about, so it has the same default the portal uses.
    expect(parsed.priority).toBe("medium");
    expect(parsed.team_id).toBeUndefined();
  });

  it("requires a customer, and a real id rather than a name", () => {
    expect(adminTicketSchema.safeParse({ ...valid, customer_id: undefined }).success).toBe(false);
    expect(adminTicketSchema.safeParse({ ...valid, customer_id: "Markus Fehr" }).success).toBe(false);
  });

  it("refuses an empty title or description, whitespace included", () => {
    expect(adminTicketSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(adminTicketSchema.safeParse({ ...valid, description: "\n\t " }).success).toBe(false);
  });

  it("trims what it keeps", () => {
    const parsed = adminTicketSchema.parse({ ...valid, title: "  VPN  ", description: " down " });
    expect(parsed.title).toBe("VPN");
    expect(parsed.description).toBe("down");
  });

  it("takes only the four priorities the SLA policies know", () => {
    for (const priority of ["low", "medium", "high", "critical"]) {
      expect(adminTicketSchema.parse({ ...valid, priority }).priority).toBe(priority);
    }
    expect(adminTicketSchema.safeParse({ ...valid, priority: "urgent" }).success).toBe(false);
  });

  it("gives the request no way to name the tenant, the author's role or the assignee", () => {
    // Every one of these is server-imposed. Zod strips unknown keys, so a
    // payload carrying them parses to something that cannot smuggle them into
    // the insert -- the same protection the customer-onboarding schemas rely on.
    const parsed = adminTicketSchema.parse({
      ...valid,
      organization_id: "22222222-2222-4222-8222-222222222222",
      assigned_to: "33333333-3333-4333-8333-333333333333",
      status: "closed",
      source: "portal",
      created_by: "44444444-4444-4444-8444-444444444444",
    } as Record<string, unknown>);

    expect(Object.keys(parsed).sort()).toEqual(["customer_id", "description", "priority", "title"]);
  });

  it("keeps an optional team only when it is a real id", () => {
    const teamId = "55555555-5555-4555-8555-555555555555";
    expect(adminTicketSchema.parse({ ...valid, team_id: teamId }).team_id).toBe(teamId);
    expect(adminTicketSchema.safeParse({ ...valid, team_id: "helpdesk" }).success).toBe(false);
  });
});
