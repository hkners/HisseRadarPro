"""
HisseRadarPro — Factor exposure, attribution and hedge ideas for the portfolio
==============================================================================
Factors (daily, last ~252 trading days, liquid universe with ≥5M TL average turnover):
- Piyasa:        XU100 daily return.
- Büyüklük:      small minus big — equal-weight return of the smallest third by market cap minus the largest third.
- Momentum:      winners minus losers on 12-1 month momentum, groups re-formed at each month start.
- Düşük oynaklık: low minus high 90-day volatility, groups re-formed at each month start.
Size groups use today's market caps (a mild look-ahead, stated in the response). The portfolio's daily
return with today's weights is regressed on the four factors (OLS): exposures, R², the return each
factor explains over the year, the unexplained (alpha) part and the factor vs. company-specific risk split.

Hedge ideas, each with its effect on volatility and beta:
1. Index hedge: XU100 short notional that brings beta to zero (e.g. via VİOP index futures).
2. Trim the largest risk contributor to equal-weight and redistribute.
3. Diversifiers: liquid stocks with the lowest correlation to the portfolio; effect of a 10% sleeve.
These are risk illustrations, not trade recommendations.
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

LOOKBACK = 252
MIN_TURNOVER = 5_000_000
def _tr(v: float, digits: int = 1) -> str:
    return f"{v:.{digits}f}".replace(".", ",")


FACTOR_LABELS = {
    "market": "Piyasa (XU100)",
    "size": "Büyüklük (küçük − büyük)",
    "momentum": "Momentum (kazananlar − kaybedenler)",
    "low_vol": "Düşük oynaklık (düşük − yüksek)",
}


def _spread(rets: pd.DataFrame, signal: pd.DataFrame, liquid: pd.DataFrame, month_starts, high_minus_low: bool = True) -> pd.Series:
    """Long top third minus short bottom third, groups re-formed at each month start from the previous day's signal."""
    out = pd.Series(0.0, index=rets.index)
    idx = rets.index
    for k, start in enumerate(month_starts):
        end = month_starts[k + 1] if k + 1 < len(month_starts) else None
        pos = idx.get_loc(start)
        if pos == 0:
            continue
        sig_day = idx[pos - 1]
        s = signal.loc[sig_day][liquid.loc[sig_day]].dropna()
        if len(s) < 30:
            continue
        lo, hi = s.quantile(1 / 3), s.quantile(2 / 3)
        top, bottom = s[s >= hi].index, s[s <= lo].index
        window = rets.loc[start:end].iloc[:-1] if end is not None else rets.loc[start:]
        spread = window[top].mean(axis=1) - window[bottom].mean(axis=1)
        if not high_minus_low:
            spread = -spread
        out.loc[spread.index] = spread.fillna(0.0)
    return out


def _factor_returns() -> pd.DataFrame:
    from services.backtest_engine import _load_frames
    from services.screener_universe import get_universe

    d = _load_frames()
    rets: pd.DataFrame = d["rets"].iloc[-LOOKBACK - 1:]
    f = d["factors"]
    liquid = (f["turnover20"].reindex(rets.index).fillna(0) >= MIN_TURNOVER)
    month_starts = list(pd.Series(rets.index, index=rets.index).groupby(rets.index.to_period("M")).first())

    caps = {r["ticker"]: r.get("market_cap") for r in get_universe()["rows"] if r.get("market_cap")}
    cap_signal = pd.DataFrame([caps] * len(rets.index), index=rets.index).reindex(columns=rets.columns)

    factors = pd.DataFrame(index=rets.index)
    factors["market"] = rets["XU100"] if "XU100" in rets else rets.mean(axis=1)
    factors["size"] = _spread(rets, cap_signal, liquid, month_starts, high_minus_low=False)
    factors["momentum"] = _spread(rets, f["mom_12_1"].reindex(rets.index), liquid, month_starts)
    factors["low_vol"] = _spread(rets, f["vol_90"].reindex(rets.index), liquid, month_starts, high_minus_low=False)
    return factors.iloc[1:].fillna(0.0)


