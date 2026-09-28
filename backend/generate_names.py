import yfinance as yf
import json
import concurrent.futures
import os

def get_name(ticker):
    try:
        t = yf.Ticker(f"{ticker}.IS")
        name = t.info.get('longName') or t.info.get('shortName') or ticker
        return ticker, name
    except Exception:
        return ticker, ticker

def main():
    bist_file = 'all_bist.txt'
    if not os.path.exists(bist_file):
        print(f"{bist_file} not found.")
        return
        
    with open(bist_file, 'r', encoding='utf-8') as f:
        tickers = [line.strip() for line in f.read().splitlines() if line.strip()]
        
    names_map = {}
    print(f"Fetching names for {len(tickers)} tickers...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        results = executor.map(get_name, tickers)
        for ticker, name in results:
            names_map[ticker] = name
            
    with open('company_names.json', 'w', encoding='utf-8') as f:
        json.dump(names_map, f, ensure_ascii=False, indent=2)
    print("Done. Saved to company_names.json")

if __name__ == '__main__':
    main()
