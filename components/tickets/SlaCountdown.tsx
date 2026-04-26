"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SlaCountdownProps {
  dueAt: string;
  label: string;
  breached?: boolean;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function SlaCountdown({ dueAt, label, breached = false }: SlaCountdownProps) {
  const [remaining, setRemaining] = useState(() => new Date(dueAt).getTime() - Date.now());

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      const r = new Date(dueAt).getTime() - Date.now();
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [dueAt, remaining]);

  const isAtRisk = !breached && remaining > 0 && remaining < 60 * 60 * 1000;
  const isBreached = breached || remaining <= 0;

  const colorClass = isBreached
    ? "text-red-400"
    : isAtRisk
    ? "text-amber-400"
    : "text-[var(--color-text-secondary)]";

  const Icon = isBreached ? AlertTriangle : isAtRisk ? AlertTriangle : Clock;

  return (
    <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[var(--color-text-muted)]">{label}:</span>
      <span className={`font-mono tabular-nums font-semibold ${colorClass}`}>
        {isBreached ? "BREACHED" : formatCountdown(remaining)}
      </span>
    </div>
  );
}

interface ReopenButtonProps {
  ticketId: string;
  resolvedAt: string | null;
  locale: string;
}

export function CustomerReopenButton({ ticketId, resolvedAt, locale }: ReopenButtonProps) {
  const [loading, setLoading] = useState(false);
  const [reopened, setReopened] = useState(false);

  if (!resolvedAt) return null;

  const resolvedTime = new Date(resolvedAt).getTime();
  const now = Date.now();
  const hoursSinceResolved = (now - resolvedTime) / (1000 * 60 * 60);
  if (hoursSinceResolved > 48) return null;

  const hoursLeft = Math.max(0, 48 - hoursSinceResolved);
  const hoursDisplay = hoursLeft.toFixed(0);

  if (reopened) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Ticket reopened
      </div>
    );
  }

  async function handleReopen() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/reopen`, {
        method: "POST",
      });
      if (res.ok) {
        setReopened(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Could not reopen ticket");
      }
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleReopen}
      disabled={loading}
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
    >
      {loading ? (
        <span className="animate-pulse">Reopening…</span>
      ) : (
        <>
          ↩ Reopen ({hoursDisplay}h left)
        </>
      )}
    </button>
  );
}
