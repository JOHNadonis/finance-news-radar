import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ChatMessage } from "@/lib/types";

const DATA_DIR = join(process.cwd(), "data");
const CONFIG_PATH = join(DATA_DIR, "llm-config.json");
const CACHE_PATH = join(DATA_DIR, "policy-analysis.json");

const SYSTEM_PROMPT = `你是「金融雷达 AI 分析师」，一位资深的全球金融市场分析专家。

## 角色定位
- 专长：宏观经济、货币政策、地缘政治、行业分析、市场趋势研判
- 覆盖市场：A股、美股、港股、加密货币、大宗商品、外汇
- 分析风格：数据驱动、逻辑严密、观点鲜明

## 分析框架
1. **政策-市场传导链**：政策信号 → 资金面变化 → 行业影响 → 个股/资产映射
2. **多维度交叉验证**：同一事件从宏观、行业、技术面三个维度交叉分析
3. **风险收益评估**：每个判断都标注置信度和主要风险点

## 交互规则
- 先理解用户关心的具体领域和时间维度
- 不给模糊的"两面性"结论，要有明确倾向（但标注不确定性）
- 涉及具体投资建议时，必须加风险提示
- 用 Markdown 格式输出，善用标题、加粗、列表增强可读性
- 分析深度要高，不要泛泛而谈

## 当前上下文
用户正在使用「金融信息雷达」平台，该平台实时聚合全球金融新闻。
你可以参考提供的最新政策分析报告和新闻摘要来回答问题。`;

export async function POST(req: NextRequest) {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return new Response(JSON.stringify({ error: "未配置 LLM，请先在设置中配置 API" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (!cfg.api_key) {
      return new Response(JSON.stringify({ error: "API Key 为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rawMessages: ChatMessage[] = body.messages || [];
    const context: string | undefined = body.context;

    // Security: only allow user/assistant roles from client (block system role injection)
    const messages = rawMessages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );

    // Guard against oversized payloads
    if (messages.length > 50) {
      return new Response(JSON.stringify({ error: "消息数量超出限制（最多50条）" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const totalLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) + (context?.length || 0);
    if (totalLength > 100_000) {
      return new Response(JSON.stringify({ error: "消息内容过长" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build message list with system prompt
    const llmMessages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

    // Optionally inject latest analysis as context
    if (context) {
      llmMessages.push({
        role: "system",
        content: `以下是平台最新的政策分析报告，可作为回答参考：\n\n${context}`,
      });
    } else if (existsSync(CACHE_PATH)) {
      try {
        const cached = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
        if (cached.text) {
          llmMessages.push({
            role: "system",
            content: `以下是平台最新的政策分析报告，可作为回答参考：\n\n${cached.text}`,
          });
        }
      } catch {
        // ignore
      }
    }

    llmMessages.push(...messages);

    const baseUrl = (cfg.api_base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: JSON.stringify({
        model: cfg.model_name || "gpt-4o-mini",
        messages: llmMessages,
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
      }),
      signal: controller.signal,
    });

    // Clear timeout once we get a response (stream started)
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `LLM API 错误 ${res.status}: ${text.slice(0, 200)}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the response as SSE
    const readable = new ReadableStream({
      async start(ctrl) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                ctrl.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Stream error";
          ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        } finally {
          ctrl.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg.includes("abort") ? "请求超时（90秒）" : `对话失败: ${msg}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
