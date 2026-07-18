"use client";

import type { MouseEvent } from "react";
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
  currentUserId: string;
  canReassign: boolean;
  agents: Agent[];
  reviewStatus: string;
}

export function AdminTicketActions({
  ticketId,
  currentStatus,
  currentAssignee,
  currentUserId,
  canReassign,
  agents,
  reviewStatus,
}: AdminTicketActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState(currentAssignee ?? "");

  const isClosed = currentStatus === "closed";
  void currentUserId;

  function formatErrorMessage(message: string) {
    if (message.toLowerCase() === "not found") {
      return "The ticket could not be loaded. Refresh the list and try again.";
    }
    return message;
  }

  async function patch(body: Record<string, string>) {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(data.error ?? "Request failed"));
    }
  }

  async function review(action: "approve" | "changes") {
    const res = await fetch(`/api/tickets/${ticketId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(data.error ?? "Review failed"));
    }
  }

  function handleAssign(agentId: string) {
    setAssignee(agentId);
    startTransition(async () => {
      try {
        await patch({ assigned_to: agentId });
        toast.success("Ticket assigned");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to assign");
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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Failed to ${label}`);
      }
    });
  }

  function handleReview(action: "approve" | "changes") {
    startTransition(async () => {
      try {
        await review(action);
        toast.success(action === "approve" ? "Work approved" : "Changes requested");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Review failed");
      }
    });
  }

  const selectClass =
    "max-w-[138px] cursor-pointer truncate rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] transition-all duration-200 focus:border-indigo-500 focus:outline-none hover:border-[var(--color-surface-500)]";

  const buttonBase =
    "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-40";

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <select
        value={assignee}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => handleAssign(e.target.value)}
        disabled={isPending || isClosed || !canReassign}
        aria-label="Reassign ticket"
        title={canReassign ? "Reassign" : "Only managers and admins can reassign"}
        className={`${selectClass} ${isPending ? "opacity-50" : ""}`}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>

      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-text-muted)]" />
      ) : currentStatus === "open" ? (
        <button
          type="button"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            handleStatus("in_progress", "started");
          }}
          disabled={!assignee && !canReassign}
          title="Start working"
          className={`${buttonBase} border-blue-500/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20`}
        >
          <Play className="h-3 w-3" /> Start
        </button>
      ) : reviewStatus === "pending" ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleReview("approve");
            }}
            title="Approve completed work"
            className={`${buttonBase} border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`}
          >
            <CheckCircle2 className="h-3 w-3" /> OK
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleReview("changes");
            }}
            title="Return to specialist"
            className={`${buttonBase} border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`}
          >
            <RotateCcw className="h-3 w-3" /> Changes
          </button>
        </div>
      ) : currentStatus === "in_progress" ? (
        <span className="px-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">With agent</span>
      ) : currentStatus === "pending_customer" || currentStatus === "pending_third_party" ? (
        <button
          type="button"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            handleStatus("in_progress", "resumed");
          }}
          title="Resume work after review"
          className={`${buttonBase} border-blue-500/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20`}
        >
          <Play className="h-3 w-3" /> Resume
        </button>
      ) : currentStatus === "resolved" ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              handleStatus("closed", "closed");
            }}
            title="Close ticket"
            className={`${buttonBase} border-[var(--color-surface-600)] bg-[var(--color-surface-800)] text-[var(--color-text-muted)] hover:border-green-500/30 hover:text-green-400`}
          >
            <XCircle className="h-3 w-3" /> Close
          </button>
          <button
            type="button"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              handleStatus("in_progress", "reopened");
            }}
            title="Reopen ticket"
            className={`${buttonBase} border-[var(--color-surface-600)] bg-[var(--color-surface-800)] text-[var(--color-text-muted)] hover:border-amber-500/30 hover:text-amber-400`}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            handleStatus("in_progress", "reopened");
          }}
          title="Reopen ticket"
          className={`${buttonBase} border-[var(--color-surface-600)] bg-[var(--color-surface-800)] text-[var(--color-text-muted)] hover:border-amber-500/30 hover:text-amber-400`}
        >
          <RotateCcw className="h-3 w-3" /> Reopen
        </button>
      )}
    </div>
  );
}
