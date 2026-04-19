"""KOSPI / KOSDAQ 시장별 투자자 수급 집계.

KIS OpenAPI 가 시장 전체 투자자 매매동향 TR을 노출하지 않는 범위에서
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
_CACHE_TTL = 180.0  # 3분
_LOCK = threading.Lock()


def _aggregate(market: str, top_n: int = 10) -> dict[str, Any]:
    try:
        rank = volume_rank(market)[:top_n]
    except KISError:
        return {"foreign": 0, "institution": 0, "individual": 0, "count": 0}

    sums = {"foreign": 0, "institution": 0, "individual": 0}
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {r["code"]: ex.submit(inquire_investor, r["code"]) for r in rank}
        for code, f in futures.items():
            try:
                rows = f.result()
                latest = rows[0] if rows else {}
                sums["foreign"] += int(latest.get("foreign_value", 0) or 0)
                sums["institution"] += int(latest.get("institution_value", 0) or 0)
                sums["individual"] += int(latest.get("individual_value", 0) or 0)
            except KISError:
                continue
    sums["count"] = len(rank)
    return sums


def market_flow(force: bool = False) -> dict[str, Any]:
    """KOSPI/KOSDAQ 현물 수급 (개인/기관/외인 순매수 합계)."""
    now = time.time()
    with _LOCK:
        if not force and _CACHE["data"] and now - _CACHE["ts"] < _CACHE_TTL:
            return _CACHE["data"]

    with ThreadPoolExecutor(max_workers=2) as ex:
        kospi_f = ex.submit(_aggregate, "KOSPI", 10)
        kosdaq_f = ex.submit(_aggregate, "KOSDAQ", 10)
        kospi = kospi_f.result()
        kosdaq = kosdaq_f.result()

    result = {
        "kospi": kospi,
        "kosdaq": kosdaq,
        "type": "현물",
        "note": "거래대금 상위 10종목 순매수 합계 (근사치)",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "cached_ttl": _CACHE_TTL,
    }

    with _LOCK:
        _CACHE["data"] = result
        _CACHE["ts"] = now
    return result
