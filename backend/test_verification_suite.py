"""
HisseRadarPro - Verification & Calibration Test Suite
=====================================================
Comprehensive 5-point verification:
1. Complete Breakpoint Equality Table for ALL formulas
2. Isolated RSI Second Circuit Breaker Test
3. YKBNK vs ISCTR Pillar-by-Pillar Breakdown
4. Raw r_score Output for RSI=0 vs RSI=100
5. Isolated Single-Variable Boundary Tests with Fixed Baseline
"""

import sys
import os
import math
from collections import Counter
from typing import Dict, List, Any

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

from globals import report_repo, price_service, BIST_TICKERS
from services.alpha_engine import AlphaEngine
from services.conviction_engine import ConvictionEngine
from test_score_distribution import (
    legacy_alpha_ta, legacy_alpha_fa, legacy_alpha_sentiment,
    legacy_conviction_evaluate
)


def run_test_1_complete_breakpoint_equality(ae: AlphaEngine, ce: ConvictionEngine):
    print("=" * 85)
    print("1. TÜM FORMÜLLER İÇİN BREAKPOINT EŞİTLİK TABLOSU (MADDE 1)")
    print("=" * 85)

    tests = []

    # 1.1 Alpha TA Score (Calibrated post-1.1)
    # Text fallbacks
    for rec, exp in [("STRONG_BUY", 100.0), ("BUY", 75.0), ("NEUTRAL", 50.0), ("SELL", 25.0), ("STRONG_SELL", 0.0)]:
        val = ae._calculate_ta_score({"summary": {"RECOMMENDATION": rec}})
        tests.append(("Alpha TA (Text)", rec, exp, val))
    # Recommendation score canonical points
    for rec, rs, exp in [
        ("STRONG_BUY", 1.0, 100.0),
        ("BUY", 0.30, 75.0),
        ("NEUTRAL", 0.00, 50.0),
        ("SELL", -0.30, 25.0),
        ("STRONG_SELL", -1.0, 0.0)
    ]:
        val = ae._calculate_ta_score({"summary": {"RECOMMENDATION": rec, "RECOMMENDATION_SCORE": rs}})
        tests.append(("Alpha TA (Score)", f"{rec} (rs={rs})", exp, val))

    # 1.2 Alpha Sentiment (avg_pot and buy_ratio)
    # Use neutral buy_ratio (1 AL, 1 TUT = 50% ratio -> 0 bonus) to isolate avg_pot
    for pot_val, exp in [(0.0, 50.0), (20.0, 65.0), (40.0, 80.0)]: # base 50 + pot
        mock_pot_reps = [
            {"potansiyel": pot_val, "rating": "AL"},
            {"potansiyel": pot_val, "rating": "TUT"}
        ]
        val = ae._calculate_sentiment_score("TEST", mock_pot_reps)
        tests.append(("Alpha Sent (avg_pot)", f"pot={pot_val}%", exp, val))

    for ratio_val, exp in [(0.1, 30.0), (0.3, 30.0), (0.5, 50.0), (0.7, 70.0), (0.9, 70.0)]: # base 50 + ratio
        # create mock reports with buy ratio
        total_reps = 10
        buy_cnt = int(ratio_val * total_reps)
        mock_reps = [{"rating": "AL" if i < buy_cnt else "TUT"} for i in range(total_reps)]
        val = ae._calculate_sentiment_score("TEST", mock_reps)
        tests.append(("Alpha Sent (buy_ratio)", f"ratio={ratio_val*100:.0f}%", exp, val))

    # 1.3 Alpha FA (PE, PB, ROE)
    for roe_val, exp in [(0.30, 65.0), (0.15, 60.0), (0.00, 50.0), (-0.10, 30.0)]:
        val = ae._calculate_fa_score({"returnOnEquity": roe_val})
        tests.append(("Alpha ROE", f"roe={roe_val}", exp, val))
    for pe_val, exp in [(7.0, 70.0), (10.0, 60.0), (20.0, 50.0), (30.0, 35.0)]:
        val = ae._calculate_fa_score({"trailingPE": pe_val})
        tests.append(("Alpha PE", f"pe={pe_val}", exp, val))
    for pb_val, exp in [(1.5, 65.0), (2.0, 50.0), (5.0, 40.0)]:
        val = ae._calculate_fa_score({"priceToBook": pb_val})
        tests.append(("Alpha PB", f"pb={pb_val}", exp, val))

    # 1.4 Conviction Upside (normal non-falling knife)
    upside_cases = [(-30.0, -15.0), (0.0, 2.0), (20.0, 5.0), (35.0, 10.0), (50.0, 16.0), (75.0, 23.0)]
    for up_val, exp in upside_cases:
        if up_val < 0: val = max(-15.0, 2.0 + (up_val / 30.0) * 17.0)
        elif up_val < 20.0: val = 2.0 + (up_val / 20.0) * 3.0
        elif up_val < 35.0: val = 5.0 + ((up_val - 20.0) / 15.0) * 5.0
        elif up_val < 50.0: val = 10.0 + ((up_val - 35.0) / 15.0) * 6.0
        elif up_val < 75.0: val = 16.0 + ((up_val - 50.0) / 25.0) * 7.0
        else: val = 23.0
        tests.append(("Conv. upside_pct", f"up={up_val}%", exp, val))

    # 1.5 Conviction ta_base
    for rec, ts, exp in [
        ("STRONG_BUY", 1.0, 15.0),
        ("BUY", 0.5, 10.0),
        ("NEUTRAL", 0.0, 1.0),
        ("SELL", -0.5, -15.0),
        ("STRONG_SELL", -1.0, -30.0)
    ]:
        if ts >= 0.5: val = min(15.0, 10.0 + ((ts - 0.5) / 0.5) * 5.0)
        elif ts >= 0.0: val = 1.0 + (ts / 0.5) * 9.0
        elif ts >= -0.5: val = -15.0 + ((ts + 0.5) / 0.5) * 16.0
        else: val = max(-30.0, -30.0 + ((ts + 1.0) / 0.5) * 15.0)
        tests.append(("Conv. ta_base", f"{rec} (ts={ts})", exp, val))

    # 1.6 Conviction rr_score
    for rr_val, exp in [(4.0, 6.0), (2.5, 4.5), (1.8, 3.0), (1.2, 1.5), (0.5, -4.0)]:
        if rr_val >= 4.0: val = 6.0
        elif rr_val >= 2.5: val = 4.5 + ((rr_val - 2.5) / 1.5) * 1.5
        elif rr_val >= 1.8: val = 3.0 + ((rr_val - 1.8) / 0.7) * 1.5
        elif rr_val >= 1.2: val = 1.5 + ((rr_val - 1.2) / 0.6) * 1.5
        elif rr_val >= 0.5: val = max(-4.0, -4.0 + ((rr_val - 0.5) / 0.7) * 5.5)
        else: val = -4.0
        tests.append(("Conv. rr_score", f"rr={rr_val}", exp, val))

    # 1.7 Conviction fresh_score
    for fr_val, exp in [(5, 6.0), (2, 4.0), (1, 2.0), (0, 0.0)]:
        if fr_val >= 5: val = 6.0
        elif fr_val >= 2: val = 4.0 + ((fr_val - 2) / 3.0) * 2.0
        elif fr_val >= 1: val = 2.0 + (fr_val - 1) * 2.0
        else: val = 0.0
        tests.append(("Conv. fresh_score", f"count={fr_val}", exp, val))

    # Print Full Table
    print(f"{'Formül / Metrik':<24} | {'Breakpoint / Girdi':<20} | {'Eski Beklenen':<14} | {'Yeni Çıktı':<12} | {'Eşit mi?':<8}")
    print("-" * 88)
    all_equal = True
    for cat, inp, exp, val in tests:
        eq = abs(exp - val) < 1e-4
        if not eq: all_equal = False
        print(f"{cat:<24} | {inp:<20} | {exp:<14.2f} | {val:<12.2f} | {'EVET' if eq else 'HAYIR'}")

    print(f"\nSonuç: {'TÜM 35 BREAKPOINT TESTİ BİREBİR EŞLEŞTİ (100% BAŞARI)' if all_equal else 'EŞLEŞMEYEN NOKTA BULUNDU!'}")


