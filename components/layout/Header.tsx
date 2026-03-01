"use client";

interface HeaderProps {
  children?: React.ReactNode;
}

export default function Header({ children }: HeaderProps) {
  return (
    <header
      className="rounded-[28px] border border-[var(--color-line)] p-6
        shadow-[0_24px_55px_rgba(21,16,12,0.09),inset_0_1px_0_rgba(255,255,255,0.9)]
        max-[760px]:rounded-2xl max-[760px]:p-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 246, 237, 0.72))",
      }}
    >
      <div className="flex items-center gap-3.5">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]
            bg-[rgba(255,255,255,0.85)] font-[var(--font-heading),'Bricolage_Grotesque',sans-serif] text-[28px] font-bold text-[var(--color-accent)]"
        >
          F
        </div>
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[0.2em] text-[var(--color-muted)]">
            FINANCE INTELLIGENCE
          </p>
          <h1
            className="m-0 mt-1.5 font-[var(--font-heading),'Bricolage_Grotesque','Noto_Sans_SC',sans-serif]
              text-[clamp(28px,4vw,48px)] leading-[1.1] text-[var(--foreground)]"
          >
            24 小时金融信息雷达
          </h1>
        </div>
      </div>
      <p className="mt-2.5 text-sm text-[var(--color-muted)]">
        聚合全球金融快讯、深度文章、加密货币动态，自动采集 &amp; 过滤，每 15
        分钟更新。
      </p>
      {children}
    </header>
  );
}
