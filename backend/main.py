"""FastAPI 엔트리포인트."""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware

import analyzers
import daily_store
import journal
from kis_client import (
    KISError,
    aggregate_minute_bars,
    daily_chart,
    inquire_investor,
    inquire_price,
    minute_chart,
    volume_rank,
)
from schemas import (
    JournalCreateRequest,
    JournalDeleteResponse,
    JournalEntryResponse,
    JournalListResponse,
    JournalStatsResponse,
    JournalUpdateRequest,
)
from screener import breakout_swing, closing_bet, market_regime, pullback_swing
import stock_db

app = FastAPI(title="SIGINT API", version="0.3.0")

_EXTRA_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://frontend-sandy-five-40.vercel.app",
    *_EXTRA_ORIGINS,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_origin_regex=r"https://frontend-.*\.vercel\.app",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

_CODE_PATTERN = r"^\d{6}$"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/index")
def api_index() -> dict:
    """KOSPI + KOSDAQ 현재 지수."""
    from kis_client import index_price
    from concurrent.futures import ThreadPoolExecutor
    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            kf = ex.submit(index_price, "0001")
            kdf = ex.submit(index_price, "1001")
            kospi = kf.result()
            kosdaq = kdf.result()
        return {"kospi": kospi, "kosdaq": kosdaq}
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/investor-summary")
def api_investor_summary(top_n: int = Query(10, ge=5, le=30)) -> dict:
    """거래대금 상위 top_n 종목의 외국인/기관 순매수 요약."""
    from concurrent.futures import ThreadPoolExecutor
    try:
        rank = volume_rank("ALL")[:top_n]
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    def fetch(s: dict) -> dict:
        try:
            rows = inquire_investor(s["code"])
            latest = rows[0] if rows else {}
        except KISError:
            latest = {}
        return {
            "code": s["code"],
            "name": s["name"],
            "price": s["price"],
            "change_rate": s["change_rate"],
            "foreign_value": latest.get("foreign_value", 0),
            "institution_value": latest.get("institution_value", 0),
            "individual_value": latest.get("individual_value", 0),
        }

    with ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(fetch, rank))

    results.sort(key=lambda r: r["foreign_value"], reverse=True)
    return {"items": results}


@app.get("/api/search")
def api_search(
    q: str = Query(..., min_length=1, max_length=20),
    limit: int = Query(10, ge=1, le=20),
) -> dict:
    return {"results": stock_db.search(q, limit=limit)}


@app.get("/api/themes")
def api_themes() -> dict:
    import json
    import pathlib
    path = pathlib.Path(__file__).parent / "data" / "themes.json"
    if not path.exists():
        return {"themes": {}}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/volume-rank")
def api_volume_rank(
    market: str = Query("ALL", pattern="^(ALL|KOSPI|KOSDAQ)$"),
    top_n: int = Query(60, ge=1, le=60),
) -> dict:
    try:
        items = volume_rank(market=market)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = items[:top_n]
    return {"market": market, "count": len(items), "items": items}


@app.get("/api/price/{code}")
def api_price(code: str = Path(..., pattern=_CODE_PATTERN)) -> dict:
    try:
        return inquire_price(code)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/chart/{code}")
def api_chart(
    code: str = Path(..., pattern=_CODE_PATTERN),
    period: str = Query("D", pattern="^[DWMY]$"),
    days: int = Query(180, ge=20, le=500),
    indicators: bool = Query(True),
) -> dict:
    # period 파라미터는 현재 'D' 만 지원 (W/M/Y 는 향후 확장).
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


@app.get("/api/investor-trend/{code}")
def api_investor_trend(code: str = Path(..., pattern=_CODE_PATTERN)) -> dict:
    try:
        rows = inquire_investor(code)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"code": code, "count": len(rows), "items": rows}


@app.get("/api/minute-chart/{code}")
def api_minute_chart(
    code: str = Path(..., pattern=_CODE_PATTERN),
    time_unit: int = Query(1, ge=1, le=60),
) -> dict:
    try:
        raw = minute_chart(code)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    bars = aggregate_minute_bars(raw, time_unit)
    return {"code": code, "time_unit": time_unit, "count": len(bars), "bars": bars}


