import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "data", "llm-config.json");

interface LLMConfig {
  api_base_url: string;
  api_key: string;
  model_name: string;
}

function getDefaults(): LLMConfig {
  return {
    api_base_url: "https://api.openai.com/v1",
    api_key: "",
    model_name: "gpt-4o-mini",
  };
}

function readConfig(): LLMConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return getDefaults();
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return getDefaults();
  }
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "****" : "";
  return key.slice(0, 3) + "..." + key.slice(-4);
}

export async function GET() {
  const cfg = readConfig();
  return NextResponse.json({
    api_base_url: cfg.api_base_url,
    api_key_masked: maskKey(cfg.api_key),
    model_name: cfg.model_name,
    configured: !!cfg.api_key,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const cfg = readConfig();

  if (body.api_base_url !== undefined) cfg.api_base_url = body.api_base_url;
  if (body.api_key !== undefined) cfg.api_key = body.api_key;
  if (body.model_name !== undefined) cfg.model_name = body.model_name;

  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");

  return NextResponse.json({
    api_base_url: cfg.api_base_url,
    api_key_masked: maskKey(cfg.api_key),
    model_name: cfg.model_name,
    configured: !!cfg.api_key,
  });
}
