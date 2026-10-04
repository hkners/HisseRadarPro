"""
Baskets Router
Handles /api/baskets — house themes and user baskets with indicative one-year performance.
"""
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/baskets", tags=["baskets"])


class BasketIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: str = Field("", max_length=400)
    tickers: List[str] = Field(..., min_length=1, max_length=40)
    weights: Optional[List[float]] = None
    source: str = "manual"


@router.get("")
def list_baskets(refresh: bool = False):
    from services.baskets import get_baskets
    return get_baskets(force=refresh)


@router.post("")
def add_basket(b: BasketIn):
    from globals import BIST_TICKERS
    from services.baskets import create_basket
    tickers = []
    for t in b.tickers:
        t = t.strip().upper().replace(".IS", "")
        if t and t not in tickers:
            tickers.append(t)
    unknown = [t for t in tickers if t not in BIST_TICKERS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"BIST listesinde olmayan semboller: {', '.join(unknown)}")
    weights = b.weights if b.weights and len(b.weights) == len(b.tickers) and all(w >= 0 for w in b.weights) else None
    return create_basket(b.name.strip(), tickers, b.description.strip(), weights, b.source if b.source in ("manual", "studio") else "manual")


@router.delete("/{basket_id}")
def remove_basket(basket_id: str):
    from services.baskets import delete_basket
    if basket_id.startswith("h-"):
        raise HTTPException(status_code=400, detail="Hazır sepetler silinemez.")
    if not delete_basket(basket_id):
        raise HTTPException(status_code=404, detail="Sepet bulunamadı.")
    return {"status": "success"}
