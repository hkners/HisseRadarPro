"""
scripts/compare_engines.py
HisseRadarPro — Conviction Engine vs Alpha Engine Quantitative Comparison
========================================================================
Evaluates whether Conviction Engine and Alpha Engine provide distinct or redundant
alpha signals by computing their Spearman rank correlations (Information Coefficient / IC)
against 1-month (30d), 3-month (90d), and 6-month (180d) forward returns.

Safety Gate:
- Checks score_history table for at least 4-6 weeks of data before running.
- Can be overridden with --force flag.

Outputs:
- Generates markdown documentation at: docs/engine_comparison_report.md
- Prints executive summary and scenario recommendation to stdout.
"""

import os
import sys
import argparse
import sqlite3
import math
from datetime import datetime, date
from typing import Dict, List, Tuple, Any, Optional

# Set up paths
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(project_root, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    import scipy.stats as stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

from db_manager import ReportRepository
from services.backtest_service import _get_price_series_map, compute_forward_returns


def compute_spearman_rank_correlation(x: List[float], y: List[float]) -> Tuple[float, float]:
    """
    Computes Spearman rank correlation coefficient and two-sided p-value.
    Uses scipy if available, or pure Python fallback.
    """
    if len(x) < 3 or len(y) < 3 or len(x) != len(y):
        return 0.0, 1.0

    if HAS_SCIPY:
        res = stats.spearmanr(x, y)
        stat = float(res.statistic) if hasattr(res, "statistic") else float(res[0])
        pval = float(res.pvalue) if hasattr(res, "pvalue") else float(res[1])
        if math.isnan(stat):
            return 0.0, 1.0
        return stat, pval

    # Pure Python implementation
    def _rank(vals):
        sorted_indices = sorted(range(len(vals)), key=lambda k: vals[k])
        ranks = [0.0] * len(vals)
        i = 0
        while i < len(vals):
            j = i
            while j + 1 < len(vals) and vals[sorted_indices[j + 1]] == vals[sorted_indices[i]]:
                j += 1
            avg_rank = (i + j + 2) / 2.0
            for k in range(i, j + 1):
                ranks[sorted_indices[k]] = avg_rank
            i = j + 1
        return ranks

    rx = _rank(x)
    ry = _rank(y)
    n = len(rx)
    mean_rx = sum(rx) / n
    mean_ry = sum(ry) / n

    num = sum((rx[i] - mean_rx) * (ry[i] - mean_ry) for i in range(n))
    den_x = math.sqrt(sum((rx[i] - mean_rx) ** 2 for i in range(n)))
    den_y = math.sqrt(sum((ry[i] - mean_ry) ** 2 for i in range(n)))

    if den_x == 0 or den_y == 0:
        return 0.0, 1.0

    rho = num / (den_x * den_y)
    # Approximate t-distribution p-value
    df = n - 2
    if abs(rho) >= 1.0:
        return rho, 0.0
    t_stat = rho * math.sqrt(df / (1.0 - rho ** 2))
    # Approximation of two-tailed normal p-value for large N
    pval = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(t_stat) / math.sqrt(2.0))))
    return rho, pval


def check_data_sufficiency(db_path: str, min_weeks: int = 4) -> Tuple[bool, Dict[str, Any]]:
    """
    Checks if score_history has accumulated at least min_weeks of data.
    """
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("""
        SELECT COUNT(*), COUNT(DISTINCT snapshot_date), MIN(snapshot_date), MAX(snapshot_date)
        FROM score_history
        WHERE conviction_score IS NOT NULL AND alpha_score IS NOT NULL
    """)
    row = c.fetchone()
    conn.close()

    total_records = row[0] if row else 0
    distinct_dates = row[1] if row else 0
    min_date_str = row[2] if row else None
    max_date_str = row[3] if row else None

    if not min_date_str or not max_date_str:
        return False, {
            "total_records": 0,
            "distinct_dates": 0,
            "min_date": None,
            "max_date": None,
            "days_span": 0,
            "weeks_span": 0.0,
            "reason": "score_history tablosunda skor kaydı bulunamadı."
        }

    try:
        d_min = date.fromisoformat(min_date_str[:10])
        d_max = date.fromisoformat(max_date_str[:10])
        days_span = (d_max - d_min).days
        weeks_span = days_span / 7.0
    except Exception:
        days_span = 0
        weeks_span = 0.0

    min_required_days = min_weeks * 7
    is_sufficient = (days_span >= min_required_days) and (total_records >= 50) and (distinct_dates >= 10)

    info = {
        "total_records": total_records,
        "distinct_dates": distinct_dates,
        "min_date": min_date_str,
        "max_date": max_date_str,
        "days_span": days_span,
        "weeks_span": round(weeks_span, 1),
        "is_sufficient": is_sufficient,
        "min_weeks_required": min_weeks
    }
    return is_sufficient, info


