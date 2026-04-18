"""스크리너 모음: 종가배팅 · 눌림목 스윙 · 돌파 스윙 · 시황 판단.

거래대금 TOP 50 종목에 대해 필터 5개를 평가하고 pass_count와 함께 반환.
(6번째 '재료/이슈'는 프론트에서 수동 메모로 처리.)

필터:
  1. volume_rank    : TOP 50 이내 → 항상 True (선별 기준)
  2. dual_buy       : 최근 영업일 외국인 + 기관 동시 순매수 금액 > 0
  3. intraday_trend : 14:00 이후 30분봉 구간에서 현재가 위치 >= 저점~고점의 중간
  4. relative_strength : 종목 등락률 > KOSPI 등락률 AND 종목 등락률 > 0
  5. chart_position : 현재가 >= 60일 최고가의 90%

동시성은 ThreadPoolExecutor(5) — 종목당 3 call × 50 = 150 call 을 약 5~10초에 끝낸다.
결과는 TTL 60초 메모리 캐시.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

import analyzers
from kis_client import (
    KISError,
    aggregate_minute_bars,
    daily_chart,
    daily_index_chart,
    index_price,
    inquire_investor,
    minute_chart,
    volume_rank,
)

_CACHE: dict[str, Any] = {"ts": 0.0, "data": None}
_SWING_CACHE: dict[str, Any] = {"pullback": None, "breakout": None, "ts_pb": 0.0, "ts_br": 0.0}
_REGIME_CACHE: dict[str, Any] = {"ts": 0.0, "data": None}
_CACHE_TTL = 60.0
_CACHE_LOCK = threading.Lock()
_SWING_LOCK = threading.Lock()
_REGIME_LOCK = threading.Lock()


def _evaluate_filters(
    stock: dict[str, Any],
    investor: list[dict[str, Any]],
    daily: list[dict[str, Any]],
    minute30: list[dict[str, Any]],
    kospi_change: float,
) -> tuple[dict[str, bool], int]:
    filters: dict[str, bool] = {"volume_rank": True}

    # 2. dual_buy
    latest = investor[0] if investor else None
    filters["dual_buy"] = bool(
        latest
        and latest.get("foreign_value", 0) > 0
        and latest.get("institution_value", 0) > 0
    )

    # 3. intraday_trend (14:00 이후 30분봉, 위치 >= 0.5)
    after_14 = [b for b in minute30 if b.get("hhmmss", "") >= "140000"]
    if len(after_14) >= 2:
        low = min(b["low"] for b in after_14)
        high = max(b["high"] for b in after_14)
        last_close = after_14[-1]["close"]
        rng = high - low
        position = (last_close - low) / rng if rng > 0 else 1.0
        filters["intraday_trend"] = position >= 0.5
    else:
        filters["intraday_trend"] = False

    # 4. relative_strength
    filters["relative_strength"] = (
        stock["change_rate"] > 0 and stock["change_rate"] > kospi_change
    )

    # 5. chart_position (60일 고점의 90% 이상)
    if daily:
        high_60 = max(b["high"] for b in daily) or 0
        filters["chart_position"] = (
            high_60 > 0 and stock["price"] >= high_60 * 0.90
        )
    else:
        filters["chart_position"] = False

    pass_count = sum(1 for v in filters.values() if v)
    return filters, pass_count


def _fetch_stock_data(code: str) -> dict[str, Any]:
    """종목 1개에 필요한 3-API 순차 조회. 부분 실패는 빈 컬렉션으로."""
    out: dict[str, Any] = {"investor": [], "daily": [], "minute30": []}
    try:
        out["investor"] = inquire_investor(code)
    except KISError:
        pass
    try:
        out["daily"] = daily_chart(code, days=60)
    except KISError:
        pass
    try:
        raw = minute_chart(code)
        out["minute30"] = aggregate_minute_bars(raw, 30)
    except KISError:
        pass
    return out


def closing_bet(force: bool = False) -> dict[str, Any]:
    now = time.time()
    with _CACHE_LOCK:
        if not force and _CACHE["data"] and now - _CACHE["ts"] < _CACHE_TTL:
            return _CACHE["data"]

    rank = volume_rank("ALL")[:30]

    with ThreadPoolExecutor(max_workers=3) as ex:
        kospi_f = ex.submit(index_price, "0001")
        kosdaq_f = ex.submit(index_price, "1001")
        data_futures = {
            s["code"]: ex.submit(_fetch_stock_data, s["code"]) for s in rank
        }

        kospi = kospi_f.result()
        kosdaq = kosdaq_f.result()
        datas = {code: f.result() for code, f in data_futures.items()}

    stocks: list[dict[str, Any]] = []
    for s in rank:
        d = datas.get(s["code"], {})
        filters, pass_count = _evaluate_filters(
            s,
            d.get("investor", []),
            d.get("daily", []),
            d.get("minute30", []),
            kospi["change_rate"],
        )
        stocks.append(
            {
                "code": s["code"],
                "name": s["name"],
                "price": s["price"],
                "change_rate": s["change_rate"],
                "volume": s["volume"],
                "trade_value": s["trade_value"],
                "filters": filters,
                "pass_count": pass_count,
            }
        )

    # pass_count 내림차순 → 거래대금 내림차순
    stocks.sort(
        key=lambda r: (-r["pass_count"], -r["trade_value"]),
    )

    result = {
        "stocks": stocks,
        "index": {
            "kospi": kospi["change_rate"],
            "kosdaq": kosdaq["change_rate"],
        },
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "cached_ttl": _CACHE_TTL,
    }

    with _CACHE_LOCK:
        _CACHE["data"] = result
        _CACHE["ts"] = now
    return result


# ─────────────────────────── 시황 판단 ────────────────────────────

def market_regime(force: bool = False) -> dict[str, Any]:
    """코스피/코스닥이 20일 MA 위인지 판단.

    system_on=True → 스윙 스크리너 정상 작동
    system_on=False → 경고 배너 + 스윙 신규 진입 차단 권고
    """
    now = time.time()
    with _REGIME_LOCK:
        if not force and _REGIME_CACHE["data"] and now - _REGIME_CACHE["ts"] < _CACHE_TTL:
            return _REGIME_CACHE["data"]

    kospi = {}
    kosdaq = {}
    kospi_bars: list[dict[str, Any]] = []
    kosdaq_bars: list[dict[str, Any]] = []
    try:
        kospi = index_price("0001")
    except KISError:
        pass
    try:
        kospi_bars = daily_index_chart("0001", days=30)
    except KISError:
        pass
    try:
        kosdaq = index_price("1001")
    except KISError:
        pass
    try:
        kosdaq_bars = daily_index_chart("1001", days=30)
    except KISError:
        pass

    def _regime_check(bars: list[dict[str, Any]], idx_price: dict[str, Any]) -> dict[str, Any]:
        if len(bars) < 20:
            return {"price": idx_price.get("price"), "ma20": None, "above_ma20": None}
        from analyzers import sma, _closes
        closes = _closes(bars)
        ma20 = sma(closes, 20)[-1]
        price = idx_price.get("price", 0)
        return {
            "price": price,
            "change_rate": idx_price.get("change_rate"),
            "ma20": round(ma20, 2) if ma20 else None,
            "above_ma20": bool(price > ma20) if (price and ma20) else None,
        }

    kospi_regime = _regime_check(kospi_bars, kospi)
    kosdaq_regime = _regime_check(kosdaq_bars, kosdaq)

    system_on = bool(
        kospi_regime.get("above_ma20") or kosdaq_regime.get("above_ma20")
    )
    result = {
        "system_on": system_on,
        "kospi": kospi_regime,
        "kosdaq": kosdaq_regime,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
    with _REGIME_LOCK:
        _REGIME_CACHE["data"] = result
        _REGIME_CACHE["ts"] = now
    return result


# ─────────────────────────── 눌림목 스윙 ──────────────────────────

def _fetch_daily_only(code: str) -> list[dict[str, Any]]:
    try:
        return daily_chart(code, days=200)
    except KISError:
        return []


def _eval_pullback(
    stock: dict[str, Any],
    daily: list[dict[str, Any]],
) -> dict[str, Any]:
    filters: dict[str, bool] = {}
    detail: dict[str, Any] = {}

    # 3. 기준봉 존재 (최근 10일 내)
    ref_candles = analyzers.reference_candle_scan(daily, lookback=10)
    filters["reference_candle"] = len(ref_candles) > 0
    detail["reference_candle"] = ref_candles[0] if ref_candles else None

    # 4. 눌림 진행: 기준봉 이후 거래량 감소
    if ref_candles and len(daily) >= 3:
        ref = ref_candles[0]
        bars_ago = ref["bars_ago"]
        if bars_ago >= 2:
            ref_bar = daily[-(bars_ago + 1)]
            ref_vol = float(ref_bar.get("volume", 0))
            recent_vols = [float(b["volume"]) for b in daily[-bars_ago:]]
            avg_recent = sum(recent_vols) / len(recent_vols) if recent_vols else 0
            vol_ratio = avg_recent / ref_vol if ref_vol > 0 else 1.0
            filters["pullback_volume"] = vol_ratio <= 0.5
            detail["pullback_vol_ratio"] = round(vol_ratio, 2)
            detail["days_since_ref"] = bars_ago
        else:
            filters["pullback_volume"] = False
    else:
        filters["pullback_volume"] = False

    # 5. 지지 확인: 현재가 ≥ 기준봉 몸통 중간 또는 5일선 부근 (±3%)
    if daily:
        from analyzers import sma, _closes
        closes = _closes(daily)
        ma5 = sma(closes, 5)[-1]
        price = stock["price"]
        near_ma5 = bool(ma5 and abs(price / ma5 - 1) <= 0.03)
        if ref_candles:
            ref_bar = daily[-(ref_candles[0]["bars_ago"] + 1)]
            rb_mid = (float(ref_bar["open"]) + float(ref_bar["close"])) / 2
            near_mid = price >= rb_mid * 0.97
        else:
            near_mid = False
        filters["support_level"] = near_ma5 or near_mid
        detail["ma5"] = round(ma5, 0) if ma5 else None
        detail["near_ma5"] = near_ma5
    else:
        filters["support_level"] = False

    # 상대강도
    filters["relative_strength"] = stock["change_rate"] > 0

    pass_count = sum(1 for v in filters.values() if v)
    return {
        "code": stock["code"],
        "name": stock["name"],
        "price": stock["price"],
        "change_rate": stock["change_rate"],
        "trade_value": stock["trade_value"],
        "filters": filters,
        "pass_count": pass_count,
        "detail": detail,
    }


def pullback_swing(force: bool = False) -> dict[str, Any]:
    now = time.time()
    with _SWING_LOCK:
        if not force and _SWING_CACHE["pullback"] and now - _SWING_CACHE["ts_pb"] < _CACHE_TTL:
            return _SWING_CACHE["pullback"]

    rank = volume_rank("ALL")[:30]
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {s["code"]: ex.submit(_fetch_daily_only, s["code"]) for s in rank}
        datas = {code: f.result() for code, f in futures.items()}

    stocks = []
    for s in rank:
        daily = datas.get(s["code"], [])
        row = _eval_pullback(s, daily)
        stocks.append(row)

    stocks.sort(key=lambda r: (-r["pass_count"], -r["trade_value"]))
    result = {
        "stocks": stocks,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "cached_ttl": _CACHE_TTL,
    }
    with _SWING_LOCK:
        _SWING_CACHE["pullback"] = result
        _SWING_CACHE["ts_pb"] = now
    return result


# ─────────────────────────── 돌파 스윙 ───────────────────────────

def _eval_breakout(
    stock: dict[str, Any],
    daily: list[dict[str, Any]],
) -> dict[str, Any]:
    filters: dict[str, bool] = {}
    detail: dict[str, Any] = {}

    # 1. 추세 적격
    tt = analyzers.trend_template(daily)
    filters["trend_template"] = tt["qualified"]
    detail["trend_template"] = tt.get("checks", {})

    # 3. 전고점 3% 이내
    if daily and len(daily) >= 20:
        recent_high = max(float(b["high"]) for b in daily[-60:]) if len(daily) >= 60 else max(float(b["high"]) for b in daily)
        price = stock["price"]
        dist_pct = (recent_high / price - 1) * 100
        filters["near_high"] = dist_pct <= 3.0
        detail["near_high_dist_pct"] = round(dist_pct, 2)
        detail["recent_high"] = recent_high
    else:
        filters["near_high"] = False

    # 4. VCP 거래량 수축
    vcp = analyzers.vcp_pattern(daily)
    filters["vcp"] = vcp["detected"]
    detail["vcp"] = vcp.get("detail", {})

    # 5. 다바스 박스
    box = analyzers.darvas_box(daily)
    if box and box.get("box_top") and box.get("top_distance_pct") is not None:
        filters["darvas_breakout"] = box["top_distance_pct"] <= 3.0
    else:
        filters["darvas_breakout"] = False
    detail["darvas"] = box

    # 기준봉 (당일)
    ref = analyzers.reference_candle_scan(daily, lookback=1)
    filters["reference_candle_today"] = len(ref) > 0
    detail["reference_candle"] = ref[0] if ref else None

    pass_count = sum(1 for v in filters.values() if v)
    return {
        "code": stock["code"],
        "name": stock["name"],
        "price": stock["price"],
        "change_rate": stock["change_rate"],
        "trade_value": stock["trade_value"],
        "filters": filters,
        "pass_count": pass_count,
        "detail": detail,
    }


def breakout_swing(force: bool = False) -> dict[str, Any]:
    now = time.time()
    with _SWING_LOCK:
        if not force and _SWING_CACHE["breakout"] and now - _SWING_CACHE["ts_br"] < _CACHE_TTL:
            return _SWING_CACHE["breakout"]

    rank = volume_rank("ALL")[:30]
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {s["code"]: ex.submit(_fetch_daily_only, s["code"]) for s in rank}
        datas = {code: f.result() for code, f in futures.items()}

    stocks = []
    for s in rank:
        daily = datas.get(s["code"], [])
        row = _eval_breakout(s, daily)
        stocks.append(row)

    stocks.sort(key=lambda r: (-r["pass_count"], -r["trade_value"]))
    result = {
        "stocks": stocks,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "cached_ttl": _CACHE_TTL,
    }
    with _SWING_LOCK:
        _SWING_CACHE["breakout"] = result
        _SWING_CACHE["ts_br"] = now
    return result
