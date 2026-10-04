"""
HisseRadarPro — Rule-based Strategy Backtest Engine
===================================================
Runs two kinds of strategies over BIST daily closes:

- rank:   at each rebalance, keep stocks that pass the filters and the liquidity floor, rank them by
          one price-based factor and hold the top N (equal or inverse-volatility weights).
- timing: hold one asset (default XU100) while it is above its N-day moving average, otherwise cash.

Honesty rules baked in:
- Signals use the previous trading day's close; trades happen at the rebalance day's close.
- Only price/volume factors are allowed. Historical fundamentals are not stored, so testing today's
  P/E against the past would be look-ahead bias.
- BIST has a ±10% daily price limit, so daily moves beyond ±30% are treated as split/bonus-issue
  artefacts in the price series and zeroed; how many were removed is reported.
- The universe is the set of tickers in the database today (delisted names are missing):
  survivorship bias is reported, not hidden.
- When XU100 history does not cover the test window, the benchmark is the equal-weighted universe.
"""

import logging
import math
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

TRADING_DAYS = 252
JUMP_LIMIT = 0.30
BENCHMARK = "XU100"
_CACHE_TTL = 6 * 3600  # prices change once a day

# label, unit shown in the UI, multiplier from the raw fraction to the unit, default rank order
FACTORS: Dict[str, Dict[str, Any]] = {
    "mom_12_1":       {"label": "12-1 ay momentum", "unit": "%", "scale": 100, "order": "desc",
                       "help": "Son 12 ayın getirisi, en son ay hariç (kısa vadeli geri dönüşü dışarıda bırakır)."},
    "ret_12m":        {"label": "12 aylık getiri", "unit": "%", "scale": 100, "order": "desc"},
    "ret_6m":         {"label": "6 aylık getiri", "unit": "%", "scale": 100, "order": "desc"},
    "ret_3m":         {"label": "3 aylık getiri", "unit": "%", "scale": 100, "order": "desc"},
    "ret_1m":         {"label": "1 aylık getiri", "unit": "%", "scale": 100, "order": "desc"},
    "vol_90":         {"label": "90 günlük volatilite", "unit": "%", "scale": 100, "order": "asc"},
    "vol_30":         {"label": "30 günlük volatilite", "unit": "%", "scale": 100, "order": "asc"},
    "dist_52w_high":  {"label": "52 hafta zirvesine uzaklık", "unit": "%", "scale": 100, "order": "desc"},
    "sma200_dist":    {"label": "200 günlük ortalamaya uzaklık", "unit": "%", "scale": 100, "order": "desc"},
    "sma50_dist":     {"label": "50 günlük ortalamaya uzaklık", "unit": "%", "scale": 100, "order": "desc"},
    "rsi14":          {"label": "RSI (14)", "unit": "", "scale": 1, "order": "asc"},
    "turnover20":     {"label": "20 günlük ort. işlem hacmi", "unit": "TL", "scale": 1, "order": "desc"},
    "price":          {"label": "Fiyat", "unit": "TL", "scale": 1, "order": "asc"},
}

_data_lock = threading.Lock()
_data_cache: Dict[str, Any] = {"time": 0.0}


# --------------------------------------------------------------------------- data

