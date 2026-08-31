import requests
from bs4 import BeautifulSoup
import json
import os
import hashlib

def get_model_portfolios():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    models = []
    # Fetch from multiple pages to find enough model portfolios
    for page in range(1, 4):
        url = f"https://www.hisseonerileri.com/page/{page}/" if page > 1 else "https://www.hisseonerileri.com/"
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            articles = soup.find_all('article')
            
            for article in articles:
                title_tag = article.find('h2', class_='entry-title')
                if not title_tag: continue
                
                title = title_tag.text.strip()
                if "model portf" not in title.lower():
                    continue
                
                link = title_tag.find('a')['href'] if title_tag.find('a') else ""
                
                date_tag = article.find('time', class_='published')
                date = date_tag.text.strip() if date_tag else "Bilinmeyen Tarih"
                
                img_tag = article.find('img')
                img_src = img_tag['src'] if img_tag else ""
                
                # Extract kurum (broker) from title
                kurum = "Bilinmiyor"
                for k in ["İş Yatırım", "Ak Yatırım", "Gedik Yatırım", "Ziraat Yatırım", "Garanti BBVA", "Deniz Yatırım", "Yapı Kredi Yatırım", "Vakıf Yatırım", "Halk Yatırım", "Oyak Yatırım"]:
                    if k.lower() in title.lower():
                        kurum = k
                        break
                
                if kurum == "Bilinmiyor":
                    kurum = title.split("Model Portföy")[0].strip() if "Model Portföy" in title else "Aracı Kurum"
                
                model_id = hashlib.md5(link.encode()).hexdigest()[:10]
                
                models.append({
                    "id": model_id,
                    "kurum": kurum,
                    "tarih": date,
                    "title": title,
                    "link": link,
                    "image": img_src
                })
                
                if len(models) >= 10:
                    return models
                    
        except Exception as e:
            print(f"Error fetching from {url}: {e}")
            
    return models

if __name__ == "__main__":
    data = get_model_portfolios()
    out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({"models": data}, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(data)} model portfolios to {out_path}")
