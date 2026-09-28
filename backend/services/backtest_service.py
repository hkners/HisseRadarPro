"""
HisseRadarPro — Quantitative Backtesting & Factor Decile Analysis Service
========================================================================
Validates the predictive power of Conviction Engine & Alpha Engine scores
and their individual sub-components (Technical, Fundamental, Sentiment,
Consensus, Revision Momentum, Price Momentum).

Decile Analysis:
Separates stock scores into 10 deciles and computes forward returns (mean,
median, win-rate, spread) over configurable horizons (e.g. 30, 60, 90 days).
"""

import argparse
import bisect
import datetime
import json
import logging
import math
import os
import statistics
import sys
from typing import Any, Dict, List, Optional, Tuple

# Path setup for direct script execution
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from db_manager import ReportRepository

logger = logging.getLogger(__name__)

# Valid score columns in score_history table
VALID_METRICS = {
    "conviction_score",
    "alpha_score",
    "technical_component",
    "fundamental_component",
    "sentiment_component",
    "consensus_component",
    "revision_momentum",
    "price_momentum_percentile"
}


def _get_price_series_map(
    report_repo: ReportRepository,
    min_date: Optional[str] = None
) -> Dict[str, Tuple[List[str], List[float]]]:
    """
    Loads historical prices into an in-memory sorted series per ticker:
    ticker -> ([sorted dates], [corresponding close prices])
    Allows O(log N) bisect lookup for forward returns across thousands of snapshots.
    """
    query = "SELECT ticker, date, close FROM historical_prices"
    params = []
    if min_date:
        query += " WHERE date >= ?"
        params.append(min_date)
    query += " ORDER BY ticker, date ASC"

    with report_repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()

    series_map: Dict[str, Tuple[List[str], List[float]]] = {}
    current_ticker = None
    dates = []
    prices = []

    for r in rows:
        t, d, c = r[0], r[1][:10], float(r[2])
        if t != current_ticker:
            if current_ticker is not None:
                series_map[current_ticker] = (dates, prices)
            current_ticker = t
            dates = [d]
            prices = [c]
        else:
            dates.append(d)
            prices.append(c)

    if current_ticker is not None:
        series_map[current_ticker] = (dates, prices)

    return series_map


def compute_forward_returns(
    ticker: str,
    from_date: Any,
    horizon_days: int,
    report_repo: Optional[ReportRepository] = None,
    price_series_map: Optional[Dict[str, Tuple[List[str], List[float]]]] = None
) -> Optional[float]:
    """
    Computes the percentage forward return for a given ticker from from_date to from_date + horizon_days.
    Uses historical_prices table.
    
    Formula: ((Price_at_horizon - Price_at_from_date) / Price_at_from_date) * 100.0
    Returns None if price data is not available or if the horizon date is in the future.
    """
    if isinstance(from_date, (datetime.date, datetime.datetime)):
        from_date_str = from_date.strftime("%Y-%m-%d")
        from_dt = datetime.date(from_date.year, from_date.month, from_date.day)
    else:
        from_date_str = str(from_date)[:10]
        try:
            from_dt = datetime.date.fromisoformat(from_date_str)
        except Exception:
            return None

    target_dt = from_dt + datetime.timedelta(days=int(horizon_days))
    target_date_str = target_dt.strftime("%Y-%m-%d")

    clean_ticker = ticker.upper().strip()

    # Fast path: in-memory binary search
    if price_series_map is not None:
        series = price_series_map.get(clean_ticker)
        if not series and report_repo:
            canonical = report_repo.resolve_ticker(clean_ticker)
            series = price_series_map.get(canonical)

        if not series:
            return None

        dates, prices = series
        if not dates:
            return None

        # Binary search for base price on or after from_date_str
        idx_base = bisect.bisect_left(dates, from_date_str)
        if idx_base >= len(dates):
            return None

        # Ensure base date is not too far from requested from_date (within 7 calendar days)
        base_found_dt = datetime.date.fromisoformat(dates[idx_base])
        if (base_found_dt - from_dt).days > 7:
            return None

        base_price = prices[idx_base]
        if base_price <= 0:
            return None

        # Binary search for future price on or after target_date_str
        idx_future = bisect.bisect_left(dates, target_date_str)
        if idx_future >= len(dates):
            # Target date is past the latest historical date available
            return None

        future_found_dt = datetime.date.fromisoformat(dates[idx_future])
        if (future_found_dt - target_dt).days > 10:
            # Future date gap is too large
            return None

        future_price = prices[idx_future]
        if future_price <= 0:
            return None

        return round(((future_price - base_price) / base_price) * 100.0, 2)

    # Fallback to direct DB queries if no pre-built map passed
    if report_repo is None:
        report_repo = ReportRepository()

    base_row = report_repo.get_price_on_or_after(clean_ticker, from_date_str)
    if not base_row:
        return None

    base_found_dt = datetime.date.fromisoformat(base_row["date"][:10])
    if (base_found_dt - from_dt).days > 7:
        return None

    base_price = float(base_row.get("close", 0.0) or 0.0)
    if base_price <= 0:
        return None

    future_row = report_repo.get_price_on_or_after(clean_ticker, target_date_str)
    if not future_row:
        return None

    future_found_dt = datetime.date.fromisoformat(future_row["date"][:10])
    if (future_found_dt - target_dt).days > 10:
        return None

    future_price = float(future_row.get("close", 0.0) or 0.0)
    if future_price <= 0:
        return None

    return round(((future_price - base_price) / base_price) * 100.0, 2)