def _load_frames() -> Dict[str, Any]:
    """Wide close/volume frames for every ticker, cleaned daily returns and factor frames (cached)."""
    with _data_lock:
        if _data_cache.get("closes") is not None and time.time() - _data_cache["time"] < _CACHE_TTL:
            return _data_cache

        from globals import report_repo
        t0 = time.time()
        with report_repo._get_connection() as conn:
            rows = conn.execute("SELECT ticker, date, close, volume FROM historical_prices WHERE close > 0").fetchall()
        df = pd.DataFrame([tuple(r) for r in rows], columns=["ticker", "date", "close", "volume"])
        df["date"] = pd.to_datetime(df["date"].str.slice(0, 10))
        raw_closes = df.pivot_table(index="date", columns="ticker", values="close").sort_index()
        volumes = df.pivot_table(index="date", columns="ticker", values="volume").reindex(raw_closes.index)
        # Some holidays carry rows for only a handful of symbols; without filling, every stock gets a
        # gap there and 200-day windows stay NaN for months. A stock that did not trade kept its price.
        closes = raw_closes.ffill(limit=5)

        raw_rets = closes.pct_change(fill_method=None)
        jumps = raw_rets.abs() > JUMP_LIMIT
        rets = raw_rets.mask(jumps, 0.0)
        # Rebuild an artefact-free price path so factors are not distorted by splits either.
        adj = (1.0 + rets.fillna(0.0)).cumprod().where(closes.notna())

        factors = {
            "ret_1m": adj / adj.shift(21) - 1,
            "ret_3m": adj / adj.shift(63) - 1,
            "ret_6m": adj / adj.shift(126) - 1,
            "ret_12m": adj / adj.shift(252) - 1,
            "mom_12_1": adj.shift(21) / adj.shift(252) - 1,
            "vol_30": rets.rolling(30, min_periods=20).std() * math.sqrt(TRADING_DAYS),
            "vol_90": rets.rolling(90, min_periods=60).std() * math.sqrt(TRADING_DAYS),
            "dist_52w_high": adj / adj.rolling(252, min_periods=200).max() - 1,
            "sma200_dist": adj / adj.rolling(200, min_periods=200).mean() - 1,
            "sma50_dist": adj / adj.rolling(50, min_periods=50).mean() - 1,
            "turnover20": (closes * volumes).rolling(20, min_periods=10).mean(),
            "price": closes,
        }
        delta = adj.diff()
        gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
        loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
        factors["rsi14"] = 100 - 100 / (1 + gain / loss.replace(0, np.nan))

        _data_cache.update({
            "time": time.time(),
            "closes": closes,
            "rets": rets,
            "jumps": jumps,
            "adj": adj,
            "factors": factors,
        })
        logger.info(f"Backtest frames built in {time.time() - t0:.1f}s: {closes.shape}")
        return _data_cache


# --------------------------------------------------------------------------- helpers

def _universe(name: str, columns) -> List[str]:
    from services.portfolio_builder import BIST30_TICKERS, BIST100_TICKERS
    cols = [c for c in columns if c != BENCHMARK]
    if name == "bist30":
        return [c for c in cols if c in BIST30_TICKERS]
    if name == "bist100":
        return [c for c in cols if c in BIST100_TICKERS]
    return cols


def _rebalance_dates(index: pd.DatetimeIndex, freq: str) -> List[pd.Timestamp]:
    if freq == "daily":
        return list(index)
    key = {"weekly": index.to_period("W"), "monthly": index.to_period("M"), "quarterly": index.to_period("Q")}[freq]
    s = pd.Series(index, index=index)
    return list(s.groupby(key).first())


def _metrics(daily: pd.Series, cash_rate: float) -> Dict[str, Any]:
    daily = daily.dropna()
    if daily.empty:
        return {}
    curve = (1 + daily).cumprod()
    years = len(daily) / TRADING_DAYS
    total = float(curve.iloc[-1] - 1)
    cagr = float(curve.iloc[-1] ** (1 / years) - 1) if years > 0 and curve.iloc[-1] > 0 else None
    vol = float(daily.std() * math.sqrt(TRADING_DAYS))
    dd = curve / curve.cummax() - 1
    monthly = (1 + daily).groupby(daily.index.to_period("M")).prod() - 1
    rf_daily = (1 + cash_rate) ** (1 / TRADING_DAYS) - 1
    excess = daily - rf_daily
    sharpe = float(excess.mean() / daily.std() * math.sqrt(TRADING_DAYS)) if daily.std() > 0 else None
    return {
        "total_return": total,
        "cagr": cagr,
        "volatility": vol,
        "sharpe": sharpe,
        "max_drawdown": float(dd.min()),
        "calmar": (cagr / abs(float(dd.min()))) if cagr is not None and dd.min() < 0 else None,
        "best_month": float(monthly.max()) if len(monthly) else None,
        "worst_month": float(monthly.min()) if len(monthly) else None,
        "positive_months": float((monthly > 0).mean()) if len(monthly) else None,
        "months": int(len(monthly)),
    }


