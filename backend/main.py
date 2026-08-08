from fastapi import FastAPI, BackgroundTasks, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import os
import sys
import json
import logging
import asyncio
from datetime import datetime
from typing import Optional
import yfinance as yf

logger = logging.getLogger(__name__)

# Suppress noisy yfinance ERROR logs for delisted/invalid tickers
logging.getLogger("yfinance").setLevel(logging.CRITICAL)

base_dir = os.path.dirname(os.path.abspath(__file__))
scrapers_dir = os.path.join(base_dir, "scrapers")
if scrapers_dir not in sys.path:
    sys.path.insert(0, scrapers_dir)

from db_manager import ReportRepository
from scraper_network import run_scraper_network

report_repo = ReportRepository()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the logos directory to serve static images
logos_dir = os.path.join(base_dir, "logos")
os.makedirs(logos_dir, exist_ok=True)
app.mount("/logos", StaticFiles(directory=logos_dir), name="logos")

downloads_dir = os.path.join(base_dir, "scrapers", "downloads")
os.makedirs(downloads_dir, exist_ok=True)
app.mount("/downloads", StaticFiles(directory=downloads_dir), name="downloads")

def get_cached_recommendations():
    """Fetches scraped reports from the database and maps them to the legacy recommendation format."""
    scraped_recs = []
    try:
        db_reports = report_repo.get_reports(limit=1000)
        for r in db_reports:
            scraped_recs.append({
                "tarih": str(r.get("report_date", "")),
                "sirket": str(r.get("ticker", "")),
                "kurum": str(r.get("broker", "")),
                "tavsiye": str(r.get("rating", "")),
                "hedefFiyat": str(r.get("target_price", ""))
            })
    except Exception as e:
        logger.error(f"Error fetching DB reports for UI merge: {e}")
        
    return scraped_recs

def get_cached_models():
    """Returns an empty array since mock model data was removed."""
    return []

