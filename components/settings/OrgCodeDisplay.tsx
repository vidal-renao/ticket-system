"use client";

import { useState } from "react";
import { Copy, Check, Building2 } from "lucide-react";

interface OrgCodeDisplayProps {
  orgId: string | null;
  orgName: string | null;
}

export function OrgCodeDisplay({ orgId, orgName }: OrgCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!orgId) return;
    await navigator.clipboard.writeText(orgId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!orgId) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No organization set up yet. Enable PII Scrubbing below to initialize your organization, then share the code with your team.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {orgName && (
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{orgName}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-xs font-mono text-indigo-400 truncate select-all">
          {orgId}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 p-2 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] hover:bg-[var(--color-surface-700)] transition-colors"
          aria-label="Copy org code"
        >
          {copied
            ? <Check className="w-4 h-4 text-green-400" />
            : <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />
          }
        </button>
      </div>
    </div>
  );
}
