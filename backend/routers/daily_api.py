"""Daily snapshot routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

import daily_store
from kis_client import KISError
from universe import MARKET_PATTERN

router = APIRouter(prefix="/api")


@router.post("/daily-save")
def api_daily_save(
    market: str = Query("ALL", pattern=MARKET_PATTERN),
) -> dict:
    try:
        return daily_store.save_today(market=market)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/daily-history")
def api_daily_history(
    date: str = Query("", pattern=r"^(\d{8})?$"),
    market: str = Query("ALL", pattern=MARKET_PATTERN),
) -> dict:
    if not date:
        return {
            "dates": daily_store.list_dates(),
            "snapshots": daily_store.list_snapshots(),
        }
    data = daily_store.load_by_date(date, market=market)
    if data is None:
        raise HTTPException(status_code=404, detail="no data for date")
    return data


@router.get("/daily-history/compare")
def api_daily_compare(
    d1: str = Query(..., pattern=r"^\d{8}$"),
    d2: str = Query(..., pattern=r"^\d{8}$"),
    market: str = Query("ALL", pattern=MARKET_PATTERN),
) -> dict:
    result = daily_store.compare(d1, d2, market=market)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result)
    return result
