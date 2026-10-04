"""
Macro Router
Handles /api/macro (indicator snapshot) and /api/macro/brief (written daily brief).
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["macro"])


@router.get("/macro")
def get_macro_snapshot():
    from services.macro_service import build_snapshot
    return build_snapshot()


@router.get("/macro/brief")
def get_macro_brief(refresh: bool = False):
    from services.macro_service import build_snapshot, get_brief
    return get_brief(build_snapshot(), force=refresh)
