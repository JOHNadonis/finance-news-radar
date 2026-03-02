import { NextRequest, NextResponse } from "next/server";
import { getAccessKeyByValue } from "@/lib/db";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");

  if (!key) {
    return NextResponse.json({ valid: false });
  }

  const result = getAccessKeyByValue(key);
  if (!result) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    group_name: result.group.name,
    model_name: result.group.model_name,
  });
}
