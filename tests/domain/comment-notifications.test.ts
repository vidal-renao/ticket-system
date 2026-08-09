import { describe, expect, it } from "vitest";
import { planCommentNotification } from "../../lib/comment-notifications";

const AGENT = "agent-1";
const OTHER_AGENT = "agent-2";
const CUSTOMER = "customer-1";
const ticket = { created_by: CUSTOMER, assigned_to: AGENT };

describe("internal notes reach the ticket owner", () => {
  it("notifies the assigned agent when another staff member writes a note", () => {
    const plan = planCommentNotification({
      isInternal: true,
      authorId: OTHER_AGENT,
      authorIsStaff: true,
      ticket,
    });
    expect(plan).toEqual({ recipientId: AGENT, type: "comment.internal", title: "New internal note" });
  });

  it("never notifies the author of their own note", () => {
    expect(
      planCommentNotification({ isInternal: true, authorId: AGENT, authorIsStaff: true, ticket })
    ).toBeNull();
  });

  it("stays silent, rather than failing, on an unassigned ticket", () => {
    expect(
      planCommentNotification({
        isInternal: true,
        authorId: OTHER_AGENT,
        authorIsStaff: true,
        ticket: { created_by: CUSTOMER, assigned_to: null },
      })
    ).toBeNull();
  });

  it("never routes an internal note to the customer", () => {
    // The whole point of the flag: the requester must not learn of it.
    const plan = planCommentNotification({
      isInternal: true,
      authorId: OTHER_AGENT,
      authorIsStaff: true,
      ticket,
    });
    expect(plan?.recipientId).not.toBe(CUSTOMER);
  });
});

describe("public comments keep notifying the other side", () => {
  it("tells the customer when staff replies", () => {
    const plan = planCommentNotification({
      isInternal: false,
      authorId: AGENT,
      authorIsStaff: true,
      ticket,
    });
    expect(plan).toEqual({ recipientId: CUSTOMER, type: "comment.public", title: "New ticket comment" });
  });

  it("tells the assigned agent when the customer replies", () => {
    const plan = planCommentNotification({
      isInternal: false,
      authorId: CUSTOMER,
      authorIsStaff: false,
      ticket,
    });
    expect(plan?.recipientId).toBe(AGENT);
    expect(plan?.type).toBe("comment.public");
  });

  it("has nobody to tell when the customer replies on an unassigned ticket", () => {
    expect(
      planCommentNotification({
        isInternal: false,
        authorId: CUSTOMER,
        authorIsStaff: false,
        ticket: { created_by: CUSTOMER, assigned_to: null },
      })
    ).toBeNull();
  });

  it("does not notify a customer commenting on their own ticket", () => {
    expect(
      planCommentNotification({
        isInternal: false,
        authorId: CUSTOMER,
        authorIsStaff: true,
        ticket,
      })
    ).toBeNull();
  });
});
