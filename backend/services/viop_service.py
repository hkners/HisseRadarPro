"""
HisseRadarPro — VİOP fair value calculator
==========================================
The earlier version filled the VİOP page with random numbers (open interest, contract prices,
"arbitrage" yields and buyer/seller labels) for every stock. None of that data exists in our sources,
so this module now computes only what real inputs allow: the theoretical (cost-of-carry) price of a
single-stock future for the BIST 30 names, from the live spot price, an interest rate the user
supplies and the trailing dividend yield:

    F = S x (1 + (r - q) x t),  t = days to expiry / 365

Contract prices and open interest are not shown: they require exchange data we do not have.
Expiry: the last business day of the month (the next month when fewer than 3 days are left).
"""

import datetime
from typing import Any, Dict, List


def _expiry(today: datetime.date) -> datetime.date:
    def last_business_day(year: int, month: int) -> datetime.date:
        first_next = datetime.date(year + (month == 12), month % 12 + 1, 1)
        d = first_next - datetime.timedelta(days=1)
        while d.weekday() >= 5:
            d -= datetime.timedelta(days=1)
        return d
    exp = last_business_day(today.year, today.month)
    if (exp - today).days < 3:
        nxt = (today.replace(day=1) + datetime.timedelta(days=32))
        exp = last_business_day(nxt.year, nxt.month)
    return exp


def fair_values(rate: float) -> Dict[str, Any]:
    from globals import price_service, report_repo
    from services.portfolio_builder import BIST30_TICKERS
    today = datetime.date.today()
    exp = _expiry(today)
    days = (exp - today).days
    t = days / 365.0
    info = report_repo.get_all_company_info() or {}
    prices = price_service.prices
    rows: List[Dict[str, Any]] = []
    for ticker in sorted(BIST30_TICKERS):
        spot = (prices.get(ticker) or {}).get("price")
        if not spot:
            continue
        f = (info.get(ticker) or {}).get("fundamentals") or {}
        q = f.get("dividendYield")
        q = float(q) / 100 if q and float(q) > 1 else float(q or 0)  # yfinance reports percent or fraction
        fair = spot * (1 + (rate - q) * t)
        rows.append({
            "contract": f"F_{ticker}{exp.strftime('%m%y')}", "ticker": ticker, "spot_price": spot,
            "spot_change": (prices.get(ticker) or {}).get("change_pct"),
            "dividend_yield": q, "fair_price": round(fair, 2), "basis_pct": round((fair / spot - 1) * 100, 2),
        })
    return {"expiry": exp.isoformat(), "days_to_expiry": days, "rate": rate, "rows": rows,
            "note": "Kontrat fiyatı ve açık pozisyon verisi kaynaklarımızda yok; gösterilen fiyatlar teoriktir."}
