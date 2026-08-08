from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import json
import asyncio
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RECOMMENDATIONS_FILE = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend\src\data\hisseData.json"

TICKER_MAP = {
    "Aksigorta": "AKGRT", "Yapı Kredi Bankası": "YKBNK", "Akbank": "AKBNK",
    "Garanti Bankası": "GARAN", "Türkiye Garanti Bankası": "GARAN", "Tofaş": "TOASO",
    "TSKB": "TSKB", "Arçelik": "ARCLK", "Büyük Şefler Gıda": "BIGCH",
    "TAV Holding": "TAVHL", "TAV Havalimanları": "TAVHL", "Anadolu Sigorta": "ANSGR",
    "Emlak Konut GYO": "EKGYO", "Anadolu Hayat Emeklilik": "ANHYT", "Türk Hava Yolları": "THYAO",
    "Tab Gıda": "TABGD", "Sabancı Holding": "SAHOL", "MLP Sağlık": "MPARK",
    "Doğan Holding": "DOHOL", "Aksa Akrilik": "AKSA", "Çimsa": "CIMSA",
    "Türkiye Sigorta": "TURSG", "ŞOK Marketler": "SOKM", "Doğuş Otomotiv": "DOAS",
    "Tüpraş": "TUPRS"
}

# Expanded static list of BIST tickers for demo
BIST_TICKERS = list(set(TICKER_MAP.values())) + [
    "ASELS", "SISE", "BIMAS", "EREGL", "FROTO", "ENKAI", "PETKM", "TCELL", 
    "TTKOM", "SASA", "HEKTS", "PGSUS", "MGROS", "VAKBN", "HALKB", "ISCTR", 
    "KCHOL", "KOZAA", "KOZAL", "KRDMD", "ODAS", "OYAKC", "ALARK"
]
BIST_TICKERS = list(set(BIST_TICKERS))

# Cache structure
cache = {
    "prices": {},
    "last_updated": None,
    "status": "INITIALIZING"
}

async def update_prices_task():
    while True:
        try:
            print("Fetching bulk prices from yfinance...")
            cache["status"] = "FETCHING"
            yf_tickers = [f"{t}.IS" for t in BIST_TICKERS]
            # Bulk download (fast)
            data = yf.download(yf_tickers, period="1d", group_by="ticker", progress=False)
            
            new_prices = {}
            if len(yf_tickers) == 1:
                # pandas series
                val = data['Close'].iloc[-1] if not data.empty else None
                new_prices[BIST_TICKERS[0]] = float(val) if val else None
            else:
                for ticker in BIST_TICKERS:
                    yf_ticker = f"{ticker}.IS"
                    try:
                        val = data[yf_ticker]['Close'].iloc[-1]
                        new_prices[ticker] = float(val)
                    except:
                        new_prices[ticker] = None
                        
            cache["prices"] = new_prices
            cache["last_updated"] = datetime.now().strftime("%H:%M:%S")
            cache["status"] = "READY"
            print(f"Prices updated at {cache['last_updated']}")
        except Exception as e:
            print(f"Background task error: {e}")
            cache["status"] = "ERROR"
            
        await asyncio.sleep(900) # Sleep for 15 minutes

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_prices_task())

@app.get("/api/stocks")
def get_all_stocks():
    """Returns basic list of tracked BIST stocks with cached live prices."""
    return {
        "status": cache["status"],
        "last_updated": cache["last_updated"],
        "stocks": [{"ticker": t, "name": f"{t} A.Ş.", "price": cache["prices"].get(t)} for t in BIST_TICKERS]
    }

@app.get("/api/stocks/{ticker}")
def get_stock_detail(ticker: str):
    """Returns cached live price for a specific stock."""
    ticker = ticker.replace(".IS", "").upper()
    return {
        "ticker": ticker,
        "price": cache["prices"].get(ticker),
        "currency": "TRY",
        "last_updated": cache["last_updated"]
    }

@app.get("/api/recommendations")
def get_all_recommendations():
    try:
        with open(RECOMMENDATIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

@app.get("/api/recommendations/{ticker}")
def get_stock_recommendations(ticker: str):
    matched = []
    target_ticker = ticker.upper()
    for r in get_all_recommendations():
        mapped = TICKER_MAP.get(r["hisse"].strip(), None)
        if mapped == target_ticker:
            matched.append(r)
    return matched

@app.get("/api/kurum/{kurum_name}")
def get_kurum_recommendations(kurum_name: str):
    matched = []
    # Kurum name might be "Ziraat Yatırım", the URL param might be "Ziraat Yatirim" or similar
    kn = kurum_name.lower().replace("-", " ")
    for r in get_all_recommendations():
        if kn in r["kurum"].lower():
            matched.append(r)
    return matched

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
