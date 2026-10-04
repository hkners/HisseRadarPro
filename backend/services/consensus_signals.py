"""
backend/services/consensus_signals.py

Module providing analyst consensus signals, cross-sectional rankings,
and target price revision detection/logging for Borsa Istanbul equities.

Signals:
1. Target Price Dispersion (Coefficient of Variation of analyst targets)
2. Sector-Relative Optimism (Ticker upside vs. Sector mean upside)
3. Coverage Percentile (Analyst following rank across universe)
4. Bullish Ratio Relative (Bullish rating proportion vs. Universe baseline)
5. Cross-Sectional Price Momentum (Percentile rank of historical return)
6. Target Revision Logging (detect_and_log_revision)
"""

import math
import logging
import datetime
from typing import Dict, List, Optional, Any, Tuple

logger = logging.getLogger("consensus_signals")


def _get_repo():
    from globals import report_repo
    return report_repo


def detect_and_log_revision(
    ticker: str,
    broker: str,
    new_target: float,
    report_date: Optional[str] = None,
    repo = None
) -> Dict[str, Any]:
    """
    Detects if a broker has revised their target price for a given ticker
    and records the revision in target_revision_log if changed.

    Returns a dict with revision status, old/new target, and revision_pct.
    """
    if repo is None:
        repo = _get_repo()

    if not report_date:
        report_date = datetime.date.today().isoformat()

    ticker = ticker.upper().strip()
    broker = broker.strip()
    new_target = float(new_target)

    # 1. Fetch latest target from target_revision_log first, then scraped_reports
    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT new_target, report_date FROM target_revision_log
            WHERE UPPER(TRIM(ticker)) = ? AND LOWER(TRIM(broker)) = LOWER(?)
            ORDER BY id DESC LIMIT 1
        """, (ticker, broker))
        rev_row = cursor.fetchone()

    old_target = None
    if rev_row and rev_row[0] is not None:
        old_target = float(rev_row[0])
    else:
        with repo._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT target_price, report_date FROM scraped_reports
                WHERE UPPER(TRIM(ticker)) = ? AND LOWER(TRIM(broker)) = LOWER(?)
                  AND target_price IS NOT NULL AND target_price > 0
                  AND (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0)
                ORDER BY report_date DESC, id DESC LIMIT 5
            """, (ticker, broker))
            rows = cursor.fetchall()
        if rows:
            for r in rows:
                try:
                    val = float(str(r[0]).replace(",", "."))
                    if val > 0:
                        old_target = val
                        break
                except (ValueError, TypeError):
                    continue

    if old_target is None:
        # First target observed, log and return
        log_id = repo.log_target_revision(
            ticker=ticker,
            broker=broker,
            old_target=new_target,
            new_target=new_target,
            revision_pct=0.0,
            report_date=report_date
        )
        return {
            "status": "INITIAL_TARGET",
            "ticker": ticker,
            "broker": broker,
            "old_target": None,
            "new_target": round(new_target, 2),
            "revision_pct": 0.0,
            "logged": True,
            "log_id": log_id
        }

    # Compare old and new
    diff = new_target - old_target
    if abs(diff) > 0.005:  # Tolerance threshold
        rev_pct = round((diff / old_target) * 100.0, 2)
        log_id = repo.log_target_revision(
            ticker=ticker,
            broker=broker,
            old_target=round(old_target, 2),
            new_target=round(new_target, 2),
            revision_pct=rev_pct,
            report_date=report_date
        )
        return {
            "status": "REVISED",
            "ticker": ticker,
            "broker": broker,
            "old_target": round(old_target, 2),
            "new_target": round(new_target, 2),
            "revision_pct": rev_pct,
            "logged": True,
            "log_id": log_id
        }
    else:
        return {
            "status": "UNCHANGED",
            "ticker": ticker,
            "broker": broker,
            "old_target": round(old_target, 2),
            "new_target": round(new_target, 2),
            "revision_pct": 0.0,
            "logged": False,
            "log_id": None
        }