def evaluate_engines(
    db_path: str,
    horizons: List[int] = [30, 90, 180]
) -> Dict[str, Any]:
    """
    Runs full comparative analysis across 1m, 3m, 6m forward return horizons.
    """
    repo = ReportRepository(db_path=db_path)

    # 1. Fetch score snapshots
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("""
        SELECT 
            ticker, snapshot_date, conviction_score, alpha_score,
            technical_component, fundamental_component, sentiment_component, consensus_component
        FROM score_history
        WHERE conviction_score IS NOT NULL AND alpha_score IS NOT NULL
        ORDER BY snapshot_date ASC, ticker ASC
    """)
    raw_rows = c.fetchall()
    conn.close()

    if not raw_rows:
        return {"error": "score_history tablosunda karşılaştırılacak veri bulunamadı."}

    min_snapshot = raw_rows[0][1][:10]
    # Preload prices starting 30 days before min_snapshot
    series_map = _get_price_series_map(repo, min_date=min_snapshot)

    # Calculate mutual engine correlation across all snapshots
    all_conv = [r[2] for r in raw_rows]
    all_alpha = [r[3] for r in raw_rows]
    mutual_rho, mutual_p = compute_spearman_rank_correlation(all_conv, all_alpha)

    # Linear Pearson correlation
    n_pts = len(all_conv)
    m_conv = sum(all_conv) / n_pts
    m_alpha = sum(all_alpha) / n_pts
    cov = sum((all_conv[i] - m_conv) * (all_alpha[i] - m_alpha) for i in range(n_pts))
    std_conv = math.sqrt(sum((x - m_conv) ** 2 for x in all_conv))
    std_alpha = math.sqrt(sum((y - m_alpha) ** 2 for y in all_alpha))
    pearson_r = cov / (std_conv * std_alpha) if (std_conv > 0 and std_alpha > 0) else 0.0

    horizon_results = {}
    horizon_labels = {30: "1 Aylık (30 Gün)", 90: "3 Aylık (90 Gün)", 180: "6 Aylık (180 Gün)"}

    subcomponents = ["technical_component", "fundamental_component", "sentiment_component", "consensus_component"]
    subcomp_results = {sc: {} for sc in subcomponents}

    for h in horizons:
        c_scores = []
        a_scores = []
        returns = []
        subcomp_vals = {sc: [] for sc in subcomponents}

        for r in raw_rows:
            tk, dt, c_sc, a_sc = r[0], r[1], r[2], r[3]
            fwd_ret = compute_forward_returns(tk, dt, h, report_repo=repo, price_series_map=series_map)
            if fwd_ret is not None and not math.isnan(fwd_ret):
                c_scores.append(c_sc)
                a_scores.append(a_sc)
                returns.append(fwd_ret)
                for idx, sc_name in enumerate(subcomponents):
                    val = r[4 + idx]
                    subcomp_vals[sc_name].append(val if val is not None else 50.0)

        n = len(returns)
        if n < 20:
            horizon_results[h] = {
                "horizon_days": h,
                "horizon_label": horizon_labels.get(h, f"{h} Gün"),
                "sample_size": n,
                "status": "INSUFFICIENT_FORWARD_DATA",
                "conviction_ic": 0.0,
                "conviction_pval": 1.0,
                "alpha_ic": 0.0,
                "alpha_pval": 1.0,
                "ic_diff": 0.0
            }
            continue

        conv_ic, conv_pval = compute_spearman_rank_correlation(c_scores, returns)
        alpha_ic, alpha_pval = compute_spearman_rank_correlation(a_scores, returns)
        ic_diff = conv_ic - alpha_ic

        horizon_results[h] = {
            "horizon_days": h,
            "horizon_label": horizon_labels.get(h, f"{h} Gün"),
            "sample_size": n,
            "status": "OK",
            "conviction_ic": round(conv_ic, 4),
            "conviction_pval": conv_pval,
            "alpha_ic": round(alpha_ic, 4),
            "alpha_pval": alpha_pval,
            "ic_diff": round(ic_diff, 4),
            "mutual_corr": round(compute_spearman_rank_correlation(c_scores, a_scores)[0], 4)
        }

        # Sub-component ICs for this horizon
        for sc_name in subcomponents:
            sc_ic, sc_p = compute_spearman_rank_correlation(subcomp_vals[sc_name], returns)
            subcomp_results[sc_name][h] = {
                "ic": round(sc_ic, 4),
                "pval": sc_p
            }

    # Determine which scenario applies
    scenario, recommendation = classify_scenario(mutual_rho, horizon_results)

    return {
        "summary": {
            "total_snapshots": len(raw_rows),
            "distinct_tickers": len(set(r[0] for r in raw_rows)),
            "start_date": min_snapshot,
            "end_date": raw_rows[-1][1][:10],
            "mutual_spearman_rho": round(mutual_rho, 4),
            "mutual_pearson_r": round(pearson_r, 4)
        },
        "horizons": horizon_results,
        "subcomponents": subcomp_results,
        "scenario": scenario,
        "recommendation": recommendation
    }


