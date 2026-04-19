"""테마별 최근 N일 거래대금 트렌드.

현재 거래대금 상위 60종목 × 최근 N일 일봉 → 테마별 일별 합산.
10분 메모리 캐시.
"""
from __future__ import annotations

import json
import pathlib
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

from kis_client import KISError, daily_chart, volume_rank

_CACHE: dict[str, Any] = {"data": None, "ts": 0.0}
_CACHE_TTL = 900.0  # 15분
_LOCK = threading.Lock()

_THEMES_PATH = pathlib.Path(__file__).parent / "data" / "themes.json"

_ETF_PREFIXES = [
    "KODEX", "TIGER", "KBSTAR", "ACE", "ARIRANG", "HANARO", "KOSEF",
    "KINDEX", "FOCUS", "SOL", "TIMEFOLIO", "PLUS", "TREX", "RISE",
]


def _is_etf(name: str) -> bool:
    n = (name or "").upper()
    if " ETN" in n:
        return True
    return any(n.startswith(p) for p in _ETF_PREFIXES)


def _is_preferred(name: str) -> bool:
    if not name:
        return False
    # '우', '우B', '2우B' 같은 패턴
    if name.endswith("우") or name.endswith("우B"):
        return True
    if "2우B" in name:
        return True
    return False


def _load_themes() -> dict[str, dict[str, Any]]:
    if not _THEMES_PATH.exists():
        return {}
    with _THEMES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f).get("themes", {})


def _code_to_theme(themes: dict[str, dict[str, Any]]) -> dict[str, tuple[str, str]]:
    m: dict[str, tuple[str, str]] = {}
    for theme, info in themes.items():
        if theme.startswith("ETF"):
            continue
        color = info.get("color", "#4b5563")
        for c in info.get("codes", []):
            m[c] = (theme, color)
    return m


def theme_trend(days: int = 7, force: bool = False) -> dict[str, Any]:
    """테마별 최근 N일 거래대금 트렌드."""
    now = time.time()
    with _LOCK:
        if not force and _CACHE["data"] and now - _CACHE["ts"] < _CACHE_TTL:
            return _CACHE["data"]

    try:
        rank = volume_rank("ALL")
    except KISError as exc:
        raise exc

    # ETF/우선주/100억 미만 제거 후 상위 60개
    stocks = [
        r for r in rank
        if not _is_etf(r["name"]) and not _is_preferred(r["name"])
        and r["trade_value"] >= 10_000_000_000
    ][:60]

    themes = _load_themes()
    code_map = _code_to_theme(themes)

    def fetch(code: str) -> list[dict[str, Any]]:
        try:
            return daily_chart(code, days=days + 3)[-days:]
        except KISError:
            return []

    with ThreadPoolExecutor(max_workers=3) as ex:
        bars_map = {s["code"]: ex.submit(fetch, s["code"]) for s in stocks}
        bars_map = {c: f.result() for c, f in bars_map.items()}

    # theme → date → value
    theme_daily: dict[str, dict[str, int]] = {}
    theme_color: dict[str, str] = {}
    for s in stocks:
        theme, color = code_map.get(s["code"], ("기타", "#4b5563"))
        theme_color[theme] = color
        for b in bars_map.get(s["code"], []):
            daily = theme_daily.setdefault(theme, {})
            daily[b["date"]] = daily.get(b["date"], 0) + int(b.get("trade_value", 0) or 0)

    themes_out = []
    for theme, daily in theme_daily.items():
        dates = sorted(daily.keys())
        series = [{"date": d, "value": daily[d]} for d in dates]
        total = sum(daily.values())
        # 최근 대비 그 이전 변화율
        first_half = sum(daily[d] for d in dates[: len(dates) // 2]) if dates else 0
        second_half = sum(daily[d] for d in dates[len(dates) // 2 :]) if dates else 0
        if first_half > 0:
            change_pct = (second_half - first_half) / first_half * 100
        else:
            change_pct = None
        themes_out.append({
            "theme": theme,
            "color": theme_color.get(theme, "#4b5563"),
            "total": total,
            "change_pct": round(change_pct, 1) if change_pct is not None else None,
            "series": series,
        })

    themes_out.sort(key=lambda x: -x["total"])

    result = {
        "days": days,
        "count": len(stocks),
        "themes": themes_out,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }

    with _LOCK:
        _CACHE["data"] = result
        _CACHE["ts"] = now
    return result
