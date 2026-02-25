"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { QuoteData } from "@/lib/types";

type QuoteHandler = (ticker: string, data: QuoteData) => void;

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Set<QuoteHandler>>(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({
      path: "/ws",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("quote:update", (msg: { ticker: string; data: QuoteData }) => {
      for (const handler of handlersRef.current) {
        handler(msg.ticker, msg.data);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const subscribe = useCallback((tickers: string[]) => {
    socketRef.current?.emit("subscribe", tickers);
  }, []);

  const unsubscribe = useCallback((tickers: string[]) => {
    socketRef.current?.emit("unsubscribe", tickers);
  }, []);

  const onQuote = useCallback((handler: QuoteHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { subscribe, unsubscribe, onQuote, connected };
}