def compute_target_dispersion(ticker: str, repo = None) -> float:
    """
    Computes coefficient of variation (CV = std_dev / mean) of analyst target prices.
    Higher values represent wider analyst disagreement/dispersion.
    Returns 0.0 if fewer than 2 valid targets exist.
    """
    if repo is None:
        repo = _get_repo()

    ticker = ticker.upper().strip()
    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT broker, target_price FROM scraped_reports
            WHERE UPPER(TRIM(ticker)) = ? 
              AND target_price IS NOT NULL AND target_price > 0
              AND (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0)
            ORDER BY report_date DESC, id DESC
        """, (ticker,))
        rows = cursor.fetchall()

    # Distinct broker latest targets
    broker_targets: Dict[str, float] = {}
    for b, tp in rows:
        b_key = str(b).strip().lower()
        if b_key and b_key not in broker_targets:
            try:
                val = float(str(tp).replace(",", "."))
                if val > 0:
                    broker_targets[b_key] = val
            except (ValueError, TypeError):
                continue

    targets = list(broker_targets.values())
    if len(targets) < 2:
        return 0.0

    mean_tp = sum(targets) / len(targets)
    if mean_tp <= 0:
        return 0.0
    var = sum((x - mean_tp) ** 2 for x in targets) / (len(targets) - 1)
    std = math.sqrt(var)
    cv = std / mean_tp
    return round(cv, 4)


def compute_sector_relative_optimism(ticker: str, repo = None) -> float:
    """
    Computes ticker target upside % minus its sector peer average target upside %.
    A positive number means analysts are more optimistic on this stock than its sector peers.
    """
    if repo is None:
        repo = _get_repo()

    ticker = ticker.upper().strip()
    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT sector FROM company_info WHERE UPPER(TRIM(ticker)) = ?", (ticker,))
        sec_row = cursor.fetchone()
        sector = sec_row[0] if sec_row and sec_row[0] else None

        # Fetch latest prices
        cursor.execute("SELECT ticker, close FROM historical_prices WHERE (ticker, date) IN (SELECT ticker, MAX(date) FROM historical_prices GROUP BY ticker)")
        latest_prices = {row[0].upper().strip(): float(row[1]) for row in cursor.fetchall()}

        # Fetch latest target per broker for all tickers (excluding split-stale reports)
        cursor.execute("""
            SELECT UPPER(TRIM(ticker)), broker, target_price FROM scraped_reports
            WHERE target_price IS NOT NULL AND target_price > 0
              AND (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0)
            ORDER BY report_date DESC, id DESC
        """)
        all_reports = cursor.fetchall()

    ticker_targets: Dict[str, Dict[str, float]] = {}
    for t_sym, b, tp in all_reports:
        if t_sym not in ticker_targets:
            ticker_targets[t_sym] = {}
        b_key = str(b).strip().lower()
        if b_key not in ticker_targets[t_sym]:
            try:
                v = float(str(tp).replace(",", "."))
                if v > 0:
                    ticker_targets[t_sym][b_key] = v
            except (ValueError, TypeError):
                continue

    def get_avg_upside(t: str) -> Optional[float]:
        t_dict = ticker_targets.get(t, {})
        cur_p = latest_prices.get(t)
        if not t_dict or not cur_p or cur_p <= 0:
            return None
        mean_tp = sum(t_dict.values()) / len(t_dict)
        return ((mean_tp - cur_p) / cur_p) * 100.0

    stock_upside = get_avg_upside(ticker)
    if stock_upside is None:
        return 0.0

    if not sector:
        return round(stock_upside, 2)

    # Sector peer tickers
    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT UPPER(TRIM(ticker)) FROM company_info WHERE sector = ?", (sector,))
        peers = [r[0] for r in cursor.fetchall() if r[0] != ticker]

    peer_upsides = [get_avg_upside(p) for p in peers]
    valid_peer_upsides = [u for u in peer_upsides if u is not None]

    if not valid_peer_upsides:
        return round(stock_upside, 2)

    import statistics
    sector_median_upside = statistics.median(valid_peer_upsides)
    rel_optimism = stock_upside - sector_median_upside
    return round(rel_optimism, 2)


def compute_coverage_percentile(ticker: str, repo = None) -> float:
    """
    Computes the percentile rank (0-100) of analyst coverage count (unique brokers)
    for the stock across the entire tracked universe.
    """
    if repo is None:
        repo = _get_repo()

    ticker = ticker.upper().strip()
    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UPPER(TRIM(ticker)), COUNT(DISTINCT LOWER(TRIM(broker))) as broker_cnt
            FROM scraped_reports
            WHERE (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0)
            GROUP BY UPPER(TRIM(ticker))
        """)
        counts = {r[0]: r[1] for r in cursor.fetchall()}

    if not counts or ticker not in counts:
        return 0.0

    val = counts[ticker]
    all_vals = list(counts.values())
    less = sum(1 for v in all_vals if v < val)
    eq = sum(1 for v in all_vals if v == val)
    rank = ((less + 0.5 * eq) / len(all_vals)) * 100.0
    return round(rank, 1)