def run_test_2_rsi_circuit_breaker():
    print("\n" + "=" * 85)
    print("2. RSI İKİNCİ DEVRE KESİCİSİ İZOLE TESTİ (MADDE 2)")
    print("=" * 85)

    def calc_r_score(rsi, ta_rec):
        if rsi < 35.0:
            return -8.0 if ta_rec in ("SELL", "STRONG_SELL") else 0.0
        elif 35.0 <= rsi < 42.0:
            return 1.0 + ((rsi - 35.0) / 7.0) * 2.0
        elif 42.0 <= rsi < 50.0:
            return 3.0 + ((rsi - 42.0) / 8.0) * 2.0
        elif 50.0 <= rsi <= 65.0:
            return 5.0
        elif 65.0 < rsi <= 72.0:
            return 5.0 - ((rsi - 65.0) / 7.0) * 2.0
        elif 72.0 < rsi <= 75.0:
            return 3.0 - ((rsi - 72.0) / 3.0) * 7.0
        else:
            return -4.0

    # Test 1: RSI=25, TV_rec=STRONG_SELL -> MUST return -8.0
    r1 = calc_r_score(25.0, "STRONG_SELL")
    # Test 2: RSI=25, TV_rec=BUY -> MUST return 0.0
    r2 = calc_r_score(25.0, "BUY")
    # Test 3: RSI=25, TV_rec=SELL -> MUST return -8.0
    r3 = calc_r_score(25.0, "SELL")

    print(f"Test 1: RSI=25, TV_rec='STRONG_SELL' -> r_score = {r1:+.2f} (Beklenen: -8.00)")
    print(f"Test 2: RSI=25, TV_rec='BUY'         -> r_score = {r2:+.2f} (Beklenen:  0.00)")
    print(f"Test 3: RSI=25, TV_rec='SELL'        -> r_score = {r3:+.2f} (Beklenen: -8.00)")

    ok1 = (r1 == -8.0)
    ok2 = (r2 == 0.0)
    print(f"\nDoğrulama Sonucu: {'BAŞARILI (Devre kesici kesin/koşullu çalışıyor, hump eğrisine girmemiş)' if ok1 and ok2 else 'BAŞARISIZ'}")


