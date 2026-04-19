"""Trade journal persistence backed by SQLite."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional

from db import get_connection, initialize_db
from kis_client import KISError, daily_chart

VALID_REASONS = {"closing_bet", "breakout", "pullback"}


def _normalize_reason(value: Any) -> str:
    reason = str(value or "closing_bet")
    return reason if reason in VALID_REASONS else "closing_bet"


def _row_to_entry(row) -> dict[str, Any]:
    tracking_raw = row["tracking_json"] if row["tracking_json"] else "{}"
    try:
        tracking = json.loads(tracking_raw)
    except json.JSONDecodeError:
        tracking = {"d1": None, "d3": None, "d5": None, "d10": None}
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "entry_date": row["entry_date"],
        "entry_price": row["entry_price"],
        "reason": row["reason"],
        "weight_pct": row["weight_pct"],
        "memo": row["memo"],
        "exit_date": row["exit_date"],
        "exit_price": row["exit_price"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "tracking": tracking,
        "category": row["category"],
    }


def _persist_entry(entry: dict[str, Any]) -> None:
    initialize_db()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO journal_entries (
                id, code, name, entry_date, entry_price, reason, weight_pct, memo,
                exit_date, exit_price, created_at, updated_at, tracking_json, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry["id"],
                entry["code"],
                entry.get("name", ""),
                entry["entry_date"],
                float(entry["entry_price"]),
                _normalize_reason(entry.get("reason")),
                float(entry.get("weight_pct", 0) or 0),
                entry.get("memo", ""),
                entry.get("exit_date"),
                entry.get("exit_price"),
                entry["created_at"],
                entry["updated_at"],
                json.dumps(entry.get("tracking") or {}, ensure_ascii=False),
                entry.get("category"),
            ),
        )


def list_entries() -> list[dict[str, Any]]:
    initialize_db()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM journal_entries
            ORDER BY entry_date DESC, created_at DESC
            """
        ).fetchall()
    return [_row_to_entry(row) for row in rows]


def get_entry(entry_id: str) -> Optional[dict[str, Any]]:
    initialize_db()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM journal_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
    return _row_to_entry(row) if row else None


