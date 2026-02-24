#!/usr/bin/env python3
"""Send finance news digest to Feishu (飞书) and Telegram.

Usage:
    python scripts/notify.py --data-dir data [--feishu-webhook URL] [--telegram-token TOKEN --telegram-chat CHAT_ID]

Environment variables (alternative to CLI args):
    FEISHU_WEBHOOK       — Feishu custom bot webhook URL
    FEISHU_SECRET        — (optional) Feishu bot signing secret
    TELEGRAM_BOT_TOKEN   — Telegram bot token
    TELEGRAM_CHAT_ID     — Telegram chat/channel ID
    NOTIFY_TOP_N         — Number of top items to include (default: 30)
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

UTC = timezone.utc

MARKET_LABELS = {
    "a_stock": "A股", "us_stock": "美股", "hk_stock": "港股",
    "macro": "宏观", "crypto": "加密", "commodity": "大宗",
    "forex": "外汇", "general": "综合",
}

IMPORTANCE_EMOJI = {"high": "🔴", "medium": "🟡", "normal": ""}


# ─────────────────────────── Helpers ──────────────────────────────


def load_latest(data_dir: Path) -> dict[str, Any]:
    path = data_dir / "latest-24h.json"
    return json.loads(path.read_text(encoding="utf-8"))


def pick_top_items(payload: dict[str, Any], top_n: int) -> list[dict[str, Any]]:
    """Pick top N finance items, prioritizing high importance."""
    items = payload.get("items_finance", payload.get("items", []))
    high = [i for i in items if i.get("importance") == "high"]
    medium = [i for i in items if i.get("importance") == "medium"]
    normal = [i for i in items if i.get("importance") == "normal"]
    ordered = high + medium + normal
    return ordered[:top_n]


def fmt_time_short(iso_str: str | None) -> str:
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone().strftime("%H:%M")
    except Exception:
        return ""


def item_title(item: dict[str, Any]) -> str:
    return (item.get("title_zh") or item.get("title") or "").strip()


def item_tags_str(item: dict[str, Any]) -> str:
    tags = item.get("market_tags", [])
    labels = [MARKET_LABELS.get(t, t) for t in tags if t != "general"]
    return " ".join(f"[{l}]" for l in labels) if labels else ""


# ─────────────────────────── Feishu ───────────────────────────────


def feishu_sign(secret: str, timestamp: int) -> str:
    """Generate Feishu bot signature: base64(hmac_sha256(timestamp + '\n' + secret))."""
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    return base64.b64encode(hmac_code).decode("utf-8")


def build_feishu_card(items: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    """Build Feishu interactive card message."""
    total = payload.get("total_items", 0)
    generated = fmt_time_short(payload.get("generated_at"))

    # Header
    header = {
        "title": {"tag": "plain_text", "content": f"📊 金融雷达快报 ({generated})"},
        "template": "blue",
    }

    # Stats line
    stats_text = f"金融 {total} 条 | 全量 {payload.get('total_items_raw', 0)} 条 | 数据源 {payload.get('site_count', 0)} 个"
    elements: list[dict[str, Any]] = [
        {"tag": "markdown", "content": f"**{stats_text}**"},
        {"tag": "hr"},
    ]

    # News items grouped by importance
    for item in items:
        imp = item.get("importance", "normal")
        emoji = IMPORTANCE_EMOJI.get(imp, "")
        title = item_title(item)
        url = item.get("url", "")
        tags = item_tags_str(item)
        source = item.get("site_name", "")
        t = fmt_time_short(item.get("published_at") or item.get("first_seen_at"))

        line = f"{emoji} [{title}]({url})" if url else f"{emoji} {title}"
        meta = f"  {tags} {source} {t}".strip()
        elements.append({"tag": "markdown", "content": f"{line}\n{meta}"})

    # Footer
    elements.append({"tag": "hr"})
    elements.append({
        "tag": "note",
        "elements": [{"tag": "plain_text", "content": "Finance News Radar · 每 15 分钟自动更新"}],
    })

    return {
        "msg_type": "interactive",
        "card": {"header": header, "elements": elements},
    }


def send_feishu(webhook_url: str, items: list[dict[str, Any]], payload: dict[str, Any],
                secret: str | None = None) -> bool:
    """Send digest to Feishu custom bot webhook."""
    body = build_feishu_card(items, payload)

    if secret:
        timestamp = int(time.time())
        body["timestamp"] = str(timestamp)
        body["sign"] = feishu_sign(secret, timestamp)

    try:
        resp = requests.post(webhook_url, json=body, timeout=15)
        resp.raise_for_status()
        result = resp.json()
        if result.get("code", 0) != 0:
            print(f"Feishu error: {result}")
            return False
        print(f"Feishu: sent {len(items)} items")
        return True
    except Exception as exc:
        print(f"Feishu failed: {exc}")
        return False


# ─────────────────────────── Telegram ─────────────────────────────


def build_telegram_html(items: list[dict[str, Any]], payload: dict[str, Any]) -> list[str]:
    """Build Telegram HTML messages (split if > 4000 chars)."""
    total = payload.get("total_items", 0)
    generated = fmt_time_short(payload.get("generated_at"))

    header = (
        f"<b>📊 金融雷达快报 ({generated})</b>\n"
        f"金融 {total} 条 | 全量 {payload.get('total_items_raw', 0)} 条 | "
        f"数据源 {payload.get('site_count', 0)} 个\n"
        f"{'─' * 20}\n"
    )

    lines: list[str] = []
    for item in items:
        imp = item.get("importance", "normal")
        emoji = IMPORTANCE_EMOJI.get(imp, "")
        title = item_title(item)
        url = item.get("url", "")
        tags = item_tags_str(item)
        source = item.get("site_name", "")
        t = fmt_time_short(item.get("published_at") or item.get("first_seen_at"))

        # Escape HTML special chars in title
        safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if url:
            line = f'{emoji} <a href="{url}">{safe_title}</a>'
        else:
            line = f"{emoji} {safe_title}"
        meta = f"  {tags} {source} {t}".strip()
        lines.append(f"{line}\n{meta}")

    footer = f"\n{'─' * 20}\n<i>Finance News Radar · 每 15 分钟自动更新</i>"

    # Split into messages under 4000 chars
    messages: list[str] = []
    current = header
    for line in lines:
        if len(current) + len(line) + 2 > 4000:
            messages.append(current)
            current = ""
        current += line + "\n"
    current += footer
    messages.append(current)
    return messages


def send_telegram(token: str, chat_id: str, items: list[dict[str, Any]],
                  payload: dict[str, Any]) -> bool:
    """Send digest to Telegram chat/channel."""
    messages = build_telegram_html(items, payload)
    api_url = f"https://api.telegram.org/bot{token}/sendMessage"
    ok = True
    for msg in messages:
        try:
            resp = requests.post(api_url, json={
                "chat_id": chat_id,
                "text": msg,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            }, timeout=15)
            resp.raise_for_status()
            result = resp.json()
            if not result.get("ok"):
                print(f"Telegram error: {result}")
                ok = False
        except Exception as exc:
            print(f"Telegram failed: {exc}")
            ok = False
    if ok:
        print(f"Telegram: sent {len(items)} items in {len(messages)} message(s)")
    return ok


# ─────────────────────────── Main ─────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Send finance news digest notifications")
    parser.add_argument("--data-dir", default="data", help="Directory containing latest-24h.json")
    parser.add_argument("--top-n", type=int, default=0, help="Number of top items (0 = use NOTIFY_TOP_N or 30)")
    parser.add_argument("--feishu-webhook", default="", help="Feishu webhook URL")
    parser.add_argument("--feishu-secret", default="", help="Feishu signing secret")
    parser.add_argument("--telegram-token", default="", help="Telegram bot token")
    parser.add_argument("--telegram-chat", default="", help="Telegram chat/channel ID")
    parser.add_argument("--dry-run", action="store_true", help="Print message without sending")
    args = parser.parse_args()

    # Resolve from env vars if not provided as args
    feishu_webhook = args.feishu_webhook or os.environ.get("FEISHU_WEBHOOK", "")
    feishu_secret = args.feishu_secret or os.environ.get("FEISHU_SECRET", "")
    telegram_token = args.telegram_token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    telegram_chat = args.telegram_chat or os.environ.get("TELEGRAM_CHAT_ID", "")
    top_n = args.top_n or int(os.environ.get("NOTIFY_TOP_N", "30"))

    if not feishu_webhook and not telegram_token:
        print("No notification channels configured. Set FEISHU_WEBHOOK or TELEGRAM_BOT_TOKEN.")
        return 0

    data_dir = Path(args.data_dir)
    try:
        payload = load_latest(data_dir)
    except Exception as exc:
        print(f"Failed to load data: {exc}")
        return 1

    items = pick_top_items(payload, top_n)
    if not items:
        print("No items to notify.")
        return 0

    print(f"Prepared {len(items)} items for notification (high={sum(1 for i in items if i.get('importance')=='high')}, "
          f"medium={sum(1 for i in items if i.get('importance')=='medium')}, "
          f"normal={sum(1 for i in items if i.get('importance')=='normal')})")

    if args.dry_run:
        if feishu_webhook:
            card = build_feishu_card(items, payload)
            print("\n=== Feishu Card (dry-run) ===")
            print(json.dumps(card, ensure_ascii=False, indent=2)[:2000])
        if telegram_token:
            msgs = build_telegram_html(items, payload)
            print("\n=== Telegram Message (dry-run) ===")
            for i, msg in enumerate(msgs):
                print(f"--- Message {i+1} ({len(msg)} chars) ---")
                print(msg[:1500])
        return 0

    results: list[bool] = []

    if feishu_webhook:
        results.append(send_feishu(feishu_webhook, items, payload, feishu_secret or None))

    if telegram_token and telegram_chat:
        results.append(send_telegram(telegram_token, telegram_chat, items, payload))

    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
