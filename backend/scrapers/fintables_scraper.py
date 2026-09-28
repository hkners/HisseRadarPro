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

# ---------------------------------------------------------------------------
# undetected_chromedriver Implementation
# ---------------------------------------------------------------------------
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

class FintablesScraper:
    def __init__(self):
        options = uc.ChromeOptions()
        # Keep window offscreen to not disturb the user
        options.add_argument('--window-position=-32000,-32000')
        # Version 153 to match the user's local Chrome
        self.driver = uc.Chrome(options=options, version_main=153)
        self.driver.set_page_load_timeout(30)

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass


def scrape_fintables_tickers(tickers):
    """
    Scrapes a list of tickers sequentially using undetected_chromedriver.
    Bypasses Cloudflare easily and uses minimal RAM (single tab).
    """
    reports = []
    
    scraper = FintablesScraper()
    driver = scraper.driver
    
    try:
        # 1) WARMUP: Bypass Cloudflare on THYAO
        print("[FintablesScraper] Warming up session with THYAO to solve Cloudflare...")
        driver.get("https://fintables.com/sirketler/THYAO/analist-tavsiyeleri")
        cf_solved = False
        for _ in range(12):
            title = driver.title.lower()
            if "moment" not in title and "dakika" not in title and len(title) > 5:
                cf_solved = True
                print("  Cloudflare bypassed!")
                break
            time.sleep(5)
            
        if not cf_solved:
            print("[FintablesScraper] ERROR: Could not bypass Cloudflare. Aborting.")
            return reports

        # 2) SCRAPE TICKERS
        for index, ticker in enumerate(tickers):
            url = f"https://fintables.com/sirketler/{ticker}/analist-tavsiyeleri"
            print(f"[{index+1}/{len(tickers)}] Scraping Fintables for {ticker}...")
            
            try:
                driver.get(url)
                
                # Polling to wait for React to populate the data (bypass skeleton)
                table_found = False
                for _ in range(10): # max 5 seconds
                    html = driver.page_source
                    if "</td>" in html and html.count("</td>") > 5:
                        table_found = True
                        break
                    time.sleep(0.5)

                if not table_found:
                    print(f"  [{ticker}] 0 reports found.")
                    continue
                
                time.sleep(0.5)
                html = driver.page_source
                soup = BeautifulSoup(html, 'html.parser')
                
                table = soup.find('table')
                if not table:
                    print(f"  [{ticker}] 0 reports found.")
                    continue
                    
                tbody = table.find('tbody')
                if not tbody:
                    continue
                    
                added_count = 0
                for tr in tbody.find_all('tr'):
                    tds = tr.find_all('td')
                    if len(tds) >= 8:
                        kurum = tds[1].text.strip()
                        oneri = tds[2].text.strip()
                        tarih_str = tds[3].text.strip()
                        hedef_str = tds[4].text.strip()
                        son_str = tds[5].text.strip()
                        pot_str = tds[6].text.strip()
                        is_model = bool(tds[7].find('svg')) or "evet" in tds[7].text.lower() or "var" in tds[7].text.lower()
                        
                        if not kurum or not tarih_str:
                            continue
                            
                        report_date = parse_turkish_date(tarih_str)
                        
                        # Sadece 2026 ve sonrası raporları al
                        if report_date and report_date < "2026-01-01":
                            continue
                            
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
                        added_count += 1
                        
                print(f"  [{ticker}] Scraped {added_count} reports.")
                        
            except Exception as e:
                print(f"  [{ticker}] Error scraping: {e}")
                
            # Jitter: wait randomly between 1 and 3 seconds before next request
            if index < len(tickers) - 1:
                time.sleep(random.uniform(1.0, 3.0))
                
    finally:
        scraper.close()
        
    return reports
