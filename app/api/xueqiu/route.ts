import { NextRequest, NextResponse } from "next/server";
import { xueqiuScraper } from "@/lib/xueqiu-scraper";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");

  if (type === "quote") {
    const symbol = searchParams.get("symbol");
    if (!symbol || !/^[A-Za-z0-9.]{1,20}$/.test(symbol)) {
      return NextResponse.json(
        { error: "Missing or invalid symbol parameter" },
        { status: 400 }
      );
    }

    try {
      const quote = await xueqiuScraper.fetchQuote(symbol.toUpperCase());
      if (!quote) {
        return NextResponse.json(
          { error: "Quote not available", symbol },
          { status: 503 }
        );
      }
      return NextResponse.json(quote);
    } catch {
      return NextResponse.json(
        { error: "Failed to fetch quote" },
        { status: 503 }
      );
    }
  }

  if (type === "hot") {
    try {
      const topics = await xueqiuScraper.fetchHotTopics();
      return NextResponse.json(topics);
    } catch {
      return NextResponse.json(
        { error: "Failed to fetch hot topics" },
        { status: 503 }
      );
    }
  }

  return NextResponse.json(
    { error: 'Invalid type parameter. Use "quote" or "hot".' },
    { status: 400 }
  );
}
