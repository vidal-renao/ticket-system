/**
 * What to do when an admin creates a customer whose email may already exist.
 *
 * On this instance `auth.users` is shared by six applications, so an address
 * that already has an account is the common case, not the exception. The
 * endpoints previously collapsed every case into one: attach the profile and
 * say nothing. That was wrong in two different directions at once --
 * it overwrote an existing customer's row, and it silently adopted an account
 * belonging to another product without anyone deciding to.
 *
 * Four outcomes, decided here so both endpoints share one set of rules and can
 * be tested without a database or a Supabase client.
 */

export type OnboardingPlan =
  /** No account anywhere: the ordinary path, send an invitation. */
  | { kind: "invite" }
  /**
   * The address has an account in this instance but is not a customer here.
   * Linking is safe -- hd_profiles is keyed on auth.users.id, so a profile
   * simply does not exist yet -- but it is not automatic. The admin is told
   * whose account they are about to adopt and has to say yes, the same
   * deliberate friction as the emergency close.
   */
  | { kind: "needs_confirmation" }
  /** Same as above, once the admin has confirmed. */
  | { kind: "link_existing"; userId: string }
  /**
   * Already a customer here. Nothing to create, and nothing to overwrite: the
   * previous upsert rewrote full_name, organization_id, role and customer_type
   * from the form, so re-submitting a form for an existing customer quietly
   * rewrote their record. Refused outright.
   */
  | { kind: "already_customer"; userId: string; referenceCode: string | null };

export function planCustomerOnboarding(input: {
  /** From findAuthUserByEmail: an account in auth.users, or none. */
  existingUserId: string | null;
  /** Their hd_profiles row, if they already have one. */
  existingProfile: { referenceCode: string | null } | null;
  /** The admin explicitly asked to link the pre-existing account. */
  confirmedLink: boolean;
}): OnboardingPlan {
  const { existingUserId, existingProfile, confirmedLink } = input;

  if (!existingUserId) return { kind: "invite" };

  // Checked before the confirmation flag on purpose: confirming "link this
  // account" must never be a way to overwrite a customer who already exists.
  if (existingProfile) {
    return {
      kind: "already_customer",
      userId: existingUserId,
      referenceCode: existingProfile.referenceCode,
    };
  }

  if (!confirmedLink) return { kind: "needs_confirmation" };

  return { kind: "link_existing", userId: existingUserId };
}

/**
 * How the endpoint must write hd_profiles once the plan is decided.
 *
 * Not a detail: creating an account and creating its profile are not two
 * independent writes. The `on_auth_user_created` trigger inserts a bare
 * hd_profiles row (id, full_name, role='customer' -- no organization, no
 * customer_type, no reference_code) inside the very statement that creates the
 * auth user, so by the time `inviteUserByEmail` returns, a row already exists.
 *
 *  - invite: that row is ours, written microseconds ago by this request. Fill
 *    it in. A plain insert collides with it and reports a brand-new account as
 *    an existing customer -- and, worse, leaves the account behind, so every
 *    retry then collides for real.
 *  - link_existing: the account belongs to another application and we have
 *    established it has no profile. Insert, so that a row appearing underneath
 *    us fails loudly instead of being overwritten -- the original bug.
 */
export function profileWriteMode(planKind: "invite" | "link_existing"): "fill" | "create" {
  return planKind === "invite" ? "fill" : "create";
}

export function alreadyCustomerMessage(referenceCode: string | null): string {
  return referenceCode
    ? `That email address is already a customer (${referenceCode}). Edit that customer instead, or use a different address.`
    : "That email address is already a customer here. Edit that customer instead, or use a different address.";
}

export const NEEDS_CONFIRMATION_MESSAGE =
  "That email address already has an account on this instance, from another application. It is not a customer here yet. Confirm to link that account as a customer — no new account is created and its password is unchanged.";

/**
 * Explains to the admin what they are holding. The link is returned rather
 * than emailed: there is no verified sender domain, so an automatic send would
 * fail silently, which is precisely the failure mode this whole branch exists
 * to remove.
 */
export const LINKED_ACCOUNT_NOTICE =
  "Linked to an existing account. No invitation was sent and their password is unchanged — send them this sign-in link yourself.";
