import { describe, expect, it } from "vitest";
import {
  classifyRecoveryFailure,
  landingAfterReset,
  readRecoveryCredentials,
} from "../../lib/auth-recovery-link";
import { DEFAULT_APP_URL, appUrl, normalizeOrigin } from "../../lib/app-url";

describe("reading what the reset link arrived with", () => {
  it("recognises a PKCE recovery", () => {
    expect(
      readRecoveryCredentials({ search: "?code=b1f84fe9-dd7e", hash: "" })
    ).toEqual({ kind: "pkce", code: "b1f84fe9-dd7e", flow: "recovery" });
  });

  it("recognises an admin invitation, which arrives as an implicit grant", () => {
    // An admin-generated invite has no PKCE verifier in the recipient's
    // browser, so GoTrue returns the tokens in the fragment instead.
    expect(
      readRecoveryCredentials({
        search: "",
        hash: "#access_token=eyJhb&refresh_token=r3fr3sh&type=invite&expires_in=3600",
      })
    ).toEqual({
      kind: "implicit",
      accessToken: "eyJhb",
      refreshToken: "r3fr3sh",
      flow: "invite",
    });
  });

  it("does not call a half-populated fragment a session", () => {
    expect(
      readRecoveryCredentials({ search: "", hash: "#access_token=eyJhb&type=invite" }).kind
    ).toBe("none");
  });

  it("surfaces GoTrue's own refusal from either half of the URL", () => {
    expect(
      readRecoveryCredentials({
        search: "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid",
        hash: "",
      })
    ).toEqual({
      kind: "error",
      errorCode: "otp_expired",
      message: "Email link is invalid",
    });

    expect(
      readRecoveryCredentials({ search: "", hash: "#error_code=otp_expired" }).kind
    ).toBe("error");
  });

  it("prefers the error over a credential sitting beside it", () => {
    // GoTrue has already decided; redeeming the code would only trade a clear
    // message for a worse one.
    expect(
      readRecoveryCredentials({ search: "?code=abc&error_code=otp_expired", hash: "" }).kind
    ).toBe("error");
  });

  it("reports a bare page visit as nothing to redeem", () => {
    expect(readRecoveryCredentials({ search: "", hash: "" })).toEqual({ kind: "none" });
  });
});

describe("telling 'too late' apart from 'wrong link'", () => {
  it("reads the 422 the exchange actually returned on 2026-08-23 as expired", () => {
    // POST /token?grant_type=pkce -> 422
    // {"error_code":"flow_state_expired",
    //  "error":"invalid flow state, flow state has expired"}
    expect(
      classifyRecoveryFailure({
        code: "flow_state_expired",
        message: "invalid flow state, flow state has expired",
        status: 422,
      })
    ).toBe("expired");
  });

  it("still says expired when only the status survives", () => {
    // A 422 on this grant has one cause; the client library does not always
    // pass the error_code through.
    expect(classifyRecoveryFailure({ status: 422 })).toBe("expired");
  });

  it("treats an expired one-time token as expired too", () => {
    expect(classifyRecoveryFailure({ code: "otp_expired", message: "Email link is invalid or has expired" })).toBe(
      "expired"
    );
  });

  it("does not need a description to recognise an expired code", () => {
    // GoTrue's redirect carries error_code without error_description often
    // enough that reading only the message put people on the wrong screen.
    expect(classifyRecoveryFailure({ code: "otp_expired" })).toBe("expired");
    expect(classifyRecoveryFailure({ code: "flow_state_expired" })).toBe("expired");
  });

  it("names a banned account closed, not an invalid link", () => {
    // Discovered the hard way: an administrator reset the password of a frozen
    // account, GoTrue answered /verify with user_banned, and the screen told
    // the recipient to open the link in the browser they requested it from --
    // advice for a different problem, and a loop with no end.
    expect(classifyRecoveryFailure({ code: "user_banned" })).toBe("closed");
    expect(
      classifyRecoveryFailure({ code: "access_denied", message: "User is banned" })
    ).toBe("closed");
  });

  it("prefers closed over expired when a banned account is also stale", () => {
    // Both facts are true; only one of them is the reason they cannot get in.
    expect(
      classifyRecoveryFailure({ code: "user_banned", message: "link has expired" })
    ).toBe("closed");
  });

  it("calls a missing verifier invalid, not expired", () => {
    // Opened in a different browser than the one that asked for the link.
    // Telling that person to request a new link is right, but telling them it
    // expired would be a lie and they would repeat the same mistake.
    expect(
      classifyRecoveryFailure({
        code: "validation_failed",
        message: "code verifier could not be found in local storage",
        status: 400,
      })
    ).toBe("invalid");
  });

  it("calls a mismatched verifier invalid", () => {
    expect(
      classifyRecoveryFailure({
        code: "bad_code_verifier",
        message: "code challenge does not match previously saved code verifier",
        status: 403,
      })
    ).toBe("invalid");
  });
});

describe("where the screen sends someone afterwards", () => {
  it("keeps an invitee signed in", () => {
    expect(landingAfterReset("invite")).toBe("/tickets");
  });

  it("makes a recovery re-authenticate", () => {
    expect(landingAfterReset("recovery")).toBe("/login");
  });
});

describe("the one answer for this deployment's origin", () => {
  it("prefers an explicit NEXT_PUBLIC_APP_URL", () => {
    expect(appUrl({ configured: "https://helpdesk.example.ch", vercel: "preview.vercel.app" })).toBe(
      "https://helpdesk.example.ch"
    );
  });

  it("lets a preview deployment link to itself", () => {
    expect(appUrl({ vercel: "ticket-system-abc123.vercel.app" })).toBe(
      "https://ticket-system-abc123.vercel.app"
    );
  });

  it("falls back to the production domain", () => {
    expect(appUrl({})).toBe(DEFAULT_APP_URL);
    expect(appUrl({ configured: "", vercel: "" })).toBe(DEFAULT_APP_URL);
  });

  it("never produces a doubled slash or a scheme-less URL", () => {
    // Callers concatenate a path straight onto this.
    expect(`${appUrl({ configured: "http://localhost:3000/" })}/reset-password`).toBe(
      "http://localhost:3000/reset-password"
    );
    expect(normalizeOrigin("ticket-system-sigma-pink.vercel.app")).toBe(DEFAULT_APP_URL);
    expect(normalizeOrigin("  https://a.ch//  ")).toBe("https://a.ch");
  });
});
