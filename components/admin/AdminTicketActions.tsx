"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Play, CheckCircle2, RotateCcw, XCircle, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface Agent {
  id: string;
  name: string;
}

interface AdminTicketActionsProps {
  ticketId: string;
  currentStatus: string;
  currentAssignee: string | null;
  currentUserId: string;
  canReassign: boolean;
  agents: Agent[];
}

export function AdminTicketActions({
  ticketId,
  currentStatus,
  currentAssignee,
  currentUserId,
  canReassign,
  agents,
}: AdminTicketActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState(currentAssignee ?? "");

  const isClosed = currentStatus === "closed";
  const canAssignToMe = !isClosed && assignee !== currentUserId;

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
        disabled={isPending || isClosed || !canReassign}
        aria-label="Reassign ticket"
        title={canReassign ? "Reassign" : "Only managers and admins can reassign"}
        className={`${selectClass} ${isPending ? "opacity-50" : ""}`}
      >
        <option value="">Unassigned</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {canAssignToMe && (
        <button
          type="button"
          onClick={() => handleAssign(currentUserId)}
          disabled={isPending}
          title="Assign to me"
          className={`${btnBase} bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20`}
        >
          <UserPlus className="w-3 h-3" /> Me
        </button>
      )}

      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-text-muted)]" />
      ) : currentStatus === "open" ? (
        /* open → start working */
        <button
          type="button"
          onClick={() => handleStatus("in_progress", "started")}
          disabled={!assignee}
          title="Start working"
          className={`${btnBase} bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20`}
        >
          <Play className="w-3 h-3" /> Start
        </button>
      ) : currentStatus === "in_progress" ? (
        /* in_progress → resolve */
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStatus("pending_customer", "waiting for customer")}
            title="Reply and wait for customer"
            className={`${btnBase} bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20`}
          >
            <Clock className="w-3 h-3" /> Reply & Wait
          </button>
          <button
            type="button"
            onClick={() => handleStatus("resolved", "resolved")}
            title="Mark as resolved"
            className={`${btnBase} bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20`}
          >
            <CheckCircle2 className="w-3 h-3" /> Resolve
          </button>
        </div>
      ) : currentStatus === "pending_customer" || currentStatus === "pending_third_party" ? (
        <button
          type="button"
          onClick={() => handleStatus("in_progress", "resumed")}
          title="Resume work after review"
          className={`${btnBase} bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20`}
        >
          <Play className="w-3 h-3" /> Resume
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
            onClick={() => handleStatus("in_progress", "reopened")}
            title="Reopen ticket"
            className={`${btnBase} bg-[var(--color-surface-800)] border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-amber-400 hover:border-amber-500/30`}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      ) : (
        /* closed — no actions */
        <button
          type="button"
          onClick={() => handleStatus("in_progress", "reopened")}
          title="Reopen ticket"
          className={`${btnBase} bg-[var(--color-surface-800)] border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-amber-400 hover:border-amber-500/30`}
        >
          <RotateCcw className="w-3 h-3" /> Reopen
        </button>
      )}
    </div>
  );
}
