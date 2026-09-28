from fastapi import APIRouter
from services.technical_scanner import technical_scanner_service

router = APIRouter(prefix="/api", tags=["technical-screener"])

@router.get("/technical-screener")
def get_technical_screener():
    # technical_scanner_service will wait if cache is empty on first boot
    data = technical_scanner_service.get_technical_screener_data()
    return {"status": "ready", "data": data}
