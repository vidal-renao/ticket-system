import { isInviteEmailFailure } from "@/lib/link-handoff";

/**
 * Invite a new customer, and know whether the invitation actually left.
 *
 * `inviteUserByEmail` creates the account and has Supabase Auth mail the
 * invitation in one step. When the mail cannot be sent (the built-in SMTP's
 * rate limit, or an SMTP failure) GoTrue fails the whole call and no account
 * exists. That error is the one precise "email failed" signal available for
 * onboarding -- a successful call means GoTrue accepted the message for
 * delivery, and nothing later is observable from here.
 *
 * Only in that case, and only when the deployment has opted in with
 * ADMIN_LINK_HANDOFF=true, the account is created without mail through
 * `generateLink({ type: "invite" })`, whose link the caller may hand to the
 * administrator (see decideLinkHandoff). With the flag off the failure is
 * returned unchanged and nothing is minted.
 */
type InviteOptions = { data: Record<string, unknown>; redirectTo: string };
type AuthAdminError = { status?: number; code?: string; message?: string };

type AuthAdminClient = {
  auth: {
    admin: {
      inviteUserByEmail: (
        email: string,
        options: InviteOptions
      ) => PromiseLike<{ data: { user: { id: string } | null } | null; error: AuthAdminError | null }>;
      generateLink: (params: {
        type: "invite";
        email: string;
        options: InviteOptions;
      }) => PromiseLike<{
        data: {
          user: { id: string } | null;
          properties: { action_link?: string | null } | null;
        } | null;
        error: AuthAdminError | null;
      }>;
    };
  };
};

export type CustomerInviteResult =
  | { ok: true; userId: string; emailDelivered: boolean; link: string | null }
  | { ok: false; error: AuthAdminError | null; emailFailure: boolean };

export async function inviteCustomerAccount(
  svc: AuthAdminClient,
  email: string,
  options: InviteOptions,
  /** Raw value of process.env.ADMIN_LINK_HANDOFF. */
  handoffFlag: string | undefined
): Promise<CustomerInviteResult> {
  const { data: invited, error: inviteError } = await svc.auth.admin.inviteUserByEmail(
    email,
    options
  );
  if (!inviteError && invited?.user) {
    return { ok: true, userId: invited.user.id, emailDelivered: true, link: null };
  }

  const emailFailure = isInviteEmailFailure(inviteError);
  if (!emailFailure || handoffFlag !== "true") {
    return { ok: false, error: inviteError, emailFailure };
  }

  const { data: generated, error: generateError } = await svc.auth.admin.generateLink({
    type: "invite",
    email,
    options,
  });
  const link = generated?.properties?.action_link ?? null;
  if (generateError || !generated?.user || !link) {
    return { ok: false, error: generateError ?? inviteError, emailFailure: true };
  }
  return { ok: true, userId: generated.user.id, emailDelivered: false, link };
}
