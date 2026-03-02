"use client";

import { useAnalysis, useTriggerAnalysis, useLLMSettings } from "@/hooks/useAnalysis";
import MarkdownContent from "@/components/assistant/MarkdownContent";

interface PolicyAnalysisProps {
  onAskQuestion?: (question: string) => void;
}

export default function PolicyAnalysis({ onAskQuestion }: PolicyAnalysisProps) {
  const { data, mutate } = useAnalysis();
  const { trigger, isMutating } = useTriggerAnalysis();
  const { data: settings } = useLLMSettings();

  const handleRefresh = async () => {
    const result = await trigger();
    mutate(result, false);
  };

  const notConfigured = !settings?.configured;

  return (
    <section
      className="mt-3.5 rounded-2xl border border-[var(--color-line)]
        bg-[var(--color-panel)] p-4"
      style={{ borderLeft: "3px solid var(--color-accent-2)" }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="m-0 font-[var(--font-heading),'Noto_Sans_SC',sans-serif] text-base">
          政策信号分析
        </h2>
        <span
          className="rounded-full bg-[rgba(15,111,127,0.15)] px-2 py-0.5
            text-[10px] font-semibold text-[var(--color-accent-2)]"
        >
          AI 分析
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isMutating || notConfigured}
          className="ml-auto cursor-pointer rounded-full border border-[var(--color-line)]
            bg-[rgba(255,255,255,0.6)] px-3 py-1 text-xs text-[var(--foreground)]
            transition-all hover:border-[var(--color-accent-2)]
            disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isMutating ? "分析中..." : "刷新分析"}
        </button>
      </div>

      {notConfigured ? (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          请先在设置中配置 LLM API（点击右下角 🤖 按钮）
        </div>
      ) : !data?.ok && data?.error ? (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          {data.error}
        </div>
      ) : data?.text ? (
        <>
          <MarkdownContent
            content={data.text}
            className="text-sm leading-[1.7] text-[var(--foreground)]"
          />

          {/* Suggested questions */}
          {data.suggested_questions && data.suggested_questions.length > 0 && (
            <div className="mt-3 border-t border-[var(--color-line)] pt-3">
              <p className="mb-2 text-xs text-[var(--color-muted)]">💡 推荐问题：</p>
              <div className="flex flex-wrap gap-2">
                {data.suggested_questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onAskQuestion?.(q)}
                    className="cursor-pointer rounded-full border border-[var(--color-line)]
                      bg-[rgba(255,255,255,0.7)] px-3 py-1.5 text-xs text-[var(--foreground)]
                      transition-all hover:border-[var(--color-accent-2)]
                      hover:text-[var(--color-accent-2)] hover:shadow-sm"
                  >
                    {q.length > 25 ? q.slice(0, 25) + "…" : q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-muted)]">
            {data.model && <span>模型: {data.model}</span>}
            {data.input_items > 0 && <span>输入: {data.input_items} 条新闻</span>}
            {data.generated_at && (
              <span>
                生成于:{" "}
                {new Date(data.generated_at).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          点击「刷新分析」生成 AI 政策分析
        </div>
      )}
    </section>
  );
}
