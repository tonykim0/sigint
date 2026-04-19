"""Theme trend aggregation for the filtered trading universe."""
from __future__ import annotations

import json
import pathlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

from cache_utils import TTLCache
from kis_client import KISError, daily_chart
from universe import get_trading_universe

_CACHE = TTLCache[str, dict[str, Any]](ttl=900.0)
_THEMES_PATH = pathlib.Path(__file__).parent / "data" / "themes.json"
_MAX_WORKERS = 6


def _load_themes() -> dict[str, dict[str, Any]]:
    if not _THEMES_PATH.exists():
        return {}
    with _THEMES_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle).get("themes", {})


def _code_to_theme(themes: dict[str, dict[str, Any]]) -> dict[str, tuple[str, str]]:
    mapping: dict[str, tuple[str, str]] = {}
    for theme, info in themes.items():
        if theme.startswith("ETF"):
            continue
        color = info.get("color", "#4b5563")
        for code in info.get("codes", []):
            mapping[code] = (theme, color)
    return mapping


def theme_trend(days: int = 7, limit: int = 60, force: bool = False) -> dict[str, Any]:
    key = f"theme-trend:{days}:{limit}"

    def build() -> dict[str, Any]:
        stocks = get_trading_universe(limit=limit, force=force)
        themes = _load_themes()
        code_map = _code_to_theme(themes)
        themed_stocks = [stock for stock in stocks if stock["code"] in code_map] or stocks

        def fetch(code: str) -> list[dict[str, Any]]:
            try:
                return daily_chart(code, days=days + 3)[-days:]
            except KISError:
                return []

        max_workers = min(_MAX_WORKERS, max(len(themed_stocks), 1))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            bars_map = {
                stock["code"]: executor.submit(fetch, stock["code"])
                for stock in themed_stocks
            }
            bars_map = {code: future.result() for code, future in bars_map.items()}

        theme_daily: dict[str, dict[str, int]] = {}
        theme_color: dict[str, str] = {}
        for stock in themed_stocks:
            theme, color = code_map.get(stock["code"], ("기타", "#4b5563"))
            theme_color[theme] = color
            for bar in bars_map.get(stock["code"], []):
                daily = theme_daily.setdefault(theme, {})
                daily[bar["date"]] = daily.get(bar["date"], 0) + int(bar.get("trade_value", 0) or 0)

        themes_out = []
        for theme, daily in theme_daily.items():
            dates = sorted(daily.keys())
            series = [{"date": date, "value": daily[date]} for date in dates]
            total = sum(daily.values())
            first_half = sum(daily[date] for date in dates[: len(dates) // 2]) if dates else 0
            second_half = sum(daily[date] for date in dates[len(dates) // 2 :]) if dates else 0
            change_pct = None
            if first_half > 0:
                change_pct = (second_half - first_half) / first_half * 100
            themes_out.append(
                {
                    "theme": theme,
                    "color": theme_color.get(theme, "#4b5563"),
                    "total": total,
                    "change_pct": round(change_pct, 1) if change_pct is not None else None,
                    "series": series,
                }
            )

        themes_out.sort(key=lambda row: -row["total"])
        return {
            "days": days,
            "count": len(themed_stocks),
            "universe_count": len(stocks),
            "themes": themes_out,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
        }

    return _CACHE.get_or_set(key, build, force=force)
