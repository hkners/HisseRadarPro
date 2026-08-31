import yfinance as yf
import time

def test():
    t0 = time.time()
    stock = yf.Ticker("AEFES.IS")
    print("fast_info price:", stock.fast_info.last_price)
    print("fast_info previous_close:", stock.fast_info.previous_close)
    print("Time taken:", time.time() - t0)

if __name__ == '__main__':
    test()
