"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { normalizeSupabaseErrorMessage, passwordSchema } from "@/lib/validation/security";

const inputClass =
  "w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors";

export function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm]         = useState("");
  const [show, setShow]               = useState(false);
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = passwordSchema.safeParse(newPassword);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Password does not meet policy");
      return;
    }
    if (newPassword !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(normalizeSupabaseErrorMessage(error));
    } else {
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirm("");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          New password
        </label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min. 12 chars, upper/lower/number/symbol"
            minLength={12}
            required
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <PasswordStrengthMeter password={newPassword} className="mt-2" />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          Confirm password
        </label>
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
          required
          className={inputClass}
        />
      </div>
      <Button type="submit" size="sm" loading={loading} disabled={!newPassword || !confirm}>
        Update password
      </Button>
    </form>
  );
}
