"use client";

import type { QuoteData } from "@/lib/types";

interface Props {
  quote: QuoteData;
}

export default function QuoteCard({ quote }: Props) {
  const isUp = quote.change >= 0;
  const color = isUp ? "var(--color-up)" : "var(--color-down)";
  const arrow = isUp ? "\u25B2" : "\u25BC";

  return (
    <div
      className="rounded-[var(--radius-panel)] border border-[var(--color-line)]
        bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06]"
    >
      {/* Header */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {quote.name ?? quote.ticker}
        </span>
        <span className="text-xs text-[var(--color-muted)]">{quote.ticker}</span>
      </div>

      {/* Price */}
      <div className="mb-1.5 font-mono text-2xl font-bold" style={{ color }}>
        {quote.price.toFixed(2)}
      </div>

      {/* Change */}
      <div className="mb-3 flex items-center gap-2 font-mono text-sm" style={{ color }}>
        <span>
          {arrow} {isUp ? "+" : ""}
          {quote.change.toFixed(2)}
        </span>
        <span>
          ({isUp ? "+" : ""}
          {quote.changePercent.toFixed(2)}%)
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        {quote.high != null && (
          <>
            <span>High</span>
            <span className="text-right font-mono">{quote.high.toFixed(2)}</span>
          </>
        )}
        {quote.low != null && (
          <>
            <span>Low</span>
            <span className="text-right font-mono">{quote.low.toFixed(2)}</span>
          </>
        )}
        {quote.volume != null && (
          <>
            <span>Volume</span>
            <span className="text-right font-mono">{formatVolume(quote.volume)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toString();
}
