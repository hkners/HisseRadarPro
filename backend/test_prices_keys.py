import sqlite3
import json

from globals import BIST_TICKERS, price_service

print("BIST_TICKERS sample:", BIST_TICKERS[:5])
prices = price_service.prices or {}
print("PriceService prices count:", len(prices))
print("PriceService sample keys:", list(prices.keys())[:5] if prices else "EMPTY")
if prices:
    sample_key = list(prices.keys())[0]
    print(f"Sample price for {sample_key}:", prices[sample_key])
