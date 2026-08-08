import json
import os
import re
import sys

def test_scraped_reports_schema(file_path: str):
    print(f"--- Running Empirical Contract & Schema Validation on {file_path} ---")
    
    if not os.path.exists(file_path):
        print(f"FAIL: File does not exist at {file_path}")
        return False, ["File not found"]
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            reports = json.load(f)
    except Exception as e:
        print(f"FAIL: Unable to parse JSON: {e}")
        return False, [f"JSON parse error: {e}"]
        
    if not isinstance(reports, list):
        print("FAIL: Root JSON is not a list")
        return False, ["Root is not a list"]
        
    if len(reports) == 0:
        print("FAIL: JSON report array is empty")
        return False, ["Report list is empty"]
        
    print(f"Loaded {len(reports)} scraped reports.")

    REQUIRED_FIELDS = [
        "id", "ticker", "broker", "rating", "target_price", "current_price",
        "potansiyel", "report_date", "summary", "full_text", "cached",
        "prompt_id", "file_hash"
    ]
    
    failures = []
    seen_ids = set()
    seen_hashes = set()
    
    for idx, report in enumerate(reports):
        prefix = f"Report[{idx}] (id={report.get('id', 'N/A')}, ticker={report.get('ticker', 'N/A')})"
        
        # 1. Missing / Null Fields Check
        for field in REQUIRED_FIELDS:
            if field not in report:
                failures.append(f"{prefix}: Missing required field '{field}'")
            elif report[field] is None:
                failures.append(f"{prefix}: Field '{field}' is None/null")
                
        if failures:
            continue
            
        # 2. Type Checks
        # id
        if not isinstance(report["id"], str) or not report["id"].strip():
            failures.append(f"{prefix}: 'id' must be non-empty str, got {type(report['id'])} ({report['id']})")
        else:
            if report["id"] in seen_ids:
                failures.append(f"{prefix}: Duplicate 'id' detected: {report['id']}")
            seen_ids.add(report["id"])
            
        # ticker
        if not isinstance(report["ticker"], str) or not report["ticker"].strip():
            failures.append(f"{prefix}: 'ticker' must be non-empty str, got {type(report['ticker'])}")
        elif not re.match(r"^[A-Z0-9]+$", report["ticker"]):
            failures.append(f"{prefix}: 'ticker' contains invalid characters: '{report['ticker']}'")
            
        # broker
        if not isinstance(report["broker"], str) or not report["broker"].strip():
            failures.append(f"{prefix}: 'broker' must be non-empty str, got {type(report['broker'])}")
            
        # rating
        if not isinstance(report["rating"], str) or not report["rating"].strip():
            failures.append(f"{prefix}: 'rating' must be non-empty str, got {type(report['rating'])}")
            
        # target_price
        tp = report["target_price"]
        if not isinstance(tp, (int, float)) or isinstance(tp, bool):
            failures.append(f"{prefix}: 'target_price' must be float/int, got {type(tp)}")
        elif tp < 0:
            failures.append(f"{prefix}: 'target_price' cannot be negative ({tp})")
            
        # current_price
        cp = report["current_price"]
        if not isinstance(cp, (int, float)) or isinstance(cp, bool):
            failures.append(f"{prefix}: 'current_price' must be float/int, got {type(cp)}")
        elif cp < 0:
            failures.append(f"{prefix}: 'current_price' cannot be negative ({cp})")
            
        # potansiyel
        pot = report["potansiyel"]
        if not isinstance(pot, (int, float)) or isinstance(pot, bool):
            failures.append(f"{prefix}: 'potansiyel' must be float/int, got {type(pot)}")
            
        # Check calculation consistency if prices > 0
        if isinstance(tp, (int, float)) and isinstance(cp, (int, float)) and isinstance(pot, (int, float)):
            if tp > 0 and cp > 0:
                expected_pot = round(((tp - cp) / cp) * 100, 2)
                if abs(pot - expected_pot) > 0.05:
                    failures.append(f"{prefix}: 'potansiyel' ({pot}) does not match calculated value ({expected_pot}) for TP={tp}, CP={cp}")
                    
        # report_date
        rd = report["report_date"]
        if not isinstance(rd, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", rd):
            failures.append(f"{prefix}: 'report_date' must be YYYY-MM-DD str, got '{rd}'")
            
        # summary
        if not isinstance(report["summary"], str) or not report["summary"].strip():
            failures.append(f"{prefix}: 'summary' must be non-empty str")
            
        # full_text
        if not isinstance(report["full_text"], str) or not report["full_text"].strip():
            failures.append(f"{prefix}: 'full_text' must be non-empty str")
            
        # cached
        if not isinstance(report["cached"], bool):
            failures.append(f"{prefix}: 'cached' must be boolean, got {type(report['cached'])}")
            
        # prompt_id
        if not isinstance(report["prompt_id"], str) or report["prompt_id"] != "v1_research_extractor":
            failures.append(f"{prefix}: 'prompt_id' must be 'v1_research_extractor', got '{report['prompt_id']}'")
            
        # file_hash
        fh = report["file_hash"]
        if not isinstance(fh, str) or not fh.startswith("sha256:") or len(fh) != 71:
            failures.append(f"{prefix}: 'file_hash' must be 'sha256:<64 hex characters>', got '{fh}'")
        else:
            if fh in seen_hashes:
                failures.append(f"{prefix}: Duplicate 'file_hash' detected: {fh}")
            seen_hashes.add(fh)

    if failures:
        print(f"\nVALIDATION FAILED with {len(failures)} error(s):")
        for f in failures:
            print(f"  - {f}")
        return False, failures
    else:
        print("\nALL CONTRACT & SCHEMA CHECKS PASSED SUCCESSFULLY!")
        return True, []

if __name__ == "__main__":
    target = os.path.join("backend", "scrapers", "scraped_reports.json")
    if len(sys.argv) > 1:
        target = sys.argv[1]
    success, errs = test_scraped_reports_schema(target)
    sys.exit(0 if success else 1)
