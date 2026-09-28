import json
import datetime
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor
import os

base_dir = os.path.dirname(os.path.abspath(__file__))

def main():
    print("Loading all BIST tickers...")
    with open(os.path.join(base_dir, "all_bist.txt"), "r", encoding="utf-8") as f:
        tickers = [line.strip() for line in f if line.strip()]

    print("Loading scraped_reports.json...")
    with open(os.path.join(base_dir, "scraped_reports.json"), "r", encoding="utf-8") as f:
        reports = json.load(f)

    one_year_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=365)
    
    # We only care about tickers that have active reports
    report_tickers = list(set(r["ticker"] for r in reports if not r.get("is_stale_due_to_split")))
    
    print(f"Checking splits for {len(report_tickers)} tickers with active reports...")
    
    splits_data = {}
    
    def fetch_split(ticker):
        try:
            t = yf.Ticker(f"{ticker}.IS")
            splits = t.splits
            recent_splits = splits[splits.index >= one_year_ago]
            if not recent_splits.empty:
                return ticker, recent_splits
        except Exception as e:
            pass
        return ticker, None

    with ThreadPoolExecutor(max_workers=10) as executor:
        for ticker, recent_splits in executor.map(fetch_split, report_tickers):
            if recent_splits is not None and not recent_splits.empty:
                splits_data[ticker] = recent_splits
                print(f"[{ticker}] Found splits: {list(recent_splits.index.strftime('%Y-%m-%d'))}")

    modified = False
    flagged_count = 0
    
    for report in reports:
        ticker = report.get("ticker")
        if ticker in splits_data:
            report_date_str = report.get("report_date")
            if not report_date_str:
                continue
                
            try:
                # Some report dates might be YYYY-MM-DD
                r_date = datetime.datetime.strptime(report_date_str, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
                
                # Check if there is any split AFTER the report date
                recent_splits = splits_data[ticker]
                splits_after_report = recent_splits[recent_splits.index > r_date]
                
                if not splits_after_report.empty:
                    # Flag this report
                    if not report.get("is_stale_due_to_split"):
                        report["is_stale_due_to_split"] = True
                        report["split_info"] = str(list(splits_after_report.index.strftime('%Y-%m-%d')))
                        print(f"FLAGGED: {ticker} report from {report_date_str} (Target: {report.get('target_price')}) due to split after report.")
                        modified = True
                        flagged_count += 1
            except Exception as e:
                print(f"Error parsing date for {ticker} report: {e}")
                
    if modified:
        with open(os.path.join(base_dir, "scraped_reports.json"), "w", encoding="utf-8") as f:
            json.dump(reports, f, ensure_ascii=False, indent=2)
            
        import sqlite3
        try:
            conn = sqlite3.connect(os.path.join(base_dir, "scraped_reports.db"))
            c = conn.cursor()
            for r in reports:
                if r.get("is_stale_due_to_split"):
                    # Update DB flag
                    c.execute("UPDATE scraped_reports SET is_stale_due_to_split = 1 WHERE ticker = ? AND report_date = ? AND target_price = ?", 
                              (r.get("ticker"), r.get("report_date"), r.get("target_price")))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error updating SQLite DB: {e}")
            
        print(f"\nSuccessfully flagged {flagged_count} reports and saved to backend/scraped_reports.json and DB.")
    else:
        print(f"\nNo reports needed to be flagged. (Flagged: 0)")

if __name__ == "__main__":
    main()
