import { createServiceClientStatic } from "@/lib/supabase/server";

interface EmailInput {
  to?: string | null;
  subject: string;
  text: string;
}

/**
 * Whether the message actually left the building.
 *
 * Notifications can afford to be told nothing -- a missed "ticket updated"
 * mail is a nuisance. A password-recovery link cannot: if the send is skipped
 * because no API key is configured, or Resend refuses it, the admin has to
 * know so they hand the link over by another route instead of assuring
 * somebody an email is on the way. Callers that do not care still ignore this.
 */
export type EmailResult =
  | { delivered: true }
  | { delivered: false; reason: "no_recipient" | "not_configured" | "send_failed" };

export async function sendEmail({ to, subject, text }: EmailInput): Promise<EmailResult> {
  if (!to) return { delivered: false, reason: "no_recipient" };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "HelpDesk AI <notifications@vidal-ecosystem.com>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured; skipped:", subject);
    return { delivered: false, reason: "not_configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    console.error("[email] send failed:", await res.text().catch(() => res.statusText));
    return { delivered: false, reason: "send_failed" };
  }

  return { delivered: true };
}

export async function getAuthUserEmail(userId: string | null | undefined) {
  if (!userId) return null;

  const svc = createServiceClientStatic();
  const { data, error } = await svc.auth.admin.getUserById(userId);
  if (error) {
    console.warn("[email] could not resolve user email:", error.message);
    return null;
  }

  return data.user?.email ?? null;
}

export function ticketEmailSubject(ticketNumber: number | null | undefined, title: string) {
  const ref = ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
  return `[${ref}] ${title}`;
}

