"""KIS OpenAPI 클라이언트 — 인증, 토큰 캐싱, 공통 요청 헬퍼."""
from __future__ import annotations

import json
import os
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

APP_KEY = os.getenv("KIS_APP_KEY", "").strip()
APP_SECRET = os.getenv("KIS_APP_SECRET", "").strip()
ACCOUNT_NO = os.getenv("KIS_ACCOUNT_NO", "").strip()
IS_MOCK = os.getenv("KIS_IS_MOCK", "false").strip().lower() == "true"

BASE_URL = (
    "https://openapivts.koreainvestment.com:29443"
    if IS_MOCK
    else "https://openapi.koreainvestment.com:9443"
)

TOKEN_CACHE_PATH = Path(__file__).with_name(".token_cache.json")
_TOKEN_LOCK = threading.Lock()
_TOKEN_STATE: dict[str, Any] = {"access_token": None, "expires_at": 0.0}


class KISError(RuntimeError):
    """KIS API가 rt_cd != '0' 을 반환했거나 통신 오류가 발생했을 때."""


def _load_token_from_disk() -> None:
    if not TOKEN_CACHE_PATH.exists():
        return
    try:
        data = json.loads(TOKEN_CACHE_PATH.read_text())
        if data.get("access_token") and data.get("expires_at", 0) > time.time() + 60:
            _TOKEN_STATE.update(data)
    except (json.JSONDecodeError, OSError):
        pass


def _save_token_to_disk(token: str, expires_at: float) -> None:
    try:
        TOKEN_CACHE_PATH.write_text(
            json.dumps({"access_token": token, "expires_at": expires_at})
        )
    except OSError:
        pass


