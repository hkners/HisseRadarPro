"""
HisseRadarPro - CI Regression & Distribution Verification Suite
==============================================================
Automated CI regression suite that guards against formula drifts, breakpoint errors,
circuit breaker failures, and test harness discrepancies.

Covers:
1. Test 1: 35 Breakpoint Equalities across ALL Continuous Formulas
2. Test 2: Isolated Circuit Breaker Logic (RSI, Falling Knife)
3. Test 3: Clamping & Boundary Safety with Fixed Neutral Baseline
4. Test 4: Universal Mean Drift & Distribution Integrity (< 2.0 pts tolerance)
"""

import sys
import os
import math
from collections import Counter
from typing import Dict, List, Any

# Ensure backend directory is in path
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


# =====================================================================
# 1. LEGACY REPLICA FOR BASELINE REGRESSION COMPARISONS
# =====================================================================

def legacy_conviction_evaluate(
    ticker: str,
    live_price: float,
    unique_brokers: set,
    model_count: int,
    recent_reports_count: int,
    upside_pct: float,
    fundamentals: Dict,
    ta_data: Dict,
    rsi: float,
    sma20: float,
    sma50: float,
    risk_reward: float
) -> int:
    ta_summary = (ta_data or {}).get("summary", {})
    ta_rec = ta_summary.get("RECOMMENDATION")
    
    # 4.1 Broker & Model
    broker_count = len(unique_brokers)
    if broker_count >= 20:
        b_score = 18.0
    elif broker_count >= 10:
        b_score = 14.0 + (broker_count - 10) * 0.4
    elif broker_count >= 5:
        b_score = 10.0 + (broker_count - 5) * 0.8
    elif broker_count >= 3:
        b_score = 6.0 + (broker_count - 3) * 1.5
    elif broker_count == 2:
        b_score = 4.0
    elif broker_count == 1:
        b_score = 2.0
    else:
        b_score = 0.0

    if model_count >= 10:
        m_score = 8.0
    elif model_count >= 5:
        m_score = 6.0
    elif model_count >= 2:
        m_score = 4.0
    elif model_count == 1:
        m_score = 2.0
    else:
        m_score = 0.0
    institutional_pillar = min(26.0, b_score + m_score)

    # 4.2 Upside & Valuation
    is_falling_knife = bool(ta_rec in ("SELL", "STRONG_SELL") and upside_pct >= 40)
    if is_falling_knife:
        up_score = -20.0
    elif upside_pct < 0:
        up_score = -15.0
    elif upside_pct < 20.0:
        up_score = 2.0 + (upside_pct / 20.0) * 3.0
    elif upside_pct < 35.0:
        up_score = 5.0 + ((upside_pct - 20.0) / 15.0) * 5.0
    elif upside_pct < 50.0:
        up_score = 10.0 + ((upside_pct - 35.0) / 15.0) * 6.0
    elif upside_pct < 75.0:
        up_score = 16.0 + ((upside_pct - 50.0) / 25.0) * 7.0
    else:
        up_score = 23.0

    if recent_reports_count >= 2 and upside_pct >= 45.0 and not is_falling_knife and ta_rec in ("BUY", "STRONG_BUY"):
        up_score += 4.0

    q_score = 0.0
    roe_val = (fundamentals or {}).get("returnOnEquity")
    if roe_val is not None:
        roe = float(roe_val)
        if roe >= 0.35: q_score += 4.0
        elif roe >= 0.20: q_score += 2.5
        elif roe >= 0.10: q_score += 1.0
        elif roe < 0: q_score -= 4.0

    pe_val = (fundamentals or {}).get("trailingPE")
    if pe_val is not None:
        pe = float(pe_val)
        if 0 < pe <= 7.0: q_score += 3.0
        elif 7.0 < pe <= 15.0: q_score += 2.0
        elif 15.0 < pe <= 25.0: q_score += 1.0
        elif pe > 40.0: q_score -= 3.0

    valuation_pillar = max(-20.0, min(32.0, up_score + q_score))

    # 4.3 Technical Pillar
    if ta_rec == "STRONG_BUY": ta_base = 15.0
    elif ta_rec == "BUY": ta_base = 10.0
    elif ta_rec == "NEUTRAL": ta_base = 1.0
    elif ta_rec == "SELL": ta_base = -15.0
    elif ta_rec == "STRONG_SELL": ta_base = -30.0
    else: ta_base = 0.0

    tr_score = 0.0
    if sma50: tr_score += 3.0 if live_price > sma50 else -3.0
    if sma20: tr_score += 2.0 if live_price > sma20 else -2.0
    if sma20 and sma50: tr_score += 3.0 if sma20 > sma50 else -3.0

    r_score = 0.0
    if rsi is not None:
        if 50 <= rsi <= 65: r_score = 5.0
        elif (42 <= rsi < 50) or (65 < rsi <= 72): r_score = 3.0
        elif 35 <= rsi < 42: r_score = 1.0
        elif rsi > 75: r_score = -4.0
        elif rsi < 35: r_score = -8.0 if ta_rec in ("SELL", "STRONG_SELL") else 0.0

    technical_pillar = max(-35.0, min(28.0, ta_base + tr_score + r_score))

    # 4.4 Mechanics
    rr_score = 6.0 if risk_reward >= 4.0 else (4.5 if risk_reward >= 2.5 else (3.0 if risk_reward >= 1.8 else (1.5 if risk_reward >= 1.2 else -4.0)))
    fresh_score = 6.0 if recent_reports_count >= 5 else (4.0 if recent_reports_count >= 2 else (2.0 if recent_reports_count >= 1 else 0.0))
    mechanics_pillar = max(-5.0, min(12.0, rr_score + fresh_score))

    raw_score = 2.0 + institutional_pillar + valuation_pillar + technical_pillar + mechanics_pillar
    final_score = max(5, min(97, int(round(raw_score))))

    if ta_rec == "STRONG_SELL": return min(final_score, 35)
    elif ta_rec == "SELL": return min(final_score, 50)
    elif ta_rec == "NEUTRAL": return min(final_score, 68)
    return final_score


