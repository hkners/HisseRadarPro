import os
import time
import requests
import concurrent.futures

base_dir = os.path.dirname(os.path.abspath(__file__))
bist_file = os.path.join(base_dir, "all_bist.txt")
logos_dir = os.path.join(base_dir, "logos")

os.makedirs(logos_dir, exist_ok=True)

with open(bist_file, "r", encoding="utf-8") as f:
    tickers = [line.strip() for line in f if line.strip()]

# Add XBANK and BIST30 specific tickers just in case they aren't in all_bist.txt
extra_tickers = ['AKBNK', 'GARAN', 'YKBNK', 'ISCTR', 'VAKBN', 'HALKB', 'TSKB', 'SKBNK', 'ALBRK', 'ICBCT', 'KLNMA', 'QNBFL', 'CIMSA', 'A1CAP']
for t in extra_tickers:
    if t not in tickers:
        tickers.append(t)

def download_logo(ticker):
    target_path = os.path.join(logos_dir, f"{ticker}.png")
    if os.path.exists(target_path):
        return ticker, "ALREADY_EXISTS"
        
    urls_to_try = [
        f"https://storage.fintables.com/media/uploads/company-logos/{ticker}.png",
        f"https://storage.fintables.com/media/uploads/company-logos/{ticker}_icon.png",
        f"https://storage.fintables.com/media/uploads/company-logos/{ticker.lower()}_icon.png",
        f"https://storage.fintables.com/media/uploads/company-logos/{ticker.lower()}.png"
    ]
    
    for url in urls_to_try:
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                with open(target_path, "wb") as f:
                    f.write(r.content)
                return ticker, "DOWNLOADED"
        except Exception:
            pass
            
    return ticker, "NOT_FOUND"

def main():
    print(f"Starting download for {len(tickers)} logos...")
    success_count = 0
    not_found = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_logo, t): t for t in tickers}
        for future in concurrent.futures.as_completed(futures):
            ticker, status = future.result()
            if status in ["DOWNLOADED", "ALREADY_EXISTS"]:
                success_count += 1
            else:
                not_found.append(ticker)
                
    print(f"Finished! Successfully saved {success_count}/{len(tickers)} logos.")
    print(f"Missing logos: {len(not_found)} -> {', '.join(not_found[:20])}...")

if __name__ == "__main__":
    main()
