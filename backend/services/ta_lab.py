"""
HisseRadarPro — Technical analysis lab
======================================
Evidence-based technical analysis for BIST, computed from our own daily OHLCV history.

1. Data: split/bonus-safe OHLCV. Daily moves beyond ±30% (impossible under the ±10% limit except at
   corporate actions) are neutralised and open/high/low are rescaled onto the same basis.
2. Indicators for every stock and day: moving averages and their slopes, Wilder RSI/ATR/ADX, MACD,
   Bollinger width, 52-week range, Donchian channels, IBD-style relative strength rating, RS line
   against XU100, up/down volume, volume surges, Weinstein stage and the Minervini trend template.
3. Signal report cards: for ~30 classic signals, the excess return over the liquid equal-weight
   universe 5/20/60 sessions after the signal (entry at the next close), hit rate, a month-clustered
   t-statistic, the share of positive years and the split by market regime (XU100 above/below its
   200-day average). A signal's verdict comes from this evidence, not from textbook lore.
4. Technical score: gradient-boosted trees on 30 cross-sectional feature ranks (trend, 52-week
   position, relative strength, sector momentum, volatility/risk, volume/liquidity, oscillators),
   5 market-regime inputs and the 31 signal flags, predicting the next 20-session excess return (winsorised). Walk-forward: every year from
   2019 is predicted by a model trained only on data ending 90 days before that year, so the
   reported deciles, yearly results and top/bottom-decile curves are out of sample. A linear
   IC-weighted blend was tried first; it ranked well but its top decile did not beat the market,
   because the useful effects are thresholds (deep oversold, stage 4, distribution) not slopes.
   The live score is the percentile of a model trained on all years; each stock also gets local
   attributions (prediction change when one input is set to neutral).
5. Live snapshot: per-stock score, stage, template, levels (clustered swing highs/lows), ATR stop,
   active signals with their evidence; market breadth and a sector relative-rotation graph.

Built in a subprocess (~30-60 s, ~1.2 GB peak that is released on exit), cached on disk and in memory,
rebuilt when a new session lands.
"""

import logging
import math
import os
import pickle
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

LAB_VERSION = 10                 # bump when definitions change: a cache with another version is rebuilt
DATA_START = "2012-06-01"       # one year of warm-up before the study window
STUDY_START = "2015-01-01"
WF_FIRST_YEAR = 2019            # first out-of-sample year of the walk-forward
HORIZONS = (5, 20, 60)
MAIN_H = 20
JUMP = 0.30
MIN_TURNOVER = 2_000_000        # TL, 20-day average
SAMPLE_EVERY = 5                # sessions between samples for state signals and IC estimates
COST = 0.002                    # per unit of turnover in the long-top-decile simulation
BENCH = "XU100"
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache")
CACHE_PATH = os.path.join(CACHE_DIR, "ta_lab.pkl")

_state: Dict[str, Any] = {"lab": None, "building": False, "error": None, "started": None}
_lock = threading.Lock()


# ----------------------------------------------------------------------------------- data

def _load_ohlcv() -> Dict[str, pd.DataFrame]:
    from globals import report_repo
    # Read in chunks straight into numeric arrays: turning 1.3M rows into Python tuples and pivoting
    # five times took ~1.2 GB at peak.
    parts = []
    with report_repo._get_connection() as conn:
        cur = conn.execute(
            "SELECT ticker, date, open, high, low, close, volume FROM historical_prices WHERE date >= ? AND close > 0",
            (DATA_START,),
        )
        while True:
            chunk = cur.fetchmany(200_000)
            if not chunk:
                break
            part = pd.DataFrame(chunk, columns=["ticker", "date", "open", "high", "low", "close", "volume"])
            part["ticker"] = part["ticker"].astype("category")
            part["date"] = pd.to_datetime(part["date"].str.slice(0, 10))
            for col in ("open", "high", "low", "close", "volume"):
                part[col] = pd.to_numeric(part[col], errors="coerce").astype(np.float32)
            parts.append(part)
            del chunk
    df = pd.concat(parts, ignore_index=True)
    del parts
    df["ticker"] = df["ticker"].astype(str)
    df = df.drop_duplicates(["date", "ticker"], keep="last").set_index(["date", "ticker"]).sort_index()
    wide_all = df.unstack("ticker")
    del df

    def wide(col: str) -> pd.DataFrame:
        return wide_all[col].astype(np.float64 if col == "close" else np.float32)

    close_raw = wide("close")
    if BENCH in close_raw:
        close_raw = close_raw[close_raw[BENCH].notna()]  # sessions of the exchange, not stray holiday rows
    idx = close_raw.index
    traded = close_raw.notna()
    close = close_raw.ffill(limit=5)
    open_ = wide("open").reindex(idx).where(traded).fillna(close)
    high = wide("high").reindex(idx).where(traded).fillna(close)
    low = wide("low").reindex(idx).where(traded).fillna(close)
    volume = wide("volume").reindex(idx).where(traded).fillna(0.0)

    raw_ret = close.pct_change(fill_method=None)
    ret = raw_ret.mask(raw_ret.abs() > JUMP, 0.0)
    adj = (1.0 + ret.fillna(0.0)).cumprod().where(close.notna())
    k = adj / close  # rescales a day's open/high/low onto the artefact-free basis
    out = {
        "close_raw": close, "close": adj, "open": open_ * k, "high": (high * k).combine(adj, np.fmax),
        "low": (low * k).combine(adj, np.fmin), "volume": volume,
    }
    # float32 halves memory; the adjusted close stays float64 because returns are compounded from it.
    return {name: (frame if name == "close" else frame.astype(np.float32)) for name, frame in out.items()}


# ----------------------------------------------------------------------------------- indicators

class _F32Dict(dict):
    """Stores float frames as float32: ~60 indicator frames of ~3,500 x 650 cells otherwise peak near 2 GB.
    Ranks and thresholds do not need double precision."""

    def __setitem__(self, key, value):
        if isinstance(value, pd.DataFrame) and len(value.columns) and value.dtypes.iloc[0] == np.float64:
            value = value.astype(np.float32)
        super().__setitem__(key, value)


def _sector_map() -> Dict[str, str]:
    try:
        from globals import report_repo
        return {t: (v.get("sector") or "") for t, v in (report_repo.get_all_company_info() or {}).items()}
    except Exception:
        return {}


def _regime_frame(f: Dict[str, Any], c: pd.DataFrame) -> pd.DataFrame:
    """Market conditions on each date (same for every stock), standardised over the whole history so
    that 0 means an average market. Trees are insensitive to this scaling; it only sets the neutral
    point used by the local attributions."""
    liquid = f["liquid"]
    bench = f["bench"]
    bench_ret = bench.pct_change(fill_method=None)
    ew = (1 + c.pct_change(fill_method=None).where(liquid.shift(1, fill_value=False)).mean(axis=1).fillna(0.0)).cumprod()
    reg = pd.DataFrame({
        "mkt_breadth200": (c > f["sma200"]).where(liquid).mean(axis=1),
        "mkt_dist200": bench / bench.rolling(200, min_periods=150).mean() - 1,
        "mkt_ret1m": bench / bench.shift(21) - 1,
        "mkt_vol": bench_ret.rolling(20, min_periods=15).std() * math.sqrt(252),
        "mkt_smallcap": (ew / ew.shift(63)) / (bench / bench.shift(63)) - 1,
    })
    return (reg - reg.mean()) / reg.std()


def _wilder(x: pd.DataFrame, n: int) -> pd.DataFrame:
    return x.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()


def _xrank(df: pd.DataFrame, mask: pd.DataFrame) -> pd.DataFrame:
    """Cross-sectional percentile (0..1) among stocks where mask is True."""
    return df.where(mask).rank(axis=1, pct=True)


