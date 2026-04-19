"""KOSPI / KOSDAQ 시장별 투자자 수급 집계 (당일 + 30일 히스토리).

KIS OpenAPI 시장 전체 투자자 매매동향 TR이 공개 범위에 없어서
거래대금 상위 10종목의 투자자별 순매수를 합산해 근사치로 제공한다.
3분 메모리 캐시.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

from kis_client import KISError, inquire_investor, volume_rank

_CACHE: dict[str, Any] = {"data": None, "ts": 0.0}
_CACHE_TTL = 360.0  # 6분 (워밍업 주기 5분 + 여유)
_LOCK = threading.Lock()


def _aggregate(market: str, top_n: int = 10, history_days: int = 30) -> dict[str, Any]:
    try:
        rank = volume_rank(market)[:top_n]
    except KISError:
        return {
            "foreign": 0, "institution": 0, "individual": 0, "count": 0,
            "history": [],
        }

    # date → {foreign, institution, individual}
    daily: dict[str, dict[str, int]] = {}
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {r["code"]: ex.submit(inquire_investor, r["code"]) for r in rank}
        for code, f in futures.items():
            try:
                rows = f.result()
            except KISError:
                continue
            for row in rows:
                date = row.get("date", "")
                if not date:
                    continue
                d = daily.setdefault(
                    date, {"foreign": 0, "institution": 0, "individual": 0}
                )
                d["foreign"] += int(row.get("foreign_value", 0) or 0)
                d["institution"] += int(row.get("institution_value", 0) or 0)
                d["individual"] += int(row.get("individual_value", 0) or 0)

    # 최신 날짜 내림차순 → 자르고 다시 오름차순
    sorted_dates = sorted(daily.keys(), reverse=True)[:history_days]
    history = [{"date": d, **daily[d]} for d in sorted(sorted_dates)]

    # 최신 = 가장 최근 날짜
    latest = history[-1] if history else {"foreign": 0, "institution": 0, "individual": 0}

    return {
        "foreign": latest.get("foreign", 0),
        "institution": latest.get("institution", 0),
        "individual": latest.get("individual", 0),
        "count": len(rank),
        "history": history,
    }


def market_flow(force: bool = False) -> dict[str, Any]:
    """KOSPI/KOSDAQ 현물 수급 + 최근 30일 히스토리."""
    now = time.time()
    with _LOCK:
        if not force and _CACHE["data"] and now - _CACHE["ts"] < _CACHE_TTL:
            return _CACHE["data"]

    with ThreadPoolExecutor(max_workers=2) as ex:
        kospi_f = ex.submit(_aggregate, "KOSPI", 10, 30)
        kosdaq_f = ex.submit(_aggregate, "KOSDAQ", 10, 30)
        kospi = kospi_f.result()
        kosdaq = kosdaq_f.result()

    result = {
        "kospi": kospi,
        "kosdaq": kosdaq,
        "type": "현물",
        "note": "거래대금 상위 10종목 순매수 합계 (근사치) · 최근 30일",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "cached_ttl": _CACHE_TTL,
    }

    with _LOCK:
        _CACHE["data"] = result
        _CACHE["ts"] = now
    return result