TICKER_MAP = {
    # A
    "1000 Yatırımlar Holding": "YATAS",
    "Agesa": "AGESA", "Agesa Hayat Emeklilik": "AGESA",
    "Akbank": "AKBNK",
    "Aksa Akrilik": "AKSA", "Aksa Enerji": "AKSEN",
    "Aksigorta": "AKGRT",
    "Alarko GYO": "ALGYO", "Alarko Holding": "ALARK",
    "Anadolu Grubu Holding": "AGHOL", "Anadolu Hayat Emeklilik": "ANHYT",
    "Anadolu Sigorta": "ANSGR",
    "Arçelik": "ARCLK",
    "ASELSAN": "ASELS", "Aselsan": "ASELS",
    "Astor Enerji": "ASTOR",
    "Avrupakent GYO": "AVGYO",
    # B
    "Besler Gıda": "BSRGZ",
    "Bor Şeker": "BORSK",
    "Büyük Şefler Gıda": "BIGCH",
    "BİM": "BIMAS", "BIM": "BIMAS",
    # C
    "CW Enerji": "CWENE",
    "Coca Cola İçecek": "CCOLA", "Coca-Cola İçecek": "CCOLA",
    # Ç
    "Çimsa": "CIMSA",
    # D
    "Doğan Holding": "DOHOL",
    "Doğuş Otomotiv": "DOAS",
    # E
    "Emlak Konut GYO": "EKGYO",
    "Europower": "EUPWR", "Europower Eneri": "EUPWR", "Europower Enerji": "EUPWR",
    # F
    "Ford Otomotiv": "FROTO", "Ford Otosan": "FROTO",
    # G
    "Galata Wind": "GWIND",
    "Garanti BBVA": "GARAN", "Garanti Bankası": "GARAN", "Türkiye Garanti Bankası": "GARAN",
    "Gediz Ambalaj": "GEDZA",
    "Gelecek Varlık Yönetimi": "GLCVY",
    "Girişim Elektrik": "GEREL",
    "Grainturk": "GRTRK", "Graintürk": "GRTRK",
    "Gülermak": "GLRMK", "Gülermak Ağır Sanayi": "GLRMK",
    # H
    "Halkbank": "HALKB",
    "Hareket Proje Taşımacılık": "HRKET", "Hareket Proje Taşımacılığı": "HRKET",
    # I - İ
    "IC Enterra": "ICUGS",
    "İş Bankası": "ISCTR", "İ Bankası": "ISCTR", "Türkiye İş Bankası": "ISCTR",
    "Türkiye İ Bankası": "ISCTR", "Türkiye İ Bankası (C)": "ISCTR",
    "İş GYO": "ISGYO", "İ GYO": "ISGYO",
    "İsdemir": "ISDMR",
    "İndeks Bilgisayar": "INDES",
    # K
    "Kalekim": "KLKIM",
    "Kardemir D": "KRDMD", "Kardemir": "KRDMD",
    "Kimteks Poliüretan": "KMPUR",
    "Koton": "KOTON", "Koton Mağazacılık": "KOTON",
    "Koç Holding": "KCHOL",
    "Kuzey Boru": "KZBGY",
    # L
    "Lila Kağıt": "LILAK",
    "Logo Yazılım": "LOGO",
    "Lokman Hekim": "LKMNH",
    # M
    "MLP Sağlık": "MPARK", "Medical Park": "MPARK",
    "Mavi": "MAVI", "Mavi Giyim": "MAVI",
    "Migros": "MGROS",
    # O
    "Oncosem": "ONCSM",
    "Otokar": "OTKAR",
    "OYAK Çimento": "OYAKC", "Oyak Çimento": "OYAKC",
    # P
    "Pegasus": "PGSUS", "Pegasus Hava Taşımacılığı": "PGSUS", "Pegasus Hava Taşımacılık": "PGSUS",
    # R
    "Rönesans Gayrimenkul": "RYGYO", "Rönesans Gayrimenkul Yatırım": "RYGYO",
    # S
    "Sabancı Holding": "SAHOL",
    "Selçuk Ecza Deposu": "SELEC",
    "Smart Güneş Enerjisi": "SMRTG",
    # Ş
    "ŞOK Marketler": "SOKM", "Şok Marketler": "SOKM",
    "Şişecam": "SISE",
    # T
    "TAB Gıda": "TABGD", "Tab Gıda": "TABGD",
    "TAV Holding": "TAVHL", "TAV Havalimanları": "TAVHL", "TAV Havalimanları Holding": "TAVHL", "Tav Havalimanları": "TAVHL",
    "Tapdi Oksijen": "TDGYO",
    "Teknosa": "TKNSA",
    "Telekomunikasyon Sektörü": "TCELL",
    "Tofaş": "TOASO", "TOFAŞ": "TOASO",
    "Torunlar GYO": "TRGYO",
    "TSKB": "TSKB",
    "Turkcell": "TCELL",
    "Tüpraş": "TUPRS",
    "Türk Hava Yolları": "THYAO",
    "Türk Telekom": "TTKOM",
    "Türkiye Sigorta": "TURSG",
    "Türkiye Vakıflar Bankası": "VAKBN",
    # U - Ü
    "Ülker": "ULKER",
    # V
    "VakıfBank": "VAKBN", "Vakıfbank": "VAKBN",
    "Vestel Beyaz Eşya": "VESBE",
    # Y
    "YEO Teknoloji": "YEOTK",
    "Yapı Kredi Bankası": "YKBNK", "Yapı ve Kredi Bankası": "YKBNK",
    "Yayla Agro Gıda": "YAYLA",
}

BIST_TICKERS = []
try:
    with open(ALL_BIST_FILE, "r", encoding="utf-8") as f:
        BIST_TICKERS = [line.strip() for line in f if line.strip()]
except Exception as e:
    print("Warning: Could not load all_bist.txt, falling back to empty list.", e)

for val in TICKER_MAP.values():
    if val not in BIST_TICKERS:
        BIST_TICKERS.append(val)

cache = {
    "prices": {},
    "last_updated": None,
    "status": "INITIALIZING"
}

async def fetch_yfinance_data_in_thread(yf_tickers):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: yf.download(yf_tickers, period="1d", group_by="ticker", progress=False))