def _issue_token() -> str:
    if not APP_KEY or not APP_SECRET:
        raise KISError("KIS_APP_KEY / KIS_APP_SECRET 환경변수가 설정되지 않았습니다.")

    url = f"{BASE_URL}/oauth2/tokenP"
    payload = {
        "grant_type": "client_credentials",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        raise KISError(f"토큰 발급 실패 HTTP {resp.status_code}: {resp.text}")

    data = resp.json()
    token = data.get("access_token")
    expires_in = int(data.get("expires_in", 86400))
    if not token:
        raise KISError(f"토큰 응답 비정상: {data}")

    expires_at = time.time() + expires_in - 300
    _TOKEN_STATE["access_token"] = token
    _TOKEN_STATE["expires_at"] = expires_at
    _save_token_to_disk(token, expires_at)
    return token


def get_access_token(force_refresh: bool = False) -> str:
    """유효한 Bearer 토큰 반환. 만료 5분 전부터 자동 재발급."""
    with _TOKEN_LOCK:
        if not force_refresh and _TOKEN_STATE["access_token"] is None:
            _load_token_from_disk()

        token = _TOKEN_STATE["access_token"]
        if (
            not force_refresh
            and token
            and _TOKEN_STATE["expires_at"] > time.time()
        ):
            return token

        return _issue_token()


def _headers(tr_id: str) -> dict[str, str]:
    return {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {get_access_token()}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": tr_id,
    }


def _get(path: str, tr_id: str, params: dict[str, Any]) -> dict[str, Any]:
    """KIS GET 요청 + 401 재인증 + 429/EGW00201 재시도 + rt_cd 검증."""
    url = f"{BASE_URL}{path}"
    attempts = 0
    while True:
        attempts += 1
        resp = requests.get(url, headers=_headers(tr_id), params=params, timeout=10)

        if resp.status_code == 401 and attempts <= 2:
            get_access_token(force_refresh=True)
            continue

        # KIS는 rate-limit 초과 시 HTTP 500 + msg_cd=EGW00201 로 응답.
        body_json: dict[str, Any] | None = None
        try:
            body_json = resp.json()
        except Exception:
            body_json = None

        if (
            body_json
            and body_json.get("msg_cd") == "EGW00201"
            and attempts <= 4
        ):
            time.sleep(0.3 * attempts)
            continue
        if resp.status_code == 429 and attempts <= 3:
            time.sleep(1.0)
            continue
        if resp.status_code != 200:
            raise KISError(f"HTTP {resp.status_code}: {resp.text[:300]}")

        data = body_json if body_json is not None else resp.json()
        rt_cd = data.get("rt_cd")
        if rt_cd != "0":
            raise KISError(f"rt_cd={rt_cd} msg={data.get('msg1')} params={params}")
        return data


# --- Endpoints ---------------------------------------------------------------


def volume_rank(market: str = "ALL") -> list[dict[str, Any]]:
    """거래대금 순위 조회 (KIS volume-rank TR은 30개 상한이라
    보통주/우선주 나눠서 호출 후 거래대금 순으로 합친 뒤 중복 제거).

    market: "ALL" | "KOSPI" | "KOSDAQ"
    FID_BLNG_CLS_CODE = 0 평균거래량, 1 거래증가율, 2 평균거래회전율,
                         3 거래금액순, 4 평균거래금액회전율
    """
    market_code = {"ALL": "0000", "KOSPI": "0001", "KOSDAQ": "1001"}.get(
        market.upper(), "0000"
    )

    def _fetch(div_cls: str, mkt: str) -> list[dict[str, Any]]:
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_COND_SCR_DIV_CODE": "20171",
            "FID_INPUT_ISCD": mkt,
            "FID_DIV_CLS_CODE": div_cls,  # 0 전체 / 1 보통주 / 2 우선주
            "FID_BLNG_CLS_CODE": "3",     # 거래금액순
            "FID_TRGT_CLS_CODE": "111111111",
            "FID_TRGT_EXLS_CLS_CODE": "000000",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": "",
            "FID_INPUT_DATE_1": "",
        }
        data = _get(
            "/uapi/domestic-stock/v1/quotations/volume-rank",
            tr_id="FHPST01710000",
            params=params,
        )
        return data.get("output", []) or []

    # ALL + KOSPI-only + KOSDAQ-only 보통주/우선주 변형으로 폭 넓게 확보
    rows: list[dict[str, Any]] = []
    if market.upper() == "ALL":
        rows += _fetch("1", "0000")   # 전체 보통주
        rows += _fetch("2", "0000")   # 전체 우선주
        rows += _fetch("1", "0001")   # KOSPI 보통주
        rows += _fetch("1", "1001")   # KOSDAQ 보통주
    else:
        rows += _fetch("1", market_code)
        rows += _fetch("2", market_code)

    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for r in rows:
        code = r.get("mksc_shrn_iscd", "")
        if not code or code in seen:
            continue
        seen.add(code)
        try:
            result.append(
                {
                    "rank": int(r.get("data_rank") or 0),
                    "code": code,
                    "name": r.get("hts_kor_isnm", ""),
                    "price": int(r.get("stck_prpr") or 0),
                    "change_rate": float(r.get("prdy_ctrt") or 0),
                    "volume": int(r.get("acml_vol") or 0),
                    "trade_value": int(r.get("acml_tr_pbmn") or 0),
                }
            )
        except (TypeError, ValueError):
            continue

    # 거래대금 내림차순 재정렬 + 순위 재부여
    result.sort(key=lambda x: -x["trade_value"])
    for i, r in enumerate(result, start=1):
        r["rank"] = i
    return result


