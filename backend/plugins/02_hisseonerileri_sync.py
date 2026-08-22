import requests
from bs4 import BeautifulSoup
import re
import os
import sys
import json
import time

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

out_path = os.path.join(backend_dir, "tavsiyeler.json")
cached_links = {}
if os.path.exists(out_path):
    try:
        with open(out_path, "r", encoding="utf-8") as f:
            old_data = json.load(f)
            for item in old_data:
                if 'link' in item:
                    cached_links[item['link']] = item
        print(f">>> Loaded {len(cached_links)} cached records for differential scraping.")
    except Exception as e:
        print(f">>> Failed to load cache: {e}")

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
                potansiyel_match = re.search(r'Potansiyel\s*(?:Getiri)?\s*[:\-]?\s*(%?[0-9,.]+)', content_text, re.IGNORECASE)
                if potansiyel_match:
                    potansiyel = potansiyel_match.group(1)
                    if not potansiyel.startswith('%'):
                        potansiyel = '%' + potansiyel
                
                hedef_match = re.search(r'Hedef\s*(?:Fiyat|Fiyatı|Değer)?\s*[:\-]?\s*([0-9,.]+)\s*(?:TL|₺)?', content_text, re.IGNORECASE)
                if hedef_match:
                    hedefFiyat = hedef_match.group(1)
                    
                mevcut_match = re.search(r'(?:Mevcut\s*Fiyat|Kapanış\s*Fiyatı|Fiyat\s*\(TL/hisse\)|Fiyat\s*\(TL\)|Kapanış|Son\s*Fiyat)\s*[:\-]?\s*([0-9,.]+)', content_text, re.IGNORECASE)
                if mevcut_match:
                    mevcutFiyat = mevcut_match.group(1)
                    
            if not araci_kurum:
                print(f">>> Skipping article (No brokerage found): {title}")
                continue

            data.append({
                'hisse': hisse if hisse else title,
                'kurum': araci_kurum,
                'tarih': tarih,
                'potansiyel': potansiyel,
                'hedefFiyat': hedefFiyat,
                'mevcutFiyat': mevcutFiyat,
                'tavsiye': tavsiye,
                'oneri': tavsiye,
                'link': link,
                'metin': content_text.strip() if content_div else "Metin bulunamadı."
            })
        except Exception as e:
            print(f">>> Error parsing inner page {link}: {e}")
        
        time.sleep(0.5)

    time.sleep(1)

# Combine new data with old cached data
for old_link, old_record in cached_links.items():
    if not any(d['link'] == old_link for d in data):
        data.append(old_record)

out_path = os.path.join(backend_dir, "tavsiyeler.json")
try:
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f">>> Saved {len(data)} records to {out_path}")
except Exception as e:
    print(f">>> Error saving to {out_path}: {e}")