def update_prices_task():
    import time
    while True:
        def safe_float(v):
            try:
                import math
                f = float(v)
                if math.isnan(f) or math.isinf(f): return None
                return f
            except:
                return None

        try:
            print("Fetching bulk prices from yfinance in background thread...")
            cache["status"] = "FETCHING"
            yf_tickers = [f"{t}.IS" for t in BIST_TICKERS]
            
            if len(yf_tickers) == 0:
                print("No tickers to fetch, waiting...")
                cache["status"] = "READY"
                time.sleep(900)
                continue
            
            data = yf.download(yf_tickers, period="5d", group_by="ticker", progress=False)
            
            new_prices = {}
            if len(yf_tickers) == 1:
                t = BIST_TICKERS[0]
                df_clean = data.dropna(subset=['Close'])
                if not df_clean.empty:
                    c_close = df_clean['Close'].iloc[-1]
                    p_close = df_clean['Close'].iloc[-2] if len(df_clean) > 1 else c_close
                    vol = df_clean['Volume'].iloc[-1]
                    chg = ((c_close - p_close) / p_close * 100) if p_close and p_close > 0 else 0
                    new_prices[t] = {"price": safe_float(c_close), "change_pct": safe_float(chg), "volume": safe_float(vol)}
                else:
                    new_prices[t] = {"price": None, "change_pct": None, "volume": None}
            else:
                for ticker in BIST_TICKERS:
                    yf_ticker = f"{ticker}.IS"
                    try:
                        df = data[yf_ticker]
                        df_clean = df.dropna(subset=['Close'])
                        if not df_clean.empty:
                            c_close = df_clean['Close'].iloc[-1]
                            p_close = df_clean['Close'].iloc[-2] if len(df_clean) > 1 else c_close
                            vol = df_clean['Volume'].iloc[-1]
                            chg = ((c_close - p_close) / p_close * 100) if p_close and p_close > 0 else 0
                            new_prices[ticker] = {"price": safe_float(c_close), "change_pct": safe_float(chg), "volume": safe_float(vol)}
                        else:
                            new_prices[ticker] = {"price": None, "change_pct": None, "volume": None}
                    except:
                        new_prices[ticker] = {"price": None, "change_pct": None, "volume": None}
                        
            cache["prices"] = new_prices
            cache["last_updated"] = datetime.now().strftime("%H:%M:%S")
            cache["status"] = "READY"
            print(f"Prices updated at {cache['last_updated']}")
        except Exception as e:
            print(f"Background task error: {e}")
            cache["status"] = "ERROR"
            
        time.sleep(900)

@app.on_event("startup")
def startup_event():
    import threading
    load_static_json_cache()
    threading.Thread(target=update_prices_task, daemon=True).start()

def match_ticker(name):
    if not name:
        return None
    name_strip = name.strip()
    
    for k, v in TICKER_MAP.items():
        if k.lower() == name_strip.lower():
            return v
            
    for k, v in TICKER_MAP.items():
        if k.lower() in name_strip.lower():
            return v
            
    upper_name = name_strip.upper()
    if upper_name in BIST_TICKERS:
        return upper_name
        
    if len(upper_name) <= 5 and upper_name.isupper() and upper_name.isalpha():
        if upper_name == "BİM" or upper_name == "BIM": return "BIMAS"
        if upper_name == "TOFAŞ" or upper_name == "TOFAS": return "TOASO"
        return upper_name
        
    return None

@app.get("/api/health")
def get_health():
    """Health check endpoint returning API status and DB status."""
    return {
        "status": "ok",
        "service": "HisseRadarPro API",
        "timestamp": datetime.now().isoformat(),
        "scraped_reports_count": len(report_repo.get_reports())
    }

@app.get("/api/stocks")
def get_all_stocks():
    # Load recommendations from in-memory cache to calculate rec_count and avg_potential
    recs_grouped = {}
    recs_data = get_cached_recommendations()
    for r in recs_data:
        ticker = match_ticker(r.get("hisse", ""))
        if not ticker: continue
        if ticker not in recs_grouped:
            recs_grouped[ticker] = {"targets": [], "brokers": set()}
        
        target = r.get("hedefFiyat")
        try:
            target_val = float(str(target).replace(',', '.'))
            recs_grouped[ticker]["targets"].append(target_val)
        except:
            pass
        
        broker = r.get("kurum")
        if broker:
            recs_grouped[ticker]["brokers"].add(broker)

    stocks = []
    for t, p_data in cache["prices"].items():
        if p_data:
            rec_data = recs_grouped.get(t, {"targets": [], "brokers": set()})
            avg_target = sum(rec_data["targets"]) / len(rec_data["targets"]) if rec_data["targets"] else 0.0
            live_price = p_data.get("price")
            upside = 0.0
            if live_price and live_price > 0 and avg_target > 0:
                upside = ((avg_target - live_price) / live_price) * 100
                
            stocks.append({
                "ticker": t,
                "name": f"{t} A.Ş.",
                "price": live_price,
                "change_pct": p_data.get("change_pct"),
                "volume": p_data.get("volume"),
                "rec_count": len(rec_data["brokers"]),
                "avg_potential": upside,
                "brokerages": list(rec_data["brokers"])
            })
    return {
        "status": cache["status"],
        "last_updated": cache["last_updated"],
        "stocks": stocks
    }

