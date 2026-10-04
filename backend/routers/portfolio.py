"""
Portfolio Router
Handles /api/portfolio GET, POST, DELETE operations, CSV import and analytics.
Every position and transaction belongs to an account: 'real' (gerçek para) or 'paper' (kağıt).
Endpoints that read take ?account=real|paper (omitted = both); endpoints that write default to 'real'.
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

ACCOUNTS = ("real", "paper")


def _account(value: Optional[str], allow_all: bool = True) -> Optional[str]:
    if value in (None, "", "all") and allow_all:
        return None
    if value not in ACCOUNTS:
        raise HTTPException(status_code=400, detail="Hesap 'real' veya 'paper' olmalı.")
    return value


class PortfolioItem(BaseModel):
    ticker: str
    quantity: float
    cost: float
    account: str = "real"

class GeneratePortfolioRequest(BaseModel):
    top_n: int = 15
    universe: str = "all"
    budget_tl: float = 100000.0
    method: str = "score_proportional"
    score_metric: str = "conviction_score"
    exposure_multiplier: Optional[float] = None

class BatchTransactionItem(BaseModel):
    ticker: str
    tx_type: str = "BUY"
    quantity: float
    price: float
    tx_date: Optional[str] = None

class BatchTransactionsRequest(BaseModel):
    transactions: List[BatchTransactionItem]
    account: str = "real"

class ImportPreviewRequest(BaseModel):
    content: str = Field(..., description="Raw CSV text")

class ImportCommitRequest(BaseModel):
    rows: List[BatchTransactionItem]
    account: str = "real"

def _get_repo():
    try:
        from db_manager import ReportRepository
        return ReportRepository()
    except Exception:
        from globals import report_repo
        return report_repo

def _get_deps():
    from globals import report_repo, price_service
    return report_repo, price_service

@router.post("/generate")
def generate_suggested_portfolio(req: GeneratePortfolioRequest):
    try:
        from services.portfolio_builder import generate_portfolio
        repo = _get_repo()
        result = generate_portfolio(
            top_n=req.top_n,
            universe=req.universe,
            budget_tl=req.budget_tl,
            method=req.method,
            score_metric=req.score_metric,
            exposure_multiplier=req.exposure_multiplier,
            repo=repo
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch")
def add_portfolio_batch(req: BatchTransactionsRequest):
    repo = _get_repo()
    account = _account(req.account, allow_all=False)
    try:
        tx_list = [t.model_dump() for t in req.transactions]
        count = repo.add_portfolio_transactions_batch(tx_list, account=account)
        return {"status": "success", "count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import/preview")
def preview_import(req: ImportPreviewRequest):
    """Parses CSV text and returns every row with a validation status; writes nothing."""
    from services.portfolio_import import parse_csv
    from globals import BIST_TICKERS
    return parse_csv(req.content, set(BIST_TICKERS) | {"XU100"})

@router.post("/import")
def commit_import(req: ImportCommitRequest):
    """Writes previously previewed rows as transactions into one account."""
    report_repo, _ = _get_deps()
    account = _account(req.account, allow_all=False)
    count = report_repo.add_portfolio_transactions_batch([r.model_dump() for r in req.rows], account=account)
    return {"status": "success", "count": count, "account": account}

@router.get("/analytics")
def get_portfolio_analytics(demo: bool = False, account: Optional[str] = Query(None)):
    """Risk desk view of current holdings (falls back to a demo book when empty)."""
    from services.portfolio_analytics import compute_portfolio_analytics
    return compute_portfolio_analytics(demo=demo, account=_account(account))


@router.get("/factors")
def get_portfolio_factors(demo: bool = False, account: Optional[str] = Query(None)):
    """Factor exposures, return attribution and hedge ideas (first call builds the price matrix, ~20s)."""
    from services.portfolio_factors import compute
    return compute(account=_account(account), demo=demo)


@router.get("")
def get_portfolio(account: Optional[str] = Query(None)):
    report_repo, price_service = _get_deps()
    items = report_repo.get_user_portfolio(_account(account))

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
        report_repo.add_to_portfolio(item.ticker, item.quantity, item.cost, _account(item.account, allow_all=False))
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transactions")
def get_transactions(account: Optional[str] = Query(None)):
    report_repo, _ = _get_deps()
    return report_repo.get_portfolio_transactions(_account(account))

class TransactionItem(BaseModel):
    ticker: str
    tx_type: str # BUY or SELL
    quantity: float
    price: float
    tx_date: str
    account: str = "real"

@router.post("/transactions")
def add_transaction(item: TransactionItem):
    report_repo, _ = _get_deps()
    try:
        report_repo.add_portfolio_transaction(
            item.ticker, item.tx_type, item.quantity, item.price, item.tx_date, _account(item.account, allow_all=False)
        )
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/equity-curve")
def get_equity_curve(days: int = 30, account: Optional[str] = Query(None)):
    report_repo, price_service = _get_deps()
    transactions = report_repo.get_portfolio_transactions(_account(account))
    if not transactions:
        return []

    import datetime
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=days)

    # Build list of days
    date_list = [start_date + datetime.timedelta(days=x) for x in range(days + 1)]

    # Get all unique tickers in transactions
    tickers = set(t['ticker'] for t in transactions)

    # We need historical prices for these tickers. If not in DB, fallback to live price.
    historical_data = {}
    for ticker in tickers:
        prices = report_repo.get_historical_prices(ticker)
        # Create a dict mapping date_str -> close_price
        price_map = {}
        for p in prices:
            # p['date'] is usually YYYY-MM-DD HH:MM:SS or YYYY-MM-DD
            d_str = p['date'].split(' ')[0]
            price_map[d_str] = p['close']

        # Fallback to current live price if history is missing for today
        live = price_service.get_price(ticker)
        if isinstance(live, dict) and live.get("price"):
            price_map[end_date.isoformat()] = live["price"]

        historical_data[ticker] = price_map

    curve = []

    for current_date in date_list:
        date_str = current_date.isoformat()

        # Calculate portfolio holdings exactly on this date
        holdings = {}
        cash_invested = 0
        for tx in transactions:
            tx_date_str = tx['tx_date'].split(' ')[0]
            if tx_date_str > date_str:
                continue # Transaction hasn't happened yet

            t = tx['ticker']
            qty = float(tx['quantity'])
            price = float(tx['price'])

            if t not in holdings:
                holdings[t] = 0

            if tx['tx_type'] == 'BUY':
                holdings[t] += qty
                cash_invested += (qty * price)
            elif tx['tx_type'] == 'SELL':
                holdings[t] -= qty
                cash_invested -= (qty * price)

        # Calculate market value of holdings on this date
        market_value = 0
        for t, qty in holdings.items():
            if qty > 0:
                # Find price on or before this date
                price_map = historical_data.get(t, {})

                # Check current date, then walk backwards up to 7 days to find a closing price (weekends/holidays)
                found_price = 0
                for back_days in range(7):
                    check_date = (current_date - datetime.timedelta(days=back_days)).isoformat()
                    if check_date in price_map:
                        found_price = price_map[check_date]
                        break

                if found_price > 0:
                    market_value += qty * found_price

        # Formatting the day label for the chart
        day_label = current_date.strftime("%d %b")
        if current_date == end_date:
            day_label = "NOW"

        curve.append({
            "day": day_label,
            "date": date_str,
            "value": market_value,
            "invested": cash_invested
        })

    return curve

# Declared last so the static paths above (/transactions, /analytics, ...) are never shadowed.
@router.delete("/{ticker}")
def remove_portfolio_item(ticker: str, account: Optional[str] = Query(None)):
    report_repo, _ = _get_deps()
    removed = report_repo.remove_from_portfolio(ticker, _account(account))
    if not removed:
        raise HTTPException(status_code=404, detail=f"{ticker.upper()} için kayıtlı işlem bulunamadı.")
    return {"status": "success", "removed": removed}
