"""
HisseRadarPro — Portfolio Risk & Analytics
==========================================
Risk desk view of the user's holdings, computed from one year of daily closes:
- Overview: value, annualised volatility, beta vs XU100, 1-day historical VaR/CVaR (95%),
  max drawdown and 1-year return of today's weights vs XU100.
- Positions: weight, volatility, beta and each position's share of portfolio variance.
- Concentration: sector weights, top-1/top-3 weight, HHI and effective number of holdings.
- Correlation matrix between holdings.
- Scenarios: beta-scaled index shocks, a sector shock and the worst day / month of the last year.
- Optimisation: inverse-volatility ("risk equalising") weights compared with current weights.

Figures describe how today's weights would have behaved over the past year; they are not forecasts.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

BENCHMARK = "XU100"
LOOKBACK_DAYS = 400          # calendar days fetched; ~252 trading days are used
MIN_OBSERVATIONS = 120       # positions with less history are excluded from risk maths
TRADING_DAYS = 252

# Shown when the user has no holdings, so the page is never empty (weights in %).
DEMO_PORTFOLIO = {
    "THYAO": 15, "AKBNK": 14, "ASELS": 12, "BIMAS": 12, "TUPRS": 10,
    "KCHOL": 10, "EREGL": 8, "FROTO": 8, "SISE": 6, "TCELL": 5,
}
DEMO_NOTIONAL = 100_000.0


def _load_holdings(report_repo, price_service, demo: bool, account: Optional[str] = None) -> Tuple[List[Dict[str, Any]], bool]:
    items = [] if demo else (report_repo.get_user_portfolio(account) or [])
    is_demo = demo or not items
    out = []
    if is_demo:
        for t, w in DEMO_PORTFOLIO.items():
            p = (price_service.get_price(t) or {}).get("price")
            if p:
                out.append({"ticker": t, "quantity": DEMO_NOTIONAL * w / 100.0 / p, "price": p})
    else:
        # The same ticker can sit in both the real and the paper account; risk is per ticker.
        merged: Dict[str, Dict[str, Any]] = {}
        for it in items:
            t = it["ticker"]
            p = (price_service.get_price(t) or {}).get("price") or it.get("cost")
            if p and it.get("quantity"):
                row = merged.setdefault(t, {"ticker": t, "quantity": 0.0, "price": float(p)})
                row["quantity"] += float(it["quantity"])
        out = list(merged.values())
    return out, is_demo


def _price_frame(report_repo, tickers: List[str]) -> pd.DataFrame:
    marks = ",".join("?" * len(tickers))
    with report_repo._get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT ticker, date, close FROM historical_prices
            WHERE ticker IN ({marks})
              AND date >= date((SELECT MAX(date) FROM historical_prices WHERE ticker = ?), '-{LOOKBACK_DAYS} days')
            """,
            (*tickers, BENCHMARK),
        ).fetchall()
    df = pd.DataFrame([tuple(r) for r in rows], columns=["ticker", "date", "close"])
    if df.empty:
        return df
    wide = df.pivot_table(index="date", columns="ticker", values="close").sort_index()
    # Benchmark trading days define the calendar; short gaps in a stock are forward-filled.
    if BENCHMARK in wide:
        wide = wide[wide[BENCHMARK].notna()]
    return wide.ffill(limit=3).tail(TRADING_DAYS + 1)


def _max_drawdown(returns: pd.Series) -> float:
    curve = (1.0 + returns).cumprod()
    return float((curve / curve.cummax() - 1.0).min())


