import os
import sys
import json
import sqlite3

# Test how conviction engine evaluates MACKO and other stocks with TA integration
from globals import report_repo, price_service, BIST_TICKERS
from services.conviction_engine import conviction_engine

all_prices = price_service.prices or {}
all_reports = report_repo.get_reports(limit=10000) or []
company_info_map = report_repo.get_all_company_info() or {}

macko_info = company_info_map.get('MACKO', {})
print("MACKO TA in company_info:", bool(macko_info.get('technical_analysis')))
if macko_info.get('technical_analysis'):
    print("MACKO TA Summary:", macko_info['technical_analysis'].get('summary'))
