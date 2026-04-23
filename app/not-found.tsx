import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">404</p>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Ticket not found</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          We couldn&apos;t find the ticket you were looking for.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/tickets"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            Back to tickets
          </Link>
        </div>
      </div>
    </div>
  );
}