@app.get("/api/stocks/{ticker}")
def get_stock_detail(ticker: str):
    ticker = ticker.replace(".IS", "").upper()
    p_data = cache["prices"].get(ticker, {})
    return {
        "ticker": ticker,
        "price": p_data.get("price") if isinstance(p_data, dict) else None,
        "change_pct": p_data.get("change_pct") if isinstance(p_data, dict) else None,
        "currency": "TRY",
        "last_updated": cache["last_updated"]
    }

@app.get("/api/recommendations")
def get_all_recommendations():
    return get_cached_recommendations()

@app.get("/api/recommendations/latest")
def get_latest_recommendations():
    all_recs = get_all_recommendations()
    latest = []
    for r in all_recs[:20]:
        ticker = match_ticker(r.get("hisse", ""))
        if ticker:
            r["ticker"] = ticker
            latest.append(r)
        if len(latest) >= 5:
            break
    return latest

@app.get("/api/recommendations/{ticker}")
def get_stock_recommendations(ticker: str):
    matched = []
    target_ticker = ticker.upper()
    for r in get_all_recommendations():
        mapped = match_ticker(r.get("hisse", ""))
        if mapped == target_ticker:
            matched.append(r)
    return matched

@app.get("/api/models")
def get_model_portfolios():
    return get_cached_models()

@app.get("/api/kurum-stats")
def get_kurum_stats():
    stats = {}
    data = get_cached_recommendations()
    for r in data:
        k = r.get("kurum", "Bilinmiyor")
        import re as _re
        k = _re.sub(r'\s+', ' ', k).strip()
        if k not in stats:
            stats[k] = {
                "count": 0, 
                "sum_potential": 0.0, 
                "sum_realized": 0.0, 
                "realized_count": 0,
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0}
            }
        stats[k]["count"] += 1
        
        pot_val = r.get("potansiyel", "0")
        if pot_val and pot_val != "Bilinmiyor":
            try:
                pot_num = float(str(pot_val).replace(',', '.').replace('%', ''))
                if pot_num <= 500:
                    stats[k]["sum_potential"] += pot_num
            except:
                pass
        
        pot_str = str(pot_val).upper()
        if "END" in pot_str and ("ÜZER" in pot_str or "UZER" in pot_str):
            stats[k]["ratings"]["AL"] += 1
        elif "END" in pot_str and "PARALEL" in pot_str:
            stats[k]["ratings"]["TUT"] += 1
        elif "END" in pot_str and "ALT" in pot_str:
            stats[k]["ratings"]["SAT"] += 1
        elif "AL" in pot_str:
            stats[k]["ratings"]["AL"] += 1
        elif "TUT" in pot_str:
            stats[k]["ratings"]["TUT"] += 1
        elif "SAT" in pot_str:
            stats[k]["ratings"]["SAT"] += 1
        else:
            stats[k]["ratings"]["OTHER"] += 1
            
        ticker = match_ticker(r.get("hisse", ""))
        mevcut = r.get("mevcutFiyat", "0")
        if ticker and mevcut and mevcut != "Bilinmiyor":
            p_data = cache["prices"].get(ticker, {})
            live_price = p_data.get("price", 0.0) if isinstance(p_data, dict) else 0.0
            try:
                mevcut_num = float(str(mevcut).replace(',', '.'))
                if live_price > 0 and mevcut_num > 0:
                    realized = ((live_price - mevcut_num) / mevcut_num) * 100
                    if -100 <= realized <= 500:
                        stats[k]["sum_realized"] += realized
                        stats[k]["realized_count"] += 1
            except:
                pass
    
    result = []
    for k, v in stats.items():
        avg = v["sum_potential"] / v["count"] if v["count"] > 0 else 0
        avg_realized = v["sum_realized"] / v["realized_count"] if v["realized_count"] > 0 else None
        
        result.append({
            "kurum": k, 
            "count": v["count"], 
            "avg_potential": avg,
            "avg_realized": avg_realized,
            "ratings": v["ratings"]
        })
    
    return sorted(result, key=lambda x: x["count"], reverse=True)

