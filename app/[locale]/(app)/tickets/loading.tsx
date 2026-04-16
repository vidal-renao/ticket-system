export default function TicketsLoading() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded-md bg-[var(--color-surface-700)] animate-pulse" />
          <div className="h-3.5 w-20 rounded-md bg-[var(--color-surface-700)] animate-pulse" />
        </div>
      </div>

      {/* Ticket rows */}
      <div className="space-y-2" role="status" aria-label="Loading tickets">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-900)]"
          >
            <div className="flex items-start gap-4">
              {/* Priority icon */}
              <div className="w-4 h-4 rounded-full bg-[var(--color-surface-700)] animate-pulse mt-0.5 shrink-0" />
              {/* Title + ref */}
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-[var(--color-surface-700)] animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-[var(--color-surface-700)] animate-pulse" />
              </div>
              {/* Badges + time */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-5 w-14 rounded-full bg-[var(--color-surface-700)] animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-[var(--color-surface-700)] animate-pulse" />
                <div className="h-3.5 w-10 rounded bg-[var(--color-surface-700)] animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
