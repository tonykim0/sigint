"""Investor summary aggregation."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from cache_utils import TTLCache
from kis_client import KISError, inquire_investor
from universe import get_trading_universe

_CACHE = TTLCache[str, dict[str, Any]](ttl=360.0)
_FULL_SUMMARY_SIZE = 60


def _build_full_summary(force: bool = False) -> list[dict[str, Any]]:
    rank = get_trading_universe(limit=_FULL_SUMMARY_SIZE, force=force)

    def fetch(stock: dict[str, Any]) -> dict[str, Any]:
        try:
            rows = inquire_investor(stock["code"])
            latest = rows[0] if rows else {}
        except KISError:
            latest = {}
        return {
            "code": stock["code"],
            "name": stock["name"],
            "price": stock["price"],
            "change_rate": stock["change_rate"],
            "trade_value": stock.get("trade_value", 0),
            "foreign_value": latest.get("foreign_value", 0),
            "institution_value": latest.get("institution_value", 0),
            "individual_value": latest.get("individual_value", 0),
        }

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(fetch, rank))

    results.sort(key=lambda row: -(row.get("trade_value") or 0))
    return results


def get_investor_summary(top_n: int = 10, force: bool = False) -> dict[str, Any]:
    payload = _CACHE.get_or_set(
        "investor_summary",
        lambda: {"items": _build_full_summary(force=force)},
        force=force,
    )
    return {"items": payload["items"][:top_n]}
