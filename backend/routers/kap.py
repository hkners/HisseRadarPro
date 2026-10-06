"""
KAP Router
Handles /api/kap — disclosure feed, per-stock disclosures, disclosure text (+ AI summary), event studies
and the low-volume historical backfill.
"""
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/kap", tags=["kap"])


@router.get("/categories")
def get_categories():
    from services.kap import CATEGORIES
    return [{"key": c["key"], "label": c["label"]} for c in CATEGORIES]


@router.get("/feed")
def get_feed(scope: str = "all", categories: Optional[str] = None, days: int = 7, limit: int = 300):
    """scope: 'all' | 'portfolio' | a comma-separated ticker list."""
    import datetime
    from services.kap import disclosures
    tickers: Optional[List[str]] = None
    if scope == "portfolio":
        from globals import report_repo
        tickers = sorted({p["ticker"] for p in report_repo.get_user_portfolio(None)}) or ["__none__"]
    elif scope not in ("all", ""):
        tickers = [t.strip().upper() for t in scope.split(",") if t.strip()]
    cats = [c for c in (categories or "").split(",") if c] or None
    since = (datetime.datetime.now() - datetime.timedelta(days=max(1, min(days, 3650)))).isoformat()
    return {"items": disclosures(tickers, cats, since, max(1, min(limit, 1000)))}


@router.get("/stock/{ticker}")
def get_stock_disclosures(ticker: str, days: int = 365):
    import datetime
    from services.kap import disclosures
    since = (datetime.datetime.now() - datetime.timedelta(days=max(1, min(days, 3650)))).isoformat()
    return {"items": disclosures([ticker.upper().replace(".IS", "")], None, since, 300)}


@router.get("/disclosure/{idx}")
def get_disclosure(idx: int, summarize: bool = False):
    """Disclosure text from KAP (one request); optional short AI summary."""
    from services.kap import detail
    d = detail(idx)
    if not d:
        raise HTTPException(status_code=502, detail="KAP'tan bildirim metni alınamadı.")
    if summarize and d["text"]:
        try:
            from services.ai_service import configure_ai, _generate_content_with_fallback, strip_emoji
            if configure_ai():
                prompt = ("Aşağıdaki KAP bildirimini Türkçe, en fazla 3 kısa cümleyle özetle: ne oldu, rakamlar neler, "
                          "hangi tarihler önemli. Yorum, tahmin veya yatırım tavsiyesi ekleme; metinde olmayan bilgi yazma.\n\n"
                          + d["text"][:8000])
                res = _generate_content_with_fallback(prompt)
                d["summary"] = strip_emoji(getattr(res, "text", "") or "").strip()
        except Exception as e:
            d["summary_error"] = str(e)[:200]
    return d


@router.get("/events")
def get_event_studies():
    from services.kap_events import build
    return build()


@router.get("/backfill")
def get_backfill_status():
    from services.kap import backfill_status
    return backfill_status()


@router.post("/backfill")
def post_backfill(days: int = Query(730, ge=1, le=3650)):
    """Starts the throttled one-day-per-request history download (resumes where it stopped)."""
    from services.kap import start_backfill
    return start_backfill(days)


@router.post("/backfill/stop")
def post_backfill_stop():
    from services.kap import stop_backfill
    return stop_backfill()
