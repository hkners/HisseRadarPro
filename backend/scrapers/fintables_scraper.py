import time
import random
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from playwright_stealth.stealth import Stealth
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

_PRICE_CACHE = {}

def get_historical_close(ticker, date_str):
    cache_key = f"{ticker}_{date_str}"
    if cache_key in _PRICE_CACHE:
        return _PRICE_CACHE[cache_key]
        
    try:
        start_date = datetime.strptime(date_str, "%Y-%m-%d")
        end_date = start_date + timedelta(days=7) # Look ahead to find first trading day
        data = yf.download(f"{ticker}.IS", start=start_date.strftime("%Y-%m-%d"), end=end_date.strftime("%Y-%m-%d"), progress=False)
        if not data.empty:
            close_prices = data['Close']
            if isinstance(close_prices, pd.DataFrame):
                 price = float(close_prices.iloc[0, 0])
            else:
                 price = float(close_prices.iloc[0])
            if pd.isna(price): price = 0.0
            _PRICE_CACHE[cache_key] = price
            return price
    except Exception as e:
        print(f"Error fetching historical price for {ticker} on {date_str}: {e}")
    
    _PRICE_CACHE[cache_key] = 0.0
    return 0.0

TR_MONTHS = {
    "Ocak": "01", "Şubat": "02", "Mart": "03", "Nisan": "04",
    "Mayıs": "05", "Haziran": "06", "Temmuz": "07", "Ağustos": "08",
    "Eylül": "09", "Ekim": "10", "Kasım": "11", "Aralık": "12"
}

def parse_turkish_date(date_str):
    # e.g., "20 Ağustos 2026" -> "2026-08-20"
    parts = date_str.split()
    if len(parts) == 3:
        day = parts[0].zfill(2)
        month = TR_MONTHS.get(parts[1], "01")
        year = parts[2]
        return f"{year}-{month}-{day}"
    return date_str

def parse_fintables_number(num_str):
    # e.g., "G28,54", "59,00", "%106,73", "-"
    if not num_str or num_str.strip() == "-" or num_str.strip() == "":
        return 0.0
    
    num_str = num_str.replace("G", "").replace("%", "").strip()
    # Fintables uses comma for decimals. 
    # Just in case, replace dot if used as thousands separator
    if "," in num_str and "." in num_str:
        num_str = num_str.replace(".", "")
    num_str = num_str.replace(",", ".")
    try:
        return float(num_str)
    except ValueError:
        return 0.0

class FintablesScraper:
    def __init__(self):
        self.playwright = sync_playwright().start()
        
        # Use stealth to bypass Cloudflare
        self.browser = self.playwright.chromium.launch(headless=True)
        self.context = self.browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        self.page = self.context.new_page()
        # Apply Stealth to the sync page directly using the older version approach or the new Stealth().use_sync context
        # Since we initialized the browser manually, we can just apply stealth to the context or page if supported.
        # However, earlier we found Stealth().use_sync() works better for wrapping. 
        pass

    def close(self):
        self.browser.close()
        self.playwright.stop()

def scrape_fintables_tickers(tickers):
    """
    Scrapes a list of tickers using a single browser instance with stealth.
    Introduces jitter (random delays) to avoid rate limits.
    """
    reports = []
    
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()
        
        for index, ticker in enumerate(tickers):
            url = f"https://fintables.com/sirketler/{ticker}/analist-tavsiyeleri"
            print(f"[{index+1}/{len(tickers)}] Scraping Fintables for {ticker}...")
            
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                # Wait for potential cloudflare challenge or table load
                try:
                    page.wait_for_selector('table', timeout=8000)
                except Exception:
                    pass
                page.wait_for_timeout(random.randint(1000, 2000))
                
                html = page.content()
                soup = BeautifulSoup(html, 'html.parser')
                
                table = soup.find('table')
                if not table:
                    print(f"No table found for {ticker}")
                    continue
                    
                tbody = table.find('tbody')
                if not tbody:
                    continue
                    
                for tr in tbody.find_all('tr'):
                    tds = tr.find_all('td')
                    if len(tds) >= 8:
                        # 0: #
                        # 1: Kurum
                        # 2: Öneri
                        # 3: Güncellenme Tarihi
                        # 4: Hedef Fiyat
                        # 5: Son Fiyat
                        # 6: Potansiyel
                        # 7: Model Portföy
                        
                        kurum = tds[1].text.strip()
                        oneri = tds[2].text.strip()
                        tarih_str = tds[3].text.strip()
                        hedef_str = tds[4].text.strip()
                        son_str = tds[5].text.strip()
                        pot_str = tds[6].text.strip()
                        is_model = bool(tds[7].find('svg')) or "evet" in tds[7].text.lower() or "var" in tds[7].text.lower()
                        
                        # Sometimes rows might be placeholders or empty
                        if not kurum or not tarih_str:
                            continue
                            
                        # Parse values
                        report_date = parse_turkish_date(tarih_str)
                        target_price = parse_fintables_number(hedef_str)
                        if report_date and target_price > 0:
                            hist_price = get_historical_close(ticker, report_date)
                            if hist_price > 0:
                                current_price = round(hist_price, 2)
                                potansiyel = round(((target_price - current_price) / current_price) * 100, 2)
                            else:
                                current_price = parse_fintables_number(son_str)
                                potansiyel = parse_fintables_number(pot_str)
                        else:
                            current_price = parse_fintables_number(son_str)
                            potansiyel = parse_fintables_number(pot_str)
                        
                        report = {
                            "ticker": ticker,
                            "broker": kurum,
                            "recommendation": oneri,
                            "target_price": target_price,
                            "current_price": current_price,
                            "potansiyel": potansiyel,
                            "report_date": report_date,
                            "is_model": is_model,
                            "source": "Fintables"
                        }
                        reports.append(report)
                        
            except Exception as e:
                print(f"Error scraping {ticker}: {e}")
                
            # Jitter: wait randomly between 2 and 5 seconds before next request
            # to avoid IP block.
            if index < len(tickers) - 1:
                delay = random.uniform(2.0, 5.0)
                time.sleep(delay)
                
        browser.close()
        
    return reports
