"""
HisseRadarPro — Corporate actions for the portfolio (splits / bonus issues and cash dividends)
=============================================================================================
Source: yfinance actions per ticker (dividends per share and split ratios, both expressed per CURRENT
share, i.e. adjusted for later splits). Stored in corporate_actions; refreshed at most once a day per
ticker, only for tickers that appear in the portfolio.

Transactions are converted to the current share basis: a purchase of 100 shares at 50 TL before a
100% bonus issue (split ratio 2) becomes 200 shares at 25 TL. Live prices, stored price history and
dividends per share are all on this basis, so quantities, average costs, P/L and dividend income stay
consistent. The user's original entries are kept (raw_quantity, raw_price) and shown in the
transaction list.

Dividend income: for every ex-date, dividend per share x shares held at the end of the previous day.
Personal investors' dividend withholding (stopaj) is assumed at DIVIDEND_WITHHOLDING; amounts are
shown before and after it.
Rights issues (bedelli) are not modelled: new shares bought in a rights issue should be entered as a
purchase at the subscription price.
"""

import datetime
import logging
import threading
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

DIVIDEND_WITHHOLDING = 0.15   # individuals, after the December 2024 change (was 10%)
REFRESH_HOURS = 24
_lock = threading.Lock()


def _conn():
    from globals import report_repo
    return report_repo._get_connection()


