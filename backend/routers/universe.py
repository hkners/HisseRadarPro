"""
Universe Router
Handles /api/screener/universe — the flat per-ticker dataset behind the unified screener.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["screener"])


@router.get("/screener/universe")
def get_screener_universe(refresh: bool = False):
    from services.screener_universe import get_universe
    return get_universe(force=refresh)
