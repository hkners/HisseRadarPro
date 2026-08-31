import yfinance as yf

data = yf.download(["AEFES.IS", "TKNSA.IS"], period="5d", group_by="ticker", progress=False)
print("AEFES:")
print(data["AEFES.IS"])

print("\nAEFES without dropna:")
print(data["AEFES.IS"]["Close"])

print("\nAEFES with dropna:")
print(data["AEFES.IS"].dropna(subset=["Close"])["Close"])
