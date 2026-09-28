"""
scripts/audit_data_collector.py

Executes real calculations and queries across all 6 modules to produce
verified outputs for docs/implementation_audit_report.md.
"""

import os
import sys
import json
import sqlite3
import datetime
from fastapi.testclient import TestClient

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(project_root, "backend")
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from db_manager import ReportRepository
import services.backtest_service as bs
import services.consensus_signals as cs
import services.valuation_service as vs
import services.portfolio_builder as pb
import services.market_regime_service as mrs

db_path = os.path.join(backend_dir, "scraped_reports.db")
repo = ReportRepository(db_path=db_path)

collector = {}

print("--- 1. SKOR GEÇMİŞİ (score_history) ---")
# 1.1 Schema
with repo._get_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='score_history'")
    create_sql = cursor.fetchone()[0]
    collector["score_history_schema"] = create_sql

    cursor.execute("SELECT * FROM score_history LIMIT 10")
    col_names = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    collector["score_history_cols"] = col_names
    collector["score_history_top10"] = [dict(zip(col_names, r)) for r in rows]

# 1.2 compute_decile_analysis
decile_res = bs.compute_decile_analysis(metric_column="conviction_score", forward_days=90, report_repo=repo)
collector["decile_analysis"] = decile_res

# 1.3 GET /api/backtest/decile-analysis via TestClient
from main import app
client = TestClient(app)
resp_decile = client.get("/api/backtest/decile-analysis?metric=conviction_score&forward_days=90")
collector["api_decile_status"] = resp_decile.status_code
collector["api_decile_json"] = resp_decile.json()


print("--- 2. REVİZYON LOGLAMA + KESİTSEL KONSENSÜS SİNYALLERİ ---")
# 2.1 target_revision_log row count
count_rev = repo.count_target_revision_logs()
collector["target_revision_log_count"] = count_rev

# 2.2 detect_and_log_revision scenarios
# Scenario A: Changed
rev_scenario_changed = cs.detect_and_log_revision(
    ticker="THYAO",
    broker="Deniz Yatırım",
    new_target=525.0,
    report_date="2026-09-27",
    repo=repo
)
collector["rev_scenario_changed"] = rev_scenario_changed

# Scenario B: Unchanged
rev_scenario_unchanged = cs.detect_and_log_revision(
    ticker="THYAO",
    broker="Deniz Yatırım",
    new_target=525.0,
    report_date="2026-09-27",
    repo=repo
)
collector["rev_scenario_unchanged"] = rev_scenario_unchanged

# 2.3 5 stocks cross-sectional metrics
test_tickers = ["TOASO", "GARAN", "THYAO", "EREGL", "ASELS"]
cs_metrics = {}
for t in test_tickers:
    cs_metrics[t] = {
        "dispersion": cs.compute_target_dispersion(t, repo=repo),
        "sector_relative_optimism": cs.compute_sector_relative_optimism(t, repo=repo),
        "coverage_percentile": cs.compute_coverage_percentile(t, repo=repo),
        "bullish_ratio_relative": cs.compute_bullish_ratio_relative(t, repo=repo),
        "cross_sectional_momentum": cs.compute_cross_sectional_momentum(t, repo=repo)
    }
collector["cross_sectional_metrics"] = cs_metrics

# 2.4 Old vs New Conviction Score comparison
old_vs_new_scores = {}
with repo._get_connection() as conn:
    cursor = conn.cursor()
    for t in test_tickers:
        cursor.execute("""
            SELECT conviction_score, technical_component, fundamental_component,
                   sentiment_component, consensus_component, revision_momentum, price_momentum_percentile
            FROM score_history WHERE ticker = ? ORDER BY snapshot_date DESC LIMIT 1
        """, (t,))
        r = cursor.fetchone()
        if r:
            cur_conv = r[0]
            rev_m = r[5] or 0.0
            p_mom = r[6] or 50.0
            mom_pillar = max(-2.5, min(8.0, (p_mom / 100.0) * 5.5 + rev_m * 2.5))
            cur_tech = r[1] or 0.0
            raw_tech_base = cur_tech * (28.0 / 20.0) if cur_tech != 0 else 0.0
            old_conv = round(cur_conv - cur_tech - mom_pillar + min(28.0, raw_tech_base), 1)
            old_vs_new_scores[t] = {
                "new_conviction_score": cur_conv,
                "old_conviction_score": old_conv,
                "delta": round(cur_conv - old_conv, 1),
                "revision_momentum": rev_m,
                "price_momentum_percentile": p_mom,
                "momentum_pillar_contribution": round(mom_pillar, 2)
            }
