"use client";

import { useEffect, useState } from "react";
import { useNewsData } from "@/hooks/useNewsData";
import { useNewsStore } from "@/hooks/useNewsStore";

import Header from "@/components/layout/Header";
import StatsPanel from "@/components/dashboard/StatsPanel";
import SentimentPanel from "@/components/dashboard/SentimentPanel";
import MarketSummary from "@/components/dashboard/MarketSummary";
import PolicyAnalysis from "@/components/dashboard/PolicyAnalysis";
import MarketTabs from "@/components/news/MarketTabs";
import EconomicCalendar from "@/components/dashboard/EconomicCalendar";
import Controls from "@/components/news/Controls";
import SitePills from "@/components/news/SitePills";
import NewsList from "@/components/news/NewsList";
import SettingsModal from "@/components/settings/SettingsModal";

export default function Home() {
  const { data } = useNewsData();
  const setData = useNewsStore((s) => s.setData);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      {/* Hero — Stats + Sentiment 嵌套在 Hero 内部（与原站一致） */}
      <Header>
        <StatsPanel
          totalItems={totalFinance}
          totalItemsRaw={totalRaw}
          totalAllMode={totalAllMode}
          siteCount={siteCount}
          sourceCount={sourceCount}
          archiveTotal={archiveTotal}
        />
        <SentimentPanel />
      </Header>

      {/* Market summary（在 tabs 之前，与原站一致） */}
      <MarketSummary />

      {/* AI Policy Analysis */}
      <PolicyAnalysis />

      {/* Market filter tabs */}
      <MarketTabs />

      {/* Economic calendar（在 controls 之前，与原站一致） */}
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

      {/* Settings gear button */}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 cursor-pointer items-center
          justify-center rounded-full border border-[var(--color-line)]
          bg-[rgba(255,255,255,0.85)] text-xl shadow-[0_4px_20px_rgba(21,16,12,0.1)]
          transition-all hover:shadow-[0_8px_30px_rgba(21,16,12,0.15)]"
        aria-label="设置"
      >
        ⚙
      </button>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
