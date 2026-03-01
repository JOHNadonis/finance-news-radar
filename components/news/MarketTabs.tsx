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
                ? "border-[rgba(33,22,17,0.35)] font-bold text-[var(--foreground)]"
                : "border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--foreground)]"
            }`}
          style={
            marketFilter === tab.key
              ? { background: "linear-gradient(90deg, rgba(217,72,37,0.14), rgba(15,111,127,0.16))" }
              : undefined
          }
        >
          {tab.label}
        </button>
      ))}
    </section>
  );
}
