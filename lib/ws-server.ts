import type { Server as SocketIOServer } from "socket.io";
import { getQuotesProvider } from "./quotes-provider";
import type { QuoteData } from "./types";

export function initQuoteWebSocket(io: SocketIOServer): void {
  const provider = getQuotesProvider();

  // Forward quote updates to subscribed rooms
  provider.on("quote", (ticker: string, data: QuoteData) => {
    io.to(`quote:${ticker}`).emit("quote:update", { ticker, data });
  });

  const MAX_SUBS_PER_CLIENT = 50;

  io.on("connection", (socket) => {
    console.log(`[WS] client connected: ${socket.id}`);
    let subCount = 0;

    socket.on("subscribe", (tickers: string[]) => {
      if (!Array.isArray(tickers)) return;
      for (const t of tickers) {
        if (typeof t !== "string") continue;
        const ticker = t.trim();
        if (!ticker || ticker.length > 30) continue;
        if (subCount >= MAX_SUBS_PER_CLIENT) break;
        subCount++;
        socket.join(`quote:${ticker}`);
        provider.ensureTracking(ticker);

        // Send cached data immediately if available
        const cached = provider.getQuote(ticker);
        if (cached) {
          socket.emit("quote:update", { ticker, data: cached });
        }
      }
    });

    socket.on("unsubscribe", (tickers: string[]) => {
      if (!Array.isArray(tickers)) return;
      for (const t of tickers) {
        if (typeof t !== "string") continue;
        socket.leave(`quote:${t.trim()}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[WS] client disconnected: ${socket.id}`);
    });
  });

  // Start the provider
  provider.start();
  console.log("[WS] quote WebSocket initialized");
}
