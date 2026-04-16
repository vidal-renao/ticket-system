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
        "rounded-xl border border-[var(--color-surface-600)]",
        "bg-[var(--color-surface-900)]",
        hover && "transition-colors hover:border-[var(--color-surface-500)] hover:bg-[var(--color-surface-800)] cursor-pointer",
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
