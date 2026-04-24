"use client";

import type { MouseEvent } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface AssignToMeButtonProps {
  ticketId: string;
  currentUserId: string;
  currentAssignee?: string | null;
}

export function AssignToMeButton({
  ticketId,
  currentUserId,
  currentAssignee,
}: AssignToMeButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!currentUserId || currentAssignee === currentUserId) return null;

  function normalizeError(message: string) {
    if (message.toLowerCase() === "not found") {
      return "The ticket could not be loaded. Refresh the queue and try again.";
    }
    return message;
  }

  function handleAssign(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    startTransition(async () => {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: currentUserId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(normalizeError(data.error ?? "Failed to assign ticket"));
        return;
      }

      toast.success("Ticket assigned to you");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleAssign}
      disabled={isPending}
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-950/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-80"
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
      {isPending ? "Assigning..." : "Assign"}
    </button>
  );
}
