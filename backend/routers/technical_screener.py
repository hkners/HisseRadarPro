from fastapi import APIRouter
import threading

router = APIRouter(prefix="/api", tags=["technical-screener"])

_cache = None
_cache_time = 0
_lock = threading.Lock()
_is_calculating = False

def update_technical_cache():
    global _cache, _cache_time, _is_calculating
    import time
    from services.technical_scanner import calculate_technical_signals
    from globals import base_dir, report_repo
    
    with _lock:
        _is_calculating = True
        
    try:
        results = calculate_technical_signals(base_dir)
        company_info = report_repo.get_all_company_info()
        
        enriched = []
        for r in results:
            ticker = r["ticker"]
            info = company_info.get(ticker, {})
            r["company"] = info.get("name", ticker)
            enriched.append(r)
            
        with _lock:
            _cache = enriched
            _cache_time = time.time()
    except Exception as e:
        print("Error in technical scanner background thread:", e)
    finally:
        with _lock:
            _is_calculating = False

@router.get("/technical-screener")
def get_technical_screener():
    global _cache, _cache_time, _is_calculating
    import time
    
    with _lock:
        if _cache is not None and time.time() - _cache_time < 3600:
            return {"status": "ready", "data": _cache}
            
        if not _is_calculating:
            threading.Thread(target=update_technical_cache, daemon=True).start()
            
        if _cache is not None:
            return {"status": "ready", "data": _cache}
        else:
            return {"status": "calculating", "data": []}
