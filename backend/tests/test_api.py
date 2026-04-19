from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app_factory import create_app


class ApiSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.prev_db_path = os.environ.get("SIGINT_DB_PATH")
        self.prev_disable = os.environ.get("DISABLE_WARMUP")
        os.environ["SIGINT_DB_PATH"] = os.path.join(self.tmpdir.name, "sigint.db")
        os.environ["DISABLE_WARMUP"] = "1"
        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        if self.prev_db_path is None:
            os.environ.pop("SIGINT_DB_PATH", None)
        else:
            os.environ["SIGINT_DB_PATH"] = self.prev_db_path
        if self.prev_disable is None:
            os.environ.pop("DISABLE_WARMUP", None)
        else:
            os.environ["DISABLE_WARMUP"] = self.prev_disable
        self.tmpdir.cleanup()

    def test_health_endpoint(self) -> None:
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "ok"})

    def test_journal_crud_endpoint_round_trip(self) -> None:
        payload = {
            "code": "005930",
            "name": "삼성전자",
            "entry_date": "2025-01-01",
            "entry_price": 100,
            "reason": "closing_bet",
            "weight_pct": 10,
            "memo": "api",
        }
        created = self.client.post("/api/journal", json=payload)
        self.assertEqual(created.status_code, 200)
        entry_id = created.json()["id"]

        listed = self.client.get("/api/journal")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()["items"]), 1)

        updated = self.client.put(
            f"/api/journal/{entry_id}",
            json={"exit_date": "2025-01-03", "exit_price": 110},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["exit_price"], 110.0)

        deleted = self.client.delete(f"/api/journal/{entry_id}")
        self.assertEqual(deleted.status_code, 200)

    @patch("routers.market.get_trading_universe")
    def test_trading_universe_endpoint(self, mock_universe) -> None:
        mock_universe.return_value = [
            {"code": "005930", "name": "삼성전자", "trade_value": 20_000_000_000},
        ]
        resp = self.client.get("/api/trading-universe?limit=1")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["count"], 1)
        self.assertTrue(body["filters"]["exclude_etf"])


if __name__ == "__main__":
    unittest.main()