def compute_decile_analysis(
    metric_column: str = "conviction_score",
    forward_days: int = 90,
    lookback_months: Optional[int] = None,
    report_repo: Optional[ReportRepository] = None
) -> Dict[str, Any]:
    """
    Computes decile analysis for a specified metric column in score_history.
    
    1. Fetches all valid scores from score_history.
    2. Calculates forward returns for each observation.
    3. Sorts universe by metric into 10 deciles (Decile 1 = lowest, Decile 10 = highest).
    4. Computes mean return, median return, sample count, win rate, and spread for each decile.
    """
    if metric_column not in VALID_METRICS:
        raise ValueError(
            f"Invalid metric '{metric_column}'. Must be one of: {sorted(list(VALID_METRICS))}"
        )

    if report_repo is None:
        report_repo = ReportRepository()

    # Calculate cutoff date if lookback_months is provided
    from_date = None
    if lookback_months and lookback_months > 0:
        cutoff = datetime.date.today() - datetime.timedelta(days=int(lookback_months * 30.5))
        from_date = cutoff.isoformat()

    # Query score_history
    records = report_repo.get_score_history(metric=metric_column, from_date=from_date)
    if not records:
        return {
            "metric": metric_column,
            "forward_days": forward_days,
            "lookback_months": lookback_months,
            "total_samples": 0,
            "deciles": [],
            "spread": 0.0,
            "message": "No score history records found for the given criteria."
        }

    # Pre-build price series map for ultra-fast vectorised bisect
    min_snap_date = min(r["snapshot_date"] for r in records)
    try:
        min_p_dt = datetime.date.fromisoformat(min_snap_date[:10]) - datetime.timedelta(days=10)
        min_p_str = min_p_dt.isoformat()
    except Exception:
        min_p_str = None
    price_map = _get_price_series_map(report_repo, min_date=min_p_str)

    # Compute forward returns for each observation
    paired_data: List[Tuple[float, float, str, str]] = []  # (metric_value, forward_return, ticker, date)

    for r in records:
        val = r.get(metric_column)
        if val is None:
            continue
        try:
            val_float = float(val)
        except (ValueError, TypeError):
            continue

        ticker = r["ticker"]
        snap_date = r["snapshot_date"]

        fwd_ret = compute_forward_returns(
            ticker=ticker,
            from_date=snap_date,
            horizon_days=forward_days,
            report_repo=report_repo,
            price_series_map=price_map
        )
        if fwd_ret is not None:
            paired_data.append((val_float, fwd_ret, ticker, snap_date))

    if len(paired_data) < 10:
        return {
            "metric": metric_column,
            "forward_days": forward_days,
            "lookback_months": lookback_months,
            "total_samples": len(paired_data),
            "deciles": [],
            "spread": 0.0,
            "message": f"Insufficient sample size ({len(paired_data)} samples with available forward returns). Minimum 10 required for decile analysis."
        }

    # Sort ascending by metric value
    paired_data.sort(key=lambda x: x[0])
    n = len(paired_data)

    decile_buckets: Dict[int, List[Tuple[float, float]]] = {i: [] for i in range(1, 11)}

    for idx, (m_val, ret_val, _, _) in enumerate(paired_data):
        # 1-indexed decile: 1 to 10
        decile_idx = min(10, int(idx * 10 / n) + 1)
        decile_buckets[decile_idx].append((m_val, ret_val))

    deciles_summary = []
    for d_num in range(1, 11):
        items = decile_buckets[d_num]
        if not items:
            continue
        scores = [item[0] for item in items]
        returns = [item[1] for item in items]

        count = len(returns)
        mean_ret = round(statistics.mean(returns), 2)
        median_ret = round(statistics.median(returns), 2)
        win_rate = round((sum(1 for r in returns if r > 0) / count) * 100.0, 1)

        deciles_summary.append({
            "decile": d_num,
            "min_score": round(min(scores), 2),
            "max_score": round(max(scores), 2),
            "count": count,
            "mean_return": mean_ret,
            "median_return": median_ret,
            "win_rate": win_rate
        })

    # Top vs Bottom spread (Decile 10 mean return - Decile 1 mean return)
    d1_mean = deciles_summary[0]["mean_return"] if deciles_summary else 0.0
    d10_mean = deciles_summary[-1]["mean_return"] if deciles_summary else 0.0
    spread = round(d10_mean - d1_mean, 2)

    # Check monotonicity score (correlation between decile rank and mean return)
    monotonic = bool(d10_mean > d1_mean)

    return {
        "metric": metric_column,
        "forward_days": forward_days,
        "lookback_months": lookback_months,
        "total_samples": n,
        "spread": spread,
        "is_monotonic": monotonic,
        "deciles": deciles_summary
    }


