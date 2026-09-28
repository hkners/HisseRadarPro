from fastapi import APIRouter
from services.viop_service import viop_service

router = APIRouter(prefix="/api/viop", tags=["viop"])

@router.get("/screener")
def get_viop_screener():
    return viop_service.get_viop_screener_data()