def compute_bullish_ratio_relative(ticker: str, repo = None) -> float:
    """
    Computes the proportion of bullish recommendations ('AL', 'BUY', 'GÜÇLÜ AL')
    for the ticker minus the universe baseline bullish proportion (spread in percentage points).
    """
    if repo is None:
        repo = _get_repo()

    ticker = ticker.upper().strip()
    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UPPER(TRIM(ticker)), rating FROM scraped_reports
            WHERE rating IS NOT NULL AND rating != ''
              AND (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0)
        """)
        rows = cursor.fetchall()

    from services.ticker_resolver import parse_rating

    by_ticker_recs: Dict[str, List[str]] = {}
    total_bullish = 0
    total_recs = 0

    for t_sym, rec in rows:
        rec_clean = str(rec).strip().upper()
        if t_sym not in by_ticker_recs:
            by_ticker_recs[t_sym] = []
        by_ticker_recs[t_sym].append(rec_clean)
        if parse_rating(rec_clean) == "AL":
            total_bullish += 1
        total_recs += 1

    if total_recs == 0:
        return 0.0

    universe_bullish_ratio = total_bullish / total_recs

    stock_recs = by_ticker_recs.get(ticker, [])
    if not stock_recs:
        return 0.0

    stock_bullish = sum(1 for r in stock_recs if any(term in r for term in bullish_terms))
    stock_bullish_ratio = stock_bullish / len(stock_recs)

    diff_pct = (stock_bullish_ratio - universe_bullish_ratio) * 100.0
    return round(diff_pct, 2)


def compute_cross_sectional_momentum(ticker: str, lookback_days: int = 63, repo = None) -> float:
    """
    Computes cross-sectional price momentum percentile (0-100) across all stocks
    over lookback_days (default ~63 trading days / 3 months).
    """
    if repo is None:
        repo = _get_repo()

    ticker = ticker.upper().strip()
    cutoff_date = (datetime.date.today() - datetime.timedelta(days=int(lookback_days * 2.5))).isoformat()

    with repo._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UPPER(TRIM(ticker)), date, close
            FROM historical_prices
            WHERE date >= ?
            ORDER BY UPPER(TRIM(ticker)), date ASC
        """, (cutoff_date,))
        rows = cursor.fetchall()

    ticker_prices: Dict[str, List[Tuple[str, float]]] = {}
    for t_sym, d, c in rows:
        if t_sym not in ticker_prices:
            ticker_prices[t_sym] = []
        try:
            ticker_prices[t_sym].append((d, float(c)))
        except (ValueError, TypeError):
            continue

    returns: Dict[str, float] = {}
    for t_sym, p_list in ticker_prices.items():
        if len(p_list) >= lookback_days:
            cur_p = p_list[-1][1]
            past_p = p_list[-lookback_days][1]
            if past_p > 0:
                returns[t_sym] = (cur_p - past_p) / past_p
        elif len(p_list) >= 20:
            cur_p = p_list[-1][1]
            past_p = p_list[0][1]
            if past_p > 0:
                returns[t_sym] = (cur_p - past_p) / past_p

    if not returns or ticker not in returns:
        return 50.0

    val = returns[ticker]
    all_vals = list(returns.values())
    less = sum(1 for v in all_vals if v < val)
    eq = sum(1 for v in all_vals if v == val)
    pct = ((less + 0.5 * eq) / len(all_vals)) * 100.0
    return round(pct, 1)


def get_all_consensus_signals(ticker: str, repo = None) -> Dict[str, Any]:
    """
    Returns a unified dict of all cross-sectional consensus signals for ticker.
    """
    dispersion = compute_target_dispersion(ticker, repo=repo)
    rel_optimism = compute_sector_relative_optimism(ticker, repo=repo)
    coverage_pct = compute_coverage_percentile(ticker, repo=repo)
    bullish_rel = compute_bullish_ratio_relative(ticker, repo=repo)
    xs_momentum = compute_cross_sectional_momentum(ticker, repo=repo)

    return {
        "ticker": ticker.upper(),
        "target_dispersion": dispersion,
        "sector_relative_optimism": rel_optimism,
        "coverage_percentile": coverage_pct,
        "bullish_ratio_relative": bullish_rel,
        "cross_sectional_momentum": xs_momentum
    }
