"use client";

import { fmtNumber } from "@/lib/format";

interface StatsPanelProps {
  totalItems: number;
  totalItemsRaw: number;
  totalAllMode: number;
  siteCount: number;
  sourceCount: number;
  archiveTotal: number;
}

export default function StatsPanel({
  totalItems,
  totalItemsRaw,
  totalAllMode,
  siteCount,
  sourceCount,
  archiveTotal,
}: StatsPanelProps) {
  const cards: [string, string][] = [
    ["24h 金融", fmtNumber(totalItems)],
    ["24h 全量", fmtNumber(totalItemsRaw || totalItems)],
    ["去重后", fmtNumber(totalAllMode || totalItems)],
    ["数据源", fmtNumber(siteCount)],
    ["来源分组", fmtNumber(sourceCount)],
    ["归档总量", fmtNumber(archiveTotal)],
  ];

  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-[var(--radius-panel)] border border-[var(--color-line)]
            bg-[rgba(255,255,255,0.75)] px-3 py-2.5"
        >
          <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
          <div className="mt-0.5 font-[var(--font-heading),'Bricolage_Grotesque',sans-serif] text-[24px] font-bold text-[var(--foreground)]">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
