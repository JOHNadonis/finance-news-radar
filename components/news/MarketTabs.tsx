"use client";

import { useNewsStore } from "@/hooks/useNewsStore";
import { MARKET_LABELS } from "@/lib/constants";

const TABS: { key: string; label: string }[] = [
  { key: "", label: "全部" },
  { key: "a_stock", label: MARKET_LABELS.a_stock },
  { key: "us_stock", label: MARKET_LABELS.us_stock },
  { key: "hk_stock", label: MARKET_LABELS.hk_stock },
  { key: "macro", label: MARKET_LABELS.macro },
  { key: "crypto", label: MARKET_LABELS.crypto },
  { key: "commodity", label: MARKET_LABELS.commodity },
  { key: "forex", label: MARKET_LABELS.forex },
];

export default function MarketTabs() {
  const marketFilter = useNewsStore((s) => s.marketFilter);
  const setMarketFilter = useNewsStore((s) => s.setMarketFilter);

  return (
    <section className="mt-3.5 flex flex-wrap gap-1.5">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setMarketFilter(tab.key)}
          className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px]
            font-medium transition-all
            ${
              marketFilter === tab.key
                ? "border-[var(--color-accent)] bg-[rgba(247,147,26,0.15)] font-bold text-[var(--color-accent)]"
                : "border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--foreground)]"
            }`}
        >
          {tab.label}
        </button>
      ))}
    </section>
  );
}