@app.get("/api/kurum/{kurumName}")
def get_kurum_detail(kurumName: str):
    matched = []
    data = get_cached_recommendations()
    for r in data:
        k = r.get("kurum", "")
        import re as _re
        k_normalized = _re.sub(r'\s+', '-', k.strip()).lower()
        if k_normalized == kurumName.lower():
            ticker = match_ticker(r.get("hisse", ""))
            r["ticker"] = ticker
            if ticker and ticker in cache["prices"]:
                p_data = cache["prices"][ticker]
                r["live_price"] = p_data.get("price") if isinstance(p_data, dict) else None
                r["live_change_pct"] = p_data.get("change_pct") if isinstance(p_data, dict) else None
            else:
                r["live_price"] = None
                r["live_change_pct"] = None
            matched.append(r)
    return matched

@app.get("/api/screener")
def get_screener_data():
    reports = get_cached_recommendations()

    grouped = {}
    for r in reports:
        ticker = match_ticker(r.get("hisse", ""))
        if not ticker:
            continue
        
        target = r.get("hedefFiyat")
        try:
            target_val = float(str(target).replace(',', '.'))
        except:
            continue
            
        if ticker not in grouped:
            grouped[ticker] = {
                "targets": [], 
                "count": 0, 
                "company": r.get("hisse", ""),
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0}
            }
            
        grouped[ticker]["targets"].append(target_val)
        grouped[ticker]["count"] += 1
        
        pot_str = str(r.get("potansiyel", "")).upper()
        if "END" in pot_str and ("ÜZER" in pot_str or "UZER" in pot_str):
            grouped[ticker]["ratings"]["AL"] += 1
        elif "END" in pot_str and "PARALEL" in pot_str:
            grouped[ticker]["ratings"]["TUT"] += 1
        elif "END" in pot_str and "ALT" in pot_str:
            grouped[ticker]["ratings"]["SAT"] += 1
        elif "AL" in pot_str:
            grouped[ticker]["ratings"]["AL"] += 1
        elif "TUT" in pot_str:
            grouped[ticker]["ratings"]["TUT"] += 1
        elif "SAT" in pot_str:
            grouped[ticker]["ratings"]["SAT"] += 1
        else:
            grouped[ticker]["ratings"]["OTHER"] += 1

    results = []
    for ticker, data in grouped.items():
        avg_target = sum(data["targets"]) / len(data["targets"])
        p_data = cache["prices"].get(ticker, {})
        live_price = p_data.get("price", 0.0) if isinstance(p_data, dict) else 0.0
        live_change_pct = p_data.get("change_pct", 0.0) if isinstance(p_data, dict) else 0.0
        
        if live_price and live_price > 0:
            upside = ((avg_target - live_price) / live_price) * 100
        else:
            upside = 0.0
            
        if upside > 500:
            continue
            
        results.append({
            "ticker": ticker,
            "company": data["company"],
            "avg_target": round(avg_target, 2),
            "current_price": live_price if live_price else "N/A",
            "live_change_pct": live_change_pct,
            "upside_potential": upside,
            "count": data["count"],
            "ratings": data["ratings"]
        })

    return sorted(results, key=lambda x: x["upside_potential"], reverse=True)

@app.get("/api/scraped-reports")
def get_scraped_reports(
    ticker: Optional[str] = Query(None, description="Filter by stock ticker (e.g. THYAO)"),
    broker: Optional[str] = Query(None, description="Filter by brokerage firm name"),
    rating: Optional[str] = Query(None, description="Filter by recommendation rating (AL, TUT, SAT)"),
    search: Optional[str] = Query(None, description="Free-text search in title, summary, catalysts"),
    min_upside: Optional[float] = Query(None, description="Minimum potential upside percentage"),
    limit: Optional[int] = Query(None, description="Limit max results returned"),
    offset: Optional[int] = Query(None, description="Offset for pagination")
):
    """Returns scraped research reports with query parameter filtering and pagination."""
    try:
        reports = report_repo.get_reports(
            ticker=ticker,
            broker=broker,
            rating=rating,
            search=search,
            min_upside=min_upside,
            limit=limit,
            offset=offset
        )
        for r in reports:
            r.pop("full_text", None)
        return reports
    except Exception as e:
        logger.error(f"Error fetching scraped reports: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch scraped reports: {str(e)}")

