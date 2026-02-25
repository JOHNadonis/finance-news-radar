import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { QuoteData } from "@/lib/types";

const CACHE_PATH = join(process.cwd(), "data", "quotes-cache.json");

export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json({ error: "Missing tickers param" }, { status: 400 });
  }

  const tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean);

  // Read from shared cache file
  let allQuotes: Record<string, QuoteData> = {};
  if (existsSync(CACHE_PATH)) {
    try {
      const raw = readFileSync(CACHE_PATH, "utf-8");
      allQuotes = JSON.parse(raw);
    } catch { /* cache unreadable, return empty */ }
  }

  const results: QuoteData[] = [];
  for (const t of tickers) {
    if (allQuotes[t]) {
      results.push(allQuotes[t]);
    }
  }

  return NextResponse.json(results);
}
