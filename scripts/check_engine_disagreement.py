"""
scripts/check_engine_disagreement.py
HisseRadarPro — Conviction Engine vs Alpha Engine Sinyal Çelişkisi Analizi
========================================================================
Canlı veritabanı/motor çıktılarında 622 BIST hissesi için:
- Conviction Engine (İşlem/Alım Karar Motoru): GÜÇLÜ AL, KADEMELİ AL, BEKLE/İZLE, RİSKLİ/SAT
- Alpha Engine (Göreceli Sıralama/Tarama Motoru): GÜÇLÜ AL, AL, NÖTR, SAT, GÜÇLÜ SAT

Kategori Eşleştirmesi:
  AL Grubu:
    - Conviction: GÜÇLÜ AL, KADEMELİ AL (Skor >= 58, pozitif trend)
    - Alpha: GÜÇLÜ AL, AL (Skor >= 65)
  NÖTR Grubu:
    - Conviction: BEKLE / İZLE (Skor 40-57 veya nötr teknik)
    - Alpha: NÖTR (Skor 36-64)
  SAT Grubu:
    - Conviction: RİSKLİ / SAT (Skor < 40 veya SAT/GÜÇLÜ SAT indikatörü)
    - Alpha: SAT, GÜÇLÜ SAT (Skor <= 35)

Çelişki Kriterleri:
1. Zıt Görüş (Geniş Tanım): Biri AL iken diğeri NÖTR veya SAT olan (veya biri SAT iken diğeri AL/NÖTR)
2. Taban Tabana Zıt (Dar Tanım): Biri AL grubundayken diğeri doğrudan SAT grubunda olanlar.
"""

import sys
import os
import json
import urllib.request

# Ensure backend in path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


def classify_conviction(decision: str) -> str:
    d = (decision or "").upper()
    if "AL" in d and "SAT" not in d:
        return "AL"
    elif "SAT" in d or "RİSKLİ" in d or "RISKLI" in d:
        return "SAT"
    return "NOTR"


def classify_alpha(signal: str) -> str:
    s = (signal or "").upper()
    if "AL" in s and "SAT" not in s:
        return "AL"
    elif "SAT" in s:
        return "SAT"
    return "NOTR"


def get_engine_data():
    """Tries fetching from active API server first (ultra-fast), falls back to direct module load."""
    try:
        req_c = urllib.request.urlopen("http://127.0.0.1:8015/api/conviction/all", timeout=4)
        req_a = urllib.request.urlopen("http://127.0.0.1:8015/api/alpha/screener", timeout=4)
        conv_list = json.loads(req_c.read().decode("utf-8"))
        alpha_list = json.loads(req_a.read().decode("utf-8"))
        if conv_list and alpha_list:
            return conv_list, alpha_list
    except Exception:
        pass

    # Fallback: direct import
    from globals import report_repo
    from services.conviction_engine import conviction_engine
    from services.alpha_engine import alpha_engine

    return conviction_engine.get_all_scored_stocks(), alpha_engine.get_alpha_screener()


