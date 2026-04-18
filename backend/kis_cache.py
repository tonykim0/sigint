"""디스크 백업 캐시 — KIS 응답 중 '종가 기준이라 자주 변하지 않는' 엔드포인트용.

스크리너는 하루 수십 번 호출돼도 실질 데이터는 거의 동일하다 (일봉/수급/지수 일봉).
이를 (fn_name, args) 키로 JSON 직렬화해 backend/data/cache/ 에 저장한다.

TTL:
  - daily_chart, daily_index_chart, inquire_investor → 2h (장중 마지막 봉만 변동)
  - index_price → 60s (장중 변동 큼)

장점:
  - 프로세스 재시작 후에도 캐시 유지
  - 3개 스크리너(종가/눌림목/돌파)가 동일 종목의 daily_chart를 공유
  - 메모리에도 캐싱해 디스크 I/O 최소화
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from pathlib import Path
from typing import Any, Callable

CACHE_DIR = Path(__file__).parent / "data" / "cache"
_MEMORY: dict[str, tuple[float, Any]] = {}
_LOCK = threading.Lock()

DEFAULT_TTL = 7200.0  # 2시간


def _cache_key(fn_name: str, args: tuple, kwargs: dict) -> str:
    payload = json.dumps(
        {"fn": fn_name, "args": list(args), "kw": kwargs},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _disk_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def cached_call(
    fn: Callable[..., Any],
    *args: Any,
    _ttl: float = DEFAULT_TTL,
    _fn_name: str | None = None,
    **kwargs: Any,
) -> Any:
    """fn(*args, **kwargs) 결과를 메모리+디스크에 캐싱.

    _ttl/_fn_name 은 래퍼 전용 키워드로 fn 에 전달되지 않는다.
    """
    name = _fn_name or f"{getattr(fn, '__module__', '')}.{getattr(fn, '__name__', 'fn')}"
    key = _cache_key(name, args, kwargs)
    now = time.time()

    with _LOCK:
        hit = _MEMORY.get(key)
    if hit and now - hit[0] < _ttl:
        return hit[1]

    path = _disk_path(key)
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as f:
                entry = json.load(f)
            ts = float(entry.get("ts", 0))
            if now - ts < _ttl:
                data = entry.get("data")
                with _LOCK:
                    _MEMORY[key] = (ts, data)
                return data
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            pass

    # Cache miss — 실제 호출
    result = fn(*args, **kwargs)

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump({"ts": now, "data": result}, f, ensure_ascii=False, default=str)
        tmp.replace(path)
    except OSError:
        pass

    with _LOCK:
        _MEMORY[key] = (now, result)
    return result


def invalidate_all() -> int:
    """전체 캐시 무효화. 반환: 삭제된 항목 수."""
    count = 0
    with _LOCK:
        count += len(_MEMORY)
        _MEMORY.clear()
    if CACHE_DIR.exists():
        for p in CACHE_DIR.glob("*.json"):
            try:
                p.unlink()
                count += 1
            except OSError:
                pass
    return count