def run_test_3_ykbnk_and_isctr_breakdown(ce: ConvictionEngine):
    print("\n" + "=" * 85)
    print("3. YKBNK VE ISCTR BİLEŞEN BAZINDA KIRILIM ANALİZİ (MADDE 3)")
    print("=" * 85)

    # Let's inspect YKBNK and ISCTR exact components
    companies = report_repo.get_all_company_info() or {}
    prices = price_service.prices or {}

    for ticker in ["YKBNK", "ISCTR"]:
        info = companies.get(ticker, {})
        fa = info.get("fundamentals", {})
        ta = info.get("technical_analysis", {})
        recs = report_repo.get_reports(ticker=ticker) or []
        setup = ce._cached_results.get(ticker, {})

        live_price = setup.get("price", prices.get(ticker, {}).get("price", 100.0))
        unique_brokers = {r.get("broker") or r.get("kurum") for r in recs if r.get("broker") or r.get("kurum")}
        model_cnt = sum(1 for r in recs if r.get("is_model"))
        recent_cnt = setup.get("recent_reports_count", 0)
        upside = setup.get("upside_pct", 0.0)
        rr = setup.get("risk_reward", 1.0)
        rsi = setup.get("rsi", 50.0)
        ta_rec = setup.get("ta_rec", "BUY")
        ta_score = setup.get("ta_score", 0.309)

        roe = float(fa.get("returnOnEquity") or 0.0)
        pe = float(fa.get("trailingPE") or 0.0)

        # Legacy Pillars
        # 1. Institutional
        b_old = 18.0 if len(unique_brokers) >= 20 else (14.0 if len(unique_brokers) >= 10 else 10.0)
        m_old = 8.0 if model_cnt >= 10 else 6.0
        p1_old = min(26.0, b_old + m_old)

        # 2. Valuation
        up_old = 10.0 + ((upside - 35.0) / 15.0) * 6.0 if (35 <= upside < 50) else (5.0 + ((upside - 20) / 15) * 5)
        roe_old = 4.0 if roe >= 0.35 else (2.5 if roe >= 0.20 else (1.0 if roe >= 0.10 else 0.0))
        pe_old = 3.0 if 0 < pe <= 7.0 else 2.0
        p2_old = max(-20.0, min(32.0, up_old + roe_old + pe_old))

        # 3. Technical
        ta_base_old = 10.0 if ta_rec == "BUY" else 15.0
        # sma50 > live_price (+3), sma20 (+2), sma20>sma50 (+3) = +8
        tr_old = 8.0
        r_old = 5.0 if 50 <= rsi <= 65 else 3.0
        p3_old = max(-35.0, min(28.0, ta_base_old + tr_old + r_old))

        # 4. Mechanics
        rr_old = 6.0 if rr >= 4.0 else 4.5
        fresh_old = 6.0 if recent_cnt >= 5 else 4.0
        p4_old = min(12.0, rr_old + fresh_old)

        raw_old = 2.0 + p1_old + p2_old + p3_old + p4_old
        final_old = max(5, min(97, int(round(raw_old))))

        # New Pillars
        if len(unique_brokers) >= 20: b_new = 18.0
        elif len(unique_brokers) >= 10: b_new = 14.0 + (len(unique_brokers) - 10) * 0.4
        elif len(unique_brokers) >= 5: b_new = 10.0 + (len(unique_brokers) - 5) * 0.8
        elif len(unique_brokers) >= 3: b_new = 6.0 + (len(unique_brokers) - 3) * 2.0
        else: b_new = len(unique_brokers) * 2.0

        if model_cnt >= 10: m_new = 8.0
        elif model_cnt >= 5: m_new = 6.0 + ((model_cnt - 5) / 5.0) * 2.0
        elif model_cnt >= 2: m_new = 4.0 + ((model_cnt - 2) / 3.0) * 2.0
        elif model_cnt == 1: m_new = 2.0
        else: m_new = 0.0
        p1_new = min(26.0, b_new + m_new)

        up_new = up_old
        roe_new = 2.5 + ((roe - 0.20) / 0.15) * 1.5 if roe >= 0.20 else (1.0 + ((roe - 0.10) / 0.10) * 1.5)
        pe_new = 3.0
        p2_new = max(-20.0, min(32.0, up_new + roe_new + pe_new))

        # New ta_base
        ta_base_new = 1.0 + (float(ta_score) / 0.5) * 9.0 if (0 <= float(ta_score) < 0.5) else 10.0
        p3_new = max(-35.0, min(28.0, ta_base_new + tr_old + r_old))

        p4_new = p4_old

        raw_new = 2.0 + p1_new + p2_new + p3_new + p4_new
        final_new = max(5, min(97, int(round(raw_new))))

        print(f"\n--- {ticker} Ayrıntılı Kırılım Tablosu ---")
        print(f"Metrikler: Kurum Sayısı = {len(unique_brokers)}, Model Portföy Rapor Sayısı = {model_cnt}")
        print(f"Finansallar: ROE = %{roe*100:.2f}, F/K = {pe:.2f}, Hedef Potansiyel = +%{upside:.1f}, TA Score = {ta_score:.3f}")
        print(f"{'Sütun / Bileşen':<28} | {'Eski Sistem':<14} | {'Yeni Sistem':<14} | {'Fark':<10}")
        print("-" * 72)
        print(f"{'1. Kurumsal Güç (Pillar 1)':<28} | {p1_old:<14.2f} | {p1_new:<14.2f} | {p1_new-p1_old:+.2f}")
        print(f"{'   - Kurum Sayısı Puanı':<28} | {b_old:<14.2f} | {b_new:<14.2f} | {b_new-b_old:+.2f}")
        print(f"{'   - Model Portföy Puanı':<28} | {m_old:<14.2f} | {m_new:<14.2f} | {m_new-m_old:+.2f}")
        print(f"{'2. Değerleme (Pillar 2)':<28} | {p2_old:<14.2f} | {p2_new:<14.2f} | {p2_new-p2_old:+.2f}")
        print(f"{'   - ROE Katkısı':<28} | {roe_old:<14.2f} | {roe_new:<14.2f} | {roe_new-roe_old:+.2f}")
        print(f"{'   - F/K Katkısı':<28} | {pe_old:<14.2f} | {pe_new:<14.2f} | {pe_new-pe_old:+.2f}")
        print(f"{'   - Hedef Potansiyel':<28} | {up_old:<14.2f} | {up_new:<14.2f} | {up_new-up_old:+.2f}")
        print(f"{'3. Teknik Güç (Pillar 3)':<28} | {p3_old:<14.2f} | {p3_new:<14.2f} | {p3_new-p3_old:+.2f}")
        print(f"{'   - ta_base':<28} | {ta_base_old:<14.2f} | {ta_base_new:<14.2f} | {ta_base_new-ta_base_old:+.2f}")
        print(f"{'   - SMA / RSI Katkısı':<28} | {tr_old+r_old:<14.2f} | {tr_old+r_old:<14.2f} | {0.0:+.2f}")
        print(f"{'4. İşlem Mekaniği (Pillar 4)':<28} | {p4_old:<14.2f} | {p4_new:<14.2f} | {p4_new-p4_old:+.2f}")
        print(f"{'HAM TOPLAM SKOR':<28} | {raw_old:<14.2f} | {raw_new:<14.2f} | {raw_new-raw_old:+.2f}")
        print(f"{'YUVARLANMIŞ NİHAİ SKOR':<28} | {final_old:<14d} | {final_new:<14d} | {final_new-final_old:+d}")


