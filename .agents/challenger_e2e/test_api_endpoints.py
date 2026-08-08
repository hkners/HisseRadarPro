import json
import urllib.request
import urllib.parse
import sys

BASE_URL = "http://127.0.0.1:8015"

def test_endpoint(path, expected_status=200):
    url = f"{BASE_URL}{path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            content = response.read().decode('utf-8')
            data = json.loads(content)
            print(f"[PASS] {path} -> Status {status}, type: {type(data).__name__}")
            return True, status, data
    except urllib.error.HTTPError as e:
        content = e.read().decode('utf-8')
        try:
            data = json.loads(content)
        except:
            data = content
        print(f"[{'PASS' if e.code == expected_status else 'FAIL'}] {path} -> HTTPError {e.code} (Expected {expected_status}): {data}")
        return e.code == expected_status, e.code, data
    except Exception as e:
        print(f"[FAIL] {path} -> Exception: {e}")
        return False, None, str(e)

def run_all_tests():
    results = {}
    
    print("--- 1. Mandatory Endpoints ---")
    endpoints = [
        "/api/health",
        "/api/scraped-reports",
        "/api/scraped-reports/stats",
        "/api/stocks",
        "/api/screener",
        "/api/recommendations",
        "/api/kurum-stats"
    ]
    
    for ep in endpoints:
        success, status, data = test_endpoint(ep)
        results[ep] = {"success": success, "status": status, "sample_size": len(data) if isinstance(data, list) else (len(data.keys()) if isinstance(data, dict) else 1)}
        
    print("\n--- 2. Pagination & Search Filtering in /api/scraped-reports ---")
    # Test limit
    _, _, data_limit_5 = test_endpoint("/api/scraped-reports?limit=5")
    limit_5_ok = isinstance(data_limit_5, list) and len(data_limit_5) <= 5
    print(f"Limit=5 check: returned {len(data_limit_5) if isinstance(data_limit_5, list) else 0} items -> {limit_5_ok}")
    
    # Test offset
    _, _, data_offset_2 = test_endpoint("/api/scraped-reports?limit=5&offset=2")
    offset_ok = False
    if isinstance(data_limit_5, list) and isinstance(data_offset_2, list) and len(data_limit_5) >= 3 and len(data_offset_2) >= 1:
        if data_limit_5[2]["id"] == data_offset_2[0]["id"]:
            offset_ok = True
    print(f"Offset=2 check: item at index 2 matches index 0 of offset 2 -> {offset_ok}")
    
    # Test search filter
    _, _, data_search = test_endpoint("/api/scraped-reports?search=THYAO")
    print(f"Search='THYAO' count: {len(data_search) if isinstance(data_search, list) else 0}")
    
    # Test broker filter
    _, _, data_broker = test_endpoint("/api/scraped-reports?broker=Deniz%20Yat%C4%B1r%C4%B1m")
    print(f"Broker='Deniz Yatırım' count: {len(data_broker) if isinstance(data_broker, list) else 0}")

    # Test rating filter
    _, _, data_rating = test_endpoint("/api/scraped-reports?rating=AL")
    print(f"Rating='AL' count: {len(data_rating) if isinstance(data_rating, list) else 0}")
    
    # Test ticker filter
    _, _, data_ticker = test_endpoint("/api/scraped-reports?ticker=THYAO")
    print(f"Ticker='THYAO' count: {len(data_ticker) if isinstance(data_ticker, list) else 0}")

    print("\n--- 3. Edge Cases & Invalid Parameters ---")
    # Negative limit/offset
    test_endpoint("/api/scraped-reports?limit=-5")
    test_endpoint("/api/scraped-reports?offset=-2")
    
    # Non-existent report ID
    test_endpoint("/api/scraped-reports/non_existent_id", expected_status=404)
    
    # Non-existent stock fundamentals
    test_endpoint("/api/stocks/UNKNOWN_TICKER/fundamentals", expected_status=404)
    
    return results

if __name__ == "__main__":
    run_all_tests()
