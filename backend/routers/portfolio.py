"""
Portfolio Router
Handles /api/portfolio GET, POST, DELETE operations
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

class PortfolioItem(BaseModel):
    ticker: str
    quantity: float
    cost: float

def _get_deps():
    from globals import report_repo, price_service
    return report_repo, price_service

@router.get("")
def get_portfolio():
    report_repo, price_service = _get_deps()
    items = report_repo.get_user_portfolio()
    
    # Enrich with live prices
    enriched = []
    for item in items:
        ticker = item["ticker"]
        p_data = price_service.get_price(ticker)
        
        live_price = p_data.get("price") if isinstance(p_data, dict) else 0.0
        change_pct = p_data.get("change_pct") if isinstance(p_data, dict) else 0.0
        
        item["live_price"] = live_price
        item["live_change_pct"] = change_pct
        enriched.append(item)
        
    return enriched

@router.post("")
def add_portfolio_item(item: PortfolioItem):
    report_repo, _ = _get_deps()
    try:
        report_repo.add_to_portfolio(item.ticker, item.quantity, item.cost)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{ticker}")
def remove_portfolio_item(ticker: str):
    report_repo, _ = _get_deps()
    try:
        report_repo.remove_from_portfolio(ticker)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
