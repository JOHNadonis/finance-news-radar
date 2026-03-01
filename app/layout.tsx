import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-noto-sc",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finance Signal Board",
  description:
    "聚合全球金融快讯、深度文章、加密货币动态，自动采集 & 过滤，每 15 分钟更新。",
};

export const viewport: Viewport = {
  themeColor: "#f4f3ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${bricolage.variable} ${notoSansSC.variable} min-h-screen antialiased`}
      >
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />
        <div className="relative z-[1]">{children}</div>
      </body>
    </html>
  );
}
