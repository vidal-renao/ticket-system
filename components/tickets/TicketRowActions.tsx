"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Flame, Minus, Star } from "lucide-react";
import { setTicketUrgency, setTicketRating } from "@/app/actions/ticket-actions";
import { toast } from "sonner";

interface TicketRowActionsProps {
  ticketId: string;
  currentPriority: string;
  currentRating: number | null;
}

export function TicketRowActions({ ticketId, currentPriority, currentRating }: TicketRowActionsProps) {
  const t = useTranslations("tickets");
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState<number | null>(currentRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const isUrgent = currentPriority === "high" || currentPriority === "critical";

  function handleUrgency(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await setTicketUrgency(ticketId, !isUrgent);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(isUrgent ? t("notUrgentSet") : t("urgentSet"));
      }
    });
  }

  function handleRating(e: React.MouseEvent, stars: number) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await setTicketRating(ticketId, stars);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setRating(stars);
        toast.success(`${t("rated")} ${stars}★`);
      }
    });
  }

  return (
    <div
      className="flex items-center gap-2 shrink-0"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Urgency toggle */}
      <button
        type="button"
        disabled={isPending}
        onClick={handleUrgency}
        title={isUrgent ? t("markNotUrgent") : t("markUrgent")}
        className={`p-1.5 rounded-lg border transition-all ${
          isUrgent
            ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
            : "bg-[var(--color-surface-800)] border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-orange-400 hover:border-orange-500/20"
        } disabled:opacity-40`}
      >
        {isUrgent ? <Flame className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
      </button>

      {/* Star rating */}
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={isPending}
            onClick={(e) => handleRating(e, star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(null)}
            className="p-0.5 disabled:opacity-40 transition-transform hover:scale-110"
            aria-label={`${t("rate")} ${star}`}
          >
            <Star
              className={`w-3.5 h-3.5 transition-colors ${
                star <= (hoverRating ?? rating ?? 0)
                  ? "text-amber-400 fill-amber-400"
                  : "text-[var(--color-surface-600)]"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
