// ── Shared TypeScript interfaces ──
// Mirrors the JSON schema from scripts/update_finance.py

export interface NewsItem {
  id: string;
  site_id: string;
  site_name: string;
  source: string;
  title: string;
  title_original?: string;
  title_zh: string | null;
  title_en: string | null;
  title_bilingual?: string;
  url: string;
  published_at: string;
  first_seen_at: string;
  last_seen_at?: string;
  market_tags: string[];
  importance: "high" | "medium" | "normal";
  meta?: Record<string, unknown>;
}

export interface SiteStat {
  site_id: string;
  site_name: string;
  count: number;
  raw_count: number;
}

export interface NewsPayload {
  generated_at: string;
  total_items: number;
  total_items_raw: number;
  total_items_all_mode: number;
  site_count: number;
  source_count: number;
  archive_total: number;
  window_hours: number;
  items_finance: NewsItem[];
  items_all: NewsItem[];
  items_all_raw: NewsItem[];
  items: NewsItem[];
  site_stats: SiteStat[];
}

// ── Sentiment ──

export interface SentimentData {
  generated_at: string;
  cnn_fear_greed: {
    score: number;
    rating: string;
    previous_close: number | null;
    previous_1_week: number | null;
    previous_1_month: number | null;
    ok: boolean;
    error: string | null;
  };
  crypto_fear_greed: {
    value: number;
    classification: string;
    ok: boolean;
    error: string | null;
  };
  vix: {
    value: number | null;
    previous_close: number | null;
    change: number | null;
    ok: boolean;
    error: string | null;
  };
}

// ── Economic Calendar ──

export interface CalendarEvent {
  time: string;
  country: string;
  indicator: string;
  importance: number; // 1-3
  previous: string;
  forecast: string;
  actual: string;
  unit?: string;
}

export interface CalendarData {
  generated_at: string;
  ok: boolean;
  error: string | null;
  source: string;
  event_count: number;
  high_importance_count: number;
  dates: Record<string, CalendarEvent[]>;
}

// ── Market Summary ──

export interface MarketSection {
  total: number;
  high_importance: number;
  top_headlines: string[];
  sources?: string[];
}

export interface SummaryData {
  generated_at?: string;
  ok: boolean;
  type: "rule_based" | "llm";
  text: string;
  total_items: number;
  high_importance_items: number;
  sections: Record<string, MarketSection>;
}

// ── Quotes (real-time) ──

export interface QuoteData {
  ticker: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  timestamp: number;
  source: "sina" | "yahoo" | "binance" | "xueqiu";
}

// ── Subscriptions ──

export type SubscriptionType = "ticker" | "market" | "keyword";

export interface Subscription {
  id: number;
  user_token: string;
  type: SubscriptionType;
  value: string;
  display_name: string | null;
  created_at: string;
}

// ── Xueqiu ──

export interface XueqiuQuote {
  symbol: string;
  name: string;
  current: number;
  change: number;
  percent: number;
  volume: number;
  amount: number;
  turnover_rate?: number;
  pe_ttm?: number;
  market_capital?: number;
  timestamp: number;
}

export interface XueqiuTopic {
  id: string;
  title: string;
  description: string;
  reply_count: number;
  retweet_count: number;
  created_at: number;
}

// ── Policy Analysis ──

export interface PolicyAnalysisData {
  generated_at: string;
  ok: boolean;
  error: string | null;
  type: "llm";
  text: string;
  model: string;
  input_items: number;
  suggested_questions: string[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMSettingsPublic {
  api_base_url: string;
  api_key_masked: string;
  model_name: string;
  configured: boolean;
}

// ── Model Groups & Access Keys ──

export interface ModelGroup {
  id: number;
  name: string;
  api_base_url: string;
  api_key: string;
  model_name: string;
  is_default: number;
  created_at: string;
}

export interface AccessKey {
  id: number;
  key_value: string;
  label: string | null;
  model_group_id: number;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
}

export interface AccessKeyWithGroup extends AccessKey {
  group_name: string;
  model_name: string;
}
