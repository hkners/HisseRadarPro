"""
HisseRadarPro — Intrinsic value models (DCF / justified P/B)
============================================================
Simplified, fully sourced models that stay consistent in TL even though the yfinance statements
for BIST names are messy (quarterly vs. cumulative rows, some companies reporting in USD):

- TL anchors come from TL-denominated market data: market cap, P/E, P/B, margins.
    TTM net income   = market cap / trailing P/E
    TTM revenue      = net income / profit margin
    book equity      = market cap / P/B
- Statement data is only used for dimensionless ratios computed inside one statement row
  (capex / revenue, D&A / revenue, total debt / equity, cash / equity), so currency and period
  mismatches cancel out.
- Non-financials: 10-year FCFF DCF. Revenue growth fades linearly from the latest growth rate to
  terminal growth; EBIT margin = EBITDA margin - D&A share; FCFF = NOPAT + D&A - capex - ΔNWC.
- Banks, insurers and other financials: justified P/B = (ROE - g) / (COE - g).
- Reverse model: the growth (DCF) or ROE (P/B) the current price implies.
Every input is returned with its source so the UI can show it, and any input can be overridden
("Senin tezin").
"""

import logging
import math
import statistics
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

YEARS = 10
# BIST companies report under TMS 29 (inflation accounting), so margins and growth are close to real
# terms: the DCF is built in real (today's TL) terms. Banks are exempt from TMS 29 (BDDK), so their
# ROE is nominal and the justified P/B model uses nominal rates.
DEFAULTS_REAL = {
    "risk_free": 0.045,       # real TL risk-free rate
    "equity_premium": 0.065,  # includes country risk
    "debt_spread": 0.025,
    "tax_rate": 0.25,
    "terminal_growth": 0.025, # long-run real growth
    "nwc_pct_of_delta_rev": 0.10,
}
DEFAULTS_NOMINAL = {
    "risk_free": 0.28,        # nominal TL 10-year government bond yield
    "equity_premium": 0.06,
    "debt_spread": 0.03,
    "tax_rate": 0.25,
    "terminal_growth": 0.15,  # long-run nominal growth (expected inflation + real growth)
    "nwc_pct_of_delta_rev": 0.10,
}
FINANCIAL_HINTS = ("bank", "insurance", "capital markets", "credit services", "asset management", "mortgage", "financial conglomerate")


# --------------------------------------------------------------------------- inputs

def _num(v) -> Optional[float]:
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _row_ratios(num_stmt: Dict, num_key: str, den_stmt: Dict, den_key: str) -> List[float]:
    """num/den for each date present in both statements (same currency and period by construction)."""
    if not num_stmt or not den_stmt or num_key not in num_stmt or den_key not in den_stmt:
        return []
    den_by_date = dict(zip(den_stmt.get("dates") or [], den_stmt[den_key]))
    out = []
    for d, n in zip(num_stmt.get("dates") or [], num_stmt[num_key]):
        dv = _num(den_by_date.get(d))
        nv = _num(n)
        if nv is not None and dv not in (None, 0):
            out.append(nv / dv)
    return out


def _median(vals: List[float], lo: float, hi: float) -> Optional[float]:
    vals = [v for v in vals if v is not None and math.isfinite(v)]
    return max(lo, min(hi, statistics.median(vals))) if vals else None


def _beta(ticker: str) -> Tuple[float, str]:
    try:
        from globals import report_repo
        from services.portfolio_analytics import _price_frame
        frame = _price_frame(report_repo, [ticker, "XU100"])
        rets = frame.pct_change().dropna()
        if len(rets) >= 120 and rets["XU100"].var() > 0:
            b = float(rets[ticker].cov(rets["XU100"]) / rets["XU100"].var())
            return max(0.7, min(1.8, b)), f"Son {len(rets)} işlem gününün XU100'e göre betası (0,7–1,8 aralığına sınırlandı)"
    except Exception:
        pass
    return 1.0, "Beta hesaplanamadı, 1,0 varsayıldı"


