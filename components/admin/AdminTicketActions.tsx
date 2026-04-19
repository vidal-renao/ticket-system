"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, CheckCircle2, RotateCcw, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Agent {
  id: string;
  name: string;
}

interface AdminTicketActionsProps {
  ticketId: string;
  currentStatus: string;
  currentAssignee: string | null;
  agents: Agent[];
}

export function AdminTicketActions({
  ticketId,
  currentStatus,
  currentAssignee,
  agents,
}: AdminTicketActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState(currentAssignee ?? "");

  const isClosed = currentStatus === "closed";

  async function patch(body: Record<string, string>) {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Request failed");
    }
  }

  function handleAssign(agentId: string) {
    setAssignee(agentId);
    startTransition(async () => {
      try {
        await patch({ assigned_to: agentId });
        toast.success("Ticket assigned");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to assign");
        setAssignee(currentAssignee ?? "");
      }
    });
  }

  function handleStatus(status: string, label: string) {
    startTransition(async () => {
      try {
        await patch({ status });
        toast.success(`Ticket ${label}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to ${label}`);
      }
    });
  }

  const selectClass =
    "text-xs px-2 py-1.5 rounded-lg bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer max-w-[130px] truncate";

  const btnBase =
    "flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40";

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Assign select */}
      <select
        value={assignee}
        onChange={(e) => handleAssign(e.target.value)}
        disabled={isPending || isClosed}
        aria-label="Assign to agent"
        className={`${selectClass} ${isPending ? "opacity-50" : ""}`}
      >
        <option value="">Unassigned</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-text-muted)]" />
      ) : currentStatus === "open" ? (
        /* open → start working */
        <button
          type="button"
          onClick={() => handleStatus("in_progress", "started")}
          title="Start working"
          className={`${btnBase} bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20`}
        >
          <Play className="w-3 h-3" /> Start
        </button>
      ) : currentStatus === "in_progress" ? (
        /* in_progress → resolve */
        <button
          type="button"
          onClick={() => handleStatus("resolved", "resolved")}
          title="Mark as resolved"
          className={`${btnBase} bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20`}
        >
          <CheckCircle2 className="w-3 h-3" /> Resolve
        </button>
      ) : currentStatus === "resolved" ? (
        /* resolved → close or reopen */
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStatus("closed", "closed")}
            title="Close ticket"
            className={`${btnBase} bg-[var(--color-surface-800)] border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-green-400 hover:border-green-500/30`}
          >
            <XCircle className="w-3 h-3" /> Close
          </button>
          <button
            type="button"
            onClick={() => handleStatus("open", "reopened")}
            title="Reopen ticket"
            className={`${btnBase} bg-[var(--color-surface-800)] border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-amber-400 hover:border-amber-500/30`}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      ) : (
        /* closed — no actions */
        <span className="text-[10px] text-green-400 font-medium px-2 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
          Closed
        </span>
      )}
    </div>
  );
}
