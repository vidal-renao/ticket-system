import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTicketRef(ticketNumber: number): string {
  return `TK-${String(ticketNumber).padStart(4, "0")}`;
}

export function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    critical: "text-red-400 bg-red-400/10 border-red-400/20",
    high:     "text-orange-400 bg-orange-400/10 border-orange-400/20",
    medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    low:      "text-green-400 bg-green-400/10 border-green-400/20",
  };
  return map[priority] ?? "text-slate-400 bg-slate-400/10 border-slate-400/20";
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    open:              "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
    in_progress:       "text-blue-400 bg-blue-400/10 border-blue-400/20",
    pending_customer:  "text-amber-400 bg-amber-400/10 border-amber-400/20",
    pending_third_party: "text-amber-300 bg-amber-300/10 border-amber-300/20",
    resolved:          "text-green-400 bg-green-400/10 border-green-400/20",
    closed:            "text-slate-400 bg-slate-400/10 border-slate-400/20",
  };
  return map[status] ?? "text-slate-400 bg-slate-400/10 border-slate-400/20";
}

export function categoryColor(slug: string): string {
  const map: Record<string, string> = {
    networking: "text-blue-400",
    hardware:   "text-amber-400",
    software:   "text-violet-400",
    security:   "text-red-400",
    billing:    "text-emerald-400",
    other:      "text-slate-400",
  };
  return map[slug] ?? "text-slate-400";
}

export function sentimentIcon(sentiment: string): string {
  const map: Record<string, string> = {
    calm:       "😊",
    neutral:    "😐",
    frustrated: "😤",
    urgent:     "🔥",
    angry:      "😡",
  };
  return map[sentiment] ?? "😐";
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1)    return "just now";
  if (diffMins < 60)   return `${diffMins}m ago`;
  if (diffHours < 24)  return `${diffHours}h ago`;
  if (diffDays < 7)    return `${diffDays}d ago`;
  return d.toLocaleDateString("en-CH", { day: "numeric", month: "short" });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString("en-CH", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDuration(start: string | Date, end: string | Date | null): string {
  const from = new Date(start).getTime();
  const to   = end ? new Date(end).getTime() : Date.now();
  const ms   = Math.max(0, to - from);
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);

  if (mins  < 1)   return "< 1 min";
  if (mins  < 60)  return `${mins} min`;
  if (hours < 24)  return `${hours}h ${mins % 60}m`;
  return `${days}d ${hours % 24}h`;
}
