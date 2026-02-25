import type { Browser, BrowserContext, Page } from "playwright";
import type { XueqiuQuote, XueqiuTopic } from "./types";

// ── Cache entry ──

interface CacheEntry<T> {
  data: T;
  ts: number;
}

// ── Rate limiter ──

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.windowMs
    );
    return this.timestamps.length < this.maxRequests;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }
}

// ── Singleton scraper ──

class XueqiuScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private cookieRefreshedAt = 0;
  private initializing: Promise<void> | null = null;

  // Caches
  private quoteCache = new Map<string, CacheEntry<XueqiuQuote>>();
  private hotTopicsCache: CacheEntry<XueqiuTopic[]> | null = null;
  private batchQuoteCache = new Map<string, CacheEntry<XueqiuQuote>>();

  // TTLs
  private readonly QUOTE_TTL = 30_000; // 30 seconds
  private readonly HOT_TOPICS_TTL = 5 * 60_000; // 5 minutes

  // Rate limiting
  private rateLimiter = new RateLimiter(60, 60 * 60_000); // 60 req/hour
  private lastRequestPerSymbol = new Map<string, number>();
  private readonly PER_SYMBOL_COOLDOWN = 30_000; // 30s per symbol

  // ── Initialization ──

  private async init(): Promise<void> {
    if (this.browser) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this._doInit();
    await this.initializing;
    this.initializing = null;
  }

  private async _doInit(): Promise<void> {
    try {
      // Dynamic import so the module doesn't crash if playwright is missing
      const pw = await import("playwright");
      this.browser = await pw.chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        locale: "zh-CN",
      });

      await this.refreshCookie();
      console.log("[xueqiu-scraper] Browser initialized");
    } catch (err) {
      console.warn(
        "[xueqiu-scraper] Failed to init Playwright:",
        (err as Error).message
      );
      this.browser = null;
      this.context = null;
      throw err;
    }
  }

  // ── Cookie management ──

  private async refreshCookie(): Promise<void> {
    if (!this.context) return;
    const page = await this.context.newPage();
    try {
      await page.goto("https://xueqiu.com", {
        waitUntil: "networkidle",
        timeout: 15_000,
      });
      this.cookieRefreshedAt = Date.now();
      console.log("[xueqiu-scraper] Cookie refreshed");
    } finally {
      await page.close();
    }
  }

  private async ensureFreshCookie(): Promise<void> {
    const age = Date.now() - this.cookieRefreshedAt;
    if (age > 30 * 60_000) {
      await this.refreshCookie();
    }
  }

  // ── Helpers ──

  private async randomDelay(): Promise<void> {
    const ms = 2000 + Math.random() * 6000; // 2-8s
    await new Promise((r) => setTimeout(r, ms));
  }

  private isCacheFresh<T>(entry: CacheEntry<T> | null | undefined, ttl: number): boolean {
    return !!entry && Date.now() - entry.ts < ttl;
  }

  // ── Public methods ──

  async fetchQuote(symbol: string): Promise<XueqiuQuote | null> {
    // Check cache
    const cached = this.quoteCache.get(symbol);
    if (cached && this.isCacheFresh(cached, this.QUOTE_TTL)) {
      return cached.data;
    }

    // Per-symbol cooldown
    const lastReq = this.lastRequestPerSymbol.get(symbol) || 0;
    if (Date.now() - lastReq < this.PER_SYMBOL_COOLDOWN && cached) {
      return cached.data;
    }

    if (!this.rateLimiter.canProceed()) {
      console.warn("[xueqiu-scraper] Rate limit reached");
      return cached?.data ?? null;
    }

    try {
      await this.init();
      await this.ensureFreshCookie();
    } catch {
      return null;
    }

    if (!this.context) return null;

    const page = await this.context.newPage();
    try {
      await this.randomDelay();

      let quoteData: XueqiuQuote | null = null;

      // Wait for the quote XHR response instead of using a fixed timeout
      const quotePromise = page.waitForResponse(
        (resp) => resp.url().includes("/v5/stock/quote.json") && resp.status() === 200,
        { timeout: 10_000 }
      ).then(async (response) => {
        try {
          const json = await response.json();
          const q = json?.data?.quote;
          if (q) {
            quoteData = {
              symbol: q.symbol ?? symbol,
              name: q.name ?? "",
              current: q.current ?? 0,
              change: q.chg ?? 0,
              percent: q.percent ?? 0,
              volume: q.volume ?? 0,
              amount: q.amount ?? 0,
              turnover_rate: q.turnover_rate ?? undefined,
              pe_ttm: q.pe_ttm ?? undefined,
              market_capital: q.market_capital ?? undefined,
              timestamp: q.timestamp ?? Date.now(),
            };
          }
        } catch { /* ignore parse errors */ }
      }).catch(() => { /* timeout — no quote response intercepted */ });

      await page.goto(`https://xueqiu.com/S/${symbol}`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      await quotePromise;

      this.rateLimiter.record();
      this.lastRequestPerSymbol.set(symbol, Date.now());

      if (quoteData) {
        this.quoteCache.set(symbol, { data: quoteData, ts: Date.now() });
      }

      return quoteData;
    } catch (err) {
      console.warn(
        `[xueqiu-scraper] fetchQuote(${symbol}) failed:`,
        (err as Error).message
      );
      return cached?.data ?? null;
    } finally {
      await page.close();
    }
  }

  async fetchHotTopics(): Promise<XueqiuTopic[]> {
    // Check cache
    if (this.hotTopicsCache && this.isCacheFresh(this.hotTopicsCache, this.HOT_TOPICS_TTL)) {
      return this.hotTopicsCache.data;
    }

    if (!this.rateLimiter.canProceed()) {
      console.warn("[xueqiu-scraper] Rate limit reached");
      return this.hotTopicsCache?.data ?? [];
    }

    try {
      await this.init();
      await this.ensureFreshCookie();
    } catch {
      return [];
    }

    if (!this.context) return [];

    const page = await this.context.newPage();
    try {
      await this.randomDelay();

      let topics: XueqiuTopic[] = [];

      const hotPromise = page.waitForResponse(
        (resp) =>
          (resp.url().includes("/statuses/hot/listV2.json") ||
            resp.url().includes("/statuses/hot/list.json")) &&
          resp.status() === 200,
        { timeout: 10_000 }
      ).then(async (response) => {
        try {
          const json = await response.json();
          const items = json?.data?.items || json?.data?.list || [];
          topics = items.slice(0, 20).map((item: Record<string, unknown>) => {
            const original = (item.original_status || item) as Record<string, unknown>;
            return {
              id: String(original.id ?? item.id ?? ""),
              title: String(original.title ?? original.text ?? item.title ?? ""),
              description: String(
                original.description ?? original.text ?? ""
              ).slice(0, 200),
              reply_count: Number(original.reply_count ?? 0),
              retweet_count: Number(original.retweet_count ?? 0),
              created_at: Number(original.created_at ?? Date.now()),
            } satisfies XueqiuTopic;
          });
        } catch { /* ignore parse errors */ }
      }).catch(() => { /* timeout — no hot topics response */ });

      await page.goto("https://xueqiu.com", {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      await hotPromise;

      this.rateLimiter.record();

      if (topics.length > 0) {
        this.hotTopicsCache = { data: topics, ts: Date.now() };
      }

      return topics;
    } catch (err) {
      console.warn(
        "[xueqiu-scraper] fetchHotTopics failed:",
        (err as Error).message
      );
      return this.hotTopicsCache?.data ?? [];
    } finally {
      await page.close();
    }
  }

  async fetchBatchQuotes(
    symbols: string[]
  ): Promise<Map<string, XueqiuQuote>> {
    const result = new Map<string, XueqiuQuote>();

    // Return all from cache if fresh
    const allCached = symbols.every((s) =>
      this.isCacheFresh(this.batchQuoteCache.get(s), this.QUOTE_TTL)
    );
    if (allCached) {
      for (const s of symbols) {
        const entry = this.batchQuoteCache.get(s);
        if (entry) result.set(s, entry.data);
      }
      return result;
    }

    if (!this.rateLimiter.canProceed()) {
      // Return whatever we have cached
      for (const s of symbols) {
        const entry = this.batchQuoteCache.get(s) || this.quoteCache.get(s);
        if (entry) result.set(s, entry.data);
      }
      return result;
    }

    try {
      await this.init();
      await this.ensureFreshCookie();
    } catch {
      return result;
    }

    if (!this.context) return result;

    const page = await this.context.newPage();
    try {
      await this.randomDelay();

      const symbolStr = symbols.join(",");
      const apiUrl = `https://stock.xueqiu.com/v5/stock/batch/quote.json?symbol=${symbolStr}&extend=detail`;

      // Use page.evaluate to fetch with cookies
      const json = await page.evaluate(async (url: string) => {
        const resp = await fetch(url, { credentials: "include" });
        return resp.json();
      }, apiUrl);

      this.rateLimiter.record();

      const items = json?.data?.items || [];
      for (const item of items) {
        const q = item.quote;
        if (!q) continue;
        const quote: XueqiuQuote = {
          symbol: q.symbol ?? "",
          name: q.name ?? "",
          current: q.current ?? 0,
          change: q.chg ?? 0,
          percent: q.percent ?? 0,
          volume: q.volume ?? 0,
          amount: q.amount ?? 0,
          turnover_rate: q.turnover_rate ?? undefined,
          pe_ttm: q.pe_ttm ?? undefined,
          market_capital: q.market_capital ?? undefined,
          timestamp: q.timestamp ?? Date.now(),
        };
        result.set(quote.symbol, quote);
        this.batchQuoteCache.set(quote.symbol, {
          data: quote,
          ts: Date.now(),
        });
        // Also update individual cache
        this.quoteCache.set(quote.symbol, { data: quote, ts: Date.now() });
      }

      return result;
    } catch (err) {
      console.warn(
        "[xueqiu-scraper] fetchBatchQuotes failed:",
        (err as Error).message
      );
      // Return cached data
      for (const s of symbols) {
        const entry = this.batchQuoteCache.get(s) || this.quoteCache.get(s);
        if (entry) result.set(s, entry.data);
      }
      return result;
    } finally {
      await page.close();
    }
  }

  // ── Lifecycle ──

  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      console.log("[xueqiu-scraper] Browser closed");
    }
  }

  isReady(): boolean {
    return this.browser !== null && this.context !== null;
  }
}

// Export singleton
export const xueqiuScraper = new XueqiuScraper();
