"""
HisseRadarPro — Portfolio Builder Test Suite
============================================
Comprehensive unit tests covering:
1. Candidate portfolio building (universe filtering: all, bist30, bist100)
2. Correlation matrix computation (symmetry, bounds, new IPO / missing data edge case)
3. Diversification filtering (pairwise correlation pruning, sector cap, all-in-one-sector edge case)
4. Liquidity capping (ADV computation, 10% ADV threshold clipping, missing volume edge case)
5. Position weighting (equal, score_proportional, inverse_volatility)
6. Full generate_portfolio pipeline (integer lot rounding, budget conservation, cash drag)
"""

import sys
import os
import unittest
import math

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from db_manager import ReportRepository
from services.portfolio_builder import (
    PortfolioBuilder,
    BIST30_TICKERS,
    BIST100_TICKERS,
    build_candidate_portfolio,
    compute_correlation_matrix,
    apply_diversification_filter,
    compute_liquidity_cap,
    compute_position_weights,
    generate_portfolio
)


class TestPortfolioBuilder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = ReportRepository()
        cls.builder = PortfolioBuilder(repo=cls.repo)

    # -------------------------------------------------------------
    # 1. Candidate Portfolio Tests
    # -------------------------------------------------------------
    def test_candidate_universe_bist30(self):
        candidates = self.builder.build_candidate_portfolio(top_n=10, universe="bist30", repo=self.repo)
        self.assertGreater(len(candidates), 0, "BIST 30 candidates should not be empty")
        for c in candidates:
            self.assertIn(c["ticker"], BIST30_TICKERS, f"{c['ticker']} must be in BIST 30")
            self.assertGreater(c["price"], 0)
            self.assertGreaterEqual(c["score"], 0)

    def test_candidate_universe_bist100(self):
        candidates = self.builder.build_candidate_portfolio(top_n=15, universe="bist100", repo=self.repo)
        self.assertGreater(len(candidates), 0, "BIST 100 candidates should not be empty")
        for c in candidates:
            self.assertIn(c["ticker"], BIST100_TICKERS, f"{c['ticker']} must be in BIST 100")

    def test_candidate_sorting(self):
        candidates = self.builder.build_candidate_portfolio(top_n=10, universe="all", repo=self.repo)
        scores = [c["score"] for c in candidates]
        self.assertEqual(scores, sorted(scores, reverse=True), "Candidates must be sorted descending by score")

    # -------------------------------------------------------------
    # 2. Correlation Matrix Tests
    # -------------------------------------------------------------
    def test_correlation_matrix_properties(self):
        tickers = ["GARAN", "AKBNK", "THYAO", "TUPRS"]
        corr = self.builder.compute_correlation_matrix(tickers, lookback_days=100, repo=self.repo)
        for t in tickers:
            self.assertIn(t, corr)
            # Diagonal must be 1.0
            self.assertAlmostEqual(corr[t][t], 1.0, places=3)
            for t2 in tickers:
                # Symmetry
                self.assertAlmostEqual(corr[t][t2], corr[t2][t], places=4)
                # Bounded in [-1.0, 1.0]
                self.assertGreaterEqual(corr[t][t2], -1.0)
                self.assertLessEqual(corr[t][t2], 1.0)

    def test_correlation_edge_case_new_ipo_or_missing_data(self):
        """A synthetic or newly listed ticker with no price history should yield 0.0 correlation without crashing."""
        tickers = ["GARAN", "FAKEIPO99"]
        corr = self.builder.compute_correlation_matrix(tickers, lookback_days=100, repo=self.repo)
        self.assertIn("FAKEIPO99", corr)
        self.assertEqual(corr["GARAN"]["FAKEIPO99"], 0.0)
        self.assertEqual(corr["FAKEIPO99"]["GARAN"], 0.0)

    # -------------------------------------------------------------
    # 3. Diversification Filter Tests
    # -------------------------------------------------------------
    def test_pairwise_correlation_pruning(self):
        """When two tickers have correlation > 0.70, the lower scoring ticker must be pruned."""
        candidates = [
            {"ticker": "HIGH_SCORE", "score": 85.0, "sector": "Bank", "price": 100.0},
            {"ticker": "LOW_SCORE", "score": 60.0, "sector": "Bank", "price": 50.0},
            {"ticker": "UNRELATED", "score": 75.0, "sector": "Tech", "price": 30.0}
        ]
        # Correlation between HIGH_SCORE and LOW_SCORE is 0.88 (> 0.70)
        corr_matrix = {
            "HIGH_SCORE": {"HIGH_SCORE": 1.0, "LOW_SCORE": 0.88, "UNRELATED": 0.20},
            "LOW_SCORE": {"HIGH_SCORE": 0.88, "LOW_SCORE": 1.0, "UNRELATED": 0.15},
            "UNRELATED": {"HIGH_SCORE": 0.20, "LOW_SCORE": 0.15, "UNRELATED": 1.0}
        }
        filtered = self.builder.apply_diversification_filter(
            candidates, corr_matrix, max_pairwise_corr=0.70, max_sector_weight=0.50
        )
        tickers = [c["ticker"] for c in filtered]
        self.assertIn("HIGH_SCORE", tickers)
        self.assertIn("UNRELATED", tickers)
        self.assertNotIn("LOW_SCORE", tickers, "LOW_SCORE must be pruned due to high correlation with HIGH_SCORE")

    def test_sector_concentration_pruning(self):
        """When a sector has more candidates than allowed by max_sector_weight, lowest scoring candidates are pruned."""
        candidates = [
            {"ticker": "BNK1", "score": 90.0, "sector": "Bank", "price": 10.0},
            {"ticker": "BNK2", "score": 85.0, "sector": "Bank", "price": 10.0},
            {"ticker": "BNK3", "score": 80.0, "sector": "Bank", "price": 10.0},
            {"ticker": "BNK4", "score": 75.0, "sector": "Bank", "price": 10.0},
            {"ticker": "IND1", "score": 70.0, "sector": "Industrials", "price": 10.0},
            {"ticker": "TCH1", "score": 68.0, "sector": "Technology", "price": 10.0},
            {"ticker": "ENR1", "score": 65.0, "sector": "Energy", "price": 10.0},
            {"ticker": "CON1", "score": 62.0, "sector": "Consumer", "price": 10.0},
            {"ticker": "TEL1", "score": 60.0, "sector": "Telecom", "price": 10.0},
            {"ticker": "MAT1", "score": 58.0, "sector": "Materials", "price": 10.0}
        ]
        # Target size 10, max_sector_weight 0.30 -> max 3 per sector
        filtered = self.builder.apply_diversification_filter(
            candidates, correlation_matrix={}, max_pairwise_corr=0.99, max_sector_weight=0.30, target_size=10
        )
        bank_tickers = [c["ticker"] for c in filtered if c["sector"] == "Bank"]
        self.assertLessEqual(len(bank_tickers), 3, "Bank sector should not exceed max 3 candidates")
        self.assertNotIn("BNK4", bank_tickers, "Lowest scored bank BNK4 should be pruned")

    def test_edge_case_all_candidates_same_sector(self):
        """If all candidates are in the exact same sector, the filter must retain at least the top candidate."""
        candidates = [
            {"ticker": "BNK1", "score": 90.0, "sector": "Bank", "price": 10.0},
            {"ticker": "BNK2", "score": 80.0, "sector": "Bank", "price": 10.0},
            {"ticker": "BNK3", "score": 70.0, "sector": "Bank", "price": 10.0}
        ]
        filtered = self.builder.apply_diversification_filter(
            candidates, correlation_matrix={}, max_pairwise_corr=0.99, max_sector_weight=0.30, target_size=5
        )
        self.assertGreaterEqual(len(filtered), 1, "Must retain at least 1 candidate when all in same sector")
        self.assertEqual(filtered[0]["ticker"], "BNK1", "Highest score must be retained")

    # -------------------------------------------------------------
    # 4. Liquidity Cap Tests
    # -------------------------------------------------------------
    def test_liquidity_cap_within_limit(self):
        """A normal position size below 10% of ADV should not be capped."""
        # GARAN average daily volume is tens of millions of TL
        res = self.builder.compute_liquidity_cap("GARAN", proposed_position_value=50000.0, max_pct_of_adv=0.10, repo=self.repo)
        self.assertFalse(res["is_capped"])
        self.assertEqual(res["capped_value"], 50000.0)
        self.assertIsNotNone(res["adv_tl"])

    def test_liquidity_cap_exceeding_limit(self):
        """A position proposing billions of TL must be clamped to max_allowed_position."""
        res = self.builder.compute_liquidity_cap("GARAN", proposed_position_value=5000000000.0, max_pct_of_adv=0.10, repo=self.repo)
        self.assertTrue(res["is_capped"])
        self.assertLess(res["capped_value"], 5000000000.0)
        self.assertEqual(res["capped_value"], res["max_allowed_position"])

    def test_liquidity_cap_edge_case_missing_volume(self):
        """Ticker with no volume data should return proposed position without crashing."""
        res = self.builder.compute_liquidity_cap("NONEXISTENT", proposed_position_value=10000.0, repo=self.repo)
        self.assertFalse(res["is_capped"])
        self.assertEqual(res["capped_value"], 10000.0)
        self.assertIsNone(res["adv_tl"])

    # -------------------------------------------------------------
    # 5. Position Weights Tests
    # -------------------------------------------------------------
    def test_weights_equal(self):
        candidates = [
            {"ticker": "A", "score": 90.0, "price": 10.0},
            {"ticker": "B", "score": 80.0, "price": 20.0},
            {"ticker": "C", "score": 70.0, "price": 30.0},
            {"ticker": "D", "score": 60.0, "price": 40.0}
        ]
        weighted = self.builder.compute_position_weights(candidates, method="equal")
        total_w = sum(c["weight"] for c in weighted)
        self.assertAlmostEqual(total_w, 1.0, places=2)
        for c in weighted:
            self.assertAlmostEqual(c["weight"], 0.25, places=2)

    def test_weights_score_proportional(self):
        candidates = [
            {"ticker": "A", "score": 60.0, "price": 10.0},
            {"ticker": "B", "score": 40.0, "price": 20.0}
        ]
        weighted = self.builder.compute_position_weights(candidates, method="score_proportional")
        total_w = sum(c["weight"] for c in weighted)
        self.assertAlmostEqual(total_w, 1.0, places=2)
        self.assertAlmostEqual(weighted[0]["weight"], 0.60, places=2)
        self.assertAlmostEqual(weighted[1]["weight"], 0.40, places=2)

    def test_weights_inverse_volatility(self):
        candidates = [
            {"ticker": "BIMAS", "score": 70.0, "price": 400.0},
            {"ticker": "THYAO", "score": 70.0, "price": 250.0}
        ]
        weighted = self.builder.compute_position_weights(candidates, method="inverse_volatility", repo=self.repo)
        total_w = sum(c["weight"] for c in weighted)
        self.assertAlmostEqual(total_w, 1.0, places=2)

    # -------------------------------------------------------------
    # 6. Full generate_portfolio Pipeline Tests
    # -------------------------------------------------------------
    def test_generate_portfolio_budget_and_lot_integrity(self):
        budget = 100000.0
        res = self.builder.generate_portfolio(top_n=5, universe="bist30", budget_tl=budget, method="score_proportional", repo=self.repo)
        
        summary = res["summary"]
        self.assertEqual(summary["total_budget"], budget)
        self.assertGreater(summary["stock_count"], 0)
        self.assertLessEqual(summary["stock_count"], 5)

        # Integrity checks
        calc_invested = 0.0
        for item in res["portfolio"]:
            price = item["price"]
            lots = item["lots"]
            amount = item["amount_tl"]
            # Lots must be non-negative integer
            self.assertIsInstance(lots, int)
            self.assertGreaterEqual(lots, 0)
            # amount_tl must equal lots * price
            self.assertAlmostEqual(amount, lots * price, places=2)
            calc_invested += amount

        # Invested amount must match summary
        self.assertAlmostEqual(calc_invested, summary["invested_amount"], places=2)
        # Budget conservation: invested + remaining_cash == total_budget
        self.assertAlmostEqual(summary["invested_amount"] + summary["remaining_cash"], budget, places=2)
        # Remaining cash must be positive (cash drag from Math.floor lot rounding)
        self.assertGreaterEqual(summary["remaining_cash"], 0.0)


if __name__ == "__main__":
    unittest.main()
