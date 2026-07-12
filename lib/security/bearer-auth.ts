import { timingSafeEqual } from "node:crypto";

export type BearerAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: "Unauthorized" | "Service unavailable" };

const MIN_SECRET_LENGTH = 32;

export function verifyBearerSecret(
  request: Pick<Request, "headers">,
  configuredSecret: string | undefined
): BearerAuthorizationResult {
  const secret = configuredSecret?.trim();

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, status: 503, error: "Service unavailable" };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const candidate = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");

  if (
    expectedBuffer.length !== candidateBuffer.length ||
    !timingSafeEqual(expectedBuffer, candidateBuffer)
  ) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
