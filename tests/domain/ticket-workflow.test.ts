import { describe, expect, it } from "vitest";
import {
  canAgentSetExecutionStatus,
  canDecideTicketReview,
  canPostTicketComment,
  canRequestTicketReview,
  getForbiddenTicketPatchFields,
  getTicketBusinessStage,
} from "../../lib/ticket-workflow";

describe("enterprise ticket workflow", () => {
  it("reserves routing fields for administrators", () => {
    expect(getForbiddenTicketPatchFields("agent", { status: "in_progress", assigned_to: "agent-b" })).toEqual(["assigned_to"]);
    expect(getForbiddenTicketPatchFields("manager", { status: "in_progress" })).toEqual(["status"]);
    expect(getForbiddenTicketPatchFields("admin", { category_id: "software", assigned_to: null })).toEqual([]);
  });

  it("prevents agents from resolving or closing work", () => {
    expect(canAgentSetExecutionStatus("in_progress", "resolved")).toBe(false);
    expect(canAgentSetExecutionStatus("in_progress", "pending_customer")).toBe(true);
  });

  it("requires the assignee to request review and an admin to decide", () => {
    expect(canRequestTicketReview({ role: "agent", actorId: "a", assignedTo: "a", status: "in_progress", reviewStatus: "not_requested" })).toBe(true);
    expect(canRequestTicketReview({ role: "agent", actorId: "b", assignedTo: "a", status: "in_progress", reviewStatus: "not_requested" })).toBe(false);
    expect(canDecideTicketReview("admin", "pending")).toBe(true);
    expect(canDecideTicketReview("manager", "pending")).toBe(false);
  });

  it("projects storage state into business queues", () => {
    expect(getTicketBusinessStage({ status: "open", assigned_to: null })).toBe("new");
    expect(getTicketBusinessStage({ status: "in_progress", assigned_to: "a", review_status: "pending" })).toBe("ready");
    expect(getTicketBusinessStage({ status: "resolved", assigned_to: "a" })).toBe("processed");
  });
});

describe("canPostTicketComment", () => {
  it("rejects customer comments on a closed ticket", () => {
    expect(canPostTicketComment("customer", "closed")).toBe(false);
  });

  it("keeps the resolved ticket open to the customer (reply / reopen flow)", () => {
    expect(canPostTicketComment("customer", "resolved")).toBe(true);
  });

  it("allows customer comments on active tickets", () => {
    for (const status of ["open", "in_progress", "pending_customer", "pending_third_party"]) {
      expect(canPostTicketComment("customer", status)).toBe(true);
    }
  });

  it("fails closed for an unknown role on a closed ticket", () => {
    expect(canPostTicketComment(null, "closed")).toBe(false);
    expect(canPostTicketComment(undefined, "closed")).toBe(false);
  });

  it("does not restrict staff", () => {
    for (const role of ["agent", "manager", "admin"]) {
      expect(canPostTicketComment(role, "closed")).toBe(true);
    }
  });
});
