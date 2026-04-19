"""Chart analysis composition helpers."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import analyzers
import stock_db
from kis_client import KISError, daily_chart, inquire_price


def get_chart_analysis_payload(code: str, days: int = 120) -> dict[str, Any]:
    def load_price() -> dict[str, Any] | None:
        try:
            data = inquire_price(code)
        except KISError:
            return None
        data["name"] = stock_db.get_name(code)
        return data

    def load_chart() -> dict[str, Any] | None:
        try:
            bars = daily_chart(code, days=max(days, 300))
        except KISError:
            return None
        sliced = bars[-days:] if len(bars) > days else bars
        return {
            "bars": sliced,
            "analysis": analyzers.analyze(sliced),
            "_full_bars": bars,
        }

    with ThreadPoolExecutor(max_workers=2) as executor:
        price_future = executor.submit(load_price)
        chart_future = executor.submit(load_chart)
        price = price_future.result()
        chart = chart_future.result()

    full_bars = chart.get("_full_bars") if chart else []
    patterns = {
        "trendTemplate": analyzers.trend_template(full_bars) if full_bars else None,
        "vcp": analyzers.vcp_pattern(full_bars) if full_bars else None,
        "darvas": analyzers.darvas_box(full_bars) if full_bars else None,
        "refCandles": {
            "count": 0,
            "candles": analyzers.reference_candle_scan(full_bars, lookback=10),
        }
        if full_bars
        else None,
    }
    if patterns["refCandles"]:
        patterns["refCandles"]["count"] = len(patterns["refCandles"]["candles"])

    chart_out = None
    if chart:
        chart_out = {
            "code": code,
            "bars": chart["bars"],
            "count": len(chart["bars"]),
            "analysis": chart["analysis"],
        }

    return {"price": price, "chart": chart_out, "patterns": patterns}
