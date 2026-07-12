import { describe, expect, it } from "vitest";
import { verifyBearerSecret } from "../../lib/security/bearer-auth";

const secret = "a-secure-runtime-secret-with-32-chars";

function requestWithAuthorization(authorization?: string) {
  return new Request("https://helpdesk.example.test/internal", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("verifyBearerSecret", () => {
  it("fails closed when the server secret is missing", () => {
    expect(verifyBearerSecret(requestWithAuthorization(), undefined)).toEqual({
      ok: false,
      status: 503,
      error: "Service unavailable",
    });
  });

  it("fails closed when the configured secret is too short", () => {
    expect(verifyBearerSecret(requestWithAuthorization("Bearer short"), "short")).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("rejects a missing authorization header", () => {
    expect(verifyBearerSecret(requestWithAuthorization(), secret)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("rejects an incorrect bearer token", () => {
    expect(
      verifyBearerSecret(
        requestWithAuthorization("Bearer another-secret-with-at-least-32-chars"),
        secret
      )
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts the exact bearer token", () => {
    expect(
      verifyBearerSecret(requestWithAuthorization(`Bearer ${secret}`), secret)
    ).toEqual({ ok: true });
  });
});
