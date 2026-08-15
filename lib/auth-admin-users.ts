/**
 * Looking up an existing auth user by address, safely.
 *
 * GoTrue exposes no "get user by email" for admins, only a paginated list, and
 * the two customer-creation endpoints each rolled their own single unpaginated
 * call with the error discarded. That has two failure modes, and this
 * instance's `auth.users` is shared by six applications, so both are live:
 *
 *   1. A page-sized blind spot. `listUsers()` with no arguments returns the
 *      first page only. Every address past it reads as free, the invite goes
 *      out, and GoTrue rejects it on the `users_email_key` unique index with
 *      its generic "Database error saving new user" -- which is what the admin
 *      actually saw.
 *
 *   2. "I could not check" collapsing into "it does not exist". `const { data }`
 *      dropped the error, so a failed lookup produced `undefined` and the code
 *      carried on as though the address were free.
 *
 * Both are fixed here rather than in the routes so the two endpoints cannot
 * drift apart again.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Well under GoTrue's cap, and large enough that most instances need one page. */
export const USER_LOOKUP_PAGE_SIZE = 200;

/**
 * A stop so a paginator that never reports exhaustion cannot spin forever.
 * Reaching it is reported as a failure, never as "not found" -- the whole point
 * of this module is that an incomplete search must not read as an empty one.
 */
export const USER_LOOKUP_MAX_PAGES = 50;

export type AuthUserSummary = { id: string; email: string };

export type UserLookupResult =
  | { ok: true; user: AuthUserSummary | null }
  | { ok: false; reason: "lookup_failed" | "too_many_users"; message: string };

type AdminListUsers = {
  auth: {
    admin: {
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: Array<{ id: string; email?: string | null }> } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * Walks every page until one comes back short, and returns the match or a
 * definite "no such user".
 *
 * Comparison is lower-cased on both sides. Callers pass addresses that Zod has
 * already trimmed; GoTrue normalises its own side, so a stored address never
 * carries surrounding whitespace.
 */
export async function findAuthUserByEmail(
  client: SupabaseClient | AdminListUsers,
  email: string
): Promise<UserLookupResult> {
  const target = email.trim().toLowerCase();
  if (!target) return { ok: true, user: null };

  const admin = (client as AdminListUsers).auth.admin;

  for (let page = 1; page <= USER_LOOKUP_MAX_PAGES; page++) {
    const { data, error } = await admin.listUsers({
      page,
      perPage: USER_LOOKUP_PAGE_SIZE,
    });

    if (error) {
      return { ok: false, reason: "lookup_failed", message: error.message };
    }
    // No error and no payload is not "no users"; it is an answer we cannot
    // read, and it must not be mistaken for an empty result.
    if (!data) {
      return {
        ok: false,
        reason: "lookup_failed",
        message: "The user directory returned no data",
      };
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match) {
      return { ok: true, user: { id: match.id, email: match.email ?? target } };
    }

    // A short page is the last page.
    if (data.users.length < USER_LOOKUP_PAGE_SIZE) {
      return { ok: true, user: null };
    }
  }

  return {
    ok: false,
    reason: "too_many_users",
    message: `Searched ${USER_LOOKUP_MAX_PAGES * USER_LOOKUP_PAGE_SIZE} accounts without reaching the end of the directory`,
  };
}

/**
 * What the admin is told when the directory could not be read. Deliberately not
 * "that address is free": the outcome of this endpoint is an invitation email
 * to a real person, and guessing is worse than asking them to retry.
 */
export const USER_LOOKUP_FAILED_MESSAGE =
  "Could not verify whether that email address already has an account. Nothing was created — please try again.";
