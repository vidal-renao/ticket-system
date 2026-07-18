"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Loader2, PauseCircle, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

interface Props {
  ticketId: string;
  role: string;
  status: string;
  reviewStatus: string;
}

export function TicketWorkflowActions({ ticketId, role, status, reviewStatus }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function run(path: string, body: Record<string, string>, success: string) {
    startTransition(async () => {
      setConfirmation(null);
      try {
        const response = await fetch(path, {
          method: path.endsWith("/review") ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Request failed");
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Request failed");
      }
    });
  }

  if (role === "agent") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {status === "open" && (
            <Button size="sm" onClick={() => run(`/api/tickets/${ticketId}`, { status: "in_progress" }, "Work started")} disabled={pending}>
              <Play className="h-4 w-4" /> Start work
            </Button>
          )}
          {status === "in_progress" && reviewStatus !== "pending" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => run(`/api/tickets/${ticketId}`, { status: "pending_customer" }, "Waiting for customer")} disabled={pending}>
                <PauseCircle className="h-4 w-4" /> Wait for customer
              </Button>
              <Button size="sm" variant="secondary" onClick={() => run(`/api/tickets/${ticketId}`, { status: "pending_third_party" }, "Waiting for third party")} disabled={pending}>
                <Clock3 className="h-4 w-4" /> Wait for supplier
              </Button>
              <Button size="sm" onClick={() => setConfirmation("request")} disabled={pending}>
                <ShieldCheck className="h-4 w-4" /> Ready for admin OK
              </Button>
            </>
          )}
          {(status === "pending_customer" || status === "pending_third_party") && (
            <Button size="sm" onClick={() => run(`/api/tickets/${ticketId}`, { status: "in_progress" }, "Work resumed")} disabled={pending}>
              <RotateCcw className="h-4 w-4" /> Resume work
            </Button>
          )}
        </div>
        {reviewStatus === "pending" && (
          <p className="text-xs text-[var(--color-sla-warning)]">Submitted for administrator review. Execution controls are locked until a decision.</p>
        )}
        {confirmation === "request" && (
          <ConfirmBar
            text="Confirm that the work is complete and ready for administrator approval."
            pending={pending}
            onCancel={() => setConfirmation(null)}
            onConfirm={() => run(`/api/tickets/${ticketId}/review`, { action: "request" }, "Sent for administrator review")}
          />
        )}
      </div>
    );
  }

  if (role === "admin" && reviewStatus === "pending") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--color-text-muted)]">The assigned specialist has declared the work complete. Review the evidence before deciding.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setConfirmation("approve")} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" /> Approve and resolve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirmation("changes")} disabled={pending}>
            <RotateCcw className="h-4 w-4" /> Request changes
          </Button>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />}
        </div>
        {confirmation && (
          <ConfirmBar
            text={confirmation === "approve" ? "Approve this work and notify the customer that the ticket is resolved?" : "Return this ticket to the assigned specialist for changes?"}
            pending={pending}
            onCancel={() => setConfirmation(null)}
            onConfirm={() => run(`/api/tickets/${ticketId}/review`, { action: confirmation }, confirmation === "approve" ? "Work approved" : "Changes requested")}
          />
        )}
      </div>
    );
  }

  return null;
}

function ConfirmBar({ text, pending, onCancel, onConfirm }: { text: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--color-signal-blue)]/25 bg-[var(--color-signal-blue)]/10 p-3">
      <p className="mb-3 text-xs text-[var(--color-text-secondary)]">{text}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </div>
  );
}
