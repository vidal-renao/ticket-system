import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-surface-600)]/85 bg-[var(--color-surface-900)] shadow-[0_18px_50px_rgba(0,0,0,0.16)]",
        hover &&
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-brand-400)]/35 hover:bg-[var(--color-surface-850)] hover:shadow-[0_22px_60px_rgba(0,0,0,0.24)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-5 py-4 border-b border-[var(--color-surface-600)]", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-5 py-4", className)}>
      {children}
    </div>
  );
}
