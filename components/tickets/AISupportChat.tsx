"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bot, Send, Loader2, CheckCircle2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { saveAiChatNote } from "@/app/actions/save-ai-chat";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AISupportChatProps {
  ticketId: string;
  orgId: string;
  locale: string;
}

export function AISupportChat({ ticketId, orgId, locale }: AISupportChatProps) {
  const t = useTranslations("aiChat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentCameOnline, setAgentCameOnline] = useState(false);
  const [saved, setSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Watch for agents coming online via Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`agent-presence-${orgId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "hd_profiles",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const p = payload.new;
          if (
            p.availability_status === "online" &&
            ["agent", "manager", "admin"].includes(String(p.role ?? ""))
          ) {
            setAgentCameOnline(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const handleSave = useCallback(async () => {
    if (messages.length === 0 || saved) return;
    const content =
      `[AI Support Chat]\n\n` +
      messages
        .map(
          (m) =>
            `**${m.role === "user" ? "Customer" : "AI Assistant"}:** ${m.content}`
        )
        .join("\n\n");
    const result = await saveAiChatNote(ticketId, content);
    if ("error" in result) {
      toast.error("Could not save conversation");
    } else {
      setSaved(true);
      toast.success(t("chatSaved"));
    }
  }, [messages, saved, ticketId, t]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/ai/wiki-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, locale }),
      });

      if (!res.ok || !res.body) {
        setIsTyping(false);
        toast.error("AI response failed. Please try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantText,
          };
          return updated;
        });
      }
    } finally {
      setIsTyping(false);
    }
  }

  const inputClass = [
    "flex-1 px-3 py-2 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors disabled:opacity-50",
  ].join(" ");

  const lastIsAssistant =
    messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="login-glass-card rounded-2xl border border-indigo-500/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-surface-600)] bg-indigo-500/5">
        <div className="w-8 h-8 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            {t("title")}
          </p>
          <p className="text-[11px] text-indigo-400">{t("statusNoAgents")}</p>
        </div>
        {messages.length > 0 && !saved && (
          <button
            type="button"
            onClick={handleSave}
            className="text-[11px] text-[var(--color-text-muted)] hover:text-indigo-400 transition-colors whitespace-nowrap"
          >
            {t("saveChat")}
          </button>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-[11px] text-green-400 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3" />
            {t("chatSaved")}
          </span>
        )}
      </div>

      {/* Agent came online banner */}
      {agentCameOnline && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
          <UserCheck className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <p className="text-xs text-green-400">{t("statusAgentOnline")}</p>
        </div>
      )}

      {/* Messages */}
      <div className="h-64 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-8 h-8 text-indigo-400/40 mb-2" />
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("emptyHint")}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3 h-3 text-indigo-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] text-xs leading-relaxed px-3 py-2 rounded-xl ${
                msg.role === "user"
                  ? "bg-indigo-600/20 border border-indigo-500/30 text-[var(--color-text-primary)]"
                  : "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-primary)]"
              }`}
            >
              {msg.content ||
                (isTyping && i === messages.length - 1 && (
                  <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t("typing")}
                  </span>
                ))}
            </div>
          </div>
        ))}

        {/* Typing indicator when assistant hasn't started yet */}
        {isTyping && !lastIsAssistant && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="px-3 py-2 rounded-xl bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]">
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("typing")}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--color-surface-600)] flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={t("placeholder")}
          className={inputClass}
          disabled={isTyping}
        />
        <Button
          type="button"
          size="sm"
          onClick={sendMessage}
          disabled={!input.trim() || isTyping}
          loading={isTyping}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
