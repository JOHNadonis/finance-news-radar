import { EventEmitter } from "events";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "path";
import type { QuoteData } from "./types";

const CACHE_PATH = join(process.cwd(), "data", "quotes-cache.json");

// Polling intervals (ms)
const SINA_INTERVAL = 5_000;
const YAHOO_INTERVAL = 15_000;
const CACHE_WRITE_INTERVAL = 10_000;

// ── Ticker routing ──

type TickerSource = "sina" | "yahoo" | "binance";

function classifyTicker(ticker: string): TickerSource {
  const t = ticker.toLowerCase();
  // A-shares: sh/sz/bj + 6 digits
  if (/^(sh|sz|bj)\d{6}$/.test(t)) return "sina";
  // HK stocks: 5 digits + .hk (e.g. 00700.hk → hk00700 for sina)
  if (/^\d{5}\.hk$/i.test(ticker)) return "sina";
  // Crypto: ends with usdt/btc/eth
  if (/usdt$|btc$|eth$/i.test(t)) return "binance";
  // Everything else → yahoo
  return "yahoo";
}

/** Convert user ticker to Sina format */
function toSinaTicker(ticker: string): string {
  // Already in sina format
  if (/^(sh|sz|bj)\d{6}$/.test(ticker.toLowerCase())) return ticker.toLowerCase();
  // HK: 00700.hk → hk00700
  const hkMatch = ticker.match(/^(\d{5})\.hk$/i);
  if (hkMatch) return `hk${hkMatch[1]}`;
  return ticker.toLowerCase();
}

/** Convert user ticker to Binance stream format */
function toBinanceStream(ticker: string): string {
  return `${ticker.toLowerCase()}@ticker`;
}

// ── Parsers ──

function parseSinaResponse(text: string, originalTickers: string[]): QuoteData[] {
  const results: QuoteData[] = [];
  const lines = text.split("\n").filter(Boolean);

  for (const line of lines) {
    // var hq_str_sh600519="贵州茅台,1800.00,...";
    const match = line.match(/hq_str_(\w+)="(.*)"/);
    if (!match || !match[2]) continue;
    const sinaTicker = match[1];
    const fields = match[2].split(",");

    // Find original ticker for this sina ticker
    const orig = originalTickers.find((t) => toSinaTicker(t) === sinaTicker) ?? sinaTicker;

    if (sinaTicker.startsWith("hk")) {
      // HK stock format: name, open, prevClose, high, low, current, change, changePercent, ..., volume, amount
      if (fields.length < 9) continue;
      results.push({
        ticker: orig,
        name: fields[1] || fields[0],
        price: parseFloat(fields[6]) || 0,
        change: parseFloat(fields[7]) || 0,
        changePercent: parseFloat(fields[8]) || 0,
        open: parseFloat(fields[2]) || undefined,
        previousClose: parseFloat(fields[3]) || undefined,
        high: parseFloat(fields[4]) || undefined,
        low: parseFloat(fields[5]) || undefined,
        volume: parseInt(fields[12], 10) || undefined,
        timestamp: Date.now(),
        source: "sina",
      });
    } else {
      // A-share format: name, open, prevClose, current, high, low, ..., volume, amount, ...
      if (fields.length < 9) continue;
      const currentPrice = parseFloat(fields[3]);
      const prevClose = parseFloat(fields[2]);
      const change = currentPrice - prevClose;
      const changePercent = prevClose ? (change / prevClose) * 100 : 0;
      results.push({
        ticker: orig,
        name: fields[0],
        price: currentPrice,
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        open: parseFloat(fields[1]) || undefined,
        previousClose: prevClose || undefined,
        high: parseFloat(fields[4]) || undefined,
        low: parseFloat(fields[5]) || undefined,
        volume: parseInt(fields[8], 10) || undefined,
        timestamp: Date.now(),
        source: "sina",
      });
    }
  }
  return results;
}

