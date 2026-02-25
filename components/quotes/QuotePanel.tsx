"use client";

import { useQuotes } from "@/hooks/useQuotes";
import QuoteCard from "./QuoteCard";
import QuoteTicker from "./QuoteTicker";

interface Props {
  tickers: string[];
}

export default function QuotePanel({ tickers }: Props) {
  const quotes = useQuotes(tickers);

  if (tickers.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)]
        bg-white/[0.03] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
        No tickers subscribed
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scrolling ticker bar */}
      <QuoteTicker quotes={quotes} />

      {/* Quote cards grid */}
      <div className="grid grid-cols-2 gap-2.5 max-[760px]:grid-cols-1 sm:grid-cols-3 lg:grid-cols-4">
        {tickers.map((t) => {
          const q = quotes.get(t);
          if (!q) {
            return (
              <div
                key={t}
                className="flex items-center justify-center rounded-[var(--radius-panel)]
                  border border-[var(--color-line)] bg-white/[0.03] px-4 py-6
                  text-sm text-[var(--color-muted)]"
              >
                {t} Loading...
              </div>
            );
          }
          return <QuoteCard key={t} quote={q} />;
        })}
      </div>
    </div>
  );
}