def index_price(index_code: str) -> dict[str, Any]:
    """업종/지수 현재가. index_code: '0001'(KOSPI), '1001'(KOSDAQ), '2001'(KOSPI200)."""
    params = {"FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": index_code}
    data = _get(
        "/uapi/domestic-stock/v1/quotations/inquire-index-price",
        tr_id="FHPUP02100000",
        params=params,
    )
    o = data.get("output") or {}

    def _f(key: str) -> float:
        try:
            return float(o.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    return {
        "code": index_code,
        "price": _f("bstp_nmix_prpr"),
        "prev_diff": _f("bstp_nmix_prdy_vrss"),
        "change_rate": _f("bstp_nmix_prdy_ctrt"),
    }


def daily_index_chart(index_code: str, days: int = 30) -> list[dict[str, Any]]:
    """업종/지수 일봉 (FID_COND_MRKT_DIV_CODE='U').

    index_code: '0001' KOSPI, '1001' KOSDAQ, '2001' KOSPI200
    """
    end = datetime.now()
    start = end - timedelta(days=days * 2 + 10)
    params = {
        "FID_COND_MRKT_DIV_CODE": "U",
        "FID_INPUT_ISCD": index_code,
        "FID_INPUT_DATE_1": start.strftime("%Y%m%d"),
        "FID_INPUT_DATE_2": end.strftime("%Y%m%d"),
        "FID_PERIOD_DIV_CODE": "D",
    }
    data = _get(
        "/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice",
        tr_id="FHKUP03500100",
        params=params,
    )
    rows = data.get("output2", []) or []
    bars: list[dict[str, Any]] = []
    for r in rows:
        d = r.get("stck_bsop_date") or ""
        if not d or len(d) != 8:
            continue
        try:
            bars.append(
                {
                    "date": f"{d[:4]}-{d[4:6]}-{d[6:8]}",
                    "open": float(r.get("bstp_nmix_oprc") or 0),
                    "high": float(r.get("bstp_nmix_hgpr") or 0),
                    "low": float(r.get("bstp_nmix_lwpr") or 0),
                    "close": float(r.get("bstp_nmix_prpr") or 0),
                    "volume": int(r.get("acml_vol") or 0),
                }
            )
        except (TypeError, ValueError):
            continue
    bars.sort(key=lambda b: b["date"])
    if len(bars) > days:
        bars = bars[-days:]
    return bars


def inquire_price(code: str) -> dict[str, Any]:
    """현재가 조회."""
    params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}
    data = _get(
        "/uapi/domestic-stock/v1/quotations/inquire-price",
        tr_id="FHKST01010100",
        params=params,
    )
    o = data.get("output") or {}

    def _i(key: str) -> int:
        try:
            return int(o.get(key) or 0)
        except (TypeError, ValueError):
            return 0

    def _f(key: str) -> float:
        try:
            return float(o.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    return {
        "code": code,
        "sector": o.get("bstp_kor_isnm") or "",
        "market": o.get("rprs_mrkt_kor_name") or "",
        "price": _i("stck_prpr"),
        "prev_diff": _i("prdy_vrss"),
        "change_rate": _f("prdy_ctrt"),
        "volume": _i("acml_vol"),
        "trade_value": _i("acml_tr_pbmn"),
        "high": _i("stck_hgpr"),
        "low": _i("stck_lwpr"),
        "open": _i("stck_oprc"),
        "prev_close": _i("stck_sdpr"),
        "market_cap": _i("hts_avls"),
        "per": _f("per"),
        "pbr": _f("pbr"),
        "foreign_ratio": _f("hts_frgn_ehrt"),
    }


def daily_chart(code: str, days: int = 90) -> list[dict[str, Any]]:
    """일별 OHLCV. 날짜 오름차순 정렬."""
    end = datetime.now()
    start = end - timedelta(days=days * 2 + 10)  # 주말/휴일 여유
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": code,
        "FID_INPUT_DATE_1": start.strftime("%Y%m%d"),
        "FID_INPUT_DATE_2": end.strftime("%Y%m%d"),
        "FID_PERIOD_DIV_CODE": "D",
        "FID_ORG_ADJ_PRC": "0",
    }
    data = _get(
        "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
        tr_id="FHKST03010100",
        params=params,
    )
    rows = data.get("output2", []) or []
    bars: list[dict[str, Any]] = []
    for r in rows:
        d = r.get("stck_bsop_date") or ""
        if not d or len(d) != 8:
            continue
        try:
            bars.append(
                {
                    "date": f"{d[:4]}-{d[4:6]}-{d[6:8]}",
                    "open": int(r.get("stck_oprc") or 0),
                    "high": int(r.get("stck_hgpr") or 0),
                    "low": int(r.get("stck_lwpr") or 0),
                    "close": int(r.get("stck_clpr") or 0),
                    "volume": int(r.get("acml_vol") or 0),
                    "trade_value": int(r.get("acml_tr_pbmn") or 0),
                    "change_rate": float(r.get("prdy_ctrt") or 0),
                }
            )
        except (TypeError, ValueError):
            continue
    bars.sort(key=lambda b: b["date"])
    if len(bars) > days:
        bars = bars[-days:]
    return bars


