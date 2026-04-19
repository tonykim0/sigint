"""SQLite storage and one-time legacy JSON migration."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

_INIT_LOCK = threading.Lock()


def database_path() -> Path:
    configured = os.getenv("SIGINT_DB_PATH", "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).parent / "data" / "sigint.db"


def _legacy_journal_path() -> Path:
    return Path(__file__).parent / "data" / "journal.json"


def _legacy_daily_dir() -> Path:
    return Path(__file__).parent / "data" / "daily"


def get_connection() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def initialize_db() -> None:
    with _INIT_LOCK:
        with get_connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    entry_date TEXT NOT NULL,
                    entry_price REAL NOT NULL,
                    reason TEXT NOT NULL,
                    weight_pct REAL NOT NULL DEFAULT 0,
                    memo TEXT NOT NULL DEFAULT '',
                    exit_date TEXT,
                    exit_price REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    tracking_json TEXT NOT NULL,
                    category TEXT
                );

                CREATE TABLE IF NOT EXISTS daily_snapshots (
                    date TEXT NOT NULL,
                    market TEXT NOT NULL,
                    saved_at TEXT NOT NULL,
                    count INTEGER NOT NULL,
                    items_json TEXT NOT NULL,
                    PRIMARY KEY (date, market)
                );
                """
            )
            _migrate_journal_json(conn)
            _migrate_daily_json(conn)


def _table_has_rows(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        f"SELECT 1 FROM {table_name} LIMIT 1"
    ).fetchone()
    return row is not None


def _load_json_file(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _migrate_journal_json(conn: sqlite3.Connection) -> None:
    if _table_has_rows(conn, "journal_entries"):
        return

    path = _legacy_journal_path()
    if not path.exists():
        return

    data = _load_json_file(path)
    if not isinstance(data, list):
        return

    for entry in data:
        if not isinstance(entry, dict):
            continue
        tracking = entry.get("tracking") or {
            "d1": None,
            "d3": None,
            "d5": None,
            "d10": None,
        }
        conn.execute(
            """
            INSERT OR IGNORE INTO journal_entries (
                id, code, name, entry_date, entry_price, reason, weight_pct, memo,
                exit_date, exit_price, created_at, updated_at, tracking_json, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get("id"),
                entry.get("code"),
                entry.get("name", ""),
                entry.get("entry_date"),
                float(entry.get("entry_price") or 0),
                entry.get("reason", "closing_bet"),
                float(entry.get("weight_pct") or 0),
                entry.get("memo", ""),
                entry.get("exit_date"),
                entry.get("exit_price"),
                entry.get("created_at") or entry.get("updated_at") or "",
                entry.get("updated_at") or entry.get("created_at") or "",
                json.dumps(tracking, ensure_ascii=False),
                entry.get("category"),
            ),
        )


def _migrate_daily_json(conn: sqlite3.Connection) -> None:
    if _table_has_rows(conn, "daily_snapshots"):
        return

    data_dir = _legacy_daily_dir()
    if not data_dir.exists():
        return

    for path in sorted(data_dir.glob("*.json")):
        payload = _load_json_file(path)
        if not isinstance(payload, dict):
            continue
        date = str(payload.get("date") or path.stem)
        market = str(payload.get("market") or "ALL")
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        conn.execute(
            """
            INSERT OR IGNORE INTO daily_snapshots (
                date, market, saved_at, count, items_json
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                date,
                market,
                payload.get("saved_at") or "",
                int(payload.get("count") or len(items)),
                json.dumps(items, ensure_ascii=False),
            ),
        )


def decode_items_json(raw: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []
