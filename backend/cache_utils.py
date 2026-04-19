"""Shared TTL cache helpers."""
from __future__ import annotations

import threading
import time
from typing import Callable, Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


class TTLCache(Generic[K, V]):
    """Small threadsafe in-memory TTL cache."""

    def __init__(self, ttl: float):
        self.ttl = ttl
        self._data: dict[K, tuple[float, V]] = {}
        self._lock = threading.Lock()

    def get(self, key: K, force: bool = False) -> V | None:
        if force:
            return None
        with self._lock:
            cached = self._data.get(key)
            if cached is None:
                return None
            ts, value = cached
            if time.time() - ts >= self.ttl:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: K, value: V) -> V:
        with self._lock:
            self._data[key] = (time.time(), value)
        return value

    def get_or_set(self, key: K, factory: Callable[[], V], force: bool = False) -> V:
        cached = self.get(key, force=force)
        if cached is not None:
            return cached
        value = factory()
        return self.set(key, value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
