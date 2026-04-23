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
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
    >
      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
      Assign to me
    </button>
  );
}