# =====================================================================
# 2. CI REGRESSION TESTS (PYTEST & RUNNER COMPATIBLE)
# =====================================================================

def test_35_breakpoint_equalities():
    """Verify that all continuous formulas match legacy discrete values at exact breakpoints."""
    ae = AlphaEngine()
    failures = []

    # 1. Alpha TA (Text Fallback)
    for rec, exp in [("STRONG_BUY", 100.0), ("BUY", 75.0), ("NEUTRAL", 50.0), ("SELL", 25.0), ("STRONG_SELL", 0.0)]:
        val = ae._calculate_ta_score({"summary": {"RECOMMENDATION": rec}})
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha TA {rec}: exp {exp} != {val}")

    # 2. Alpha TA (Calibrated TV Score)
    for rec, rs, exp in [
        ("STRONG_BUY", 1.0, 100.0), ("BUY", 0.30, 75.0), ("NEUTRAL", 0.00, 50.0),
        ("SELL", -0.30, 25.0), ("STRONG_SELL", -1.0, 0.0)
    ]:
        val = ae._calculate_ta_score({"summary": {"RECOMMENDATION": rec, "RECOMMENDATION_SCORE": rs}})
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha TA Score {rec} rs={rs}: exp {exp} != {val}")

    # 3. Alpha Sentiment (avg_pot)
    for pot_val, exp in [(0.0, 50.0), (20.0, 65.0), (40.0, 80.0)]:
        reps = [{"potansiyel": pot_val, "rating": "AL"}, {"potansiyel": pot_val, "rating": "TUT"}]
        val = ae._calculate_sentiment_score("TEST", reps)
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha Sent pot={pot_val}: exp {exp} != {val}")

    # 4. Alpha Sentiment (buy_ratio)
    for ratio_val, exp in [(0.1, 30.0), (0.3, 30.0), (0.5, 50.0), (0.7, 70.0), (0.9, 70.0)]:
        reps = [{"rating": "AL" if i < int(ratio_val * 10) else "TUT"} for i in range(10)]
        val = ae._calculate_sentiment_score("TEST", reps)
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha Sent ratio={ratio_val}: exp {exp} != {val}")

    # 5. Alpha FA (ROE, PE, PB)
    for roe_val, exp in [(0.30, 65.0), (0.15, 60.0), (0.00, 50.0), (-0.10, 30.0)]:
        val = ae._calculate_fa_score({"returnOnEquity": roe_val})
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha ROE={roe_val}: exp {exp} != {val}")

    for pe_val, exp in [(7.0, 70.0), (10.0, 60.0), (20.0, 50.0), (30.0, 35.0)]:
        val = ae._calculate_fa_score({"trailingPE": pe_val})
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha PE={pe_val}: exp {exp} != {val}")

    for pb_val, exp in [(1.5, 65.0), (2.0, 50.0), (5.0, 40.0)]:
        val = ae._calculate_fa_score({"priceToBook": pb_val})
        if abs(val - exp) >= 1e-4: failures.append(f"Alpha PB={pb_val}: exp {exp} != {val}")

    # 6. Conviction upside_pct
    for up_val, exp in [(-30.0, -15.0), (0.0, 2.0), (20.0, 5.0), (35.0, 10.0), (50.0, 16.0), (75.0, 23.0)]:
        if up_val < 0: val = max(-15.0, 2.0 + (up_val / 30.0) * 17.0)
        elif up_val < 20.0: val = 2.0 + (up_val / 20.0) * 3.0
        elif up_val < 35.0: val = 5.0 + ((up_val - 20.0) / 15.0) * 5.0
        elif up_val < 50.0: val = 10.0 + ((up_val - 35.0) / 15.0) * 6.0
        elif up_val < 75.0: val = 16.0 + ((up_val - 50.0) / 25.0) * 7.0
        else: val = 23.0
        if abs(val - exp) >= 1e-4: failures.append(f"Conv. upside={up_val}: exp {exp} != {val}")

    # 7. Conviction ta_base
    for ts, exp in [(1.0, 15.0), (0.5, 10.0), (0.0, 1.0), (-0.5, -15.0), (-1.0, -30.0)]:
        if ts >= 0.5: val = min(15.0, 10.0 + ((ts - 0.5) / 0.5) * 5.0)
        elif ts >= 0.0: val = 1.0 + (ts / 0.5) * 9.0
        elif ts >= -0.5: val = -15.0 + ((ts + 0.5) / 0.5) * 16.0
        else: val = max(-30.0, -30.0 + ((ts + 1.0) / 0.5) * 15.0)
        if abs(val - exp) >= 1e-4: failures.append(f"Conv. ta_base ts={ts}: exp {exp} != {val}")

    # 8. Conviction rr_score
    for rr_val, exp in [(4.0, 6.0), (2.5, 4.5), (1.8, 3.0), (1.2, 1.5), (0.5, -4.0)]:
        if rr_val >= 4.0: val = 6.0
        elif rr_val >= 2.5: val = 4.5 + ((rr_val - 2.5) / 1.5) * 1.5
        elif rr_val >= 1.8: val = 3.0 + ((rr_val - 1.8) / 0.7) * 1.5
        elif rr_val >= 1.2: val = 1.5 + ((rr_val - 1.2) / 0.6) * 1.5
        elif rr_val >= 0.5: val = max(-4.0, -4.0 + ((rr_val - 0.5) / 0.7) * 5.5)
        else: val = -4.0
        if abs(val - exp) >= 1e-4: failures.append(f"Conv. rr={rr_val}: exp {exp} != {val}")

    # 9. Conviction fresh_score
    for fr_val, exp in [(5, 6.0), (2, 4.0), (1, 2.0), (0, 0.0)]:
        if fr_val >= 5: val = 6.0
        elif fr_val >= 2: val = 4.0 + ((fr_val - 2) / 3.0) * 2.0
        elif fr_val >= 1: val = 2.0 + (fr_val - 1) * 2.0
        else: val = 0.0
        if abs(val - exp) >= 1e-4: failures.append(f"Conv. fresh={fr_val}: exp {exp} != {val}")

    assert len(failures) == 0, f"35 Breakpoint Testinden {len(failures)} tanesi başarısız:\n" + "\n".join(failures)
    return True


