"""기술적 지표 계산 — 외부 의존성 없이 순수 파이썬.

입력은 kis_client.daily_chart() 형식의 OHLCV bar 리스트 (날짜 오름차순).
"""
from __future__ import annotations

from typing import Any, Optional


def _closes(bars: list[dict[str, Any]]) -> list[float]:
    return [float(b["close"]) for b in bars]


def sma(values: list[float], period: int) -> list[Optional[float]]:
    """단순이평. 앞부분은 None으로 패딩해 입력과 길이 동일."""
    out: list[Optional[float]] = [None] * len(values)
    if period <= 0:
        return out
    acc = 0.0
    for i, v in enumerate(values):
        acc += v
        if i >= period:
            acc -= values[i - period]
        if i >= period - 1:
            out[i] = acc / period
    return out


def ema(values: list[float], period: int) -> list[Optional[float]]:
    out: list[Optional[float]] = [None] * len(values)
    if not values or period <= 0:
        return out
    k = 2.0 / (period + 1)
    # 초기값: 첫 period개의 평균으로 seed
    if len(values) < period:
        return out
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values: list[float], period: int = 14) -> list[Optional[float]]:
    """Wilder RSI."""
    n = len(values)
    out: list[Optional[float]] = [None] * n
    if n <= period:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses += -diff
    avg_g = gains / period
    avg_l = losses / period
    out[period] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
    for i in range(period + 1, n):
        diff = values[i] - values[i - 1]
        g = max(diff, 0.0)
        l = max(-diff, 0.0)
        avg_g = (avg_g * (period - 1) + g) / period
        avg_l = (avg_l * (period - 1) + l) / period
        out[i] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
    return out


