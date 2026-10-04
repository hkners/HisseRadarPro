from fastapi import APIRouter
from services.alpha_engine import alpha_engine

router = APIRouter(prefix="/api/alpha", tags=["alpha"])

@router.get("/screener")
def get_alpha_screener():
    screener = alpha_engine.get_alpha_screener()
    try:
        from services.conviction_engine import conviction_engine
        all_conv = conviction_engine.get_all_scored_stocks()
        c_map = {s["ticker"]: s for s in all_conv}
        enriched = []
        for a in screener:
            item = dict(a)
            t = item.get("ticker")
            c_item = c_map.get(t)
            if c_item:
                c_score = c_item.get("score")
                c_decision = c_item.get("decision")
                item["conviction_score"] = c_score
                item["conviction_decision"] = c_decision
                item["conviction_color"] = c_item.get("color")

                c_dec = (c_decision or "").upper()
                c_cat = "AL" if ("AL" in c_dec and "SAT" not in c_dec) else ("SAT" if ("SAT" in c_dec or "RİSKLİ" in c_dec or "RISKLI" in c_dec) else "NOTR")
                a_sig = (item.get("signal") or "").upper()
                a_cat = "AL" if ("AL" in a_sig and "SAT" not in a_sig) else ("SAT" if "SAT" in a_sig else "NOTR")

                if (c_cat == "AL" and a_cat in ("NOTR", "SAT")) or (a_cat == "AL" and c_cat in ("NOTR", "SAT")):
                    item["is_disagreeing"] = True
                    item["disagreement_badge"] = "İki motor farklı görüşte"
                    item["disagreement_reason"] = f"Alpha Motoru: {round(float(item.get('alpha_score', 0)), 1)}p ({item.get('signal')}) vs Karar Motoru: {c_score}p ({c_decision})"
                else:
                    item["is_disagreeing"] = False
                    item["disagreement_badge"] = None
                    item["disagreement_reason"] = None
            else:
                item["conviction_score"] = None
                item["conviction_decision"] = None
                item["conviction_color"] = None
                item["is_disagreeing"] = False
                item["disagreement_badge"] = None
                item["disagreement_reason"] = None
            enriched.append(item)
        return enriched
    except Exception:
        return screener

@router.get("/backtest")
def run_alpha_backtest(days: int = 30, metric: str = "ALPHA", condition: str = "GREATER", threshold: float = 70.0, tickers: str = None):
    return alpha_engine.run_historical_backtest(days_ago=days, metric=metric, condition=condition, threshold=threshold, tickers=tickers)
