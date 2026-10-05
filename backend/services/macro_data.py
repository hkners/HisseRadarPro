"""
HisseRadarPro — Macro data (official TCMB tables and market FX/gold)
====================================================================
Stored in SQLite table macro_series(series, date, value):
- cpi_mom / cpi_yoy : TÜFE monthly and annual % change (TCMB inflation table, from 2005). Dated on the
                      first day of the month they describe; a month is published around the 3rd of the
                      next month, so point-in-time users take it from the 5th of the next month.
- cpi_index         : chained from cpi_mom, 2005-01 = 100 (end of month level).
- policy_rate       : TCMB one-week repo rate, dated on each change (TCMB policy-rate table, from 2010).
- usdtry, eurtry    : daily close (yfinance).
- gold_try_gram     : gram gold in TL = gold USD/oz x USDTRY / 31.1035 (yfinance GC=F).

Helpers convert nominal TL values or curves into real (TÜFE-deflated) and USD terms.
"""

import datetime
import io
import logging
import threading
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

CPI_URL = "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri/Tuketici+Fiyatlari"
POLICY_URL = ("https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/"
              "Merkez+Bankasi+Faiz+Oranlari/1+Hafta+Repo")
HEADERS = {"User-Agent": "Mozilla/5.0 (HisseRadarPro macro sync)"}
CPI_PUBLICATION_DAY = 5
_lock = threading.Lock()
_cache: Dict[str, Any] = {"key": None, "frames": None}


def _conn():
    from globals import report_repo
    return report_repo._get_connection()


