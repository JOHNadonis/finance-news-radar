"use client";

import { useEffect, useState, useCallback } from "react";
import { useNewsData } from "@/hooks/useNewsData";
import { useNewsStore } from "@/hooks/useNewsStore";
import { useAnalysis } from "@/hooks/useAnalysis";

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
import AssistantPanel from "@/components/assistant/AssistantPanel";
import TextSelectionQuote from "@/components/assistant/TextSelectionQuote";

export default function Home() {
  const { data } = useNewsData();
  const setData = useNewsStore((s) => s.setData);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState<string | undefined>();
  const [quotedText, setQuotedText] = useState<string | undefined>();

  const totalFinance = useNewsStore((s) => s.totalFinance);
  const totalRaw = useNewsStore((s) => s.totalRaw);
  const totalAllMode = useNewsStore((s) => s.totalAllMode);
  const siteCount = useNewsStore((s) => s.siteCount);
  const sourceCount = useNewsStore((s) => s.sourceCount);
  const archiveTotal = useNewsStore((s) => s.archiveTotal);

  const { data: analysisData } = useAnalysis();

  useEffect(() => {
    if (data) {
      setData(data);
    }
  }, [data, setData]);

  const handleAskQuestion = useCallback((question: string) => {
    setInitialQuestion(question);
    setAssistantOpen(true);
  }, []);

  const handleQuoteToAssistant = useCallback((text: string) => {
    setQuotedText(text);
    setAssistantOpen(true);
  }, []);

  const handleCloseAssistant = useCallback(() => {
    setAssistantOpen(false);
    setInitialQuestion(undefined);
    setQuotedText(undefined);
  }, []);

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
      <PolicyAnalysis onAskQuestion={handleAskQuestion} />

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

      {/* AI Assistant floating button */}
      {!assistantOpen && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 cursor-pointer items-center
            justify-center rounded-full border border-[var(--color-line)]
            bg-[rgba(255,255,255,0.85)] text-xl shadow-[0_4px_20px_rgba(21,16,12,0.1)]
            transition-all hover:shadow-[0_8px_30px_rgba(21,16,12,0.15)]
            hover:scale-110"
          aria-label="AI 金融小助手"
        >
          🤖
        </button>
      )}

      {/* Text selection quote button */}
      <TextSelectionQuote onQuote={handleQuoteToAssistant} />

      {/* AI Assistant Panel */}
      <AssistantPanel
        open={assistantOpen}
        onClose={handleCloseAssistant}
        initialQuestion={initialQuestion}
        suggestedQuestions={analysisData?.suggested_questions || []}
        analysisContext={analysisData?.text}
        quotedText={quotedText}
      />
    </main>
  );
}
