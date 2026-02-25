"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { XueqiuQuote } from "@/lib/types";

// Common tickers for autocomplete
const COMMON_TICKERS = [
  { symbol: "SH000001", name: "上证指数" },
  { symbol: "SH000300", name: "沪深300" },
  { symbol: "SZ399001", name: "深证成指" },
  { symbol: "SZ399006", name: "创业板指" },
  { symbol: "SH600519", name: "贵州茅台" },
  { symbol: "SH601318", name: "中国平安" },
  { symbol: "SZ000858", name: "五粮液" },
  { symbol: "SH600036", name: "招商银行" },
  { symbol: "SZ000001", name: "平安银行" },
  { symbol: "SH601899", name: "紫金矿业" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Google" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "META", name: "Meta" },
  { symbol: "BTCUSD", name: "Bitcoin" },
  { symbol: "ETHUSD", name: "Ethereum" },
];

interface TickerSearchProps {
  onSubscribe: (symbol: string, name: string) => Promise<void>;
  isSubscribed: (symbol: string) => boolean;
}

export function TickerSearch({ onSubscribe, isSubscribed }: TickerSearchProps) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [preview, setPreview] = useState<XueqiuQuote | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const suggestions = query.trim()
    ? COMMON_TICKERS.filter(
        (t) =>
          t.symbol.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchPreview = useCallback(async (symbol: string) => {
    setLoadingPreview(true);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/xueqiu?type=quote&symbol=${encodeURIComponent(symbol)}`
      );
      if (res.ok) {
        const data: XueqiuQuote = await res.json();
        setPreview(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  function handleSelect(symbol: string, name: string) {
    setQuery(`${name} (${symbol})`);
    setShowSuggestions(false);

    // Debounced preview fetch
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      fetchPreview(symbol);
    }, 300);
  }

  async function handleSubscribe() {
    if (!preview) return;
    setSubscribing(true);
    await onSubscribe(preview.symbol, preview.name);
    setSubscribing(false);
    setPreview(null);
    setQuery("");
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowSuggestions(true);
          setPreview(null);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder="输入股票代码或名称..."
        className="w-full px-3 py-2 text-sm rounded border border-[var(--color-line)] bg-white/5 text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
      />

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 rounded border border-[var(--color-line)] bg-[var(--color-panel)] shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((t) => (
            <button
              key={t.symbol}
              onClick={() => handleSelect(t.symbol, t.name)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex justify-between items-center"
            >
              <span className="text-[var(--color-foreground)]">{t.name}</span>
              <span className="text-xs text-[var(--color-muted)]">
                {t.symbol}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Price preview */}
      {loadingPreview && (
        <div className="mt-2 text-xs text-[var(--color-muted)]">
          获取行情中...
        </div>
      )}

      {preview && (
        <div className="mt-2 p-3 rounded border border-[var(--color-line)] bg-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-[var(--color-foreground)]">
              {preview.name}
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {preview.symbol}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg font-semibold text-[var(--color-foreground)]">
              {preview.current.toFixed(2)}
            </span>
            <span
              className={`text-sm ${
                preview.percent >= 0
                  ? "text-[var(--color-up)]"
                  : "text-[var(--color-down)]"
              }`}
            >
              {preview.percent >= 0 ? "+" : ""}
              {preview.percent.toFixed(2)}%
            </span>
          </div>
          <button
            onClick={handleSubscribe}
            disabled={isSubscribed(preview.symbol) || subscribing}
            className={`w-full py-1.5 text-sm rounded transition ${
              isSubscribed(preview.symbol)
                ? "bg-white/10 text-[var(--color-muted)] cursor-default"
                : "bg-[var(--color-accent)] text-white hover:brightness-110"
            }`}
          >
            {isSubscribed(preview.symbol)
              ? "已订阅"
              : subscribing
                ? "订阅中..."
                : "订阅"}
          </button>
        </div>
      )}
    </div>
  );
}
