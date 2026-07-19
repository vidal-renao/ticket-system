"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function UnarchiveButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restore" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Restore failed");
        }
        toast.success("Restored to the ticket lists");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Restore failed");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={pending}
      title="Restore from History"
      className="flex items-center gap-1 rounded-lg border border-[var(--color-surface-600)] px-2 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-indigo-500/30 hover:text-indigo-300 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
    </button>
  );
}
