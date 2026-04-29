"use client";

import { cn } from "@/lib/utils";
import { evaluatePasswordRequirements, getPasswordStrength } from "@/lib/validation/security";

const STRENGTH_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
] as const;

const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong", "Excellent"] as const;

interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);
  const requirements = evaluatePasswordRequirements(password);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-1">
        {STRENGTH_COLORS.map((color, index) => (
          <div
            key={color}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              index <= strength ? color : "bg-[var(--color-surface-600)]"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Password strength: <span className="text-[var(--color-text-secondary)]">{STRENGTH_LABELS[strength]}</span>
      </p>
      <ul className="grid grid-cols-1 gap-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
        {requirements.map((requirement) => (
          <li key={requirement.label} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                requirement.met ? "bg-emerald-400" : "bg-[var(--color-surface-500)]"
              )}
            />
            <span>{requirement.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