@app.get("/api/screener/closing-bet")
def api_screener_closing_bet(force: bool = Query(False)) -> dict:
    try:
        return closing_bet(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/screener/market-regime")
def api_market_regime(force: bool = Query(False)) -> dict:
    try:
        return market_regime(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/screener/pullback-swing")
def api_pullback_swing(force: bool = Query(False)) -> dict:
    try:
        return pullback_swing(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/screener/breakout-swing")
def api_breakout_swing(force: bool = Query(False)) -> dict:
    try:
        return breakout_swing(force=force)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/screener/trend-template/{code}")
def api_trend_template(code: str = Path(..., pattern=_CODE_PATTERN)) -> dict:
    try:
        bars = daily_chart(code, days=300)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return analyzers.trend_template(bars)


@app.get("/api/screener/vcp/{code}")
def api_vcp(code: str = Path(..., pattern=_CODE_PATTERN)) -> dict:
    try:
        bars = daily_chart(code, days=90)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return analyzers.vcp_pattern(bars)


@app.get("/api/screener/darvas-box/{code}")
def api_darvas_box(code: str = Path(..., pattern=_CODE_PATTERN)) -> dict:
    try:
        bars = daily_chart(code, days=90)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    result = analyzers.darvas_box(bars)
    return result or {"box_top": None, "box_bottom": None}


@app.get("/api/screener/reference-candle/{code}")
def api_reference_candle(
    code: str = Path(..., pattern=_CODE_PATTERN),
    lookback: int = Query(10, ge=1, le=60),
) -> dict:
    try:
        bars = daily_chart(code, days=90)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    candles = analyzers.reference_candle_scan(bars, lookback=lookback)
    return {"code": code, "count": len(candles), "candles": candles}


# ---------------- 매매일지 ----------------
@app.get("/api/journal", response_model=JournalListResponse)
def api_journal_list() -> JournalListResponse:
    return {"items": journal.list_entries()}


@app.post("/api/journal", response_model=JournalEntryResponse)
def api_journal_add(payload: JournalCreateRequest) -> JournalEntryResponse:
    return journal.add_entry(payload.model_dump(mode="json"))


@app.put("/api/journal/{entry_id}", response_model=JournalEntryResponse)
def api_journal_update(
    entry_id: str, payload: JournalUpdateRequest
) -> JournalEntryResponse:
    patch = payload.model_dump(exclude_unset=True, mode="json")
    if not patch:
        raise HTTPException(status_code=400, detail="empty update payload")
    entry = journal.update_entry(entry_id, patch)
    if entry is None:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry


@app.delete("/api/journal/{entry_id}", response_model=JournalDeleteResponse)
def api_journal_delete(entry_id: str) -> JournalDeleteResponse:
    if not journal.delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="entry not found")
    return {"deleted": entry_id}


@app.get("/api/journal/stats", response_model=JournalStatsResponse)
def api_journal_stats() -> JournalStatsResponse:
    return journal.stats()


@app.get("/api/journal/{entry_id}/tracking", response_model=JournalEntryResponse)
def api_journal_tracking(entry_id: str) -> JournalEntryResponse:
    try:
        entry = journal.refresh_tracking(entry_id)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if entry is None:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry


# ---------------- 일일 거래대금 저장 ----------------
@app.post("/api/daily-save")
def api_daily_save(
    market: str = Query("ALL", pattern="^(ALL|KOSPI|KOSDAQ)$"),
) -> dict:
    try:
        return daily_store.save_today(market=market)
    except KISError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/daily-history")
def api_daily_history(
    date: str = Query("", pattern=r"^(\d{8})?$"),
) -> dict:
    if not date:
        return {"dates": daily_store.list_dates()}
    data = daily_store.load_by_date(date)
    if data is None:
        raise HTTPException(status_code=404, detail="no data for date")
    return data


@app.get("/api/daily-history/compare")
def api_daily_compare(
    d1: str = Query(..., pattern=r"^\d{8}$"),
    d2: str = Query(..., pattern=r"^\d{8}$"),
) -> dict:
    result = daily_store.compare(d1, d2)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result)
    return result
