"use client";

import { useState, useMemo } from "react";
import { useCalendar } from "@/hooks/useNewsData";
import type { CalendarEvent } from "@/lib/types";

export default function EconomicCalendar() {
  const { data } = useCalendar();
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const dates = useMemo(() => {
    if (!data?.ok || !data.dates) return [];
    return Object.keys(data.dates).sort();
  }, [data]);

  // Set initial active date
  const selectedDate = activeDate && dates.includes(activeDate) ? activeDate : dates[0];

  if (!dates.length) return null;

  const today = new Date().toISOString().slice(0, 10);

  const events: CalendarEvent[] = data?.dates?.[selectedDate] || [];
  const sortedEvents = [...events].sort(
    (a, b) => (b.importance || 0) - (a.importance || 0),
  );

  return (
    <section className="mt-3.5 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-[var(--color-line)]
          px-4 py-3.5 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-2"
      >
        <h2 className="m-0 font-[var(--font-inter),'Noto_Sans_SC',sans-serif] text-base">
          经济日历
        </h2>
        <div className="flex gap-1">
          {dates.map((dt) => {
            const label = dt === today ? "今天" : dt.slice(5).replace("-", "/");
            return (
              <button
                key={dt}
                type="button"
                onClick={() => setActiveDate(dt)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-all
                  ${
                    dt === selectedDate
                      ? "border-[var(--color-accent)] bg-[rgba(247,147,26,0.15)] font-bold text-[var(--color-accent)]"
                      : "border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--foreground)]"
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events list */}
      <div className="max-h-80 overflow-y-auto">
        {!sortedEvents.length ? (
          <div className="py-6 text-center text-[var(--color-muted)]">
            暂无经济事件
          </div>
        ) : (
          sortedEvents.map((e, i) => {
            const stars =
              "★".repeat(e.importance || 1) +
              "☆".repeat(3 - (e.importance || 1));
            const impClass =
              e.importance >= 3
                ? "bg-[rgba(255,23,68,0.06)]"
                : e.importance >= 2
                  ? "bg-[rgba(247,147,26,0.04)]"
                  : "";

            return (
              <div
                key={`${e.time}-${e.indicator}-${i}`}
                className={`flex flex-wrap items-center gap-2 border-t border-white/[0.04]
                  px-4 py-2 text-[13px] first:border-t-0 max-[760px]:text-xs ${impClass}`}
              >
                <span className="min-w-[42px] font-[var(--font-inter),monospace] text-xs text-[var(--color-muted)]">
                  {e.time || "--:--"}
                </span>
                <span className="min-w-[50px] text-xs font-semibold">
                  {e.country}
                </span>
                <span className="min-w-[36px] text-[11px] text-[var(--color-accent)]">
                  {stars}
                </span>
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {e.indicator}
                </span>
                <span className="ml-auto flex gap-2 text-[11px] text-[var(--color-muted)] max-[760px]:flex-wrap">
                  {e.previous && <span>前 {e.previous}</span>}
                  {e.forecast && <span>预 {e.forecast}</span>}
                  {e.actual && (
                    <span className="font-semibold text-[var(--color-accent)]">
                      实 {e.actual}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
