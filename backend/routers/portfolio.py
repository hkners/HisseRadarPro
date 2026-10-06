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
    # The shared repository: creating a new one per request re-ran table migrations and used a
    # separate write lock.
    from globals import report_repo
    return report_repo


def _validate_transactions(rows: List[Dict[str, Any]], account: str) -> List[Dict[str, Any]]:
    """Normalises and checks transactions before anything is written.
    Rejects unknown tickers, types other than BUY/SELL, non-positive quantity or price, invalid or
    future dates, and any sale larger than the position held on that date (including sales that a
    back-dated entry would turn negative)."""
    import datetime
    from globals import BIST_TICKERS
    valid = set(BIST_TICKERS)
    today = datetime.date.today()
    clean, errors = [], []
    for i, r in enumerate(rows, start=1):
        ticker = str(r.get("ticker") or "").strip().upper().replace(".IS", "")
        tx_type = str(r.get("tx_type") or "BUY").strip().upper()
        tx_type = {"AL": "BUY", "ALIŞ": "BUY", "SAT": "SELL", "SATIŞ": "SELL"}.get(tx_type, tx_type)
        try:
            qty = float(r.get("quantity"))
            price = float(r.get("price"))
        except (TypeError, ValueError):
            errors.append(f"{i}. satır: miktar ve fiyat sayı olmalı.")
            continue
        raw_date = str(r.get("tx_date") or today.isoformat())[:10]
        try:
            tx_date = datetime.date.fromisoformat(raw_date)
        except ValueError:
            errors.append(f"{i}. satır: tarih YYYY-AA-GG biçiminde olmalı.")
            continue
        if ticker not in valid:
            errors.append(f"{i}. satır: {ticker or '(boş)'} BIST listesinde yok.")
        elif tx_type not in ("BUY", "SELL"):
            errors.append(f"{i}. satır: işlem türü BUY veya SELL olmalı.")
        elif qty <= 0 or price <= 0:
            errors.append(f"{i}. satır: miktar ve fiyat sıfırdan büyük olmalı.")
        elif tx_date > today:
            errors.append(f"{i}. satır: ileri tarihli işlem girilemez.")
        else:
            clean.append({"ticker": ticker, "tx_type": tx_type, "quantity": qty, "price": price,
                          "tx_date": tx_date.isoformat(), "account": account})
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors[:5]) + (f" (+{len(errors) - 5} hata)" if len(errors) > 5 else ""))
    oversell = _get_repo().holdings_as_of(account, clean)
    if oversell:
        raise HTTPException(status_code=400, detail=oversell)
    return clean

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
    tx_list = _validate_transactions([t.model_dump() for t in req.transactions], account)
    count = repo.add_portfolio_transactions_batch(tx_list, account=account)
    return {"status": "success", "count": count}

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
    rows = _validate_transactions([r.model_dump() for r in req.rows], account)
    count = report_repo.add_portfolio_transactions_batch(rows, account=account)
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
    acc = _account(account)
    items = report_repo.get_user_portfolio(acc)
    # Cost basis in today's prices (TÜFE) and in USD, so a gain can be judged against inflation and the dollar.
    txs = report_repo.get_portfolio_transactions(acc)
    try:
        from services.macro_data import position_costs
        alt_costs = position_costs(txs)
    except Exception:
        alt_costs = {}
    try:
        from services.corporate_actions import dividends_received
        divs = dividends_received(txs)["by_position"]
    except Exception:
        divs = {}

    # Enrich with live prices
    enriched = []
    for item in items:
        ticker = item["ticker"]
        p_data = price_service.get_price(ticker)

        live_price = p_data.get("price") if isinstance(p_data, dict) else None
        change_pct = p_data.get("change_pct") if isinstance(p_data, dict) else None
        price_source = "live"
        if not live_price:
            # No live quote: value the position at its last stored close instead of zero.
            last = report_repo.get_historical_prices(ticker, limit=1)
            live_price = float(last[-1]["close"]) if last else None
            change_pct = None
            price_source = f"close {str(last[-1]['date'])[:10]}" if last else "none"

        item["live_price"] = live_price
        item["live_change_pct"] = change_pct
        item["price_source"] = price_source
        d = divs.get(f"{ticker}|{item.get('account') or 'real'}") or {}
        item["dividends_gross"], item["dividends_net"] = d.get("gross", 0.0), d.get("net", 0.0)
        alt = alt_costs.get((ticker, item.get("account") or "real"))
        if alt and alt["qty"] > 1e-9:
            item["cost_real_today"] = alt["cost_real"] / alt["qty"] if alt["cost_real"] == alt["cost_real"] else None
            item["cost_usd"] = alt["cost_usd"] / alt["qty"] if alt["cost_usd"] == alt["cost_usd"] else None
            item["usdtry"] = alt.get("usdtry_today")
        enriched.append(item)

    return enriched