def gather_inputs(ticker: str) -> Dict[str, Any]:
    from globals import report_repo, price_service
    info = report_repo.get_company_info(ticker) or {}
    f = info.get("fundamentals") or {}
    price = _num((price_service.prices.get(ticker) or {}).get("price"))
    mcap = _num(f.get("marketCap"))
    industry = (f.get("industry") or "")
    sector = info.get("sector") or ""
    is_fin = sector == "Financial Services" and any(h in industry.lower() for h in FINANCIAL_HINTS)

    inc, cf, bs = f.get("income_statement") or {}, f.get("cash_flow") or {}, f.get("balance_sheet") or {}
    pe, pb = _num(f.get("trailingPE")), _num(f.get("priceToBook"))
    margin, ebitda_m = _num(f.get("profitMargins")), _num(f.get("ebitdaMargins"))
    growth, roe = _num(f.get("revenueGrowth")), _num(f.get("returnOnEquity"))

    beta, beta_src = _beta(ticker)
    sources: Dict[str, str] = {"beta": beta_src}
    x: Dict[str, Any] = {
        "ticker": ticker, "industry": industry, "sector": sector, "price": price, "market_cap": mcap,
        "model": "justified_pb" if is_fin else "dcf", "beta": beta,
        **(DEFAULTS_NOMINAL if is_fin else DEFAULTS_REAL),
    }
    if is_fin:
        sources.update({
            "risk_free": "Varsayılan nominal TL 10 yıllık tahvil getirisi yaklaşığı. Kendi tahminini girebilirsin.",
            "equity_premium": "Varsayılan hisse senedi risk primi.",
            "terminal_growth": "Varsayılan uzun dönem nominal büyüme (beklenen enflasyon + reel büyüme).",
        })
    else:
        sources.update({
            "risk_free": "Varsayılan reel risksiz getiri. Model TMS 29 tablolarıyla tutarlı olsun diye reel (bugünkü TL) bazdadır.",
            "equity_premium": "Varsayılan hisse senedi risk primi (ülke riski dahil).",
            "terminal_growth": "Varsayılan uzun dönem reel büyüme.",
        })
    sources["tax_rate"] = "Kurumlar vergisi oranı."
    x["shares"] = (mcap / price) if mcap and price else None
    sources["shares"] = "Piyasa değeri / fiyat"
    x["book_equity"] = (mcap / pb) if mcap and pb and pb > 0 else None
    sources["book_equity"] = "Piyasa değeri / PD/DD"

    debt_to_eq = _median(_row_ratios(bs, "Total Debt", bs, "Stockholders Equity"), 0, 10)
    cash_to_eq = _median(_row_ratios(bs, "Cash Cash Equivalents And Short Term Investments", bs, "Stockholders Equity")
                         or _row_ratios(bs, "Cash And Cash Equivalents", bs, "Stockholders Equity"), 0, 10)
    minority_to_eq = _median(_row_ratios(bs, "Minority Interest", bs, "Stockholders Equity"), 0, 1) or 0.0
    be = x["book_equity"] or 0
    x["total_debt"] = (debt_to_eq or 0) * be
    x["cash"] = (cash_to_eq or 0) * be
    x["minority"] = minority_to_eq * be
    sources["total_debt"] = "Bilançodaki toplam borç / özkaynak oranının medyanı × TL defter değeri"
    sources["cash"] = "Bilançodaki nakit / özkaynak oranının medyanı × TL defter değeri"

    if is_fin:
        x["roe"] = roe
        sources["roe"] = "Son 12 ay özkaynak kârlılığı (yfinance)"
        x["model_ok"] = bool(roe is not None and x["book_equity"] and x["shares"])
        x["model_note"] = None if x["model_ok"] else "ROE veya defter değeri eksik olduğu için model kurulamadı."
    else:
        ni = (mcap / pe) if mcap and pe and pe > 0 else None
        # yfinance's summary margins are unreliable for BIST; the statement rows are not.
        stmt_net = _median(_row_ratios(inc, "Net Income", inc, "Total Revenue"), -1, 1)
        stmt_op = _median(_row_ratios(inc, "Operating Income", inc, "Total Revenue") or _row_ratios(inc, "EBIT", inc, "Total Revenue"), -0.3, 0.6)
        net_m = stmt_net if stmt_net and stmt_net > 0.005 else margin
        rev = (ni / net_m) if ni and net_m and net_m > 0 else None
        x["net_income_ttm"], x["revenue_ttm"] = ni, rev
        sources["net_income_ttm"] = "Piyasa değeri / F/K (TL, son 12 ay)"
        sources["revenue_ttm"] = ("Net kâr / gelir tablosundaki net marj medyanı (TL, son 12 ay)" if net_m is stmt_net
                                  else "Net kâr / net kâr marjı (TL, son 12 ay)")
        da = _median(_row_ratios(cf, "Depreciation And Amortization", inc, "Total Revenue"), 0, 0.3)
        capex = _median([abs(v) for v in _row_ratios(cf, "Capital Expenditure", inc, "Total Revenue")], 0, 0.6)
        tax = _median(_row_ratios(inc, "Tax Provision", inc, "Pretax Income"), 0.15, 0.30)
        x["da_pct"] = da if da is not None else 0.03
        x["capex_pct"] = capex if capex is not None else max(x["da_pct"], 0.04)
        if tax is not None:
            x["tax_rate"] = tax
            sources["tax_rate"] = "Gelir tablosundaki vergi / vergi öncesi kâr oranının medyanı (%15–30 aralığına sınırlandı)"
        sources["da_pct"] = "Amortisman / gelir oranının medyanı (nakit akım ve gelir tablosu)" if da is not None else "Veri yok, %3 varsayıldı"
        sources["capex_pct"] = "Yatırım harcaması / gelir oranının medyanı" if capex is not None else "Veri yok, amortismana eşit varsayıldı"
        # Under TMS 29 net income includes monetary gains, so the EBITDA route is preferred for the
        # operating margin; net margin is only a fallback when EBITDA is missing.
        if stmt_op is not None:
            ebit_m = stmt_op
            sources["ebit_margin"] = "Gelir tablosundaki faaliyet kârı / gelir oranının medyanı"
        elif ebitda_m:
            ebit_m = ebitda_m - x["da_pct"]
            sources["ebit_margin"] = "FAVÖK marjı − amortisman payı"
        elif margin:
            ebit_m = margin / (1 - x["tax_rate"])
            sources["ebit_margin"] = "FAVÖK verisi yok: net marj / (1 − vergi) yaklaşımı"
        else:
            ebit_m = None
        x["ebit_margin"] = max(-0.2, min(0.5, ebit_m)) if ebit_m is not None else None
        x["growth_y1"] = max(-0.10, min(0.20, growth)) if growth is not None else x["terminal_growth"]
        sources["growth_y1"] = "Son raporlanan yıllık gelir büyümesi (reel model için −%10 ile %20 arasına sınırlandı)" if growth is not None else "Veri yok, uç büyümeye eşit"
        x["capex_terminal_pct"] = x["da_pct"] + 0.01
        sources["capex_terminal_pct"] = "Yatırım harcaması 10 yılda amortisman + %1 seviyesine yakınsar (olgunluk varsayımı)"
        sources["nwc_pct_of_delta_rev"] = "Varsayılan: gelir artışının %10'u işletme sermayesine bağlanır"
        problems = []
        if "conglomerate" in industry.lower():
            problems.append("holdingler için konsolide borç ve iştirak yapısı nedeniyle DCF anlamlı değil; net aktif değer (NAV) yöntemi gerekir")
        elif not rev:
            problems.append("şirket son 12 ayda zarar ettiği ya da F/K/marj verisi eksik olduğu için TL gelir türetilemedi")
        if not x["shares"]:
            problems.append("hisse sayısı bulunamadı")
        if x.get("ebit_margin") is None and not problems:
            problems.append("faaliyet marjı verisi yok")
        x["model_ok"] = not problems
        x["model_note"] = ("DCF uygulanamadı: " + ", ".join(problems) + ".") if problems else None
    x["sources"] = sources
    return x


