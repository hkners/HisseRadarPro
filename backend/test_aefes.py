import yfinance as yf
import json

def test():
    stock = yf.Ticker("AEFES.IS")
    info = stock.info
    print("Price from info:", info.get("currentPrice", info.get("regularMarketPrice")))
    print("Previous close:", info.get("previousClose"))
    print("F/K (trailingPE):", info.get("trailingPE"))
    print("Dividend Yield:", info.get("dividendYield"))
    
    # check history
    hist = stock.history(period="5d")
    print("\nHistory:")
    print(hist)

if __name__ == '__main__':
    test()