@router.post("")
def add_portfolio_item(item: PortfolioItem):
    report_repo, _ = _get_deps()
    account = _account(item.account, allow_all=False)
    tx = _validate_transactions([{"ticker": item.ticker, "tx_type": "BUY", "quantity": item.quantity, "price": item.cost}], account)[0]
    report_repo.add_to_portfolio(tx["ticker"], tx["quantity"], tx["price"], account)
    return {"status": "success"}

@router.get("/transactions")
def get_transactions(account: Optional[str] = Query(None)):
    report_repo, _ = _get_deps()
    return report_repo.get_portfolio_transactions(_account(account), adjusted=False)  # as entered

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
    account = _account(item.account, allow_all=False)
    tx = _validate_transactions([item.model_dump()], account)[0]
    report_repo.add_portfolio_transaction(tx["ticker"], tx["tx_type"], tx["quantity"], tx["price"], tx["tx_date"], account)
    return {"status": "success"}


@router.get("/dividends")
def get_dividends(account: Optional[str] = Query(None)):
    """Cash dividends earned on held shares (ex-date holdings), before and after withholding."""
    report_repo, _ = _get_deps()
    from services.corporate_actions import dividends_received
    return dividends_received(report_repo.get_portfolio_transactions(_account(account)))


@router.get("/realized")
def get_realized(account: Optional[str] = Query(None)):
    """Realised profit/loss from sales (average-cost method), including closed positions."""
    report_repo, _ = _get_deps()
    return report_repo.get_realized_pnl(_account(account))

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

    # Price on any day = last known close on or before it (weekends, holidays and late data carry the
    # previous close forward). Today uses the live price. A position is never valued at 0 just because
    # its latest bar is more than a few days old.
    import bisect
    histories = {}
    for ticker in tickers:
        rows = report_repo.get_historical_prices(ticker)
        dates = [str(p['date']).split(' ')[0] for p in rows]
        closes = [float(p['close']) for p in rows]
        try:
            from services.corporate_actions import undo_dividend_adjustment
            closes = undo_dividend_adjustment(ticker, dates, closes)  # dividends are added separately below
        except Exception:
            pass
        live = price_service.get_price(ticker)
        if isinstance(live, dict) and live.get("price"):
            if dates and dates[-1] == end_date.isoformat():
                closes[-1] = float(live["price"])
            else:
                dates.append(end_date.isoformat())
                closes.append(float(live["price"]))
        histories[ticker] = (dates, closes)

    def price_on(ticker: str, date_str: str, fallback: float) -> float:
        dates, closes = histories.get(ticker, ([], []))
        i = bisect.bisect_right(dates, date_str) - 1
        return closes[i] if i >= 0 else fallback

    # Cash dividends received count as part of the portfolio's value from their ex-date.
    try:
        from services.corporate_actions import dividends_received
        div_events = dividends_received(transactions)["events"]
    except Exception:
        div_events = []

    curve = []
    for current_date in date_list:
        date_str = current_date.isoformat()
        holdings = {}
        last_trade_price = {}
        cash_invested = 0.0
        for tx in transactions:
            if tx['tx_date'].split(' ')[0] > date_str:
                continue
            t = tx['ticker']
            qty = float(tx['quantity'])
            price = float(tx['price'])
            holdings.setdefault(t, 0.0)
            last_trade_price[t] = price
            if tx['tx_type'] == 'BUY':
                holdings[t] += qty
                cash_invested += qty * price
            elif tx['tx_type'] == 'SELL':
                holdings[t] -= qty
                cash_invested -= qty * price  # net cash put in (sale proceeds come back out)

        # Before a ticker's first stored bar, value it at its own trade price.
        market_value = sum(qty * price_on(t, date_str, last_trade_price[t]) for t, qty in holdings.items() if qty > 0)
        dividends = sum(e["net"] for e in div_events if e["ex_date"] <= date_str)
        curve.append({
            "day": "Bugün" if current_date == end_date else current_date.strftime("%d.%m"),
            "date": date_str,
            "value": market_value + dividends,
            "dividends": dividends,
            "invested": cash_invested,
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
