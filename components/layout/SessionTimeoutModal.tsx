"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

interface Props {
  locale: string;
}

export function SessionTimeoutModal({ locale }: Props) {
  const t = useTranslations("session");
  const supabase = createClient();

  const handleTimeout = useCallback(async () => {
    // Mark the profile offline first so presence never lingers after an
    // inactivity sign-out. sendBeacon survives the page navigation below.
    try {
      navigator.sendBeacon("/api/profile/offline");
    } catch {
      /* presence cleanup is best-effort */
    }
    await supabase.auth.signOut();
    const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
    window.location.href = loginPath;
  }, [locale, supabase]);

  const { isWarning, secondsLeft, reset } = useSessionTimeout(handleTimeout);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <AnimatePresence>
      {isWarning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-timeout-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-sm mx-4 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_24px_64px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-400" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="session-timeout-title"
                  className="text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t("expiring")}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {t("expiringMessage")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center my-5">
              <div className="tabular-nums text-4xl font-bold tracking-tight text-amber-400">
                {pad(minutes)}:{pad(seconds)}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleTimeout}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm text-[var(--color-text-muted)] border border-[var(--color-surface-600)] hover:bg-[var(--color-surface-800)] transition-colors"
              >
                {t("signOut")}
              </button>
              <button
                type="button"
                onClick={reset}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.97] transition-[background-color,transform]"
              >
                {t("stayLoggedIn")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
