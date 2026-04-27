"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Zap, ChevronDown, ChevronUp, Copy, CheckCircle2 } from "lucide-react";
import { priorityColor, sentimentIcon } from "@/lib/utils";
import { toast } from "sonner";
import type { AIAnalysis } from "@/lib/supabase/types";
import { TranslateButton } from "@/components/tickets/TranslateButton";

interface AITriagePanelProps {
  analysis: AIAnalysis;
  ticketId: string;
}

export function AITriagePanel({ analysis, ticketId }: AITriagePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function copySmartResponse() {
    if (!analysis.smart_response) return;
    navigator.clipboard.writeText(analysis.smart_response);
    setCopied(true);
    toast.success("Response copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const confidenceColor =
    (analysis.confidence_score ?? 0) >= 85 ? "text-green-400" :
    (analysis.confidence_score ?? 0) >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">AI Triage</span>
          </div>
          <span className={`text-xs font-mono font-semibold ${confidenceColor}`}>
            {analysis.confidence_score?.toFixed(0)}% conf.
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Suggestions */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Category</p>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {analysis.suggested_category}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Priority</p>
            <Badge className={priorityColor(analysis.suggested_priority ?? "low")}>
              {analysis.suggested_priority}
            </Badge>
          </div>
        </div>

        {/* Sentiment + Language */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Sentiment</p>
            <p className="text-sm">
              {sentimentIcon(analysis.sentiment ?? "neutral")}{" "}
              <span className="text-[var(--color-text-secondary)] capitalize">{analysis.sentiment}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Language</p>
            <p className="text-sm font-mono text-[var(--color-text-secondary)] uppercase">
              {analysis.detected_language}
            </p>
          </div>
        </div>

        {/* Summary */}
        {analysis.summary && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Summary</p>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {analysis.summary}
            </p>
          </div>
        )}

        {/* Keywords */}
        {analysis.keywords && analysis.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {analysis.keywords.slice(0, 5).map((kw) => (
              <span
                key={kw}
                className="px-2 py-0.5 rounded text-[10px] bg-[var(--color-surface-700)] text-[var(--color-text-muted)] border border-[var(--color-surface-600)]"
              >
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Smart Response */}
        {analysis.smart_response && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Smart Response
              </p>
              <Button size="sm" variant="ghost" onClick={copySmartResponse} className="h-6 px-2 text-[10px]">
                {copied ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="p-3 rounded-lg bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]">
              <p className={`text-xs text-[var(--color-text-secondary)] leading-relaxed ${!expanded ? "line-clamp-4" : ""}`}>
                {analysis.smart_response}
              </p>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 mt-1.5 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Show less" : "Show more"}
              </button>
            </div>
            <TranslateButton text={analysis.smart_response} className="mt-2" />
          </div>
        )}

        {/* Reasoning (collapsed) */}
        {analysis.reasoning && (
          <details className="group">
            <summary className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors">
              Reasoning
            </summary>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
              {analysis.reasoning}
            </p>
          </details>
        )}

        {/* ETA */}
        {analysis.estimated_resolution_hours && (
          <p className="text-[10px] text-[var(--color-text-muted)]">
            Estimated resolution: ~{analysis.estimated_resolution_hours}h
          </p>
        )}
      </CardContent>
    </Card>
  );
}