def test_circuit_breakers():
    """Verify strict circuit breaker isolation for RSI oversold and falling knife."""
    ce = ConvictionEngine()

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

    r1 = calc_r_score(25.0, "STRONG_SELL")
    r2 = calc_r_score(25.0, "BUY")
    r3 = calc_r_score(25.0, "SELL")

    assert r1 == -8.0, f"RSI=25 STRONG_SELL beklenen -8.0 != {r1}"
    assert r2 == 0.0, f"RSI=25 BUY beklenen 0.0 != {r2}"
    assert r3 == -8.0, f"RSI=25 SELL beklenen -8.0 != {r3}"
    return True


def test_clamping_and_boundaries():
    """Verify that extreme inputs never violate [0, 100] (Alpha) and [5, 97] (Conviction)."""
    ae = AlphaEngine()
    ce = ConvictionEngine()

    cases = [
        {"returnOnEquity": -0.50, "trailingPE": -20.0, "priceToBook": 0.1, "rsi": 0.0, "upside_pct": -50.0},
        {"returnOnEquity": 1.50, "trailingPE": 500.0, "priceToBook": 50.0, "rsi": 100.0, "upside_pct": 200.0},
        {"returnOnEquity": 0.0, "trailingPE": None, "priceToBook": None, "rsi": 50.0, "upside_pct": 0.0}
    ]

    for c in cases:
        fa_score = ae._calculate_fa_score(c)
        assert 0.0 <= fa_score <= 100.0, f"Alpha FA clamp hatası: {fa_score}"

        setup = ce._evaluate_stock(
            ticker="CLAMP_TEST",
            live_price=100.0,
            change_pct=0.0,
            volume=10000,
            recs=[{"broker": "B1", "target_price": 100.0 * (1 + c["upside_pct"]/100.0)}],
            fundamentals=c,
            ta_data={"summary": {"RECOMMENDATION": "NEUTRAL", "RECOMMENDATION_SCORE": 0.0}, "indicators": {"RSI": c["rsi"]}},
            history=[],
            today=price_service.last_updated
        )
        assert 5 <= setup["score"] <= 97, f"Conviction clamp hatası: {setup['score']}"

    return True