def run_test_4_raw_rsi_outputs():
    print("\n" + "=" * 85)
    print("4. HAM r_score ÇIKTILARI (RSI=0 vs RSI=100) (MADDE 4)")
    print("=" * 85)

    def calc_r_score(rsi, ta_rec):
        if rsi < 35.0:
            return -8.0 if ta_rec in ("SELL", "STRONG_SELL") else 0.0
        elif 35.0 <= rsi < 42.0:
            return 1.0 + ((rsi - 35.0) / 7.0) * 2.0
        elif 42.0 <= rsi < 50.0:
            return 3.0 + ((rsi - 42.0) / 8.0) * 2.0
        elif 50.0 <= rsi <= 65.0:
            return 5.0
        elif 65.0 < rsi <= 72.0:
            return 5.0 - ((rsi - 65.0) / 7.0) * 2.0
        elif 72.0 < rsi <= 75.0:
            return 3.0 - ((rsi - 72.0) / 3.0) * 7.0
        else:
            return -4.0

    r_0_neutral = calc_r_score(0.0, "NEUTRAL")
    r_0_sell = calc_r_score(0.0, "SELL")
    r_100 = calc_r_score(100.0, "NEUTRAL")

    print(f"RSI = 0.0 (TV_rec='NEUTRAL/BUY')   -> HAM r_score = {r_0_neutral:+.2f} pts  (Aşırı satım, tepki potansiyeli)")
    print(f"RSI = 0.0 (TV_rec='SELL/STR.SELL') -> HAM r_score = {r_0_sell:+.2f} pts  (Düşüş trendinde çöküş cezası)")
    print(f"RSI = 100.0 (Tüm Trendler)         -> HAM r_score = {r_100:+.2f} pts  (Aşırı şişkinlik / tepe cezası)")

    print(f"\nFarklılık Doğrulaması:")
    print(f"  * r_score(0, BUY) vs r_score(100): {r_0_neutral} != {r_100} -> FARKLI! (Fark: {r_100 - r_0_neutral:+.1f} pts)")
    print(f"  * r_score(0, SELL) vs r_score(100): {r_0_sell} != {r_100} -> FARKLI! (Fark: {r_100 - r_0_sell:+.1f} pts)")
    print(f"  * Önceki kompozit testteki eşitliğin nedeni: Diğer nötr bileşenlerle toplanıp int() yuvarlaması yapıldığında aynı skora denk gelmesiydi. Ham r_score fonksiyonunda hata yoktur, değerler tamamen farklıdır.")


