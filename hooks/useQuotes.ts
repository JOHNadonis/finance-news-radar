"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { REFRESH_QUOTES_REST } from "@/lib/constants";
import type { QuoteData } from "@/lib/types";

export function useQuotes(tickers: string[]) {
  const { subscribe, unsubscribe, onQuote, connected } = useWebSocket();
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickersRef = useRef(tickers);
  tickersRef.current = tickers;

  // Update a single quote
  const updateQuote = useCallback((ticker: string, data: QuoteData) => {
    setQuotes((prev) => {
      const next = new Map(prev);
      next.set(ticker, data);
      return next;
    });
  }, []);

  // REST fallback fetch
  const fetchRest = useCallback(async () => {
    const t = tickersRef.current;
    if (t.length === 0) return;
    try {
      const resp = await fetch(`/api/quotes?tickers=${encodeURIComponent(t.join(","))}`);
      if (!resp.ok) return;
      const data: QuoteData[] = await resp.json();
      setQuotes((prev) => {
        const next = new Map(prev);
        for (const q of data) next.set(q.ticker, q);
        return next;
      });
    } catch { /* silently fail */ }
  }, []);

  // WebSocket subscription
  useEffect(() => {
    if (tickers.length === 0) return;

    if (connected) {
      subscribe(tickers);
    }

    return () => {
      if (connected) {
        unsubscribe(tickers);
      }
    };
  }, [tickers, connected, subscribe, unsubscribe]);

  // Listen for WS quote updates
  useEffect(() => {
    return onQuote((ticker, data) => {
      if (tickersRef.current.includes(ticker)) {
        updateQuote(ticker, data);
      }
    });
  }, [onQuote, updateQuote]);

  // REST fallback when WS is not connected
  useEffect(() => {
    if (connected) {
      // WS is connected, stop REST polling
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
      }
      return;
    }

    // No WS — poll REST
    fetchRest();
    restTimerRef.current = setInterval(fetchRest, REFRESH_QUOTES_REST);
    return () => {
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
      }
    };
  }, [connected, fetchRest]);

  return quotes;
}
