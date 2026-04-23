"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

interface TicketCommentsProps {
  ticketId: string;
  currentStatus: string;
  comments: Comment[];
  currentUserId: string;
  isStaff: boolean;
  targetLocale: string;
}

export function TicketComments({ ticketId, currentStatus, comments: initial, currentUserId, isStaff, targetLocale }: TicketCommentsProps) {
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

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
      setComments((prev) => [...prev, comment]);
      setContent("");
      toast.success(waitForCustomer ? "Reply sent and ticket is waiting for customer" : isInternal ? "Internal note added" : "Reply sent");
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

  const canReplyAndWait = isStaff && !isInternal && currentStatus === "in_progress";

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

      <CardContent className="space-y-4">
        {comments.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No activity yet.</p>
        )}

        {comments.map((comment) => (
          <div key={comment.id} className={`flex gap-3 ${comment.is_internal ? "opacity-80" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-[var(--color-surface-700)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
              {comment.profiles?.full_name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {comment.profiles?.full_name ?? "Unknown"}
                </span>
                {comment.is_internal && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <Lock className="w-2.5 h-2.5" /> Internal
                  </span>
                )}
                {comment.is_ai_generated && (
                  <span className="text-[10px] text-indigo-400">· AI</span>
                )}
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {formatRelativeTime(comment.created_at)}
                </span>
              </div>
              <div className={`text-sm text-[var(--color-text-primary)] leading-relaxed p-3 rounded-lg ${
                comment.is_internal
                  ? "bg-amber-400/5 border border-amber-400/15"
                  : "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]"
              }`}>
                {comment.content}
              </div>
              <TranslateButton
                text={comment.content}
                targetLocale={targetLocale}
                className="mt-1.5"
              />
            </div>
          </div>
        ))}

        {/* Comment form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-[var(--color-surface-600)]">
          {isStaff && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAISuggest}
                disabled={suggesting}
                aria-label="Generate AI suggested response"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Sparkles className={`w-3 h-3 ${suggesting ? "animate-pulse" : ""}`} aria-hidden="true" />
                {suggesting ? "Generating…" : "✨ AI Suggest Response"}
              </button>
            </div>
          )}
          <label htmlFor="comment-content" className="sr-only">
            {isInternal ? "Internal note" : "Reply"}
          </label>
          <textarea
            id="comment-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isInternal ? "Add internal note (visible to staff only)..." : "Write a reply..."}
            rows={3}
            className={inputClass}
          />
          <div className="flex items-center justify-between">
            {isStaff && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-400"
                />
                <span className="text-xs text-[var(--color-text-muted)]">Internal note</span>
              </label>
            )}
            <Button
              type="submit"
              size="sm"
              loading={loading}
              disabled={!content.trim()}
              className="ml-auto"
            >
              {isInternal ? "Add Note" : "Send Reply"}
            </Button>
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
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