def _clean(obj):
    """JSON-safe floats (NaN/inf -> None, numpy -> python)."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if not math.isfinite(f) else round(f, 6)
    if isinstance(obj, np.integer):
        return int(obj)
    return obj


# --------------------------------------------------------------------------- engine

def run_backtest(spec: Dict[str, Any]) -> Dict[str, Any]:
    data = _load_frames()
    closes: pd.DataFrame = data["closes"]
    rets: pd.DataFrame = data["rets"]
    factors: Dict[str, pd.DataFrame] = data["factors"]

    kind = spec.get("kind", "rank")
    rebalance = spec.get("rebalance", "monthly")
    cost = float(spec.get("cost_bps", 20)) / 1e4
    cash_rate = float(spec.get("cash_rate", 0.0))
    cash_daily = (1 + cash_rate) ** (1 / TRADING_DAYS) - 1

    start = pd.Timestamp(spec.get("start") or "2012-01-01")
    end = pd.Timestamp(spec.get("end")) if spec.get("end") else closes.index[-1]
    index = closes.index[(closes.index >= start) & (closes.index <= end)]
    if len(index) < 60:
        raise ValueError("Seçilen tarih aralığında yeterli işlem günü yok (en az 60 gün gerekir).")

    warnings: List[str] = []
    assumptions: List[str] = [
        "Sinyaller bir önceki günün kapanışıyla hesaplanır, işlemler dengeleme gününün kapanışından yapılır.",
        f"Her alım ve satımda %{cost * 100:.2f} işlem maliyeti (komisyon + kayma) düşülür.",
        "Nakitte bekleyen para için " + (f"yıllık %{cash_rate * 100:.1f} getiri varsayılır." if cash_rate else "getiri varsayılmaz."),
        "Temettüler, veri kaynağı fiyatları düzeltmediyse getiriye dahil değildir.",
        "Getiriler nominal TL cinsindendir; enflasyondan arındırılmamıştır. Uzun dönemlerde yüksek enflasyon getirileri büyük gösterir.",
    ]

    holdings_log: List[Dict[str, Any]] = []
    strat = pd.Series(0.0, index=index)
    exposure = pd.Series(0.0, index=index)

    if kind == "timing":
        asset = (spec.get("timing_asset") or BENCHMARK).upper()
        window = int(spec.get("sma_window", 200))
        if asset not in closes:
            raise ValueError(f"{asset} için fiyat geçmişi yok.")
        adj = data["adj"][asset]
        signal = (adj > adj.rolling(window, min_periods=window).mean()).astype(float)
        signal = signal.where(adj.rolling(window, min_periods=window).mean().notna())
        if signal.reindex(index).isna().all():
            raise ValueError(f"{asset} için {window} günlük ortalamayı hesaplayacak kadar geçmiş yok.")
        reb = set(_rebalance_dates(index, rebalance))
        pos = signal.shift(1).reindex(index)
        # Only act on rebalance days; hold the last decision in between.
        pos = pos.where(pos.index.isin(list(reb))).ffill().fillna(0.0)
        asset_ret = rets[asset].reindex(index).fillna(0.0)
        trades = pos.diff().abs().fillna(pos.iloc[0])
        strat = pos * asset_ret + (1 - pos) * cash_daily - trades * cost
        exposure = pos
        for d in pos.index[trades > 0]:
            holdings_log.append({"date": d.date().isoformat(), "holdings": [asset] if pos[d] > 0 else [], "turnover": float(trades[d])})
        universe_cols = [asset]
        assumptions.append(f"{asset}, {window} günlük ortalamanın üzerindeyken tutulur; altına indiğinde nakde geçilir.")
    else:
        factor = spec.get("rank_factor", "mom_12_1")
        if factor not in FACTORS:
            raise ValueError(f"Bilinmeyen sıralama ölçütü: {factor}")
        order = spec.get("rank_order") or FACTORS[factor]["order"]
        top_n = max(1, min(100, int(spec.get("top_n", 20))))
        weighting = spec.get("weighting", "equal")
        min_turnover = float(spec.get("min_turnover_tl", 5_000_000))
        filters = spec.get("filters") or []
        universe_cols = _universe(spec.get("universe", "all"), closes.columns)

        # Vectorised simulation: each holding period is one cumulative-product block.
        full = closes.index
        a, b = full.get_loc(index[0]), full.get_loc(index[-1])
        reb_pos = sorted(full.get_loc(d) for d in _rebalance_dates(index, rebalance) if full.get_loc(d) > 0)
        R = np.nan_to_num(rets[universe_cols].to_numpy(), nan=0.0)
        F = factors[factor][universe_cols].to_numpy()
        C = closes[universe_cols].to_numpy()
        TURN = np.nan_to_num(factors["turnover20"][universe_cols].to_numpy(), nan=0.0)
        R12 = factors["ret_12m"][universe_cols].to_numpy()
        VOL = factors["vol_90"][universe_cols].to_numpy()
        FILT = [(factors[f["factor"]][universe_cols].to_numpy() * FACTORS[f["factor"]]["scale"], f.get("op", ">"), float(f.get("value", 0)))
                for f in filters if f.get("factor") in FACTORS]
        ops = {">": np.greater, ">=": np.greater_equal, "<": np.less, "<=": np.less_equal}
        scale = FACTORS[factor]["scale"]

        L = b - a + 1
        strat_np = np.zeros(L)
        expo_np = np.zeros(L)
        first = reb_pos[0] if reb_pos else b + 1
        strat_np[: max(0, first - a + 1)] += cash_daily  # nothing held until the first rebalance close
        drift_idx = np.array([], dtype=int)
        drift_w = np.array([])
        counts = []

        for k, p in enumerate(reb_pos):
            sig = p - 1
            with np.errstate(invalid="ignore"):
                ok = ~np.isnan(F[sig]) & ~np.isnan(C[sig]) & (TURN[sig] >= min_turnover) & ~np.isnan(R12[sig])
                for arr, op, th in FILT:
                    ok &= ops[op](arr[sig], th)
            cand = np.where(ok)[0]
            keys = F[sig, cand] if order == "asc" else -F[sig, cand]
            picks = cand[np.argsort(keys, kind="stable")[:top_n]]
            if len(picks) and weighting == "inverse_vol":
                v = VOL[sig, picks]
                inv = np.where(np.isfinite(v) & (v > 0), 1.0 / v, np.nan)
                inv = np.where(np.isnan(inv), np.nanmean(inv) if np.isfinite(inv).any() else 1.0, inv)
                w = inv / inv.sum()
            else:
                w = np.full(len(picks), 1.0 / len(picks)) if len(picks) else np.array([])

            old = dict(zip(drift_idx.tolist(), drift_w.tolist()))
            new = dict(zip(picks.tolist(), w.tolist()))
            turnover = sum(abs(new.get(i, 0.0) - old.get(i, 0.0)) for i in set(old) | set(new))
            strat_np[p - a] -= turnover * cost
            counts.append(len(picks))
            holdings_log.append({
                "date": full[p].date().isoformat(),
                "holdings": [universe_cols[i] for i in picks],
                "turnover": turnover,
                "factor_values": {universe_cols[i]: float(F[sig, i] * scale) for i in picks},
            })

            q = reb_pos[k + 1] if k + 1 < len(reb_pos) else b
            n = q - p
            if n <= 0:
                drift_idx, drift_w = picks, w
                continue
            growth = np.cumprod(1.0 + R[p + 1: q + 1][:, picks], axis=0) if len(picks) else np.ones((n, 0))
            cash_g = (1.0 + cash_daily) ** np.arange(1, n + 1)
            invested = float(w.sum()) if len(w) else 0.0
            value = (growth @ w if len(w) else 0.0) + (1.0 - invested) * cash_g
            prev = np.concatenate(([1.0], value[:-1]))
            strat_np[p + 1 - a: q + 1 - a] += value / prev - 1.0
            expo_np[p + 1 - a: q + 1 - a] = ((growth * w).sum(axis=1) / value) if len(w) else 0.0
            drift_idx, drift_w = picks, (w * growth[-1] / value[-1]) if len(w) else w

        strat = pd.Series(strat_np, index=index)
        exposure = pd.Series(expo_np, index=index)
        if not counts or max(counts) == 0:
            raise ValueError("Hiçbir dengeleme gününde kurallara uyan hisse bulunamadı. Filtreleri gevşetmeyi dene.")
        short = sum(1 for c in counts if c < top_n)
        if short:
            warnings.append(f"{len(counts)} dengelemenin {short} tanesinde kurallara uyan hisse sayısı {top_n} altında kaldı; boş kalan ağırlık nakitte bekledi.")
        assumptions.append(
            f"Her dengelemede {FACTORS[factor]['label'].lower()} ölçütüne göre {'en yüksek' if order == 'desc' else 'en düşük'} "
            f"{top_n} hisse {'eşit ağırlıkla' if weighting == 'equal' else 'volatilitesiyle ters orantılı ağırlıkla'} alınır."
        )
        assumptions.append(f"Son 20 günlük ortalama işlem hacmi {min_turnover / 1e6:.0f} milyon TL altındaki hisseler alınmaz; en az bir yıllık fiyat geçmişi aranır.")

    # Benchmark: XU100 when it covers the whole window, otherwise the equal-weighted universe.
    bench_name = "XU100"
    if BENCHMARK in closes and closes[BENCHMARK].reindex(index).notna().iloc[0]:
        bench = rets[BENCHMARK].reindex(index).fillna(0.0)
    else:
        bench_name = "Eşit ağırlıklı evren"
        cols = [c for c in universe_cols if c != BENCHMARK] or list(closes.columns)
        bench = rets[cols].reindex(index).mean(axis=1).fillna(0.0)
        if BENCHMARK in closes:
            first = closes[BENCHMARK].first_valid_index()
            warnings.append(f"XU100 verisi {first.date().isoformat()} tarihinden başladığı için kıyas olarak eşit ağırlıklı evren kullanıldı.")

    jumps = int(data["jumps"][universe_cols].reindex(index).sum().sum())
    if jumps:
        warnings.append(f"Fiyat serisindeki {jumps} adet ±%30 üzeri günlük sıçrama bölünme/bedelsiz kaynaklı veri hatası sayılıp sıfırlandı.")
    if kind == "rank":
        warnings.append("Evren bugün işlem gören hisselerden oluşur; borsadan çıkmış hisseler dahil değildir (hayatta kalma yanlılığı). Gerçek sonuçlar daha zayıf olabilir.")

    curve = (1 + strat).cumprod()
    bench_curve = (1 + bench).cumprod()
    dd = curve / curve.cummax() - 1
    step = max(1, len(index) // 700)
    pts = list(range(0, len(index), step))
    if pts[-1] != len(index) - 1:
        pts.append(len(index) - 1)
    series = [
        {"date": index[i].date().isoformat(), "strategy": float(curve.iloc[i] * 100), "benchmark": float(bench_curve.iloc[i] * 100), "drawdown": float(dd.iloc[i])}
        for i in pts
    ]

    monthly = (1 + strat).groupby(strat.index.to_period("M")).prod() - 1
    monthly_table: Dict[str, Dict[str, float]] = {}
    for per, v in monthly.items():
        monthly_table.setdefault(str(per.year), {})[str(per.month)] = float(v)

    s_metrics = _metrics(strat, cash_rate)
    b_metrics = _metrics(bench, cash_rate)

    def _ytd(daily: pd.Series) -> Optional[float]:
        this_year = daily[daily.index.year == daily.index[-1].year]
        return float((1 + this_year).prod() - 1) if len(this_year) else None

    s_metrics["ytd"] = _ytd(strat)
    b_metrics["ytd"] = _ytd(bench)
    result = {
        "spec": spec,
        "start": index[0].date().isoformat(),
        "end": index[-1].date().isoformat(),
        "benchmark_name": bench_name,
        "metrics": s_metrics,
        "benchmark_metrics": b_metrics,
        "excess_cagr": (s_metrics.get("cagr") or 0) - (b_metrics.get("cagr") or 0),
        "avg_exposure": float(exposure.mean()),
        "rebalance_count": len(holdings_log),
        "avg_turnover": float(np.mean([h["turnover"] for h in holdings_log])) if holdings_log else 0.0,
        "series": series,
        "monthly": monthly_table,
        "last_holdings": holdings_log[-1] if holdings_log else None,
        "rebalances": holdings_log[-24:][::-1],
        "assumptions": assumptions,
        "warnings": warnings,
    }
    return _clean(result)


def factor_catalog() -> List[Dict[str, Any]]:
    return [{"id": k, **{kk: vv for kk, vv in v.items() if kk != "scale"}} for k, v in FACTORS.items()]
