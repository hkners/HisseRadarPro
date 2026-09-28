"""
Unit and Integration Tests for Market Regime Service and Regime Integration.
Tests:
1. Breadth calculation from live and historical prices
2. Index metric calculation (Close, MA50, MA200, above_ma200)
3. 3-tier Regime rules (RISK_ON, NEUTRAL, RISK_OFF)
4. Exposure multiplier application in PortfolioBuilder
5. Dynamic strong_buy_threshold (+8 pts in RISK_OFF) in ConvictionEngine
6. /api/market-regime and /api/portfolio/generate endpoint integration
"""

import unittest
import os
import sys

# Ensure backend in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.market_regime_service import MarketRegimeService, get_current_regime
from services.portfolio_builder import PortfolioBuilder
from db_manager import ReportRepository


class TestMarketRegimeService(unittest.TestCase):
    def setUp(self):
        self.service = MarketRegimeService()
        self.repo = ReportRepository()

    def test_determine_regime_label_risk_on(self):
        # Advancing breadth + Above MA200 -> RISK_ON
        regime = self.service.determine_regime_label(
            is_breadth_advancing=True,
            is_breadth_declining=False,
            above_ma200=True
        )
        self.assertEqual(regime, "RISK_ON")

    def test_determine_regime_label_risk_off(self):
        # Declining breadth + Below MA200 -> RISK_OFF
        regime = self.service.determine_regime_label(
            is_breadth_advancing=False,
            is_breadth_declining=True,
            above_ma200=False
        )
        self.assertEqual(regime, "RISK_OFF")

    def test_determine_regime_label_neutral_advancing_below_ma(self):
        # Advancing breadth + Below MA200 -> NEUTRAL
        regime = self.service.determine_regime_label(
            is_breadth_advancing=True,
            is_breadth_declining=False,
            above_ma200=False
        )
        self.assertEqual(regime, "NEUTRAL")

    def test_determine_regime_label_neutral_declining_above_ma(self):
        # Declining breadth + Above MA200 -> NEUTRAL
        regime = self.service.determine_regime_label(
            is_breadth_advancing=False,
            is_breadth_declining=True,
            above_ma200=True
        )
        self.assertEqual(regime, "NEUTRAL")

    def test_determine_regime_label_neutral_balanced(self):
        # Balanced breadth -> NEUTRAL
        regime = self.service.determine_regime_label(
            is_breadth_advancing=False,
            is_breadth_declining=False,
            above_ma200=True
        )
        self.assertEqual(regime, "NEUTRAL")

    def test_calculate_breadth_from_prices(self):
        mock_prices = {
            "THYAO": {"change_pct": 2.5},
            "GARAN": {"change_pct": 1.2},
            "AKBNK": {"change_pct": -0.8},
            "SISE": {"change_pct": 0.0},
            "XU100": {"change_pct": 1.0}  # Should be excluded from stock breadth
        }
        breadth = self.service.calculate_breadth_from_prices(mock_prices)
        self.assertEqual(breadth["up"], 2)
        self.assertEqual(breadth["down"], 1)
        self.assertEqual(breadth["flat"], 1)
        self.assertEqual(breadth["total"], 4)
        self.assertTrue(breadth["is_advancing"])
        self.assertFalse(breadth["is_declining"])
        self.assertEqual(breadth["bias"], "ADVANCING")

    def test_get_index_metrics(self):
        index_data = self.service.get_index_metrics(ticker="XU100")
        self.assertTrue(index_data["is_available"])
        self.assertGreater(index_data["close"], 0)
        self.assertGreater(index_data["ma50"], 0)
        self.assertGreater(index_data["ma200"], 0)
        self.assertIn("above_ma200", index_data)
        self.assertIn("pct_diff_ma200", index_data)

    def test_get_current_regime_output_structure(self):
        res = self.service.get_current_regime()
        self.assertIn(res["regime"], ["RISK_ON", "NEUTRAL", "RISK_OFF"])
        self.assertIn("exposure_multiplier", res)
        self.assertIn(res["exposure_multiplier"], [0.5, 1.0])
        self.assertIn("strong_buy_threshold", res)
        self.assertIn(res["strong_buy_threshold"], [75, 83])
        self.assertIn("breadth", res)
        self.assertIn("index", res)
        self.assertIn("color", res)
        self.assertIn("badge", res)

    def test_portfolio_builder_exposure_multiplier_override(self):
        builder = PortfolioBuilder()
        # Explicit exposure_multiplier = 0.5 (as in RISK_OFF)
        p = builder.generate_portfolio(
            top_n=5,
            universe="bist30",
            budget_tl=100000.0,
            exposure_multiplier=0.5,
            repo=self.repo
        )
        summary = p["summary"]
        self.assertEqual(summary["total_budget"], 100000.0)
        self.assertEqual(summary["effective_budget"], 50000.0)
        self.assertEqual(summary["exposure_multiplier"], 0.5)
        self.assertEqual(summary["cash_reserved_regime"], 50000.0)
        self.assertLessEqual(summary["invested_amount"], 50000.0)
        self.assertGreaterEqual(summary["remaining_cash"], 50000.0)

    def test_portfolio_builder_exposure_multiplier_full(self):
        builder = PortfolioBuilder()
        # Explicit exposure_multiplier = 1.0 (as in RISK_ON / NEUTRAL)
        p = builder.generate_portfolio(
            top_n=5,
            universe="bist30",
            budget_tl=100000.0,
            exposure_multiplier=1.0,
            repo=self.repo
        )
        summary = p["summary"]
        self.assertEqual(summary["total_budget"], 100000.0)
        self.assertEqual(summary["effective_budget"], 100000.0)
        self.assertEqual(summary["exposure_multiplier"], 1.0)
        self.assertEqual(summary["cash_reserved_regime"], 0.0)
        self.assertGreater(summary["invested_amount"], 0.0)


class TestApiIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from main import app
        cls.client = TestClient(app)

    def test_api_market_regime_endpoint(self):
        response = self.client.get("/api/market-regime")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn(data.get("regime"), ["RISK_ON", "NEUTRAL", "RISK_OFF"])
        self.assertIn("exposure_multiplier", data)
        self.assertIn("breadth", data)
        self.assertIn("index", data)

    def test_api_dashboard_includes_market_regime(self):
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("market_pulse", data)
        self.assertIn("market_regime", data)
        self.assertIn(data["market_regime"]["regime"], ["RISK_ON", "NEUTRAL", "RISK_OFF"])

    def test_api_portfolio_generate_with_exposure_multiplier(self):
        payload = {
            "top_n": 5,
            "universe": "bist30",
            "budget_tl": 80000.0,
            "method": "score_proportional",
            "score_metric": "conviction_score",
            "exposure_multiplier": 0.5
        }
        response = self.client.post("/api/portfolio/generate", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("summary", data)
        self.assertEqual(data["summary"]["exposure_multiplier"], 0.5)
        self.assertEqual(data["summary"]["effective_budget"], 40000.0)
        self.assertLessEqual(data["summary"]["invested_amount"], 40000.0)


if __name__ == "__main__":
    unittest.main()
