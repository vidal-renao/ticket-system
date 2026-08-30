/**
 * Reading the link somebody arrived on, and deciding what /reset-password owes
 * them.
 *
 * A recovery link is a PKCE flow. GoTrue's /verify redirects here with a
 * `?code=`, and the browser has to trade that code for a session before any
 * password can be set. That trade is on a *short* clock -- GoTrue expires the
 * flow state five minutes after the link is clicked, and answers a late
 * exchange with
 *
 *   422 {"error_code":"flow_state_expired",
 *        "error":"invalid flow state, flow state has expired"}
 *
 * The screen used to start that trade inside the submit handler, because the
 * Supabase client was constructed there and nowhere else and constructing it
 * is what kicks off the exchange. So the five minutes were spent choosing a
 * password. On 2026-08-23 the auth log recorded the whole shape of it: /verify
 * at 19:31:29, the exchange at 19:39:30, eight minutes later, 422. All the
 * person saw after typing a password twice was "Auth session missing!".
 *
 * The exchange now happens on mount, seconds after the click, and this module
 * is the pure part of that: what is in the URL, and what a failure means.
 */

/** What the URL is offering, if anything. */
export type RecoveryCredentials =
  /** PKCE. The code is traded for a session against the verifier cookie. */
  | { kind: "pkce"; code: string; flow: RecoveryFlow }
  /**
   * An implicit grant, which is what an admin-generated invitation produces:
   * the recipient's browser holds no PKCE verifier, so GoTrue returns the
   * tokens in the fragment instead.
   */
  | { kind: "implicit"; accessToken: string; refreshToken: string; flow: RecoveryFlow }
  /** GoTrue itself refused before we got a turn. */
  | { kind: "error"; errorCode: string | null; message: string }
  /** Nothing usable -- someone opened the page on their own. */
  | { kind: "none" };

/**
 * Recovery and invitation both land here and both end with a password being
 * set, but they are not the same errand and should not end the same way.
 */
export type RecoveryFlow = "recovery" | "invite";

/** What the screen should be showing. */
export type RecoveryLinkState =
  /** Trading the code for a session. Nothing to type yet. */
  | "checking"
  /** There is a session. Show the form. */
  | "ready"
  /** The link was real but is past its window. Offer a fresh one. */
  | "expired"
  /**
   * No session and nothing usable in the URL -- opened in a different browser
   * than the one that asked for the link, already used, or hand-typed.
   */
  | "invalid"
  /**
   * The link was fine; the account is closed. GoTrue refuses a banned user at
   * /verify with `user_banned`, and telling that person to try another browser
   * would send them round a loop that cannot end -- the remedy is a
   * conversation with an administrator, not another attempt.
   */
  | "closed";

/** GoTrue's code for a PKCE flow state that outlived its window. */
export const FLOW_STATE_EXPIRED = "flow_state_expired";

/** GoTrue's code for an account with `banned_until` in the future. */
export const USER_BANNED = "user_banned";

/**
 * Does the URL carry anything worth trying, and of which kind?
 *
 * Both the query string and the fragment are inspected because the two arrival
 * shapes use different halves of the URL, and an error can come back in either.
 */
export function readRecoveryCredentials(input: {
  search: string;
  hash: string;
}): RecoveryCredentials {
  const query = new URLSearchParams(input.search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(input.hash.replace(/^#/, ""));

  // An error wins over any credential also present: GoTrue has already
  // decided, and trying the credential would only produce a worse message.
  const errorCode = query.get("error_code") ?? fragment.get("error_code");
  const errorDescription =
    query.get("error_description") ?? fragment.get("error_description");
  const error = query.get("error") ?? fragment.get("error");
  if (errorCode || errorDescription || error) {
    return {
      kind: "error",
      errorCode: errorCode ?? null,
      message: errorDescription ?? error ?? "",
    };
  }

  const flow = readFlow(query, fragment);

  const code = query.get("code");
  if (code) return { kind: "pkce", code, flow };

  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "implicit", accessToken, refreshToken, flow };
  }

  return { kind: "none" };
}

function readFlow(query: URLSearchParams, fragment: URLSearchParams): RecoveryFlow {
  const type = query.get("type") ?? fragment.get("type");
  return type === "invite" || type === "signup" ? "invite" : "recovery";
}

/**
 * Distinguishes "too late" from "wrong link".
 *
 * Worth the distinction because the remedies differ and so does the
 * reassurance: an expired link means the person did nothing wrong and a fresh
 * one will work, which is worth saying rather than leaving them to wonder
 * whether they mistyped something.
 */
export function classifyRecoveryFailure(error: {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}): Extract<RecoveryLinkState, "expired" | "invalid" | "closed"> {
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();

  // Checked first: a banned account also produces no session, and every other
  // branch here would misread that absence as a problem with the link.
  if (code === USER_BANNED || message.includes("user is banned")) {
    return "closed";
  }

  if (
    // flow_state_expired from the PKCE grant, otp_expired from a stale email
    // link. GoTrue does not always send a description alongside the code, so
    // the code has to carry the decision on its own.
    code.includes("expired") ||
    message.includes("expired") ||
    // 422 on the PKCE grant is GoTrue's unprocessable-entity answer, and the
    // expired flow state is the only thing that produces it here: a missing
    // flow state is 404, a mismatched verifier 403, a malformed request 400.
    error.status === 422
  ) {
    return "expired";
  }

  return "invalid";
}

/**
 * An invitation ends with the account created and the person already holding a
 * session, so sending them to /login to type the password they chose ten
 * seconds ago is friction for no security gain -- they go where any newly
 * registered user goes. A recovery belongs to an existing account, and a
 * deliberate re-authentication is the right ending for it.
 */
export function landingAfterReset(flow: RecoveryFlow): "/tickets" | "/login" {
  return flow === "invite" ? "/tickets" : "/login";
}
