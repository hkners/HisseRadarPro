"""
Scraped Reports Router
Handles /api/scraped-reports, /api/scraped-reports/stats, /api/scraped-reports/{id},
/api/scraped-reports/{id}/pdf, /api/scraped-reports/trigger-scrape, /api/scraped-reports/stream-scrape
"""
import logging
import os
import subprocess
import sys

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scraped-reports", tags=["scraped-reports"])


def _get_deps():
    from globals import report_repo, base_dir
    from main import load_static_json_cache, get_cached_recommendations
    return report_repo, base_dir, load_static_json_cache


@router.get("")
def get_scraped_reports(
    ticker: Optional[str] = Query(None, description="Filter by stock ticker (e.g. THYAO)"),
    broker: Optional[str] = Query(None, description="Filter by brokerage firm name"),
    rating: Optional[str] = Query(None, description="Filter by recommendation rating (AL, TUT, SAT)"),
    search: Optional[str] = Query(None, description="Free-text search in title, summary, catalysts"),
    min_upside: Optional[float] = Query(None, description="Minimum potential upside percentage"),
    limit: Optional[int] = Query(None, description="Limit max results returned"),
    offset: Optional[int] = Query(None, description="Offset for pagination"),
):
    """Returns scraped research reports with query parameter filtering and pagination."""
    report_repo, _, _ = _get_deps()
    try:
        reports = report_repo.get_reports(
            ticker=ticker,
            broker=broker,
            rating=rating,
            search=search,
            min_upside=min_upside,
            limit=limit,
            offset=offset,
        )
        for r in reports:
            r.pop("full_text", None)
        return reports
    except Exception as e:
        logger.error(f"Error fetching scraped reports: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch scraped reports: {str(e)}")


@router.get("/stats")
def get_scraped_reports_stats():
    """Returns aggregated stats (total reports, broker counts, top recommendations)."""
    report_repo, _, _ = _get_deps()
    return report_repo.get_stats()


@router.get("/stream-scrape")
def stream_scrape():
    report_repo, base_dir, load_static_json_cache = _get_deps()

    def iter_logs():
        yield "data: Starting synchronization...\n\n"
        script_path = os.path.join(base_dir, "run_all_scrapers.py")

        process = subprocess.Popen(
            [sys.executable, "-u", script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in process.stdout:
            yield f"data: {line.strip()}\n\n"

        process.wait()

        # Reload cache
        load_static_json_cache()
        try:
            report_repo.reload()
        except Exception:
            pass

        yield "data: [DONE]\n\n"

    return StreamingResponse(iter_logs(), media_type="text/event-stream")


@router.post("/trigger-scrape")
def trigger_scrape(
    background_tasks: BackgroundTasks,
    run_sync: bool = Query(False, description="Run synchronously if True"),
):
    """Triggers the run_all_scrapers.py pipeline in the background and reloads the cache."""
    report_repo, base_dir, load_static_json_cache = _get_deps()

    def _run_scrape_task():
        try:
            script_path = os.path.join(base_dir, "run_all_scrapers.py")
            subprocess.run([sys.executable, "-u", script_path], check=False, cwd=base_dir)
            load_static_json_cache()
            report_repo.reload()
        except Exception as e:
            logger.error(f"Error in background scrape task: {e}")

    if run_sync:
        _run_scrape_task()
        return {
            "status": "success",
            "message": "Scrape pipeline executed synchronously.",
            "report_count": len(report_repo.get_reports()),
        }
    else:
        background_tasks.add_task(_run_scrape_task)
        return {
            "status": "success",
            "message": "Scrape pipeline task scheduled in background.",
        }


@router.get("/{id}")
def get_scraped_report_by_id(id: str):
    """Returns details of a single scraped report by ID."""
    report_repo, _, _ = _get_deps()
    report = report_repo.get_report_by_id(id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Scraped report with ID '{id}' not found.")
    return report


@router.get("/{id}/pdf")
def get_scraped_report_pdf(id: str):
    """Serves the raw PDF file for a scraped report by ID."""
    report_repo, base_dir, _ = _get_deps()
    report = report_repo.get_report_by_id(id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Scraped report with ID '{id}' not found.")

    pdf_path = report.get("pdf_path")
    
    # Try looking in the new scraper_service downloads folder
    if not pdf_path or not os.path.exists(pdf_path):
        scraper_service_dir = os.path.join(os.path.dirname(base_dir), "scraper_service")
        engine_downloads = os.path.join(scraper_service_dir, "engine", "downloads")
        
        pdf_url = report.get("pdf_url", "")
        if pdf_url:
            filename = pdf_url.split("/")[-1]
            possible_path = os.path.join(engine_downloads, filename)
            if os.path.exists(possible_path):
                pdf_path = possible_path

    # Fallback to old scrapers/downloads directory if not found
    if not pdf_path or not os.path.exists(pdf_path):
        downloads_dir = os.path.join(base_dir, "scrapers", "downloads")
        file_hash = report.get("file_hash", "")
        if os.path.exists(downloads_dir):
            for fname in os.listdir(downloads_dir):
                if fname.endswith(".pdf") and (id in fname or (file_hash and file_hash[-12:] in fname)):
                    pdf_path = os.path.join(downloads_dir, fname)
                    break

    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"PDF file for report '{id}' not found on server.")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path),
    )
