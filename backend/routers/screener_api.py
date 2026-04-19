"""Screener routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

import analyzers
from kis_client import KISError, daily_chart
from routers.common import CODE_PATTERN
from screener import breakout_swing, closing_bet, market_regime, pullback_swing

router = APIRouter(prefix="/api")


@router.get("/screener/closing-bet")
def api_screener_closing_bet(force: bool = Query(False)) -> dict:
    try:
        return closing_bet(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/screener/market-regime")
def api_market_regime(force: bool = Query(False)) -> dict:
    try:
        return market_regime(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/screener/pullback-swing")
def api_pullback_swing(force: bool = Query(False)) -> dict:
    try:
        return pullback_swing(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/screener/breakout-swing")
def api_breakout_swing(force: bool = Query(False)) -> dict:
    try:
        return breakout_swing(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/screener/trend-template/{code}")
def api_trend_template(code: str = Path(..., pattern=CODE_PATTERN)) -> dict:
    try:
        bars = daily_chart(code, days=300)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return analyzers.trend_template(bars)


@router.get("/screener/vcp/{code}")
def api_vcp(code: str = Path(..., pattern=CODE_PATTERN)) -> dict:
    try:
        bars = daily_chart(code, days=90)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return analyzers.vcp_pattern(bars)


@router.get("/screener/darvas-box/{code}")
def api_darvas_box(code: str = Path(..., pattern=CODE_PATTERN)) -> dict:
    try:
        bars = daily_chart(code, days=90)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    result = analyzers.darvas_box(bars)
    return result or {"box_top": None, "box_bottom": None}


@router.get("/screener/reference-candle/{code}")
def api_reference_candle(
    code: str = Path(..., pattern=CODE_PATTERN),
    lookback: int = Query(10, ge=1, le=60),
) -> dict:
    try:
        bars = daily_chart(code, days=90)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    candles = analyzers.reference_candle_scan(bars, lookback=lookback)
    return {"code": code, "count": len(candles), "candles": candles}
