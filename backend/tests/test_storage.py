from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

import daily_store
import journal


class StorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.prev_db_path = os.environ.get("SIGINT_DB_PATH")
        os.environ["SIGINT_DB_PATH"] = os.path.join(self.tmpdir.name, "sigint.db")

    def tearDown(self) -> None:
        if self.prev_db_path is None:
            os.environ.pop("SIGINT_DB_PATH", None)
        else:
            os.environ["SIGINT_DB_PATH"] = self.prev_db_path
        self.tmpdir.cleanup()

    @patch("journal.daily_chart")
    def test_journal_round_trip_and_tracking(self, mock_daily_chart) -> None:
        created = journal.add_entry(
            {
                "code": "005930",
                "name": "삼성전자",
                "entry_date": "2025-01-01",
                "entry_price": 100.0,
                "reason": "closing_bet",
                "weight_pct": 10,
                "memo": "test",
            }
        )
        listed = journal.list_entries()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["id"], created["id"])

        updated = journal.update_entry(
            created["id"],
            {"exit_date": "2025-01-10", "exit_price": 120.0},
        )
        self.assertEqual(updated["exit_price"], 120.0)

        mock_daily_chart.return_value = [
            {"date": "2025-01-02", "close": 101},
            {"date": "2025-01-03", "close": 102},
            {"date": "2025-01-06", "close": 103},
            {"date": "2025-01-07", "close": 104},
            {"date": "2025-01-08", "close": 105},
            {"date": "2025-01-09", "close": 106},
            {"date": "2025-01-10", "close": 107},
            {"date": "2025-01-13", "close": 108},
            {"date": "2025-01-14", "close": 109},
            {"date": "2025-01-15", "close": 110},
        ]
        tracked = journal.refresh_tracking(created["id"])
        self.assertEqual(tracked["tracking"]["d1"], 101)
        self.assertEqual(tracked["tracking"]["d3"], 103)
        self.assertEqual(tracked["tracking"]["d10"], 110)

        stats = journal.stats()
        self.assertEqual(stats["closed_count"], 1)
        self.assertEqual(stats["win_count"], 1)

        self.assertTrue(journal.delete_entry(created["id"]))
        self.assertEqual(journal.list_entries(), [])

    @patch("daily_store._today_ymd", side_effect=["20250101", "20250102", "20250101"])
    @patch("daily_store.get_trading_universe")
    def test_daily_snapshots_are_market_scoped(self, mock_universe, _mock_today) -> None:
        mock_universe.side_effect = [
            [
                {"code": "000001", "name": "A", "trade_value": 20_000_000_000},
            ],
            [
                {"code": "000001", "name": "A", "trade_value": 20_000_000_000},
                {"code": "000002", "name": "B", "trade_value": 15_000_000_000},
            ],
            [
                {"code": "100001", "name": "KOSPI-A", "trade_value": 30_000_000_000},
            ],
        ]

        daily_store.save_today("ALL", top_n=2)
        daily_store.save_today("ALL", top_n=2)
        daily_store.save_today("KOSPI", top_n=1)

        market_snapshot = daily_store.load_by_date("20250101", market="KOSPI")
        self.assertEqual(market_snapshot["market"], "KOSPI")
        self.assertEqual(market_snapshot["count"], 1)

        compare = daily_store.compare("20250101", "20250102", market="ALL")
        self.assertEqual(compare["new_entries"][0]["code"], "000002")

        snapshots = daily_store.list_snapshots()
        self.assertEqual(len(snapshots), 3)


if __name__ == "__main__":
    unittest.main()