# --------------------------------------------------------------------------- models

def _cost_of_capital(x: Dict[str, Any]) -> Dict[str, float]:
    coe = x["risk_free"] + x["beta"] * x["equity_premium"]
    kd = (x["risk_free"] + x["debt_spread"]) * (1 - x["tax_rate"])
    e = x.get("market_cap") or 0
    d = x.get("total_debt") or 0
    wd = d / (d + e) if (d + e) > 0 else 0.0
    wacc = x.get("wacc_override") or (coe * (1 - wd) + kd * wd)
    return {"cost_of_equity": coe, "cost_of_debt_after_tax": kd, "debt_weight": wd, "wacc": wacc}


def _dcf_value(x: Dict[str, Any], growth_y1: Optional[float] = None, margin_shift: float = 0.0,
               wacc: Optional[float] = None, g_term: Optional[float] = None) -> Dict[str, Any]:
    cc = _cost_of_capital(x)
    r = wacc if wacc is not None else cc["wacc"]
    gt = g_term if g_term is not None else x["terminal_growth"]
    g1 = growth_y1 if growth_y1 is not None else x["growth_y1"]
    if r - gt < 0.02:
        gt = r - 0.02
    margin = x["ebit_margin"] + margin_shift
    rev_prev = x["revenue_ttm"]
    rows, pv_sum = [], 0.0
    for t in range(1, YEARS + 1):
        g = g1 + (gt - g1) * (t - 1) / (YEARS - 1)
        rev = rev_prev * (1 + g)
        ebit = rev * margin
        nopat = ebit * (1 - x["tax_rate"])
        da = rev * x["da_pct"]
        capex_pct = x["capex_pct"] + (x.get("capex_terminal_pct", x["capex_pct"]) - x["capex_pct"]) * (t - 1) / (YEARS - 1)
        capex = rev * capex_pct
        dnwc = (rev - rev_prev) * x["nwc_pct_of_delta_rev"]
        fcff = nopat + da - capex - dnwc
        df = 1 / (1 + r) ** t
        pv_sum += fcff * df
        rows.append({"year": t, "growth": g, "revenue": rev, "ebit": ebit, "nopat": nopat, "da": da, "capex": capex,
                     "delta_nwc": dnwc, "fcff": fcff, "discount_factor": df, "pv": fcff * df})
        rev_prev = rev
    last = rows[-1]
    fcff_next = last["fcff"] * (1 + gt)
    tv = fcff_next / (r - gt)
    pv_tv = tv * last["discount_factor"]
    ev = pv_sum + pv_tv
    equity = ev - x["total_debt"] + x["cash"] - x["minority"]
    per_share = equity / x["shares"] if x["shares"] else None
    return {"rows": rows, "wacc": r, "terminal_growth": gt, "growth_y1": g1, "ebit_margin": margin, "pv_fcff": pv_sum,
            "terminal_value": tv, "pv_terminal": pv_tv, "enterprise_value": ev, "equity_value": equity,
            "per_share": per_share, "terminal_share": pv_tv / ev if ev else None}


