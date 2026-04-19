"""Chart and quote routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

import analyzers
import stock_db
from kis_client import (
    KISError,
    aggregate_minute_bars,
    daily_chart,
    inquire_investor,
    inquire_price,
    minute_chart,
)
from routers.common import CODE_PATTERN
from services.chart_analysis_service import get_chart_analysis_payload

router = APIRouter(prefix="/api")


@router.get("/price/{code}")
def api_price(code: str = Path(..., pattern=CODE_PATTERN)) -> dict:
    try:
        data = inquire_price(code)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    data["name"] = stock_db.get_name(code)
    return data


@router.get("/chart/{code}")
def api_chart(
    code: str = Path(..., pattern=CODE_PATTERN),
    period: str = Query("D", pattern="^[DWMY]$"),
    days: int = Query(180, ge=20, le=500),
    indicators: bool = Query(True),
) -> dict:
    try:
        bars = daily_chart(code, days=days)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payload: dict = {
        "code": code,
        "period": period,
        "count": len(bars),
        "bars": bars,
    }
    if indicators:
        payload["analysis"] = analyzers.analyze(bars)
    return payload


@router.get("/chart-analysis/{code}")
def api_chart_analysis(
    code: str = Path(..., pattern=CODE_PATTERN),
    days: int = Query(120, ge=20, le=500),
) -> dict:
    return get_chart_analysis_payload(code=code, days=days)


@router.get("/investor-trend/{code}")
def api_investor_trend(code: str = Path(..., pattern=CODE_PATTERN)) -> dict:
    try:
        rows = inquire_investor(code)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"code": code, "count": len(rows), "items": rows}


@router.get("/minute-chart/{code}")
def api_minute_chart(
    code: str = Path(..., pattern=CODE_PATTERN),
    time_unit: int = Query(1, ge=1, le=60),
) -> dict:
    try:
        raw = minute_chart(code)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    bars = aggregate_minute_bars(raw, time_unit)
    return {"code": code, "time_unit": time_unit, "count": len(bars), "bars": bars}
