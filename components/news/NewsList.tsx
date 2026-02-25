"use client";

import { useMemo } from "react";
import { useNewsStore } from "@/hooks/useNewsStore";
import { fmtNumber } from "@/lib/format";
import NewsCard from "./NewsCard";
import type { NewsItem } from "@/lib/types";

function groupBySource(items: NewsItem[]): [string, NewsItem[]][] {
  const m = new Map<string, NewsItem[]>();
  for (const item of items) {
    const key = item.source || "未分区";
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(item);
  }
  return Array.from(m.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"),
  );
}

function SourceGroup({
  source,
  items,
}: {
  source: string;
  items: NewsItem[];
}) {
  return (
    <section className="border-t border-white/[0.04] first:border-t-0">
      <header
        className="flex items-center justify-between border-b border-white/[0.04]
          bg-[rgba(29,155,240,0.04)] px-4 py-2.5"
      >
        <h3 className="m-0 text-[13px] text-[var(--color-muted)]">{source}</h3>
        <span className="text-[11px] text-[var(--color-muted)]">
          {fmtNumber(items.length)} 条
        </span>
      </header>
      <div>
        {items.map((item) => (
          <NewsCard key={item.id || `${item.url}-${item.published_at}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function SiteGroup({
  siteName,
  items,
}: {
  siteName: string;
  items: NewsItem[];
}) {
  return (
    <section className="border-t border-white/[0.05] first:border-t-0">
      <header
        className="flex items-center justify-between border-b border-white/[0.05]
          bg-[rgba(247,147,26,0.06)] px-4 py-3"
      >
        <h3 className="m-0 text-[15px]">{siteName}</h3>
        <span className="text-xs text-[var(--color-muted)]">
          {fmtNumber(items.length)} 条
        </span>
      </header>
      <div>
        {groupBySource(items).map(([source, sourceItems]) => (
          <SourceGroup key={source} source={source} items={sourceItems} />
        ))}
      </div>
    </section>
  );
}

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

  // Build grouped view
  const content = useMemo(() => {
    if (!filtered.length) {
      return (
        <div className="py-6 text-center text-[var(--color-muted)]">
          当前筛选条件下没有结果。
        </div>
      );
    }

    // If site filter is active, group only by source
    if (siteFilter) {
      return groupBySource(filtered).map(([source, items]) => (
        <SourceGroup key={source} source={source} items={items} />
      ));
    }

    // Otherwise group by site then source
    const siteMap = new Map<
      string,
      { siteName: string; items: NewsItem[] }
    >();
    for (const item of filtered) {
      if (!siteMap.has(item.site_id)) {
        siteMap.set(item.site_id, {
          siteName: item.site_name || item.site_id,
          items: [],
        });
      }
      siteMap.get(item.site_id)!.items.push(item);
    }

    const sites = Array.from(siteMap.entries()).sort(
      (a, b) => b[1].items.length - a[1].items.length,
    );

    return sites.map(([siteId, site]) => (
      <SiteGroup key={siteId} siteName={site.siteName} items={site.items} />
    ));
  }, [filtered, siteFilter]);

  return (
    <section className="mt-3.5 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="flex items-baseline justify-between border-b border-[var(--color-line)] px-4 py-3.5">
        <h2 className="m-0 font-[var(--font-inter),'Noto_Sans_SC',sans-serif] text-lg">
          最近 24 小时更新
        </h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {fmtNumber(filtered.length)} 条
        </span>
      </div>
      <div>{content}</div>
    </section>
  );
}
