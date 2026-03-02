import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getAllModelGroups, createModelGroup, deleteModelGroup } from "@/lib/db";

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "***" + key.slice(-4);
}

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const groups = getAllModelGroups().map((g) => ({
    ...g,
    api_key: maskKey(g.api_key),
  }));

  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { name, api_base_url, api_key, model_name } = await req.json();

    if (!name || !api_base_url || !api_key || !model_name) {
      return NextResponse.json({ error: "所有字段均为必填" }, { status: 400 });
    }

    const group = createModelGroup({ name, api_base_url, api_key, model_name });
    return NextResponse.json(group);
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

  const ok = deleteModelGroup(Number(id));
  return NextResponse.json({ ok });
}
