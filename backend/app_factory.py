"""FastAPI app factory."""
from __future__ import annotations

import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from routers.chart import router as chart_router
from routers.daily_api import router as daily_router
from routers.journal_api import router as journal_router
from routers.market import router as market_router
from routers.screener_api import router as screener_router
from services.warmup import lifespan

log = logging.getLogger("uvicorn.error")
_SLOW_API_MS = float(os.getenv("SLOW_API_MS", "700"))


def create_app() -> FastAPI:
    app = FastAPI(title="SIGINT API", version="0.4.0", lifespan=lifespan)

    extra_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ]
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://frontend-sandy-five-40.vercel.app",
        *extra_origins,
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r"https://frontend-.*\.vercel\.app",
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_request_timing(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}"
        response.headers["Server-Timing"] = f'app;dur={elapsed_ms:.1f}'

        if request.url.path.startswith("/api/") and elapsed_ms >= _SLOW_API_MS:
            log.warning(
                "slow api %s %s %.1fms",
                request.method,
                request.url.path,
                elapsed_ms,
            )
        return response

    for router in (
        market_router,
        chart_router,
        screener_router,
        journal_router,
        daily_router,
    ):
        app.include_router(router)

    return app