def _ensure_table() -> None:
    with _conn() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS macro_series (
            series TEXT NOT NULL, date TEXT NOT NULL, value REAL, PRIMARY KEY (series, date))""")
        conn.commit()


def _store(series: str, values: pd.Series) -> int:
    rows = [(series, str(d)[:10], float(v)) for d, v in values.items() if v is not None and np.isfinite(v)]
    if not rows:
        return 0
    with _lock, _conn() as conn:
        conn.executemany("""INSERT INTO macro_series (series, date, value) VALUES (?, ?, ?)
                            ON CONFLICT(series, date) DO UPDATE SET value = excluded.value""", rows)
        conn.commit()
    return len(rows)


def _num(x: Any) -> Optional[float]:
    try:
        return float(str(x).replace(",", ".").replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _fetch_cpi() -> Dict[str, pd.Series]:
    import requests
    html = requests.get(CPI_URL, headers=HEADERS, timeout=30).text
    tab = pd.read_html(io.StringIO(html))[0]
    tab.columns = ["period", "yoy", "mom"]
    tab["date"] = pd.to_datetime(tab["period"].astype(str).str.strip(), format="%m-%Y", errors="coerce")
    tab = tab.dropna(subset=["date"]).sort_values("date")
    yoy = pd.Series([_num(v) for v in tab["yoy"]], index=tab["date"])
    mom = pd.Series([_num(v) for v in tab["mom"]], index=tab["date"])
    index = (1 + mom.fillna(0) / 100).cumprod() * 100
    return {"cpi_yoy": yoy, "cpi_mom": mom, "cpi_index": index}


def _fetch_policy() -> pd.Series:
    import requests
    html = requests.get(POLICY_URL, headers=HEADERS, timeout=30).text
    tab = pd.read_html(io.StringIO(html))[0]
    tab = tab.iloc[1:] if str(tab.iloc[0, 0]).strip().lower().startswith("tarih") else tab
    dates = pd.to_datetime(tab.iloc[:, 0].astype(str).str.strip(), format="%d.%m.%Y", errors="coerce")
    lend = [_num(v) for v in tab.iloc[:, 2]]
    s = pd.Series(lend, index=dates).dropna()
    return s[~s.index.isna()].sort_index()


def _fetch_market(period: str) -> Dict[str, pd.Series]:
    import yfinance as yf
    data = yf.download(["USDTRY=X", "EURTRY=X", "GC=F"], period=period, progress=False, auto_adjust=True, threads=True)
    close = data["Close"] if "Close" in data else data
    close.index = pd.to_datetime(close.index).tz_localize(None)
    usd = close.get("USDTRY=X")
    out = {"usdtry": usd, "eurtry": close.get("EURTRY=X")}
    if usd is not None and "GC=F" in close:
        out["gold_try_gram"] = close["GC=F"] * usd.ffill(limit=5) / 31.1035
    # yfinance has a few bad USDTRY prints (e.g. a stale pre-2005 scale); drop daily jumps above 25%.
    for k, s in out.items():
        if s is not None:
            s = s.dropna()
            jump = s.pct_change().abs() > 0.25
            out[k] = s[~(jump | jump.shift(-1, fill_value=False))]
    return out


def sync(full: bool = False) -> Dict[str, Any]:
    """Refreshes every series; the first run downloads full history."""
    _ensure_table()
    with _conn() as conn:
        have = conn.execute("SELECT COUNT(*) FROM macro_series WHERE series = 'usdtry'").fetchone()[0]
    result: Dict[str, Any] = {}
    try:
        for k, s in _fetch_cpi().items():
            result[k] = _store(k, s)
    except Exception as e:
        result["cpi_error"] = str(e)[:200]
        logger.warning(f"Macro: CPI fetch failed: {e}")
    try:
        result["policy_rate"] = _store("policy_rate", _fetch_policy())
    except Exception as e:
        result["policy_error"] = str(e)[:200]
        logger.warning(f"Macro: policy rate fetch failed: {e}")
    try:
        for k, s in _fetch_market("max" if full or not have else "3mo").items():
            if s is not None:
                result[k] = _store(k, s)
    except Exception as e:
        result["market_error"] = str(e)[:200]
        logger.warning(f"Macro: FX/gold fetch failed: {e}")
    _cache["key"] = None
    return result


def series(name: str) -> pd.Series:
    _ensure_table()
    with _conn() as conn:
        rows = conn.execute("SELECT date, value FROM macro_series WHERE series = ? ORDER BY date", (name,)).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    return pd.Series([r[1] for r in rows], index=pd.to_datetime([r[0] for r in rows]))


def daily_frames(index: pd.DatetimeIndex) -> Dict[str, pd.Series]:
    """Macro values on a daily index.
    cpi_level: end-of-month CPI interpolated geometrically within months (for real-return reporting).
    cpi_yoy_known / cpi_mom_known: last figure published by that date (point in time, for models).
    policy_rate: rate in force; usdtry, gold_try_gram: last close."""
    key = (str(index[0]), str(index[-1]), len(index))
    if _cache["key"] == key:
        return _cache["frames"]
    out: Dict[str, pd.Series] = {}
    cpi = series("cpi_index")
    if len(cpi):
        eom = pd.Series(cpi.values, index=cpi.index + pd.offsets.MonthEnd(0))
        start = pd.Series([100.0], index=[eom.index[0] - pd.offsets.MonthEnd(1)])
        level = pd.concat([start, eom]).sort_index()
        full = level.reindex(level.index.union(index)).sort_index()
        out["cpi_level"] = np.exp(np.log(full).interpolate(method="time")).reindex(index).ffill()
    for name, src in (("cpi_yoy_known", "cpi_yoy"), ("cpi_mom_known", "cpi_mom")):
        s = series(src)
        if len(s):
            known = pd.Series(s.values, index=s.index + pd.offsets.MonthBegin(1) + pd.Timedelta(days=CPI_PUBLICATION_DAY - 1))
            out[name] = known.reindex(known.index.union(index)).sort_index().ffill().reindex(index)
    for name in ("policy_rate", "usdtry", "eurtry", "gold_try_gram"):
        s = series(name)
        if len(s):
            out[name] = s.reindex(s.index.union(index)).sort_index().ffill().reindex(index)
    _cache["key"], _cache["frames"] = key, out
    return out


def deflate_curve(curve: pd.Series) -> Dict[str, Optional[pd.Series]]:
    """A nominal TL value curve expressed in real TL (today's prices of the first date) and in USD."""
    idx = pd.DatetimeIndex(curve.index)
    m = daily_frames(idx)
    out: Dict[str, Optional[pd.Series]] = {"real": None, "usd": None}
    cpi = m.get("cpi_level")
    if cpi is not None and cpi.notna().all():
        out["real"] = pd.Series(curve.values / (cpi.values / cpi.values[0]), index=curve.index)
    fx = m.get("usdtry")
    if fx is not None and fx.notna().all():
        out["usd"] = pd.Series(curve.values / (fx.values / fx.values[0]), index=curve.index)
    return out


def cagr(curve: pd.Series) -> Optional[float]:
    curve = curve.dropna()
    if len(curve) < 2 or curve.iloc[0] <= 0:
        return None
    years = (curve.index[-1] - curve.index[0]).days / 365.25
    return float((curve.iloc[-1] / curve.iloc[0]) ** (1 / years) - 1) if years > 0 else None


def summary() -> Dict[str, Any]:
    """Latest values and history for the macro page."""
    out: Dict[str, Any] = {}
    yoy, mom, pol = series("cpi_yoy"), series("cpi_mom"), series("policy_rate")
    usd, gold = series("usdtry"), series("gold_try_gram")
    if len(yoy):
        out["inflation"] = {"period": yoy.index[-1].strftime("%Y-%m"), "yoy": float(yoy.iloc[-1]), "mom": float(mom.iloc[-1]) if len(mom) else None,
                            "mom_3m_annualised": float(((1 + mom.iloc[-3:] / 100).prod() ** 4 - 1) * 100) if len(mom) >= 3 else None}
    if len(pol):
        out["policy"] = {"rate": float(pol.iloc[-1]), "since": pol.index[-1].date().isoformat()}
        if len(yoy):
            out["real_rate"] = float(((1 + pol.iloc[-1] / 100) / (1 + yoy.iloc[-1] / 100) - 1) * 100)
    if len(usd):
        def chg(s, days):
            past = s[s.index <= s.index[-1] - pd.Timedelta(days=days)]
            return float(s.iloc[-1] / past.iloc[-1] - 1) if len(past) else None
        out["usdtry"] = {"value": float(usd.iloc[-1]), "date": usd.index[-1].date().isoformat(), "chg_1m": chg(usd, 30), "chg_1y": chg(usd, 365)}
    if len(gold):
        out["gold"] = {"value": float(gold.iloc[-1]), "date": gold.index[-1].date().isoformat()}
    # Monthly history since 2015 for charts.
    hist = []
    if len(yoy):
        months = yoy[yoy.index >= "2015-01-01"].index
        pol_m = pol.reindex(pol.index.union(months)).sort_index().ffill().reindex(months) if len(pol) else None
        usd_m = usd.resample("MS").last().reindex(months) if len(usd) else None
        for mth in months:
            p = float(pol_m[mth]) if pol_m is not None and pd.notna(pol_m[mth]) else None
            y = float(yoy[mth])
            hist.append({"month": mth.strftime("%Y-%m"), "inflation": y, "policy": p,
                         "real_rate": ((1 + p / 100) / (1 + y / 100) - 1) * 100 if p is not None else None,
                         "usdtry": float(usd_m[mth]) if usd_m is not None and pd.notna(usd_m[mth]) else None})
    out["history"] = hist
    return out


def position_costs(transactions: List[Dict[str, Any]]) -> Dict[tuple, Dict[str, float]]:
    """Average-cost replay of transactions in three units, per (ticker, account):
    TL as paid, TL in today's prices (each purchase inflated by TÜFE from its date to today) and USD
    (each purchase converted at that day's USD/TRY). Sales reduce all three in proportion."""
    if not transactions:
        return {}
    dates = pd.to_datetime([str(t["tx_date"])[:10] for t in transactions])
    today = pd.Timestamp(datetime.date.today())
    idx = pd.DatetimeIndex(sorted(set(dates) | {today}))
    m = daily_frames(idx)
    cpi, fx = m.get("cpi_level"), m.get("usdtry")
    out: Dict[tuple, Dict[str, float]] = {}
    for tx, d in zip(transactions, dates):
        key = (tx["ticker"], tx.get("account") or "real")
        pos = out.setdefault(key, {"qty": 0.0, "cost": 0.0, "cost_real": 0.0, "cost_usd": 0.0})
        qty, price = float(tx["quantity"]), float(tx["price"])
        if tx["tx_type"] == "BUY":
            infl = float(cpi[today] / cpi[d]) if cpi is not None and pd.notna(cpi[d]) and pd.notna(cpi[today]) else np.nan
            rate = float(fx[d]) if fx is not None and pd.notna(fx[d]) else np.nan
            pos["qty"] += qty
            pos["cost"] += qty * price
            pos["cost_real"] += qty * price * infl
            pos["cost_usd"] += qty * price / rate
        elif tx["tx_type"] == "SELL" and pos["qty"] > 1e-9:
            share = min(qty, pos["qty"]) / pos["qty"]
            for k in ("cost", "cost_real", "cost_usd"):
                pos[k] *= 1 - share
            pos["qty"] -= min(qty, pos["qty"])
    fx_today = float(fx[today]) if fx is not None and pd.notna(fx[today]) else None
    for pos in out.values():
        pos["usdtry_today"] = fx_today
    return out
