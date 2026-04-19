"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
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

  const isClosed = currentStatus === "closed" || currentStatus === "resolved";

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

  function handleClose() {
    startTransition(async () => {
      try {
        await patch({ status: "closed" });
        toast.success("Ticket closed");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to close");
      }
    });
  }

  const selectClass =
    "text-xs px-2 py-1.5 rounded-lg bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer max-w-[140px] truncate";

  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
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
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      {/* Close button */}
      {!isClosed ? (
        <button
          type="button"
          disabled={isPending}
          onClick={handleClose}
          title="Close ticket"
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-green-400 hover:border-green-500/30 transition-colors disabled:opacity-40"
        >
          {isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <CheckCircle2 className="w-3 h-3" />
          }
          Close
        </button>
      ) : (
        <span className="text-[10px] text-green-400 font-medium px-2 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg capitalize">
          {currentStatus}
        </span>
      )}
    </div>
  );
}
