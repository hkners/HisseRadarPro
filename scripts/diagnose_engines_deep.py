"""
scripts/diagnose_engines_deep.py
Gathers all live data and exact computations for Phase 1 Diagnostics.
Uses the running backend server at port 8015 and direct sqlite3 query.
"""
import sys
import os
import json
import sqlite3
import urllib.request
import numpy as np
from scipy import stats

def get_engine_data():
    req_c = urllib.request.urlopen("http://127.0.0.1:8015/api/conviction/all", timeout=5)
    req_a = urllib.request.urlopen("http://127.0.0.1:8015/api/alpha/screener", timeout=5)
    conv_list = json.loads(req_c.read().decode("utf-8"))
    alpha_list = json.loads(req_a.read().decode("utf-8"))
    return conv_list, alpha_list

def run_diagnostics():
    print("[1] Veriler API üzerinden alınıyor...")
    conv_stocks, alpha_stocks = get_engine_data()

    c_map = {s["ticker"]: s for s in conv_stocks}
    a_map = {s["ticker"]: s for s in alpha_stocks}

    common_tickers = sorted(list(set(c_map.keys()) & set(a_map.keys())))
    N = len(common_tickers)
    print(f"Toplam ortak hisse: {N}")

    c_scores = np.array([float(c_map[t]["score"]) for t in common_tickers])
    a_scores = np.array([float(a_map[t]["alpha_score"]) for t in common_tickers])

    # 1. Spearman and Kendall Tau
    spearman_corr, spearman_p = stats.spearmanr(c_scores, a_scores)
    kendall_corr, kendall_p = stats.kendalltau(c_scores, a_scores)
    pearson_corr, _ = stats.pearsonr(c_scores, a_scores)

    print(f"\n--- MADDE 2: SIRALAMA BAZLI UYUM ---")
    print(f"Spearman Rank Korelasyonu: {spearman_corr:.4f} (p={spearman_p:.2e})")
    print(f"Kendall Tau Korelasyonu  : {kendall_corr:.4f} (p={kendall_p:.2e})")
    print(f"Pearson Lineer Korelasyon: {pearson_corr:.4f}")

    # Top 30 & Top 50 Intersections
    # Sort descending by score
    sorted_by_c = sorted(common_tickers, key=lambda t: (c_map[t]["score"], c_map[t].get("raw_score", 0)), reverse=True)
    sorted_by_a = sorted(common_tickers, key=lambda t: a_map[t]["alpha_score"], reverse=True)

    top30_c = set(sorted_by_c[:30])
    top30_a = set(sorted_by_a[:30])
    top30_inter = top30_c & top30_a

    top50_c = set(sorted_by_c[:50])
    top50_a = set(sorted_by_a[:50])
    top50_inter = top50_c & top50_a

    print(f"İlk 30 Kesişimi: {len(top30_inter)} / 30 hisse (%{len(top30_inter)/30*100:.1f}) -> Ortaklar: {sorted(list(top30_inter))}")
    print(f"İlk 50 Kesişimi: {len(top50_inter)} / 50 hisse (%{len(top50_inter)/50*100:.1f}) -> Ortaklar: {sorted(list(top50_inter))}")

    # Rank percentile difference
    # Rank 1 is top (best)
    c_ranks = {t: rank for rank, t in enumerate(sorted_by_c, 1)}
    a_ranks = {t: rank for rank, t in enumerate(sorted_by_a, 1)}

    rank_diffs = []
    for t in common_tickers:
        cr = c_ranks[t]
        ar = a_ranks[t]
        # Percentile rank: 100 = best, 0 = worst
        c_pct = (N - cr) / (N - 1) * 100.0
        a_pct = (N - ar) / (N - 1) * 100.0
        pct_diff = c_pct - a_pct  # >0 means Conviction ranks higher than Alpha
        recs_count = c_map[t].get("broker_count", 0)
        rank_diffs.append({
            "ticker": t,
            "c_score": c_map[t]["score"],
            "a_score": a_map[t]["alpha_score"],
            "c_rank": cr,
            "a_rank": ar,
            "c_pct": round(c_pct, 2),
            "a_pct": round(a_pct, 2),
            "pct_diff": round(pct_diff, 2),
            "abs_pct_diff": round(abs(pct_diff), 2),
            "recs": recs_count
        })

    ge_30_count = sum(1 for d in rank_diffs if d["abs_pct_diff"] >= 30.0)
    print(f"Yüzdelik Sıra Farkı >= 30 puan olan hisse sayısı: {ge_30_count} / {N} (%{ge_30_count/N*100:.1f})")

    # Top 15 Conviction >> Alpha (pct_diff positive largest)
    conv_favored = sorted(rank_diffs, key=lambda x: x["pct_diff"], reverse=True)[:15]
    print("\n[En Büyük 15 Fark: Conviction Rütbesi >> Alpha Rütbesi (Conviction Yüksek, Alpha Düşük)]")
    for x in conv_favored:
        print(f"  {x['ticker']:<6} | Conv: {x['c_score']:>2}p (Sıra {x['c_rank']:>3}, %{x['c_pct']:>5.1f}) | Alpha: {x['a_score']:>4.1f}p (Sıra {x['a_rank']:>3}, %{x['a_pct']:>5.1f}) | Fark: +%{x['pct_diff']:>5.1f} | Rapor: {x['recs']}")

    # Top 15 Alpha >> Conviction (pct_diff negative largest)
    alpha_favored = sorted(rank_diffs, key=lambda x: x["pct_diff"])[:15]
    print("\n[En Büyük 15 Fark: Alpha Rütbesi >> Conviction Rütbesi (Alpha Yüksek, Conviction Düşük)]")
    for x in alpha_favored:
        print(f"  {x['ticker']:<6} | Conv: {x['c_score']:>2}p (Sıra {x['c_rank']:>3}, %{x['c_pct']:>5.1f}) | Alpha: {x['a_score']:>4.1f}p (Sıra {x['a_rank']:>3}, %{x['a_pct']:>5.1f}) | Fark: -%{abs(x['pct_diff']):>5.1f} | Rapor: {x['recs']}")

    # --- MADDE 3: KAPSAM ANALİZİ ---
    print("\n--- MADDE 3: KAPSAM ANALİZİ (Conviction SAT Grubu: 609 Hisse) ---")
    
    # Query database directly for report counts
    db_path = os.path.join(os.path.dirname(__file__), "..", "backend", "scraped_reports.db")
    rep_counts = {}
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT UPPER(TRIM(ticker)), COUNT(DISTINCT broker) FROM scraped_reports GROUP BY UPPER(TRIM(ticker))")
        for row in cur.fetchall():
            if row[0]:
                rep_counts[row[0]] = row[1]
        conn.close()

    zero_rep_universe = sum(1 for t in common_tickers if rep_counts.get(t, 0) == 0)
    print(f"Tüm evrende ({N} hisse) hiç raporu olmayan hisse sayısı: {zero_rep_universe} (%{zero_rep_universe/N*100:.1f})")

    # Filter Conviction SAT stocks
    def is_sat(dec):
        d = (dec or "").upper()
        return "SAT" in d or "RİSKLİ" in d or "RISKLI" in d

    sat_stocks = [c_map[t] for t in common_tickers if is_sat(c_map[t].get("decision"))]
    print(f"Toplam Conviction SAT hisse sayısı: {len(sat_stocks)}")

    groups = {
        "0 Kurum": [],
        "1 Kurum": [],
        "2 Kurum": [],
        "3-5 Kurum": [],
        "6+ Kurum": []
    }

    for s in sat_stocks:
        t = s["ticker"]
        # broker_count from engine or DB
        bc = s.get("broker_count", 0)
        # also get alpha sentiment score
        a_sent = a_map[t].get("sentiment_score", 50.0)
        c_sc = s.get("score", 0)
        item = {"ticker": t, "conv_score": c_sc, "alpha_sent": a_sent, "broker_count": bc}

        if bc == 0:
            groups["0 Kurum"].append(item)
        elif bc == 1:
            groups["1 Kurum"].append(item)
        elif bc == 2:
            groups["2 Kurum"].append(item)
        elif 3 <= bc <= 5:
            groups["3-5 Kurum"].append(item)
        else:
            groups["6+ Kurum"].append(item)

    group_results = {}
    for g_name, items in groups.items():
        count = len(items)
        if count > 0:
            c_med = float(np.median([x["conv_score"] for x in items]))
            a_sent_mean = float(np.mean([x["alpha_sent"] for x in items]))
            a_sent_med = float(np.median([x["alpha_sent"] for x in items]))
            group_results[g_name] = {
                "count": count,
                "pct": round(count / len(sat_stocks) * 100, 1),
                "c_med": c_med,
                "a_mean": round(a_sent_mean, 2),
                "a_med": round(a_sent_med, 2)
            }
            print(f"  {g_name:<10}: {count:>3} hisse (%{count/len(sat_stocks)*100:>5.1f}) | Conv Medyan: {c_med:>4.1f}p | Alpha Beklenti Ort: {a_sent_mean:>5.1f}p | Alpha Beklenti Medyan: {a_sent_med:>5.1f}p")
        else:
            group_results[g_name] = {"count": 0, "pct": 0.0, "c_med": 0, "a_mean": 0, "a_med": 0}
            print(f"  {g_name:<10}:   0 hisse")

    # --- MADDE 6: YAN YANA DÖKÜM ---
    print("\n--- MADDE 6: YAN YANA DÖKÜM TABLOSU ---")
    focus_list = ["ENERY", "AHGAZ", "ORGE", "TUPRS", "RYGYO", "ISDMR", "YYLGD", "BALSU", "TRMET", "MAVI", "KCHOL", "SOKM"]
    focus_data = []
    for t in focus_list:
        c = c_map.get(t, {})
        a = a_map.get(t, {})
        focus_data.append({
            "ticker": t,
            "c_dec": c.get("decision", "-"),
            "c_score": c.get("score", 0),
            "c_raw": c.get("raw_score", 0.0),
            "c_inst": c.get("institutional_pillar", 0.0),
            "c_val": c.get("valuation_pillar", 0.0),
            "c_tech": c.get("technical_pillar", 0.0),
            "c_mech": c.get("mechanics_pillar", 0.0),
            "c_mom": c.get("momentum_pillar", 0.0),
            "a_sig": a.get("signal", "-"),
            "a_score": a.get("alpha_score", 0.0),
            "a_ta": a.get("ta_score", 0.0),
            "a_fa": a.get("fa_score", 0.0),
            "a_sent": a.get("sentiment_score", 0.0),
            "brokers": c.get("broker_count", 0),
            "upside": c.get("upside_pct", 0.0)
        })

    # Save to json for exact markdown generation
    out_file = os.path.join(os.path.dirname(__file__), "diagnostics_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "spearman": {"corr": float(spearman_corr), "p": float(spearman_p)},
            "kendall": {"tau": float(kendall_corr), "p": float(kendall_p)},
            "pearson": {"corr": float(pearson_corr)},
            "top30_overlap": list(top30_inter),
            "top50_overlap": list(top50_inter),
            "ge_30_count": ge_30_count,
            "total_count": N,
            "conv_favored": conv_favored,
            "alpha_favored": alpha_favored,
            "sat_groups": group_results,
            "total_sat": len(sat_stocks),
            "zero_rep_universe": zero_rep_universe,
            "focus_data": focus_data
        }, f, indent=2, ensure_ascii=False)

    print("Diagnostik verileri 'scripts/diagnostics_results.json' dosyasına kaydedildi.")

if __name__ == "__main__":
    run_diagnostics()
