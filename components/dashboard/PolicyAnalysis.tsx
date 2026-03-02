"use client";

import { useAnalysis, useTriggerAnalysis, useLLMSettings } from "@/hooks/useAnalysis";
import MarkdownContent from "@/components/assistant/MarkdownContent";

interface PolicyAnalysisProps {
  onAskQuestion?: (question: string) => void;
}

export default function PolicyAnalysis({ onAskQuestion }: PolicyAnalysisProps) {
  const { data, mutate } = useAnalysis();
  const { trigger, stop, streamingText, isStreaming, meta, error: streamError } = useTriggerAnalysis();
  const { data: settings } = useLLMSettings();

  const handleRefresh = async () => {
    await trigger();
    // After streaming completes, re-fetch the cached result so SWR is in sync
    mutate();
  };

  const notConfigured = !settings?.configured;

  // Strip ---QUESTIONS--- separator from streaming text for display
  const separator = "---QUESTIONS---";
  const displayText = streamingText.includes(separator)
    ? streamingText.slice(0, streamingText.indexOf(separator)).trim()
    : streamingText;

  // Show streaming content if actively streaming or just finished (before SWR re-fetches)
  const showStreaming = isStreaming || (streamingText && !data?.text);
  // Use streaming text if it exists and is more recent than cached data
  const activeText = streamingText ? displayText : data?.text;
  const activeMeta = meta || (data ? { model: data.model, input_items: data.input_items, suggested_questions: data.suggested_questions, generated_at: data.generated_at } : null);

  // Suggested questions: from meta (streaming done) or cached data
  const suggestedQuestions = meta?.suggested_questions || data?.suggested_questions || [];
  const showQuestions = !isStreaming && suggestedQuestions.length > 0 && activeText;

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
        {isStreaming ? (
          <button
            type="button"
            onClick={stop}
            className="ml-auto cursor-pointer rounded-full border border-[var(--color-down)]
              bg-transparent px-3 py-1 text-xs text-[var(--color-down)]
              transition-all hover:bg-[rgba(255,23,68,0.08)]"
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={notConfigured}
            className="ml-auto cursor-pointer rounded-full border border-[var(--color-line)]
              bg-[rgba(255,255,255,0.6)] px-3 py-1 text-xs text-[var(--foreground)]
              transition-all hover:border-[var(--color-accent-2)]
              disabled:cursor-not-allowed disabled:opacity-50"
          >
            刷新分析
          </button>
        )}
      </div>

      {notConfigured ? (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          请先在设置中配置 LLM API（点击右下角 🤖 按钮）
        </div>
      ) : streamError ? (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          {streamError}
        </div>
      ) : !data?.ok && data?.error && !streamingText ? (
        <div className="py-4 text-center text-sm text-[var(--color-muted)]">
          {data.error}
        </div>
      ) : activeText ? (
        <>
          <MarkdownContent
            content={activeText}
            className="text-sm leading-[1.7] text-[var(--foreground)]"
          />
          {isStreaming && (
            <span className="inline-block w-1.5 animate-pulse bg-[var(--color-accent-2)] text-transparent">
              ▌
            </span>
          )}

          {/* Suggested questions */}
          {showQuestions && (
            <div className="mt-3 border-t border-[var(--color-line)] pt-3">
              <p className="mb-2 text-xs text-[var(--color-muted)]">💡 推荐问题：</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q, i) => (
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
            {activeMeta?.model && <span>模型: {activeMeta.model}</span>}
            {activeMeta && activeMeta.input_items > 0 && <span>输入: {activeMeta.input_items} 条新闻</span>}
            {activeMeta?.generated_at && (
              <span>
                生成于:{" "}
                {new Date(activeMeta.generated_at).toLocaleString("zh-CN", {
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
