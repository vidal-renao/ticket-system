"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MONO, OPS } from "./tokens";

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-xl border p-4", className)}
      style={{ background: OPS.panel, borderColor: OPS.line }}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2
              className="text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ color: OPS.muted }}
            >
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  color = OPS.text,
  emphasis,
}: {
  label: string;
  value: string | number;
  color?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="min-w-[92px] flex-1 border-r px-4 py-3 last:border-r-0"
      style={{ borderColor: OPS.line }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.1em]"
        style={{ color: OPS.faint }}
      >
        {label}
      </div>
      <div
        className={cn("font-bold leading-tight tabular-nums", emphasis ? "text-2xl" : "text-xl")}
        style={{ ...MONO, color }}
      >
        {value}
      </div>
    </div>
  );
}

export function Tag({
  label,
  color,
  dot,
  small,
}: {
  label: string;
  color: string;
  dot?: boolean;
  small?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-medium",
        small ? "text-[10.5px]" : "text-[11.5px]"
      )}
      style={{ color, borderColor: `${color}59`, background: `${color}14` }}
    >
      {dot && (
        <span
          className="inline-block h-[6px] w-[6px] rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  );
}

export function EmptyState({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-8 text-[12.5px]"
      style={{ color: OPS.faint }}
    >
      {icon}
      {text}
    </div>
  );
}

export function MonoText({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className} style={{ ...MONO, ...style }}>
      {children}
    </span>
  );
}