def _ensure() -> None:
    with _conn() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS corporate_actions (
            ticker TEXT NOT NULL, date TEXT NOT NULL, dividend REAL, split REAL, PRIMARY KEY (ticker, date))""")
        conn.execute("CREATE TABLE IF NOT EXISTS corporate_actions_meta (ticker TEXT PRIMARY KEY, fetched_at TEXT)")
        conn.commit()


def refresh(tickers: List[str], force: bool = False) -> int:
    """Downloads actions for tickers not refreshed in the last REFRESH_HOURS (one request per ticker)."""
    import yfinance as yf
    _ensure()
    now = datetime.datetime.now()
    with _conn() as conn:
        meta = dict(conn.execute("SELECT ticker, fetched_at FROM corporate_actions_meta").fetchall())
    stale = [t for t in sorted(set(tickers)) if force or t not in meta
             or now - datetime.datetime.fromisoformat(meta[t]) > datetime.timedelta(hours=REFRESH_HOURS)]
    done = 0
    for t in stale:
        try:
            acts = yf.Ticker(f"{t}.IS").actions
        except Exception as e:
            logger.warning(f"Corporate actions for {t}: {e}")
            continue
        rows = []
        if acts is not None and len(acts):
            for d, r in acts.iterrows():
                div = float(r.get("Dividends", 0) or 0)
                spl = float(r.get("Stock Splits", 0) or 0)
                if div > 0 or (spl > 0 and spl != 1):
                    rows.append((t, d.date().isoformat(), div if div > 0 else None, spl if spl > 0 and spl != 1 else None))
        with _lock, _conn() as conn:
            conn.execute("DELETE FROM corporate_actions WHERE ticker = ?", (t,))
            conn.executemany("INSERT OR REPLACE INTO corporate_actions (ticker, date, dividend, split) VALUES (?,?,?,?)", rows)
            conn.execute("INSERT OR REPLACE INTO corporate_actions_meta (ticker, fetched_at) VALUES (?,?)", (t, now.isoformat(timespec="seconds")))
            conn.commit()
        done += 1
    return done


def actions(tickers: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    _ensure()
    if not tickers:
        return {}
    marks = ",".join("?" * len(tickers))
    with _conn() as conn:
        rows = conn.execute(f"SELECT ticker, date, dividend, split FROM corporate_actions WHERE ticker IN ({marks}) ORDER BY date",
                            list(tickers)).fetchall()
    out: Dict[str, List[Dict[str, Any]]] = {}
    for t, d, div, spl in rows:
        out.setdefault(t, []).append({"date": d, "dividend": div, "split": spl})
    return out


def adjust_transactions(transactions: List[Dict[str, Any]], fetch_missing: bool = True) -> List[Dict[str, Any]]:
    """Transactions on the current share basis (later splits applied); originals kept as raw_*."""
    if not transactions:
        return transactions
    tickers = sorted({str(t["ticker"]).upper() for t in transactions})
    if fetch_missing:
        try:
            _ensure()
            with _conn() as conn:
                have = {r[0] for r in conn.execute("SELECT ticker FROM corporate_actions_meta").fetchall()}
            missing = [t for t in tickers if t not in have]
            if missing:
                refresh(missing)
        except Exception as e:
            logger.warning(f"Corporate actions refresh failed: {e}")
    acts = actions(tickers)
    out = []
    for tx in transactions:
        t = str(tx["ticker"]).upper()
        day = str(tx.get("tx_date") or "")[:10]
        factor = 1.0
        for a in acts.get(t, []):
            if a["split"] and a["date"] > day:
                factor *= a["split"]
        q, p = float(tx["quantity"]), float(tx["price"])
        out.append({**tx, "raw_quantity": q, "raw_price": p, "split_factor": factor,
                    "quantity": q * factor, "price": p / factor})
    return out


def dividends_received(adjusted: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Cash dividends earned by each (ticker, account) from the adjusted transaction history."""
    events: List[Dict[str, Any]] = []
    by_key: Dict[tuple, List[Dict[str, Any]]] = {}
    for tx in adjusted:
        by_key.setdefault((tx["ticker"], tx.get("account") or "real"), []).append(tx)
    acts = actions(sorted({k[0] for k in by_key}))
    for (t, acc), txs in by_key.items():
        txs = sorted(txs, key=lambda x: (str(x["tx_date"])[:10], x.get("id", 0)))
        for a in acts.get(t, []):
            if not a["dividend"]:
                continue
            held = 0.0
            for tx in txs:
                if str(tx["tx_date"])[:10] >= a["date"]:  # must hold before the ex-date
                    break
                held += tx["quantity"] if tx["tx_type"] == "BUY" else -tx["quantity"]
            if held > 1e-9:
                gross = held * a["dividend"]
                events.append({"ticker": t, "account": acc, "ex_date": a["date"], "per_share": a["dividend"],
                               "shares": held, "gross": gross, "net": gross * (1 - DIVIDEND_WITHHOLDING)})
    events.sort(key=lambda e: e["ex_date"], reverse=True)
    per_key: Dict[str, Dict[str, float]] = {}
    for e in events:
        k = f"{e['ticker']}|{e['account']}"
        agg = per_key.setdefault(k, {"gross": 0.0, "net": 0.0})
        agg["gross"] += e["gross"]
        agg["net"] += e["net"]
    return {"events": events, "by_position": per_key, "withholding": DIVIDEND_WITHHOLDING,
            "total_gross": sum(e["gross"] for e in events), "total_net": sum(e["net"] for e in events)}


def undo_dividend_adjustment(ticker: str, dates: List[str], closes: List[float]) -> List[float]:
    """Stored history is total-return adjusted (yfinance scales every close before an ex-date by
    1 - dividend / previous close). For valuing holdings on a past day the traded price is needed,
    with dividends counted separately, so the scaling is undone here (split basis is kept).
    Walking back from today: with P the product of later factors, the raw close before an ex-date is
    adjusted / P + dividend, which gives that event's factor 1 - dividend / raw."""
    divs = [(a["date"], a["dividend"]) for a in actions([ticker]).get(ticker, []) if a["dividend"]]
    if not divs or not closes:
        return list(closes)
    out = list(closes)
    p = 1.0
    k = len(divs) - 1
    for i in range(len(dates) - 1, -1, -1):
        while k >= 0 and divs[k][0] > dates[i]:
            ex_date, div = divs[k]
            k -= 1
            if i + 1 < len(dates) and dates[i + 1] >= ex_date:  # this is the last day before the ex-date
                raw_prev = closes[i] / p + div
                if raw_prev > div > 0:
                    p *= 1 - div / raw_prev
        out[i] = closes[i] / p
    return out
