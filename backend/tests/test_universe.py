from __future__ import annotations

import unittest
from unittest.mock import patch

from universe import filter_trade_rank_items, get_trading_universe


class UniverseRulesTest(unittest.TestCase):
    def test_filter_trade_rank_items_applies_shared_rules(self) -> None:
        items = [
            {"code": "1", "name": "KODEX 200", "trade_value": 20_000_000_000},
            {"code": "2", "name": "삼성전자우", "trade_value": 20_000_000_000},
            {"code": "3", "name": "보통주A", "trade_value": 5_000_000_000},
            {"code": "4", "name": "보통주B", "trade_value": 20_000_000_000},
        ]
        filtered = filter_trade_rank_items(items)
        self.assertEqual([row["code"] for row in filtered], ["4"])

    @patch("universe.volume_rank")
    def test_get_trading_universe_uses_rank_source_once(self, mock_volume_rank) -> None:
        mock_volume_rank.return_value = [
            {"code": "4", "name": "보통주B", "trade_value": 20_000_000_000},
            {"code": "5", "name": "보통주C", "trade_value": 15_000_000_000},
        ]
        result = get_trading_universe(limit=1)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["code"], "4")
        mock_volume_rank.assert_called_once_with(market="ALL", force=False)


if __name__ == "__main__":
    unittest.main()
