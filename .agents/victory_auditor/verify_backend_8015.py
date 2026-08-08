import sys
import os
import time
import subprocess
import urllib.request
import json

SERVER_URL = "http://127.0.0.1:8015"
ENDPOINTS = [
    "/api/health",
    "/api/scraped-reports",
    "/api/scraped-reports/stats",
    "/api/scraped-reports?limit=5",
    "/api/scraped-reports?limit=5&offset=2",
    "/api/scraped-reports?search=THYAO",
    "/api/scraped-reports?broker=Garanti%20BBVA",
    "/api/scraped-reports?rating=AL",
    "/api/scraped-reports?ticker=THYAO",
    "/api/stocks",
    "/api/screener",
    "/api/recommendations",
    "/api/models",
    "/api/kurum-stats"
]

def is_server_running():
    try:
        req = urllib.request.Request(f"{SERVER_URL}/api/health", headers={"User-Agent": "VictoryAuditor"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False

def main():
    print("=== BACKEND VERIFICATION ON PORT 8015 ===")
    proc = None
    if not is_server_running():
        print("Server not running on port 8015. Starting background uvicorn server...")
        base_dir = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro"
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8015"],
            cwd=base_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        time.sleep(3)
        if not is_server_running():
            print("Failed to start backend server on port 8015!")
            if proc:
                proc.kill()
            sys.exit(1)
        print("Backend server started successfully on port 8015.")
    else:
        print("Backend server is already running on port 8015.")

    success_count = 0
    fail_count = 0

    print("\nProbing endpoints:")
    print(f"{'Endpoint':<45} | {'Status':<8} | {'Details'}")
    print("-" * 80)

    for ep in ENDPOINTS:
        url = f"{SERVER_URL}{ep}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VictoryAuditor"})
            start_t = time.time()
            with urllib.request.urlopen(req, timeout=10) as resp:
                elapsed_ms = (time.time() - start_t) * 1000.0
                data = resp.read()
                status = resp.status
                content_type = resp.headers.get("Content-Type", "")
                
                parsed = json.loads(data.decode("utf-8")) if "application/json" in content_type else data
                detail_str = ""
                if isinstance(parsed, list):
                    detail_str = f"Array[{len(parsed)}] ({elapsed_ms:.1f}ms)"
                elif isinstance(parsed, dict):
                    detail_str = f"Dict with keys {list(parsed.keys())[:3]}... ({elapsed_ms:.1f}ms)"
                else:
                    detail_str = f"{len(data)} bytes ({elapsed_ms:.1f}ms)"

                print(f"{ep:<45} | {status:<8} | {detail_str}")
                if status == 200:
                    success_count += 1
                else:
                    fail_count += 1
        except Exception as e:
            print(f"{ep:<45} | ERROR    | {e}")
            fail_count += 1

    print("\nBackend Verification Summary:")
    print(f"  Total probed: {len(ENDPOINTS)}")
    print(f"  200 OK:       {success_count}")
    print(f"  Failed:       {fail_count}")

    if proc:
        proc.terminate()

    if fail_count == 0:
        print("\nSTATUS: [PASS] Backend port 8015 verification completed with 0 errors / 0 crashes.")
        sys.exit(0)
    else:
        print("\nSTATUS: [FAIL] Backend port 8015 verification encountered failures.")
        sys.exit(1)

if __name__ == "__main__":
    main()