collector["old_vs_new_conviction"] = old_vs_new_scores


print("--- 3. GÖRECELİ DEĞERLEME (valuation_service) ---")
# 3.1 TUPRS, GARAN, THYAO comparison
val_comparison = {}
for t in ["TUPRS", "GARAN", "THYAO"]:
    val_details = vs.compute_valuation_score(t, return_details=True, repo=repo)
    pe_val = val_details.get("pe_ratio")
    if pe_val is not None:
        if pe_val <= 0:
            old_pe_pts = -2.0
        elif pe_val < 7.0:
            old_pe_pts = 3.0
        elif pe_val <= 12.0:
            old_pe_pts = 1.5
        elif pe_val <= 20.0:
            old_pe_pts = 0.0
        elif pe_val <= 45.0:
            old_pe_pts = -1.5
        else:
            old_pe_pts = -3.0
    else:
        old_pe_pts = 0.0

    val_comparison[t] = {
        "ticker": t,
        "old_fixed_pe_points": old_pe_pts,
        "pe_ratio": pe_val,
        "pb_ratio": val_details.get("pb_ratio"),
        "historical_percentile_pe": val_details.get("historical_percentile_pe"),
        "historical_percentile_pb": val_details.get("historical_percentile_pb"),
        "sector_relative_pe": val_details.get("sector_relative_pe"),
        "sector_relative_pb": val_details.get("sector_relative_pb"),
        "valuation_score": val_details.get("valuation_score"),
        "points_contribution": val_details.get("points_contribution")
    }
collector["valuation_comparison"] = val_comparison

# 3.2 Real fallback stock (sector count < 3)
with repo._get_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("""
        SELECT sector, COUNT(*) as cnt FROM company_info
        WHERE sector IS NOT NULL AND sector != ''
        GROUP BY sector HAVING cnt < 3
    """)
    small_sectors = cursor.fetchall()
    fallback_example = None
    if small_sectors:
        for s_name, s_cnt in small_sectors:
            cursor.execute("SELECT ticker FROM company_info WHERE sector = ? LIMIT 1", (s_name,))
            fb_ticker = cursor.fetchone()[0]
            fb_details = vs.compute_valuation_score(fb_ticker, return_details=True, repo=repo)
            fallback_example = {
                "ticker": fb_ticker,
                "sector": s_name,
                "sector_peers_count": s_cnt,
                "details": fb_details
            }
            break
collector["fallback_stock_example"] = fallback_example


print("--- 4. PORTFÖY İNŞA KATMANI (portfolio_builder) ---")
# 4.1 generate_portfolio(top_n=15, universe='bist30', budget_tl=100000, method='score_proportional')
port_proportional = pb.generate_portfolio(
    top_n=15,
    universe="bist30",
    budget_tl=100000.0,
    method="score_proportional",
    repo=repo
)
collector["port_proportional"] = port_proportional

# 4.2 apply_diversification_filter elimination concrete example
candidates_all = pb.build_candidate_portfolio(top_n=25, universe="bist100", repo=repo)
cand_tickers = [c["ticker"] for c in candidates_all]
corr_matrix = pb.compute_correlation_matrix(cand_tickers, repo=repo)
filtered_cands = pb.apply_diversification_filter(
    candidates_all,
    corr_matrix,
    max_pairwise_corr=0.65,
    max_sector_weight=0.25,
    repo=repo
)

surviving_tickers = set(c["ticker"] for c in filtered_cands)
eliminated = [c for c in candidates_all if c["ticker"] not in surviving_tickers]

# Identify reason for elimination
elim_details = []
for el in eliminated:
    el_t = el["ticker"]
    corr_reasons = []
    for surv in filtered_cands:
        st = surv["ticker"]
        c_val = corr_matrix.get(el_t, {}).get(st, 0.0)
        if c_val > 0.65:
            corr_reasons.append(f"Pairwise corr {c_val:.2f} > 0.65 with {st} (score: {surv['score']})")
    
    reason = "; ".join(corr_reasons) if corr_reasons else f"Sector cap exceeded for sector '{el.get('sector')}'"
    elim_details.append({
        "ticker": el_t,
        "score": el["score"],
        "sector": el.get("sector"),
        "reason": reason
    })