def add_entry(payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    entry = {
        "id": str(uuid.uuid4()),
        "code": str(payload["code"]).zfill(6),
        "name": payload.get("name", ""),
        "entry_date": str(payload["entry_date"]),
        "entry_price": float(payload["entry_price"]),
        "reason": _normalize_reason(payload.get("reason")),
        "weight_pct": float(payload.get("weight_pct", 0) or 0),
        "memo": payload.get("memo", ""),
        "exit_date": str(payload["exit_date"]) if payload.get("exit_date") else None,
        "exit_price": float(payload["exit_price"])
        if payload.get("exit_price") not in (None, "", 0)
        else None,
        "created_at": now,
        "updated_at": now,
        "tracking": {"d1": None, "d3": None, "d5": None, "d10": None},
        "category": None,
    }
    _persist_entry(entry)
    return entry


def update_entry(entry_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    entry = get_entry(entry_id)
    if entry is None:
        return None

    for key in ("name", "memo"):
        if key in patch:
            entry[key] = patch[key]
    if "entry_date" in patch and patch["entry_date"]:
        entry["entry_date"] = str(patch["entry_date"])
    if "exit_date" in patch:
        entry["exit_date"] = str(patch["exit_date"]) if patch["exit_date"] else None
    if "reason" in patch:
        entry["reason"] = _normalize_reason(patch["reason"])
    if "weight_pct" in patch and patch["weight_pct"] is not None:
        entry["weight_pct"] = float(patch["weight_pct"])
    if "entry_price" in patch and patch["entry_price"] is not None:
        entry["entry_price"] = float(patch["entry_price"])
    if "exit_price" in patch:
        value = patch["exit_price"]
        entry["exit_price"] = float(value) if value not in (None, "", 0) else None
    entry["updated_at"] = datetime.now().isoformat(timespec="seconds")
    _persist_entry(entry)
    return entry


def delete_entry(entry_id: str) -> bool:
    initialize_db()
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
    return cur.rowcount > 0


def _classify(entry_price: float, tracking: dict[str, Any]) -> Optional[str]:
    d3, d5, d10 = tracking.get("d3"), tracking.get("d5"), tracking.get("d10")
    if d10 is None:
        return None
    if d10 > entry_price and d3 is not None and d3 >= entry_price:
        return "추세형"
    if d3 is not None and d3 > entry_price * 1.03 and d10 <= d3:
        return "단발형"
    if d3 is not None and d3 < entry_price and d10 > entry_price:
        return "눌림형"
    return None


def refresh_tracking(entry_id: str) -> Optional[dict[str, Any]]:
    entry = get_entry(entry_id)
    if entry is None:
        return None
    try:
        bars = daily_chart(entry["code"], days=30)
    except KISError:
        return entry

    after = [bar for bar in bars if bar.get("date", "") > entry["entry_date"]]
    after.sort(key=lambda bar: bar["date"])

    def pick(n: int) -> Optional[float]:
        return after[n - 1]["close"] if len(after) >= n else None

    tracking = {
        "d1": pick(1),
        "d3": pick(3),
        "d5": pick(5),
        "d10": pick(10),
    }
    entry["tracking"] = tracking
    entry["category"] = _classify(entry["entry_price"], tracking)
    entry["updated_at"] = datetime.now().isoformat(timespec="seconds")
    _persist_entry(entry)
    return entry


def stats() -> dict[str, Any]:
    entries = list_entries()
    total = len(entries)
    closed = [entry for entry in entries if entry.get("exit_price")]
    closed_count = len(closed)

    def ret(entry: dict[str, Any]) -> float:
        return (entry["exit_price"] - entry["entry_price"]) / entry["entry_price"] * 100

    wins = [entry for entry in closed if ret(entry) > 0]
    losses = [entry for entry in closed if ret(entry) <= 0]
    win_sum = sum(ret(entry) for entry in wins)
    loss_sum = sum(ret(entry) for entry in losses)

    by_reason: dict[str, dict[str, Any]] = {}
    for entry in closed:
        reason = entry.get("reason", "closing_bet")
        bucket = by_reason.setdefault(reason, {"count": 0, "wins": 0, "avg_return": 0.0})
        bucket["count"] += 1
        if ret(entry) > 0:
            bucket["wins"] += 1
        bucket["avg_return"] += ret(entry)
    for bucket in by_reason.values():
        if bucket["count"]:
            bucket["avg_return"] = round(bucket["avg_return"] / bucket["count"], 2)
            bucket["win_rate"] = round(bucket["wins"] / bucket["count"] * 100, 1)

    sorted_closed = sorted(closed, key=lambda entry: entry.get("exit_date") or "")
    max_cons_wins = max_cons_losses = cur_w = cur_l = 0
    for entry in sorted_closed:
        if ret(entry) > 0:
            cur_w += 1
            cur_l = 0
            if cur_w > max_cons_wins:
                max_cons_wins = cur_w
        else:
            cur_l += 1
            cur_w = 0
            if cur_l > max_cons_losses:
                max_cons_losses = cur_l

    return {
        "total_count": total,
        "closed_count": closed_count,
        "open_count": total - closed_count,
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(len(wins) / closed_count * 100, 1) if closed_count else 0,
        "avg_return_pct": round(sum(ret(entry) for entry in closed) / closed_count, 2)
        if closed_count
        else 0,
        "max_consecutive_wins": max_cons_wins,
        "max_consecutive_losses": max_cons_losses,
        "avg_win_pct": round(win_sum / len(wins), 2) if wins else 0,
        "avg_loss_pct": round(loss_sum / len(losses), 2) if losses else 0,
        "profit_factor": round(win_sum / abs(loss_sum), 2)
        if loss_sum < 0
        else (None if not wins else float("inf")),
        "by_reason": by_reason,
    }
