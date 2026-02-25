import { NextRequest, NextResponse } from "next/server";
import {
  getSubscriptions,
  addSubscription,
  removeSubscription,
} from "@/lib/db";
import type { SubscriptionType } from "@/lib/types";

const VALID_TYPES: SubscriptionType[] = ["ticker", "market", "keyword"];

const MAX_TOKEN_LEN = 128;
const TOKEN_RE = /^[\w-]+$/;

function getUserToken(request: NextRequest): string | null {
  const token = request.headers.get("X-User-Token");
  if (!token || token.length > MAX_TOKEN_LEN || !TOKEN_RE.test(token)) return null;
  return token;
}

export async function GET(request: NextRequest) {
  const userToken = getUserToken(request);
  if (!userToken) {
    return NextResponse.json(
      { error: "Missing X-User-Token header" },
      { status: 400 }
    );
  }

  const subscriptions = getSubscriptions(userToken);
  return NextResponse.json(subscriptions);
}

export async function POST(request: NextRequest) {
  const userToken = getUserToken(request);
  if (!userToken) {
    return NextResponse.json(
      { error: "Missing X-User-Token header" },
      { status: 400 }
    );
  }

  let body: { type?: string; value?: string; display_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { type, value, display_name } = body;

  if (!type || !VALID_TYPES.includes(type as SubscriptionType)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!value || typeof value !== "string" || !value.trim() || value.length > 100) {
    return NextResponse.json(
      { error: "Missing, empty, or too long value" },
      { status: 400 }
    );
  }

  const sanitizedDisplayName = (typeof display_name === "string" && display_name.length <= 200)
    ? display_name.trim() || undefined
    : undefined;

  try {
    const subscription = addSubscription(
      userToken,
      type as SubscriptionType,
      value.trim(),
      sanitizedDisplayName
    );
    return NextResponse.json(subscription, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "Subscription already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to add subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const userToken = getUserToken(request);
  if (!userToken) {
    return NextResponse.json(
      { error: "Missing X-User-Token header" },
      { status: 400 }
    );
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id || isNaN(Number(id))) {
    return NextResponse.json(
      { error: "Missing or invalid id parameter" },
      { status: 400 }
    );
  }

  const success = removeSubscription(userToken, Number(id));
  return NextResponse.json({ success });
}
