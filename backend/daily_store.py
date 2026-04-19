"""Daily trading-universe snapshots backed by SQLite."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from db import decode_items_json, get_connection, initialize_db
from universe import get_trading_universe


def _today_ymd() -> str:
    return datetime.now().strftime("%Y%m%d")


def _row_to_snapshot(row) -> dict[str, Any]:
    return {
        "date": row["date"],
        "market": row["market"],
        "saved_at": row["saved_at"],
        "count": row["count"],
        "items": decode_items_json(row["items_json"]),
    }


def save_today(market: str = "ALL", top_n: int = 60) -> dict[str, Any]:
    initialize_db()
    items = get_trading_universe(market=market, limit=top_n, force=True)
    payload = {
        "date": _today_ymd(),
        "market": market,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(items),
        "items": items,
    }
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_snapshots (
                date, market, saved_at, count, items_json
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                payload["date"],
                payload["market"],
                payload["saved_at"],
                payload["count"],
                json.dumps(payload["items"], ensure_ascii=False),
            ),
        )
    return payload


def load_by_date(date: str, market: str = "ALL") -> dict[str, Any] | None:
    initialize_db()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM daily_snapshots
            WHERE date = ? AND market = ?
            """,
            (date, market),
        ).fetchone()
    return _row_to_snapshot(row) if row else None


def list_dates() -> list[str]:
    initialize_db()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT DISTINCT date FROM daily_snapshots ORDER BY date"
        ).fetchall()
    return [row["date"] for row in rows]


def list_snapshots() -> list[dict[str, Any]]:
    initialize_db()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT date, market, saved_at, count
            FROM daily_snapshots
            ORDER BY date DESC, market ASC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def compare(d1: str, d2: str, market: str = "ALL") -> dict[str, Any]:
    a = load_by_date(d1, market=market)
    b = load_by_date(d2, market=market)
    if not a or not b:
        return {"error": "file not found", "d1": bool(a), "d2": bool(b), "market": market}

    a_map = {item["code"]: (idx + 1, item) for idx, item in enumerate(a["items"])}
    b_map = {item["code"]: (idx + 1, item) for idx, item in enumerate(b["items"])}

    new_entries = [b_map[code][1] for code in b_map if code not in a_map]
    dropped = [a_map[code][1] for code in a_map if code not in b_map]

    rank_changes = []
    for code, (b_rank, b_item) in b_map.items():
        if code not in a_map:
            continue
        a_rank = a_map[code][0]
        rank_changes.append(
            {
                **b_item,
                "prev_rank": a_rank,
                "curr_rank": b_rank,
                "delta": a_rank - b_rank,
            }
        )
    rank_changes.sort(key=lambda row: -abs(row["delta"]))

    return {
        "d1": d1,
        "d2": d2,
        "market": market,
        "new_entries": new_entries,
        "dropped": dropped,
        "rank_changes": rank_changes[:20],
    }
