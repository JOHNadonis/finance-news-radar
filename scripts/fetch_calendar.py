#!/usr/bin/env python3
"""Fetch economic calendar data and output structured JSON.

Sources (tried in order):
  1. Jin10 CDN calendar API (week/month-based, discovered from rili.jin10.com)
  2. FX678 (汇通网) calendar HTML — reliable server-side rendered fallback

Usage:
    python scripts/fetch_calendar.py --output-dir data
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

# ─────────────────────────── Constants ───────────────────────────

UTC = timezone.utc

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

TIMEOUT = 15
DAYS_AHEAD = 3  # fetch today + next 3 days

# Jin10 CDN calendar endpoints (week and month based)
# Discovered from rili.jin10.com Nuxt app JS bundle:
#   https://cdn-rili.jin10.com/web_data/{year}/week/{iso_week}/economics.json
#   https://cdn-rili.jin10.com/web_data/{year}/month/{month}/economics.json
JIN10_CDN_BASE = "https://cdn-rili.jin10.com/web_data"

# FX678 (汇通网) calendar — server-side rendered HTML
FX678_URL_TEMPLATE = "https://rl.fx678.com/date/{date}.html"

# Country code -> Chinese name mapping (for FX678 flag CSS classes)
COUNTRY_MAP = {
    "usa": "美国", "gbr": "英国", "eur": "欧元区", "jpn": "日本",
    "chn": "中国", "deu": "德国", "fra": "法国", "can": "加拿大",
    "aus": "澳大利亚", "nzl": "新西兰", "che": "瑞士", "ita": "意大利",
    "esp": "西班牙", "kor": "韩国", "bra": "巴西", "ind": "印度",
    "mex": "墨西哥", "tur": "土耳其", "zaf": "南非", "aut": "奥地利",
    "bel": "比利时", "nld": "荷兰", "swe": "瑞典", "nor": "挪威",
    "dnk": "丹麦", "fin": "芬兰", "prt": "葡萄牙", "grc": "希腊",
    "irl": "爱尔兰", "sgp": "新加坡", "hkg": "中国香港", "twn": "中国台湾",
    "rus": "俄罗斯", "idn": "印尼", "tha": "泰国", "mys": "马来西亚",
    "phl": "菲律宾", "col": "哥伦比亚", "arg": "阿根廷", "chl": "智利",
    "isr": "以色列", "sau": "沙特", "are": "阿联酋",
}

log = logging.getLogger("fetch_calendar")


# ─────────────────────────── Jin10 CDN ───────────────────────────


def _fetch_jin10_week(dt: datetime) -> tuple[str | None, dict[str, list[dict[str, Any]]]]:
    """Try Jin10 CDN week-based economics calendar.

    Returns (url, {date_str: [events]}) with events distributed across all dates
    found in the response.
    """
    iso = dt.isocalendar()
    year, week = iso[0], iso[1]
    url = f"{JIN10_CDN_BASE}/{year}/week/{week}/economics.json"
    try:
        resp = requests.get(url, headers={
            "User-Agent": BROWSER_UA,
            "Referer": "https://rili.jin10.com/",
            "Accept": "application/json",
        }, timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            by_date = _normalize_jin10_events_by_date(data)
            if by_date:
                total = sum(len(v) for v in by_date.values())
                log.info("  Jin10 week OK: %s (%d events across %d dates)", url, total, len(by_date))
                return url, by_date
            log.debug("  Jin10 week returned data but 0 parseable events")
    except requests.RequestException as exc:
        log.debug("  Jin10 week %s -> %s", url, exc)
    return None, {}


def _fetch_jin10_month(dt: datetime) -> tuple[str | None, dict[str, list[dict[str, Any]]]]:
    """Try Jin10 CDN month-based economics calendar.

    Returns (url, {date_str: [events]}) with events distributed across all dates.
    """
    url = f"{JIN10_CDN_BASE}/{dt.year}/month/{dt.month}/economics.json"
    try:
        resp = requests.get(url, headers={
            "User-Agent": BROWSER_UA,
            "Referer": "https://rili.jin10.com/",
            "Accept": "application/json",
        }, timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            by_date = _normalize_jin10_events_by_date(data)
            if by_date:
                total = sum(len(v) for v in by_date.values())
                log.info("  Jin10 month OK: %s (%d events across %d dates)", url, total, len(by_date))
                return url, by_date
    except requests.RequestException as exc:
        log.debug("  Jin10 month %s -> %s", url, exc)
    return None, {}


def _normalize_jin10_events_by_date(raw_data: Any) -> dict[str, list[dict[str, Any]]]:
    """Extract and normalize Jin10 calendar events, grouped by date.

    Instead of filtering for a single target date, returns ALL events grouped
    by their date field so callers can distribute them across multiple days.
    """
    events_raw: list[dict[str, Any]] = []

    if isinstance(raw_data, list):
        events_raw = raw_data
    elif isinstance(raw_data, dict):
        for key in ("data", "events", "list", "result", "items"):
            candidate = raw_data.get(key)
            if isinstance(candidate, list):
                events_raw = candidate
                break

    result: dict[str, list[dict[str, Any]]] = {}
    for e in events_raw:
        if not isinstance(e, dict):
            continue

        # Determine date for this event
        event_date = str(e.get("date", e.get("pub_date", "")))
        date_key = ""
        if event_date:
            # Extract YYYY-MM-DD from various formats (e.g. "2026-02-24 21:30:00")
            m = re.match(r"(\d{4}-\d{2}-\d{2})", event_date)
            if m:
                date_key = m.group(1)
        if not date_key:
            continue  # skip events without a parseable date

        time_val = str(e.get("time", e.get("pub_time", "")))
        if len(time_val) > 5 and ":" in time_val:
            parts = time_val.split(":")
            time_val = f"{parts[0][-2:]}:{parts[1][:2]}"

        importance_raw = e.get("importance", e.get("star", e.get("level", 1)))
        importance = max(1, min(3, int(importance_raw))) if str(importance_raw).isdigit() else 1

        normalized = {
            "time": time_val,
            "country": str(e.get("country", e.get("area", ""))),
            "indicator": str(e.get("indicator", e.get("name", e.get("event_name", e.get("title", ""))))),
            "importance": importance,
            "previous": str(e.get("previous", e.get("former", ""))),
            "forecast": str(e.get("forecast", e.get("consensus", ""))),
            "actual": str(e.get("actual", e.get("real", ""))),
            "unit": str(e.get("unit", "")),
        }
        result.setdefault(date_key, []).append(normalized)
    return result


# ─────────────────────────── FX678 ───────────────────────────────


def _fetch_fx678_week() -> dict[str, list[dict[str, Any]]]:
    """Fetch and parse FX678 (汇通网) economic calendar for the current week.

    FX678 always returns today's data regardless of the date in the URL.
    The page shows a weekly view but only server-renders the current day's
    data tables (plus the previous day). We make a single request and map
    the parsed events to the correct date from the page title.

    Returns a dict mapping date string -> event list, e.g. {"2026-02-24": [...]}.
    """
    url = FX678_URL_TEMPLATE.format(date=datetime.now(UTC).strftime("%Y-%m-%d"))
    try:
        resp = requests.get(url, headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html",
        }, timeout=TIMEOUT)
        if resp.status_code != 200 or len(resp.text) < 500:
            log.debug("  FX678 -> HTTP %d (%d bytes)", resp.status_code, len(resp.text))
            return {}
        log.debug("  FX678 fetched (%d bytes)", len(resp.text))
    except requests.RequestException as exc:
        log.debug("  FX678 -> %s", exc)
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract the actual date from the page title, e.g. "2026年02月24日_..."
    title_text = soup.title.get_text() if soup.title else ""
    title_match = re.search(r"(\d{4})年(\d{2})月(\d{2})日", title_text)
    if title_match:
        today_str = f"{title_match.group(1)}-{title_match.group(2)}-{title_match.group(3)}"
    else:
        today_str = datetime.now(UTC).strftime("%Y-%m-%d")

    # Extract week tab dates for context (prev day)
    tabs = soup.select("div.rl_week li a")
    prev_date_str = ""
    for tab in tabs:
        href = tab.get("href", "")
        tab_match = re.search(r"/date/(\d{8})", href)
        if tab_match:
            d = tab_match.group(1)
            ds = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            if ds < today_str:
                prev_date_str = ds  # keep updating, last one before today is prev

    tables = soup.find_all("table")
    result: dict[str, list[dict[str, Any]]] = {}

    # Table 0 = previous day data, Table 1 = today data
    # Table 3 = today calendar events (with star ratings)
    if len(tables) > 1:
        today_data = _parse_fx678_data_table(tables[1])
        today_events: list[dict[str, Any]] = []
        if len(tables) > 3:
            today_events = _parse_fx678_event_table(tables[3])
        all_today = today_data + today_events
        # Remove internal _type tag
        for e in all_today:
            e.pop("_type", None)
        result[today_str] = all_today
        log.info("  FX678 parsed %s: %d events (%d data + %d calendar)",
                 today_str, len(all_today), len(today_data), len(today_events))

    if len(tables) > 0 and prev_date_str:
        prev_data = _parse_fx678_data_table(tables[0])
        for e in prev_data:
            e.pop("_type", None)
        result[prev_date_str] = prev_data
        log.info("  FX678 parsed %s (prev day): %d data events", prev_date_str, len(prev_data))

    return result


def _extract_country_from_row(cell: Any) -> str:
    """Extract country name from FX678 flag CSS class like 'c_usa circle_flag'."""
    flag_div = cell.find("div", class_=lambda c: c and "circle_flag" in str(c))
    if flag_div:
        for cls in flag_div.get("class", []):
            if cls.startswith("c_"):
                code = cls[2:].lower()
                return COUNTRY_MAP.get(code, code.upper())
    # Fallback: text content
    text = cell.get_text(strip=True)
    return text if text else ""


def _extract_star_rating(row: Any) -> int:
    """Extract importance from star image src like /Public/images/star_3.png."""
    star_img = row.find("img", src=re.compile(r"star_\d"))
    if star_img:
        m = re.search(r"star_(\d)", star_img["src"])
        if m:
            return max(1, min(3, int(m.group(1))))
    return 1


def _parse_fx678_html(html: str) -> list[dict[str, Any]]:
    """Parse FX678 calendar HTML tables into normalized events.

    FX678 page structure:
      - Table 0: Previous day's data events
      - Table 1: Today's data events (经济数据)
      - Table 3: Today's calendar events with star ratings (财经事件)
    Each data table has 9-column rows (with time+country rowspan) and
    7-column continuation rows.
    """
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    events: list[dict[str, Any]] = []

    # Parse data tables (table index 1 = today's economic data)
    if len(tables) > 1:
        events.extend(_parse_fx678_data_table(tables[1]))

    # Parse event tables (table index 3 = today's events with stars)
    if len(tables) > 3:
        events.extend(_parse_fx678_event_table(tables[3]))

    log.info("  FX678 parsed: %d events (%d data + %d calendar)",
             len(events),
             sum(1 for e in events if e.get("_type") != "event"),
             sum(1 for e in events if e.get("_type") == "event"))

    # Remove internal _type tag
    for e in events:
        e.pop("_type", None)

    return events


def _parse_fx678_data_table(table: Any) -> list[dict[str, Any]]:
    """Parse an FX678 economic data table."""
    rows = table.find_all("tr")
    events: list[dict[str, Any]] = []
    current_time = ""
    current_country = ""

    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue

        star_rating = _extract_star_rating(row)

        if len(cells) >= 9:
            # Full row with time and country (rowspan)
            current_time = cells[0].get_text(strip=True)
            current_country = _extract_country_from_row(cells[1])
            indicator = cells[2].get_text(strip=True)
            previous = cells[3].get_text(strip=True)
            forecast = cells[4].get_text(strip=True)
            actual = cells[5].get_text(strip=True)
        elif len(cells) >= 7:
            # Continuation row (inherits time/country from rowspan above)
            indicator = cells[0].get_text(strip=True)
            previous = cells[1].get_text(strip=True)
            forecast = cells[2].get_text(strip=True)
            actual = cells[3].get_text(strip=True)
        else:
            continue

        if not indicator:
            continue

        # Extract unit from indicator name if present, e.g. "...(亿美元)"
        unit = ""
        unit_match = re.search(r"\(([^)]+)\)\s*$", indicator)
        if unit_match:
            unit = unit_match.group(1)

        events.append({
            "time": current_time,
            "country": current_country,
            "indicator": indicator,
            "importance": star_rating,
            "previous": previous,
            "forecast": forecast,
            "actual": actual,
            "unit": unit,
        })
    return events


def _parse_fx678_event_table(table: Any) -> list[dict[str, Any]]:
    """Parse an FX678 calendar event table (speeches, policy events, etc.)."""
    rows = table.find_all("tr")
    events: list[dict[str, Any]] = []

    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        time_val = cells[0].get_text(strip=True)
        country = cells[1].get_text(strip=True)
        # cells[2] is usually "---" separator
        # cells[3] is empty
        description = cells[4].get_text(strip=True) if len(cells) > 4 else ""
        star_rating = _extract_star_rating(row)

        if not description:
            continue

        events.append({
            "time": time_val,
            "country": country,
            "indicator": description,
            "importance": star_rating,
            "previous": "",
            "forecast": "",
            "actual": "",
            "unit": "",
            "_type": "event",
        })
    return events


# ─────────────────────────── Core Logic ──────────────────────────


def fetch_calendar(days_ahead: int = DAYS_AHEAD) -> dict[str, Any]:
    """Fetch economic calendar for today + days_ahead days."""
    now = datetime.now(UTC)
    target_dates = [(now + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days_ahead + 1)]
    dates_data: dict[str, list[dict[str, Any]]] = {d: [] for d in target_dates}
    total_events = 0
    high_importance = 0
    working_endpoint: str | None = None
    source_used = "none"

    # 1) Try Jin10 CDN — deduplicate requests for same week/month
    #    Fetch raw data once per week/month, then distribute events to all target dates.
    tried_week_keys: set[tuple[int, int]] = set()
    tried_month_keys: set[tuple[int, int]] = set()
    jin10_cache: dict[str, list[dict[str, Any]]] = {}  # date_str -> events (accumulated)

    for date_key in target_dates:
        dt = datetime.strptime(date_key, "%Y-%m-%d").replace(tzinfo=UTC)
        log.info("Fetching calendar for %s ...", date_key)

        iso = dt.isocalendar()
        week_key = (iso[0], iso[1])
        month_key = (dt.year, dt.month)

        if week_key not in tried_week_keys:
            tried_week_keys.add(week_key)
            url, by_date = _fetch_jin10_week(dt)
            if url and by_date:
                working_endpoint = working_endpoint or url
                source_used = "jin10"
                for d, evts in by_date.items():
                    jin10_cache.setdefault(d, []).extend(evts)

        if date_key not in jin10_cache and month_key not in tried_month_keys:
            tried_month_keys.add(month_key)
            url, by_date = _fetch_jin10_month(dt)
            if url and by_date:
                working_endpoint = working_endpoint or url
                source_used = "jin10"
                for d, evts in by_date.items():
                    jin10_cache.setdefault(d, []).extend(evts)

    # Map cached Jin10 events into target dates
    for date_key in target_dates:
        if date_key in jin10_cache:
            dates_data[date_key] = jin10_cache[date_key]

    # 2) Fallback: FX678 (single request covers today + previous day)
    jin10_has_data = any(dates_data[d] for d in target_dates)
    if not jin10_has_data:
        log.info("Jin10 unavailable, trying FX678 fallback ...")
        fx678_data = _fetch_fx678_week()
        if fx678_data:
            source_used = "fx678"
            for date_key in target_dates:
                if date_key in fx678_data:
                    dates_data[date_key] = fx678_data[date_key]

    # Compute totals
    for date_key in target_dates:
        events = dates_data[date_key]
        total_events += len(events)
        high_importance += sum(1 for e in events if e.get("importance", 0) >= 3)

    ok = total_events > 0
    error_msg = None
    if not ok:
        error_msg = "No calendar data available from any source"
        log.warning(error_msg)

    result: dict[str, Any] = {
        "generated_at": now.isoformat(timespec="seconds"),
        "ok": ok,
        "error": error_msg,
        "source": source_used,
        "working_endpoint": working_endpoint,
        "dates": dates_data,
        "event_count": total_events,
        "high_importance_count": high_importance,
    }

    log.info(
        "Calendar result: ok=%s, source=%s, events=%d, high=%d",
        ok, source_used, total_events, high_importance,
    )
    return result


# ─────────────────────────── Main ────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch economic calendar data")
    parser.add_argument("--output-dir", default="data", help="Output directory (default: data)")
    parser.add_argument("--days", type=int, default=DAYS_AHEAD, help="Days ahead to fetch (default: 3)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    result = fetch_calendar(days_ahead=args.days)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "economic-calendar.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    log.info("Written to %s", out_path)

    # Always return 0 — fetch failures are recorded in the JSON
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
