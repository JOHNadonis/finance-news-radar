#!/usr/bin/env python3
"""Generate market summary from latest-24h.json.

Default: rule-based template summary (zero cost).
Optional: LLM-powered summary if ANTHROPIC_API_KEY or OPENAI_API_KEY is set.

Usage:
    python scripts/generate_summary.py --data-dir data --output-dir data
    python scripts/generate_summary.py --data-dir data --output-dir data --no-llm
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

MARKET_LABELS = {
    "a_stock": "A股", "us_stock": "美股", "hk_stock": "港股",
    "macro": "宏观", "crypto": "加密", "commodity": "大宗",
    "forex": "外汇", "general": "综合",
}

DISPLAY_ORDER = ["a_stock", "us_stock", "hk_stock", "macro", "crypto", "commodity", "forex", "general"]


# ─────────────────────── Rule-based summary ──────────────────────


def rule_based_summary(items: list[dict]) -> dict:
    # Group by market_tags
    market_groups: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        for tag in item.get("market_tags", ["general"]):
            market_groups[tag].append(item)

    sections: dict[str, dict] = {}
    for tag in DISPLAY_ORDER:
        tag_items = market_groups.get(tag, [])
        if not tag_items:
            continue
        high = [i for i in tag_items if i.get("importance") == "high"]
        medium = [i for i in tag_items if i.get("importance") == "medium"]

        # Top headlines: high > medium > recent
        top_pool = high + medium + sorted(tag_items, key=lambda x: x.get("published_at", ""), reverse=True)
        seen: set[str] = set()
        top_headlines: list[str] = []
        for item in top_pool:
            title = (item.get("title_zh") or item.get("title", "")).strip()
            if title and title not in seen:
                seen.add(title)
                top_headlines.append(title)
            if len(top_headlines) >= 5:
                break

        sections[tag] = {
            "total": len(tag_items),
            "high_importance": len(high),
            "top_headlines": top_headlines,
            "sources": sorted(set(i.get("site_name", "") for i in tag_items if i.get("site_name"))),
        }

    total = len(items)
    high_total = sum(1 for i in items if i.get("importance") == "high")

    lines = [f"【市场概览】过去24小时共 {total} 条金融快讯，{high_total} 条标记为重要。"]
    for tag in DISPLAY_ORDER:
        if tag not in sections:
            continue
        s = sections[tag]
        label = MARKET_LABELS.get(tag, tag)
        headlines_str = "；".join(s["top_headlines"][:3])
        if headlines_str:
            lines.append(f"\n【{label}】{s['total']} 条动态，{s['high_importance']} 条重要。焦点：{headlines_str}。")
        else:
            lines.append(f"\n【{label}】{s['total']} 条动态。")

    return {
        "type": "rule_based",
        "text": "\n".join(lines),
        "sections": sections,
        "total_items": total,
        "high_importance_items": high_total,
    }


# ─────────────────────── LLM summary (optional) ─────────────────


def build_llm_prompt(items: list[dict]) -> str:
    """Build a prompt with top 30 headlines grouped by market."""
    market_groups: dict[str, list[str]] = defaultdict(list)
    for item in items:
        title = (item.get("title_zh") or item.get("title", "")).strip()
        if not title:
            continue
        for tag in item.get("market_tags", ["general"]):
            if len(market_groups[tag]) < 10:
                imp = item.get("importance", "normal")
                prefix = "🔴 " if imp == "high" else ""
                market_groups[tag].append(f"{prefix}{title}")

    sections = []
    for tag in DISPLAY_ORDER:
        headlines = market_groups.get(tag, [])
        if not headlines:
            continue
        label = MARKET_LABELS.get(tag, tag)
        bullet_list = "\n".join(f"  - {h}" for h in headlines)
        sections.append(f"【{label}】\n{bullet_list}")

    headlines_block = "\n\n".join(sections)

    return (
        "你是一位专业金融分析师。请根据以下过去24小时的金融快讯标题，"
        "生成一份简洁的中文市场速览摘要（300-500字）。\n"
        "要求：\n"
        "1. 按市场分类概述（A股、美股、港股、宏观、加密等）\n"
        "2. 突出标记为🔴的重要事件\n"
        "3. 语言简练专业，适合金融从业者快速阅读\n"
        "4. 不要编造不在标题中的信息\n\n"
        f"--- 快讯标题 ---\n\n{headlines_block}"
    )


def llm_summary_anthropic(items: list[dict], api_key: str) -> str | None:
    prompt = build_llm_prompt(items)
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-3-5-haiku-latest",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]
    except Exception as exc:
        print(f"Anthropic LLM failed: {exc}")
        return None


def llm_summary_openai(items: list[dict], api_key: str) -> str | None:
    prompt = build_llm_prompt(items)
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1024,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        print(f"OpenAI LLM failed: {exc}")
        return None


# ─────────────────────── Main ────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate market summary")
    parser.add_argument("--data-dir", default="data", help="Directory containing latest-24h.json")
    parser.add_argument("--output-dir", default="data", help="Output directory")
    parser.add_argument("--no-llm", action="store_true", help="Force rule-based even if API key is set")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load latest data
    src = data_dir / "latest-24h.json"
    if not src.exists():
        print(f"{src} not found, writing empty summary.")
        result = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "ok": False, "error": f"{src} not found",
            "type": "rule_based", "text": "", "sections": {},
            "total_items": 0, "high_importance_items": 0,
        }
        (output_dir / "market-summary.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0

    payload = json.loads(src.read_text(encoding="utf-8"))
    items = payload.get("items_finance", payload.get("items", []))
    print(f"Loaded {len(items)} finance items from {src}")

    # Rule-based summary (always computed as fallback)
    rb = rule_based_summary(items)

    # Try LLM if available
    llm_text = None
    summary_type = "rule_based"

    if not args.no_llm:
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        openai_key = os.environ.get("OPENAI_API_KEY", "")

        if anthropic_key:
            print("Attempting Anthropic LLM summary...")
            llm_text = llm_summary_anthropic(items, anthropic_key)
        elif openai_key:
            print("Attempting OpenAI LLM summary...")
            llm_text = llm_summary_openai(items, openai_key)

    if llm_text:
        summary_type = "llm"
        text = llm_text
        print("Using LLM summary.")
    else:
        text = rb["text"]
        if not args.no_llm and (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")):
            print("LLM failed, falling back to rule-based.")
        else:
            print("Using rule-based summary.")

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "type": summary_type,
        "total_items": rb["total_items"],
        "high_importance_items": rb["high_importance_items"],
        "text": text,
        "sections": rb["sections"],
        "ok": True,
        "error": None,
    }

    out_path = output_dir / "market-summary.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} — {rb['total_items']} items, type={summary_type}")
    print(f"Preview: {text[:200]}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
