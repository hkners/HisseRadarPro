import os
import sys
import unittest
from fastapi.testclient import TestClient

# Ensure backend and backend/scrapers directories are on sys.path
scrapers_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.dirname(scrapers_dir)

if scrapers_dir in sys.path:
    sys.path.remove(scrapers_dir)
sys.path.insert(0, scrapers_dir)

if backend_dir in sys.path:
    sys.path.remove(backend_dir)
sys.path.insert(0, backend_dir)

from main import app
from db_manager import ReportDBManager, ReportRepository


class TestBackendAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_1_get_scraped_reports_all(self):
        """Test GET /api/scraped-reports returns 200 and a list of reports."""
        response = self.client.get("/api/scraped-reports")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        first = data[0]
        self.assertIn("ticker", first)
        self.assertIn("broker", first)
        self.assertIn("target_price", first)
        self.assertIn("current_price", first)

    def test_2_get_scraped_reports_ticker_filter(self):
        """Test GET /api/scraped-reports with ticker filter."""
        response = self.client.get("/api/scraped-reports?ticker=THYAO")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for item in data:
            self.assertEqual(item["ticker"].upper(), "THYAO")

    def test_3_get_scraped_reports_broker_filter(self):
        """Test GET /api/scraped-reports with broker filter."""
        response = self.client.get("/api/scraped-reports?broker=Garanti")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for item in data:
            self.assertIn("Garanti", item["broker"])

    def test_4_get_scraped_reports_rating_filter(self):
        """Test GET /api/scraped-reports with rating filter."""
        response = self.client.get("/api/scraped-reports?rating=AL")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for item in data:
            self.assertEqual(item["rating"].upper(), "AL")

    def test_5_get_scraped_reports_search_filter(self):
        """Test GET /api/scraped-reports with free-text search filter."""
        response = self.client.get("/api/scraped-reports?search=kargo")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for item in data:
            searchable = (
                f"{item.get('report_title', '')} {item.get('summary', '')} "
                f"{item.get('catalysts', '')} {item.get('full_text', '')}"
            ).lower()
            self.assertIn("kargo", searchable)

    def test_6_get_scraped_reports_min_upside_filter(self):
        """Test GET /api/scraped-reports with min_upside filter."""
        response = self.client.get("/api/scraped-reports?min_upside=40.0")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data), 0)
        for item in data:
            pot = float(item.get("potansiyel", 0.0) or 0.0)
            self.assertGreaterEqual(pot, 40.0)

    def test_7_get_scraped_reports_limit(self):
        """Test GET /api/scraped-reports with limit parameter."""
        response = self.client.get("/api/scraped-reports?limit=2")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertLessEqual(len(data), 2)

    def test_8_get_scraped_reports_stats(self):
        """Test GET /api/scraped-reports/stats returns expected keys and types."""
        response = self.client.get("/api/scraped-reports/stats")
        self.assertEqual(response.status_code, 200)
        stats = response.json()
        self.assertIn("total_reports", stats)
        self.assertIn("broker_counts", stats)
        self.assertIn("rating_counts", stats)
        self.assertIn("avg_potential", stats)
        self.assertIn("top_recommendations", stats)
        self.assertGreater(stats["total_reports"], 0)
        self.assertIsInstance(stats["broker_counts"], dict)
        self.assertIsInstance(stats["top_recommendations"], list)

    def test_9_trigger_scrape_endpoint(self):
        """Test POST /api/scraped-reports/trigger-scrape."""
        response = self.client.post("/api/scraped-reports/trigger-scrape?limit_per_broker=1&run_sync=true")
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res.get("status"), "success")
        self.assertIn("message", res)

    def test_10_existing_routes_regression(self):
        """Verify all existing endpoints continue returning HTTP 200."""
        routes = [
            "/api/stocks",
            "/api/recommendations",
            "/api/kurum-stats",
            "/api/models",
            "/api/screener",
        ]
        for route in routes:
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Route {route} failed with status {res.status_code}")

    def test_11_repository_db_manager_unit(self):
        """Direct unit tests for ReportDBManager and ReportRepository."""
        repo = ReportRepository()
        all_reps = repo.get_reports()
        self.assertGreater(len(all_reps), 0)

        # Test filtering via repo directly with a non-empty ticker present in all_reps
        valid_reps = [r for r in all_reps if r.get("ticker")]
        self.assertGreater(len(valid_reps), 0)
        target_ticker = valid_reps[0]["ticker"]

        filtered_reps = repo.get_reports(ticker=target_ticker)
        self.assertGreater(len(filtered_reps), 0)
        for r in filtered_reps:
            self.assertEqual(r["ticker"].upper(), target_ticker.upper())

        stats = repo.get_stats()
        self.assertGreater(stats["total_reports"], 0)
        self.assertTrue(stats["broker_counts"])

    def test_12_health_endpoint(self):
        """Test GET /api/health returns HTTP 200 OK and expected keys."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertIn("service", data)
        self.assertIn("scraped_reports_count", data)

    def test_13_report_detail_and_pdf_endpoints(self):
        """Test GET /api/scraped-reports/{id} and GET /api/scraped-reports/{id}/pdf."""
        # Get first report ID
        all_res = self.client.get("/api/scraped-reports?limit=1")
        self.assertEqual(all_res.status_code, 200)
        data = all_res.json()
        self.assertGreater(len(data), 0)
        rep_id = data[0]["id"]

        # Test detail endpoint
        detail_res = self.client.get(f"/api/scraped-reports/{rep_id}")
        self.assertEqual(detail_res.status_code, 200)
        rep_detail = detail_res.json()
        self.assertEqual(rep_detail["id"], rep_id)
        self.assertIn("summary", rep_detail)

        # Test 404 for invalid ID
        invalid_res = self.client.get("/api/scraped-reports/invalid_id_999")
        self.assertEqual(invalid_res.status_code, 404)

        # Test PDF endpoint for 404 or valid response
        pdf_res = self.client.get(f"/api/scraped-reports/{rep_id}/pdf")
        self.assertIn(pdf_res.status_code, [200, 404])

    def test_14_pagination_limit_offset(self):
        """Test SQL pagination with limit and offset."""
        res_page1 = self.client.get("/api/scraped-reports?limit=5&offset=0")
        self.assertEqual(res_page1.status_code, 200)
        page1 = res_page1.json()

        res_page2 = self.client.get("/api/scraped-reports?limit=5&offset=5")
        self.assertEqual(res_page2.status_code, 200)
        page2 = res_page2.json()

        if len(page1) == 5 and len(page2) > 0:
            self.assertNotEqual(page1[0]["id"], page2[0]["id"])


if __name__ == "__main__":
    unittest.main()