def analyze_disagreements():
    conv_list, alpha_list = get_engine_data()
    c_map = {s["ticker"]: s for s in conv_list}
    a_map = {s["ticker"]: s for s in alpha_list}

    common_tickers = sorted(list(set(c_map.keys()) & set(a_map.keys())))
    total_count = len(common_tickers)

    if total_count == 0:
        print("HATA: Motor verileri yüklenemedi.")
        return

    # Confusion Matrix: [Conviction][Alpha]
    matrix = {
        "AL": {"AL": 0, "NOTR": 0, "SAT": 0},
        "NOTR": {"AL": 0, "NOTR": 0, "SAT": 0},
        "SAT": {"AL": 0, "NOTR": 0, "SAT": 0},
    }

    mild_disagreements = []   # One says AL, other says NOTR
    strong_disagreements = [] # One says AL, other says SAT
    sat_notr_diff = []        # One says SAT, other says NOTR
    agreed_stocks = []        # Same category

    for ticker in common_tickers:
        c_item = c_map[ticker]
        a_item = a_map[ticker]

        c_dec = c_item.get("decision", "BEKLE")
        c_score = c_item.get("score", 50)
        a_sig = a_item.get("signal", "NÖTR")
        a_score = a_item.get("alpha_score", 50.0)

        c_cat = classify_conviction(c_dec)
        a_cat = classify_alpha(a_sig)

        matrix[c_cat][a_cat] += 1

        record = {
            "ticker": ticker,
            "conv_score": c_score,
            "conv_decision": c_dec,
            "conv_cat": c_cat,
            "alpha_score": round(a_score, 1),
            "alpha_signal": a_sig,
            "alpha_cat": a_cat,
        }

        if c_cat == a_cat:
            agreed_stocks.append(record)
        elif (c_cat == "AL" and a_cat == "SAT") or (c_cat == "SAT" and a_cat == "AL"):
            strong_disagreements.append(record)
        elif (c_cat == "AL" and a_cat == "NOTR") or (c_cat == "NOTR" and a_cat == "AL"):
            mild_disagreements.append(record)
        else:
            sat_notr_diff.append(record)

    total_disagreements = len(strong_disagreements) + len(mild_disagreements) + len(sat_notr_diff)
    al_conflict_count = len(strong_disagreements) + len(mild_disagreements)

    print("=" * 78)
    print("  HİSSERADARPRO — CONVICTION ENGINE vs ALPHA ENGINE ÇELİŞKİ ANALİZİ")
    print("=" * 78)
    print(f"Toplam İncelenen Hisse Sayısı : {total_count}")
    print(f"Aynı Kategoride Mutabık Hisseler: {len(agreed_stocks)} (%{len(agreed_stocks)/total_count*100:.1f})")
    print(f"Farklı Kategorideki Hisseler   : {total_disagreements} (%{total_disagreements/total_count*100:.1f})")
    print("-" * 78)

    print("\n[1] KARIŞIKLIK MATRİSİ (CONFUSION MATRIX):")
    print("                      Alpha: AL     Alpha: NÖTR    Alpha: SAT       TOPLAM")
    print("   -----------------------------------------------------------------------")
    for r_cat in ["AL", "NOTR", "SAT"]:
        r_label = f"Conviction {r_cat:4s}"
        al_val = matrix[r_cat]["AL"]
        notr_val = matrix[r_cat]["NOTR"]
        sat_val = matrix[r_cat]["SAT"]
        row_tot = al_val + notr_val + sat_val
        print(f"   {r_label:18s} | {al_val:8d} | {notr_val:11d} | {sat_val:10d} |   {row_tot:6d}")
    print("   -----------------------------------------------------------------------")
    col_al = sum(matrix[r]["AL"] for r in ["AL", "NOTR", "SAT"])
    col_notr = sum(matrix[r]["NOTR"] for r in ["AL", "NOTR", "SAT"])
    col_sat = sum(matrix[r]["SAT"] for r in ["AL", "NOTR", "SAT"])
    print(f"   TOPLAM             | {col_al:8d} | {col_notr:11d} | {col_sat:10d} |   {total_count:6d}")

    print("\n[2] ÇELİŞKİ DERECELERİ VE DAĞILIMI:")
    print(f"   • AL vs SAT (Taban Tabana Zıt) : {len(strong_disagreements):3d} hisse (%{len(strong_disagreements)/total_count*100:.1f})  <-- EN KRİTİK")
    print(f"   • AL vs NÖTR (Görüş Ayrılığı) : {len(mild_disagreements):3d} hisse (%{len(mild_disagreements)/total_count*100:.1f})")
    print(f"   • SAT vs NÖTR (Temkin Ayrılığı): {len(sat_notr_diff):3d} hisse (%{len(sat_notr_diff)/total_count*100:.1f})")
    print(f"   • Toplam AL Çelişkisi (Bir motor AL derken diğeri demeyen): {al_conflict_count} hisse (%{al_conflict_count/total_count*100:.1f})")

    if strong_disagreements:
        print("\n[3] TABAN TABANA ZIT HİSSELERDEN ÖRNEKLER (AL vs SAT):")
        print(f"   {'Hisse':7s} | {'Conviction Kararı':18s} | {'Alpha Sinyali':16s} | {'Açıklama / Sebep'}")
        print("   " + "-" * 74)
        for s in strong_disagreements[:12]:
            t = s["ticker"]
            c_info = f"{s['conv_score']}p ({s['conv_decision']})"
            a_info = f"{s['alpha_score']}p ({s['alpha_signal']})"
            if s["conv_cat"] == "AL" and s["alpha_cat"] == "SAT":
                reason = "Conviction kurum hedefi/R:R'ı beğeniyor, Alpha teknik/temel çarpanı cezalandırıyor."
            else:
                reason = "Alpha faktör puanlaması yüksek, Conviction stop-loss/teknik teyit eksikliği nedeniyle bekletiyor."
            print(f"   {t:7s} | {c_info:18s} | {a_info:16s} | {reason}")

    print("\n[4] KULLANICI ARAYÜZÜ ETİKETLEME KURALI:")
    print("   UI Rozeti: '[!] Iki motor farkli goruste'")
    print("   Kosul: (Conviction == AL ve Alpha != AL) VEYA (Alpha == AL ve Conviction != AL)")
    print(f"   Toplam Rozet Alacak Hisse Sayisi: {al_conflict_count} hisse")

    # [5] SIRALAMA BAZLI METRİKLER (MADDE 2) [CANLI VERİ]
    try:
        import numpy as np
        from scipy import stats

        c_scores = np.array([float(c_map[t]["score"]) for t in common_tickers])
        a_scores = np.array([float(a_map[t]["alpha_score"]) for t in common_tickers])

        spearman_corr, spearman_p = stats.spearmanr(c_scores, a_scores)
        kendall_corr, kendall_p = stats.kendalltau(c_scores, a_scores)

        # Top 30 and Top 50 Overlap
        sorted_by_c = sorted(common_tickers, key=lambda t: (c_map[t]["score"], c_map[t].get("raw_score", 0)), reverse=True)
        sorted_by_a = sorted(common_tickers, key=lambda t: a_map[t]["alpha_score"], reverse=True)

        top30_c = set(sorted_by_c[:30])
        top30_a = set(sorted_by_a[:30])
        top30_inter = top30_c & top30_a

        top50_c = set(sorted_by_c[:50])
        top50_a = set(sorted_by_a[:50])
        top50_inter = top50_c & top50_a

        c_ranks = {t: rank for rank, t in enumerate(sorted_by_c, 1)}
        a_ranks = {t: rank for rank, t in enumerate(sorted_by_a, 1)}

        N = total_count
        rank_diffs = []
        for t in common_tickers:
            cr = c_ranks[t]
            ar = a_ranks[t]
            c_pct = (N - cr) / (N - 1) * 100.0
            a_pct = (N - ar) / (N - 1) * 100.0
            pct_diff = c_pct - a_pct
            rank_diffs.append({
                "ticker": t,
                "c_score": c_map[t]["score"],
                "a_score": a_map[t]["alpha_score"],
                "c_rank": cr,
                "a_rank": ar,
                "c_pct": c_pct,
                "a_pct": a_pct,
                "pct_diff": pct_diff,
                "abs_pct_diff": abs(pct_diff),
                "recs": c_map[t].get("broker_count", 0)
            })

        ge_30_count = sum(1 for d in rank_diffs if d["abs_pct_diff"] >= 30.0)

        print("\n[5] SIRALAMA BAZLI METRİKLER (MADDE 2) [CANLI VERİ]:")
        print(f"   • Spearman Sıra Korelasyonu : {spearman_corr:.4f} (p={spearman_p:.2e})")
        print(f"   • Kendall Tau Korelasyonu   : {kendall_corr:.4f} (p={kendall_p:.2e})")
        print(f"   • İlk 30 Kesişimi           : {len(top30_inter)} / 30 hisse (%{len(top30_inter)/30*100:.1f}) -> {sorted(list(top30_inter))}")
        print(f"   • İlk 50 Kesişimi           : {len(top50_inter)} / 50 hisse (%{len(top50_inter)/50*100:.1f})")
        print(f"   • Yüzdelik Sıra Farkı >= %30: {ge_30_count} / {N} hisse (%{ge_30_count/N*100:.1f})")

        print("\n   [En Büyük 15 Fark: Conviction Rütbesi >> Alpha Rütbesi (Conviction Yüksek, Alpha Düşük)]")
        conv_favored = sorted(rank_diffs, key=lambda x: x["pct_diff"], reverse=True)[:15]
        for x in conv_favored:
            print(f"   {x['ticker']:<6} | Conv: {x['c_score']:>2}p (Sıra {x['c_rank']:>3}) | Alpha: {x['a_score']:>4.1f}p (Sıra {x['a_rank']:>3}) | Fark: +%{x['pct_diff']:>5.1f} | Rapor: {x['recs']}")

        print("\n   [En Büyük 15 Fark: Alpha Rütbesi >> Conviction Rütbesi (Alpha Yüksek, Conviction Düşük)]")
        alpha_favored = sorted(rank_diffs, key=lambda x: x["pct_diff"])[:15]
        for x in alpha_favored:
            print(f"   {x['ticker']:<6} | Conv: {x['c_score']:>2}p (Sıra {x['c_rank']:>3}) | Alpha: {x['a_score']:>4.1f}p (Sıra {x['a_rank']:>3}) | Fark: -%{abs(x['pct_diff']):>5.1f} | Rapor: {x['recs']}")
    except Exception as e:
        print(f"\n[5] SIRALAMA BAZLI METRİKLER HESAPLANAMADI: {e}")

    print("=" * 78)


if __name__ == "__main__":
    analyze_disagreements()

