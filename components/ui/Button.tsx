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
          "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          // Variants
          variant === "primary" && [
            "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700",
            "text-white shadow-lg shadow-indigo-500/20",
          ],
          variant === "secondary" && [
            "bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)]",
            "text-[var(--color-text-primary)] border border-[var(--color-surface-600)]",
          ],
          variant === "ghost" && [
            "bg-transparent hover:bg-[var(--color-surface-700)]",
            "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
          ],
          variant === "danger" && [
            "bg-red-600/20 hover:bg-red-600/30 border border-red-500/30",
            "text-red-400 hover:text-red-300",
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
