import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const CONFIG_PATH = join(DATA_DIR, "llm-config.json");
const CACHE_PATH = join(DATA_DIR, "policy-analysis.json");
const NEWS_PATH = join(DATA_DIR, "latest-24h.json");

function emptyResult(error: string | null = null) {
  return {
    generated_at: new Date().toISOString(),
    ok: !error,
    error,
    type: "llm" as const,
    text: "",
    model: "",
    input_items: 0,
    suggested_questions: [] as string[],
  };
}

export async function GET() {
  try {
    if (!existsSync(CACHE_PATH)) {
      return NextResponse.json(emptyResult("尚未生成分析，请点击「刷新分析」"));
    }
    const cached = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    return NextResponse.json(cached);
  } catch {
    return NextResponse.json(emptyResult("读取缓存失败"));
  }
}

export async function POST() {
  try {
    // 1. Read LLM config
    if (!existsSync(CONFIG_PATH)) {
      return NextResponse.json(emptyResult("未配置 LLM，请先在设置中配置 API"));
    }
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (!cfg.api_key) {
      return NextResponse.json(emptyResult("API Key 为空，请先配置"));
    }

    // 2. Read news data
    if (!existsSync(NEWS_PATH)) {
      return NextResponse.json(emptyResult("未找到新闻数据文件"));
    }
    const newsData = JSON.parse(readFileSync(NEWS_PATH, "utf-8"));
    const allItems = newsData.items_finance || newsData.items || [];

    // 3. Filter macro/general/policy-relevant news
    const policyItems = allItems.filter((item: { market_tags?: string[] }) => {
      const tags = item.market_tags || [];
      return tags.includes("macro") || tags.includes("general");
    });

    const inputItems = policyItems.length > 0 ? policyItems : allItems.slice(0, 30);
    const headlines = inputItems
      .slice(0, 50)
      .map((item: { title_zh?: string; title?: string; title_en?: string; importance?: string }, i: number) => {
        const title = item.title_zh || item.title || item.title_en || "";
        return `${i + 1}. ${title}${item.importance === "high" ? " [重要]" : ""}`;
      })
      .join("\n");

    // 4. Build prompt
    const systemPrompt = `你是一位资深金融政策分析师。请基于以下最近24小时的金融新闻，进行政策信号分析。

要求：
1. **政策信号识别**：从新闻中提取可能的政策动向和监管信号
2. **关联性分析**：分析不同新闻之间的内在关联
3. **市场影响判断**：评估这些政策信号对各市场（A股、美股、港股、加密、大宗商品、外汇）的潜在影响
4. **风险点标注**：标明需要重点关注的风险事件

请用简洁专业的中文输出，使用 Markdown 格式，确保分析有深度但不冗长。

在分析内容完成后，请用分隔符 ---QUESTIONS--- 另起一行，然后给出 3-5 个推荐追问问题，每行一个问题。这些问题应该帮助用户深入理解当前政策信号和市场影响。`;

    const userPrompt = `以下是最近24小时的${inputItems.length}条金融新闻摘要：\n\n${headlines}\n\n请进行政策信号深度分析。`;

    // 5. Call LLM
    const baseUrl = (cfg.api_base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.api_key}`,
        },
        body: JSON.stringify({
          model: cfg.model_name || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 3000,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(emptyResult(`LLM API 错误 ${res.status}: ${text.slice(0, 200)}`));
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || "";

    // 6. Parse suggested questions from response
    let analysisText = text;
    let suggested_questions: string[] = [];

    const separator = "---QUESTIONS---";
    const sepIndex = text.indexOf(separator);
    if (sepIndex !== -1) {
      analysisText = text.slice(0, sepIndex).trim();
      const questionsBlock = text.slice(sepIndex + separator.length).trim();
      suggested_questions = questionsBlock
        .split("\n")
        .map((q: string) => q.replace(/^\d+[\.\)、]\s*/, "").replace(/^[-*]\s*/, "").trim())
        .filter((q: string) => q.length > 0);
    }

    // 7. Cache result
    const result = {
      generated_at: new Date().toISOString(),
      ok: true,
      error: null,
      type: "llm" as const,
      text: analysisText,
      model: cfg.model_name || "gpt-4o-mini",
      input_items: inputItems.length,
      suggested_questions,
    };

    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2), "utf-8");

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      emptyResult(msg.includes("abort") ? "LLM 调用超时（60秒）" : `分析失败: ${msg}`)
    );
  }
}
