export default function AnalyticsLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6 space-y-2">
        <div className="h-5 w-24 rounded-md bg-[var(--color-surface-700)] animate-pulse" />
        <div className="h-3.5 w-64 rounded-md bg-[var(--color-surface-700)] animate-pulse" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" role="status" aria-label="Loading analytics">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-900)]"
          >
            <div className="w-5 h-5 rounded bg-[var(--color-surface-700)] animate-pulse mb-3" />
            <div className="h-7 w-12 rounded bg-[var(--color-surface-700)] animate-pulse mb-1.5" />
            <div className="h-3 w-24 rounded bg-[var(--color-surface-700)] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Chart panels — row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-5"
          >
            <div className="h-4 w-40 rounded bg-[var(--color-surface-700)] animate-pulse mb-5" />
            <div className="space-y-3.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 rounded bg-[var(--color-surface-700)] animate-pulse" />
                    <div className="h-3 w-5 rounded bg-[var(--color-surface-700)] animate-pulse" />
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-[var(--color-surface-700)] animate-pulse"
                    style={{ width: `${60 + j * 8}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Chart panels — row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-5"
          >
            <div className="h-4 w-36 rounded bg-[var(--color-surface-700)] animate-pulse mb-5" />
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-28 rounded bg-[var(--color-surface-700)] animate-pulse" />
                    <div className="h-3 w-8 rounded bg-[var(--color-surface-700)] animate-pulse" />
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-surface-700)] animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
