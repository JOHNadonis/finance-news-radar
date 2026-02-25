"use client";

import { useState } from "react";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { TickerSearch } from "./TickerSearch";
import type { SubscriptionType } from "@/lib/types";

const TYPE_LABELS: Record<SubscriptionType, string> = {
  ticker: "股票/指数",
  market: "市场",
  keyword: "关键词",
};

const QUICK_ADD: { type: SubscriptionType; value: string; label: string }[] = [
  { type: "ticker", value: "SH000300", label: "沪深300" },
  { type: "ticker", value: "SH000001", label: "上证指数" },
  { type: "ticker", value: "AAPL", label: "AAPL" },
  { type: "ticker", value: "BTCUSD", label: "BTC" },
];

interface SubscriptionManagerProps {
  open: boolean;
  onClose: () => void;
}

export function SubscriptionManager({ open, onClose }: SubscriptionManagerProps) {
  const {
    subscriptions,
    loading,
    addSubscription,
    removeSubscription,
    isSubscribed,
  } = useSubscriptions();

  const [tab, setTab] = useState<"list" | "add">("list");
  const [addType, setAddType] = useState<SubscriptionType>("ticker");
  const [addValue, setAddValue] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const grouped = {
    ticker: subscriptions.filter((s) => s.type === "ticker"),
    market: subscriptions.filter((s) => s.type === "market"),
    keyword: subscriptions.filter((s) => s.type === "keyword"),
  };

  async function handleAdd() {
    if (!addValue.trim()) return;
    setSubmitting(true);
    await addSubscription(addType, addValue.trim(), addDisplayName || undefined);
    setAddValue("");
    setAddDisplayName("");
    setSubmitting(false);
  }

  async function handleQuickAdd(
    type: SubscriptionType,
    value: string,
    label: string
  ) {
    if (isSubscribed(type, value)) return;
    await addSubscription(type, value, label);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg mx-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            订阅管理
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-line)]">
          <button
            onClick={() => setTab("list")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "list"
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            }`}
          >
            我的订阅 ({subscriptions.length})
          </button>
          <button
            onClick={() => setTab("add")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "add"
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            }`}
          >
            添加订阅
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {tab === "list" && (
            <>
              {loading ? (
                <p className="text-[var(--color-muted)] text-sm text-center py-8">
                  加载中...
                </p>
              ) : subscriptions.length === 0 ? (
                <p className="text-[var(--color-muted)] text-sm text-center py-8">
                  暂无订阅，点击「添加订阅」开始
                </p>
              ) : (
                Object.entries(grouped).map(
                  ([type, items]) =>
                    items.length > 0 && (
                      <div key={type} className="mb-4">
                        <h3 className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-2">
                          {TYPE_LABELS[type as SubscriptionType]}
                        </h3>
                        <div className="space-y-1.5">
                          {items.map((sub) => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between py-2 px-3 rounded bg-white/5"
                            >
                              <div>
                                <span className="text-sm text-[var(--color-foreground)]">
                                  {sub.display_name || sub.value}
                                </span>
                                {sub.display_name && (
                                  <span className="ml-2 text-xs text-[var(--color-muted)]">
                                    {sub.value}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => removeSubscription(sub.id)}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                )
              )}
            </>
          )}

          {tab === "add" && (
            <div className="space-y-4">
              {/* Quick add */}
              <div>
                <h3 className="text-xs font-medium text-[var(--color-muted)] mb-2">
                  快速添加
                </h3>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ADD.map((q) => (
                    <button
                      key={q.value}
                      onClick={() => handleQuickAdd(q.type, q.value, q.label)}
                      disabled={isSubscribed(q.type, q.value)}
                      className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                        isSubscribed(q.type, q.value)
                          ? "border-[var(--color-line)] text-[var(--color-muted)] cursor-default opacity-50"
                          : "border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white cursor-pointer"
                      }`}
                    >
                      {q.label}
                      {isSubscribed(q.type, q.value) ? " ✓" : " +"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ticker search */}
              <div>
                <h3 className="text-xs font-medium text-[var(--color-muted)] mb-2">
                  搜索股票
                </h3>
                <TickerSearch
                  onSubscribe={async (symbol, name) => {
                    await addSubscription("ticker", symbol, name);
                  }}
                  isSubscribed={(symbol) => isSubscribed("ticker", symbol)}
                />
              </div>

              {/* Manual add */}
              <div>
                <h3 className="text-xs font-medium text-[var(--color-muted)] mb-2">
                  手动添加
                </h3>
                <div className="flex gap-2 mb-2">
                  {(Object.keys(TYPE_LABELS) as SubscriptionType[]).map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => setAddType(t)}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          addType === t
                            ? "bg-[var(--color-accent)] text-white"
                            : "bg-white/5 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                        }`}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    )
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    placeholder={
                      addType === "ticker"
                        ? "代码，如 SH600519"
                        : addType === "market"
                          ? "市场，如 a_stock"
                          : "关键词"
                    }
                    className="flex-1 px-3 py-2 text-sm rounded border border-[var(--color-line)] bg-white/5 text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                    }}
                  />
                  <input
                    type="text"
                    value={addDisplayName}
                    onChange={(e) => setAddDisplayName(e.target.value)}
                    placeholder="显示名 (可选)"
                    className="w-28 px-3 py-2 text-sm rounded border border-[var(--color-line)] bg-white/5 text-[var(--color-foreground)] placeholder-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    onClick={handleAdd}
                    disabled={!addValue.trim() || submitting}
                    className="px-4 py-2 text-sm rounded bg-[var(--color-accent)] text-white disabled:opacity-40 hover:brightness-110 transition"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
