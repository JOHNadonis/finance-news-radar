export default function Loading() {
  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6">
      {/* Header skeleton */}
      <div className="animate-pulse rounded-[20px] border border-[var(--color-line)] p-6">
        <div className="flex items-center gap-3.5">
          <div className="h-14 w-14 rounded-[14px] bg-white/[0.06]" />
          <div className="flex-1">
            <div className="h-3 w-32 rounded bg-white/[0.06]" />
            <div className="mt-2 h-7 w-64 rounded bg-white/[0.06]" />
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-white/[0.03] px-3 py-2.5"
          >
            <div className="h-3 w-16 rounded bg-white/[0.06]" />
            <div className="mt-2 h-6 w-12 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="mt-4 animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-6">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-white/[0.04]" style={{ width: `${70 + Math.random() * 30}%` }} />
          ))}
        </div>
      </div>
    </main>
  );
}
