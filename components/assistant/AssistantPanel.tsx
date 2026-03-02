"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@/hooks/useChat";
import { useLLMSettings } from "@/hooks/useAnalysis";
import MarkdownContent from "./MarkdownContent";

type PanelState = "closed" | "minimized" | "normal" | "maximized";
type Tab = "chat" | "settings";

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
  suggestedQuestions?: string[];
  analysisContext?: string;
}

export default function AssistantPanel({
  open,
  onClose,
  initialQuestion,
  suggestedQuestions = [],
  analysisContext,
}: AssistantPanelProps) {
  const [state, setState] = useState<PanelState>("closed");
  const [tab, setTab] = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [hasAutoSent, setHasAutoSent] = useState<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } = useChat();

  // Settings state
  const { data: settings, mutate: mutateSettings } = useLLMSettings();
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync settings
  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.api_base_url || "https://api.openai.com/v1");
      setModelName(settings.model_name || "gpt-4o-mini");
      setApiKey("");
      setTestResult(null);
    }
  }, [settings]);

  // Open/close
  useEffect(() => {
    if (open && state === "closed") {
      setState("normal");
      setTab("chat");
      setPosition(null);
    } else if (!open && state !== "closed") {
      setState("closed");
    }
  }, [open, state]);

  // Auto-send initial question
  useEffect(() => {
    if (initialQuestion && state === "normal" && initialQuestion !== hasAutoSent) {
      setHasAutoSent(initialQuestion);
      sendMessage(initialQuestion, analysisContext);
    }
  }, [initialQuestion, state, hasAutoSent, sendMessage, analysisContext]);

  // Auto scroll (debounced via rAF to avoid piling up during streaming)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  // Focus input when switching to chat tab
  useEffect(() => {
    if (tab === "chat" && state === "normal") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [tab, state]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text, analysisContext);
  }, [input, isStreaming, sendMessage, analysisContext]);

  const handleQuestionClick = useCallback((q: string) => {
    if (isStreaming) return;
    setInput("");
    sendMessage(q, analysisContext);
  }, [isStreaming, sendMessage, analysisContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cleanup drag listeners on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    if (state === "maximized") return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
    e.preventDefault();

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      });
    };

    const cleanup = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      dragCleanupRef.current = null;
    };

    const handleMouseUp = () => cleanup();

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    dragCleanupRef.current = cleanup;
  };

  // Settings handlers
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_base_url: baseUrl,
          ...(apiKey ? { api_key: apiKey } : {}),
          model_name: modelName,
        }),
      });
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "请求失败" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_base_url: baseUrl,
          ...(apiKey ? { api_key: apiKey } : {}),
          model_name: modelName,
        }),
      });
      mutateSettings();
      setTab("chat");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setState("closed");
    onClose();
  };

  if (state === "closed") return null;

  // Minimized state
  if (state === "minimized") {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-2
          rounded-full border border-[var(--color-line)] bg-[rgba(255,255,255,0.92)]
          px-4 py-2.5 shadow-[0_4px_20px_rgba(21,16,12,0.1)] backdrop-blur-md
          transition-all hover:shadow-[0_8px_30px_rgba(21,16,12,0.15)]"
        onClick={() => setState("normal")}
      >
        <span className="text-lg">🤖</span>
        <span className="text-sm font-medium text-[var(--foreground)]">AI 小助手</span>
        {isStreaming && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
        )}
      </div>
    );
  }

  const isMax = state === "maximized";
  const panelStyle: React.CSSProperties = isMax
    ? { position: "fixed", inset: 20, width: "auto", height: "auto" }
    : position
      ? { position: "fixed", left: position.x, top: position.y, width: 420, height: 560 }
      : { position: "fixed", bottom: 24, right: 24, width: 420, height: 560 };

  return (
    <div
      ref={panelRef}
      className="z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-line)]
        bg-[rgba(255,255,255,0.95)] shadow-[0_24px_55px_rgba(21,16,12,0.15)] backdrop-blur-md
        animate-[slide-up_0.3s_ease-out]"
      style={{ ...panelStyle, resize: isMax ? "none" : "both", minWidth: 320, minHeight: 400 }}
    >
      {/* Title bar */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)]
          bg-[rgba(255,255,255,0.6)] px-4 py-2.5 select-none"
        onMouseDown={handleDragStart}
        style={{ cursor: isMax ? "default" : "move" }}
      >
        <span className="text-lg">🤖</span>
        <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">
          AI 金融小助手
        </span>
        <button
          onClick={() => setState("minimized")}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded
            text-xs text-[var(--color-muted)] transition-colors hover:bg-[rgba(0,0,0,0.06)]"
          title="最小化"
        >—</button>
        <button
          onClick={() => setState(isMax ? "normal" : "maximized")}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded
            text-xs text-[var(--color-muted)] transition-colors hover:bg-[rgba(0,0,0,0.06)]"
          title={isMax ? "还原" : "最大化"}
        >□</button>
        <button
          onClick={handleClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded
            text-xs text-[var(--color-muted)] transition-colors hover:bg-[rgba(255,0,0,0.1)] hover:text-red-500"
          title="关闭"
        >×</button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-[var(--color-line)] bg-[rgba(255,255,255,0.4)]">
        <button
          onClick={() => setTab("chat")}
          className={`flex-1 cursor-pointer px-4 py-2 text-sm font-medium transition-colors ${
            tab === "chat"
              ? "border-b-2 border-[var(--color-accent-2)] text-[var(--color-accent-2)]"
              : "text-[var(--color-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          💬 对话
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`flex-1 cursor-pointer px-4 py-2 text-sm font-medium transition-colors ${
            tab === "settings"
              ? "border-b-2 border-[var(--color-accent-2)] text-[var(--color-accent-2)]"
              : "text-[var(--color-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          ⚙ 设置
        </button>
      </div>

      {/* Chat Tab */}
      {tab === "chat" && (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <span className="text-3xl">🤖</span>
                <p className="text-sm text-[var(--color-muted)]">
                  您好！我是金融分析助手，可以帮您深度分析政策、行业和市场趋势。
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <span className="mt-0.5 shrink-0 text-base">
                  {msg.role === "user" ? "👤" : "🤖"}
                </span>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--color-accent-2)] text-white"
                      : "bg-[rgba(0,0,0,0.04)]"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <MarkdownContent content={msg.content} className="text-sm" />
                      {isStreaming && i === messages.length - 1 && (
                        <span className="inline-block w-1.5 animate-pulse bg-[var(--color-accent-2)] text-transparent">
                          ▌
                        </span>
                      )}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
          {suggestedQuestions.length > 0 && messages.length === 0 && (
            <div className="shrink-0 border-t border-[var(--color-line)] px-4 py-2">
              <p className="mb-1.5 text-xs text-[var(--color-muted)]">💡 推荐问题：</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuestionClick(q)}
                    disabled={isStreaming}
                    className="cursor-pointer rounded-full border border-[var(--color-line)]
                      bg-[rgba(255,255,255,0.8)] px-2.5 py-1 text-xs text-[var(--foreground)]
                      transition-all hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)]
                      disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {q.length > 20 ? q.slice(0, 20) + "…" : q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="shrink-0 border-t border-[var(--color-line)] bg-[rgba(255,255,255,0.6)] p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="请输入您的问题..."
                rows={1}
                maxLength={5000}
                className="flex-1 resize-none rounded-xl border border-[var(--color-line)]
                  bg-[rgba(255,255,255,0.8)] px-3 py-2 text-sm text-[var(--foreground)]
                  placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent-2)]
                  focus:outline-none"
                style={{ maxHeight: 100 }}
              />
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="shrink-0 cursor-pointer rounded-xl border border-[var(--color-down)]
                    bg-transparent px-3 py-2 text-sm font-medium text-[var(--color-down)]
                    transition-all hover:bg-[rgba(255,23,68,0.08)]"
                >
                  停止
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="shrink-0 cursor-pointer rounded-xl border border-[var(--color-accent-2)]
                    bg-[var(--color-accent-2)] px-3 py-2 text-sm font-medium text-white
                    transition-all hover:opacity-90
                    disabled:cursor-not-allowed disabled:opacity-50"
                >
                  发送
                </button>
              )}
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                disabled={isStreaming}
                className="mt-1.5 cursor-pointer text-[11px] text-[var(--color-muted)]
                  transition-colors hover:text-[var(--foreground)]
                  disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空对话
              </button>
            )}
          </div>
        </>
      )}

      {/* Settings Tab */}
      {tab === "settings" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              API Base URL
            </span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-[10px] border border-[var(--color-line)]
                bg-[rgba(255,255,255,0.8)] px-3 py-2.5 text-sm text-[var(--foreground)]
                placeholder:text-[var(--color-muted)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              API Key
              {settings?.configured && (
                <span className="ml-2 text-[10px] text-[var(--color-accent-2)]">
                  当前: {settings.api_key_masked}
                </span>
              )}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.configured ? "留空则不修改" : "sk-..."}
              className="w-full rounded-[10px] border border-[var(--color-line)]
                bg-[rgba(255,255,255,0.8)] px-3 py-2.5 text-sm text-[var(--foreground)]
                placeholder:text-[var(--color-muted)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              模型名称
            </span>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full rounded-[10px] border border-[var(--color-line)]
                bg-[rgba(255,255,255,0.8)] px-3 py-2.5 text-sm text-[var(--foreground)]
                placeholder:text-[var(--color-muted)]"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="cursor-pointer rounded-full border border-[var(--color-accent-2)]
                bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-accent-2)]
                transition-all hover:bg-[rgba(15,111,127,0.08)]
                disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            {testResult && (
              <span
                className={`text-xs font-medium ${
                  testResult.ok ? "text-[var(--color-up)]" : "text-[var(--color-down)]"
                }`}
              >
                {testResult.ok ? "✅ 连接成功" : testResult.error || "连接失败"}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTab("chat")}
              className="cursor-pointer rounded-full border border-[var(--color-line)]
                bg-transparent px-4 py-2 text-sm text-[var(--color-muted)]
                transition-all hover:text-[var(--foreground)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="cursor-pointer rounded-full border border-[var(--color-accent)]
                bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white
                transition-all hover:opacity-90
                disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
