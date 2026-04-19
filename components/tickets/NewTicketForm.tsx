"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Zap } from "lucide-react";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
}

interface NewTicketFormProps {
  teams: Team[];
}

export function NewTicketForm({ teams }: NewTicketFormProps) {
  const t = useTranslations("tickets");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          ...(teamId && { team_id: teamId }),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create ticket");
      }

      const { ticket } = await res.json();
      toast.success(t("submitSuccess"));
      router.push(`/tickets/${ticket.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="p-5 space-y-4">
        {/* Category selector */}
        {teams.length > 0 ? (
          <div>
            <label
              htmlFor="ticket-category"
              className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5"
            >
              {t("category")} <span className="text-red-400" aria-label="required">*</span>
            </label>
            <select
              id="ticket-category"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
              aria-label={t("category")}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="">{t("selectCategory")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
            {t("noCategoryAvailable")}
          </div>
        )}

        {/* Summary */}
        <div>
          <label
            htmlFor="ticket-title"
            className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5"
          >
            {t("summary")} <span className="text-red-400" aria-label="required">*</span>
          </label>
          <input
            id="ticket-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Cannot connect to VPN since this morning"
            required
            maxLength={200}
            aria-describedby="ticket-title-hint"
            className={inputClass}
          />
          <p id="ticket-title-hint" className="text-xs text-[var(--color-text-muted)] mt-1">
            {title.length}/200
          </p>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="ticket-description"
            className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5"
          >
            {t("description")} <span className="text-red-400" aria-label="required">*</span>
          </label>
          <textarea
            id="ticket-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail — what happened, when it started, what you've already tried..."
            required
            rows={6}
            className={`${inputClass} resize-none`}
          />
        </div>
      </Card>

      {/* AI notice */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
        <Zap className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-xs text-indigo-300">{t("aiNotice")}</p>
      </div>

      <Button
        type="submit"
        loading={loading}
        disabled={!title.trim() || !description.trim() || (teams.length > 0 && !teamId)}
        className="w-full"
      >
        {t("submitButtonLabel")}
      </Button>
    </form>
  );
}
