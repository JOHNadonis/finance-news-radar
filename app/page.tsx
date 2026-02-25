"use client";

import { useEffect } from "react";
import { useNewsData } from "@/hooks/useNewsData";
import { useNewsStore } from "@/hooks/useNewsStore";

import Header from "@/components/layout/Header";
import StatsPanel from "@/components/dashboard/StatsPanel";
import SentimentPanel from "@/components/dashboard/SentimentPanel";
import MarketSummary from "@/components/dashboard/MarketSummary";
import EconomicCalendar from "@/components/dashboard/EconomicCalendar";
import MarketTabs from "@/components/news/MarketTabs";
import Controls from "@/components/news/Controls";
import SitePills from "@/components/news/SitePills";
import NewsList from "@/components/news/NewsList";

export default function Home() {
  const { data } = useNewsData();
  const setData = useNewsStore((s) => s.setData);

  const generatedAt = useNewsStore((s) => s.generatedAt);
  const totalFinance = useNewsStore((s) => s.totalFinance);
  const totalRaw = useNewsStore((s) => s.totalRaw);
  const totalAllMode = useNewsStore((s) => s.totalAllMode);
  const siteCount = useNewsStore((s) => s.siteCount);
  const sourceCount = useNewsStore((s) => s.sourceCount);
  const archiveTotal = useNewsStore((s) => s.archiveTotal);

  useEffect(() => {
    if (data) {
      setData(data);
    }
  }, [data, setData]);

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 pb-12 max-[760px]:px-2.5 max-[760px]:py-3.5 max-[760px]:pb-8">
      {/* Hero section */}
      <Header generatedAt={generatedAt} />

      {/* Stats panel (inside hero area visually) */}
      <StatsPanel
        totalItems={totalFinance}
        totalItemsRaw={totalRaw}
        totalAllMode={totalAllMode}
        siteCount={siteCount}
        sourceCount={sourceCount}
        archiveTotal={archiveTotal}
      />

      {/* Sentiment indicators */}
      <SentimentPanel />

      {/* Market summary */}
      <MarketSummary />

      {/* Market filter tabs */}
      <MarketTabs />

      {/* Economic calendar */}
      <EconomicCalendar />

      {/* Controls: search, site select, mode switch */}
      <Controls />

      {/* Site pills */}
      <SitePills />

      {/* News list */}
      <NewsList />

      {/* Footer */}
      <footer className="mt-6 border-t border-[var(--color-line)] pt-4 text-center text-xs text-[var(--color-muted)]">
        Finance News Radar — 数据每 15 分钟自动更新
      </footer>
    </main>
  );
}
