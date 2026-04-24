import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          // Variants
          variant === "primary" && [
            "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20",
            "hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/25 active:translate-y-0 active:bg-indigo-700",
          ],
          variant === "secondary" && [
            "border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-[var(--color-text-primary)]",
            "hover:-translate-y-0.5 hover:bg-[var(--color-surface-600)] hover:border-[var(--color-surface-500)]",
          ],
          variant === "ghost" && [
            "bg-transparent text-[var(--color-text-secondary)]",
            "hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-primary)]",
          ],
          variant === "danger" && [
            "border border-red-500/30 bg-red-600/20 text-red-400",
            "hover:-translate-y-0.5 hover:bg-red-600/30 hover:text-red-300",
          ],
          // Sizes
          size === "sm" && "px-3 py-1.5 text-xs",
          size === "md" && "px-4 py-2 text-sm",
          size === "lg" && "px-6 py-3 text-base",
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
