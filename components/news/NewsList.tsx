"use client";

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNewsStore } from "@/hooks/useNewsStore";
import { fmtNumber } from "@/lib/format";
import NewsCard from "./NewsCard";
import type { NewsItem } from "@/lib/types";

// Flattened row type for virtual scrolling
type VirtualRow =
  | { type: "site-header"; siteName: string; count: number }
  | { type: "source-header"; source: string; count: number }
  | { type: "item"; item: NewsItem };

function buildFlatRows(filtered: NewsItem[], siteFilter: string): VirtualRow[] {
  const rows: VirtualRow[] = [];

  function pushSourceGroups(items: NewsItem[]) {
    const sourceMap = new Map<string, NewsItem[]>();
    for (const item of items) {
      const key = item.source || "未分区";
      if (!sourceMap.has(key)) sourceMap.set(key, []);
      sourceMap.get(key)!.push(item);
    }
    const sorted = Array.from(sourceMap.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"),
    );
    for (const [source, items] of sorted) {
      rows.push({ type: "source-header", source, count: items.length });
      for (const item of items) {
        rows.push({ type: "item", item });
      }
    }
  }

  if (siteFilter) {
    pushSourceGroups(filtered);
    return rows;
  }

  const siteMap = new Map<string, { siteName: string; items: NewsItem[] }>();
  for (const item of filtered) {
    if (!siteMap.has(item.site_id)) {
      siteMap.set(item.site_id, { siteName: item.site_name || item.site_id, items: [] });
    }
    siteMap.get(item.site_id)!.items.push(item);
  }

  const sites = Array.from(siteMap.entries()).sort(
    (a, b) => b[1].items.length - a[1].items.length,
  );

  for (const [, site] of sites) {
    rows.push({ type: "site-header", siteName: site.siteName, count: site.items.length });
    pushSourceGroups(site.items);
  }

  return rows;
}

const ROW_HEIGHT_SITE_HEADER = 48;
const ROW_HEIGHT_SOURCE_HEADER = 40;
const ROW_HEIGHT_ITEM = 72;
const VIRTUAL_THRESHOLD = 100;

export default function NewsList() {
  const mode = useNewsStore((s) => s.mode);
  const allDedup = useNewsStore((s) => s.allDedup);
  const siteFilter = useNewsStore((s) => s.siteFilter);
  const marketFilter = useNewsStore((s) => s.marketFilter);
  const query = useNewsStore((s) => s.query);
  const itemsFinance = useNewsStore((s) => s.itemsFinance);
  const itemsAll = useNewsStore((s) => s.itemsAll);
  const itemsAllRaw = useNewsStore((s) => s.itemsAllRaw);

  const filtered = useMemo(() => {
    const modeItems =
      mode === "all" ? (allDedup ? itemsAll : itemsAllRaw) : itemsFinance;
    const q = query.trim().toLowerCase();

    return modeItems.filter((item) => {
      if (siteFilter && item.site_id !== siteFilter) return false;
      if (marketFilter) {
        const tags = item.market_tags || [];
        if (!tags.includes(marketFilter)) return false;
      }
      if (!q) return true;
      const hay =
        `${item.title || ""} ${item.title_zh || ""} ${item.title_en || ""} ${item.site_name || ""} ${item.source || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mode, allDedup, siteFilter, marketFilter, query, itemsFinance, itemsAll, itemsAllRaw]);

  const flatRows = useMemo(
    () => buildFlatRows(filtered, siteFilter),
    [filtered, siteFilter],
  );

  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;

  return (
    <section className="mt-3.5 overflow-hidden rounded-[24px] border border-[var(--color-line)] bg-[var(--color-panel)] backdrop-blur-[3px]">
      <div className="flex items-baseline justify-between border-b border-[var(--color-line)] px-4 py-3.5">
        <h2 className="m-0 font-[var(--font-heading),'Noto_Sans_SC',sans-serif] text-[21px]">
          最近 24 小时更新
        </h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {fmtNumber(filtered.length)} 条
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="py-6 text-center text-[var(--color-muted)]">
          当前筛选条件下没有结果。
        </div>
      ) : useVirtual ? (
        <VirtualNewsList rows={flatRows} />
      ) : (
        <StaticNewsList rows={flatRows} />
      )}
    </section>
  );
}

function StaticNewsList({ rows }: { rows: VirtualRow[] }) {
  return (
    <div>
      {rows.map((row, i) => (
        <RowRenderer key={i} row={row} />
      ))}
    </div>
  );
}

function VirtualNewsList({ rows }: { rows: VirtualRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const row = rows[i];
      if (row.type === "site-header") return ROW_HEIGHT_SITE_HEADER;
      if (row.type === "source-header") return ROW_HEIGHT_SOURCE_HEADER;
      return ROW_HEIGHT_ITEM;
    },
    overscan: 20,
  });

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
          >
            <RowRenderer row={rows[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RowRenderer({ row }: { row: VirtualRow }) {
  if (row.type === "site-header") {
    return (
      <header
        className="flex items-center justify-between border-b border-[rgba(22,16,13,0.08)]
          bg-[rgba(217,72,37,0.08)] px-4 py-3"
      >
        <h3 className="m-0 text-[15px]">{row.siteName}</h3>
        <span className="text-xs text-[var(--color-muted)]">
          {fmtNumber(row.count)} 条
        </span>
      </header>
    );
  }

  if (row.type === "source-header") {
    return (
      <header
        className="flex items-center justify-between border-b border-[rgba(22,16,13,0.06)]
          bg-[rgba(15,111,127,0.05)] px-4 py-2.5"
      >
        <h3 className="m-0 text-[13px] text-[var(--color-muted)]">{row.source}</h3>
        <span className="text-[11px] text-[var(--color-muted)]">
          {fmtNumber(row.count)} 条
        </span>
      </header>
    );
  }

  return <NewsCard item={row.item} />;
}
