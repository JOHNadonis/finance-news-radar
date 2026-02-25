"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[1080px] flex-col items-center justify-center gap-4 px-4">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-8 text-center">
        <h2 className="m-0 text-lg text-[var(--foreground)]">加载出错</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {error.message || "发生了未知错误"}
        </p>
        <button
          onClick={reset}
          className="mt-4 cursor-pointer rounded-lg border border-[var(--color-accent)]
            bg-[rgba(247,147,26,0.15)] px-4 py-2 text-sm font-medium text-[var(--color-accent)]
            transition-colors hover:bg-[rgba(247,147,26,0.25)]"
        >
          重试
        </button>
      </div>
    </main>
  );
}
