"use client";

import { useSummary } from "@/hooks/useNewsData";
import { MARKET_LABELS } from "@/lib/constants";

export default function MarketSummary() {
  const { data } = useSummary();
  if (!data?.ok || !data.text) return null;

  return (
    <section
      className="mt-3.5 rounded-2xl border border-[var(--color-line)]
        bg-[var(--color-panel)] p-4"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="m-0 font-[var(--font-heading),'Noto_Sans_SC',sans-serif] text-base">
          市场速览
        </h2>
        {data.type === "llm" && (
          <span
            className="rounded-full bg-[rgba(15,111,127,0.15)] px-2 py-0.5
              text-[10px] font-semibold text-[var(--color-accent-2)]"
          >
            AI 生成
          </span>
        )}
      </div>

      <div className="whitespace-pre-wrap text-sm leading-[1.7] text-[var(--foreground)]">
        {data.text}
      </div>

      {data.sections && Object.keys(data.sections).length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {Object.entries(data.sections).map(([tag, s]) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--color-line)] px-2.5 py-[3px]
                text-[11px] text-[var(--color-muted)]"
            >
              {MARKET_LABELS[tag] || tag}{" "}
              <b className="font-bold text-[var(--color-accent)]">{s.total}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