@app.get("/api/scraped-reports/stats")
def get_scraped_reports_stats():
    """Returns aggregated stats (total reports, broker counts, top recommendations)."""
    return report_repo.get_stats()

@app.get("/api/scraped-reports/stream-scrape")
def stream_scrape():
    import subprocess
    def iter_logs():
        yield "data: Starting synchronization...\n\n"
        script_path = os.path.join(base_dir, "run_all_scrapers.py")
        
        process = subprocess.Popen(
            [sys.executable, "-u", script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in process.stdout:
            yield f"data: {line.strip()}\n\n"
            
        process.wait()
        
        # Reload cache
        load_static_json_cache()
        try:
            report_repo.reload()
        except:
            pass
        
        yield "data: [DONE]\n\n"
        
    return StreamingResponse(iter_logs(), media_type="text/event-stream")

@app.post("/api/scraped-reports/trigger-scrape")
def trigger_scrape(
    background_tasks: BackgroundTasks,
    limit_per_broker: int = Query(5, description="Limit reports fetched per broker"),
    run_sync: bool = Query(False, description="Run synchronously if True")
):
    """Triggers background scraping run via run_scraper_network()."""
    if run_sync:
        _run_scrape_task(limit_per_broker=limit_per_broker)
        return {
            "status": "success",
            "message": f"Scrape network executed synchronously with limit={limit_per_broker}.",
            "report_count": len(report_repo.get_reports())
        }
    else:
        background_tasks.add_task(_run_scrape_task, limit_per_broker)
        return {
            "status": "success",
            "message": f"Scrape network task scheduled in background with limit={limit_per_broker}."
        }

@app.get("/api/stocks/{ticker}/fundamentals")
def get_stock_fundamentals(ticker: str):
    """Returns company info and fundamental indicators for a ticker."""
    info = report_repo.get_company_info(ticker)
    if not info:
        raise HTTPException(status_code=404, detail=f"Fundamentals for {ticker} not found in cache. Run yf_cacher.")
    return info

@app.get("/api/stocks/{ticker}/history")
def get_stock_history(ticker: str):
    """Returns 1-year historical prices for a ticker."""
    history = report_repo.get_historical_prices(ticker)
    if not history:
        raise HTTPException(status_code=404, detail=f"Historical prices for {ticker} not found in cache. Run yf_cacher.")
    return history

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8015)

@app.get("/api/scraped-reports/{id}")
def get_scraped_report_by_id(id: str):
    """Returns details of a single scraped report by ID."""
    report = report_repo.get_report_by_id(id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Scraped report with ID '{id}' not found.")
    return report

@app.get("/api/scraped-reports/{id}/pdf")
def get_scraped_report_pdf(id: str):
    """Serves the raw PDF file for a scraped report by ID."""
    report = report_repo.get_report_by_id(id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Scraped report with ID '{id}' not found.")
    
    pdf_path = report.get("pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        downloads_dir = os.path.join(base_dir, "scrapers", "downloads")
        file_hash = report.get("file_hash", "")
        if os.path.exists(downloads_dir):
            for fname in os.listdir(downloads_dir):
                if fname.endswith(".pdf") and (id in fname or (file_hash and file_hash[-12:] in fname)):
                    pdf_path = os.path.join(downloads_dir, fname)
                    break

    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"PDF file for report '{id}' not found on server.")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path)
    )

def _run_scrape_task(limit_per_broker: int = 5):
    import subprocess
    try:
        crawler_path = os.path.join(base_dir, "crawler_2026.py")
        if os.path.exists(crawler_path):
            subprocess.run([sys.executable, crawler_path], check=False)
            load_static_json_cache()

        run_scraper_network(limit_per_broker=limit_per_broker)
        report_repo.reload()
    except Exception as e:
        print(f"Error in background scrape task: {e}")

