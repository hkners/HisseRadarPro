import yfinance as yf

if __name__ == '__main__':
    hist = yf.Ticker('TKNSA.IS').history(period='5d')
    print(hist)
