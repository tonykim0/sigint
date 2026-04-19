"""FastAPI app factory."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.chart import router as chart_router
from routers.daily_api import router as daily_router
from routers.journal_api import router as journal_router
from routers.market import router as market_router
from routers.screener_api import router as screener_router
from services.warmup import lifespan


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

    for router in (
        market_router,
        chart_router,
        screener_router,
        journal_router,
        daily_router,
    ):
        app.include_router(router)

    return app
