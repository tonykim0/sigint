"""Approximate market flow from the filtered trading universe."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

from cache_utils import TTLCache
from kis_client import KISError, inquire_investor
from universe import get_trading_universe

_CACHE = TTLCache[str, dict[str, Any]](ttl=360.0)


def _aggregate(
    market: str,
    top_n: int = 10,
    history_days: int = 30,
    force: bool = False,
) -> dict[str, Any]:
    try:
        rank = get_trading_universe(market=market, limit=top_n, force=force)
    except KISError:
        return {
            "foreign": 0,
            "institution": 0,
            "individual": 0,
            "count": 0,
            "history": [],
        }

    daily: dict[str, dict[str, int]] = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {row["code"]: executor.submit(inquire_investor, row["code"]) for row in rank}
        for future in futures.values():
            try:
                rows = future.result()
            except KISError:
                continue
            for row in rows:
                date = row.get("date", "")
                if not date:
                    continue
                bucket = daily.setdefault(
                    date,
                    {"foreign": 0, "institution": 0, "individual": 0},
                )
                bucket["foreign"] += int(row.get("foreign_value", 0) or 0)
                bucket["institution"] += int(row.get("institution_value", 0) or 0)
                bucket["individual"] += int(row.get("individual_value", 0) or 0)

    sorted_dates = sorted(daily.keys(), reverse=True)[:history_days]
    history = [{"date": date, **daily[date]} for date in sorted(sorted_dates)]
    latest = history[-1] if history else {"foreign": 0, "institution": 0, "individual": 0}

    return {
        "foreign": latest.get("foreign", 0),
        "institution": latest.get("institution", 0),
        "individual": latest.get("individual", 0),
        "count": len(rank),
        "history": history,
    }


def market_flow(force: bool = False) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        with ThreadPoolExecutor(max_workers=2) as executor:
            kospi_future = executor.submit(_aggregate, "KOSPI", 10, 30, force)
            kosdaq_future = executor.submit(_aggregate, "KOSDAQ", 10, 30, force)
            kospi = kospi_future.result()
            kosdaq = kosdaq_future.result()
        return {
            "kospi": kospi,
            "kosdaq": kosdaq,
            "type": "현물",
            "note": "ETF/우선주 제외 대표 10종목 순매수 합계(근사치) · 최근 30일",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "cached_ttl": _CACHE.ttl,
        }

    return _CACHE.get_or_set("market_flow", build, force=force)
