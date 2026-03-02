"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "@/lib/types";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep ref in sync
  messagesRef.current = messages;

  const sendMessage = useCallback(async (content: string, context?: string) => {
    // Abort any in-progress stream before starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const userMsg: ChatMessage = { role: "user", content };
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      // Build API messages from completed messages only (exclude empty assistant placeholders)
      const history = messagesRef.current.filter(
        (m) => m.role === "user" || (m.role === "assistant" && m.content.length > 0)
      );
      const allMessages = [...history, userMsg].map(({ role, content: c }) => ({
        role,
        content: c,
      }));

      // Include access key if stored in localStorage
      const storedAccessKey = typeof window !== "undefined"
        ? localStorage.getItem("fnr_access_key")
        : null;
      const fetchBody: Record<string, unknown> = { messages: allMessages, context };
      if (storedAccessKey) {
        fetchBody.access_key = storedAccessKey;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetchBody),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `❌ ${err.error || "请求失败"}`,
          };
          return updated;
        });
        setIsStreaming(false);
        return;
      }

      if (!res.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "❌ 响应流不可用" };
          return updated;
        });
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) return;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data);
          if (json.error) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: updated[updated.length - 1].content + `\n\n❌ ${json.error}`,
              };
              return updated;
            });
            return;
          }
          if (json.content) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: updated[updated.length - 1].content + json.content,
              };
              return updated;
            });
          }
        } catch {
          // skip malformed
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line);
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        processLine(buffer);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // user cancelled
      } else {
        const msg = err instanceof Error ? err.message : "未知错误";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `❌ ${msg}`,
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []); // no dependency on messages — uses ref instead

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages };
}
