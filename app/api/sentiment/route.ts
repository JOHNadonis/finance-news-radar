import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "sentiment.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return new NextResponse(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Data file not found" },
      { status: 404, headers: { "Cache-Control": "no-cache" } },
    );
  }
}
