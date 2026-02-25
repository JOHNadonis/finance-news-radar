"use client";

import { useMemo } from "react";
import { useNewsStore } from "@/hooks/useNewsStore";
import { fmtNumber, fmtTime } from "@/lib/format";
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

export default function Controls() {
  const mode = useNewsStore((s) => s.mode);
  const allDedup = useNewsStore((s) => s.allDedup);
  const siteFilter = useNewsStore((s) => s.siteFilter);
  const query = useNewsStore((s) => s.query);
  const generatedAt = useNewsStore((s) => s.generatedAt);
  const totalFinance = useNewsStore((s) => s.totalFinance);
  const totalAllMode = useNewsStore((s) => s.totalAllMode);
  const totalRaw = useNewsStore((s) => s.totalRaw);
  const statsFinance = useNewsStore((s) => s.statsFinance);
  const itemsAll = useNewsStore((s) => s.itemsAll);
  const itemsAllRaw = useNewsStore((s) => s.itemsAllRaw);

  const setMode = useNewsStore((s) => s.setMode);
  const setAllDedup = useNewsStore((s) => s.setAllDedup);
  const setSiteFilter = useNewsStore((s) => s.setSiteFilter);
  const setQuery = useNewsStore((s) => s.setQuery);

  const siteStats = useMemo(() => {
    if (mode === "finance") return statsFinance;
    return computeSiteStats(allDedup ? itemsAll : itemsAllRaw);
  }, [mode, statsFinance, allDedup, itemsAll, itemsAllRaw]);

  const modeHint = useMemo(() => {
    if (mode === "finance") {
      return `当前视图：金融过滤（${fmtNumber(totalFinance)} 条）`;
    }
    const c = allDedup
      ? totalAllMode || itemsAll.length
      : totalRaw || itemsAllRaw.length;
    return `当前视图：全量（${allDedup ? "去重开" : "去重关"}，${fmtNumber(c)} 条）`;
  }, [mode, allDedup, totalFinance, totalAllMode, totalRaw, itemsAll.length, itemsAllRaw.length]);

  return (
    <>
      {/* Controls row */}
      <section
        className="mt-3 grid items-center gap-2
          grid-cols-[minmax(0,1.4fr)_minmax(150px,0.6fr)_auto_auto]
          max-[760px]:grid-cols-1"
      >
        {/* Search */}
        <input
          type="search"
          placeholder="搜索标题 / 来源"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-[10px] border border-[var(--color-line)]
            bg-white/[0.05] px-3 py-2.5 text-sm text-[var(--foreground)]
            placeholder:text-[var(--color-muted)]"
        />

        {/* Site select */}
        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className="w-full cursor-pointer rounded-[10px] border border-[var(--color-line)]
            bg-white/[0.05] px-3 py-2.5 text-sm text-[var(--foreground)]"
        >
          <option value="">全部站点</option>
          {siteStats.map((s) => (
            <option key={s.site_id} value={s.site_id}>
              {s.site_name} ({s.count}/{s.raw_count ?? s.count})
            </option>
          ))}
        </select>

        {/* Mode switch */}
        <div className="inline-flex overflow-hidden rounded-[10px] border border-[var(--color-line)]">
          <button
            type="button"
            onClick={() => setMode("finance")}
            className={`cursor-pointer border-0 px-3 py-[9px] text-[13px] ${
              mode === "finance"
                ? "bg-[rgba(247,147,26,0.15)] font-bold text-[var(--color-accent)]"
                : "bg-transparent text-[var(--color-muted)]"
            }`}
          >
            金融过滤
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`cursor-pointer border-0 px-3 py-[9px] text-[13px] ${
              mode === "all"
                ? "bg-[rgba(247,147,26,0.15)] font-bold text-[var(--color-accent)]"
                : "bg-transparent text-[var(--color-muted)]"
            }`}
          >
            全量
          </button>
        </div>

        {/* Dedup toggle (only in all mode) */}
        {mode === "all" ? (
          <label
            className="inline-flex cursor-pointer select-none items-center gap-1.5
              rounded-[10px] border border-[var(--color-line)] px-2.5 py-[7px]
              text-xs text-[var(--color-muted)]"
          >
            <input
              type="checkbox"
              checked={allDedup}
              onChange={(e) => setAllDedup(e.target.checked)}
              className="absolute h-0 w-0 opacity-0"
            />
            <span
              className={`h-2.5 w-2.5 rounded-full border transition-all ${
                allDedup
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                  : "border-[var(--color-muted)] bg-white/10"
              }`}
            />
            <span>{allDedup ? "去重开" : "去重关"}</span>
          </label>
        ) : (
          <span
            className="justify-self-end text-xs text-[var(--color-muted)]
              max-[760px]:justify-self-start"
          >
            更新：{fmtTime(generatedAt)}
          </span>
        )}
      </section>

      {/* Mode hint */}
      <div className="mt-1.5 text-xs text-[var(--color-muted)]">{modeHint}</div>
    </>
  );
}
