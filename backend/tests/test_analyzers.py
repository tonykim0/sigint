from __future__ import annotations

import unittest
from datetime import date, timedelta

import analyzers


def _bars(count: int = 80, start_price: int = 100) -> list[dict]:
    bars = []
    day = date(2025, 1, 1)
    for idx in range(count):
        close = start_price + idx
        bars.append(
            {
                "date": (day + timedelta(days=idx)).isoformat(),
                "open": close - 1,
                "high": close + 2,
                "low": close - 2,
                "close": close,
                "volume": 1000 + idx * 20,
                "trade_value": (1000 + idx * 20) * close,
                "change_rate": 1.0,
            }
        )
    return bars


class AnalyzerTest(unittest.TestCase):
    def test_analyze_returns_summary_and_series(self) -> None:
        result = analyzers.analyze(_bars())
        self.assertEqual(len(result["ma5"]), 80)
        self.assertIn("summary", result)
        self.assertEqual(result["summary"]["ma_arrangement"], "정배열")

    def test_reference_candle_scan_detects_large_breakout_bar(self) -> None:
        bars = _bars(55)
        bars[-1] = {
            "date": bars[-1]["date"],
            "open": 150,
            "high": 170,
            "low": 149,
            "close": 169,
            "volume": 5000,
            "trade_value": 845000,
            "change_rate": 5.0,
        }
        found = analyzers.reference_candle_scan(bars, lookback=5)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["date"], bars[-1]["date"])


if __name__ == "__main__":
    unittest.main()