def minute_chart(code: str, start_hhmmss: str = "") -> list[dict[str, Any]]:
    """당일 1분봉.

    KIS inquire-time-chartprice 는 1분봉만 반환한다. 'time_unit' 분 단위 집계가
    필요하면 main.py 의 엔드포인트에서 aggregate_bars() 로 처리한다.
    start_hhmmss 가 빈 문자열이면 현재 시각 기준 장중 직전 타임을 사용한다.
    """
    if not start_hhmmss:
        now = datetime.now()
        start_hhmmss = now.strftime("%H%M%S")
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": code,
        "FID_INPUT_HOUR_1": start_hhmmss,
        "FID_PW_DATA_INCU_YN": "N",
        "FID_ETC_CLS_CODE": "",
    }
    data = _get(
        "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
        tr_id="FHKST03010200",
        params=params,
    )
    rows = data.get("output2", []) or []
    today = datetime.now().strftime("%Y-%m-%d")
    bars: list[dict[str, Any]] = []
    for r in rows:
        hhmmss = r.get("stck_cntg_hour") or ""
        if len(hhmmss) != 6:
            continue
        try:
            bars.append(
                {
                    "time": f"{today} {hhmmss[:2]}:{hhmmss[2:4]}:{hhmmss[4:6]}",
                    "hhmmss": hhmmss,
                    "open": int(r.get("stck_oprc") or 0),
                    "high": int(r.get("stck_hgpr") or 0),
                    "low": int(r.get("stck_lwpr") or 0),
                    "close": int(r.get("stck_prpr") or 0),
                    "volume": int(r.get("cntg_vol") or 0),
                }
            )
        except (TypeError, ValueError):
            continue
    bars.sort(key=lambda b: b["hhmmss"])
    return bars


def aggregate_minute_bars(
    bars: list[dict[str, Any]], unit_min: int
) -> list[dict[str, Any]]:
    """1분봉 리스트를 unit_min 분봉으로 집계."""
    if unit_min <= 1 or not bars:
        return bars
    out: list[dict[str, Any]] = []
    bucket: list[dict[str, Any]] = []

    def _flush() -> None:
        if not bucket:
            return
        out.append(
            {
                "time": bucket[0]["time"],
                "hhmmss": bucket[0]["hhmmss"],
                "open": bucket[0]["open"],
                "high": max(b["high"] for b in bucket),
                "low": min(b["low"] for b in bucket),
                "close": bucket[-1]["close"],
                "volume": sum(b["volume"] for b in bucket),
            }
        )

    prev_key = None
    for b in bars:
        h, m = int(b["hhmmss"][:2]), int(b["hhmmss"][2:4])
        key = (h * 60 + m) // unit_min
        if prev_key is None or key == prev_key:
            bucket.append(b)
        else:
            _flush()
            bucket = [b]
        prev_key = key
    _flush()
    return out


def inquire_investor(code: str) -> list[dict[str, Any]]:
    """투자자별 매매동향 — 최근 영업일 리스트.

    실 응답 output 필드(대표): stck_bsop_date, prsn_ntby_qty(개인), frgn_ntby_qty(외국인),
    orgn_ntby_qty(기관계). 금액 필드는 '_tr_pbmn' 접미사. 문서와 필드명이 일부 다를 수 있어
    방어적으로 파싱한다.
    """
    params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}
    data = _get(
        "/uapi/domestic-stock/v1/quotations/inquire-investor",
        tr_id="FHKST01010900",
        params=params,
    )
    rows = data.get("output", []) or []

    def _i(r: dict[str, Any], *keys: str) -> int:
        for k in keys:
            v = r.get(k)
            if v not in (None, ""):
                try:
                    return int(float(v))
                except (TypeError, ValueError):
                    continue
        return 0

    result = []
    for r in rows:
        d = r.get("stck_bsop_date") or ""
        date = f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else d
        result.append(
            {
                "date": date,
                "individual_qty": _i(r, "prsn_ntby_qty"),
                "foreign_qty": _i(r, "frgn_ntby_qty"),
                "institution_qty": _i(r, "orgn_ntby_qty"),
                "individual_value": _i(r, "prsn_ntby_tr_pbmn"),
                "foreign_value": _i(r, "frgn_ntby_tr_pbmn"),
                "institution_value": _i(r, "orgn_ntby_tr_pbmn"),
            }
        )
    return result
