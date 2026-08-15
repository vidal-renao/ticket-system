import { describe, expect, it } from "vitest";
import { planCustomerOnboarding, alreadyCustomerMessage } from "../../lib/customer-onboarding";

const NOBODY = { existingUserId: null, existingProfile: null, confirmedLink: false };

describe("nobody has that address yet", () => {
  it("invites, confirmation or not", () => {
    expect(planCustomerOnboarding(NOBODY)).toEqual({ kind: "invite" });
    expect(planCustomerOnboarding({ ...NOBODY, confirmedLink: true })).toEqual({ kind: "invite" });
  });
});

describe("the address has an account from another application", () => {
  const OTHER_APP = { existingUserId: "user-1", existingProfile: null };

  it("asks before adopting it", () => {
    // Deliberate friction: an admin must see whose account they are attaching
    // to before a profile appears, the same shape as the emergency close.
    expect(planCustomerOnboarding({ ...OTHER_APP, confirmedLink: false })).toEqual({
      kind: "needs_confirmation",
    });
  });

  it("links it once confirmed, reusing the account rather than creating one", () => {
    expect(planCustomerOnboarding({ ...OTHER_APP, confirmedLink: true })).toEqual({
      kind: "link_existing",
      userId: "user-1",
    });
  });
});

describe("the address is already a customer here", () => {
  const EXISTING = {
    existingUserId: "user-2",
    existingProfile: { referenceCode: "VRE-COM-ABCD-EFGH" },
  };

  it("refuses, and names the customer it collides with", () => {
    expect(planCustomerOnboarding({ ...EXISTING, confirmedLink: false })).toEqual({
      kind: "already_customer",
      userId: "user-2",
      referenceCode: "VRE-COM-ABCD-EFGH",
    });
  });

  it("still refuses when the admin confirms the link", () => {
    // The confirmation means "adopt an account from another app", never
    // "overwrite a customer of this one". The old upsert rewrote
    // organization_id, role, customer_type and full_name from the form.
    expect(planCustomerOnboarding({ ...EXISTING, confirmedLink: true })).toEqual({
      kind: "already_customer",
      userId: "user-2",
      referenceCode: "VRE-COM-ABCD-EFGH",
    });
  });

  it("copes with a customer that has no reference code yet", () => {
    const plan = planCustomerOnboarding({
      existingUserId: "user-3",
      existingProfile: { referenceCode: null },
      confirmedLink: false,
    });
    expect(plan).toEqual({ kind: "already_customer", userId: "user-3", referenceCode: null });
  });
});

describe("what the admin is told about a collision", () => {
  it("quotes the reference code when there is one", () => {
    expect(alreadyCustomerMessage("VRE-CUS-1234-5678")).toContain("VRE-CUS-1234-5678");
  });

  it("stays readable without one", () => {
    const message = alreadyCustomerMessage(null);
    expect(message).toContain("already a customer");
    expect(message).not.toContain("null");
  });
});