collector["eliminated_candidates_example"] = elim_details[:5]

# 4.3 compute_liquidity_cap example
liq_cap_example = pb.compute_liquidity_cap("TOASO", proposed_position_value=250000000.0, repo=repo)
collector["liquidity_cap_example"] = liq_cap_example

# 4.4 Equal vs Inverse Volatility comparison
port_equal = pb.generate_portfolio(
    top_n=10,
    universe="bist30",
    budget_tl=100000.0,
    method="equal",
    repo=repo
)
port_inv_vol = pb.generate_portfolio(
    top_n=10,
    universe="bist30",
    budget_tl=100000.0,
    method="inverse_volatility",
    repo=repo
)

weight_comp = []
eq_weights = {p["ticker"]: p["target_weight_pct"] for p in port_equal.get("allocations", [])}
inv_weights = {p["ticker"]: p["target_weight_pct"] for p in port_inv_vol.get("allocations", [])}
all_t = sorted(list(set(eq_weights.keys()) | set(inv_weights.keys())))
for t in all_t:
    weight_comp.append({
        "ticker": t,
        "equal_weight_pct": eq_weights.get(t, 0.0),
        "inv_vol_weight_pct": inv_weights.get(t, 0.0),
        "diff_pct": round(inv_weights.get(t, 0.0) - eq_weights.get(t, 0.0), 2)
    })
collector["weight_method_comparison"] = weight_comp

# 4.5 POST /api/portfolio/generate via TestClient
resp_port = client.post("/api/portfolio/generate", json={
    "top_n": 5,
    "universe": "bist30",
    "budget_tl": 50000.0,
    "method": "score_proportional"
})
collector["api_port_status"] = resp_port.status_code
collector["api_port_json"] = resp_port.json()


print("--- 5. PİYASA REJİMİ (market_regime_service) ---")
# 5.1 get_current_regime()
cur_regime = mrs.get_current_regime()
collector["current_regime"] = cur_regime

# 5.2 scripts/backtest_regime.py last 30 days
from scripts.backtest_regime import run_regime_backtest
regime_history = run_regime_backtest(lookback_days=60)
collector["regime_history_30d"] = regime_history[-30:] if regime_history else []

# 5.3 exposure_multiplier comparison: RISK_ON vs RISK_OFF
port_risk_on = pb.generate_portfolio(
    top_n=5,
    universe="bist30",
    budget_tl=100000.0,
    exposure_multiplier=1.0,
    repo=repo
)
port_risk_off = pb.generate_portfolio(
    top_n=5,
    universe="bist30",
    budget_tl=100000.0,
    exposure_multiplier=0.5,
    repo=repo
)
collector["regime_portfolio_comparison"] = {
    "risk_on": {
        "budget_tl": 100000.0,
        "effective_budget": port_risk_on.get("effective_budget"),
        "cash_reserve_tl": port_risk_on.get("cash_reserve_tl"),
        "total_allocated_tl": port_risk_on.get("total_allocated_tl"),
        "allocations": port_risk_on.get("allocations", [])
    },
    "risk_off": {
        "budget_tl": 100000.0,
        "effective_budget": port_risk_off.get("effective_budget"),
        "cash_reserve_tl": port_risk_off.get("cash_reserve_tl"),
        "total_allocated_tl": port_risk_off.get("total_allocated_tl"),
        "allocations": port_risk_off.get("allocations", [])
    }
}


print("--- 6. ENGINE KARŞILAŞTIRMASI (compare_engines.py) ---")
from scripts.compare_engines import check_data_sufficiency, evaluate_engines
is_suff, suff_info = check_data_sufficiency(db_path, min_weeks=4)
collector["engine_data_sufficiency"] = {"is_sufficient": is_suff, "info": suff_info}
engine_eval = evaluate_engines(db_path)
collector["engine_evaluation"] = engine_eval

# Save collected data to JSON for easy inspection and reporting
out_file = os.path.join(backend_dir, "..", "scratch_audit_data.json")
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(collector, f, ensure_ascii=False, indent=2)

print(f"Data collection complete! Saved to {out_file}")
