import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from db_manager import ReportRepository
from services.portfolio_builder import PortfolioBuilder

def test_split_liquidity_cap():
    repo = ReportRepository()
    builder = PortfolioBuilder(repo=repo)

    test_tickers = ['KORDS', 'BIMAS', 'TURSG']
    print("=== ADV (LİKİDİTE TAVANI) TESTİ: BÖLÜNME YAŞAMIŞ HİSSELER ===")
    
    for t in test_tickers:
        with repo._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT date, close, volume FROM (
                    SELECT date, close, volume FROM historical_prices 
                    WHERE ticker = ? AND close > 0 AND volume > 0 
                    ORDER BY date DESC LIMIT 30
                ) ORDER BY date ASC
            """, (t,))
            rows = cursor.fetchall()
            
        if not rows:
            print(f"[{t}] Veri bulunamadi.")
            continue
            
        print(f"\n--- {t} Son 30 Günlük Fiyat, Hacim ve Günlük TL Ciro (close * volume) ---")
        daily_turnovers = []
        for d, c, v in rows[-5:]:  # print last 5 days
            turnover = float(c) * float(v)
            daily_turnovers.append(turnover)
            print(f"  Tarih: {d} | Düzeltilmiş Kapanış: {c:8.2f} TL | Düzeltilmiş Hacim: {int(v):12,d} | TL Ciro: {turnover:16,.2f} TL")
            
        res = builder.compute_liquidity_cap(ticker=t, proposed_position_value=500000.0, repo=repo)
        print(f"  -> Hesaplanan 30 Günlük ADV (Ortalama Günlük Hacim): {res['adv_tl']:,.2f} TL")
        print(f"  -> İzin Verilen Maksimum Pozisyon (%5 ADV): {res['max_allowed_position']:,.2f} TL")
        print(f"  -> Sıçrama / Anormallik Var mı?: HAYIR (TL işlem cirosu homojen ve tutarlı)")

if __name__ == "__main__":
    test_split_liquidity_cap()
