"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type Status = "online" | "offline" | "busy";

const STATUSES: { value: Status; label: string; dot: string }[] = [
  { value: "online",  label: "Online",  dot: "bg-emerald-400" },
  { value: "busy",    label: "Busy",    dot: "bg-orange-400" },
  { value: "offline", label: "Offline", dot: "bg-slate-500" },
];

interface AgentAvailabilityToggleProps {
  userId: string;
  initial: Status | null;
}

export function AgentAvailabilityToggle({ userId, initial }: AgentAvailabilityToggleProps) {
  const [status, setStatus] = useState<Status>(initial ?? "offline");
  const [saving, setSaving] = useState(false);

  async function handleChange(next: Status) {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ availability_status: next })
      .eq("id", userId);

    if (error) {
      toast.error("Could not update availability", { duration: 4000 });
    } else {
      setStatus(next);
      toast.success(`Status set to ${next}`, { duration: 2500 });
    }
    setSaving(false);
  }

  return (
    <div className="flex gap-2">
      {STATUSES.map(({ value, label, dot }) => (
        <button
          key={value}
          type="button"
          disabled={saving}
          onClick={() => handleChange(value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-[background-color,border-color,color] duration-150 disabled:opacity-50 ${
            status === value
              ? "bg-[var(--color-surface-700)] border-[var(--color-surface-500)] text-[var(--color-text-primary)]"
              : "bg-transparent border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-800)]"
          }`}
          aria-pressed={status === value}
        >
          <span className={`w-2 h-2 rounded-full ${status === value ? dot : "bg-[var(--color-surface-600)]"}`} />
          {label}
        </button>
      ))}
    </div>
  );
}
