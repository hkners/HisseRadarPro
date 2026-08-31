import requests
from typing import Dict, Any, List

class BackendClient:
    """
    Client for the standalone Scraper Service to push extracted reports
    to the Core Backend API.
    """
    def __init__(self, base_url: str = "http://127.0.0.1:8015"):
        self.base_url = base_url.rstrip("/")
        
    def push_report(self, report: Dict[str, Any]) -> bool:
        """Push a single scraped report to the backend ingestion API."""
        try:
            resp = requests.post(f"{self.base_url}/api/internal/ingest", json=report, timeout=10)
            if resp.status_code in (200, 201):
                print(f"Successfully ingested report {report.get('id')}")
                return True
            else:
                print(f"Failed to ingest report. Status: {resp.status_code}, Body: {resp.text}")
                return False
        except Exception as e:
            print(f"Error communicating with Backend API: {e}")
            return False
            
    def push_reports_bulk(self, reports: List[Dict[str, Any]]) -> int:
        """Push a list of reports. Returns the number of successfully pushed reports."""
        success_count = 0
        try:
            resp = requests.post(f"{self.base_url}/api/internal/ingest/bulk", json=reports, timeout=30)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                success_count = res_data.get("inserted", len(reports))
                print(f"Successfully bulk ingested {success_count} reports.")
            else:
                print(f"Failed bulk ingest. Status: {resp.status_code}, Body: {resp.text}")
        except Exception as e:
            print(f"Error bulk posting to Backend API: {e}")
        return success_count
