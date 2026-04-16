export const dynamic = "force-dynamic";

import { LoginForm } from "@/components/auth/LoginForm";
import { Zap } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-950)] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">HelpDesk AI</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Sign in to your account</p>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          Protected by DSG/LPD · Swiss data privacy standards
        </p>
      </div>
    </div>
  );
}
