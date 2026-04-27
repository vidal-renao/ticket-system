"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MessageSquare, Lock, Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { suggestReply } from "@/app/actions/suggest-reply";
import { TranslateButton } from "@/components/tickets/TranslateButton";

interface Comment {
  id: string;
  content: string;
  is_internal: boolean;
  is_ai_generated: boolean;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    role?: string | null;
  } | null;
}

interface TicketCommentsProps {
  ticketId: string;
  currentStatus: string;
  comments: Comment[];
  currentUserId: string;
  isStaff: boolean;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
};

export function TicketComments({
  ticketId,
  currentStatus,
  comments: initial,
  currentUserId,
  isStaff,
}: TicketCommentsProps) {
  const router = useRouter();
  const t = useTranslations("ticket");
  const [comments, setComments] = useState(initial);
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime: presence-based typing indicator
  useEffect(() => {
    const supabase = createClient();
    const presenceChannel = supabase.channel(`ticket-typing-${ticketId}`, {
      config: { presence: { key: currentUserId } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState<{ name: string }>();
        const names = Object.entries(state)
          .filter(([key]) => key !== currentUserId)
          .map(([, presences]) => (presences as { name: string }[])[0]?.name)
          .filter(Boolean) as string[];
        setTypingUsers(names);
      })
      .subscribe();

    return () => { supabase.removeChannel(presenceChannel); };
  }, [ticketId, currentUserId]);

  function handleTyping(value: string) {
    setContent(value);
    const supabase = createClient();
    const presenceChannel = supabase.channel(`ticket-typing-${ticketId}`, {
      config: { presence: { key: currentUserId } },
    });
    if (value.trim()) {
      presenceChannel.track({ name: "someone" });
    } else {
      presenceChannel.untrack();
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      presenceChannel.untrack();
    }, 3000);
  }

  // Realtime: subscribe to new comments on this ticket
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-comments-${ticketId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_comments",
          filter: `ticket_id=eq.${ticketId}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const newId = payload.new.id as string;
          const { data } = await supabase
            .from("ticket_comments")
            .select("id, content, is_internal, is_ai_generated, created_at, profiles:author_id(full_name, avatar_url, role)")
            .eq("id", newId)
            .single();

          if (data) {
            setComments((prev) => {
              if (prev.some((c) => c.id === data.id)) return prev;
              return [...prev, data as unknown as Comment];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  async function handleAISuggest() {
    setSuggesting(true);
    const result = await suggestReply(ticketId);
    if ("error" in result) {
      toast.error(`AI suggestion failed: ${result.error}`);
    } else {
      setContent(result.suggestion);
      toast.success("AI suggestion loaded — review and edit before sending");
    }
    setSuggesting(false);
  }

  async function submitComment(waitForCustomer: boolean) {
    if (!content.trim()) return;
    setLoading(true);

    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket_id: ticketId,
        content: content.trim(),
        is_internal: isInternal,
        ...(waitForCustomer && { status_after_comment: "WAITING_CUSTOMER" }),
      }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to post comment");
    } else {
      const { comment } = await res.json();
      setComments((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
      setContent("");
      toast.success(
        waitForCustomer
          ? "Reply sent and ticket is waiting for customer"
          : isInternal
            ? "Internal note added"
            : "Reply sent"
      );
      if (waitForCustomer) router.refresh();
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitComment(false);
  }

  async function handleReplyAndWait() {
    await submitComment(true);
  }

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm resize-none",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  const canReplyAndWait =
    isStaff && !isInternal && currentStatus === "in_progress";

  const externalComments = comments.filter((c) => !c.is_internal);
  const internalComments = comments.filter((c) => c.is_internal);

  function renderComment(comment: Comment) {
    const roleLabel =
      comment.profiles?.role ? ROLE_BADGE[comment.profiles.role] : null;

    return (
      <div key={comment.id} className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-[var(--color-surface-700)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
          {comment.profiles?.full_name?.charAt(0).toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {comment.profiles?.full_name ?? "Unknown"}
            </span>
            {roleLabel && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                {roleLabel}
              </span>
            )}
            {comment.is_ai_generated && (
              <span className="text-[10px] text-indigo-400">· AI</span>
            )}
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {formatRelativeTime(comment.created_at)}
            </span>
          </div>
          <div
            className={`text-sm text-[var(--color-text-primary)] leading-relaxed p-3 rounded-lg ${
              comment.is_internal
                ? "bg-amber-400/5 border border-amber-400/15"
                : "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]"
            }`}
          >
            {comment.content}
          </div>
          <TranslateButton
            text={comment.content}
            className="mt-1.5"
          />
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Activity ({comments.length})
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── External messages ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              {t("messagesSection")}
            </span>
          </div>
          {externalComments.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
              {t("noMessages")}
            </p>
          ) : (
            <div className="space-y-4">
              {externalComments.map(renderComment)}
            </div>
          )}
        </div>

        {/* ── Internal notes (staff only) ─────────────────────────────── */}
        {isStaff && (
          <div className="pt-4 border-t border-amber-400/10">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold text-amber-400/70 uppercase tracking-wider">
                {t("internalSection")}
              </span>
            </div>
            {internalComments.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
                {t("noInternalNotes")}
              </p>
            ) : (
              <div className="space-y-4">
                {internalComments.map(renderComment)}
              </div>
            )}
          </div>
        )}

        {/* ── Reply form ──────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="space-y-3 pt-2 border-t border-[var(--color-surface-600)]"
        >
          {isStaff && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAISuggest}
                disabled={suggesting}
                aria-label="Generate AI suggested response"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Sparkles
                  className={`w-3 h-3 ${suggesting ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                {suggesting ? "Generating…" : "✨ AI Suggest Response"}
              </button>
            </div>
          )}
          {typingUsers.length > 0 && (
            <p className="text-[11px] text-indigo-400 flex items-center gap-1.5">
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              Someone is typing…
            </p>
          )}
          <label htmlFor="comment-content" className="sr-only">
            {isInternal ? "Internal note" : "Reply"}
          </label>
          <textarea
            id="comment-content"
            value={content}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder={
              isInternal
                ? "Add internal note (visible to staff only)..."
                : "Write a reply..."
            }
            rows={3}
            className={inputClass}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {isStaff && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-400"
                />
                <span className="text-xs text-[var(--color-text-muted)]">
                  Internal note
                </span>
              </label>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {canReplyAndWait && (
                <Button
                  type="button"
                  size="sm"
                  loading={loading}
                  disabled={!content.trim()}
                  onClick={handleReplyAndWait}
                >
                  Send for company review
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                loading={loading}
                disabled={!content.trim()}
              >
                {isInternal ? "Add Note" : "Send Reply"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
