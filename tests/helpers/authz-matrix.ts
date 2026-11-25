import { describe, expect, it } from "vitest";

/**
 * The authorization matrix every protected route is held to (REQ-F1-08):
 *
 *   no session          -> 401
 *   wrong role          -> refused
 *   other organization  -> refused, without revealing the resource exists
 *   correct caller      -> allowed
 *
 * Each cell is one test. A denied cell also runs `expectUntouched`, because a
 * route that answers 403 after it has already written is not a refusal.
 */
export interface AuthzCell {
  /** Signs this user in; null is "no session". */
  userId: string | null;
  status: number;
  label?: string;
}

export interface AuthzMatrix {
  route: string;
  /** Sets the session the route will see. */
  signIn: (userId: string | null) => void;
  /** Invokes the route once with a valid request. */
  call: () => Promise<Response>;
  wrongRole: AuthzCell[];
  otherOrganization: AuthzCell;
  allowed: AuthzCell & { verify?: (response: Response) => void | Promise<void> };
  /** Asserts that a refused request changed nothing. */
  expectUntouched: () => void | Promise<void>;
}

export function describeAuthzMatrix(matrix: AuthzMatrix) {
  describe(`authorization matrix: ${matrix.route}`, () => {
    it("no session -> 401, nothing written", async () => {
      matrix.signIn(null);
      expect((await matrix.call()).status).toBe(401);
      await matrix.expectUntouched();
    });

    it.each(matrix.wrongRole.map((cell) => [cell.label ?? cell.userId, cell] as const))(
      "wrong role (%s) -> refused, nothing written",
      async (_label, cell) => {
        matrix.signIn(cell.userId);
        expect((await matrix.call()).status).toBe(cell.status);
        await matrix.expectUntouched();
      }
    );

    it(`other organization -> ${matrix.otherOrganization.status}, nothing written`, async () => {
      matrix.signIn(matrix.otherOrganization.userId);
      expect((await matrix.call()).status).toBe(matrix.otherOrganization.status);
      await matrix.expectUntouched();
    });

    it(`correct caller -> ${matrix.allowed.status}`, async () => {
      matrix.signIn(matrix.allowed.userId);
      const response = await matrix.call();
      expect(response.status).toBe(matrix.allowed.status);
      await matrix.allowed.verify?.(response);
    });
  });
}

/**
 * The matrix for an endpoint guarded by a shared bearer secret rather than a
 * session (cron, inbound webhooks). There is no role or organization to get
 * wrong; the cells are the ways the credential can be absent or wrong, plus
 * the fail-closed case of a deployment that never configured the secret.
 */
export interface BearerMatrix {
  route: string;
  secret: string;
  /** Configures (or, with undefined, removes) the secret the route reads. */
  configure: (secret: string | undefined) => void;
  call: (headers: Record<string, string>) => Promise<Response>;
  allowedStatus: number;
  expectUntouched: () => void | Promise<void>;
  verify?: (response: Response) => void | Promise<void>;
}

export function describeBearerMatrix(matrix: BearerMatrix) {
  describe(`authorization matrix: ${matrix.route}`, () => {
    it("secret not configured -> 503 (fails closed), nothing done", async () => {
      matrix.configure(undefined);
      expect((await matrix.call({ authorization: `Bearer ${matrix.secret}` })).status).toBe(503);
      await matrix.expectUntouched();
    });

    it("secret too short to be a secret -> 503, nothing done", async () => {
      matrix.configure("short");
      expect((await matrix.call({ authorization: "Bearer short" })).status).toBe(503);
      await matrix.expectUntouched();
    });

    it("no credential -> 401, nothing done", async () => {
      matrix.configure(matrix.secret);
      expect((await matrix.call({})).status).toBe(401);
      await matrix.expectUntouched();
    });

    it.each([
      ["wrong secret", (secret: string) => `Bearer ${"x".repeat(secret.length)}`],
      ["right secret, wrong scheme", (secret: string) => `Basic ${secret}`],
      ["secret with a suffix", (secret: string) => `Bearer ${secret}x`],
    ])("%s -> 401, nothing done", async (_label, header) => {
      matrix.configure(matrix.secret);
      expect((await matrix.call({ authorization: header(matrix.secret) })).status).toBe(401);
      await matrix.expectUntouched();
    });

    it(`correct secret -> ${matrix.allowedStatus}`, async () => {
      matrix.configure(matrix.secret);
      const response = await matrix.call({ authorization: `Bearer ${matrix.secret}` });
      expect(response.status).toBe(matrix.allowedStatus);
      await matrix.verify?.(response);
    });
  });
}
