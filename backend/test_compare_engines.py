"""
Unit tests for scripts/compare_engines.py
Verifies:
1. Spearman rank correlation calculation (perfect positive, negative, tied ranks)
2. Data sufficiency gate logic (checks date span and minimum weeks)
3. Scenario classification logic (Scenario A, Scenario B, Scenario C)
"""

import unittest
import os
import sys

# Ensure backend and scripts in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(backend_dir)
scripts_dir = os.path.join(project_root, "scripts")
if scripts_dir not in sys.path:
    sys.path.insert(0, scripts_dir)

from compare_engines import (
    compute_spearman_rank_correlation,
    check_data_sufficiency,
    classify_scenario
)


class TestCompareEngines(unittest.TestCase):
    def test_spearman_rank_perfect_positive(self):
        x = [10.0, 20.0, 30.0, 40.0, 50.0]
        y = [1.0, 2.0, 3.0, 4.0, 5.0]
        rho, pval = compute_spearman_rank_correlation(x, y)
        self.assertAlmostEqual(rho, 1.0, places=3)
        self.assertLess(pval, 0.05)

    def test_spearman_rank_perfect_negative(self):
        x = [10.0, 20.0, 30.0, 40.0, 50.0]
        y = [5.0, 4.0, 3.0, 2.0, 1.0]
        rho, pval = compute_spearman_rank_correlation(x, y)
        self.assertAlmostEqual(rho, -1.0, places=3)
        self.assertLess(pval, 0.05)

    def test_classify_scenario_a(self):
        # Scenario A: High mutual correlation (rho >= 0.70) and similar ICs
        horizons = {
            30: {"status": "OK", "conviction_ic": 0.50, "alpha_ic": 0.49},
            90: {"status": "OK", "conviction_ic": 0.60, "alpha_ic": 0.58},
            180: {"status": "OK", "conviction_ic": 0.55, "alpha_ic": 0.53}
        }
        scenario_key, rec = classify_scenario(mutual_rho=0.82, horizons=horizons)
        self.assertEqual(scenario_key, "SCENARIO_A")
        self.assertIn("İkiz Motorlar", rec["title"])

    def test_classify_scenario_b(self):
        # Scenario B: Alpha dominates short-term (30d), Conviction dominates long-term (180d)
        horizons = {
            30: {"status": "OK", "conviction_ic": 0.30, "alpha_ic": 0.45},   # Alpha +0.15 higher
            90: {"status": "OK", "conviction_ic": 0.55, "alpha_ic": 0.50},
            180: {"status": "OK", "conviction_ic": 0.65, "alpha_ic": 0.45}   # Conviction +0.20 higher
        }
        scenario_key, rec = classify_scenario(mutual_rho=0.55, horizons=horizons)
        self.assertEqual(scenario_key, "SCENARIO_B")
        self.assertIn("Farklı Zaman Ufuklarında", rec["title"])

    def test_classify_scenario_c(self):
        # Scenario C: Conviction dominates Alpha across all horizons by >= 0.06
        horizons = {
            30: {"status": "OK", "conviction_ic": 0.60, "alpha_ic": 0.40},   # +0.20
            90: {"status": "OK", "conviction_ic": 0.70, "alpha_ic": 0.50},   # +0.20
            180: {"status": "OK", "conviction_ic": 0.65, "alpha_ic": 0.45}   # +0.20
        }
        scenario_key, rec = classify_scenario(mutual_rho=0.60, horizons=horizons)
        self.assertEqual(scenario_key, "SCENARIO_C")
        self.assertIn("Asimetrik Öngörü Gücü", rec["title"])

    def test_data_sufficiency_check(self):
        db_path = os.path.join(backend_dir, "scraped_reports.db")
        is_sufficient, info = check_data_sufficiency(db_path, min_weeks=4)
        self.assertIn("weeks_span", info)
        self.assertIn("total_records", info)
        # Should be sufficient given existing 31+ weeks in db
        self.assertTrue(is_sufficient)
        self.assertGreaterEqual(info["weeks_span"], 4.0)


if __name__ == "__main__":
    unittest.main()
