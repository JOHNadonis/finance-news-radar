"use client";

import { fmtTime } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/constants";
import type { NewsItem } from "@/lib/types";

interface NewsCardProps {
  item: NewsItem;
}

export default function NewsCard({ item }: NewsCardProps) {
  const importance = item.importance || "normal";
  const zh = (item.title_zh || "").trim();
  const en = (item.title_en || "").trim();
  const hasBilingual = zh && en && zh !== en;

  return (
    <article
      className="border-t border-[rgba(22,16,13,0.08)] px-4 py-3.5 first:border-t-0
        animate-[fade-up_250ms_ease]"
    >
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
        {importance !== "normal" && (
          <span
            className={`rounded px-1.5 py-[1px] text-[10px] font-bold tracking-[0.05em]
              ${
                importance === "high"
                  ? "border border-[rgba(255,23,68,0.3)] bg-[rgba(255,23,68,0.15)] text-[var(--color-down)]"
                  : "border border-[rgba(217,72,37,0.3)] bg-[rgba(217,72,37,0.15)] text-[var(--color-accent)]"
              }`}
          >
            {importance === "high" ? "重要" : "关注"}
          </span>
        )}
        <span className="font-semibold text-[var(--color-accent)]">
          {item.site_name}
        </span>
        <span className="rounded-full border border-[var(--color-line)] px-[7px] py-[1px] text-[11px]">
          {item.source}
        </span>
        {/* Market tags */}
        <span className="flex gap-[3px]">
          {(item.market_tags || [])
            .filter((t) => t !== "general")
            .map((t) => (
              <span
                key={t}
                className="rounded bg-[rgba(15,111,127,0.12)] px-[5px] py-[1px]
                  text-[10px] font-semibold text-[var(--color-accent-2)]"
              >
                {MARKET_LABELS[t] || t}
              </span>
            ))}
        </span>
        <time className="ml-auto max-[760px]:ml-0">
          {fmtTime(item.published_at || item.first_seen_at)}
        </time>
      </div>

      {/* Title */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex flex-col gap-0.5 text-[15px] leading-[1.4]
          text-[var(--foreground)] no-underline hover:text-[var(--color-accent)]"
      >
        {hasBilingual ? (
          <>
            <span>{zh}</span>
            <span className="text-xs leading-[1.35] text-[var(--color-muted)]">
              {en}
            </span>
          </>
        ) : (
          <span>{item.title || zh || en}</span>
        )}
      </a>
    </article>
  );
}
