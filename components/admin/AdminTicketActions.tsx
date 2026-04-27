"use client";

import type { MouseEvent } from "react";
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

      {canAssignToMe && (
        <button
          type="button"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            handleAssign(currentUserId);
          }}
          disabled={isPending}
          title="Assign to me"
          className={`${buttonBase} border-indigo-500/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20`}
        >
          <UserPlus className="h-3 w-3" /> Me
        </button>
      )}

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
      ) : currentStatus === "in_progress" ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              handleStatus("pending_customer", "sent for company review");
            }}
            title="Send for company review"
            className={`${buttonBase} border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`}
          >
            <Clock className="h-3 w-3" /> Review
          </button>
          <button
            type="button"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              handleStatus("resolved", "resolved");
            }}
            title="Mark as resolved"
            className={`${buttonBase} border-violet-500/20 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20`}
          >
            <CheckCircle2 className="h-3 w-3" /> Resolve
          </button>
        </div>
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
