import { describe, expect, it } from "vitest";
import { assignmentNotificationMessage, shouldNotifyAssignee } from "../../lib/assignment-notifications";

describe("who gets told about an assignment", () => {
  it("notifies an agent who did not own the ticket before", () => {
    expect(shouldNotifyAssignee(null, "agent-1")).toBe(true);
    expect(shouldNotifyAssignee("agent-1", "agent-2")).toBe(true);
  });

  it("does not repeat itself when the owner has not changed", () => {
    // An admin editing priority on an assigned ticket re-sends assigned_to
    // unchanged; that must not read as a fresh handover.
    expect(shouldNotifyAssignee("agent-1", "agent-1")).toBe(false);
  });

  it("tells nobody when a ticket is unassigned", () => {
    expect(shouldNotifyAssignee("agent-1", null)).toBe(false);
    expect(shouldNotifyAssignee("agent-1", undefined)).toBe(false);
    expect(shouldNotifyAssignee(null, null)).toBe(false);
  });

  it("treats null and undefined as the same absence of an owner", () => {
    // Routing passes null, a PATCH that omits assigned_to yields undefined.
    expect(shouldNotifyAssignee(undefined, "agent-1")).toBe(true);
    expect(shouldNotifyAssignee(null, undefined)).toBe(false);
  });
});

describe("assignment message", () => {
  it("names the ticket", () => {
    expect(assignmentNotificationMessage(73)).toBe("TK-0073 was assigned to you.");
  });

  it("says when the work is inherited backlog rather than a new arrival", () => {
    expect(assignmentNotificationMessage(73, "backlog")).toContain("from the unrouted backlog");
  });

  it("survives a ticket with no number", () => {
    expect(assignmentNotificationMessage(null)).toBe("Ticket was assigned to you.");
  });
});
