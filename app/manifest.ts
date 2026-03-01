import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance Signal Board — 金融信息雷达",
    short_name: "FinRadar",
    description: "24小时全球金融信息聚合雷达 — 实时行情、新闻、经济日历",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f3ef",
    theme_color: "#d94825",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
