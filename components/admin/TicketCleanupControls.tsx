"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

export function TicketCleanupControls({ ticketId, isTrash = false, all = false }: { ticketId?: string; isTrash?: boolean; all?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = isTrash ? "restore" : "delete";
  const confirmation = all ? (isTrash ? "RESTORE ALL" : "DELETE ALL") : action.toUpperCase();

  function execute() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/tickets/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, all, ticket_ids: ticketId ? [ticketId] : undefined, confirmation }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Cleanup failed");
        toast.success(`${data.affected ?? 0} ticket${data.affected === 1 ? "" : "s"} ${isTrash ? "restored" : "moved to trash"}`);
        setConfirming(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Cleanup failed");
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-red-400/25 bg-red-500/10 p-1">
        <button type="button" onClick={execute} disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/15">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Confirm ${confirmation}`}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)]">Cancel</button>
      </span>
    );
  }

  return all ? (
    <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
      {isTrash ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
      {isTrash ? "Restore all" : "Move all to trash"}
    </Button>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={`rounded-lg p-1.5 transition-colors ${isTrash ? "text-emerald-300 hover:bg-emerald-500/10" : "text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-300"}`}
      title={isTrash ? "Restore ticket" : "Move ticket to trash"}
    >
      {isTrash ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