def _r(x: Optional[float], n: int = 4) -> Optional[float]:
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def compute_portfolio_analytics(demo: bool = False, account: Optional[str] = None) -> Dict[str, Any]:
    from globals import report_repo, price_service

    holdings, is_demo = _load_holdings(report_repo, price_service, demo, account)
    if not holdings:
        return {"is_demo": is_demo, "empty": True}

    companies = report_repo.get_all_company_info() or {}
    total_value = sum(h["quantity"] * h["price"] for h in holdings)
    for h in holdings:
        h["value"] = h["quantity"] * h["price"]
        h["weight"] = h["value"] / total_value if total_value else 0.0
        h["sector"] = (companies.get(h["ticker"]) or {}).get("sector") or "Diğer"

    tickers = [h["ticker"] for h in holdings]
    prices = _price_frame(report_repo, tickers + [BENCHMARK])
    rets = prices.pct_change().iloc[1:] if not prices.empty else pd.DataFrame()

    usable = [t for t in tickers if t in rets and rets[t].notna().sum() >= MIN_OBSERVATIONS]
    excluded = [t for t in tickers if t not in usable]
    rets = rets[usable + ([BENCHMARK] if BENCHMARK in rets else [])].dropna()

    w_all = {h["ticker"]: h["weight"] for h in holdings}
    w_used = np.array([w_all[t] for t in usable])
    covered = float(w_used.sum())
    # Risk maths runs on the positions with history, re-normalised to 100%.
    w = w_used / covered if covered > 0 else w_used

    result: Dict[str, Any] = {
        "is_demo": is_demo,
        "empty": False,
        "as_of": str(prices.index[-1]) if not prices.empty else None,
        "observations": int(len(rets)),
        "total_value": round(total_value, 2),
        "excluded": excluded,
        "coverage": _r(covered),
    }

    stock_rets = rets[usable] if usable else pd.DataFrame()
    bench = rets[BENCHMARK] if BENCHMARK in rets else None

    positions = []
    if usable and len(rets) > 20:
        cov = stock_rets.cov().values * TRADING_DAYS
        port = stock_rets.values @ w
        port_s = pd.Series(port, index=stock_rets.index)
        port_var = float(w @ cov @ w)
        port_vol = float(np.sqrt(port_var))
        contrib = (w * (cov @ w)) / port_var if port_var > 0 else np.zeros_like(w)

        beta_p = None
        if bench is not None and bench.var() > 0:
            beta_p = float(np.cov(port, bench.values)[0, 1] / bench.var())

        q05 = float(np.percentile(port, 5))
        tail = port[port <= q05]
        result["overview"] = {
            "volatility": _r(port_vol),
            "benchmark_volatility": _r(float(bench.std() * np.sqrt(TRADING_DAYS))) if bench is not None else None,
            "beta": _r(beta_p, 3),
            "var95_pct": _r(-q05),
            "var95_tl": round(-q05 * total_value * covered, 2),
            "cvar95_pct": _r(-float(tail.mean())) if len(tail) else None,
            "max_drawdown": _r(_max_drawdown(port_s)),
            "return_1y": _r(float((1 + port_s).prod() - 1)),
            "benchmark_return_1y": _r(float((1 + bench).prod() - 1)) if bench is not None else None,
        }

        for i, t in enumerate(usable):
            s = stock_rets[t]
            b = float(np.cov(s.values, bench.values)[0, 1] / bench.var()) if bench is not None and bench.var() > 0 else None
            positions.append({
                "ticker": t,
                "volatility": _r(float(s.std() * np.sqrt(TRADING_DAYS))),
                "beta": _r(b, 3),
                "risk_contribution": _r(float(contrib[i])),
            })

        corr = stock_rets.corr().round(3)
        result["correlation"] = {"tickers": usable, "matrix": corr.values.tolist()}
        off = corr.values[~np.eye(len(usable), dtype=bool)] if len(usable) > 1 else np.array([])
        result["correlation"]["average"] = _r(float(off.mean())) if off.size else None

        # Scenarios
        betas = {p["ticker"]: (p["beta"] or 0.0) for p in positions}
        scenarios = []
        for shock in (-0.20, -0.10, 0.10):
            pnl = sum(w_all[t] * betas.get(t, 1.0) * shock for t in usable)
            scenarios.append({
                "id": f"index_{int(shock * 100)}",
                "name": f"XU100 {'+' if shock > 0 else '−'}%{abs(int(round(shock * 100)))}",
                "detail": "Her pozisyon kendi betasıyla endeks hareketine tepki verir.",
                "pnl_pct": _r(pnl), "pnl_tl": round(pnl * total_value, 2),
            })
        sector_w: Dict[str, float] = {}
        for h in holdings:
            sector_w[h["sector"]] = sector_w.get(h["sector"], 0.0) + h["weight"]
        top_sector, top_sw = max(sector_w.items(), key=lambda kv: kv[1])
        scenarios.append({
            "id": "sector_shock",
            "sector": top_sector,
            "name": f"{top_sector} −%15",
            "detail": "En büyük sektör ağırlığındaki tüm hisseler %15 düşer, diğerleri sabit kalır.",
            "pnl_pct": _r(-0.15 * top_sw), "pnl_tl": round(-0.15 * top_sw * total_value, 2),
        })
        worst_day = port_s.idxmin()
        scenarios.append({
            "id": "worst_day",
            "name": "Son bir yılın en kötü günü",
            "detail": f"{worst_day} tarihindeki hareketin bugünkü ağırlıklara uygulanması.",
            "pnl_pct": _r(float(port_s.min()) * covered), "pnl_tl": round(float(port_s.min()) * covered * total_value, 2),
        })
        roll = (1 + port_s).rolling(21).apply(np.prod, raw=True) - 1
        if roll.notna().any():
            end = roll.idxmin()
            scenarios.append({
                "id": "worst_month",
                "name": "Son bir yılın en kötü ayı",
                "detail": f"{end} tarihinde biten 21 işlem gününün bugünkü ağırlıklara uygulanması.",
                "pnl_pct": _r(float(roll.min()) * covered), "pnl_tl": round(float(roll.min()) * covered * total_value, 2),
            })
        result["scenarios"] = scenarios

        # Optimisation: inverse-volatility weights over the same names
        vols = np.sqrt(np.diag(cov))
        inv = np.where(vols > 0, 1.0 / vols, 0.0)
        w_iv = inv / inv.sum() if inv.sum() > 0 else w
        result["optimization"] = {
            "method": "inverse_volatility",
            "current_volatility": _r(port_vol),
            "suggested_volatility": _r(float(np.sqrt(w_iv @ cov @ w_iv))),
            "weights": [
                {"ticker": t, "current": _r(float(w[i])), "suggested": _r(float(w_iv[i]))}
                for i, t in enumerate(usable)
            ],
        }
    else:
        result["overview"] = None

    pos_map = {p["ticker"]: p for p in positions}
    result["positions"] = sorted([
        {
            "ticker": h["ticker"],
            "sector": h["sector"],
            "value": round(h["value"], 2),
            "weight": _r(h["weight"]),
            **{k: v for k, v in pos_map.get(h["ticker"], {}).items() if k != "ticker"},
        }
        for h in holdings
    ], key=lambda p: -p["value"])

    sector_rows: Dict[str, float] = {}
    for h in holdings:
        sector_rows[h["sector"]] = sector_rows.get(h["sector"], 0.0) + h["weight"]
    weights_sorted = sorted((h["weight"] for h in holdings), reverse=True)
    hhi = sum(x * x for x in weights_sorted)
    result["concentration"] = {
        "sectors": [{"sector": s, "weight": _r(v)} for s, v in sorted(sector_rows.items(), key=lambda kv: -kv[1])],
        "top1": _r(weights_sorted[0]),
        "top3": _r(sum(weights_sorted[:3])),
        "hhi": _r(hhi),
        "effective_n": _r(1.0 / hhi if hhi else None, 1),
        "count": len(holdings),
    }
    return result
