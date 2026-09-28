"""
HisseRadarPro — Seed Script for Backtest Verification
=====================================================
Generates at least 60+ days of realistic mock score_history snapshots
and ensures matching historical_prices are populated so that decile analysis
can be tested end-to-end immediately.

Usage:
    python scripts/seed_backtest_data.py
"""

import datetime
import math
import os
import random
import sys

# Ensure backend directory is in python path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from db_manager import ReportRepository
from services.backtest_service import compute_decile_analysis, format_decile_table


def seed_data(days_count: int = 75, num_tickers: int = 50, negative_control: bool = False):
    print("=" * 80)
    mode_str = "NEGATİF KONTROL (SAF RASTGELE / SIFIR KORELASYON)" if negative_control else "SENTETİK SİNYAL (KORELE)"
    print(f"HisseRadarPro — Backtest Veri Üretici (Seed Script) [{mode_str}]")
    print(f"Hedef: {days_count} Günlük Snapshot x {num_tickers} Hisse")
    print("=" * 80)

    # Use backend database
    db_path = os.path.join(backend_dir, "scraped_reports.db")
    repo = ReportRepository(db_path=db_path)

    # Pick benchmark & liquid BIST tickers
    sample_tickers = [
        "THYAO", "GARAN", "AKBNK", "EREGL", "ASELS", "BIMAS", "KCHOL", "SAHOL",
        "TUPRS", "SISE", "FROTO", "TOASO", "YKBNK", "ISCTR", "ENKAI", "PETKM",
        "TCELL", "PGSUS", "ARCLK", "KOZAL", "VESTL", "HEKTS", "SASA", "GUBRF",
        "DOHOL", "SOKM", "MGROS", "MAVI", "TTKOM", "CIMSA", "ALARK", "OYAKC",
        "EKGYO", "KOZAA", "IPEKE", "TKFEN", "ISGYO", "AEFES", "AGHOL", "BRSAN",
        "KORDS", "KARTN", "OTKAR", "ULKER", "BERA", "TURSG", "ANSGR", "KONTR",
        "EUPWR", "ASTOR"
    ][:num_tickers]

    # Date range: start from 200 days ago to 80 days ago (so forward_days=30, 60, 90 have real historical prices)
    today = datetime.date(2026, 9, 25)
    start_date = today - datetime.timedelta(days=220)

    # Generate weekdays (trading days)
    trading_dates = []
    curr = start_date
    while len(trading_dates) < days_count:
        if curr.weekday() < 5:  # Monday to Friday
            trading_dates.append(curr.strftime("%Y-%m-%d"))
        curr += datetime.timedelta(days=1)

    print(f"Tarih Aralığı: {trading_dates[0]} -> {trading_dates[-1]} ({len(trading_dates)} işlem günü)")

    # Each ticker gets a latent quality/momentum profile
    ticker_profiles = {}
    random.seed(42)
    for t in sample_tickers:
        quality = random.uniform(30.0, 85.0)  # Core baseline conviction
        alpha_base = quality * random.uniform(0.9, 1.1)
        ticker_profiles[t] = {
            "quality": quality,
            "alpha_base": max(20.0, min(95.0, alpha_base)),
            "momentum_bias": random.uniform(-0.8, 0.8)
        }

    # Fetch existing prices to establish base or generate consistent price paths
    price_records_to_insert = []
    score_records_to_insert = []

    # Check if historical_prices has data for these tickers
    for t in sample_tickers:
        existing = repo.get_historical_prices(t, limit=10)
        has_prices = len(existing) > 0

        # If ticker has no prices in DB, generate synthetic realistic Brownian motion prices
        if not has_prices:
            p = random.uniform(20.0, 300.0)
            p_date = start_date
            while p_date <= today:
                if p_date.weekday() < 5:
                    d_str = p_date.strftime("%Y-%m-%d")
                    ret = random.gauss(0.0008, 0.02)
                    p = max(1.0, p * (1.0 + ret))
                    hi = p * (1.0 + abs(random.gauss(0, 0.01)))
                    lo = p * (1.0 - abs(random.gauss(0, 0.01)))
                    vol = int(random.uniform(500000, 20000000))
                    price_records_to_insert.append((t, d_str, p, hi, lo, p, vol))
                p_date += datetime.timedelta(days=1)

    if price_records_to_insert:
        print(f"Eksik hisseler için {len(price_records_to_insert)} adet sentetik fiyat verisi ekleniyor...")
        repo.upsert_historical_prices(price_records_to_insert)

    # Now generate score_history for all trading dates
    print("score_history snapshotları üretiliyor...")
    now_ts = datetime.datetime.now().isoformat()

    from services.backtest_service import _get_price_series_map, compute_forward_returns
    price_map = _get_price_series_map(repo)

    for d_idx, d_str in enumerate(trading_dates):
        for t in sample_tickers:
            if negative_control:
                # NEGATİF KONTROL: İleriye dönük getiriden (fwd_val) tamamen bağımsız saf rastgele dağılım
                conviction = round(random.uniform(10.0, 95.0), 1)
                alpha_score = round(random.uniform(10.0, 95.0), 1)
                tech_comp = round(random.uniform(0.0, 20.0), 1)
                fund_comp = round(random.uniform(0.0, 32.0), 1)
                sent_comp = round(random.uniform(10.0, 90.0), 1)
                cons_comp = round(random.uniform(0.0, 26.0), 1)
                rev_mom = round(random.uniform(-1.0, 1.0), 2)
                mom_pct = round(random.uniform(3.0, 98.0), 1)
            else:
                # Measure actual forward return from this snapshot date
                fwd_90 = compute_forward_returns(t, d_str, 90, repo, price_series_map=price_map)
                fwd_val = fwd_90 if fwd_90 is not None else 0.0

                # Predictor with realistic statistical alpha (correlation ~0.35 + idiosyncratic noise)
                conv_signal = 52.0 + (fwd_val * 1.35) + random.gauss(0, 9.0)
                conviction = max(10.0, min(95.0, round(conv_signal, 1)))

                alpha_signal = 50.0 + (fwd_val * 1.15) + random.gauss(0, 10.0)
                alpha_score = max(10.0, min(95.0, round(alpha_signal, 1)))

                # Sub-components
                tech_comp = max(0.0, min(20.0, round(conviction * 0.20 + random.gauss(0, 1.5), 1)))
                fund_comp = max(0.0, min(32.0, round(conviction * 0.32 + random.gauss(0, 2.0), 1)))
                sent_comp = max(10.0, min(90.0, round(alpha_score * 0.75 + random.gauss(0, 3.0), 1)))
                cons_comp = max(0.0, min(26.0, round(conviction * 0.26 + random.gauss(0, 1.5), 1)))

                # Revision momentum (-1.0 to +1.0)
                rev_signal = (fwd_val / 35.0) + random.gauss(0, 0.3)
                rev_mom = max(-1.0, min(1.0, round(rev_signal, 2)))

                # Price momentum percentile (0.0 to 100.0)
                mom_signal = 50.0 + (fwd_val * 1.5) + random.gauss(0, 10.0)
                mom_pct = max(3.0, min(98.0, round(mom_signal, 1)))

            score_records_to_insert.append({
                "ticker": t,
                "snapshot_date": d_str,
                "conviction_score": conviction,
                "alpha_score": alpha_score,
                "technical_component": tech_comp,
                "fundamental_component": fund_comp,
                "sentiment_component": sent_comp,
                "consensus_component": cons_comp,
                "revision_momentum": rev_mom,
                "price_momentum_percentile": mom_pct,
                "created_at": now_ts
            })

    # Batch upsert to score_history
    print(f"Toplam {len(score_records_to_insert)} adet snapshot veritabanına yazılıyor...")
    saved_cnt = repo.upsert_score_history(score_records_to_insert)
    print(f"Başarıyla {saved_cnt} snapshot kaydedildi.")

    # Run decile analysis validation immediately
    print("\n" + "=" * 80)
    print("DOĞRULAMA TESTİ: 90 Günlük Conviction Score Decile Analizi")
    print("=" * 80)
    res_conv = compute_decile_analysis(
        metric_column="conviction_score",
        forward_days=90,
        report_repo=repo
    )
    print(format_decile_table(res_conv))

    print("\n" + "=" * 80)
    print("DOĞRULAMA TESTİ: 90 Günlük Price Momentum Percentile Decile Analizi")
    print("=" * 80)
    res_mom = compute_decile_analysis(
        metric_column="price_momentum_percentile",
        forward_days=90,
        report_repo=repo
    )
    print(format_decile_table(res_mom))

    print("\n" + "=" * 80)
    print("DOĞRULAMA TESTİ: 90 Günlük Revision Momentum Decile Analizi")
    print("=" * 80)
    res_rev = compute_decile_analysis(
        metric_column="revision_momentum",
        forward_days=90,
        report_repo=repo
    )
    print(format_decile_table(res_rev))

    print("\n[OK] Seed işlemi ve uçtan uca decile analizi başarıyla tamamlandı!")


if __name__ == "__main__":
    is_neg = "--negative-control" in sys.argv
    seed_data(days_count=75, num_tickers=50, negative_control=is_neg)
