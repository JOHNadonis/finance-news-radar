import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  themeColor: "#0f1419",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${inter.variable} ${notoSansSC.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
