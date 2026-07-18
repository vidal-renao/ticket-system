import { describe, expect, it } from "vitest";
import { canProfileAccessTicket } from "../../lib/ticket-visibility";

const ticket = {
  organization_id: "org-a",
  created_by: "customer-a",
  assigned_to: "agent-a",
};

describe("canProfileAccessTicket", () => {
  it("allows only the owning customer", () => {
    expect(canProfileAccessTicket({ id: "customer-a", role: "customer", organization_id: "org-a" }, ticket)).toBe(true);
    expect(canProfileAccessTicket({ id: "customer-b", role: "customer", organization_id: "org-a" }, ticket)).toBe(false);
  });

  it("never crosses the organization boundary", () => {
    expect(canProfileAccessTicket({ id: "manager-b", role: "manager", organization_id: "org-b" }, ticket)).toBe(false);
  });

  it("allows an agent to access their assignment but not another agent assignment", () => {
    expect(canProfileAccessTicket({ id: "agent-a", role: "agent", organization_id: "org-a" }, ticket)).toBe(true);
    expect(canProfileAccessTicket({ id: "agent-b", role: "agent", organization_id: "org-a" }, ticket)).toBe(false);
  });

  it("allows unassigned work only when the caller opts in", () => {
    const unassigned = { ...ticket, assigned_to: null };
    const agent = { id: "agent-a", role: "agent" as const, organization_id: "org-a" };
    expect(canProfileAccessTicket(agent, unassigned)).toBe(true);
    expect(canProfileAccessTicket(agent, unassigned, { includeUnassignedForAgents: false })).toBe(false);
  });

  it("allows managers and admins within their organization", () => {
    expect(canProfileAccessTicket({ id: "manager-a", role: "manager", organization_id: "org-a" }, ticket)).toBe(true);
    expect(canProfileAccessTicket({ id: "admin-a", role: "admin", organization_id: "org-a" }, ticket)).toBe(true);
  });
});
