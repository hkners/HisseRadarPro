"""
HisseRadarPro — Daily price history sync (runs inside the backend)
==================================================================
Keeps historical_prices current without the separate scheduler process:
- One bulk yfinance download covers every ticker's missing days (instead of 600 single requests).
- A day's bar is stored only after the session has closed (18:30 Istanbul time), so a partial
  intraday bar is never saved as that day's close.
- If a split or bonus issue rescaled yfinance's past prices, that ticker's full history is refetched
  so stored prices stay on one basis.
- A background worker checks every 30 minutes whether the last completed session is missing and
  syncs once per expected session date (holidays therefore cost one attempt, not a retry loop).
After new rows land, the in-memory caches built from price history are invalidated.
"""

import datetime
import logging
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

SESSION_CLOSE = datetime.time(18, 30)
CHECK_EVERY = 1800
_state: Dict[str, Any] = {"running": False, "last_attempt_for": None, "last_result": None}
_lock = threading.Lock()


def expected_session_date(now: Optional[datetime.datetime] = None) -> datetime.date:
    """Latest weekday whose session has closed (public holidays are not known here)."""
    now = now or datetime.datetime.now()
    day = now.date()
    if now.time() < SESSION_CLOSE or day.weekday() >= 5:
        day -= datetime.timedelta(days=1)
    while day.weekday() >= 5:
        day -= datetime.timedelta(days=1)
    return day


def _latest_rows(repo) -> Dict[str, tuple]:
    """{ticker: (last date, last close)}"""
    with repo._get_connection() as conn:
        rows = conn.execute(
            """SELECT h.ticker, h.date, h.close FROM historical_prices h
               JOIN (SELECT ticker, MAX(date) AS d FROM historical_prices GROUP BY ticker) m
                 ON h.ticker = m.ticker AND h.date = m.d"""
        ).fetchall()
    return {r[0]: (str(r[1])[:10], float(r[2] or 0)) for r in rows}


REBASE_TOLERANCE = 0.003   # a typical dividend is 1-10% of the price; float noise is far below 0.3%


def _stored_closes(repo, tickers: List[str], since: str) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    if not tickers:
        return out
    marks = ",".join("?" * len(tickers))
    with repo._get_connection() as conn:
        for t, d, c in conn.execute(f"SELECT ticker, date, close FROM historical_prices WHERE date >= ? AND ticker IN ({marks})",
                                    [since, *tickers]).fetchall():
            out.setdefault(t, {})[str(d)[:10]] = float(c)
    return out


def _needs_rebase(adjusted_close, stored: Dict[str, float]) -> bool:
    """True when the stored closes and yfinance's adjusted closes disagree on the overlapping days."""
    import numpy as np
    ratios = [float(v) / stored[i.date().isoformat()] for i, v in adjusted_close.items()
              if i.date().isoformat() in stored and stored[i.date().isoformat()] > 0 and v == v]
    if len(ratios) < 5:
        return False
    return abs(float(np.median(ratios[:20])) - 1) > REBASE_TOLERANCE


def repair_adjustments(tickers: Optional[List[str]] = None, period: str = "2y") -> Dict[str, Any]:
    """One-off check of the whole universe: refetch every ticker whose stored history misses a
    dividend or split adjustment that yfinance has applied since it was downloaded."""
    import yfinance as yf
    from globals import BIST_TICKERS, report_repo
    names = sorted(set(tickers or BIST_TICKERS) | {"XU100"})
    data = yf.download([f"{t}.IS" for t in names], period=period, group_by="ticker", auto_adjust=True,
                       progress=False, threads=True)
    since = (datetime.date.today() - datetime.timedelta(days=800)).isoformat()
    stored = _stored_closes(report_repo, names, since)
    fixed = []
    for t in names:
        key = f"{t}.IS"
        if data is None or data.empty or key not in data.columns.get_level_values(0):
            continue
        close = data[key]["Close"].dropna()
        if _needs_rebase(close, stored.get(t, {})):
            try:
                _refetch_full(t, report_repo)
                fixed.append(t)
            except Exception as e:
                logger.warning(f"Repair refetch failed for {t}: {e}")
    if fixed:
        _invalidate_caches(rebuild_lab=True)
    return {"checked": len(names), "fixed": fixed}


def _refetch_full(ticker: str, repo) -> int:
    """Replaces a ticker's whole history with yfinance's split-adjusted series."""
    import yfinance as yf
    hist = yf.Ticker(f"{ticker}.IS").history(period="max", auto_adjust=True)
    hist = hist.dropna(subset=["Open", "High", "Low", "Close"])
    cutoff = expected_session_date().isoformat()
    records = [(ticker, idx.date().isoformat(), float(r["Open"]), float(r["High"]), float(r["Low"]),
                float(r["Close"]), int(r["Volume"]) if r["Volume"] == r["Volume"] else 0)
               for idx, r in hist.iterrows() if idx.date().isoformat() <= cutoff]
    if records:
        repo.upsert_historical_prices(records)
    return len(records)


