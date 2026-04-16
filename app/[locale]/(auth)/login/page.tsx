export const dynamic = "force-dynamic";

import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { Zap } from "lucide-react";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signIn") };
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <div className="login-hero min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Swiss Blue gradient orbs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="login-orb-primary absolute top-[-25%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full" />
        <div className="login-orb-secondary absolute top-[-15%] right-[-15%] w-[500px] h-[500px] rounded-full" />
        <div className="login-orb-deep absolute bottom-[-25%] left-[-15%] w-[600px] h-[600px] rounded-full" />
        <div className="login-grid absolute inset-0" />
      </div>

      {/* Glass card */}
      <div className="relative w-full max-w-sm">
        <div className="login-glass-card rounded-2xl p-8 shadow-2xl shadow-black/60">
          {/* Brand header */}
          <div className="flex flex-col items-center mb-8">
            <div className="login-brand-icon w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
              HelpDesk AI
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t("signInTitle")}</p>
          </div>

          <LoginForm error={error} />
        </div>

        {/* DSG privacy note */}
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-5">
          {t("privacyNote")}
        </p>
      </div>
    </div>
  );
}