def macd(
    values: list[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict[str, list[Optional[float]]]:
    ema_fast = ema(values, fast)
    ema_slow = ema(values, slow)
    macd_line: list[Optional[float]] = [
        (f - s) if (f is not None and s is not None) else None
        for f, s in zip(ema_fast, ema_slow)
    ]
    # signal 은 macd_line 의 EMA — None 구간은 제외하고 계산
    valid_vals = [v for v in macd_line if v is not None]
    signal_vals = ema(valid_vals, signal)
    # 재정렬
    sig_out: list[Optional[float]] = [None] * len(macd_line)
    si = 0
    for i, v in enumerate(macd_line):
        if v is None:
            continue
        sig_out[i] = signal_vals[si]
        si += 1
    hist: list[Optional[float]] = [
        (m - s) if (m is not None and s is not None) else None
        for m, s in zip(macd_line, sig_out)
    ]
    return {"macd": macd_line, "signal": sig_out, "hist": hist}


def bollinger(
    values: list[float], period: int = 20, k: float = 2.0
) -> dict[str, list[Optional[float]]]:
    n = len(values)
    mid = sma(values, period)
    upper: list[Optional[float]] = [None] * n
    lower: list[Optional[float]] = [None] * n
    for i in range(period - 1, n):
        window = values[i - period + 1 : i + 1]
        m = mid[i]
        if m is None:
            continue
        var = sum((x - m) ** 2 for x in window) / period
        std = var**0.5
        upper[i] = m + k * std
        lower[i] = m - k * std
    return {"middle": mid, "upper": upper, "lower": lower}


def _classify_ma_arrangement(ma5: float, ma20: float, ma60: float) -> str:
    if ma5 > ma20 > ma60:
        return "정배열"
    if ma5 < ma20 < ma60:
        return "역배열"
    return "혼조"


def _candle_pattern(b: dict[str, Any]) -> str:
    o, h, l, c = float(b["open"]), float(b["high"]), float(b["low"]), float(b["close"])
    rng = h - l
    if rng <= 0:
        return "무변동"
    body = abs(c - o)
    upper_wick = h - max(o, c)
    lower_wick = min(o, c) - l
    body_ratio = body / rng
    # 도지: 몸통 10% 이하
    if body_ratio <= 0.1:
        return "도지"
    # 장대: 몸통 70% 이상
    if body_ratio >= 0.7:
        return "장대양봉" if c >= o else "장대음봉"
    # 위/아래 꼬리: 꼬리 전체 대비 60% 이상
    if rng > 0 and upper_wick / rng >= 0.6:
        return "윗꼬리"
    if rng > 0 and lower_wick / rng >= 0.6:
        return "아랫꼬리"
    return "양봉" if c >= o else "음봉"


def trend_template(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """미너비니 추세 템플릿 체크.

    반환: {
      qualified: bool,
      checks: { price_above_ma50, ma50_above_ma150, ma150_above_ma200,
                ma200_rising, near_52w_high, above_52w_low, price_above_ma200 },
      detail: { ma50, ma150, ma200, w52_high, w52_low, ... }
    }
    """
    if len(bars) < 50:
        return {"qualified": False, "checks": {}, "detail": {}}
    closes = _closes(bars)
    highs = [float(b["high"]) for b in bars]
    lows = [float(b["low"]) for b in bars]

    ma50 = sma(closes, 50)[-1]
    ma150 = sma(closes, 150)[-1]
    ma200 = sma(closes, 200)[-1]
    # MA200 추세: 21거래일 전 vs 현재
    ma200_21ago = sma(closes[:-21], 200)[-1] if len(closes) >= 221 else None

    price = closes[-1]
    w52 = 252
    w52_high = max(highs[-w52:]) if len(highs) >= w52 else max(highs)
    w52_low = min(lows[-w52:]) if len(lows) >= w52 else min(lows)

    checks: dict[str, Optional[bool]] = {
        "price_above_ma200": price > ma200 if ma200 else None,
        "price_above_ma50": price > ma50 if ma50 else None,
        "ma50_above_ma150": (ma50 > ma150) if (ma50 and ma150) else None,
        "ma150_above_ma200": (ma150 > ma200) if (ma150 and ma200) else None,
        "ma200_rising": (ma200 > ma200_21ago) if (ma200 and ma200_21ago) else None,
        "near_52w_high": price >= w52_high * 0.75,  # 52주 고가 대비 -25% 이내
        "above_52w_low": price >= w52_low * 1.30,   # 52주 저가 대비 +30% 이상
    }
    qualified = all(v is True for v in checks.values())
    return {
        "qualified": qualified,
        "checks": checks,
        "detail": {
            "price": price,
            "ma50": ma50,
            "ma150": ma150,
            "ma200": ma200,
            "w52_high": w52_high,
            "w52_low": w52_low,
            "w52_high_pct": round((price / w52_high - 1) * 100, 1) if w52_high else None,
            "w52_low_pct": round((price / w52_low - 1) * 100, 1) if w52_low else None,
        },
    }


def reference_candle_scan(
    bars: list[dict[str, Any]], lookback: int = 10
) -> list[dict[str, Any]]:
    """최근 lookback 거래일 내 기준봉(장대양봉 + 거래량 폭발) 탐색.

    기준: 몸통비율 >= 70% 양봉, 거래량 >= 50일 평균 × 150%
    반환: [{date, close, body_ratio, vol_ratio, bars_ago}, ...]
    """
    if len(bars) < 51:
        return []
    volumes = [float(b["volume"]) for b in bars]
    vol_ma50 = sma(volumes, 50)
    threshold = len(bars) - lookback
    result = []
    for i in range(max(threshold, 50), len(bars)):
        b = bars[i]
        o, h, l, c = float(b["open"]), float(b["high"]), float(b["low"]), float(b["close"])
        rng = h - l
        if rng <= 0 or c < o:
            continue
        body_ratio = (c - o) / rng
        if body_ratio < 0.70:
            continue
        vm = vol_ma50[i]
        if vm is None or vm <= 0:
            continue
        vr = float(b["volume"]) / vm
        if vr < 1.5:
            continue
        result.append({
            "date": b["date"],
            "close": c,
            "body_ratio": round(body_ratio, 3),
            "vol_ratio": round(vr, 2),
            "bars_ago": len(bars) - 1 - i,
        })
    return result


def darvas_box(bars: list[dict[str, Any]], lookback: int = 60) -> Optional[dict[str, Any]]:
    """최근 lookback 기간에서 다바스 박스 상/하단 계산.

    박스 상단: 3일간 더 높은 고가 없는 신고가
    박스 하단: 박스 상단 확정 후 3일간 더 낮은 저가 없는 저점
    """
    data = bars[-lookback:] if len(bars) >= lookback else bars
    n = len(data)
    if n < 8:
        return None

    highs = [float(b["high"]) for b in data]
    lows = [float(b["low"]) for b in data]

    box_top = None
    box_top_idx = None
    box_bottom = None

    # 박스 상단: 최근부터 역방향으로 확정 시점 찾기
    for i in range(n - 4, 0, -1):
        if highs[i] >= highs[i + 1] and highs[i] >= highs[i + 2] and highs[i] >= highs[i + 3]:
            box_top = highs[i]
            box_top_idx = i
            break

    if box_top is None or box_top_idx is None:
        return None

    # 박스 하단: box_top_idx 이후 구간에서 찾기
    post = data[box_top_idx:]
    post_lows = lows[box_top_idx:]
    n_post = len(post_lows)
    for i in range(n_post - 4, -1, -1):
        if i + 3 < n_post:
            if post_lows[i] <= post_lows[i + 1] and post_lows[i] <= post_lows[i + 2] and post_lows[i] <= post_lows[i + 3]:
                box_bottom = post_lows[i]
                break

    current_price = float(bars[-1]["close"])
    if box_bottom is None:
        box_bottom = min(post_lows) if post_lows else None

    return {
        "box_top": box_top,
        "box_bottom": box_bottom,
        "current_price": current_price,
        "top_distance_pct": round((box_top / current_price - 1) * 100, 2) if box_top else None,
        "box_width_pct": round((box_top / box_bottom - 1) * 100, 2) if (box_top and box_bottom) else None,
    }


def vcp_pattern(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """VCP (Volatility Contraction Pattern) 간이 감지.

    최근 60거래일을 20봉 단위 3구간으로 나눠 각 구간 변동성(고저차/평균) 비교.
    구간1 > 구간2 > 구간3 + 거래량 감소 → VCP 신호.
    """
    n = len(bars)
    if n < 60:
        return {"detected": False, "contractions": 0, "detail": {}}

    data = bars[-60:]
    chunks = [data[0:20], data[20:40], data[40:60]]
    vols = []
    ranges = []
    for chunk in chunks:
        h = max(float(b["high"]) for b in chunk)
        l = min(float(b["low"]) for b in chunk)
        mid = (h + l) / 2
        ranges.append((h - l) / mid * 100 if mid > 0 else 0)
        vols.append(sum(float(b["volume"]) for b in chunk) / len(chunk))

    # 변동성 수축 횟수
    contractions = sum(1 for i in range(1, 3) if ranges[i] < ranges[i - 1])
    vol_contracting = vols[2] < vols[0]
    detected = contractions >= 2 and vol_contracting
    return {
        "detected": detected,
        "contractions": contractions,
        "detail": {
            "range_pct": [round(r, 2) for r in ranges],
            "avg_volume": [round(v) for v in vols],
            "vol_ratio_last_vs_first": round(vols[2] / vols[0], 2) if vols[0] else None,
        },
    }


def analyze(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """bars를 받아 지표 시리즈 + 최신 요약을 함께 반환.

    반환 구조:
      {
        "ma5": [...], "ma20": [...], "ma60": [...],
        "rsi14": [...], "macd": {...}, "bb": {...},
        "summary": { ma_arrangement, rsi, macd, volume_ratio, bb_position,
                     candle_pattern, ma5, ma20, ma60 }
      }
    없는 값은 None.
    """
    if not bars:
        return {
            "ma5": [], "ma20": [], "ma60": [],
            "rsi14": [], "macd": {"macd": [], "signal": [], "hist": []},
            "bb": {"middle": [], "upper": [], "lower": []},
            "summary": {},
        }

    closes = _closes(bars)
    ma5 = sma(closes, 5)
    ma20 = sma(closes, 20)
    ma60 = sma(closes, 60)
    rsi14 = rsi(closes, 14)
    macd_bundle = macd(closes)
    bb = bollinger(closes, 20, 2.0)

    last_close = closes[-1]
    last_ma5 = ma5[-1]
    last_ma20 = ma20[-1]
    last_ma60 = ma60[-1]

    ma_arr: Optional[str] = None
    if last_ma5 is not None and last_ma20 is not None and last_ma60 is not None:
        ma_arr = _classify_ma_arrangement(last_ma5, last_ma20, last_ma60)

    # 거래량 배율 = 오늘 / 20일 평균
    vol_ratio: Optional[float] = None
    if len(bars) >= 20:
        avg_vol = sum(float(b["volume"]) for b in bars[-20:]) / 20
        if avg_vol > 0:
            vol_ratio = float(bars[-1]["volume"]) / avg_vol

    # 볼린저 내 위치: 0=하단, 1=상단
    bb_pos: Optional[float] = None
    if bb["upper"][-1] is not None and bb["lower"][-1] is not None:
        u, l = bb["upper"][-1], bb["lower"][-1]
        if u - l > 0:
            bb_pos = (last_close - l) / (u - l)

    summary = {
        "close": last_close,
        "ma5": last_ma5,
        "ma20": last_ma20,
        "ma60": last_ma60,
        "ma_arrangement": ma_arr,
        "rsi": rsi14[-1],
        "macd": macd_bundle["macd"][-1],
        "macd_signal": macd_bundle["signal"][-1],
        "macd_hist": macd_bundle["hist"][-1],
        "bb_position": bb_pos,
        "volume_ratio": vol_ratio,
        "candle_pattern": _candle_pattern(bars[-1]),
    }

    return {
        "ma5": ma5,
        "ma20": ma20,
        "ma60": ma60,
        "rsi14": rsi14,
        "macd": macd_bundle,
        "bb": bb,
        "summary": summary,
    }
