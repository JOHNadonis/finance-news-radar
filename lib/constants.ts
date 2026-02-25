// ── Market labels (Chinese) ──
export const MARKET_LABELS: Record<string, string> = {
  a_stock: "A股",
  us_stock: "美股",
  hk_stock: "港股",
  macro: "宏观",
  crypto: "加密",
  commodity: "大宗",
  forex: "外汇",
  general: "综合",
};

// ── Theme colors (matching existing CSS variables) ──
export const COLORS = {
  bg: "#0f1419",
  panel: "rgba(22, 33, 46, 0.85)",
  ink: "#e7e9ea",
  muted: "#71767b",
  line: "rgba(255, 255, 255, 0.1)",
  accent: "#f7931a",
  accent2: "#1d9bf0",
  up: "#00c853",
  down: "#ff1744",
} as const;

// ── Refresh intervals (ms) ──
export const REFRESH_NEWS = 5 * 60 * 1000;     // 5 minutes
export const REFRESH_DASHBOARD = 15 * 60 * 1000; // 15 minutes
export const REFRESH_QUOTES_REST = 30 * 1000;    // 30 seconds (fallback)

// ── Sentiment rating labels ──
export const RATING_LABELS: Record<string, string> = {
  "extreme fear": "极度恐惧",
  "fear": "恐惧",
  "neutral": "中性",
  "greed": "贪婪",
  "extreme greed": "极度贪婪",
  "Extreme Fear": "极度恐惧",
  "Fear": "恐惧",
  "Neutral": "中性",
  "Greed": "贪婪",
  "Extreme Greed": "极度贪婪",
};
