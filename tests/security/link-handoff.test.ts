import { describe, expect, it, vi } from "vitest";
import {
  decideLinkHandoff,
  isInviteEmailFailure,
  linkIssuanceLogEntry,
} from "../../lib/link-handoff";
import { inviteCustomerAccount } from "../../lib/customer-invite";

const LINK = "https://example.supabase.co/auth/v1/verify?token=secret-token&type=invite";

describe("decideLinkHandoff", () => {
  it("invited + email delivered: no link, whatever the flag", () => {
    for (const flag of ["true", "false", undefined]) {
      expect(
        decideLinkHandoff({ kind: "invite", emailDelivered: true, flag, link: LINK })
      ).toEqual({ link: null, handedToAdmin: false, reason: "email_delivered" });
    }
  });

  it("invited + email failed + flag on: the link goes to the admin", () => {
    expect(
      decideLinkHandoff({ kind: "invite", emailDelivered: false, flag: "true", link: LINK })
    ).toEqual({ link: LINK, handedToAdmin: true, reason: "handed_to_admin" });
  });

  it("email failed + flag off or unset: no link", () => {
    for (const flag of ["false", undefined, "", "1", "TRUE", "yes", " true"]) {
      expect(
        decideLinkHandoff({ kind: "recovery", emailDelivered: false, flag, link: LINK })
      ).toEqual({ link: null, handedToAdmin: false, reason: "handoff_disabled" });
    }
  });

  it("link_existing: never a link, even with the flag on and no email", () => {
    for (const emailDelivered of [true, false]) {
      expect(
        decideLinkHandoff({ kind: "link_existing", emailDelivered, flag: "true", link: LINK })
      ).toEqual({ link: null, handedToAdmin: false, reason: "linked_account" });
    }
  });

  it("recovery + email delivered: no link", () => {
    expect(
      decideLinkHandoff({ kind: "recovery", emailDelivered: true, flag: "true", link: LINK })
    ).toEqual({ link: null, handedToAdmin: false, reason: "email_delivered" });
  });

  it("recovery + email failed + flag on: the link goes to the admin", () => {
    expect(
      decideLinkHandoff({ kind: "recovery", emailDelivered: false, flag: "true", link: LINK })
    ).toEqual({ link: LINK, handedToAdmin: true, reason: "handed_to_admin" });
  });

  it("nothing to hand over when no link exists", () => {
    expect(
      decideLinkHandoff({ kind: "invite", emailDelivered: false, flag: "true", link: null })
    ).toEqual({ link: null, handedToAdmin: false, reason: "no_link" });
  });
});

describe("isInviteEmailFailure", () => {
  it("recognises GoTrue's mail rate limit and SMTP failure", () => {
    expect(isInviteEmailFailure({ status: 429, code: "over_email_send_rate_limit" })).toBe(true);
    expect(isInviteEmailFailure({ status: 500, message: "Error sending invite email" })).toBe(true);
    expect(isInviteEmailFailure({ status: 429, message: "email rate limit exceeded" })).toBe(true);
  });

  it("does not treat other invite failures as a mail problem", () => {
    expect(isInviteEmailFailure(null)).toBe(false);
    expect(isInviteEmailFailure({ status: 422, code: "email_exists" })).toBe(false);
    expect(isInviteEmailFailure({ status: 500, message: "Database error saving new user" })).toBe(false);
    expect(isInviteEmailFailure({ status: 429, code: "over_request_rate_limit" })).toBe(false);
    expect(isInviteEmailFailure({ status: 400, code: "email_address_invalid" })).toBe(false);
  });
});

describe("linkIssuanceLogEntry", () => {
  it("records who, for whom, what and the outcome -- never the link or an address", () => {
    const entry = linkIssuanceLogEntry({
      source: "admin/customers/individual",
      actorId: "actor-1",
      targetUserId: "target-1",
      organizationId: "org-1",
      linkType: "invite",
      emailDelivered: false,
      decision: { link: LINK, handedToAdmin: true, reason: "handed_to_admin" },
    });
    expect(entry).toEqual({
      event: "access_link_issued",
      source: "admin/customers/individual",
      actor_id: "actor-1",
      target_user_id: "target-1",
      organization_id: "org-1",
      link_type: "invite",
      email_delivered: false,
      handed_to_admin: true,
      reason: "handed_to_admin",
    });
    expect(JSON.stringify(entry)).not.toContain("secret-token");
  });
});

describe("inviteCustomerAccount", () => {
  const options = { data: { full_name: "Ada" }, redirectTo: "https://app.test/reset-password" };

  function service(overrides: {
    invite?: unknown;
    generate?: unknown;
  }) {
    const inviteUserByEmail = vi.fn().mockResolvedValue(overrides.invite);
    const generateLink = vi.fn().mockResolvedValue(overrides.generate);
    return { client: { auth: { admin: { inviteUserByEmail, generateLink } } }, inviteUserByEmail, generateLink };
  }

  it("a delivered invitation mints no second link", async () => {
    const { client, generateLink } = service({
      invite: { data: { user: { id: "u1" } }, error: null },
    });
    expect(await inviteCustomerAccount(client, "a@example.test", options, "true")).toEqual({
      ok: true,
      userId: "u1",
      emailDelivered: true,
      link: null,
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("mail failure + flag on: creates the account without mail and returns its invite link", async () => {
    const { client, generateLink } = service({
      invite: { data: { user: null }, error: { status: 429, code: "over_email_send_rate_limit" } },
      generate: { data: { user: { id: "u2" }, properties: { action_link: LINK } }, error: null },
    });
    expect(await inviteCustomerAccount(client, "a@example.test", options, "true")).toEqual({
      ok: true,
      userId: "u2",
      emailDelivered: false,
      link: LINK,
    });
    expect(generateLink).toHaveBeenCalledWith({ type: "invite", email: "a@example.test", options });
  });

  it("mail failure + flag off: fails as before, without minting anything", async () => {
    const error = { status: 429, code: "over_email_send_rate_limit" };
    const { client, generateLink } = service({ invite: { data: { user: null }, error } });
    expect(await inviteCustomerAccount(client, "a@example.test", options, undefined)).toEqual({
      ok: false,
      error,
      emailFailure: true,
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("a failure that is not about mail never falls back, even with the flag on", async () => {
    const error = { status: 500, message: "Database error saving new user" };
    const { client, generateLink } = service({ invite: { data: { user: null }, error } });
    expect(await inviteCustomerAccount(client, "a@example.test", options, "true")).toEqual({
      ok: false,
      error,
      emailFailure: false,
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("reports the fallback's own failure", async () => {
    const fallbackError = { status: 422, code: "email_exists" };
    const { client } = service({
      invite: { data: { user: null }, error: { status: 500, message: "Error sending invite email" } },
      generate: { data: { user: null, properties: null }, error: fallbackError },
    });
    expect(await inviteCustomerAccount(client, "a@example.test", options, "true")).toEqual({
      ok: false,
      error: fallbackError,
      emailFailure: true,
    });
  });
});