def format_decile_table(result: Dict[str, Any]) -> str:
    """Formats decile analysis results into a clean ASCII table."""
    lines = []
    lines.append("=" * 82)
    lines.append(f"  HisseRadarPro — Faktör Decile Analizi: {result.get('metric', '').upper()}")
    lines.append(f"  Vade: {result.get('forward_days')} Gün | Toplam Örneklem: {result.get('total_samples')} | D10-D1 Farkı: {result.get('spread', 0.0):+.2f}%")
    lines.append("=" * 82)

    if not result.get("deciles"):
        lines.append(f"  {result.get('message', 'Veri bulunamadı.')}")
        lines.append("=" * 82)
        return "\n".join(lines)

    header = f"{'Decile':<8} | {'Skor Aralığı':<18} | {'Örneklem':<10} | {'Ort. Getiri':<12} | {'Medyan Getiri':<14} | {'Kazanma %':<10}"
    lines.append(header)
    lines.append("-" * 82)

    for d in result["deciles"]:
        score_range = f"{d['min_score']:.1f} - {d['max_score']:.1f}"
        ret_str = f"{d['mean_return']:+.2f}%"
        med_str = f"{d['median_return']:+.2f}%"
        win_str = f"%{d['win_rate']:.1f}"
        row = f"D{d['decile']:<7} | {score_range:<18} | {d['count']:<10} | {ret_str:<12} | {med_str:<14} | {win_str:<10}"
        lines.append(row)

    lines.append("-" * 82)
    spread_str = f"{result.get('spread', 0.0):+.2f}%"
    status = "POZİTİF AYRIŞMA (Yüksek skor -> Yüksek getiri)" if result.get("spread", 0) > 0 else "NÖTR / TERS"
    lines.append(f"  Analiz Özeti: En Yüksek Dilim (D10) vs En Düşük Dilim (D1) Farkı: {spread_str} [{status}]")
    lines.append("=" * 82)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="HisseRadarPro Backtesting Decile Analysis CLI"
    )
    parser.add_argument(
        "--metric",
        type=str,
        default="conviction_score",
        help=f"Metric column to analyze. Options: {', '.join(sorted(VALID_METRICS))}"
    )
    parser.add_argument(
        "--forward-days",
        type=int,
        default=90,
        help="Forward return horizon in days (default: 90)"
    )
    parser.add_argument(
        "--lookback-months",
        type=int,
        default=None,
        help="Optional lookback window in months (default: None, all available)"
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Print only raw JSON output"
    )

    args = parser.parse_args()

    result = compute_decile_analysis(
        metric_column=args.metric,
        forward_days=args.forward_days,
        lookback_months=args.lookback_months
    )

    if not args.json_only:
        print(format_decile_table(result))
        print("\n--- JSON ÇIKTISI ---")

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
