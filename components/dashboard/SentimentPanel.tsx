"use client";

import { useSentiment } from "@/hooks/useNewsData";
import { gaugeColor } from "@/lib/format";
import { RATING_LABELS } from "@/lib/constants";

interface SentimentCard {
  label: string;
  value: number;
  sub: string;
  color: string;
}

export default function SentimentPanel() {
  const { data } = useSentiment();
  if (!data) return null;

  const cards: SentimentCard[] = [];

  if (data.cnn_fear_greed?.ok) {
    const s = data.cnn_fear_greed.score;
    cards.push({
      label: "Fear & Greed",
      value: Math.round(s),
      sub: RATING_LABELS[data.cnn_fear_greed.rating] || data.cnn_fear_greed.rating || "",
      color: gaugeColor(s),
    });
  }

  if (data.crypto_fear_greed?.ok) {
    const v = data.crypto_fear_greed.value;
    cards.push({
      label: "加密恐贪",
      value: v,
      sub: RATING_LABELS[data.crypto_fear_greed.classification] || data.crypto_fear_greed.classification || "",
      color: gaugeColor(v),
    });
  }

  if (data.vix?.ok && data.vix.value != null) {
    cards.push({
      label: "VIX 恐慌指数",
      value: data.vix.value,
      sub: "",
      color: data.vix.value > 25 ? "var(--color-down)" : "var(--color-up)",
    });
  }

  if (!cards.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2.5 max-[760px]:flex-col">
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-[120px] flex-1 rounded-[var(--radius-panel)] border
            border-[var(--color-line)] bg-white/[0.03] px-3.5 py-3 text-center"
        >
          <div
            className="font-[var(--font-inter),Inter,sans-serif] text-[32px] font-bold leading-none"
            style={{ color: c.color }}
          >
            {c.value}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[var(--color-muted)]">
            {c.label}
          </div>
          {c.sub && (
            <div className="mt-0.5 text-xs font-semibold">{c.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