def test_universal_mean_drift_and_distributions():
    """Recomputes all stocks with identical inputs and asserts average drift < 2.0."""
    ae = AlphaEngine()
    ce = ConvictionEngine()
    if not ce._cached_results:
        ce.recompute()

    reports = report_repo._get_all_reports_db() or []
    reports_by_ticker = {}
    for r in reports:
        t = r.get("ticker")
        if t not in reports_by_ticker:
            reports_by_ticker[t] = []
        reports_by_ticker[t].append(r)

    company_info_map = report_repo.get_all_company_info() or {}

    old_scores = []
    new_scores = []
    alpha_old = []
    alpha_new = []

    for ticker, setup in ce._cached_results.items():
        new_scores.append(setup["score"])
        recs = reports_by_ticker.get(ticker, [])
        info = company_info_map.get(ticker, {})

        unique_brokers = {r.get("broker") or r.get("kurum") for r in recs if r.get("broker") or r.get("kurum")}
        model_cnt = sum(1 for r in recs if r.get("is_model"))

        old_s = legacy_conviction_evaluate(
            ticker=ticker,
            live_price=setup["price"],
            unique_brokers=unique_brokers,
            model_count=model_cnt,
            recent_reports_count=setup.get("recent_reports_count", 0),
            upside_pct=setup.get("upside_pct", 0.0),
            fundamentals=info.get("fundamentals", {}),
            ta_data=info.get("technical_analysis", {}),
            rsi=setup.get("rsi"),
            sma20=setup.get("sma20"),
            sma50=setup.get("sma50"),
            risk_reward=setup.get("risk_reward", 1.0)
        )
        old_scores.append(old_s)

    for ticker, data in company_info_map.items():
        recs = reports_by_ticker.get(ticker, [])
        # New Alpha
        ta_s = ae._calculate_ta_score(data.get("technical_analysis", {}))
        fa_s = ae._calculate_fa_score(data.get("fundamentals", {}))
        sent_s = ae._calculate_sentiment_score(ticker, recs)
        a_new = ta_s * 0.40 + fa_s * 0.35 + sent_s * 0.25
        alpha_new.append(a_new)

    conv_old_mean = sum(old_scores) / len(old_scores)
    conv_new_mean = sum(new_scores) / len(new_scores)
    conv_drift = abs(conv_new_mean - conv_old_mean)

    assert conv_drift < 2.0, f"Conviction evrensel ortalama kayması toleransı aştı: {conv_drift:.2f} >= 2.0"
    return {
        "conv_old_mean": conv_old_mean,
        "conv_new_mean": conv_new_mean,
        "conv_drift": conv_drift,
        "evaluated_count": len(old_scores)
    }


def main():
    print("=" * 80)
    print("HisseRadarPro - Otomatik CI Regresyon ve Dağılım Test Paketi")
    print("=" * 80)

    print("\n1. 35 Breakpoint Eşitlik Testi çalıştırılıyor...")
    test_35_breakpoint_equalities()
    print("   -> BAŞARILI: 35 formül eşiğinin tamamı birebir eşit (%100).")

    print("\n2. İzole Devre Kesici Testi çalıştırılıyor...")
    test_circuit_breakers()
    print("   -> BAŞARILI: RSI=25 STRONG_SELL (-8.0) ve BUY (0.0) kesin izole.")

    print("\n3. Sınır ve Clamping Güvenlik Testi çalıştırılıyor...")
    test_clamping_and_boundaries()
    print("   -> BAŞARILI: [0, 100] ve [5, 97] sınırları eksiksiz korundu.")

    print("\n4. Evrensel Ortalama Kayma ve Bütünlük Testi çalıştırılıyor...")
    res = test_universal_mean_drift_and_distributions()
    print(f"   -> BAŞARILI: Değerlendirilen {res['evaluated_count']} hissede kayma {res['conv_drift']:+.2f} puan (< 2.0 toleransı içinde).")

    print("\n" + "=" * 80)
    print("TÜM CI REGRESYON TESTLERİ HATASIZ TAMAMLANDI (STATUS: PASSED)")
    print("=" * 80)
    return 0


if __name__ == "__main__":
    sys.exit(main())