function parseYahooResponse(json: Record<string, unknown>, ticker: string): QuoteData | null {
  try {
    const chart = json.chart as { result?: Array<{ meta?: Record<string, unknown> }> };
    const meta = chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = (meta.regularMarketPrice as number) ?? 0;
    const prevClose = (meta.chartPreviousClose as number) ?? (meta.previousClose as number) ?? 0;
    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    return {
      ticker,
      name: (meta.shortName as string) ?? (meta.symbol as string) ?? ticker,
      price,
      change: parseFloat(change.toFixed(4)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      high: (meta.regularMarketDayHigh as number) ?? undefined,
      low: (meta.regularMarketDayLow as number) ?? undefined,
      open: (meta.regularMarketOpen as number) ?? undefined,
      previousClose: prevClose || undefined,
      volume: (meta.regularMarketVolume as number) ?? undefined,
      timestamp: Date.now(),
      source: "yahoo",
    };
  } catch {
    return null;
  }
}

function parseBinanceTicker(data: Record<string, string>, ticker: string): QuoteData {
  const price = parseFloat(data.c);
  const open = parseFloat(data.o);
  const change = price - open;
  const changePercent = parseFloat(data.P);

  return {
    ticker,
    name: data.s ?? ticker.toUpperCase(),
    price,
    change: parseFloat(change.toFixed(4)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    high: parseFloat(data.h) || undefined,
    low: parseFloat(data.l) || undefined,
    open: open || undefined,
    volume: parseFloat(data.v) || undefined,
    timestamp: Date.now(),
    source: "binance",
  };
}

// ── QuotesProvider ──

export class QuotesProvider extends EventEmitter {
  private tracked = new Map<TickerSource, Set<string>>();
  private cache = new Map<string, QuoteData>();
  private sinaTimer: ReturnType<typeof setInterval> | null = null;
  private yahooTimer: ReturnType<typeof setInterval> | null = null;
  private cacheTimer: ReturnType<typeof setInterval> | null = null;
  private binanceWs: InstanceType<typeof import("ws").default> | null = null;
  private binanceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor() {
    super();
    this.tracked.set("sina", new Set());
    this.tracked.set("yahoo", new Set());
    this.tracked.set("binance", new Set());
  }

  /** Add a ticker to the tracking set */
  ensureTracking(ticker: string): void {
    const source = classifyTicker(ticker);
    const set = this.tracked.get(source)!;
    if (set.has(ticker)) return;
    set.add(ticker);

    // If binance, subscribe the new ticker on the existing WS
    if (source === "binance" && this.binanceWs?.readyState === 1) {
      this.binanceSubscribe([ticker]);
    }
  }

  /** Get current cached quote */
  getQuote(ticker: string): QuoteData | undefined {
    return this.cache.get(ticker);
  }

  /** Get all cached quotes */
  getAllQuotes(): Map<string, QuoteData> {
    return new Map(this.cache);
  }

  /** Start all polling loops and Binance WS */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Ensure data directory (async, non-blocking)
    const dataDir = join(process.cwd(), "data");
    if (!existsSync(dataDir)) {
      mkdir(dataDir, { recursive: true }).catch(() => {});
    }

    // Start polling loops
    this.pollSina();
    this.sinaTimer = setInterval(() => this.pollSina(), SINA_INTERVAL);

    this.pollYahoo();
    this.yahooTimer = setInterval(() => this.pollYahoo(), YAHOO_INTERVAL);

    // Start Binance WS
    this.connectBinance();

    // Periodically write cache to disk for REST fallback
    this.writeCacheToDisk();
    this.cacheTimer = setInterval(() => this.writeCacheToDisk(), CACHE_WRITE_INTERVAL);

    console.log("[QuotesProvider] started");
  }

  /** Stop all polling and connections */
  stop(): void {
    if (this.sinaTimer) clearInterval(this.sinaTimer);
    if (this.yahooTimer) clearInterval(this.yahooTimer);
    if (this.cacheTimer) clearInterval(this.cacheTimer);
    if (this.binanceReconnectTimer) clearTimeout(this.binanceReconnectTimer);
    if (this.binanceWs) {
      this.binanceWs.close();
      this.binanceWs = null;
    }
    this.started = false;
    console.log("[QuotesProvider] stopped");
  }

  // ── Sina polling ──

  private async pollSina(): Promise<void> {
    const tickers = [...this.tracked.get("sina")!];
    if (tickers.length === 0) return;

    const sinaTickers = tickers.map(toSinaTicker).join(",");
    const url = `https://hq.sinajs.cn/list=${sinaTickers}`;

    try {
      const resp = await fetch(url, {
        headers: {
          Referer: "https://finance.sina.com.cn",
          "User-Agent": "Mozilla/5.0",
        },
      });
      const text = await resp.text();
      const quotes = parseSinaResponse(text, tickers);
      for (const q of quotes) {
        this.cache.set(q.ticker, q);
        this.emit("quote", q.ticker, q);
      }
    } catch (err) {
      console.error("[QuotesProvider] Sina poll error:", (err as Error).message);
    }
  }

  // ── Yahoo polling ──

  private async pollYahoo(): Promise<void> {
    const tickers = [...this.tracked.get("yahoo")!];
    if (tickers.length === 0) return;

    // Fetch each ticker individually (Yahoo v8 doesn't support batch well)
    const promises = tickers.map(async (ticker) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`;
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!resp.ok) return;
        const json = await resp.json();
        const quote = parseYahooResponse(json as Record<string, unknown>, ticker);
        if (quote) {
          this.cache.set(ticker, quote);
          this.emit("quote", ticker, quote);
        }
      } catch (err) {
        console.error(`[QuotesProvider] Yahoo error for ${ticker}:`, (err as Error).message);
      }
    });

    await Promise.allSettled(promises);
  }

  // ── Binance WebSocket ──

  private async connectBinance(): Promise<void> {
    const tickers = [...this.tracked.get("binance")!];
    // Dynamic import ws for server-side only
    let WebSocket: typeof import("ws").default;
    try {
      WebSocket = (await import("ws")).default;
    } catch {
      console.error("[QuotesProvider] ws module not available, Binance disabled");
      return;
    }

    const streams = tickers.map(toBinanceStream).join("/");
    const url = tickers.length > 0
      ? `wss://stream.binance.com:9443/stream?streams=${streams}`
      : `wss://stream.binance.com:9443/ws/btcusdt@ticker`; // dummy, will subscribe later

    try {
      this.binanceWs = new WebSocket(url);

      this.binanceWs.on("open", () => {
        console.log("[QuotesProvider] Binance WS connected");
      });

      this.binanceWs.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          const data = msg.data ?? msg;
          if (data.e === "24hrTicker") {
            // Find original ticker
            const symbol = (data.s as string).toLowerCase();
            const orig = [...this.tracked.get("binance")!].find(
              (t) => t.toLowerCase() === symbol
            ) ?? symbol;
            const quote = parseBinanceTicker(data, orig);
            this.cache.set(orig, quote);
            this.emit("quote", orig, quote);
          }
        } catch { /* ignore parse errors */ }
      });

      this.binanceWs.on("close", () => {
        if (!this.started) return; // Don't reconnect after stop()
        console.log("[QuotesProvider] Binance WS closed, reconnecting...");
        this.binanceReconnectTimer = setTimeout(() => {
          if (this.started) this.connectBinance();
        }, 5000);
      });

      this.binanceWs.on("error", (err: Error) => {
        console.error("[QuotesProvider] Binance WS error:", err.message);
      });

      // Ping every 30s to keep alive
      const pingInterval = setInterval(() => {
        if (this.binanceWs?.readyState === 1) {
          this.binanceWs.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30_000);
    } catch (err) {
      console.error("[QuotesProvider] Binance connect error:", (err as Error).message);
    }
  }

  private binanceSubscribe(tickers: string[]): void {
    if (!this.binanceWs || this.binanceWs.readyState !== 1) return;
    const params = tickers.map(toBinanceStream);
    this.binanceWs.send(JSON.stringify({
      method: "SUBSCRIBE",
      params,
      id: Date.now(),
    }));
  }

  // ── Cache persistence ──

  private async writeCacheToDisk(): Promise<void> {
    try {
      const obj: Record<string, QuoteData> = {};
      for (const [k, v] of this.cache) {
        obj[k] = v;
      }
      await writeFile(CACHE_PATH, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      console.error("[QuotesProvider] cache write error:", (err as Error).message);
    }
  }
}

// Singleton instance
let _instance: QuotesProvider | null = null;
export function getQuotesProvider(): QuotesProvider {
  if (!_instance) {
    _instance = new QuotesProvider();
  }
  return _instance;
}
