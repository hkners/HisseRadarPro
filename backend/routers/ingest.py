from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from pydantic import BaseModel
import logging

from globals import report_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/ingest", tags=["ingestion"])

class IngestReport(BaseModel):
    id: str | None = None
    ticker: str | None = None
    broker: str | None = None
    rating: str | None = None
    target_price: float | None = 0.0
    current_price: float | None = 0.0
    potansiyel: float | None = 0.0
    report_date: str | None = None
    report_title: str | None = None
    pdf_url: str | None = None
    summary: str | None = None
    catalysts: str | None = None
    full_text: str | None = None
    file_hash: str | None = None
    
    class Config:
        extra = "ignore"

@router.post("")
def ingest_single_report(report: IngestReport):
    """Ingest a single report from the external scraper service."""
    try:
        report_repo.save_reports([report.model_dump(exclude_unset=True)])
        return {"status": "success", "message": "Report ingested"}
    except Exception as e:
        logger.error(f"Error ingesting report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk")
def ingest_bulk_reports(reports: List[IngestReport]):
    """Ingest multiple reports from the external scraper service."""
    try:
        report_repo.save_reports([r.model_dump(exclude_unset=True) for r in reports])
        return {"status": "success", "inserted": len(reports)}
    except Exception as e:
        logger.error(f"Error bulk ingesting reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))
