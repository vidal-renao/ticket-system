"use client";

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

  if (currentAssignee === currentUserId) return null;

  function handleAssign() {
    startTransition(async () => {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: currentUserId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to assign ticket");
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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white border border-indigo-400/40 bg-indigo-600 hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-80 shadow-sm shadow-indigo-950/20 transition-colors"
    >
      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
      {isPending ? "Assigning..." : "Assign to me"}
    </button>
  );
}