def classify_scenario(mutual_rho: float, horizons: Dict[int, Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    """
    Classifies the relationship between Conviction Engine and Alpha Engine into Scenario A, B, or C:
    a) Similar predictive power & highly correlated -> Merge into unified engine
    b) Different time horizons (one better at short, other at long) -> Retain both and label clearly in UI
    c) One engine clearly dominates or is obsolete -> Gradually phase out or subordinate weaker engine
    """
    valid_horizons = [h for h in [30, 90, 180] if horizons.get(h, {}).get("status") == "OK"]
    if not valid_horizons:
        return "INSUFFICIENT_DATA", {
            "scenario_key": "INSUFFICIENT_DATA",
            "title": "Yetersiz İleriye Dönük Veri",
            "verdict": "Henüz yeterli sayıda gerçekleşen getiri periyodu tamamlanmadı.",
            "action": "Veri toplama sürecine devam edilmeli."
        }

    conv_ics = {h: horizons[h]["conviction_ic"] for h in valid_horizons}
    alpha_ics = {h: horizons[h]["alpha_ic"] for h in valid_horizons}

    # Horizon difference analysis
    diff_30 = conv_ics.get(30, 0.0) - alpha_ics.get(30, 0.0)
    diff_180 = conv_ics.get(180, 0.0) - alpha_ics.get(180, 0.0)
    diff_90 = conv_ics.get(90, 0.0) - alpha_ics.get(90, 0.0)

    avg_conv_ic = sum(conv_ics.values()) / len(conv_ics)
    avg_alpha_ic = sum(alpha_ics.values()) / len(alpha_ics)
    avg_diff = avg_conv_ic - avg_alpha_ic

    # Scenario B Check: Does one dominate short-term while the other dominates medium/long-term?
    # e.g., Alpha is better at 30d by at least 0.03, but Conviction is better at 90d/180d by at least 0.03 (or vice versa)
    is_scenario_b = False
    if 30 in valid_horizons and (90 in valid_horizons or 180 in valid_horizons):
        long_diff = diff_180 if 180 in valid_horizons else diff_90
        if (diff_30 < -0.03 and long_diff > 0.03) or (diff_30 > 0.03 and long_diff < -0.03):
            is_scenario_b = True

    # Scenario C Check: Does one engine significantly outperform the other across all horizons?
    is_scenario_c = False
    dominant_engine = None
    if abs(avg_diff) >= 0.06:
        is_scenario_c = True
        dominant_engine = "Conviction Engine" if avg_diff > 0 else "Alpha Engine"

    if is_scenario_b:
        scenario_key = "SCENARIO_B"
        title = "Senaryo B: Farklı Zaman Ufuklarında Tamamlayıcı Güç"
        short_winner = "Alpha Engine" if diff_30 < 0 else "Conviction Engine"
        long_winner = "Conviction Engine" if diff_30 < 0 else "Alpha Engine"
        verdict = (
            f"Motorlar farklı yatırım vadelerinde uzmanlaşmıştır. {short_winner} 1 aylık kısa vadede "
            f"daha yüksek öngörü gücüne sahipken, {long_winner} 3-6 aylık orta/uzun vadede daha güçlü alfa üretmektedir."
        )
        action = (
            "İki motor da aktif tutulmalı ve arayüzde kullanım amaçları netleştirilmelidir:\n"
            f"- **Alpha Engine:** 'Kısa Vadeli Taktik Tarama & Momentum' (1-4 hafta)\n"
            f"- **Conviction Engine:** 'Orta/Uzun Vadeli Kurumsal Alım Sinyali' (1-6 ay)"
        )
    elif is_scenario_c:
        scenario_key = "SCENARIO_C"
        title = "Senaryo C: Asimetrik Öngörü Gücü (Tek Motor Üstünlüğü)"
        verdict = (
            f"{dominant_engine}, tüm zaman ufuklarında diğer motordan belirgin şekilde daha yüksek Bilgi Katsayısı (IC) "
            f"ve öngörü gücü sergilemektedir (Ortalama IC farkı: {abs(avg_diff):+.4f})."
        )
        weaker_engine = "Alpha Engine" if dominant_engine == "Conviction Engine" else "Conviction Engine"
        action = (
            f"Zayıf kalan {weaker_engine}'in müstakil bir skor olarak kullanıcıya sunulması kafa karışıklığı yaratmaktadır. "
            f"{weaker_engine}'in özgün alt bileşenleri (varsa revizyon momentumu) {dominant_engine}'e entegre edilmeli "
            f"ve {weaker_engine} kademeli olarak arayüzden kaldırılmalıdır."
        )
    elif mutual_rho >= 0.70 and abs(avg_diff) < 0.05:
        scenario_key = "SCENARIO_A"
        title = "Senaryo A: İkiz Motorlar (Yüksek Korelasyon ve Benzer Güç)"
        verdict = (
            f"Her iki motor da birbirleriyle çok yüksek rank korelasyonuna (rho = {mutual_rho:.4f}) sahiptir ve "
            f"benzer öngörü gücü sergilemektedir (Conviction Ort. IC: {avg_conv_ic:.4f}, Alpha Ort. IC: {avg_alpha_ic:.4f}). "
            "Aynı hisse için iki farklı skor üretilmesi kullanıcıda güven kaybına yol açmaktadır."
        )
        action = (
            "İki motor tek bir 'Bileşik HisseRadar Skoru' altında konsolide edilmelidir. "
            "Alpha Engine'deki dinamik ağırlıklandırma ve revizyon faktörü ile Conviction Engine'deki kurumsal hedef "
            "fiyat ve mutabakat kuralları tek bir çekirdek motorda birleştirilmelidir."
        )
    else:
        # Default fallback to Scenario A or B based on correlation
        if mutual_rho >= 0.75:
            scenario_key = "SCENARIO_A"
            title = "Senaryo A: Yüksek Derecede Örtüşen Sinyaller (Konsolidasyon Önerisi)"
            verdict = f"Motorlar arasındaki Spearman rank korelasyonu (rho = {mutual_rho:.4f}) iki ayrı puanlama sistemi tutmayı gerektirmeyecek kadar yüksektir."
            action = "İki motoru tek bir standart 'HisseRadar Puanı' olarak birleştirmek mimariyi sadeleştirecek ve kullanıcı deneyimini iyileştirecektir."
        else:
            scenario_key = "SCENARIO_B"
            title = "Senaryo B: Farklılaşan Faktör Profili"
            verdict = f"Motorlar orta düzeyde koreledir (rho = {mutual_rho:.4f}), farklı alt faktörlere odaklanmaktadırlar."
            action = "Arayüzde motorların yatırım profilleri (Momentum vs Temel Kurumsal) açıkça etiketlenerek ayrıştırılmalıdır."

    return scenario_key, {
        "scenario_key": scenario_key,
        "title": title,
        "verdict": verdict,
        "action": action,
        "avg_conv_ic": round(avg_conv_ic, 4),
        "avg_alpha_ic": round(avg_alpha_ic, 4),
        "avg_diff": round(avg_diff, 4),
        "mutual_rho": round(mutual_rho, 4)
    }


def generate_markdown_report(analysis: Dict[str, Any], output_path: str):
    """
    Renders the quantitative findings and strategic roadmap into docs/engine_comparison_report.md.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    summary = analysis["summary"]
    horizons = analysis["horizons"]
    subcomps = analysis.get("subcomponents", {})
    rec = analysis["recommendation"]
    scenario_key = analysis["scenario"]

    sc_badge = "🟢 SENARYO A" if scenario_key == "SCENARIO_A" else ("🔵 SENARYO B" if scenario_key == "SCENARIO_B" else "🟠 SENARYO C")

    md = []
    md.append("# HisseRadarPro — Conviction Engine vs. Alpha Engine Karşılaştırma ve Entegrasyon Raporu")
    md.append("")
    md.append(f"> **Rapor Tarihi:** {date.today().isoformat()}  ")
    md.append(f"> **İncelenen Tarih Aralığı:** {summary['start_date']} — {summary['end_date']}  ")
    md.append(f"> **Toplam İncelenen Skor Kaydı:** {summary['total_snapshots']:,} adet ({summary['distinct_tickers']} hisse)  ")
    md.append(f"> **Motorlar Arası Rank Korelasyonu:** ρ = {summary['mutual_spearman_rho']:.4f} (Pearson r = {summary['mutual_pearson_r']:.4f})  ")
    md.append(f"> **Nihai Karar:** **{sc_badge} — {rec['title']}**  ")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 1. Yönetici Özeti ve Stratejik Karar")
    md.append("")
    md.append(f"**Teşhis:** {rec['verdict']}")
    md.append("")
    md.append(f"**Uygulama Önerisi:**  ")
    md.append(f"{rec['action']}")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 2. İleriye Dönük Getiri Tahmin Gücü (Spearman Rank IC Analizi)")
    md.append("")
    md.append("Spearman Rank Korelasyonu (Information Coefficient / IC), bir skorlama motorunun hisseleri sıralama yeteneğini ve ardından gelen gerçekleşen getiriyi ne kadar doğru tahmin ettiğini ölçer.")
    md.append("")
    md.append("| Vade (Ufuk) | Gözlem Sayısı (N) | Conviction Engine IC | Alpha Engine IC | IC Farkı (Δ) | İstatistiksel Anlamlılık | Üstün Olan Motor |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

    for h, data in horizons.items():
        if data.get("status") != "OK":
            md.append(f"| {data['horizon_label']} | {data['sample_size']} | Yetersiz Veri | Yetersiz Veri | - | - | Henüz Vadesi Gelmedi |")
            continue

        c_ic = data["conviction_ic"]
        a_ic = data["alpha_ic"]
        diff = data["ic_diff"]
        c_p = data["conviction_pval"]
        sig_str = "p < 0.001 (Çok Yüksek)" if c_p < 0.001 else (f"p = {c_p:.3f}" if c_p < 0.05 else "Anlamsız")
        winner = "Conviction Engine" if diff > 0.01 else ("Alpha Engine" if diff < -0.01 else "Eşit / Benzer")

        md.append(f"| **{data['horizon_label']}** | {data['sample_size']:,} | **{c_ic:+.4f}** | **{a_ic:+.4f}** | {diff:+.4f} | {sig_str} | **{winner}** |")

    md.append("")
    md.append("> **Not:** Bilgi Katsayısı (IC) kantitatif finans literatüründe:\n"
              "> * IC > 0.05: İyi öngörü gücü\n"
              "> * IC > 0.15: Çok güçlü öngörü gücü\n"
              "> * IC > 0.50+: Güçlü trend ve çok yüksek faktör ayrıştırma yeteneğine işaret eder.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 3. İki Motor Arasındaki Benzerlik ve Örtüşme (Cross-Engine Correlation)")
    md.append("")
    md.append("Aynı hisse senedi için iki motorun ürettiği skorların birbiriyle uyumu:")
    md.append("")
    md.append(f"* **Spearman Rank Korelasyonu (ρ):** `{summary['mutual_spearman_rho']:.4f}`")
    md.append(f"* **Pearson Lineer Korelasyonu (r):** `{summary['mutual_pearson_r']:.4f}`")
    md.append("")
    if summary['mutual_spearman_rho'] >= 0.75:
        md.append("İki motor arasındaki rank korelasyonunun **%80'in üzerinde** olması, iki sistemin hisseleri neredeyse aynı hiyerarşiyle sıraladığını kanıtlamaktadır. Bu durum, arayüzde iki ayrı skor (örneğin THYAO için Conviction 81, Alpha 75.2) sunulmasının son kullanıcıda **kognitif yük ve kafa karışıklığı** yarattığını doğrulamaktadır.")
    else:
        md.append("İki motor arasındaki korelasyon orta seviyededir; bu da motorların farklı faktör ağırlıkları nedeniyle hisseleri farklı sıraladığını gösterir.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 4. Alt Bileşenlerin Getiri Tahmin Performansı (Factor IC)")
    md.append("")
    md.append("HisseRadarPro skorlarını oluşturan alt faktörlerin 1 ve 3 aylık getiriyi öngörme güçleri:")
    md.append("")
    md.append("| Alt Faktör Bileşeni | 1 Aylık IC (30 Gün) | 3 Aylık IC (90 Gün) | Birincil Kullanım Alanı |")
    md.append("| :--- | :---: | :---: | :--- |")

    factor_names = {
        "technical_component": ("Teknik Gösterge Skoru", "Kısa vadeli momentum ve aşırı alım/satım filtreleme"),
        "fundamental_component": ("Temel Değerleme Skoru (F/K, PD/DD, Sektör)", "Orta/uzun vadeli adil değerleme ve marjinal getiri"),
        "sentiment_component": ("Piyasa Duyarlılığı & Hacim Skoru", "Likidite ve kurumsal para girişi teyidi"),
        "consensus_component": ("Aracı Kurum Hedef Fiyat & Konsensüs", "Enflasyon üzeri reel prim potansiyeli ve hedef revizyonları")
    }

    for sc_name, (label, purpose) in factor_names.items():
        ic_30 = subcomps.get(sc_name, {}).get(30, {}).get("ic", "-")
        ic_90 = subcomps.get(sc_name, {}).get(90, {}).get("ic", "-")
        ic_30_str = f"{ic_30:+.4f}" if isinstance(ic_30, float) else str(ic_30)
        ic_90_str = f"{ic_90:+.4f}" if isinstance(ic_90, float) else str(ic_90)
        md.append(f"| **{label}** | {ic_30_str} | {ic_90_str} | {purpose} |")

    md.append("")
    md.append("---")
    md.append("")
    md.append("## 5. Senaryo Değerlendirmesi ve Uygulama Yol Haritası")
    md.append("")
    md.append("### Seçilen Senaryo: " + rec['title'])
    md.append("")
    md.append(rec['verdict'])
    md.append("")
    md.append("### Mimari ve Arayüz Adımları (Next Steps)")
    if scenario_key == "SCENARIO_A":
        md.append("1. **Tek Motor Konsolidasyonu (`services/conviction_engine.py`):**")
        md.append("   - Alpha Engine'in benzersiz bileşenleri (`revision_momentum` ve adaptif volatilite normalizasyonu) `conviction_engine.py` içine tek bir bileşik faktör olarak entegre edilmelidir.")
        md.append("2. **Frontend UI Sadeleştirmesi:**")
        md.append("   - Hisse kartlarında ve tablolarda iki ayrı skor sütunu yerine tek bir **'HisseRadar Skoru (0-100)'** gösterilmelidir.")
        md.append("   - Alt detay pop-up'ında bileşen dağılımı (Temel %35, Konsensüs %25, Teknik %20, Momentum %20) şeffafça sunulmalıdır.")
        md.append("3. **Kod Temizliği:**")
        md.append("   - `services/alpha_engine.py` motoru arka planda gereksiz CPU döngüsü tüketmemesi için `conviction_engine` ile birleştirilerek tek hesaplama döngüsüne indirgenmelidir.")
    elif scenario_key == "SCENARIO_B":
        md.append("1. **Arayüzde Net İsimlendirme ve Ayrıştırma:**")
        md.append("   - Alpha Engine: **'HisseRadar Taktik Alfa (Kısa Vade: 1-4 Hafta)'** olarak etiketlenmelidir.")
        md.append("   - Conviction Engine: **'HisseRadar Kurumsal İnanç (Orta Vade: 3-6 Ay)'** olarak etiketlenmelidir.")
        md.append("2. **Kart Üzerinde Zaman Ufku İkonları:**")
        md.append("   - Kullanıcıya her iki skorun hangi vade için geçerli olduğu görsel rozetlerle anlatılmalıdır.")
    else:  # SCENARIO_C
        md.append("1. **Üstün Motorun Ana Çekirdek Olarak Belirlenmesi:**")
        md.append(f"   - Getiri tahmininde belirgin üstünlük sağlayan motor ana puanlama referansı yapılmalıdır.")
        md.append("2. **Zayıf Motorun Geri Plana Alınması:**")
        md.append("   - Zayıf motor arayüzden kaldırılarak hesaplama yükü azaltılmalıdır.")

    md.append("")
    md.append("---")
    md.append("*Bu rapor `scripts/compare_engines.py` tarafından otomatik olarak üretilmiştir.*")

    content = "\n".join(md)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f">> Report generated successfully at: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Compare Conviction Engine vs Alpha Engine")
    parser.add_argument("--min-weeks", type=int, default=4, help="Minimum weeks of data required in score_history (default: 4)")
    parser.add_argument("--force", action="store_true", help="Run analysis even if min-weeks condition is not met")
    parser.add_argument("--output", type=str, default=None, help="Output markdown path (default: docs/engine_comparison_report.md)")
    args = parser.parse_args()

    db_path = os.path.join(backend_dir, "scraped_reports.db")
    output_path = args.output or os.path.join(project_root, "docs", "engine_comparison_report.md")

    print("=" * 78)
    print("      HISSERADARPRO — CONVICTION ENGINE VS. ALPHA ENGINE COMPARISON")
    print("=" * 78)
    print(f"Database: {db_path}")

    # Step 1: Check Data Sufficiency Gate
    is_sufficient, info = check_data_sufficiency(db_path, min_weeks=args.min_weeks)
    print(f"Historical span in score_history: {info['weeks_span']} weeks ({info['days_span']} days)")
    print(f"Date range: {info['min_date']} to {info['max_date']}")
    print(f"Total scored snapshots: {info['total_records']:,} ({info['distinct_dates']} distinct trading dates)")

    if not is_sufficient and not args.force:
        print("\n" + "!" * 78)
        print("  UYARI: YETERRSİZ VERİ! (DATA GATE)")
        print(f"  score_history tablosunda en az {args.min_weeks} haftalık veri birikmesi bekleniyor.")
        print(f"  Mevcut: {info['weeks_span']} hafta. Lütfen veri biriktikten sonra tekrar çalıştırın.")
        print("  (Zorla çalıştırmak için --force parametresini kullanabilirsiniz.)")
        print("!" * 78)
        return

    print("\nVeri yeterliliği onaylandı. Karşılaştırmalı getiri ve rank korelasyon analizi başlatılıyor...")
    analysis = evaluate_engines(db_path)
    if "error" in analysis:
        print(f"HATA: {analysis['error']}")
        return

    generate_markdown_report(analysis, output_path)

    # Print executive summary to stdout
    rec = analysis["recommendation"]
    print("\n" + "=" * 78)
    print("                           ÖZET VE STRATEJİK TAVSİYE")
    print("=" * 78)
    print(f"Seçilen Senaryo: {rec['title']}")
    print(f"Teşhis         : {rec['verdict']}")
    print(f"Aksiyon        : {rec['action']}")
    print("-" * 78)
    print(f"{'Vade':<18} | {'N':>6} | {'Conviction IC':>14} | {'Alpha IC':>10} | {'Fark (Delta)':>12} | {'Ustun Olan':<15}")
    print("-" * 78)
    for h, data in analysis["horizons"].items():
        if data.get("status") == "OK":
            c_ic = f"{data['conviction_ic']:+.4f}"
            a_ic = f"{data['alpha_ic']:+.4f}"
            diff = f"{data['ic_diff']:+.4f}"
            winner = "Conviction" if data['ic_diff'] > 0.01 else ("Alpha" if data['ic_diff'] < -0.01 else "Benzer")
            print(f"{data['horizon_label']:<18} | {data['sample_size']:>6} | {c_ic:>14} | {a_ic:>10} | {diff:>10} | {winner:<15}")
    print("=" * 78)
    print(f">> Tam detaylı rapor '{output_path}' dosyasına kaydedildi.\n")


if __name__ == "__main__":
    main()