def compute(account: Optional[str] = None, demo: bool = False) -> Dict[str, Any]:
    from globals import report_repo, price_service
    from services.backtest_engine import _load_frames
    from services.portfolio_analytics import _load_holdings
    from services.screener_universe import get_universe

    holdings, is_demo = _load_holdings(report_repo, price_service, demo, account)
    if not holdings:
        return {"empty": True, "is_demo": is_demo}
    total = sum(h["quantity"] * h["price"] for h in holdings)
    weights = {h["ticker"]: h["quantity"] * h["price"] / total for h in holdings}

    d = _load_frames()
    rets_all: pd.DataFrame = d["rets"]
    factors = _factor_returns()
    idx = factors.index
    names = [t for t in weights if t in rets_all.columns]
    w = np.array([weights[t] for t in names])
    w = w / w.sum()
    R = rets_all.loc[idx, names].fillna(0.0)
    port = pd.Series(R.values @ w, index=idx)

    # OLS: port = a + B·F + e
    X = np.column_stack([np.ones(len(idx)), factors.values])
    coef, *_ = np.linalg.lstsq(X, port.values, rcond=None)
    fitted = X @ coef
    resid = port.values - fitted
    ss_tot = ((port.values - port.values.mean()) ** 2).sum()
    r2 = 1 - (resid ** 2).sum() / ss_tot if ss_tot > 0 else None
    betas = dict(zip(factors.columns, coef[1:]))
    annual = 252
    exposures = []
    for k in factors.columns:
        contrib = betas[k] * factors[k].sum()
        exposures.append({
            "factor": k, "label": FACTOR_LABELS[k], "beta": float(betas[k]),
            "factor_return": float((1 + factors[k]).prod() - 1),
            "contribution": float(contrib),
        })
    total_ret = float((1 + port).prod() - 1)
    alpha_contrib = float(coef[0] * len(idx) + resid.sum())
    var_total = float(port.var())
    var_specific = float(np.var(resid, ddof=1))

    # ---------------- hedges
    cov = R.cov().values * annual
    port_vol = float(np.sqrt(w @ cov @ w))
    mkt = factors["market"]
    beta_mkt = float(np.cov(port, mkt)[0, 1] / mkt.var()) if mkt.var() > 0 else None
    hedges: List[Dict[str, Any]] = []
    if beta_mkt is not None:
        hedged = port - beta_mkt * mkt
        hedges.append({
            "id": "index",
            "title": "Endeks hedge'i",
            "action": f"Portföy değerinin {_tr(beta_mkt, 2)} katı kadar XU100 açığı (ör. VİOP endeks vadelisi)",
            "notional_tl": float(beta_mkt * total),
            "vol_before": port_vol, "vol_after": float(hedged.std() * np.sqrt(annual)),
            "beta_before": beta_mkt, "beta_after": 0.0,
            "note": "Piyasa yönü riskini kaldırır, hisse seçiminden gelen getiri ve risk kalır. Vadeli işlemde teminat, vade farkı ve dönüşüm maliyeti vardır.",
        })
    contrib = (w * (cov @ w)) / (w @ cov @ w)
    top = int(np.argmax(contrib))
    if len(w) >= 3 and contrib[top] > 1.15 / len(w):
        w2 = w.copy()
        target = 1 / len(w)
        excess = w2[top] - target
        if excess > 0:
            w2[top] = target
            others = np.arange(len(w)) != top
            w2[others] += excess * w2[others] / w2[others].sum()
        # Only worth suggesting when it moves volatility by at least half a point.
        if excess > 0 and port_vol - float(np.sqrt(w2 @ cov @ w2)) >= 0.005:
            hedges.append({
                "id": "trim",
                "title": f"{names[top]} pozisyonunu kırp",
                "action": f"{names[top]} ağırlığını %{_tr(w[top] * 100)} seviyesinden %{_tr(target * 100)} seviyesine indir, farkı diğerlerine oransal dağıt",
                "vol_before": port_vol, "vol_after": float(np.sqrt(w2 @ cov @ w2)),
                "beta_before": beta_mkt, "beta_after": float(np.cov(R.values @ w2, mkt)[0, 1] / mkt.var()) if mkt.var() > 0 else None,
                "note": f"{names[top]} toplam riskin %{_tr(contrib[top] * 100, 0)} kadarını taşıyor; ağırlığı %{_tr(w[top] * 100, 0)}.",
            })

    liquid_now = d["factors"]["turnover20"].iloc[-1]
    universe = {r["ticker"]: r for r in get_universe()["rows"]}
    # Meaningful diversifiers only: sizeable, liquid names without data-quality flags.
    cands = [t for t in rets_all.columns
             if t not in names and t != "XU100" and liquid_now.get(t, 0) >= 50_000_000
             and (universe.get(t, {}).get("market_cap") or 0) >= 10e9 and not universe.get(t, {}).get("data_flags")]
    C = rets_all.loc[idx, cands]
    good = C.notna().sum() >= int(0.8 * len(idx))
    C = C.loc[:, good].fillna(0.0)
    if C.shape[1]:
        pc = port - port.mean()
        cc = C - C.mean()
        corr = (cc.values.T @ pc.values) / (np.sqrt((cc.values ** 2).sum(axis=0)) * np.sqrt((pc.values ** 2).sum()))
        # Rank by the portfolio volatility after a 10% sleeve: rewards low correlation without
        # favouring wildly volatile names. Names above 60% annual volatility are left out.
        var_p = float(port.var())
        var_c = C.var().values
        cov_pc = (cc.values.T @ pc.values) / (len(idx) - 1)
        vol_after = np.sqrt(0.81 * var_p + 0.01 * var_c + 0.18 * cov_pc) * np.sqrt(annual)
        vol_c = np.sqrt(var_c) * np.sqrt(annual)
        vol_after = np.where(vol_c <= 0.60, vol_after, np.inf)
        order = [i for i in np.argsort(vol_after)[:5] if np.isfinite(vol_after[i])]
        divs = []
        for i in order:
            t = C.columns[i]
            sleeve = 0.10
            combo = (1 - sleeve) * port + sleeve * C[t]
            u = universe.get(t, {})
            divs.append({
                "ticker": t, "name": u.get("name"), "sector": u.get("sector"),
                "correlation": float(corr[i]),
                "beta": float(np.cov(C[t], mkt)[0, 1] / mkt.var()) if mkt.var() > 0 else None,
                "volatility": float(C[t].std() * np.sqrt(annual)),
                "vol_with_10pct": float(combo.std() * np.sqrt(annual)),
                "score": u.get("score"),
            })
        hedges.append({
            "id": "diversify",
            "title": "Çeşitlendirme adayları",
            "action": "Portföye %10 ağırlıkla eklendiğinde volatiliteyi en çok düşüren likit hisseler (düşük korelasyon, makul oynaklık)",
            "vol_before": port_vol,
            "candidates": divs,
            "note": "Düşük korelasyon geçmişe dayanır ve değişebilir. Bu bir alım önerisi değil, risk çeşitlendirmesi örneğidir.",
        })

    return {
        "is_demo": is_demo,
        "empty": False,
        "period": f"{idx[0].date().isoformat()} – {idx[-1].date().isoformat()}",
        "observations": len(idx),
        "r2": r2,
        "exposures": exposures,
        "total_return": total_ret,
        "alpha_contribution": alpha_contrib,
        "risk_split": {"factor": max(0.0, 1 - var_specific / var_total) if var_total else None,
                       "specific": min(1.0, var_specific / var_total) if var_total else None},
        "factor_vol": {k: float(factors[k].std() * np.sqrt(annual)) for k in factors.columns},
        "hedges": hedges,
        "notes": [
            "Faktörler son bir yılın BIST verisinden kurulur; büyüklük grupları bugünkü piyasa değerleriyle oluşturulur.",
            "Maruziyetler bugünkü ağırlıklarla geriye dönük regresyondur; geleceği garanti etmez.",
        ],
    }