def _pb_value(x: Dict[str, Any], roe: Optional[float] = None, coe: Optional[float] = None, g: Optional[float] = None) -> Dict[str, Any]:
    cc = _cost_of_capital(x)
    k = coe if coe is not None else (x.get("coe_override") or cc["cost_of_equity"])
    gt = g if g is not None else x["terminal_growth"]
    if k - gt < 0.02:
        gt = k - 0.02
    r = roe if roe is not None else x["roe"]
    pb = (r - gt) / (k - gt)
    bvps = x["book_equity"] / x["shares"]
    return {"cost_of_equity": k, "terminal_growth": gt, "roe": r, "justified_pb": pb, "bvps": bvps, "per_share": max(0.0, pb * bvps)}


def _solve(fn, target: float, lo: float, hi: float) -> Optional[float]:
    """Bisection for fn(v) = target on an increasing fn."""
    f_lo, f_hi = fn(lo) - target, fn(hi) - target
    if f_lo * f_hi > 0:
        return None
    for _ in range(80):
        mid = (lo + hi) / 2
        f_mid = fn(mid) - target
        if abs(f_mid) < 1e-6 * max(1.0, abs(target)):
            return mid
        if f_lo * f_mid <= 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


def build_model(ticker: str, overrides: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    x = gather_inputs(ticker.upper())
    base_inputs = {k: x.get(k) for k in ("risk_free", "equity_premium", "beta", "terminal_growth", "tax_rate",
                                         "growth_y1", "ebit_margin", "capex_pct", "da_pct", "roe")}
    result: Dict[str, Any] = {
        "ticker": x["ticker"], "model": x["model"], "price": x["price"], "industry": x["industry"],
        "model_ok": x["model_ok"], "model_note": x["model_note"], "sources": x["sources"],
        "inputs": base_inputs,
        "balance": {k: x.get(k) for k in ("market_cap", "shares", "book_equity", "total_debt", "cash", "minority",
                                          "revenue_ttm", "net_income_ttm")},
    }
    if not x["model_ok"]:
        return result

    def run(xx: Dict[str, Any]) -> Dict[str, Any]:
        cc = _cost_of_capital(xx)
        if xx["model"] == "dcf":
            base = _dcf_value(xx)
            bear = _dcf_value(xx, growth_y1=xx["growth_y1"] - 0.15, margin_shift=-0.03)
            bull = _dcf_value(xx, growth_y1=xx["growth_y1"] + 0.15, margin_shift=+0.03)
            waccs = [base["wacc"] + d for d in (-0.04, -0.02, 0, 0.02, 0.04)]
            gs = [base["terminal_growth"] + d for d in (-0.04, -0.02, 0, 0.02, 0.04)]
            grid = [[_dcf_value(xx, wacc=w, g_term=g)["per_share"] if w - g >= 0.02 else None for g in gs] for w in waccs]
            implied_g = implied_m = None
            if xx["price"]:
                implied_g = _solve(lambda v: _dcf_value(xx, growth_y1=v)["per_share"], xx["price"], -0.6, 3.0)
                shift = _solve(lambda v: _dcf_value(xx, margin_shift=v)["per_share"], xx["price"], -0.8, 0.8)
                implied_m = xx["ebit_margin"] + shift if shift is not None else None
            ratio = (base["per_share"] / xx["price"]) if base["per_share"] is not None and xx["price"] else None
            return {"cost_of_capital": cc, "base": base, "scenarios": {"bear": bear["per_share"], "base": base["per_share"], "bull": bull["per_share"]},
                    "sensitivity": {"rows_label": "AOSM", "cols_label": "Uç büyüme", "rows": waccs, "cols": gs, "values": grid},
                    "reverse": {"label": "Fiyatın ima ettiği ilk yıl gelir büyümesi", "value": implied_g, "current": xx["growth_y1"],
                                "margin_label": "Fiyatın ima ettiği kalıcı faaliyet marjı", "margin_value": implied_m, "margin_current": xx["ebit_margin"]},
                    "extreme": ratio is None or ratio <= 0 or ratio < 0.25 or ratio > 4}
        base = _pb_value(xx)
        bear = _pb_value(xx, roe=(xx["roe"] or 0) - 0.05)
        bull = _pb_value(xx, roe=(xx["roe"] or 0) + 0.05)
        coes = [base["cost_of_equity"] + d for d in (-0.04, -0.02, 0, 0.02, 0.04)]
        gs = [base["terminal_growth"] + d for d in (-0.04, -0.02, 0, 0.02, 0.04)]
        grid = [[_pb_value(xx, coe=k, g=g)["per_share"] if k - g >= 0.02 else None for g in gs] for k in coes]
        implied = None
        if xx["price"]:
            implied = _solve(lambda v: _pb_value(xx, roe=v)["justified_pb"] * base["bvps"], xx["price"], -0.5, 3.0)
        ratio = (base["per_share"] / xx["price"]) if xx["price"] else None
        return {"cost_of_capital": cc, "base": base, "scenarios": {"bear": bear["per_share"], "base": base["per_share"], "bull": bull["per_share"]},
                "extreme": ratio is None or ratio <= 0 or ratio < 0.25 or ratio > 4,
                "sensitivity": {"rows_label": "Özkaynak maliyeti", "cols_label": "Uç büyüme", "rows": coes, "cols": gs, "values": grid},
                "reverse": {"label": "Fiyatın ima ettiği sürdürülebilir özkaynak kârlılığı", "value": implied, "current": xx["roe"]}}

    result["base_model"] = run(x)
    if overrides:
        xt = dict(x)
        for k, v in overrides.items():
            if v is None:
                continue
            if k == "wacc":
                xt["wacc_override"] = float(v)
            elif k == "cost_of_equity":
                xt["coe_override"] = float(v)
            elif k in base_inputs:
                xt[k] = float(v)
        result["thesis_model"] = run(xt)
        result["thesis_inputs"] = {k: xt.get(k) for k in base_inputs} | {"wacc": overrides.get("wacc"), "cost_of_equity": overrides.get("cost_of_equity")}
    return result
