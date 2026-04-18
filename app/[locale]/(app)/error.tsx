"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, RefreshCcw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError boundary]", error);
  }, [error]);

  const t = useTranslations("common");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
        Something went wrong
      </h2>
      {error.digest && (
        <p className="text-xs font-mono text-[var(--color-text-muted)] mb-4">
          Error: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors"
      >
        <RefreshCcw className="w-4 h-4" />
        {t("save") === "Save" ? "Try again" : "Erneut versuchen"}
      </button>
    </div>
  );
}
