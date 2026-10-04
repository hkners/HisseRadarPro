"""
Strategy Backtest Router
Handles /api/backtest/factors, /api/backtest/run and /api/backtest/parse (plain Turkish → strategy spec).
"""
import json
import logging
import threading
import time
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backtest", tags=["Backtest"])


class FilterSpec(BaseModel):
    factor: str
    op: Literal[">", ">=", "<", "<="] = ">"
    value: float


class StrategySpec(BaseModel):
    name: Optional[str] = None
    kind: Literal["rank", "timing"] = "rank"
    universe: Literal["all", "bist30", "bist100"] = "all"
    rank_factor: str = "mom_12_1"
    rank_order: Optional[Literal["asc", "desc"]] = None
    top_n: int = Field(20, ge=1, le=100)
    filters: List[FilterSpec] = []
    weighting: Literal["equal", "inverse_vol"] = "equal"
    timing_asset: str = "XU100"
    sma_window: int = Field(200, ge=10, le=400)
    rebalance: Literal["daily", "weekly", "monthly", "quarterly"] = "monthly"
    start: Optional[str] = "2012-01-01"
    end: Optional[str] = None
    cost_bps: float = Field(20, ge=0, le=200)
    min_turnover_tl: float = Field(5_000_000, ge=0)
    cash_rate: float = Field(0.0, ge=0, le=1.5)


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=3, max_length=600)


def _warm():
    time.sleep(20)  # let the app finish starting before the ~20s price matrix build
    try:
        from services.backtest_engine import _load_frames
        from services.house_strategies import get_house_strategies
        _load_frames()
        get_house_strategies()
    except Exception as e:
        logger.warning(f"Backtest warm-up failed: {e}")


threading.Thread(target=_warm, daemon=True).start()


@router.get("/house")
def get_house(refresh: bool = False):
    """Track records and current holdings of the built-in strategies (Strateji Merkezi)."""
    from services.house_strategies import get_house_strategies
    return get_house_strategies(force=refresh)


@router.get("/factors")
def get_factors():
    from services.backtest_engine import factor_catalog
    return factor_catalog()


@router.post("/run")
def run(spec: StrategySpec):
    from services.backtest_engine import run_backtest
    if spec.kind == "rank":
        from services.backtest_engine import FACTORS
        unknown = [f for f in [spec.rank_factor, *[x.factor for x in spec.filters]] if f not in FACTORS]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Bilinmeyen ölçüt: {', '.join(unknown)}")
    try:
        return run_backtest(spec.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/parse")
def parse(req: ParseRequest):
    """Turns a plain-language strategy into a StrategySpec with Gemini, plus what it assumed and could not map."""
    from services.backtest_engine import factor_catalog
    from services.ai_service import configure_ai, _generate_content_with_fallback, strip_emoji, genai

    if not configure_ai():
        raise HTTPException(status_code=503, detail="Yapay zekâ servisi yapılandırılmamış; kuralları elle seçebilirsin.")

    factors = "\n".join(f"- {f['id']}: {f['label']} ({f['unit'] or 'birimsiz'}), varsayılan sıra {f['order']}" for f in factor_catalog())
    prompt = f"""Kullanıcının Türkçe yazdığı bir yatırım stratejisini, Borsa İstanbul backtest motorunun anladığı JSON'a çevir.

Motorun desteklediği iki tür var:
1) "rank": her dengelemede filtreleri geçen hisseleri bir ölçüte göre sıralayıp ilk N tanesini tutar.
2) "timing": bir varlığı (varsayılan XU100) N günlük ortalamasının üzerindeyken tutar, altındayken nakitte bekler.

Kullanılabilir ölçütler (filtre ve sıralama için; yüzdeler yüzde cinsinden yazılır, ör. 10 = %10):
{factors}

JSON şeması:
{{"spec": {{"name": str, "kind": "rank"|"timing", "universe": "all"|"bist30"|"bist100", "rank_factor": ölçüt id,
  "rank_order": "asc"|"desc", "top_n": 1-100, "filters": [{{"factor": ölçüt id, "op": ">"|">="|"<"|"<=", "value": sayı}}],
  "weighting": "equal"|"inverse_vol", "timing_asset": "XU100" veya hisse kodu, "sma_window": 10-400,
  "rebalance": "daily"|"weekly"|"monthly"|"quarterly", "start": "YYYY-MM-DD"}},
 "assumptions": [kullanıcı belirtmediği için senin seçtiğin her şey, Türkçe kısa cümleler],
 "unsupported": [motorun yapamadığı istekler, Türkçe; ör. F/K, temettü, bilanço gibi temel veriler geçmişte tutulmuyor]}}

Kurallar: Yalnızca listedeki ölçütleri kullan. Belirtilmeyenlerde makul varsayılanlar seç (rank için top_n 20, aylık dengeleme,
start 2012-01-01; timing için XU100, 200 gün, günlük kontrol, start 2022-01-01) ve bunları assumptions'a yaz.
Temel veriye dayalı bir istek varsa en yakın fiyat tabanlı karşılığı kullanma; unsupported'a yaz ve geri kalanı kur.

Kullanıcının stratejisi: \"\"\"{req.text}\"\"\""""
    try:
        res = _generate_content_with_fallback(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.1, max_output_tokens=900, response_mime_type="application/json"),
        )
        raw = json.loads(strip_emoji(res.text))
    except Exception as e:
        logger.warning(f"Strategy parse failed: {e}")
        raise HTTPException(status_code=502, detail="Strateji yorumlanamadı. Daha kısa yazmayı ya da kuralları elle seçmeyi dene.")

    try:
        spec = StrategySpec(**(raw.get("spec") or {}))
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Yapay zekânın önerdiği kurallar geçersiz: {e.errors()[0].get('msg')}")
    from services.backtest_engine import FACTORS
    spec.filters = [f for f in spec.filters if f.factor in FACTORS]
    if spec.rank_factor not in FACTORS:
        spec.rank_factor = "mom_12_1"
    return {
        "spec": spec.model_dump(),
        "assumptions": [str(a) for a in raw.get("assumptions") or []][:8],
        "unsupported": [str(u) for u in raw.get("unsupported") or []][:5],
    }
