"""Market and universe routes."""
from __future__ import annotations

import json
import pathlib

from fastapi import APIRouter, HTTPException, Query

import market_flow as market_flow_mod
import stock_db
import theme_trend as theme_trend_mod
from kis_client import KISError, index_price, volume_rank
from services.investor_summary_service import get_investor_summary
from universe import MARKET_PATTERN, get_trading_universe, universe_filters

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/index")
def api_index() -> dict:
    from concurrent.futures import ThreadPoolExecutor

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            kospi_future = executor.submit(index_price, "0001")
            kosdaq_future = executor.submit(index_price, "1001")
            return {
                "kospi": kospi_future.result(),
                "kosdaq": kosdaq_future.result(),
            }
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/market-flow")
def api_market_flow(force: bool = Query(False)) -> dict:
    try:
        return market_flow_mod.market_flow(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/investor-summary")
def api_investor_summary(
    top_n: int = Query(10, ge=5, le=60),
    force: bool = Query(False),
) -> dict:
    try:
        return get_investor_summary(top_n=top_n, force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/search")
def api_search(
    q: str = Query(..., min_length=1, max_length=20),
    limit: int = Query(10, ge=1, le=20),
) -> dict:
    return {"results": stock_db.search(q, limit=limit)}


@router.get("/themes")
def api_themes() -> dict:
    path = pathlib.Path(__file__).resolve().parent.parent / "data" / "themes.json"
    if not path.exists():
        return {"themes": {}}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@router.get("/theme-trend")
def api_theme_trend(
    days: int = Query(7, ge=3, le=30),
    force: bool = Query(False),
) -> dict:
    try:
        return theme_trend_mod.theme_trend(days=days, force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/volume-rank")
def api_volume_rank(
    market: str = Query("ALL", pattern=MARKET_PATTERN),
    top_n: int = Query(60, ge=1, le=120),
) -> dict:
    try:
        items = volume_rank(market=market)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"market": market, "count": len(items[:top_n]), "items": items[:top_n]}


@router.get("/trading-universe")
def api_trading_universe(
    market: str = Query("ALL", pattern=MARKET_PATTERN),
    limit: int = Query(60, ge=1, le=120),
    force: bool = Query(False),
) -> dict:
    try:
        items = get_trading_universe(market=market, limit=limit, force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "market": market,
        "count": len(items),
        "items": items,
        "filters": universe_filters(),
    }
