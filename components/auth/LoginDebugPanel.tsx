"use client";

interface LoginDiagnostic {
  stage?: string;
  authErrorName?: string | null;
  authErrorStatus?: number | null;
  authErrorCode?: string | null;
  profileFound?: boolean;
  profileRole?: string | null;
  organizationId?: string | null;
  sessionPresent?: boolean;
  cookieCount?: number;
  redirectTo?: string | null;
}

interface LoginDebugPanelProps {
  diagnostic: LoginDiagnostic | null;
}

export function LoginDebugPanel({ diagnostic }: LoginDebugPanelProps) {
  if (!diagnostic) return null;

  return (
    <details className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-amber-300">
        Auth Debug
      </summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-amber-100">
        {JSON.stringify(diagnostic, null, 2)}
      </pre>
    </details>
  );
}
