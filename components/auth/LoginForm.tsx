"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      Sign in
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  return (
    <form action={formAction} className="space-y-4">
      <div className="p-5 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@company.ch"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            Password
          </label>
          <input
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className={inputClass}
          />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
