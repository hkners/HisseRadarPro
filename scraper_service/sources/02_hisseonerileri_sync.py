import requests
from bs4 import BeautifulSoup
import re
import os
import sys
import time

# Add parent directory to path so we can import client
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from client import BackendClient

# Ensure backend directory is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

base_url = "https://www.hisseonerileri.com/raporlar/ozel-hisse-onerileri/page/{}/"

data = []

# Title example: "Aksigorta Hisse Önerisi / Pusula Yatırım – (31.07.2026)"
title_pattern = re.compile(r'^(.*?)\s+(?:Hisse.*?/|/)\s*(.*?)\s*[–-]\s*\((.*?)\)', re.IGNORECASE)
title_pattern_alt = re.compile(r'^(.*?)\s+(?:Hisse.*?/|/)\s*(.*)', re.IGNORECASE)

client = BackendClient()

# Note: We skip differential caching here since we removed local tavsiyeler.json.
# The backend DB will handle ON CONFLICT(id) deduplication for us, 
# but to avoid spamming the site, we could ask the backend for latest scraped links.
# For now, we scrape and push, and DB handles duplicates.
cached_links = {}

print(">>> Starting hisseonerileri.com scraping...")
reached_cache = False
for page in range(1, 61):  # Increased to 60 pages for deep history
    if reached_cache:
        break
    print(f">>> Scraping hisseonerileri.com page {page}...")
    url = base_url.format(page) if page > 1 else "https://www.hisseonerileri.com/raporlar/ozel-hisse-onerileri/"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
    except Exception as e:
        print(f">>> Timeout/Error fetching page {page}: {e}")
        break
    if response.status_code != 200:
        print(f">>> Failed to fetch page {page}. Status: {response.status_code}")
        break
        
    soup = BeautifulSoup(response.text, 'html.parser')
    articles = soup.find_all('article')
    
    if not articles:
        print(">>> No articles found, stopping pagination.")
        break
        
    for article in articles:
        title_elem = article.find('h2') or article.find('h3')
        if not title_elem:
            title_elem = article.find('a')
            
        if not title_elem:
            continue
            
        title = title_elem.text.strip()
        link_elem = article.find('a')
        if not link_elem:
            continue
        link = link_elem['href']
        
        tarih = ""
        hisse = ""
        araci_kurum = ""
        
        match = title_pattern.search(title)
        if match:
            hisse = match.group(1).strip()
            araci_kurum = match.group(2).strip()
            tarih = match.group(3).strip()
        else:
            match_alt = title_pattern_alt.search(title)
            if match_alt:
                hisse = match_alt.group(1).strip()
                araci_kurum = match_alt.group(2).strip()
            
            time_elem = article.find('time') or article.find(class_='date')
            if time_elem:
                tarih = time_elem.text.strip()
        
        # fallback if regex didn't extract date properly
        if not tarih:
            date_match = re.search(r'\((.*?)\)', title)
            if date_match:
                tarih = date_match.group(1)
                
        # Normalize date to YYYY-MM-DD
        if tarih:
            tarih = tarih.strip()
            date_fmt_match = re.match(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})$", tarih)
            if date_fmt_match:
                d = int(date_fmt_match.group(1))
                m = int(date_fmt_match.group(2))
                y = int(date_fmt_match.group(3))
                tarih = f"{y:04d}-{m:02d}-{d:02d}"

        if link in cached_links:
            print(f">>> Reached already cached article: {title}. Early exiting!")
            reached_cache = True
            break
            
        print(f">>> Fetching NEW article: {title}")
        try:
            inner_resp = requests.get(link, headers=headers, timeout=10)
            inner_soup = BeautifulSoup(inner_resp.text, 'html.parser')
            content_div = inner_soup.find('div', class_='entry-content') or inner_soup.find('article')
            potansiyel = "N/A"
            hedefFiyat = "N/A"
            mevcutFiyat = "N/A"
            tavsiye = "AL"
            
            if content_div:
                content_text = content_div.text
                
                # Match "Potansiyel: %63,8" or "Getiri Potansiyeli %63.8"
                potansiyel_match = re.search(r'(?:Potansiyel(?:i)?|Getiri\s*Potansiyel(?:i)?)\s*[:\-]?\s*(?:%|yüzde)?\s*([0-9]+(?:[.,][0-9]+)?)', content_text, re.IGNORECASE)
                if potansiyel_match:
                    potansiyel = potansiyel_match.group(1)
                    if not potansiyel.startswith('%'):
                        potansiyel = '%' + potansiyel
                
                # Match "Hedef Fiyat: 108.10 TL"
                hedef_match = re.search(r'(?:Hedef\s*Fiyat(?:ı|ımız)?|Hedef)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:TL|₺)', content_text, re.IGNORECASE)
                if hedef_match:
                    hedefFiyat = hedef_match.group(1)
                    
                # Match "Mevcut Fiyat: 66.00 TL" or "Kapanış: 66.00 TL"
                # Make sure it's followed by TL/₺ so we don't grab percentages or dates
                mevcut_match = re.search(r'(?:Mevcut\s*Fiyat|Kapanış\s*(?:Fiyatı)?|Son\s*Fiyat|Fiyat)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:TL|₺)', content_text, re.IGNORECASE)
                if mevcut_match:
                    # Ignore if the match is exactly the same as target price (often "Fiyat" matches "Hedef Fiyat")
                    if mevcut_match.group(1) != hedefFiyat:
                        mevcutFiyat = mevcut_match.group(1)
                    
            if not araci_kurum:
                print(f">>> Skipping article (No brokerage found): {title}")
                continue

            def parse_float(val):
                if not val or val in ['N/A', 'None']: return 0.0
                if isinstance(val, (int, float)): return float(val)
                import re
                clean = re.sub(r"[^\d.,-]", "", str(val))
                if not clean: return 0.0
                if "." in clean and "," in clean: clean = clean.replace(".", "").replace(",", ".")
                elif "," in clean and "." not in clean: clean = clean.replace(",", ".")
                try: return float(clean)
                except: return 0.0
                
            import uuid
            data.append({
                'id': f"web_{uuid.uuid5(uuid.NAMESPACE_URL, link)}",
                'ticker': hisse if hisse else title,
                'broker': araci_kurum,
                'rating': tavsiye,
                'target_price': parse_float(hedefFiyat),
                'current_price': parse_float(mevcutFiyat),
                'potansiyel': parse_float(potansiyel),
                'report_date': tarih,
                'report_title': title,
                'pdf_url': link,
                'summary': "Web'den kazınmış hisse önerisi",
                'full_text': content_text.strip() if content_div else "Metin bulunamadı.",
                'file_hash': f"web:{link}"
            })
            
            # Flush every 10 articles to avoid memory buildup and show progress
            if len(data) >= 10:
                client.push_reports_bulk(data)
                data = []
                
        except Exception as e:
            print(f">>> Error parsing inner page {link}: {e}")
        
        time.sleep(0.5)

    time.sleep(1)

# Push remaining data
if data:
    client.push_reports_bulk(data)
    
print(">>> Finished hisseonerileri.com scraping.")
