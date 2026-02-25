import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { QuoteData } from "@/lib/types";

const CACHE_PATH = path.join(process.cwd(), "data", "quotes-cache.json");

export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json({ error: "Missing tickers param" }, { status: 400 });
  }

  const tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean);

  let allQuotes: Record<string, QuoteData> = {};
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    allQuotes = JSON.parse(raw);
  } catch { /* cache unreadable, return empty */ }

  const results: QuoteData[] = [];
  for (const t of tickers) {
    if (allQuotes[t]) {
      results.push(allQuotes[t]);
    }
  }

  return NextResponse.json(results);
}
