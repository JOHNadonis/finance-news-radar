import { useState, useCallback, useRef } from "react";
import useSWR from "swr";
import { REFRESH_DASHBOARD } from "@/lib/constants";
import type { PolicyAnalysisData, LLMSettingsPublic } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAnalysis() {
  return useSWR<PolicyAnalysisData>("/api/analysis", fetcher, {
    refreshInterval: REFRESH_DASHBOARD,
    revalidateOnFocus: false,
  });
}

export function useTriggerAnalysis() {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [meta, setMeta] = useState<{
    model: string;
    input_items: number;
    suggested_questions: string[];
    generated_at: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trigger = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();

    setStreamingText("");
    setIsStreaming(true);
    setMeta(null);
    setError(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        signal: abortRef.current.signal,
      });

      // Non-streaming error response (JSON)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else if (data.text) {
          // Fallback: non-streaming result
          setStreamingText(data.text);
          setMeta({
            model: data.model,
            input_items: data.input_items,
            suggested_questions: data.suggested_questions || [],
            generated_at: data.generated_at,
          });
        }
        setIsStreaming(false);
        return;
      }

      if (!res.body) {
        setError("响应流不可用");
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            if (json.error) {
              setError(json.error);
              continue;
            }
            if (json.content) {
              setStreamingText((prev) => prev + json.content);
            }
            if (json.meta) {
              setMeta(json.meta);
            }
          } catch {
            // skip
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data !== "[DONE]") {
            try {
              const json = JSON.parse(data);
              if (json.content) setStreamingText((prev) => prev + json.content);
              if (json.meta) setMeta(json.meta);
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // cancelled
      } else {
        setError(err instanceof Error ? err.message : "分析失败");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { trigger, stop, streamingText, isStreaming, meta, error };
}

export function useLLMSettings() {
  return useSWR<LLMSettingsPublic>("/api/settings", fetcher, {
    revalidateOnFocus: false,
  });
}
