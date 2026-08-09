"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Agent {
  id: string;
  name: string;
}

/**
 * Reassignment from the ticket page itself.
 *
 * Same contract as the selector in the admin cockpit: PATCH the ticket with
 * `assigned_to`, which is already in ADMIN_PATCH_FIELDS and already fires the
 * `ticket.assigned` notification server-side. No new endpoint, no assignment
 * logic here — this is only a second door onto the existing one.
 *
 * The cockpit's own component is not reused directly because it bundles status
 * transitions, review and archive actions, which the ticket page already
 * provides through TicketWorkflowActions.
 */
export function TicketAssigneeSelect({
  ticketId,
  currentAssignee,
  agents,
  disabled = false,
}: {
  ticketId: string;
  currentAssignee: string | null;
  agents: Agent[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("ticket");
  const [isPending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState(currentAssignee ?? "");

  function handleAssign(agentId: string) {
    const previous = assignee;
    setAssignee(agentId);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/tickets/${ticketId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigned_to: agentId }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? t("reassignFailed"));
        }
        toast.success(t("reassigned"));
        router.refresh();
      } catch (error) {
        // Put the previous owner back so the control never shows a change
        // the server rejected.
        setAssignee(previous);
        toast.error(error instanceof Error ? error.message : t("reassignFailed"));
      }
    });
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <select
        value={assignee}
        onChange={(event) => handleAssign(event.target.value)}
        disabled={disabled || isPending}
        aria-label={t("reassign")}
        className="w-full cursor-pointer truncate rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-surface-500)] focus:border-indigo-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">{t("unassigned")}</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-text-muted)]" aria-hidden="true" />
      )}
    </div>
  );
}
