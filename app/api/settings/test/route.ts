import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "data", "llm-config.json");

export async function POST() {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return NextResponse.json({ ok: false, error: "未配置 LLM，请先保存设置" });
    }

    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (!cfg.api_key) {
      return NextResponse.json({ ok: false, error: "API Key 为空" });
    }

    const baseUrl = (cfg.api_base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: JSON.stringify({
        model: cfg.model_name || "gpt-4o-mini",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        error: `API 返回 ${res.status}: ${text.slice(0, 200)}`,
      });
    }

    return NextResponse.json({ ok: true, error: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      error: msg.includes("abort") ? "连接超时（15秒）" : msg,
    });
  }
}
