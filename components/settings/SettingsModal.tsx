"use client";

import { useState, useEffect } from "react";
import { useLLMSettings } from "@/hooks/useAnalysis";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { data: settings, mutate } = useLLMSettings();
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.api_base_url || "https://api.openai.com/v1");
      setModelName(settings.model_name || "gpt-4o-mini");
      setApiKey("");
      setTestResult(null);
    }
  }, [settings, open]);

  if (!open) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so test uses latest config
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
      mutate();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-[18px] border border-[var(--color-line)]
          bg-[rgba(255,255,255,0.95)] p-6 shadow-[0_24px_55px_rgba(21,16,12,0.12)]
          backdrop-blur-md"
      >
        <h2 className="m-0 mb-4 font-[var(--font-heading),'Noto_Sans_SC',sans-serif] text-lg text-[var(--foreground)]">
          LLM API 设置
        </h2>

        {/* API Base URL */}
        <label className="mb-3 block">
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

        {/* API Key */}
        <label className="mb-3 block">
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

        {/* Model Name */}
        <label className="mb-4 block">
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

        {/* Test connection */}
        <div className="mb-4 flex items-center gap-2">
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
              {testResult.ok ? "连接成功" : testResult.error || "连接失败"}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
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
    </div>
  );
}
