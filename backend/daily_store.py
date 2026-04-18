"""거래대금 TOP 60 일일 저장/조회.

파일: backend/data/daily/{YYYYMMDD}.json
구조: {"date": "20260419", "saved_at": iso, "items": [...]}
"""
from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from kis_client import KISError, volume_rank

DATA_DIR = Path(__file__).parent / "data" / "daily"
_LOCK = threading.Lock()


def _today_ymd() -> str:
    return datetime.now().strftime("%Y%m%d")


def save_today(market: str = "ALL", top_n: int = 60) -> dict[str, Any]:
    items = volume_rank(market=market)[:top_n]
    payload = {
        "date": _today_ymd(),
        "market": market,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(items),
        "items": items,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{payload['date']}.json"
    with _LOCK:
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


def load_by_date(date: str) -> dict[str, Any] | None:
    path = DATA_DIR / f"{date}.json"
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def list_dates() -> list[str]:
    if not DATA_DIR.exists():
        return []
    return sorted(
        p.stem for p in DATA_DIR.glob("*.json") if p.stem.isdigit()
    )


def compare(d1: str, d2: str) -> dict[str, Any]:
    """두 날짜 데이터 비교 - 신규 진입, 이탈, 랭크 변화."""
    a = load_by_date(d1)
    b = load_by_date(d2)
    if not a or not b:
        return {"error": "file not found", "d1": bool(a), "d2": bool(b)}

    a_map = {x["code"]: (i + 1, x) for i, x in enumerate(a["items"])}
    b_map = {x["code"]: (i + 1, x) for i, x in enumerate(b["items"])}

    new_entries = [b_map[c][1] for c in b_map if c not in a_map]
    dropped = [a_map[c][1] for c in a_map if c not in b_map]

    rank_changes = []
    for c, (b_rank, b_item) in b_map.items():
        if c in a_map:
            a_rank = a_map[c][0]
            rank_changes.append(
                {
                    **b_item,
                    "prev_rank": a_rank,
                    "curr_rank": b_rank,
                    "delta": a_rank - b_rank,  # 양수=상승
                }
            )
    rank_changes.sort(key=lambda r: -abs(r["delta"]))

    return {
        "d1": d1,
        "d2": d2,
        "new_entries": new_entries,
        "dropped": dropped,
        "rank_changes": rank_changes[:20],
    }