def _invalidate_caches(rebuild_lab: bool = False) -> None:
    try:
        from services import backtest_engine
        backtest_engine._data_cache["time"] = 0.0
    except Exception:
        pass
    try:
        from services import ta_lab
        if rebuild_lab:
            ta_lab.force_rebuild()  # same session, corrected history
        else:
            ta_lab.ensure_fresh()   # a new session makes the lab stale: rebuild in the background
    except Exception:
        pass
    for mod, attr in (("services.house_strategies", "_cache"), ("services.baskets", "_cache")):
        try:
            import importlib
            cache = getattr(importlib.import_module(mod), attr)
            cache["time"] = 0.0
            cache["data"] = None
        except Exception:
            pass


def sync_missing_days(tickers: Optional[List[str]] = None) -> Dict[str, Any]:
    """Downloads every ticker's missing closed sessions in one bulk request and stores them."""
    import yfinance as yf
    from globals import BIST_TICKERS, report_repo

    with _lock:
        if _state["running"]:
            return {"status": "already_running"}
        _state["running"] = True
    t0 = time.time()
    try:
        last_rows = _latest_rows(report_repo)
        latest = {t: v[0] for t, v in last_rows.items()}
        names = sorted(set(tickers or BIST_TICKERS) | {"XU100"})
        names = [t for t in names if t in latest]  # tickers without any history need a full sync
        cutoff = expected_session_date()
        stale = [t for t in names if latest[t] < cutoff.isoformat()]
        if not stale:
            return {"status": "up_to_date", "session": cutoff.isoformat()}

        oldest = min(datetime.date.fromisoformat(latest[t]) for t in stale)
        gap = (datetime.date.today() - oldest).days
        # At least three months: the overlap with stored prices is how dividends and splits that
        # yfinance has applied to the past since our last download are detected.
        period = "3mo" if gap <= 85 else "6mo"
        data = yf.download([f"{t}.IS" for t in stale], period=period, group_by="ticker",
                           auto_adjust=True, progress=False, threads=True)
        stored = _stored_closes(report_repo, stale, (datetime.date.today() - datetime.timedelta(days=200)).isoformat())
        records = []
        rebased: List[str] = []
        for t in stale:
            key = f"{t}.IS"
            if data is None or data.empty or key not in data.columns.get_level_values(0):
                continue
            df = data[key].dropna(subset=["Open", "High", "Low", "Close"])
            # Dividends, splits and bonus issues make yfinance rescale the past. If its adjusted closes
            # no longer match what we stored, our history misses an adjustment: refetch it whole.
            if _needs_rebase(df["Close"], stored.get(t, {})):
                rebased.append(t)
                continue
            for idx, row in df.iterrows():
                d = idx.date()
                if d.isoformat() <= latest[t] or d > cutoff:
                    continue
                vol = row.get("Volume")
                records.append((t, d.isoformat(), float(row["Open"]), float(row["High"]), float(row["Low"]),
                                float(row["Close"]), int(vol) if vol == vol and vol is not None else 0))
        if records:
            report_repo.upsert_historical_prices(records)
        for t in rebased:
            try:
                _refetch_full(t, report_repo)
            except Exception as e:
                logger.warning(f"Full refetch failed for {t}: {e}")
        if records or rebased:
            _invalidate_caches(rebuild_lab=bool(rebased) and not records)
        try:
            from services import macro_data
            macro_data.sync()  # TCMB inflation/policy tables, USD/TRY, gold: refreshed with each new session
        except Exception as e:
            logger.warning(f"Macro sync failed: {e}")
        try:
            from services import corporate_actions
            held = sorted({tx["ticker"] for tx in report_repo.get_portfolio_transactions(adjusted=False)})
            corporate_actions.refresh(held)  # new dividends and bonus issues of portfolio stocks (daily)
        except Exception as e:
            logger.warning(f"Corporate actions refresh failed: {e}")
        result = {"status": "ok", "session": cutoff.isoformat(), "tickers_checked": len(stale),
                  "rows_added": len(records), "rebased": rebased, "seconds": round(time.time() - t0, 1)}
        logger.info(f"Price history sync: {result}")
        return result
    except Exception as e:
        logger.error(f"Price history sync failed: {e}", exc_info=True)
        return {"status": "error", "detail": str(e)}
    finally:
        with _lock:
            _state["running"] = False


def _worker() -> None:
    time.sleep(20)  # let startup finish first
    while True:
        try:
            session = expected_session_date()
            if _state["last_attempt_for"] != session:
                _state["last_attempt_for"] = session
                _state["last_result"] = sync_missing_days()
        except Exception as e:
            logger.error(f"Price history worker error: {e}")
        time.sleep(CHECK_EVERY)


def start_price_history_worker() -> None:
    threading.Thread(target=_worker, name="price-history-sync", daemon=True).start()


def status() -> Dict[str, Any]:
    from globals import report_repo
    with report_repo._get_connection() as conn:
        last = conn.execute("SELECT MAX(date) FROM historical_prices WHERE ticker = 'XU100'").fetchone()[0]
    return {"last_price_date": last, "expected_session": expected_session_date().isoformat(),
            "running": _state["running"], "last_result": _state["last_result"]}
