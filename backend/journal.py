"""매매일지 저장/조회/통계/추적.

데이터: backend/data/journal.json  (리스트[entry])
entry schema:
  id, code, name, entry_date, entry_price, reason, weight_pct, memo,
  exit_date, exit_price,
  created_at, updated_at,
  tracking: { d3, d5, d10 },     # 각 거래일의 종가
  category: '추세형' | '단발형' | '눌림형' | null
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from kis_client import KISError, daily_chart


def _parse_date(value: Any) -> Optional[date]:
    """'YYYY-MM-DD' 또는 'YYYYMMDD' 형식을 date 로. 실패 시 None."""
    if not value:
        return None
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

DATA_FILE = Path(__file__).parent / "data" / "journal.json"
_LOCK = threading.Lock()

VALID_REASONS = {"closing_bet", "breakout", "pullback"}


def _normalize_reason(value: Any) -> str:
    reason = str(value or "closing_bet")
    return reason if reason in VALID_REASONS else "closing_bet"


def _read_all() -> list[dict[str, Any]]:
    if not DATA_FILE.exists():
        return []
    try:
        with DATA_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_all(entries: list[dict[str, Any]]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    tmp.replace(DATA_FILE)


def list_entries() -> list[dict[str, Any]]:
    with _LOCK:
        return _read_all()


def get_entry(entry_id: str) -> Optional[dict[str, Any]]:
    with _LOCK:
        for e in _read_all():
            if e["id"] == entry_id:
                return e
    return None


def add_entry(payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    entry = {
        "id": str(uuid.uuid4()),
        "code": str(payload["code"]).zfill(6),
        "name": payload.get("name", ""),
        "entry_date": payload["entry_date"],
        "entry_price": float(payload["entry_price"]),
        "reason": _normalize_reason(payload.get("reason")),
        "weight_pct": float(payload.get("weight_pct", 0) or 0),
        "memo": payload.get("memo", ""),
        "exit_date": payload.get("exit_date"),
        "exit_price": float(payload["exit_price"])
        if payload.get("exit_price") not in (None, "", 0)
        else None,
        "created_at": now,
        "updated_at": now,
        "tracking": {"d1": None, "d3": None, "d5": None, "d10": None},
        "category": None,
    }
    with _LOCK:
        entries = _read_all()
        entries.append(entry)
        _write_all(entries)
    return entry


def update_entry(entry_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with _LOCK:
        entries = _read_all()
        for e in entries:
            if e["id"] != entry_id:
                continue
            for k in ("name", "memo", "exit_date"):
                if k in patch:
                    e[k] = patch[k]
            if "reason" in patch:
                e["reason"] = _normalize_reason(patch["reason"])
            if "weight_pct" in patch and patch["weight_pct"] is not None:
                e["weight_pct"] = float(patch["weight_pct"])
            if "entry_price" in patch and patch["entry_price"] is not None:
                e["entry_price"] = float(patch["entry_price"])
            if "exit_price" in patch:
                v = patch["exit_price"]
                e["exit_price"] = float(v) if v not in (None, "", 0) else None
            if "entry_date" in patch and patch["entry_date"]:
                e["entry_date"] = patch["entry_date"]
            e["updated_at"] = datetime.now().isoformat(timespec="seconds")
            _write_all(entries)
            return e
    return None


def delete_entry(entry_id: str) -> bool:
    with _LOCK:
        entries = _read_all()
        new = [e for e in entries if e["id"] != entry_id]
        if len(new) == len(entries):
            return False
        _write_all(new)
        return True


def _classify(entry_price: float, t: dict[str, Any]) -> Optional[str]:
    d3, d5, d10 = t.get("d3"), t.get("d5"), t.get("d10")
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
    """entry_date 이후 N거래일차 종가를 daily_chart 에서 채움."""
    entry = get_entry(entry_id)
    if entry is None:
        return None
    try:
        bars = daily_chart(entry["code"], days=30)
    except KISError:
        return entry

    entry_d = _parse_date(entry["entry_date"])
    if entry_d is None:
        return entry

    after = []
    for b in bars:
        bar_d = _parse_date(b.get("date", ""))
        if bar_d is not None and bar_d > entry_d:
            after.append(b)
    after.sort(key=lambda b: b["date"])

    def pick(n: int) -> Optional[float]:
        return after[n - 1]["close"] if len(after) >= n else None

    tracking = {
        "d1": pick(1),
        "d3": pick(3),
        "d5": pick(5),
        "d10": pick(10),
    }
    category = _classify(entry["entry_price"], tracking)

    with _LOCK:
        entries = _read_all()
        for e in entries:
            if e["id"] == entry_id:
                e["tracking"] = tracking
                e["category"] = category
                e["updated_at"] = datetime.now().isoformat(timespec="seconds")
                _write_all(entries)
                return e
    return None


def stats() -> dict[str, Any]:
    entries = list_entries()
    total = len(entries)
    closed = [e for e in entries if e.get("exit_price")]
    closed_count = len(closed)

    def ret(e: dict[str, Any]) -> float:
        return (e["exit_price"] - e["entry_price"]) / e["entry_price"] * 100

    wins = [e for e in closed if ret(e) > 0]
    losses = [e for e in closed if ret(e) <= 0]
    win_sum = sum(ret(e) for e in wins)
    loss_sum = sum(ret(e) for e in losses)  # 음수

    by_reason: dict[str, dict[str, Any]] = {}
    for e in closed:
        r = e.get("reason", "closing_bet")
        b = by_reason.setdefault(r, {"count": 0, "wins": 0, "avg_return": 0.0})
        b["count"] += 1
        if ret(e) > 0:
            b["wins"] += 1
        b["avg_return"] += ret(e)
    for b in by_reason.values():
        if b["count"]:
            b["avg_return"] = round(b["avg_return"] / b["count"], 2)
            b["win_rate"] = round(b["wins"] / b["count"] * 100, 1)

    # 연속 승/패
    sorted_closed = sorted(closed, key=lambda e: e.get("exit_date") or "")
    max_cons_wins = max_cons_losses = cur_w = cur_l = 0
    for e in sorted_closed:
        if ret(e) > 0:
            cur_w += 1; cur_l = 0
            if cur_w > max_cons_wins: max_cons_wins = cur_w
        else:
            cur_l += 1; cur_w = 0
            if cur_l > max_cons_losses: max_cons_losses = cur_l

    return {
        "total_count": total,
        "closed_count": closed_count,
        "open_count": total - closed_count,
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(len(wins) / closed_count * 100, 1) if closed_count else 0,
        "avg_return_pct": round(
            sum(ret(e) for e in closed) / closed_count, 2
        )
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
