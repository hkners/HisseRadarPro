import yfinance as yf
import time
import concurrent.futures

def fetch_fast(ticker):
    t = yf.Ticker(ticker)
    try:
        return ticker, t.fast_info.last_price, t.fast_info.previous_close, t.fast_info.last_volume
    except:
        return ticker, None, None, None

def test():
    t0 = time.time()
    tickers = ["AEFES.IS", "TKNSA.IS", "THYAO.IS", "GARAN.IS", "AKBNK.IS", "BIMAS.IS", "TUPRS.IS"] * 5 # 35 tickers
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        results = list(executor.map(fetch_fast, tickers))
    print("Time taken for 35 requests:", time.time() - t0)
    print(results[0])

if __name__ == '__main__':
    test()
