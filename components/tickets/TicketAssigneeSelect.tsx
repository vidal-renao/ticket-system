"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { isAgentAvailable, partitionAgentOptions, type AgentOption } from "@/lib/agent-options";

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
  agents: AgentOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("ticket");
  const [isPending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState(currentAssignee ?? "");

  const { available, unavailable } = partitionAgentOptions(agents);

  // Derived from the selection, so the notice follows an optimistic set and
  // disappears again if the server rejects it.
  const selected = agents.find((agent) => agent.id === assignee) ?? null;
  const unavailableAssignee = selected && !isAgentAvailable(selected.presence) ? selected : null;

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
    <div className="mt-3">
      <div className="flex items-center gap-2">
      <select
        value={assignee}
        onChange={(event) => handleAssign(event.target.value)}
        disabled={disabled || isPending}
        aria-label={t("reassign")}
        className="w-full cursor-pointer truncate rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-surface-500)] focus:border-indigo-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">{t("unassigned")}</option>
        {/* Two bands rather than one flat list: an admin picking an owner
            should not have to read every row to find who can actually take
            it. Browsers ignore most styling on <option>, so the status is
            written into the label instead of implied by colour alone. */}
        {available.length > 0 && (
          <optgroup label={t("agentsAvailable")}>
            {available.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </optgroup>
        )}
        {unavailable.length > 0 && (
          <optgroup label={t("agentsUnavailable")}>
            {unavailable.map((agent) => (
              <option key={agent.id} value={agent.id} className="text-[var(--color-text-muted)]">
                {`${agent.name} — ${t(`presence.${agent.presence}`)}`}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {isPending && (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-text-muted)]" aria-hidden="true" />
      )}
      </div>

      {/* A warning, never a block: the admin decides who owns the ticket, and
          there are good reasons to hand work to someone who is away. It stays
          on screen rather than firing as a toast, because it describes the
          state the ticket is now in, not an event that just happened. */}
      {unavailableAssignee && (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-amber-300"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {t("assigneeUnavailableWarning", {
              status: t(`presence.${unavailableAssignee.presence}`),
            })}
          </span>
        </p>
      )}
    </div>
  );
}
