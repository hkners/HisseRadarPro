"""
Regime Backtest Script (scripts/backtest_regime.py)
Evaluates historical market regime behavior over the last 1 year (252 trading days)
using historical_prices table.

Calculates for each trading day:
- Market breadth (Advancing vs Declining stocks)
- XU100 Close, MA50, MA200, and position relative to MA200
- 3-tier Regime label: RISK_ON, RISK_OFF, NEUTRAL
- Exposure multiplier

Outputs:
- CSV file: scripts/regime_backtest_output.csv
- Detailed terminal log and distribution statistics
"""

import os
import sys
import sqlite3
import csv
from datetime import datetime
from collections import Counter

# Add backend directory to sys.path
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.market_regime_service import MarketRegimeService


def run_regime_backtest(
    lookback_days: int = 252,
    output_csv_path: str = None
):
    db_path = os.path.join(backend_dir, "scraped_reports.db")
    if not output_csv_path:
        output_csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "regime_backtest_output.csv")

    print("=" * 78)
    print("           BIST MARKET REGIME 1-YEAR HISTORICAL BACKTEST")
    print("=" * 78)
    print(f"Database: {db_path}")
    print(f"Output CSV: {output_csv_path}")

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # 1. Fetch all available dates for XU100
    c.execute("""
        SELECT date, close 
        FROM historical_prices 
        WHERE ticker = 'XU100'
        ORDER BY date ASC
    """)
    xu_rows = c.fetchall()
    if not xu_rows:
        print("ERROR: No XU100 data found in historical_prices! Please run scripts/sync_xu100.py first.")
        conn.close()
        return

    xu_dates = [r[0] for r in xu_rows]
    xu_closes = [float(r[1]) for r in xu_rows]
    xu_map = {r[0]: float(r[1]) for r in xu_rows}

    # We need at least lookback_days trading days
    total_dates_available = len(xu_dates)
    print(f"Total XU100 trading days in database: {total_dates_available}")

    eval_dates = xu_dates[-lookback_days:] if total_dates_available >= lookback_days else xu_dates
    print(f"Analyzing {len(eval_dates)} trading days from {eval_dates[0]} to {eval_dates[-1]}...")

    # Pre-fetch all daily stock prices for the evaluated date range (plus buffer for day-1)
    min_date_needed_idx = xu_dates.index(eval_dates[0])
    start_date_with_buffer = xu_dates[max(0, min_date_needed_idx - 1)]

    print(f"Preloading stock prices from {start_date_with_buffer} to {eval_dates[-1]}...")
    c.execute("""
        SELECT date, ticker, close
        FROM historical_prices
        WHERE ticker != 'XU100' AND date >= ? AND date <= ?
        ORDER BY date ASC
    """, (start_date_with_buffer, eval_dates[-1]))
    all_rows = c.fetchall()
    conn.close()

    # Organize prices by date -> ticker -> close
    prices_by_date = {}
    for dt, tk, cl in all_rows:
        if cl and cl > 0:
            prices_by_date.setdefault(dt, {})[tk] = cl

    print(f"Loaded price records across {len(prices_by_date)} dates.")

    service = MarketRegimeService(db_path=db_path)
    results = []

    for i, date in enumerate(eval_dates):
        # Index in xu_dates
        idx = xu_dates.index(date)
        close_today = xu_closes[idx]

        # Calculate MA50 and MA200 for XU100 up to this date
        history_window = xu_closes[:idx + 1]
        ma50 = sum(history_window[-50:]) / min(len(history_window), 50)
        ma200 = sum(history_window[-200:]) / min(len(history_window), 200)

        above_ma50 = close_today > ma50
        above_ma200 = close_today > ma200

        # Calculate breadth vs previous trading day
        if idx > 0:
            prev_date = xu_dates[idx - 1]
            curr_stocks = prices_by_date.get(date, {})
            prev_stocks = prices_by_date.get(prev_date, {})

            up = 0
            down = 0
            flat = 0
            for tk, cl in curr_stocks.items():
                if tk in prev_stocks:
                    prev_cl = prev_stocks[tk]
                    if prev_cl > 0:
                        chg_pct = (cl - prev_cl) / prev_cl * 100.0
                        if chg_pct > 0.05:
                            up += 1
                        elif chg_pct < -0.05:
                            down += 1
                        else:
                            flat += 1
            total_breadth = up + down + flat
        else:
            up, down, flat, total_breadth = 0, 0, 0, 0

        is_advancing = up > down
        is_declining = down > up
        bias = "ADVANCING" if is_advancing else ("DECLINING" if is_declining else "BALANCED")
        up_ratio = (up / total_breadth * 100) if total_breadth > 0 else 50.0

        # Determine regime
        regime = service.determine_regime_label(
            is_breadth_advancing=is_advancing,
            is_breadth_declining=is_declining,
            above_ma200=above_ma200
        )
        multiplier = 0.5 if regime == "RISK_OFF" else 1.0
        strong_buy_thr = 83 if regime == "RISK_OFF" else 75

        results.append({
            "date": date,
            "xu100_close": round(close_today, 2),
            "ma50": round(ma50, 2),
            "ma200": round(ma200, 2),
            "above_ma200": above_ma200,
            "above_ma50": above_ma50,
            "up": up,
            "down": down,
            "flat": flat,
            "total_breadth": total_breadth,
            "up_ratio_pct": round(up_ratio, 1),
            "bias": bias,
            "regime": regime,
            "exposure_multiplier": multiplier,
            "strong_buy_threshold": strong_buy_thr
        })

    # Save to CSV
    fieldnames = [
        "date", "xu100_close", "ma50", "ma200", "above_ma200", "above_ma50",
        "up", "down", "flat", "total_breadth", "up_ratio_pct", "bias",
        "regime", "exposure_multiplier", "strong_buy_threshold"
    ]
    with open(output_csv_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    # Statistics & Insights
    counts = Counter(r["regime"] for r in results)
    total_days = len(results)

    print("\n" + "=" * 78)
    print("                    BACKTEST SUMMARY & REGIME BREAKDOWN")
    print("=" * 78)
    for reg in ["RISK_ON", "NEUTRAL", "RISK_OFF"]:
        cnt = counts.get(reg, 0)
        pct = (cnt / total_days * 100) if total_days > 0 else 0
        tag = "[+]" if reg == "RISK_ON" else ("[~]" if reg == "NEUTRAL" else "[-]")
        print(f" {tag} {reg:<10}: {cnt:>4} days ({pct:>5.1f}%) | Multiplier: {'0.5x' if reg == 'RISK_OFF' else '1.0x'} | GUCLU AL Esigi: {'83' if reg == 'RISK_OFF' else '75'}")

    print("-" * 78)

    # Regime change / streak analysis
    regime_streaks = []
    current_reg = None
    streak_len = 0
    for r in results:
        if r["regime"] != current_reg:
            if current_reg is not None:
                regime_streaks.append((current_reg, streak_len))
            current_reg = r["regime"]
            streak_len = 1
        else:
            streak_len += 1
    if current_reg is not None:
        regime_streaks.append((current_reg, streak_len))

    print(f"Total Regime Switches: {len(regime_streaks) - 1}")
    for reg in ["RISK_ON", "NEUTRAL", "RISK_OFF"]:
        durations = [s[1] for s in regime_streaks if s[0] == reg]
        avg_dur = sum(durations) / len(durations) if durations else 0
        max_dur = max(durations) if durations else 0
        print(f" - {reg:<10} Avg Phase: {avg_dur:>4.1f} days (Max: {max_dur} days)")

    # Print sample of the most recent 15 trading days
    print("\n" + "=" * 78)
    print("                 SAMPLE RECENT 15 TRADING DAYS")
    print("=" * 78)
    print(f"{'Date':<11} | {'XU100':>8} | {'MA200':>8} | {'Pos':<6} | {'Up/Dn':>9} | {'Bias':<10} | {'Regime':<10} | {'Mult':>4}")
    print("-" * 78)
    for r in results[-15:]:
        pos_str = ">MA200" if r["above_ma200"] else "<MA200"
        up_dn = f"{r['up']}/{r['down']}"
        mult = f"{r['exposure_multiplier']}x"
        print(f"{r['date']:<11} | {r['xu100_close']:>8.1f} | {r['ma200']:>8.1f} | {pos_str:<6} | {up_dn:>9} | {r['bias']:<10} | {r['regime']:<10} | {mult:>4}")

    print("=" * 78)
    print(f">> Backtest results saved to: {output_csv_path}\n")
    return results


if __name__ == "__main__":
    run_regime_backtest()