def _indicators(d: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    c, h, l, o, v = d["close"], d["high"], d["low"], d["open"], d["volume"]
    stocks = [x for x in c.columns if not x.startswith("XU")]
    bench = c[BENCH] if BENCH in c else c[stocks].mean(axis=1)
    c, h, l, o, v = c[stocks], h[stocks], l[stocks], o[stocks], v[stocks]
    close_raw = d["close_raw"][stocks]
    f: Dict[str, Any] = _F32Dict(bench=bench)

    turnover20 = (close_raw * v).rolling(20, min_periods=10).mean()
    history_ok = c.notna().rolling(252, min_periods=1).sum() >= 200
    liquid = (turnover20 >= MIN_TURNOVER) & history_ok & (close_raw >= 1.0)
    f["turnover20"], f["liquid"] = turnover20, liquid

    for n in (10, 20, 50, 150, 200):
        f[f"sma{n}"] = c.rolling(n, min_periods=n).mean()
    f["sma200_slope"] = f["sma200"] / f["sma200"].shift(21) - 1
    f["sma150_slope"] = f["sma150"] / f["sma150"].shift(21) - 1

    ema12, ema26 = c.ewm(span=12, adjust=False).mean(), c.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    f["macd"], f["macd_sig"] = macd, macd.ewm(span=9, adjust=False).mean()

    delta = c.diff()
    for n in (14, 2):
        gain, loss = _wilder(delta.clip(lower=0), n), _wilder(-delta.clip(upper=0), n)
        rsi = 100 - 100 / (1 + gain / loss.replace(0, np.nan))
        # No losing day in the window: RSI is 100 (or 50 when the price did not move at all).
        f[f"rsi{n}"] = rsi.mask((loss == 0) & (gain > 0), 100.0).mask((loss == 0) & (gain == 0), 50.0)

    prev_c = c.shift(1)
    tr = (h - l).combine((h - prev_c).abs(), np.fmax).combine((l - prev_c).abs(), np.fmax)
    atr14 = _wilder(tr, 14)
    f["atr14"], f["atr_pct"] = atr14, atr14 / c
    f["atr_ratio"] = tr.rolling(10, min_periods=10).mean() / tr.rolling(50, min_periods=40).mean()

    up_move, down_move = h - h.shift(1), l.shift(1) - l
    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
    plus_di = 100 * _wilder(plus_dm, 14) / atr14
    minus_di = 100 * _wilder(minus_dm, 14) / atr14
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    f["adx"], f["plus_di"], f["minus_di"] = _wilder(dx, 14), plus_di, minus_di
    f["adx_dir"] = f["adx"] * np.sign(plus_di - minus_di)

    std20 = c.rolling(20, min_periods=20).std()
    f["bb_upper"], f["bb_lower"] = f["sma20"] + 2 * std20, f["sma20"] - 2 * std20
    bw = 4 * std20 / f["sma20"]
    f["bb_width"] = bw
    f["squeeze"] = bw <= bw.rolling(126, min_periods=100).quantile(0.10)

    f["hi52"] = h.rolling(252, min_periods=200).max()
    f["lo52"] = l.rolling(252, min_periods=200).min()
    f["dist_hi52"] = c / f["hi52"] - 1
    f["above_lo52"] = c / f["lo52"] - 1
    f["prior_hi252"] = h.shift(1).rolling(252, min_periods=200).max()
    f["prior_hi55"] = h.shift(1).rolling(55, min_periods=50).max()

    for name, n in (("ret_5d", 5), ("ret_1m", 21), ("ret_3m", 63), ("ret_6m", 126), ("ret_9m", 189), ("ret_12m", 252)):
        f[name] = c / c.shift(n) - 1
    rs_raw = 0.4 * f["ret_3m"] + 0.2 * f["ret_6m"] + 0.2 * f["ret_9m"] + 0.2 * f["ret_12m"]
    f["rs_raw"] = rs_raw
    f["rs_rating"] = (_xrank(rs_raw, liquid) * 98 + 1).round()

    rs_line = c.div(bench, axis=0)
    f["rs_line"] = rs_line
    f["rs_line_hi"] = rs_line >= rs_line.rolling(252, min_periods=200).max()

    vol50 = v.rolling(50, min_periods=30).mean()
    f["vol50"] = vol50
    f["vol_ratio"] = v.rolling(20, min_periods=15).mean() / v.rolling(60, min_periods=40).mean()
    day_ret = c.pct_change(fill_method=None)
    up_vol = v.where(day_ret > 0, 0.0).rolling(50, min_periods=30).sum()
    down_vol = v.where(day_ret < 0, 0.0).rolling(50, min_periods=30).sum()
    f["updown_vol"] = up_vol / down_vol.replace(0, np.nan)
    max_down_vol10 = v.where(day_ret < 0, 0.0).shift(1).rolling(10, min_periods=5).max()
    f["pocket_pivot_raw"] = (day_ret > 0) & (v > max_down_vol10) & (c > f["sma50"])
    f["day_ret"] = day_ret
    f["vol60"] = day_ret.rolling(60, min_periods=40).std() * math.sqrt(252)
    f["ext50"] = c / f["sma50"] - 1
    f["price_sma200"] = c / f["sma200"] - 1

    # Return-distribution, risk and liquidity features (added after a walk-forward comparison, see _walk_forward).
    bench_ret = bench.pct_change(fill_method=None)
    f["max_ret_1m"] = day_ret.rolling(21, min_periods=15).max()           # lottery-like spikes
    f["skew_60"] = day_ret.rolling(60, min_periods=40).skew()
    bvar = bench_ret.rolling(60, min_periods=40).var()
    beta = day_ret.apply(lambda col: col.rolling(60, min_periods=40).cov(bench_ret)).div(bvar, axis=0)
    f["beta_60"] = beta
    f["ivol_60"] = day_ret.sub(beta.mul(bench_ret, axis=0)).rolling(60, min_periods=40).std()
    f["amihud_20"] = (day_ret.abs() / (close_raw * v).replace(0, np.nan)).rolling(20, min_periods=10).mean() * 1e6
    f["gap_20"] = (o / c.shift(1) - 1).rolling(20, min_periods=10).sum()       # overnight part of the move
    f["intraday_20"] = (c / o - 1).rolling(20, min_periods=10).sum()           # session part of the move
    sectors = _sector_map()
    sec_series = pd.Series({t: sectors.get(t, "") for t in c.columns})
    sec3 = pd.DataFrame(np.nan, index=c.index, columns=c.columns, dtype=np.float32)
    sec6 = sec3.copy()
    for name, members in sec_series.groupby(sec_series).groups.items():
        members = list(members)
        if not name or len(members) < 4:
            continue
        m3 = f["ret_3m"][members].where(liquid[members]).mean(axis=1)
        m6 = f["ret_6m"][members].where(liquid[members]).mean(axis=1)
        for t in members:
            sec3[t] = m3
            sec6[t] = m6
    f["sector_mom_3m"], f["sector_mom_6m"] = sec3, sec6
    f["rel_sector_3m"] = f["ret_3m"] - sec3

    # Minervini trend template: 8 criteria (RS uses our rating).
    tt = [
        c > f["sma150"], c > f["sma200"], f["sma150"] > f["sma200"], f["sma200_slope"] > 0,
        (f["sma50"] > f["sma150"]) & (f["sma50"] > f["sma200"]), c > f["sma50"],
        f["above_lo52"] >= 0.30, f["dist_hi52"] >= -0.25,
    ]
    f["template"] = sum(x.astype(float) for x in tt)  # 0..8; the RS condition is checked separately
    f["template_full"] = (f["template"] >= 8) & (f["rs_rating"] >= 70)

    # Weinstein stage on the 150-day (~30-week) average. BIST prices drift up with inflation, so a
    # "flat" average is judged against the benchmark's own drift over the same month.
    bench_ma = bench.rolling(150, min_periods=150).mean()
    rel_slope = f["sma150_slope"].sub(bench_ma / bench_ma.shift(21) - 1, axis=0)
    # Trend before the flat stretch decides basing (1, after a decline) versus topping (3, after an advance).
    past_slope = (f["sma150"].shift(63) / f["sma150"].shift(126) - 1).sub(bench_ma.shift(63) / bench_ma.shift(126) - 1, axis=0)
    rising, falling = rel_slope > 0.01, rel_slope < -0.01
    above, below = c > f["sma150"], c < f["sma150"]
    stage = pd.DataFrame(np.nan, index=c.index, columns=c.columns)
    stage = stage.mask(rising & above, 2).mask(falling & below, 4)
    flat = stage.isna() & f["sma150"].notna()
    stage = stage.mask(flat & (past_slope > 0.03), 3).mask(flat & ~(past_slope > 0.03), 1)
    f["stage"] = stage
    return f


# ----------------------------------------------------------------------------------- signals

SIGNALS: List[Dict[str, Any]] = [
    # key, label, group, kind (event = first day only / state = every sampled day it holds),
    # classic: the textbook reading (+1 bullish, -1 bearish), desc
    {"key": "stage2_entry", "label": "2. evreye geçiş", "group": "Trend", "kind": "event", "classic": 1,
     "desc": "Fiyat yükselen 150 günlük ortalamanın üzerine çıkıp Weinstein'ın yükseliş evresine girdi."},
    {"key": "stage2", "label": "2. evre (yükseliş)", "group": "Trend", "kind": "state", "classic": 1,
     "desc": "Fiyat, piyasadan hızlı yükselen 150 günlük ortalamasının üzerinde."},
    {"key": "stage4", "label": "4. evre (düşüş)", "group": "Trend", "kind": "state", "classic": -1,
     "desc": "Fiyat, piyasadan hızlı düşen 150 günlük ortalamasının altında."},
    {"key": "template_full", "label": "Minervini trend şablonu (8/8)", "group": "Trend", "kind": "state", "classic": 1,
     "desc": "Ortalamalar sıralı ve yükseliyor, fiyat 52 hafta dibinin %30 üstünde ve zirveye %25'ten yakın, göreli güç 70+."},
    {"key": "golden_cross", "label": "Altın kesişim (SMA50 > SMA200)", "group": "Trend", "kind": "event", "classic": 1,
     "desc": "50 günlük ortalama 200 günlüğü yukarı kesti."},
    {"key": "death_cross", "label": "Ölüm kesişimi (SMA50 < SMA200)", "group": "Trend", "kind": "event", "classic": -1,
     "desc": "50 günlük ortalama 200 günlüğü aşağı kesti."},
    {"key": "above_sma200", "label": "Fiyat SMA200 üzerinde", "group": "Trend", "kind": "state", "classic": 1,
     "desc": "Uzun vadeli trend filtresi."},
    {"key": "adx_up", "label": "Güçlü yükseliş trendi (ADX > 25, +DI > -DI)", "group": "Trend", "kind": "state", "classic": 1,
     "desc": "Trend gücü yüksek ve yön yukarı."},
    {"key": "adx_down", "label": "Güçlü düşüş trendi (ADX > 25, -DI > +DI)", "group": "Trend", "kind": "state", "classic": -1,
     "desc": "Trend gücü yüksek ve yön aşağı."},
    {"key": "hi52_breakout", "label": "52 hafta zirvesi kırılımı", "group": "Kırılım", "kind": "event", "classic": 1,
     "desc": "Kapanış önceki 252 seansın en yükseğinin üzerine çıktı."},
    {"key": "near_hi52", "label": "52 hafta zirvesine %5'ten yakın", "group": "Kırılım", "kind": "state", "classic": 1,
     "desc": "Fiyat yıllık zirvesinin hemen altında."},
    {"key": "donchian55", "label": "55 günlük kanal kırılımı", "group": "Kırılım", "kind": "event", "classic": 1,
     "desc": "Kapanış önceki 55 seansın en yükseğini aştı (Turtle sistemi)."},
    {"key": "breakout_volume", "label": "Hacimli kırılım", "group": "Kırılım", "kind": "event", "classic": 1,
     "desc": "55 günlük kanal kırılımı, hacim 50 günlük ortalamanın 1,5 katı üzerinde."},
    {"key": "squeeze_breakout", "label": "Sıkışma sonrası kırılım", "group": "Kırılım", "kind": "event", "classic": 1,
     "desc": "Bollinger genişliği 6 ayın en dar %10'undayken fiyat üst bandı aştı."},
    {"key": "rs_top", "label": "Göreli güç 90+", "group": "Göreli güç", "kind": "state", "classic": 1,
     "desc": "3-6-9-12 aylık ağırlıklı getiride hisselerin en iyi %10'u."},
    {"key": "rs_line_high", "label": "RS çizgisi yeni zirvede", "group": "Göreli güç", "kind": "event", "classic": 1,
     "desc": "Hissenin XU100'e oranı 52 haftanın zirvesine çıktı."},
    {"key": "rs_lead", "label": "RS çizgisi fiyattan önce zirvede", "group": "Göreli güç", "kind": "event", "classic": 1,
     "desc": "XU100'e oranı zirvede ama fiyat henüz yıllık zirvesinin %5'ten fazla altında: liderlik erken işareti."},
    {"key": "mom_1m_top", "label": "Son 1 ayın en güçlü %20'si", "group": "Göreli güç", "kind": "state", "classic": 1,
     "desc": "Kısa vadeli göreli güç."},
    {"key": "mom_1m_bottom", "label": "Son 1 ayın en zayıf %20'si", "group": "Göreli güç", "kind": "state", "classic": -1,
     "desc": "Kısa vadede en çok düşenler (klasik görüş: tepki gelir)."},
    {"key": "macd_up", "label": "MACD yukarı kesişim", "group": "Osilatör", "kind": "event", "classic": 1,
     "desc": "MACD sinyal çizgisini yukarı kesti."},
    {"key": "macd_down", "label": "MACD aşağı kesişim", "group": "Osilatör", "kind": "event", "classic": -1,
     "desc": "MACD sinyal çizgisini aşağı kesti."},
    {"key": "rsi_oversold", "label": "RSI 30 altında (aşırı satım)", "group": "Osilatör", "kind": "state", "classic": 1,
     "desc": "Klasik görüş: dipten dönüş fırsatı."},
    {"key": "rsi_overbought", "label": "RSI 70 üstünde (aşırı alım)", "group": "Osilatör", "kind": "state", "classic": -1,
     "desc": "Klasik görüş: düzeltme riski."},
    {"key": "rsi2_dip_uptrend", "label": "Yükseliş trendinde kısa geri çekilme (RSI2 < 10)", "group": "Geri çekilme", "kind": "event", "classic": 1,
     "desc": "2. evredeki hissede 2 günlük RSI 10'un altına indi (Connors)."},
    {"key": "pullback_sma50", "label": "Yükselen SMA50'ye geri çekilme", "group": "Geri çekilme", "kind": "event", "classic": 1,
     "desc": "2. evrede fiyat gün içinde 50 günlük ortalamaya değip üzerinde kapattı."},
    {"key": "overextended", "label": "SMA50'nin %25+ üzerinde (aşırı uzama)", "group": "Geri çekilme", "kind": "state", "classic": -1,
     "desc": "Klasik görüş: ortalamaya dönüş riski."},
    {"key": "far_below_hi52", "label": "52 hafta zirvesinin %40+ altında", "group": "Geri çekilme", "kind": "state", "classic": 1,
     "desc": "Klasik görüş: ucuzlamış, toparlanma potansiyeli."},
    {"key": "pocket_pivot", "label": "Cep pivotu", "group": "Hacim", "kind": "event", "classic": 1,
     "desc": "Yükseliş günü hacmi son 10 günün en büyük düşüş günü hacmini aştı, fiyat SMA50 üzerinde (Morales-Kacher)."},
    {"key": "accumulation", "label": "Birikim (yükseliş hacmi baskın)", "group": "Hacim", "kind": "state", "classic": 1,
     "desc": "Son 50 günde yükselen günlerin hacmi düşen günlerin 1,5 katından fazla."},
    {"key": "distribution", "label": "Dağıtım (düşüş hacmi baskın)", "group": "Hacim", "kind": "state", "classic": -1,
     "desc": "Son 50 günde düşen günlerin hacmi yükselen günlerin 1,5 katından fazla."},
    {"key": "gap_up_volume", "label": "Hacimli yukarı boşluk", "group": "Hacim", "kind": "event", "classic": 1,
     "desc": "Açılış önceki günün en yükseğinin üzerinde, hacim 50 günlük ortalamanın 2 katı."},
]
SIGNAL_BY_KEY = {s["key"]: s for s in SIGNALS}


def _signal_masks(f: Dict[str, Any], d: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    c = d["close"][f["sma20"].columns]
    h, l, o, v = (d[k][c.columns] for k in ("high", "low", "open", "volume"))
    st = f["stage"]
    m1_rank = _xrank(f["ret_1m"], f["liquid"])

    def first(x: pd.DataFrame) -> pd.DataFrame:
        x = x.fillna(False).astype(bool)
        return x & ~x.shift(1, fill_value=False)

    stage2 = st == 2
    masks = {
        "stage2_entry": stage2 & (st.shift(1) != 2) & st.shift(1).notna(),
        "stage2": stage2,
        "stage4": st == 4,
        "template_full": f["template_full"],
        "golden_cross": first(f["sma50"] > f["sma200"]),
        "death_cross": first(f["sma50"] < f["sma200"]),
        "above_sma200": c > f["sma200"],
        "adx_up": (f["adx"] > 25) & (f["plus_di"] > f["minus_di"]),
        "adx_down": (f["adx"] > 25) & (f["minus_di"] > f["plus_di"]),
        "hi52_breakout": first(c > f["prior_hi252"]),
        "near_hi52": f["dist_hi52"] >= -0.05,
        "donchian55": first(c > f["prior_hi55"]),
        "breakout_volume": first(c > f["prior_hi55"]) & (v > 1.5 * f["vol50"]),
        "squeeze_breakout": first(c > f["bb_upper"]) & (f["squeeze"].astype(float).shift(1).rolling(5, min_periods=1).max() > 0),
        "rs_top": f["rs_rating"] >= 90,
        "rs_line_high": first(f["rs_line_hi"]),
        "rs_lead": first(f["rs_line_hi"]) & (f["dist_hi52"] < -0.05),
        "mom_1m_top": m1_rank >= 0.8,
        "mom_1m_bottom": m1_rank <= 0.2,
        "macd_up": first(f["macd"] > f["macd_sig"]),
        "macd_down": first(f["macd"] < f["macd_sig"]),
        "rsi_oversold": f["rsi14"] < 30,
        "rsi_overbought": f["rsi14"] > 70,
        "rsi2_dip_uptrend": first(f["rsi2"] < 10) & stage2,
        "pullback_sma50": first((l <= f["sma50"] * 1.01) & (c > f["sma50"])) & stage2 & (f["sma50"] > f["sma50"].shift(10)),
        "overextended": f["ext50"] > 0.25,
        "far_below_hi52": f["dist_hi52"] <= -0.40,
        "pocket_pivot": f["pocket_pivot_raw"].fillna(False).astype(bool),
        "accumulation": f["updown_vol"] >= 1.5,
        "distribution": f["updown_vol"] <= 1 / 1.5,
        "gap_up_volume": (o > h.shift(1)) & (v > 2 * f["vol50"]),
    }
    # Unfiltered by liquidity: the study and the model apply the liquid filter, the live view does not.
    return {k: m.fillna(False).astype(bool) for k, m in masks.items()}


# ----------------------------------------------------------------------------------- evidence

def _forward_excess(c: pd.DataFrame, liquid: pd.DataFrame, h: int) -> pd.DataFrame:
    """Return from the next close over h sessions, minus the liquid equal-weight universe's."""
    fwd = c.shift(-(h + 1)) / c.shift(-1) - 1
    fwd = fwd.where(liquid)
    return fwd.sub(fwd.mean(axis=1), axis=0)


def _verdict(mean: Optional[float], t: Optional[float], years_pos: Optional[float]) -> Tuple[str, str]:
    if mean is None or t is None:
        return "veri_yok", "Yeterli örnek yok"
    if t >= 3 and (years_pos or 0) >= 0.6:
        return "guclu_pozitif", "Güçlü olumlu kanıt"
    if t >= 2:
        return "pozitif", "Olumlu kanıt"
    if t <= -3 and (years_pos or 1) <= 0.4:
        return "guclu_negatif", "Güçlü olumsuz kanıt"
    if t <= -2:
        return "negatif", "Olumsuz kanıt"
    return "notr", "Anlamlı kanıt yok"


def _evidence(masks: Dict[str, pd.DataFrame], fwd: Dict[int, pd.DataFrame], regime_up: pd.Series,
              dates: pd.DatetimeIndex) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    sampled = dates[::SAMPLE_EVERY]
    for s in SIGNALS:
        m = masks[s["key"]].reindex(dates)
        if s["kind"] == "state":
            m = m.loc[sampled]
        res: Dict[str, Any] = {"horizons": {}}
        for h, ex in fwd.items():
            exm = ex.reindex(m.index).where(m)
            per_day = exm.mean(axis=1).dropna()
            vals = exm.stack().dropna() if hasattr(exm, "stack") else pd.Series(dtype=float)
            if len(vals) < 40 or len(per_day) < 12:
                res["horizons"][h] = {"n": int(len(vals)), "mean": None}
                continue
            monthly = per_day.groupby(per_day.index.to_period("M")).mean()
            t = monthly.mean() / (monthly.std(ddof=1) / math.sqrt(len(monthly))) if len(monthly) > 2 and monthly.std() > 0 else None
            if t is not None and h > 21:
                t = t / math.sqrt(h / 21.0)  # overlapping windows beyond a month
            yearly = per_day.groupby(per_day.index.year).mean()
            entry = {
                "n": int(len(vals)), "days": int(len(per_day)), "mean": float(per_day.mean()),
                "median": float(vals.median()), "hit": float((vals > 0).mean()),
                "t": float(t) if t is not None and np.isfinite(t) else None,
                "years_pos": float((yearly > 0).mean()) if len(yearly) else None,
            }
            if h == MAIN_H:
                entry["yearly"] = {int(y): float(v) for y, v in yearly.items()}
                up_days = per_day[regime_up.reindex(per_day.index).fillna(False).astype(bool)]
                dn_days = per_day[~regime_up.reindex(per_day.index).fillna(False).astype(bool)]
                entry["regime_up"] = float(up_days.mean()) if len(up_days) >= 6 else None
                entry["regime_down"] = float(dn_days.mean()) if len(dn_days) >= 6 else None
            res["horizons"][h] = entry
        main = res["horizons"].get(MAIN_H, {})
        code, label = _verdict(main.get("mean"), main.get("t"), main.get("years_pos"))
        res["verdict"], res["verdict_label"] = code, label
        classic_ok = None
        if main.get("mean") is not None and main.get("t") is not None and abs(main["t"]) >= 2:
            classic_ok = (main["mean"] > 0) == (s["classic"] > 0)
        res["classic_holds"] = classic_ok
        out[s["key"]] = res
    return out


# ----------------------------------------------------------------------------------- composite model

FEATURES: List[Dict[str, Any]] = [
    {"key": "dist_hi52", "label": "52 hafta zirvesine yakınlık"},
    {"key": "rs_raw", "label": "Göreli güç (3-6-9-12 ay)"},
    {"key": "ret_1m", "label": "1 aylık getiri"},
    {"key": "ret_5d", "label": "1 haftalık getiri"},
    {"key": "price_sma200", "label": "Fiyatın SMA200'e uzaklığı"},
    {"key": "sma200_slope", "label": "SMA200 eğimi"},
    {"key": "adx_dir", "label": "Yönlü trend gücü (ADX)"},
    {"key": "atr_ratio", "label": "Volatilite daralması (ATR10/ATR50)"},
    {"key": "updown_vol", "label": "Yükseliş/düşüş hacmi oranı"},
    {"key": "vol_ratio", "label": "Hacim artışı (20/60 gün)"},
    {"key": "rsi14", "label": "RSI (14)"},
    {"key": "ext50", "label": "SMA50'den uzaklık"},
    {"key": "vol60", "label": "Volatilite (60 gün)"},
    {"key": "template", "label": "Trend şablonu puanı"},
    {"key": "bb_width", "label": "Bollinger genişliği"},
    {"key": "max_ret_1m", "label": "Son 1 ayın en büyük günlük artışı"},
    {"key": "skew_60", "label": "Getiri çarpıklığı (60 gün)"},
    {"key": "beta_60", "label": "Beta (XU100'e göre, 60 gün)"},
    {"key": "ivol_60", "label": "Hisseye özgü oynaklık"},
    {"key": "amihud_20", "label": "Fiyat etkisi (likiditesizlik)"},
    {"key": "turnover20", "label": "İşlem hacmi düzeyi"},
    {"key": "gap_20", "label": "Gece açılış boşlukları (20 gün)"},
    {"key": "intraday_20", "label": "Seans içi getiri (20 gün)"},
    {"key": "above_lo52", "label": "52 hafta dibinden uzaklık"},
    {"key": "sector_mom_3m", "label": "Sektör momentumu (3 ay)"},
    {"key": "sector_mom_6m", "label": "Sektör momentumu (6 ay)"},
    {"key": "rel_sector_3m", "label": "Sektörüne göre güç (3 ay)"},
    {"key": "ret_3m", "label": "3 aylık getiri"},
    {"key": "ret_6m", "label": "6 aylık getiri"},
    {"key": "ret_12m", "label": "12 aylık getiri"},
]
REGIME = [
    {"key": "mkt_breadth200", "label": "Piyasa genişliği (SMA200 üstü pay)"},
    {"key": "mkt_dist200", "label": "XU100'ün SMA200'e uzaklığı"},
    {"key": "mkt_ret1m", "label": "XU100 son 1 ay"},
    {"key": "mkt_vol", "label": "Piyasa oynaklığı"},
    {"key": "mkt_smallcap", "label": "Küçük hisselerin XU100'e göre gücü (3 ay)"},
]


def _rank_stack(f: Dict[str, Any], dates: pd.DatetimeIndex) -> Dict[str, pd.DataFrame]:
    liquid = f["liquid"].reindex(dates)
    return {x["key"]: _xrank(f[x["key"]].reindex(dates), liquid) - 0.5 for x in FEATURES}


FEAT_KEYS = [x["key"] for x in FEATURES]
REG_KEYS = [x["key"] for x in REGIME]
SIG_KEYS = [s["key"] for s in SIGNALS]
X_COLS = FEAT_KEYS + REG_KEYS + SIG_KEYS   # signals last: the monotonic constraints follow this order
LABELS = {**{x["key"]: x["label"] for x in FEATURES}, **{x["key"]: x["label"] for x in REGIME},
          **{s["key"]: s["label"] for s in SIGNALS}}
# Input groups for the score breakdown (contributions are approximate: the model is not additive).
GROUPS = [
    ("trend", "Trend", ["price_sma200", "sma200_slope", "adx_dir", "template", "stage2_entry", "stage2", "stage4",
                        "template_full", "golden_cross", "death_cross", "above_sma200", "adx_up", "adx_down"]),
    ("position", "52 hafta konumu ve kırılımlar", ["dist_hi52", "above_lo52", "hi52_breakout", "near_hi52", "donchian55",
                                                   "breakout_volume", "squeeze_breakout", "far_below_hi52"]),
    ("strength", "Göreli güç", ["rs_raw", "ret_1m", "ret_5d", "ret_3m", "ret_6m", "ret_12m", "gap_20", "intraday_20",
                                "rs_top", "rs_line_high", "rs_lead", "mom_1m_top", "mom_1m_bottom"]),
    ("sector", "Sektör", ["sector_mom_3m", "sector_mom_6m", "rel_sector_3m"]),
    ("volatility", "Volatilite ve risk", ["vol60", "atr_ratio", "bb_width", "max_ret_1m", "skew_60", "beta_60", "ivol_60"]),
    ("volume", "Hacim ve likidite", ["updown_vol", "vol_ratio", "amihud_20", "turnover20", "pocket_pivot", "accumulation",
                                     "distribution", "gap_up_volume"]),
    ("oscillator", "Osilatör ve uzama", ["rsi14", "ext50", "macd_up", "macd_down", "rsi_oversold", "rsi_overbought",
                                         "rsi2_dip_uptrend", "pullback_sma50", "overextended"]),
    ("regime", "Piyasa koşulları", ["mkt_breadth200", "mkt_dist200", "mkt_ret1m", "mkt_vol", "mkt_smallcap"]),
]
GBM_PARAMS = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=400,
                  l2_regularization=1.0, early_stopping=False, random_state=0)


def _stack(frame: pd.DataFrame) -> pd.Series:
    frame = frame.copy()
    frame.index.name, frame.columns.name = "date", "ticker"  # uniform level names, or joins go cartesian
    return frame.stack()


def _panel(f: Dict[str, Any], masks: Dict[str, pd.DataFrame], fwd20: pd.DataFrame, sampled: pd.DatetimeIndex,
           regime: pd.DataFrame) -> pd.DataFrame:
    """Long table (date, ticker) of feature ranks, market regime, signal flags and the winsorised forward excess."""
    ranks = _rank_stack(f, sampled)
    feat = pd.concat({k: _stack(ranks[k]) for k in FEAT_KEYS}, axis=1)
    liq = f["liquid"].reindex(sampled)
    sig = pd.concat({k: _stack(masks[k].reindex(sampled) & liq) for k in SIG_KEYS}, axis=1).astype(float)
    df = feat.join(sig, how="left")
    df = df[df[FEAT_KEYS].notna().sum(axis=1) >= 10]
    day = df.index.get_level_values(0)
    for k in REG_KEYS:
        df[k] = regime[k].reindex(day).values
    df = df.join(_stack(fwd20.reindex(sampled)).rename("y"), how="left")
    g = df["y"].groupby(level=0)
    df["yw"] = df["y"].clip(g.transform(lambda x: x.quantile(0.02)), g.transform(lambda x: x.quantile(0.98)))
    return df


def _signal_directions(train: pd.DataFrame) -> Dict[str, int]:
    """Sign of each signal's effect in the training data (+1/-1 when the month-clustered t-statistic of
    'flagged minus unflagged' excess is beyond 2, else 0). Used as monotonic constraints so a signal can
    only push the score the way its own history points; computed per fold, so no look-ahead."""
    out = {}
    day_period = train.index.get_level_values(0).to_period("M")
    for k in SIG_KEYS:
        on = train[k] == 1
        if on.sum() < 200:
            out[k] = 0
            continue
        diff = train["yw"].where(on).groupby(day_period).mean() - train["yw"].where(~on).groupby(day_period).mean()
        diff = diff.dropna()
        if len(diff) < 12 or diff.std() == 0:
            out[k] = 0
            continue
        t = diff.mean() / (diff.std(ddof=1) / math.sqrt(len(diff)))
        out[k] = 1 if t >= 2 else -1 if t <= -2 else 0
    return out


def _fit_gbm(train: pd.DataFrame):
    from sklearn.ensemble import HistGradientBoostingRegressor
    train = train.dropna(subset=["yw"])
    directions = _signal_directions(train)
    cst = [0] * (len(FEAT_KEYS) + len(REG_KEYS)) + [directions[k] for k in SIG_KEYS]
    model = HistGradientBoostingRegressor(monotonic_cst=cst, **GBM_PARAMS)
    model.fit(train[X_COLS].fillna(0.0).to_numpy(dtype=float), train["yw"].to_numpy(dtype=float))
    model.signal_directions_ = directions
    return model


def _contributions(model, X: np.ndarray) -> np.ndarray:
    """Local attribution: how much the prediction falls when one input is set to its neutral value
    (feature rank at the median, signal absent). Rows = stocks, columns = X_COLS."""
    base = model.predict(X)
    out = np.zeros_like(X, dtype=float)
    for j in range(X.shape[1]):
        Xj = X.copy()
        Xj[:, j] = 0.0
        out[:, j] = base - model.predict(Xj)
    return out


def _walk_forward(f: Dict[str, Any], masks: Dict[str, pd.DataFrame], fwd20: pd.DataFrame,
                  dates: pd.DatetimeIndex, regime: pd.DataFrame) -> Dict[str, Any]:
    """Gradient-boosted trees on feature ranks and signal flags, predicting the 20-session excess
    return. Each test year is predicted by a model trained only on data ending 90 days before it."""
    sampled = dates[::SAMPLE_EVERY]
    df = _panel(f, masks, fwd20, sampled, regime)
    day = df.index.get_level_values(0)
    years = sorted({d.year for d in sampled if d.year >= WF_FIRST_YEAR})
    pred = pd.Series(np.nan, index=df.index)
    for y in years:
        cutoff = pd.Timestamp(f"{y}-01-01") - pd.Timedelta(days=90)
        model = _fit_gbm(df[day < cutoff])
        te = df[day.year == y]
        if len(te):
            pred.loc[te.index] = model.predict(te[X_COLS].fillna(0.0).to_numpy(dtype=float))
    final = _fit_gbm(df)

    # Global importance: average absolute local contribution over a sample of recent rows.
    recent = df[day >= day.max() - pd.Timedelta(days=730)]
    sample = recent.sample(min(8000, len(recent)), random_state=0) if len(recent) else recent
    contrib = _contributions(final, sample[X_COLS].fillna(0.0).to_numpy(dtype=float)) if len(sample) else np.zeros((0, len(X_COLS)))
    importance = []
    for i, k in enumerate(X_COLS):
        col = np.asarray(sample[k].fillna(0.0).values, dtype=float) if len(sample) else np.array([])
        direction = None
        if len(contrib) and col.std() > 0 and contrib[:, i].std() > 0:
            direction = float(np.corrcoef(col, contrib[:, i])[0, 1])
        importance.append({"key": k, "label": LABELS[k], "kind": "feature" if k in FEAT_KEYS else "regime" if k in REG_KEYS else "signal",
                           "importance": float(np.abs(contrib[:, i]).mean()) if len(contrib) else 0.0,
                           "direction": direction})
    importance.sort(key=lambda x: -x["importance"])

    oos = pred.dropna().unstack()
    target = fwd20.reindex(oos.index)
    dec = (oos.rank(axis=1, pct=True) * 10).clip(upper=9.999).apply(np.floor)
    deciles = []
    for q in range(10):
        vals = target.where(dec == q)
        per_day = vals.mean(axis=1).dropna()
        deciles.append({"decile": q + 1, "mean": float(per_day.mean()), "hit": float((vals.stack().dropna() > 0).mean())})
    rank_ic = oos.rank(axis=1).corrwith(target.rank(axis=1), axis=1).dropna()
    monthly_ic = rank_ic.groupby(rank_ic.index.to_period("M")).mean()
    ic_t = monthly_ic.mean() / (monthly_ic.std(ddof=1) / math.sqrt(len(monthly_ic))) if monthly_ic.std() > 0 else None
    yearly = {}
    for y in years:
        sel = oos.index[oos.index.year == y]
        if not len(sel):
            continue
        yearly[y] = {"top": float(target.loc[sel].where(dec.loc[sel] == 9).mean(axis=1).mean()),
                     "bottom": float(target.loc[sel].where(dec.loc[sel] == 0).mean(axis=1).mean()),
                     "ic": float(rank_ic[rank_ic.index.year == y].mean())}

    # Monthly-rebalanced top and bottom deciles versus the liquid equal-weight universe, out of sample.
    c = f["close_adj"]
    daily_ret = c.pct_change(fill_method=None)
    month_first = pd.Series(oos.index, index=oos.index).groupby(oos.index.to_period("M")).first()
    top_sets = {pd.Timestamp(d): set(dec.loc[d][dec.loc[d] == 9].index) for d in month_first.values}
    bot_sets = {pd.Timestamp(d): set(dec.loc[d][dec.loc[d] == 0].index) for d in month_first.values}
    all_days = c.index[c.index >= oos.index[0]]
    liquid = f["liquid"]
    cur_top: set = set()
    cur_bot: set = set()
    v_top = v_bot = v_uni = 1.0
    curve = []
    for i in range(1, len(all_days)):
        day, prev_day = all_days[i], all_days[i - 1]
        # Ranks known at a close are traded at the next close, as in the signal study.
        sig_day = all_days[i - 2] if i >= 2 else None
        if sig_day is not None and sig_day in top_sets:
            new_top, new_bot = top_sets[sig_day], bot_sets[sig_day]
            v_top *= 1 - COST * (len(new_top ^ cur_top) / max(len(new_top), 1) if cur_top else 1.0)
            v_bot *= 1 - COST * (len(new_bot ^ cur_bot) / max(len(new_bot), 1) if cur_bot else 1.0)
            cur_top, cur_bot = new_top, new_bot
        r = daily_ret.loc[day]
        rt = r[list(cur_top)].mean() if cur_top else 0.0
        rb = r[list(cur_bot)].mean() if cur_bot else 0.0
        ru = r[liquid.loc[prev_day].fillna(False)].mean()
        v_top *= 1 + (0.0 if np.isnan(rt) else rt)
        v_bot *= 1 + (0.0 if np.isnan(rb) else rb)
        v_uni *= 1 + (0.0 if np.isnan(ru) else ru)
        if i % 5 == 0 or i == len(all_days) - 1:
            curve.append({"date": day.date().isoformat(), "top": v_top * 100, "bottom": v_bot * 100, "universe": v_uni * 100})
    span = len(all_days) / 252

    def cagr(v):
        return v ** (1 / span) - 1 if span > 0 and v > 0 else None

    # Real (TÜFE) and USD versions of the same curves.
    real_usd: Dict[str, Any] = {}
    try:
        from services.macro_data import deflate_curve, cagr as _cagr
        cdf = pd.DataFrame(curve).set_index(pd.to_datetime(pd.DataFrame(curve)["date"]))
        for col in ("top", "bottom", "universe"):
            conv = deflate_curve(cdf[col])
            real_usd[f"cagr_{col}_real"] = _cagr(conv["real"]) if conv["real"] is not None else None
            real_usd[f"cagr_{col}_usd"] = _cagr(conv["usd"]) if conv["usd"] is not None else None
    except Exception as e:
        logger.warning(f"TA lab: real/USD conversion failed: {e}")

    return {
        **real_usd,
        "method": "gbm", "final_model": final, "importance": importance,
        "signal_directions": getattr(final, "signal_directions_", {}),
        "oos_start": oos.index[0].date().isoformat(), "oos_end": oos.index[-1].date().isoformat(),
        "train_rows": int(df["yw"].notna().sum()),
        "deciles": deciles, "ic_mean": float(rank_ic.mean()), "ic_t": float(ic_t) if ic_t is not None else None,
        "ic_positive_months": float((monthly_ic > 0).mean()), "yearly": yearly, "curve": curve,
        "cagr_top": cagr(v_top), "cagr_bottom": cagr(v_bot), "cagr_universe": cagr(v_uni),
        "cost": COST,
        # Kept for the score card's analyst test (not sent to the browser).
        "oos_pred": oos.astype("float32"), "fwd20_sampled": target.astype("float32"),
    }


# ----------------------------------------------------------------------------------- levels

def _levels(hi: np.ndarray, lo: np.ndarray, close: float, atr: float) -> Dict[str, Any]:
    """Support/resistance from 5-bar swing pivots of the last ~250 sessions, clustered within 0.6 ATR."""
    n = len(hi)
    piv = []
    for i in range(2, n - 2):
        if hi[i] == max(hi[i - 2:i + 3]):
            piv.append(hi[i])
        if lo[i] == min(lo[i - 2:i + 3]):
            piv.append(lo[i])
    if not piv or not atr or not np.isfinite(atr):
        return {"supports": [], "resistances": []}
    piv = sorted(p for p in piv if np.isfinite(p))
    clusters: List[List[float]] = []
    for p in piv:
        # Join a cluster only while it stays within 1 ATR overall, so zones cannot chain into wide bands.
        if clusters and p - clusters[-1][-1] <= 0.6 * atr and p - clusters[-1][0] <= 1.0 * atr:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    levels = [{"price": float(np.mean(cl)), "touches": len(cl)} for cl in clusters]
    sup = sorted([x for x in levels if x["price"] < close], key=lambda x: -x["price"])[:3]
    res = sorted([x for x in levels if x["price"] > close], key=lambda x: x["price"])[:3]
    for x in sup + res:
        x["dist_pct"] = x["price"] / close - 1
        x["dist_atr"] = (x["price"] - close) / atr
    return {"supports": sup, "resistances": res}


# ----------------------------------------------------------------------------------- build

def _build() -> Dict[str, Any]:
    t0 = time.time()
    d = _load_ohlcv()
    f = _indicators(d)
    stocks = list(f["sma20"].columns)
    c = d["close"][stocks]
    f["close_adj"] = c
    dates = c.index[c.index >= STUDY_START]
    liquid = f["liquid"]

    bench = f["bench"]
    regime_up = bench > bench.rolling(200, min_periods=200).mean()
    masks = _signal_masks(f, d)
    fwd = {h: _forward_excess(c, liquid, h) for h in HORIZONS}
    evidence = _evidence({k: m & liquid for k, m in masks.items()}, fwd, regime_up, dates)
    logger.info(f"TA lab: evidence done in {time.time() - t0:.0f}s")
    fwd20 = fwd[MAIN_H]
    del fwd  # the 5- and 60-session frames are only needed for the evidence tables
    regime = _regime_frame(f, c)
    model = _walk_forward(f, masks, fwd20, dates, regime)
    logger.info(f"TA lab: model done in {time.time() - t0:.0f}s")

    # ---- live snapshot (last session)
    last = c.index[-1]
    final = model.pop("final_model")
    lq_last = liquid.loc[last].fillna(False)
    X_live = pd.DataFrame(index=stocks)
    for k in FEAT_KEYS:
        v = f[k].loc[last]
        # Liquid names are ranked among themselves (as in training); others against the whole list.
        r_liq = v.where(lq_last).rank(pct=True) - 0.5
        r_all = v.rank(pct=True) - 0.5
        X_live[k] = r_liq.fillna(r_all)
    for k in REG_KEYS:
        X_live[k] = float(regime[k].loc[last]) if pd.notna(regime[k].loc[last]) else 0.0
    for k in SIG_KEYS:
        X_live[k] = masks[k].loc[last].astype(float)
    Xv = X_live[X_COLS].fillna(0.0).to_numpy(dtype=float)
    pred_live = pd.Series(final.predict(Xv), index=stocks)
    contrib_live = pd.DataFrame(_contributions(final, Xv), index=stocks, columns=X_COLS)
    liquid_sorted = np.sort(pred_live[lq_last.reindex(stocks).fillna(False).values].values)
    score = {t: float(np.searchsorted(liquid_sorted, v, side="right") / max(len(liquid_sorted), 1) * 100)
             for t, v in pred_live.items() if np.isfinite(v)}

    dec_means = {x["decile"]: x["mean"] for x in model.get("deciles", [])}
    window_start = max(0, len(c.index) - 260)
    hi_np, lo_np = d["high"][stocks].iloc[window_start:], d["low"][stocks].iloc[window_start:]
    k_last = (d["close_raw"][stocks].loc[last] / c.loc[last])  # back to quoted prices for display

    recent = c.index[-5:]
    rows = []
    for t in stocks:
        price = d["close_raw"][t].loc[last]
        if not np.isfinite(price) or not np.isfinite(c[t].loc[last]):
            continue
        g = lambda key: f[key][t].loc[last] if key in f and t in f[key] else None  # noqa: E731
        num = lambda x: float(x) if x is not None and np.isfinite(x) else None  # noqa: E731
        active = []
        for s in SIGNALS:
            m = masks[s["key"]][t]
            on = bool(m.loc[recent].any()) if s["kind"] == "event" else bool(m.loc[last])
            if on:
                active.append(s["key"])
        kk = k_last.get(t)
        atr_q = num(g("atr14") * kk) if kk is not None and np.isfinite(kk) else None
        lv = _levels(hi_np[t].values * kk, lo_np[t].values * kk, float(price), atr_q or 0.0) if atr_q else {"supports": [], "resistances": []}
        sc = score.get(t)
        decile = min(10, int(sc // 10) + 1) if sc is not None else None
        # Stop: just below the nearest support when that is 1-3 ATR away, otherwise 2.5 ATR below price.
        stop = None
        if atr_q:
            stop = price - 2.5 * atr_q
            if lv["supports"]:
                cand = lv["supports"][0]["price"] - 0.5 * atr_q
                if price - 3 * atr_q <= cand <= price - 1 * atr_q:
                    stop = cand
        cc = contrib_live.loc[t]
        drivers_pos = [{"key": k, "label": LABELS[k], "effect": float(v)} for k, v in cc.sort_values(ascending=False).items() if v > 0.0005][:4]
        drivers_neg = [{"key": k, "label": LABELS[k], "effect": float(v)} for k, v in cc.sort_values().items() if v < -0.0005][:4]
        rows.append({
            "ticker": t, "price": num(price), "liquid": bool(liquid[t].loc[last]),
            "score": round(sc, 1) if sc is not None else None, "decile": decile,
            "expected_excess_20d": dec_means.get(decile) if decile else None,
            "model_pred": num(pred_live.get(t)),
            "drivers_pos": drivers_pos, "drivers_neg": drivers_neg,
            "groups": [{"key": gk, "label": gl, "effect": float(cc[[k for k in keys if k in cc.index]].sum())} for gk, gl, keys in GROUPS],
            "stage": num(g("stage")), "template": num(g("template")), "rs_rating": num(g("rs_rating")),
            "adx": num(g("adx")), "plus_di": num(g("plus_di")), "minus_di": num(g("minus_di")),
            "rsi14": num(g("rsi14")), "rsi2": num(g("rsi2")), "atr_pct": num(g("atr_pct")),
            "dist_hi52": num(g("dist_hi52")), "above_lo52": num(g("above_lo52")), "ext50": num(g("ext50")),
            "price_sma200": num(g("price_sma200")), "sma200_slope": num(g("sma200_slope")),
            "vol_ratio": num(g("vol_ratio")), "updown_vol": num(g("updown_vol")), "atr_ratio": num(g("atr_ratio")),
            "squeeze": bool(f["squeeze"][t].loc[last]) if pd.notna(f["squeeze"][t].loc[last]) else False,
            "ret_1m": num(g("ret_1m")), "ret_3m": num(g("ret_3m")), "ret_12m": num(g("ret_12m")),
            "sma50": num(g("sma50") * kk) if kk is not None else None, "sma200": num(g("sma200") * kk) if kk is not None else None,
            "turnover20": num(g("turnover20")),
            "signals": active, "levels": lv,
            "stop": round(stop, 2) if stop else None,
            "stop_pct": (stop / price - 1) if stop else None,
            "atr": atr_q,
        })

    # ---- market overview
    lq = liquid.loc[last]
    def pct(mask: pd.Series) -> Optional[float]:
        mm = mask[lq.fillna(False)]
        return float(mm.mean()) if len(mm) else None
    breadth_hist = []
    above200 = (c > f["sma200"]).where(liquid)
    above50 = (c > f["sma50"]).where(liquid)
    for day in c.index[-260::5].append(pd.DatetimeIndex([last])).unique():
        breadth_hist.append({
            "date": day.date().isoformat(),
            "above200": float(above200.loc[day].mean()), "above50": float(above50.loc[day].mean()),
            "bench": float(bench.loc[day]) if np.isfinite(bench.loc[day]) else None,
        })
    new_hi = int((masks["hi52_breakout"].loc[last]).sum())
    new_lo = int(((c.loc[last] < f["lo52"].shift(1).loc[last]) & lq).sum())
    stage_counts = f["stage"].loc[last][lq.fillna(False)].value_counts().to_dict()
    bench_sma200 = bench.rolling(200).mean().iloc[-1]
    overview = {
        "as_of": last.date().isoformat(),
        "liquid_count": int(lq.sum()),
        "pct_above_sma50": pct(c.loc[last] > f["sma50"].loc[last]),
        "pct_above_sma200": pct(c.loc[last] > f["sma200"].loc[last]),
        "pct_stage2": pct(f["stage"].loc[last] == 2),
        "pct_template": pct(f["template"].loc[last] >= 7),
        "new_highs": new_hi, "new_lows": new_lo,
        "stages": {int(k): int(v) for k, v in stage_counts.items()},
        "bench_above_sma200": bool(bench.iloc[-1] > bench_sma200),
        "bench_dist_sma200": float(bench.iloc[-1] / bench_sma200 - 1),
        "breadth_history": breadth_hist,
        "regime_up": bool(regime_up.iloc[-1]),
    }
    lab = {
        "version": LAB_VERSION, "as_of": last.date().isoformat(), "built_at": time.time(),
        "build_seconds": round(time.time() - t0, 1),
        "study": {"start": dates[0].date().isoformat(), "end": dates[-1].date().isoformat(),
                  "min_turnover": MIN_TURNOVER, "horizons": list(HORIZONS)},
        "evidence": evidence, "model": model,
        "rows": rows, "overview": overview,
        "sectors": _sector_rotation(c, liquid, bench),
    }
    logger.info(f"TA lab built in {lab['build_seconds']}s for {len(rows)} stocks")
    return lab


def _sector_rotation(c: pd.DataFrame, liquid: pd.DataFrame, bench: pd.Series) -> List[Dict[str, Any]]:
    """Relative rotation of sector equal-weight indices against the liquid equal-weight market
    (weekly points, last 10 weeks). Measured against the equal-weight market rather than the
    cap-weighted XU100 so the chart shows rotation between sectors, not small versus large caps.
    RS-Ratio: the sector/market ratio against its own 13-week average, 100 = in line.
    RS-Momentum: the RS-Ratio against its value 4 weeks earlier, 100 = unchanged."""
    from globals import report_repo
    info = report_repo.get_all_company_info() or {}
    sector_of = {t: (v.get("sector") or "") for t, v in info.items()}
    rets = c.pct_change(fill_method=None).where(liquid.shift(1, fill_value=False))
    market = (1 + rets.mean(axis=1).fillna(0.0)).cumprod()
    out = []
    weekly_idx = c.index[-400:][::5]
    for sec in sorted({s for s in sector_of.values() if s and s != "Unknown"}):
        members = [t for t in c.columns if sector_of.get(t) == sec]
        if len(members) < 4:
            continue
        idx_ret = rets[members].mean(axis=1).fillna(0.0)
        level = (1 + idx_ret).cumprod()
        rs = (level / market).reindex(weekly_idx).dropna()
        if len(rs) < 30:
            continue
        ratio = 100 * rs / rs.rolling(13).mean()
        mom = 100 * ratio / ratio.shift(4)
        tail = pd.DataFrame({"ratio": ratio, "mom": mom}).dropna().iloc[-10:]
        if tail.empty:
            continue
        r, m = tail["ratio"].iloc[-1], tail["mom"].iloc[-1]
        quadrant = "Lider" if r >= 100 and m >= 100 else "Zayıflayan" if r >= 100 else "Toparlanan" if m >= 100 else "Geride"
        out.append({
            "sector": sec, "members": len(members), "quadrant": quadrant,
            "ratio": float(r), "momentum": float(m),
            "ret_1m": float((1 + idx_ret.iloc[-21:]).prod() - 1), "ret_3m": float((1 + idx_ret.iloc[-63:]).prod() - 1),
            "tail": [{"date": i.date().isoformat(), "ratio": float(a), "mom": float(b)} for i, a, b in zip(tail.index, tail["ratio"], tail["mom"])],
        })
    return out


# ----------------------------------------------------------------------------------- cache / public API

def _latest_price_date() -> Optional[str]:
    from globals import report_repo
    with report_repo._get_connection() as conn:
        row = conn.execute("SELECT MAX(date) FROM historical_prices WHERE ticker = ?", (BENCH,)).fetchone()
    return str(row[0])[:10] if row and row[0] else None


def _load_cache() -> Optional[Dict[str, Any]]:
    try:
        with open(CACHE_PATH, "rb") as fh:
            lab = pickle.load(fh)
        return lab if lab.get("version") == LAB_VERSION else None
    except Exception:
        return None


def _save_cache(lab: Dict[str, Any]) -> None:
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = CACHE_PATH + ".tmp"
        with open(tmp, "wb") as fh:
            pickle.dump(lab, fh, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp, CACHE_PATH)
    except Exception as e:
        logger.warning(f"TA lab cache write failed: {e}")


def build_to_cache() -> None:
    """Entry point of the build subprocess."""
    _save_cache(_build())


def _run_build() -> None:
    """Builds in a separate process: the build peaks around 1.2 GB, and a child process hands all of it
    back to the operating system when it exits, so the API server stays small."""
    import subprocess
    import sys
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        proc = subprocess.run(
            [sys.executable, "-c", "from services.ta_lab import build_to_cache; build_to_cache()"],
            cwd=backend_dir, capture_output=True, text=True, timeout=1800,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or "")[-800:])
        lab = _load_cache()
        if lab is None:
            raise RuntimeError("build finished but the cache could not be read")
        with _lock:
            _state["lab"], _state["error"] = lab, None
        logger.info(f"TA lab ready for {lab.get('as_of')} ({lab.get('build_seconds')}s)")
        try:
            from services.alerts import evaluate_signal_alerts
            evaluate_signal_alerts(lab)
        except Exception as e:
            logger.warning(f"Signal alert evaluation failed: {e}")
    except Exception as e:
        logger.error(f"TA lab build failed: {e}")
        with _lock:
            _state["error"] = str(e)[:500]
    finally:
        with _lock:
            _state["building"] = False


def ensure_fresh(block: bool = False) -> None:
    """Loads the disk cache, and rebuilds in the background when a newer session exists."""
    with _lock:
        if _state["lab"] is None:
            _state["lab"] = _load_cache()
        lab = _state["lab"]
        stale = lab is None or lab.get("as_of") != _latest_price_date()
        if not stale or _state["building"]:
            return
        _state["building"], _state["started"] = True, time.time()
    if block:
        _run_build()
    else:
        threading.Thread(target=_run_build, name="ta-lab-build", daemon=True).start()


def get_lab() -> Optional[Dict[str, Any]]:
    ensure_fresh()
    with _lock:
        return _state["lab"]


def status() -> Dict[str, Any]:
    with _lock:
        if _state["lab"] is None:
            _state["lab"] = _load_cache()
        lab = _state["lab"]
        return {"ready": lab is not None, "building": _state["building"], "error": _state["error"],
                "as_of": lab.get("as_of") if lab else None,
                "build_seconds": lab.get("build_seconds") if lab else None,
                "building_for": round(time.time() - _state["started"], 0) if _state["building"] and _state["started"] else None}


def start_worker() -> None:
    def loop():
        time.sleep(15)
        while True:
            try:
                ensure_fresh()
            except Exception as e:
                logger.error(f"TA lab worker: {e}")
            time.sleep(600)
    threading.Thread(target=loop, name="ta-lab-worker", daemon=True).start()
