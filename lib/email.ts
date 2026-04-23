import { createServiceClientStatic } from "@/lib/supabase/server";

interface EmailInput {
  to?: string | null;
  subject: string;
  text: string;
}

export async function sendEmail({ to, subject, text }: EmailInput) {
  if (!to) return;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "HelpDesk AI <notifications@vidal-ecosystem.com>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured; skipped:", subject);
    return;
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
  }
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

