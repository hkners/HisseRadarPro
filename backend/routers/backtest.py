from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from services.backtest_service import compute_decile_analysis, VALID_METRICS

router = APIRouter(prefix="/api/backtest", tags=["Backtest"])


@router.get("/decile-analysis")
def get_decile_analysis(
    metric: str = Query("conviction_score", description="Metric column name in score_history"),
    forward_days: int = Query(90, description="Forward return horizon in days (e.g. 30, 60, 90)"),
    lookback_months: Optional[int] = Query(None, description="Optional lookback period in months")
):
    """
    Computes 10-decile factor analysis for conviction scores, alpha scores,
    and sub-components against forward returns from historical prices.
    """
    if metric not in VALID_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric '{metric}'. Valid choices: {sorted(list(VALID_METRICS))}"
        )
    try:
        return compute_decile_analysis(
            metric_column=metric,
            forward_days=forward_days,
            lookback_months=lookback_months
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
