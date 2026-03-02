import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getAllAccessKeys, createAccessKey, deleteAccessKey } from "@/lib/db";

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const keys = getAllAccessKeys();
  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { model_group_id, label } = await req.json();

    if (!model_group_id || typeof model_group_id !== "number") {
      return NextResponse.json({ error: "缺少 model_group_id" }, { status: 400 });
    }

    const key = createAccessKey(model_group_id, label);
    return NextResponse.json(key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }

  const ok = deleteAccessKey(Number(id));
  return NextResponse.json({ ok });
}
