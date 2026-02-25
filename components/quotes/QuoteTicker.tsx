"use client";

import { useRef, useEffect, useState } from "react";
import type { QuoteData } from "@/lib/types";

interface Props {
  quotes: Map<string, QuoteData>;
}

export default function QuoteTicker({ quotes }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [flashTicker, setFlashTicker] = useState<string | null>(null);
  const prevPrices = useRef<Map<string, number>>(new Map());

  // Detect price changes for flash animation
  useEffect(() => {
    for (const [ticker, q] of quotes) {
      const prev = prevPrices.current.get(ticker);
      if (prev !== undefined && prev !== q.price) {
        setFlashTicker(ticker);
        const timer = setTimeout(() => setFlashTicker(null), 600);
        prevPrices.current.set(ticker, q.price);
        return () => clearTimeout(timer);
      }
      prevPrices.current.set(ticker, q.price);
    }
  }, [quotes]);

  // Auto-scroll animation
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame: number;
    let paused = false;

    const scroll = () => {
      if (!paused && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += 0.5;
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth) {
          el.scrollLeft = 0;
        }
      }
      frame = requestAnimationFrame(scroll);
    };

    frame = requestAnimationFrame(scroll);
    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
  }, []);

  const items = [...quotes.values()];
  if (items.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-5 overflow-hidden whitespace-nowrap
        rounded-[var(--radius-panel)] border border-[var(--color-line)]
        bg-white/[0.03] px-3 py-2"
    >
      {items.map((q) => {
        const isUp = q.change >= 0;
        const color = isUp ? "var(--color-up)" : "var(--color-down)";
        const isFlashing = flashTicker === q.ticker;

        return (
          <span
            key={q.ticker}
            className="inline-flex items-center gap-1.5 text-sm transition-colors"
            style={{
              color,
              animation: isFlashing ? "ticker-flash 0.6s ease-out" : undefined,
            }}
          >
            <span className="font-medium text-[var(--foreground)]">
              {q.name ?? q.ticker}
            </span>
            <span className="font-mono font-semibold">{q.price.toFixed(2)}</span>
            <span className="font-mono text-xs">
              {isUp ? "+" : ""}
              {q.changePercent.toFixed(2)}%
            </span>
          </span>
        );
      })}

    </div>
  );
}
