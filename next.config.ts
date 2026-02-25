import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  fallbacks: {
    document: "/offline.html",
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /^\/api\/news/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "news-data",
          expiration: { maxAgeSeconds: 300 },
        },
      },
      {
        urlPattern: /^\/api\/(sentiment|calendar|summary)/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "dashboard-data",
          expiration: { maxAgeSeconds: 900 },
        },
      },
      {
        urlPattern: /^\/api\/quotes/,
        handler: "NetworkFirst",
        options: {
          cacheName: "quotes-cache",
          expiration: { maxAgeSeconds: 60 },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = withPWA({
  turbopack: {},
});

export default nextConfig;
