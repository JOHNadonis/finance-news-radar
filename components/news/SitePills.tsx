"use client";

import { useMemo } from "react";
import { useNewsStore } from "@/hooks/useNewsStore";
import type { NewsItem, SiteStat } from "@/lib/types";

function computeSiteStats(items: NewsItem[]): SiteStat[] {
  const m = new Map<string, SiteStat>();
  for (const item of items) {
    if (!m.has(item.site_id)) {
      m.set(item.site_id, {
        site_id: item.site_id,
        site_name: item.site_name,
        count: 0,
        raw_count: 0,
      });
    }
    const row = m.get(item.site_id)!;
    row.count += 1;
    row.raw_count += 1;
  }
  return Array.from(m.values()).sort(
    (a, b) => b.count - a.count || a.site_name.localeCompare(b.site_name, "zh-CN"),
  );
}

export default function SitePills() {
  const mode = useNewsStore((s) => s.mode);
  const allDedup = useNewsStore((s) => s.allDedup);
  const siteFilter = useNewsStore((s) => s.siteFilter);
  const statsFinance = useNewsStore((s) => s.statsFinance);
  const itemsAll = useNewsStore((s) => s.itemsAll);
  const itemsAllRaw = useNewsStore((s) => s.itemsAllRaw);
  const setSiteFilter = useNewsStore((s) => s.setSiteFilter);

  const stats = useMemo(() => {
    if (mode === "finance") return statsFinance;
    return computeSiteStats(allDedup ? itemsAll : itemsAllRaw);
  }, [mode, statsFinance, allDedup, itemsAll, itemsAllRaw]);

  return (
    <section className="mt-2.5 flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setSiteFilter("")}
        className={`cursor-pointer rounded-full border px-2.5 py-[5px] text-xs
          ${
            siteFilter === ""
              ? "border-[rgba(33,22,17,0.35)] text-[var(--foreground)]"
              : "border-[var(--color-line)] bg-[rgba(255,255,255,0.7)] text-[var(--foreground)]"
          }`}
        style={
          siteFilter === ""
            ? { background: "linear-gradient(90deg, rgba(217,72,37,0.14), rgba(15,111,127,0.16))" }
            : undefined
        }
      >
        全部
      </button>
      {stats.map((s) => (
        <button
          key={s.site_id}
          type="button"
          onClick={() => setSiteFilter(s.site_id)}
          className={`cursor-pointer rounded-full border px-2.5 py-[5px] text-xs
            ${
              siteFilter === s.site_id
                ? "border-[rgba(33,22,17,0.35)] text-[var(--foreground)]"
                : "border-[var(--color-line)] bg-[rgba(255,255,255,0.7)] text-[var(--foreground)]"
            }`}
          style={
            siteFilter === s.site_id
              ? { background: "linear-gradient(90deg, rgba(217,72,37,0.14), rgba(15,111,127,0.16))" }
              : undefined
          }
        >
          {s.site_name} {s.count}/{s.raw_count ?? s.count}
        </button>
      ))}
    </section>
  );
}