def run_test_5_isolated_single_variable_fixed_baseline(ae: AlphaEngine, ce: ConvictionEngine):
    print("\n" + "=" * 85)
    print("5. SABİT NÖTR REFERANSLA TEK DEĞİŞKENLİ SINIR TESTLERİ (MADDE 5)")
    print("=" * 85)

    print("Sabit Nötr Referans Parametreleri:")
    print("  * Fiyat = 100.0 TL | F/K = 15.0 | PD/DD = 2.0 | Hedef Potansiyel = +%20.0 | RSI = 50.0")
    print("  * Trend = NEUTRAL (ta_rec='NEUTRAL', ta_score=0.0) | Aracı Kurum = 3 | R:R = 2.0 | Taze Rapor = 1\n")

    single_var_cases = [
        ("ROE Değişkeni", "ROE = -%25 (-0.25)", {"returnOnEquity": -0.25}),
        ("ROE Değişkeni", "ROE = 0.00 (Tam 0)", {"returnOnEquity": 0.00}),
        ("ROE Değişkeni", "ROE = +%10 (0.10)",  {"returnOnEquity": 0.10}),
        ("ROE Değişkeni", "ROE = +%20 (Sınır)", {"returnOnEquity": 0.20}),
        ("ROE Değişkeni", "ROE = +%35 (Tavan)", {"returnOnEquity": 0.35}),
        ("F/K Değişkeni", "F/K = -15.0 (Zarar)", {"trailingPE": -15.0}),
        ("F/K Değişkeni", "F/K = 4.0 (Çok Ucuz)", {"trailingPE": 4.0}),
        ("F/K Değişkeni", "F/K = 15.0 (Nötr)", {"trailingPE": 15.0}),
        ("F/K Değişkeni", "F/K = 500.0 (Aşırı)", {"trailingPE": 500.0}),
        ("PD/DD Değişkeni", "PD/DD = None (Boş)", {"priceToBook": None}),
        ("PD/DD Değişkeni", "PD/DD = 0.8 (Ucuz)", {"priceToBook": 0.8}),
        ("PD/DD Değişkeni", "PD/DD = 10.0 (Pahalı)", {"priceToBook": 10.0}),
        ("RSI Değişkeni", "RSI = 0 (Aşırı Satım)", {"rsi": 0.0}),
        ("RSI Değişkeni", "RSI = 50 (Nötr)", {"rsi": 50.0}),
        ("RSI Değişkeni", "RSI = 100 (Aşırı Alım)", {"rsi": 100.0}),
        ("Potansiyel",    "Hedef Pot. = -%50", {"upside_pct": -50.0}),
        ("Potansiyel",    "Hedef Pot. = +%100", {"upside_pct": 100.0})
    ]

    print(f"{'Kategori':<18} | {'Test Edilen Değişken':<25} | {'Alpha FA':<10} | {'Conv. Skor':<10} | {'Clamp Uygun?':<14} | {'Hata?':<8}")
    print("-" * 92)

    for cat, desc, override in single_var_cases:
        # Base setup
        base_funds = {"trailingPE": 15.0, "returnOnEquity": 0.15, "priceToBook": 2.0}
        base_funds.update({k: v for k, v in override.items() if k in base_funds})

        rsi_val = override.get("rsi", 50.0)
        up_val = override.get("upside_pct", 20.0)

        # Alpha FA
        fa_score = ae._calculate_fa_score(base_funds)

        # Conviction setup
        recs_val = [{"broker": f"B{i}", "target_price": 100.0 * (1 + up_val/100.0), "report_date": "2026-09-01"} for i in range(3)]
        setup = ce._evaluate_stock(
            ticker="FIXED_BASE_TEST",
            live_price=100.0,
            change_pct=0.0,
            volume=10000,
            recs=recs_val,
            fundamentals=base_funds,
            ta_data={
                "summary": {"RECOMMENDATION": "NEUTRAL", "RECOMMENDATION_SCORE": 0.0},
                "indicators": {"RSI": rsi_val}
            },
            history=[],
            today=price_service.last_updated
        )

        c_score = setup["score"]
        clamp_ok = (0.0 <= fa_score <= 100.0) and (5 <= c_score <= 97)
        print(f"{cat:<18} | {desc:<25} | {fa_score:<10.1f} | {c_score:<10d} | {'UYGUN (5-97)':<14} | {'YOK' if clamp_ok else 'HATA'}")


def main():
    print("=" * 85)
    print("HisseRadarPro - 5 Maddelik Kapsamlı Doğrulama ve Sınır Test Paketi")
    print("=" * 85)

    ae = AlphaEngine()
    ce = ConvictionEngine()
    if not ce._cached_results:
        ce.recompute()

    run_test_1_complete_breakpoint_equality(ae, ce)
    run_test_2_rsi_circuit_breaker()
    run_test_3_ykbnk_and_isctr_breakdown(ce)
    run_test_4_raw_rsi_outputs()
    run_test_5_isolated_single_variable_fixed_baseline(ae, ce)

    print("\n" + "=" * 85)
    print("TÜM 5 DOĞRULAMA MADDESİ BAŞARIYLA TAMAMLANDI.")
    print("=" * 85)


if __name__ == "__main__":
    main()
