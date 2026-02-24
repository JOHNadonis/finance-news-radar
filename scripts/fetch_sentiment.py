#!/usr/bin/env python3
"""Fetch market sentiment indicators and write data/sentiment.json.

Usage:
    python scripts/fetch_sentiment.py [--output-dir data]

Data sources (all free, no API key required):
    - CNN Fear & Greed Index (includes VIX)
    - Crypto Fear & Greed Index (alternative.me)
    - Yahoo Finance VIX (fallback)
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

TIMEOUT = 15


# ─────────────────────────── Fetchers ─────────────────────────────


def fetch_cnn_fear_greed() -> dict[str, Any]:
    """Fetch CNN Fear & Greed Index (also returns VIX data)."""
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    fg = data["fear_and_greed"]
    result: dict[str, Any] = {
        "score": round(fg["score"], 1),
        "rating": fg["rating"],
        "previous_close": round(fg.get("previous_close", 0), 1),
        "previous_1_week": round(fg.get("previous_1_week", 0), 1),
        "previous_1_month": round(fg.get("previous_1_month", 0), 1),
    }

    # Extract VIX from market_volatility_vix if available
    vix_data = data.get("market_volatility_vix")
    vix: dict[str, Any] | None = None
    if vix_data and "score" in vix_data:
        vix = {"value": round(vix_data["score"], 2)}

    return {"fear_greed": result, "vix": vix}


def fetch_crypto_fear_greed() -> dict[str, Any]:
    """Fetch Crypto Fear & Greed Index from alternative.me."""
    url = "https://api.alternative.me/fng/?limit=2"
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    entry = data["data"][0]
    return {
        "value": int(entry["value"]),
        "classification": entry["value_classification"],
    }


def fetch_vix_yahoo() -> dict[str, Any]:
    """Fetch VIX from Yahoo Finance (fallback)."""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=5m"
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    meta = data["chart"]["result"][0]["meta"]
    price = round(meta["regularMarketPrice"], 2)
    prev = round(meta["previousClose"], 2)
    return {
        "value": price,
        "previous_close": prev,
        "change": round(price - prev, 2),
    }


# ─────────────────────────── Main ─────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch market sentiment indicators")
    parser.add_argument("--output-dir", default="data", help="Output directory (default: data)")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    result: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # 1. CNN Fear & Greed (also provides VIX)
    cnn_vix: dict[str, Any] | None = None
    try:
        cnn_data = fetch_cnn_fear_greed()
        result["cnn_fear_greed"] = {**cnn_data["fear_greed"], "ok": True, "error": None}
        cnn_vix = cnn_data.get("vix")
        print(f"CNN Fear & Greed: {cnn_data['fear_greed']['score']} ({cnn_data['fear_greed']['rating']})")
    except Exception as exc:
        result["cnn_fear_greed"] = {"ok": False, "error": str(exc)}
        print(f"CNN Fear & Greed failed: {exc}")

    # 2. Crypto Fear & Greed
    try:
        crypto = fetch_crypto_fear_greed()
        result["crypto_fear_greed"] = {**crypto, "ok": True, "error": None}
        print(f"Crypto Fear & Greed: {crypto['value']} ({crypto['classification']})")
    except Exception as exc:
        result["crypto_fear_greed"] = {"ok": False, "error": str(exc)}
        print(f"Crypto Fear & Greed failed: {exc}")

    # 3. VIX — prefer CNN data, fall back to Yahoo
    if cnn_vix:
        result["vix"] = {
            "value": cnn_vix["value"],
            "previous_close": None,
            "change": None,
            "ok": True,
            "error": None,
        }
        print(f"VIX (from CNN): {cnn_vix['value']}")
    else:
        try:
            vix = fetch_vix_yahoo()
            result["vix"] = {**vix, "ok": True, "error": None}
            print(f"VIX (Yahoo fallback): {vix['value']} (change: {vix['change']})")
        except Exception as exc:
            result["vix"] = {"ok": False, "error": str(exc)}
            print(f"VIX failed: {exc}")

    # Write output
    out_path = output_dir / "sentiment.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
