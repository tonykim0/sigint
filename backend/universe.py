"""Shared trading universe rules."""
from __future__ import annotations

from typing import Any

from kis_client import volume_rank

MARKET_PATTERN = r"^(ALL|KOSPI|KOSDAQ)$"
MIN_TRADE_VALUE = 10_000_000_000  # 100억
ETF_PREFIXES = (
    "KODEX",
    "TIGER",
    "KBSTAR",
    "ACE",
    "ARIRANG",
    "HANARO",
    "KOSEF",
    "KINDEX",
    "FOCUS",
    "SOL",
    "TIMEFOLIO",
    "PLUS",
    "TREX",
    "RISE",
)


def is_etf(name: str) -> bool:
    normalized = (name or "").upper()
    if " ETN" in normalized:
        return True
    return any(normalized.startswith(prefix) for prefix in ETF_PREFIXES)


def is_preferred(name: str) -> bool:
    if not name:
        return False
    if name.endswith("우") or name.endswith("우B"):
        return True
    return "2우B" in name


def filter_trade_rank_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        row
        for row in items
        if not is_etf(row.get("name", ""))
        and not is_preferred(row.get("name", ""))
        and (row.get("trade_value") or 0) >= MIN_TRADE_VALUE
    ]


def get_trading_universe(
    market: str = "ALL",
    limit: int = 60,
    force: bool = False,
) -> list[dict[str, Any]]:
    ranked = volume_rank(market=market, force=force)
    return filter_trade_rank_items(ranked)[:limit]


def universe_filters() -> dict[str, Any]:
    return {
        "exclude_etf": True,
        "exclude_preferred": True,
        "min_trade_value": MIN_TRADE_VALUE,
    }
