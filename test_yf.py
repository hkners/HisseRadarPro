import yfinance as yf

try:
    ticker = yf.Ticker('AKBNK.IS')
    hist = ticker.history(period='1d')
    if not hist.empty:
        print(f"AKBNK.IS Close: {hist['Close'].iloc[-1]}")
    else:
        print("AKBNK.IS history is empty.")
except Exception as e:
    print(f"Error fetching data: {e}")
