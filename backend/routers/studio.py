"""
Studio Router
Handles /api/studio/run — plain-Turkish investment thesis -> drivers, exposed stocks and a weighted basket.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/studio", tags=["studio"])


class ThesisRequest(BaseModel):
    thesis: str = Field(..., min_length=8, max_length=800)


@router.post("/run")
def run_studio(req: ThesisRequest):
    from services.ai_service import configure_ai
    from services.studio_service import run_thesis
    if not configure_ai():
        raise HTTPException(status_code=503, detail="Yapay zekâ servisi yapılandırılmamış.")
    try:
        return run_thesis(req.thesis.strip())
    except Exception as e:
        logger.warning(f"Studio run failed: {e}")
        raise HTTPException(status_code=502, detail="Tez işlenemedi. Biraz daha somut yazıp tekrar dener misin?")
