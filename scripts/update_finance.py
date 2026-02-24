#!/usr/bin/env python3
"""Aggregate updates from multiple finance news sites and produce 24h snapshot data."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import random
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from dateutil import parser as dtparser
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    import feedparser
except ModuleNotFoundError:
    feedparser = None

# ─────────────────────────── Constants ───────────────────────────

UTC = timezone.utc
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
SH_TZ = ZoneInfo("Asia/Shanghai")

# ── Collector parameter baselines (authoritative, from design spec §3.1) ──

WALLSTREETCN_URL = "https://api-one.wallstcn.com/apiv1/content/lives"
WALLSTREETCN_CHANNELS = [
    "global-channel", "us-stock-channel", "a-stock-channel",
    "hk-stock-channel", "forex-channel", "oil-channel", "goldc-channel",
]
WALLSTREETCN_LIMIT = 50

JIN10_URL = "https://flash-api.jin10.com/get_flash_list"
JIN10_PARAMS = {"channel": "-8200", "vip": "1"}

BLOCKBEATS_URL = "https://api.theblockbeats.news/v1/open-api/open-flash"
BLOCKBEATS_PARAMS = {"size": "50", "page": "1", "type": "push"}

CLS_URL = "https://www.cls.cn/nodeapi/telegraphList"
CLS_PARAMS = {"app": "CailianpressWeb", "os": "web", "sv": "8.4.6", "rn": "50"}

EASTMONEY_URL = "https://np-listapi.eastmoney.com/comm/web/getNewsByColumns"
EASTMONEY_PARAMS_BASE = {"client": "web", "biz": "web_724", "column": "350", "pageSize": "50"}

GELONGHUI_URL = "https://www.gelonghui.com/api/live-channels/all/lives"
GELONGHUI_PARAMS = {"page": "1", "limit": "50"}

# ── RSS feed configuration ──

RSS_FEED_REPLACEMENTS: dict[str, str] = {}

RSS_FEED_SKIP_PREFIXES: tuple[str, ...] = (
    "https://rsshub.app/telegram/channel/",
    "https://rsshub.app/bilibili/",
    "https://rsshub.app/zhihu/",
    "https://wechat2rss.bestblogs.dev/",
)

RSS_FEED_SKIP_EXACT: set[str] = set()

# ── Finance professional source IDs (bypass keyword filter) ──

FINANCE_PRO_SITES = {"wallstreetcn", "jin10", "cls", "eastmoney", "gelonghui", "blockbeats"}

# ─────────────────────────── Data class ──────────────────────────


@dataclass
class RawItem:
    site_id: str
    site_name: str
    source: str
    title: str
    url: str
    published_at: datetime | None
    meta: dict[str, Any]


# ─────────────────────────── Utility functions (reused from ai-news-radar) ──


def utc_now() -> datetime:
    return datetime.now(tz=UTC)


def iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_iso(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    try:
        dt = dtparser.parse(dt_str)
    except Exception:
        return None
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def normalize_url(raw_url: str) -> str:
    try:
        parsed = urlparse(raw_url.strip())
        if not parsed.scheme:
            return raw_url.strip()
        query = []
        for k, v in parse_qsl(parsed.query, keep_blank_values=True):
            lk = k.lower()
            if lk.startswith("utm_"):
                continue
            if lk in {"ref", "spm", "fbclid", "gclid", "igshid", "mkt_tok", "mc_cid", "mc_eid", "_hsenc", "_hsmi"}:
                continue
            query.append((k, v))
        parsed = parsed._replace(
            scheme=parsed.scheme.lower(),
            netloc=parsed.netloc.lower(),
            fragment="",
            query=urlencode(query, doseq=True),
        )
        normalized = urlunparse(parsed)
        return normalized.rstrip("/")
    except Exception:
        return raw_url.strip()


def host_of_url(raw_url: str) -> str:
    try:
        return urlparse(raw_url).netloc.lower()
    except Exception:
        return ""


def first_non_empty(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        s = str(value).strip()
        if s:
            return s
    return ""


def maybe_fix_mojibake(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return s
    if re.search(r"[Ãâåèæïð]|[\x80-\x9f]|æ|ç|å|é", s) is None:
        return s
    for enc in ("latin1", "cp1252"):
        try:
            fixed = s.encode(enc).decode("utf-8")
            if fixed and fixed != s:
                return fixed
        except Exception:
            continue
    return s


def has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))


def is_mostly_english(text: str) -> bool:
    s = (text or "").strip()
    if not s:
        return False
    if has_cjk(s):
        return False
    letters = re.findall(r"[A-Za-z]", s)
    return len(letters) >= max(6, len(s) // 4)


def strip_html_tags(html_str: str) -> str:
    """Remove HTML tags and return plain text."""
    if not html_str:
        return ""
    try:
        soup = BeautifulSoup(html_str, "html.parser")
        return soup.get_text(separator=" ", strip=True)
    except Exception:
        return re.sub(r"<[^>]+>", "", html_str).strip()


def make_item_id(site_id: str, source: str, title: str, url: str) -> str:
    key = "||".join([
        site_id.strip().lower(),
        source.strip().lower(),
        title.strip().lower(),
        normalize_url(url),
    ])
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def parse_unix_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        n = float(value)
    except Exception:
        return None
    if n > 10_000_000_000:
        n /= 1000.0
    try:
        return datetime.fromtimestamp(n, tz=UTC)
    except Exception:
        return None


def parse_relative_time_zh(text: str, now: datetime) -> datetime | None:
    text = (text or "").strip()
    if not text:
        return None
    m = re.search(r"(\d+)\s*分钟前", text)
    if m:
        return now - timedelta(minutes=int(m.group(1)))
    m = re.search(r"(\d+)\s*小时前", text)
    if m:
        return now - timedelta(hours=int(m.group(1)))
    m = re.search(r"(\d+)\s*天前", text)
    if m:
        return now - timedelta(days=int(m.group(1)))
    if "刚刚" in text:
        return now
    return None


def parse_date_any(value: Any, now: datetime) -> datetime | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    dt = parse_unix_timestamp(s)
    if dt:
        return dt
    dt = parse_iso(s)
    if dt:
        return dt
    dt = parse_relative_time_zh(s, now)
    if dt:
        return dt
    try:
        dt = dtparser.parse(s, fuzzy=True)
        if dt:
            if not dt.tzinfo:
                dt = dt.replace(tzinfo=UTC)
            return dt.astimezone(UTC)
    except Exception:
        pass
    return None


# ─────────────────────────── HTTP session ────────────────────────


def create_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=0.5, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": BROWSER_UA,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    })
    return session


# ─────────────────────────── RSS / OPML (reused) ─────────────────


def parse_feed_entries_via_xml(feed_xml: bytes) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    try:
        root = ET.fromstring(feed_xml)
    except Exception:
        return out
    for tag in (".//item", ".//{*}item", ".//entry", ".//{*}entry"):
        for node in root.findall(tag):
            title = (node.findtext("title") or node.findtext("{*}title") or "").strip()
            link = ""
            link_node = node.find("link")
            if link_node is not None:
                link = (link_node.get("href") or link_node.text or "").strip()
            if not link:
                link = (node.findtext("{*}link") or node.findtext("link") or "").strip()
            published = (
                node.findtext("pubDate") or node.findtext("{*}pubDate")
                or node.findtext("published") or node.findtext("{*}published")
                or node.findtext("updated") or node.findtext("{*}updated")
            )
            if title and link:
                key = (title, link)
                if key in seen:
                    continue
                seen.add(key)
                out.append({"title": title, "link": link, "published": published})
    return out


def parse_opml_subscriptions(opml_path: Path) -> list[dict[str, str]]:
    root = ET.parse(opml_path).getroot()
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for outline in root.findall(".//outline"):
        xml_url = str(outline.attrib.get("xmlUrl") or "").strip()
        if not xml_url or xml_url in seen:
            continue
        seen.add(xml_url)
        title = first_non_empty(outline.attrib.get("title"), outline.attrib.get("text"), host_of_url(xml_url), xml_url)
        html_url = str(outline.attrib.get("htmlUrl") or "").strip()
        out.append({"title": title, "xml_url": xml_url, "html_url": html_url})
    return out


def resolve_official_rss_url(feed_url: str) -> tuple[str | None, str | None]:
    src = (feed_url or "").strip()
    if not src:
        return None, "empty_url"
    if src in RSS_FEED_SKIP_EXACT:
        return None, "no_official_rss_or_unreachable"
    for prefix in RSS_FEED_SKIP_PREFIXES:
        if src.startswith(prefix):
            return None, "no_official_rss_for_source_type"
    replaced = RSS_FEED_REPLACEMENTS.get(src)
    if replaced:
        return replaced, "official_replacement"
    return src, None


def fetch_opml_rss(
    now: datetime,
    opml_path: Path,
    max_feeds: int = 0,
) -> tuple[list[RawItem], dict[str, Any], list[dict[str, Any]]]:
    feeds = parse_opml_subscriptions(opml_path)
    if max_feeds > 0:
        feeds = feeds[:max_feeds]

    out: list[RawItem] = []
    feed_statuses: list[dict[str, Any]] = []
    resolved_feeds: list[dict[str, str]] = []

    for feed in feeds:
        original_url = feed["xml_url"]
        resolved_url, skip_reason = resolve_official_rss_url(original_url)
        if not resolved_url:
            feed_id = hashlib.sha1(original_url.encode("utf-8")).hexdigest()[:10]
            feed_statuses.append({
                "site_id": f"opmlrss:{feed_id}", "site_name": "OPML RSS",
                "feed_title": feed["title"], "feed_url": original_url,
                "effective_feed_url": None, "ok": True, "item_count": 0,
                "duration_ms": 0, "error": None, "skipped": True,
                "skip_reason": skip_reason or "skipped", "replaced": False,
            })
            continue
        record = dict(feed)
        record["xml_url_original"] = original_url
        record["xml_url"] = resolved_url
        record["replaced"] = bool(resolved_url != original_url)
        resolved_feeds.append(record)

    def fetch_single_feed(feed: dict[str, str]) -> tuple[list[RawItem], dict[str, Any]]:
        feed_url = feed["xml_url"]
        original_feed_url = str(feed.get("xml_url_original") or feed_url)
        feed_title = feed["title"]
        feed_id = hashlib.sha1(feed_url.encode("utf-8")).hexdigest()[:10]
        start = time.perf_counter()
        error = None
        local_items: list[RawItem] = []
        try:
            resp = requests.get(feed_url, timeout=12, headers={
                "User-Agent": BROWSER_UA,
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            })
            resp.raise_for_status()
            if feedparser is not None:
                parsed = feedparser.parse(resp.content)
                source_name = first_non_empty(feed_title, getattr(parsed, "feed", {}).get("title"), host_of_url(feed_url))
                for entry in parsed.entries:
                    title = str(entry.get("title", "")).strip()
                    link = str(entry.get("link", "")).strip()
                    if not title or not link:
                        continue
                    published = (
                        parse_date_any(entry.get("published"), now)
                        or parse_date_any(entry.get("updated"), now)
                        or parse_date_any(entry.get("pubDate"), now)
                    )
                    if not published:
                        continue
                    local_items.append(RawItem(
                        site_id="opmlrss", site_name="OPML RSS", source=source_name,
                        title=title, url=link, published_at=published,
                        meta={"feed_url": feed_url, "feed_home": feed.get("html_url") or ""},
                    ))
            else:
                source_name = first_non_empty(feed_title, host_of_url(feed_url))
                for entry in parse_feed_entries_via_xml(resp.content):
                    published = parse_date_any(entry.get("published"), now)
                    if not published:
                        continue
                    local_items.append(RawItem(
                        site_id="opmlrss", site_name="OPML RSS", source=source_name,
                        title=entry.get("title", ""), url=entry.get("link", ""),
                        published_at=published,
                        meta={"feed_url": feed_url, "feed_home": feed.get("html_url") or ""},
                    ))
        except Exception as exc:
            error = str(exc)
        duration_ms = int((time.perf_counter() - start) * 1000)
        status = {
            "site_id": f"opmlrss:{feed_id}", "site_name": "OPML RSS",
            "feed_title": feed_title, "feed_url": original_feed_url,
            "effective_feed_url": feed_url, "ok": error is None,
            "item_count": len(local_items), "duration_ms": duration_ms,
            "error": error, "skipped": False, "skip_reason": None,
            "replaced": bool(original_feed_url != feed_url),
        }
        return local_items, status

    if resolved_feeds:
        worker_count = min(20, max(4, len(resolved_feeds)))
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = [executor.submit(fetch_single_feed, feed) for feed in resolved_feeds]
            for future in as_completed(futures):
                items, status = future.result()
                out.extend(items)
                feed_statuses.append(status)

    feed_statuses.sort(key=lambda x: str(x.get("feed_title") or x.get("feed_url") or ""))
    ok_feeds = sum(1 for s in feed_statuses if s["ok"] and not s.get("skipped"))
    failed_feeds = sum(1 for s in feed_statuses if not s["ok"])
    skipped_feeds = sum(1 for s in feed_statuses if s.get("skipped"))
    replaced_feeds = sum(1 for s in feed_statuses if s.get("replaced"))
    total_duration_ms = sum(int(s.get("duration_ms") or 0) for s in feed_statuses)

    summary_status = {
        "site_id": "opmlrss", "site_name": "OPML RSS",
        "ok": ok_feeds > 0, "partial_failures": failed_feeds,
        "item_count": len(out), "duration_ms": total_duration_ms,
        "error": None if failed_feeds == 0 else f"{failed_feeds} feeds failed",
        "feed_count": len(feeds), "effective_feed_count": len(resolved_feeds),
        "ok_feed_count": ok_feeds, "failed_feed_count": failed_feeds,
        "skipped_feed_count": skipped_feeds, "replaced_feed_count": replaced_feeds,
    }
    return out, summary_status, feed_statuses


# ─────────────────────────── Finance collectors ──────────────────


def fetch_wallstreetcn(session: requests.Session, now: datetime) -> list[RawItem]:
    """华尔街见闻 7x24 快讯 — REST API, multi-channel."""
    items: list[RawItem] = []
    for ch in WALLSTREETCN_CHANNELS:
        try:
            resp = session.get(WALLSTREETCN_URL, params={"channel": ch, "limit": WALLSTREETCN_LIMIT}, timeout=15)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            for it in data.get("items", []):
                title = str(it.get("title") or "").strip()
                if not title:
                    title = str(it.get("content_text") or "").strip()[:80]
                if not title:
                    continue
                item_id = it.get("id")
                url = f"https://wallstreetcn.com/live/{item_id}" if item_id else it.get("uri", "")
                if not url:
                    continue
                published = parse_unix_timestamp(it.get("display_time"))
                items.append(RawItem(
                    site_id="wallstreetcn", site_name="华尔街见闻",
                    source=ch.replace("-channel", ""),
                    title=title, url=url, published_at=published,
                    meta={"level": it.get("score", 0)},
                ))
        except Exception:
            continue
    return items


def fetch_jin10(session: requests.Session, now: datetime) -> list[RawItem]:
    """金十数据全球宏观快讯 — JSON API."""
    items: list[RawItem] = []
    try:
        resp = session.get(JIN10_URL, params=JIN10_PARAMS, timeout=15, headers={
            "User-Agent": BROWSER_UA,
            "x-app-id": "bVBF4FyRTn5NJF5n",
            "x-version": "1.0.0",
        })
        resp.raise_for_status()
        payload = resp.json()
        for it in payload.get("data", []):
            data_block = it.get("data", {})
            if not isinstance(data_block, dict):
                continue
            content = str(data_block.get("content") or "").strip()
            title = strip_html_tags(content)[:120]
            if not title:
                continue
            item_id = it.get("id", "")
            url = f"https://www.jin10.com/flash_detail/{item_id}.html" if item_id else ""
            if not url:
                continue
            published = parse_iso(it.get("time"))
            items.append(RawItem(
                site_id="jin10", site_name="金十数据", source="宏观快讯",
                title=title, url=url, published_at=published,
                meta={"important": it.get("important", 0)},
            ))
    except Exception:
        pass
    return items


def fetch_blockbeats(session: requests.Session, now: datetime) -> list[RawItem]:
    """律动 BlockBeats 加密快讯 — Official Open API."""
    items: list[RawItem] = []
    try:
        resp = session.get(BLOCKBEATS_URL, params=BLOCKBEATS_PARAMS, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        for it in payload.get("data", {}).get("data", []):
            title = str(it.get("title") or "").strip()
            if not title:
                title = strip_html_tags(str(it.get("content") or ""))[:100]
            if not title:
                continue
            url = str(it.get("url") or it.get("link") or "").strip()
            if not url:
                continue
            published = parse_unix_timestamp(it.get("create_time"))
            items.append(RawItem(
                site_id="blockbeats", site_name="律动BlockBeats", source="加密快讯",
                title=title, url=url, published_at=published, meta={},
            ))
    except Exception:
        pass
    return items


def fetch_cls(session: requests.Session, now: datetime) -> list[RawItem]:
    """财联社电报快讯 — JSON API."""
    items: list[RawItem] = []
    try:
        resp = session.get(CLS_URL, params=CLS_PARAMS, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        for it in payload.get("data", {}).get("roll_data", []):
            title = str(it.get("title") or "").strip()
            if not title:
                title = str(it.get("brief") or "").strip()[:100]
            if not title:
                title = strip_html_tags(str(it.get("content") or ""))[:100]
            if not title:
                continue
            url = str(it.get("shareurl") or "").strip()
            if not url:
                item_id = it.get("id")
                url = f"https://www.cls.cn/detail/{item_id}" if item_id else ""
            if not url:
                continue
            published = parse_unix_timestamp(it.get("ctime"))
            items.append(RawItem(
                site_id="cls", site_name="财联社", source="电报快讯",
                title=title, url=url, published_at=published,
                meta={"level": it.get("level", ""), "stocks": it.get("stock_list", [])},
            ))
    except Exception:
        pass
    return items


def fetch_eastmoney(session: requests.Session, now: datetime) -> list[RawItem]:
    """东方财富综合财经 — JSON API."""
    items: list[RawItem] = []
    try:
        params = dict(EASTMONEY_PARAMS_BASE)
        params["req_trace"] = str(int(now.timestamp() * 1000))
        params["page"] = "1"
        resp = session.get(EASTMONEY_URL, params=params, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        for it in payload.get("data", {}).get("list", []):
            title = str(it.get("title") or "").strip()
            if not title:
                continue
            url = str(it.get("uniqueUrl") or it.get("url") or "").strip()
            if not url:
                code = it.get("code")
                url = f"https://finance.eastmoney.com/a/{code}.html" if code else ""
            if not url:
                continue
            published = parse_date_any(it.get("showTime"), now)
            source = str(it.get("mediaName") or "东方财富").strip()
            items.append(RawItem(
                site_id="eastmoney", site_name="东方财富", source=source,
                title=title, url=url, published_at=published, meta={},
            ))
    except Exception:
        pass
    return items


def fetch_gelonghui(session: requests.Session, now: datetime) -> list[RawItem]:
    """格隆汇 7x24 快讯 — JSON API (Nuxt.js backend)."""
    items: list[RawItem] = []
    try:
        resp = session.get(GELONGHUI_URL, params=GELONGHUI_PARAMS, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        for it in payload.get("result", []):
            title = str(it.get("title") or "").strip()
            if not title:
                title = str(it.get("content") or "").strip()[:100]
            if not title:
                continue
            item_id = it.get("id")
            url = f"https://www.gelonghui.com/live/{item_id}" if item_id else ""
            if not url:
                continue
            published = parse_unix_timestamp(it.get("createTime") or it.get("create_time"))
            items.append(RawItem(
                site_id="gelonghui", site_name="格隆汇", source="快讯",
                title=title, url=url, published_at=published,
                meta={"level": it.get("level", 0)},
            ))
    except Exception:
        pass
    return items


# ─────────────────────────── Collector orchestration ─────────────


def collect_all(session: requests.Session, now: datetime) -> tuple[list[RawItem], list[dict[str, Any]]]:
    tasks = [
        ("wallstreetcn", "华尔街见闻", fetch_wallstreetcn),
        ("jin10", "金十数据", fetch_jin10),
        ("blockbeats", "律动BlockBeats", fetch_blockbeats),
        ("cls", "财联社", fetch_cls),
        ("eastmoney", "东方财富", fetch_eastmoney),
        ("gelonghui", "格隆汇", fetch_gelonghui),
    ]
    raw_items: list[RawItem] = []
    statuses: list[dict[str, Any]] = []
    for site_id, site_name, fn in tasks:
        start = time.perf_counter()
        error = None
        count = 0
        try:
            items = fn(session, now)
            count = len(items)
            raw_items.extend(items)
        except Exception as exc:
            error = str(exc)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        statuses.append({
            "site_id": site_id, "site_name": site_name,
            "ok": error is None, "item_count": count,
            "duration_ms": elapsed_ms, "error": error,
        })
    return raw_items, statuses


# ─────────────────────────── Finance filter & classification ─────


FINANCE_KEYWORDS_ZH = [
    "股市", "股票", "a股", "港股", "美股", "基金", "债券", "期货", "期权", "外汇",
    "指数", "大盘", "创业板", "科创板", "北交所", "纳斯达克", "道琼斯", "标普",
    "利率", "降息", "加息", "gdp", "cpi", "ppi", "pmi", "非农", "通胀", "通缩",
    "央行", "美联储", "欧央行", "日央行", "货币政策", "财政政策", "国债", "逆回购",
    "ipo", "并购", "增发", "回购", "分红", "财报", "营收", "利润", "减持", "增持",
    "涨停", "跌停", "牛市", "熊市", "做多", "做空", "融资融券", "北向资金",
    "大宗商品", "原油", "黄金", "白银", "铜", "铁矿石", "天然气", "煤炭",
    "比特币", "以太坊", "加密货币", "区块链", "数字货币", "稳定币", "defi",
]

FINANCE_KEYWORDS_EN = [
    "stock", "bond", "equity", "forex", "commodity", "futures", "options", "etf",
    "fed", "ecb", "boj", "pboc", "interest rate", "inflation", "deflation",
    "gdp", "cpi", "ppi", "pmi", "nonfarm", "payroll", "unemployment",
    "earnings", "revenue", "profit", "ipo", "m&a", "buyback", "dividend",
    "bitcoin", "ethereum", "crypto", "blockchain", "defi", "nft", "stablecoin",
    "bull", "bear", "rally", "selloff", "volatility", "vix",
    "s&p", "nasdaq", "dow jones", "russell", "ftse", "nikkei", "dax",
    "crude oil", "gold", "silver", "copper", "natural gas",
    "treasury", "yield", "spread", "credit",
]

EN_FINANCE_SIGNAL_RE = re.compile(
    r"(?i)(?<![a-z0-9])"
    r"(stock|bond|equity|forex|fed|ecb|boj|inflation|gdp|cpi|earnings|"
    r"ipo|m&a|bitcoin|ethereum|crypto|bull|bear|rally|selloff|"
    r"s&p|nasdaq|dow|treasury|yield|crude oil|gold|silver)"
    r"(?![a-z0-9])"
)

NOISE_KEYWORDS = [
    "娱乐", "明星", "八卦", "体育", "足球", "篮球", "电竞", "综艺",
    "菜谱", "旅游", "美食", "健身", "育儿", "星座", "宠物",
    "网红", "直播带货", "短视频",
]

MARKET_TAGS: dict[str, list[str]] = {
    "a_stock": ["a股", "沪深", "创业板", "科创板", "北交所", "沪指", "深成指", "上证"],
    "hk_stock": ["港股", "恒指", "恒生", "港交所", "南向资金"],
    "us_stock": ["美股", "纳斯达克", "道琼斯", "标普", "nasdaq", "dow", "s&p", "nyse"],
    "macro": ["央行", "美联储", "fed", "ecb", "gdp", "cpi", "利率", "通胀", "国债"],
    "crypto": ["比特币", "以太坊", "btc", "eth", "加密", "crypto", "blockchain", "defi"],
    "commodity": ["原油", "黄金", "白银", "铜", "crude", "gold", "silver", "oil"],
    "forex": ["外汇", "汇率", "美元", "欧元", "日元", "forex", "usd", "eur"],
}


def contains_any_keyword(haystack: str, keywords: list[str]) -> bool:
    """Both haystack and keywords must be lowercase."""
    return any(k in haystack for k in keywords)


def classify_market(title: str, source: str) -> list[str]:
    text = f"{title} {source}".lower()
    tags = []
    for tag, keywords in MARKET_TAGS.items():
        if any(kw in text for kw in keywords):
            tags.append(tag)
    return tags or ["general"]


def is_finance_related_record(record: dict[str, Any]) -> bool:
    site_id = str(record.get("site_id") or "")
    if site_id in FINANCE_PRO_SITES:
        return True

    title = str(record.get("title") or "")
    source = str(record.get("source") or "")
    text = f"{title} {source}".lower()

    if contains_any_keyword(text, NOISE_KEYWORDS):
        return False

    has_finance_zh = contains_any_keyword(text, FINANCE_KEYWORDS_ZH)
    has_finance_en = contains_any_keyword(text, FINANCE_KEYWORDS_EN) or EN_FINANCE_SIGNAL_RE.search(text) is not None

    return has_finance_zh or has_finance_en


def compute_importance(record: dict) -> str:
    meta = record.get("meta", {})
    if not isinstance(meta, dict):
        return "normal"
    site_id = record.get("site_id", "")
    if site_id == "wallstreetcn":
        return "high" if meta.get("level", 0) >= 2 else "normal"
    if site_id == "jin10":
        return "high" if meta.get("important", 0) >= 1 else "normal"
    if site_id == "cls":
        level = str(meta.get("level", "")).upper()
        if level == "A":
            return "high"
        if level == "B":
            return "medium"
        return "normal"
    if site_id == "gelonghui":
        return "high" if meta.get("level", 0) >= 2 else "normal"
    return "normal"


# ─────────────────────────── Translation (reused) ────────────────


def load_title_zh_cache(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items() if str(k).strip() and str(v).strip()}
    except Exception:
        pass
    return {}


def translate_to_zh_cn(session: requests.Session, text: str) -> str | None:
    s = (text or "").strip()
    if not s:
        return None
    try:
        r = session.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "auto", "tl": "zh-CN", "dt": "t", "q": s},
            timeout=12,
        )
        r.raise_for_status()
        payload = r.json()
        if not isinstance(payload, list) or not payload:
            return None
        segs = payload[0]
        if not isinstance(segs, list):
            return None
        translated = "".join(str(seg[0]) for seg in segs if isinstance(seg, list) and seg and seg[0])
        translated = translated.strip()
        if translated and translated != s:
            return translated
    except Exception:
        return None
    return None


def add_bilingual_fields(
    items_finance: list[dict[str, Any]],
    items_all: list[dict[str, Any]],
    session: requests.Session,
    cache: dict[str, str],
    max_new_translations: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str]]:
    zh_by_url: dict[str, str] = {}
    for it in items_all:
        title = str(it.get("title") or "").strip()
        url = normalize_url(str(it.get("url") or ""))
        if title and url and has_cjk(title):
            zh_by_url[url] = title

    translated_now = 0

    def enrich(item: dict[str, Any], allow_translate: bool) -> dict[str, Any]:
        nonlocal translated_now
        out = dict(item)
        title = str(out.get("title") or "").strip()
        url = normalize_url(str(out.get("url") or ""))
        out["title_original"] = title
        out["title_en"] = None
        out["title_zh"] = None
        out["title_bilingual"] = title

        if has_cjk(title):
            out["title_zh"] = title
            return out
        if not is_mostly_english(title):
            return out
        out["title_en"] = title
        zh_title = zh_by_url.get(url)
        if not zh_title:
            zh_title = cache.get(title)
        if not zh_title and allow_translate and translated_now < max_new_translations:
            tr = translate_to_zh_cn(session, title)
            if tr and has_cjk(tr):
                zh_title = tr
                cache[title] = tr
                translated_now += 1
        if zh_title:
            out["title_zh"] = zh_title
            out["title_bilingual"] = f"{zh_title} / {title}"
        return out

    finance_out = [enrich(it, allow_translate=True) for it in items_finance]
    all_out = [enrich(it, allow_translate=False) for it in items_all]
    return finance_out, all_out, cache


# ─────────────────────────── Dedup & archive (reused) ────────────


def event_time(record: dict[str, Any]) -> datetime | None:
    if str(record.get("site_id") or "") == "opmlrss":
        return parse_iso(record.get("published_at"))
    return parse_iso(record.get("published_at")) or parse_iso(record.get("first_seen_at"))


def load_archive(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    items = payload.get("items", [])
    out: dict[str, dict[str, Any]] = {}
    if isinstance(items, list):
        for it in items:
            item_id = it.get("id")
            if item_id:
                out[item_id] = it
    elif isinstance(items, dict):
        for item_id, it in items.items():
            if isinstance(it, dict):
                it["id"] = item_id
                out[item_id] = it
    return out


def dedupe_items_by_title_url(items: list[dict[str, Any]], random_pick: bool = True) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        title = str(item.get("title_original") or item.get("title") or "").strip().lower()
        url = normalize_url(str(item.get("url") or ""))
        key = f"{title}||{url}"
        groups.setdefault(key, []).append(item)

    out: list[dict[str, Any]] = []
    for values in groups.values():
        if random_pick:
            out.append(random.choice(values))
        else:
            chosen = max(
                values,
                key=lambda x: (event_time(x) or datetime.min.replace(tzinfo=UTC), str(x.get("id") or "")),
            )
            out.append(chosen)

    out.sort(key=lambda x: event_time(x) or datetime.min.replace(tzinfo=UTC), reverse=True)
    return out


def normalize_source_for_display(site_id: str, source: str, url: str) -> str:
    src = (source or "").strip()
    if not src:
        host = host_of_url(url)
        if host.startswith("www."):
            host = host[4:]
        return host or "未分区"
    return src


# ─────────────────────────── Main pipeline ───────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Aggregate finance news updates from multiple sources")
    parser.add_argument("--output-dir", default="data", help="Directory for output JSON files")
    parser.add_argument("--window-hours", type=int, default=24, help="24h window size")
    parser.add_argument("--archive-days", type=int, default=45, help="Keep archive for N days")
    parser.add_argument("--translate-max-new", type=int, default=80, help="Max new EN->ZH title translations per run")
    parser.add_argument("--rss-opml", default="", help="Optional OPML file path to include RSS sources")
    parser.add_argument("--rss-max-feeds", type=int, default=0, help="Optional max OPML RSS feeds to fetch (0=all)")
    args = parser.parse_args()

    now = utc_now()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    archive_path = output_dir / "archive.json"
    latest_path = output_dir / "latest-24h.json"
    status_path = output_dir / "source-status.json"
    title_cache_path = output_dir / "title-zh-cache.json"

    archive = load_archive(archive_path)
    session = create_session()

    # ── Collect from built-in sources ──
    raw_items, statuses = collect_all(session, now)
    rss_feed_statuses: list[dict[str, Any]] = []

    # ── Collect from OPML RSS ──
    if args.rss_opml:
        opml_path = Path(args.rss_opml).expanduser()
        if opml_path.exists():
            rss_items, rss_summary_status, rss_feed_statuses = fetch_opml_rss(
                now, opml_path, max_feeds=max(0, int(args.rss_max_feeds)),
            )
            raw_items.extend(rss_items)
            statuses.append(rss_summary_status)
        else:
            statuses.append({
                "site_id": "opmlrss", "site_name": "OPML RSS",
                "ok": False, "item_count": 0, "duration_ms": 0,
                "error": f"OPML not found: {opml_path}",
                "feed_count": 0, "ok_feed_count": 0, "failed_feed_count": 0,
            })

    # ── Update archive ──
    for raw in raw_items:
        title = raw.title.strip()
        url = normalize_url(raw.url)
        if not title or not url or not url.startswith("http"):
            continue
        item_id = make_item_id(raw.site_id, raw.source, title, url)
        existing = archive.get(item_id)
        if existing is None:
            archive[item_id] = {
                "id": item_id, "site_id": raw.site_id, "site_name": raw.site_name,
                "source": raw.source, "title": title, "url": url,
                "published_at": iso(raw.published_at),
                "first_seen_at": iso(now), "last_seen_at": iso(now),
                "meta": raw.meta,
            }
        else:
            existing["site_id"] = raw.site_id
            existing["site_name"] = raw.site_name
            existing["source"] = raw.source
            existing["title"] = title
            existing["url"] = url
            if raw.published_at:
                if raw.site_id == "opmlrss" or not existing.get("published_at"):
                    existing["published_at"] = iso(raw.published_at)
            existing["last_seen_at"] = iso(now)
            existing["meta"] = raw.meta

    # ── Prune old archive ──
    keep_after = now - timedelta(days=args.archive_days)
    pruned: dict[str, dict[str, Any]] = {}
    for item_id, record in archive.items():
        ts = (
            parse_iso(record.get("last_seen_at"))
            or parse_iso(record.get("published_at"))
            or parse_iso(record.get("first_seen_at"))
            or now
        )
        if ts >= keep_after:
            pruned[item_id] = record
    archive = pruned

    # ── 24h window ──
    window_start = now - timedelta(hours=args.window_hours)
    latest_items_all: list[dict[str, Any]] = []
    for record in archive.values():
        ts = event_time(record)
        if not ts or ts < window_start:
            continue
        normalized = dict(record)
        normalized["title"] = maybe_fix_mojibake(str(normalized.get("title") or ""))
        normalized["source"] = maybe_fix_mojibake(normalize_source_for_display(
            str(normalized.get("site_id") or ""),
            str(normalized.get("source") or ""),
            str(normalized.get("url") or ""),
        ))
        latest_items_all.append(normalized)

    latest_items_all.sort(key=lambda x: event_time(x) or datetime.min.replace(tzinfo=UTC), reverse=True)

    # ── Finance filter + market classification ──
    latest_items_finance = [r for r in latest_items_all if is_finance_related_record(r)]
    for item in latest_items_finance:
        item["market_tags"] = classify_market(
            str(item.get("title") or ""), str(item.get("source") or ""),
        )
    for item in latest_items_all:
        if "market_tags" not in item:
            item["market_tags"] = classify_market(
                str(item.get("title") or ""), str(item.get("source") or ""),
            )

    # ── Importance markers ──
    for item in latest_items_finance:
        item["importance"] = compute_importance(item)
    for item in latest_items_all:
        item["importance"] = compute_importance(item)

    # ── Bilingual titles ──
    title_cache = load_title_zh_cache(title_cache_path)
    latest_items_finance, latest_items_all, title_cache = add_bilingual_fields(
        latest_items_finance, latest_items_all, session, title_cache,
        max_new_translations=max(0, args.translate_max_new),
    )

    # ── Deduplicate ──
    items_finance_dedup = dedupe_items_by_title_url(latest_items_finance, random_pick=False)
    items_all_dedup = dedupe_items_by_title_url(latest_items_all, random_pick=True)

    # ── Site stats ──
    site_stat: dict[str, dict[str, Any]] = {}
    raw_count_by_site: dict[str, int] = {}
    for record in latest_items_all:
        sid = record["site_id"]
        raw_count_by_site[sid] = raw_count_by_site.get(sid, 0) + 1

    site_name_by_id: dict[str, str] = {}
    for record in latest_items_all:
        site_name_by_id[record["site_id"]] = record["site_name"]
    for s in statuses:
        sid = s["site_id"]
        if sid not in site_name_by_id:
            site_name_by_id[sid] = s.get("site_name") or sid

    for record in items_finance_dedup:
        sid = record["site_id"]
        if sid not in site_stat:
            site_stat[sid] = {
                "site_id": sid, "site_name": record["site_name"],
                "count": 0, "raw_count": raw_count_by_site.get(sid, 0),
            }
        site_stat[sid]["count"] += 1

    for sid, site_name in site_name_by_id.items():
        if sid in site_stat:
            continue
        site_stat[sid] = {
            "site_id": sid, "site_name": site_name,
            "count": 0, "raw_count": raw_count_by_site.get(sid, 0),
        }

    # ── Output JSON files ──
    latest_payload = {
        "generated_at": iso(now),
        "window_hours": args.window_hours,
        "total_items": len(items_finance_dedup),
        "total_items_finance_raw": len(latest_items_finance),
        "total_items_raw": len(latest_items_all),
        "total_items_all_mode": len(items_all_dedup),
        "topic_filter": "finance",
        "archive_total": len(archive),
        "site_count": len(site_stat),
        "source_count": len({f"{i['site_id']}::{i['source']}" for i in items_finance_dedup}),
        "site_stats": sorted(site_stat.values(), key=lambda x: x["count"], reverse=True),
        "items": items_finance_dedup,
        "items_finance": items_finance_dedup,
        "items_all_raw": latest_items_all,
        "items_all": items_all_dedup,
    }

    archive_payload = {
        "generated_at": iso(now),
        "total_items": len(archive),
        "items": sorted(
            archive.values(),
            key=lambda x: parse_iso(x.get("last_seen_at")) or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        ),
    }

    status_payload = {
        "generated_at": iso(now),
        "sites": statuses,
        "successful_sites": sum(1 for s in statuses if s["ok"]),
        "failed_sites": [s["site_id"] for s in statuses if not s["ok"]],
        "zero_item_sites": [s["site_id"] for s in statuses if s.get("ok") and int(s.get("item_count") or 0) == 0],
        "fetched_raw_items": len(raw_items),
        "items_before_topic_filter": len(latest_items_all),
        "items_in_24h": len(items_finance_dedup),
        "rss_opml": {
            "enabled": bool(args.rss_opml),
            "path": str(Path(args.rss_opml).expanduser()) if args.rss_opml else None,
            "feed_total": len(rss_feed_statuses),
            "effective_feed_total": sum(1 for s in rss_feed_statuses if not s.get("skipped")),
            "ok_feeds": sum(1 for s in rss_feed_statuses if s["ok"] and not s.get("skipped")),
            "failed_feeds": [s.get("effective_feed_url") or s["feed_url"] for s in rss_feed_statuses if not s["ok"]],
            "zero_item_feeds": [
                s.get("effective_feed_url") or s["feed_url"]
                for s in rss_feed_statuses
                if s["ok"] and not s.get("skipped") and int(s.get("item_count") or 0) == 0
            ],
            "skipped_feeds": [
                {"feed_url": s["feed_url"], "reason": s.get("skip_reason")}
                for s in rss_feed_statuses if s.get("skipped")
            ],
            "replaced_feeds": [
                {"from": s["feed_url"], "to": s.get("effective_feed_url")}
                for s in rss_feed_statuses if s.get("replaced") and s.get("effective_feed_url")
            ],
            "feeds": rss_feed_statuses,
        },
    }

    latest_path.write_text(json.dumps(latest_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    archive_path.write_text(json.dumps(archive_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    status_path.write_text(json.dumps(status_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    title_cache_path.write_text(json.dumps(title_cache, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote: {latest_path} ({len(items_finance_dedup)} finance items, {len(latest_items_all)} total)")
    print(f"Wrote: {archive_path} ({len(archive)} items)")
    print(f"Wrote: {status_path}")
    print(f"Wrote: {title_cache_path} ({len(title_cache)} entries)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
