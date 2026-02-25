"use client";

interface HeaderProps {
  children?: React.ReactNode;
}

export default function Header({ children }: HeaderProps) {
  return (
    <header
      className="rounded-[20px] border border-[var(--color-line)] p-6
        shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        max-[760px]:rounded-2xl max-[760px]:p-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(22, 33, 46, 0.9), rgba(15, 20, 25, 0.95))",
      }}
    >
      <div className="flex items-center gap-3.5">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]
            font-[var(--font-inter),Inter,sans-serif] text-[28px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, var(--color-accent), #e67e22)",
          }}
        >
          F
        </div>
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[0.2em] text-[var(--color-accent)]">
            FINANCE INTELLIGENCE
          </p>
          <h1
            className="m-0 mt-1.5 font-[var(--font-inter),'Noto_Sans_SC',sans-serif]
              text-[clamp(24px,3.5vw,40px)] leading-[1.1] text-[var(--foreground)]"
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
