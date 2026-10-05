from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/viop", tags=["viop"])


@router.get("/fair-value")
def get_viop_fair_value(rate: float = Query(0.40, ge=0.0, le=2.0, description="Annual interest rate, e.g. 0.40")):
    """Theoretical single-stock futures prices for the BIST 30 (cost of carry; no exchange data)."""
    from services.viop_service import fair_values
    return fair_values(rate)
