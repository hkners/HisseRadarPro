import os
import datetime
import json
import sqlite3

from globals import report_repo, price_service, BIST_TICKERS
from services.conviction_engine import conviction_engine

print("MACKO in BIST_TICKERS:", "MACKO" in BIST_TICKERS)
p = price_service.get_price("MACKO")
print("MACKO Price:", p)

recs = report_repo.get_reports(ticker="MACKO") or []
print("MACKO Reports count:", len(recs))

info = report_repo.get_company_info("MACKO") or {}
fund = info.get("fundamentals", {})
ta = info.get("technical_analysis", {})
print("MACKO TA Summary:", ta.get("summary") if ta else None)

hist = report_repo.get_historical_prices("MACKO") or []
print("MACKO Hist count:", len(hist))

setup = conviction_engine._evaluate_stock(
    ticker="MACKO",
    live_price=p.get("price") or 30.70,
    change_pct=p.get("change_pct") or 0.0,
    volume=p.get("volume") or 0,
    recs=recs,
    fundamentals=fund,
    ta_data=ta,
    history=hist,
    today=datetime.date.today()
)

print("\n--- MACKO EVALUATION RESULT ---")
print("Decision:", setup.get("decision"))
print("Score:", setup.get("score"))
print("Color:", setup.get("color"))
print("TA Rec:", setup.get("ta_rec"))
print("Is Falling Knife:", setup.get("is_falling_knife"))
print("Drivers:", setup.get("drivers"))
print("Risk:", setup.get("risk_statement"))
