"""Background cache warmup."""
from __future__ import annotations

import logging
import os
import threading
import time as _time
from contextlib import asynccontextmanager

from cache_utils import TTLCache
from db import initialize_db
from kis_client import volume_rank
from market_flow import market_flow
from screener import breakout_swing, closing_bet, market_regime, pullback_swing
from services.investor_summary_service import get_investor_summary
from theme_trend import theme_trend
from universe import get_trading_universe

log = logging.getLogger("sigint.warmup")
_WARMUP_ONCE = TTLCache[str, bool](ttl=5.0)


def run_warmup_cycle() -> None:
    tasks = [
        ("volume_rank", lambda: volume_rank("ALL", force=True)),
        ("trading_universe", lambda: get_trading_universe(limit=60, force=True)),
        ("market_regime", lambda: market_regime(force=True)),
        ("market_flow", lambda: market_flow(force=True)),
        ("theme_trend", lambda: theme_trend(days=7, force=True)),
        ("investor_summary", lambda: get_investor_summary(top_n=60, force=True)),
        ("closing_bet", lambda: closing_bet(force=True)),
        ("pullback_swing", lambda: pullback_swing(force=True)),
        ("breakout_swing", lambda: breakout_swing(force=True)),
    ]
    for name, fn in tasks:
        try:
            started = _time.time()
            fn()
            log.warning("warmup %s: %.1fs", name, _time.time() - started)
        except Exception as exc:  # pragma: no cover - best-effort logging
            log.warning("warmup %s failed: %s", name, exc)


def _warmup_loop() -> None:
    _time.sleep(1)
    while True:
        run_warmup_cycle()
        _time.sleep(300)


@asynccontextmanager
async def lifespan(_app):
    initialize_db()
    if os.getenv("DISABLE_WARMUP") != "1":
        if _WARMUP_ONCE.get("started") is None:
            _WARMUP_ONCE.set("started", True)
            threading.Thread(
                target=_warmup_loop,
                name="sigint-warmup",
                daemon=True,
            ).start()
    yield
