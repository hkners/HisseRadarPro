"""
HisseRadarPro — Thematic baskets
================================
House themes plus user baskets (manual or saved from Studio), stored in SQLite (user_baskets).
Performance is a fixed-weight, daily-rebalanced index of the CURRENT constituents over the last year,
so history is indicative: a basket whose members changed would have done differently in reality.
"""

import datetime
import json
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import pandas as pd

HOUSE_BASKETS = [
    {"id": "h-defense", "name": "Savunma sanayii", "tickers": ["ASELS", "SDTTR", "OTKAR", "ALTNY", "KATMR", "PAPIL", "ONRYT"],
     "description": "Savunma bütçeleri ve ihracatından pay alan şirketler."},
    {"id": "h-banks", "name": "Bankalar", "tickers": ["AKBNK", "GARAN", "YKBNK", "ISCTR", "HALKB", "VAKBN", "TSKB"],
     "description": "Faiz döngüsüne en duyarlı büyük bankalar."},
    {"id": "h-power", "name": "Elektrik ve yenilenebilir enerji", "tickers": ["AKSEN", "ENJSA", "ZOREN", "AYDEM", "ENERY", "CWENE", "EUPWR", "GWIND", "ODAS"],
     "description": "Elektrik üretimi, dağıtımı ve yenilenebilir ekipman."},
    {"id": "h-retail", "name": "Perakende", "tickers": ["BIMAS", "MGROS", "SOKM", "MAVI", "BIZIM"],
     "description": "Gıda ve giyim perakendecileri; iç talebe duyarlı."},
    {"id": "h-travel", "name": "Havacılık ve turizm", "tickers": ["THYAO", "PGSUS", "TAVHL", "CLEBI", "MAALT"],
     "description": "Havayolları, havalimanı işletmeleri ve otelcilik."},
    {"id": "h-auto", "name": "Otomotiv", "tickers": ["FROTO", "TOASO", "DOAS", "TTRAK", "KARSN", "ASUZU"],
     "description": "Otomotiv üretim ve dağıtım; ihracat ve kur duyarlı."},
    {"id": "h-steel", "name": "Demir çelik", "tickers": ["EREGL", "KRDMD", "ISDMR", "KCAER", "BRSAN", "CEMTS"],
     "description": "Yassı ve uzun çelik üreticileri, çelik boru."},
    {"id": "h-holding", "name": "Holdingler", "tickers": ["KCHOL", "SAHOL", "AGHOL", "DOHOL", "TKFEN", "ALARK"],
     "description": "Çok sektörlü büyük holdingler."},
    {"id": "h-reit", "name": "Gayrimenkul (GYO)", "tickers": ["EKGYO", "ISGYO", "TRGYO", "OZKGY", "AKFGY"],
     "description": "Konut ve ticari gayrimenkul yatırım ortaklıkları; faize duyarlı."},
    {"id": "h-food", "name": "Gıda ve içecek", "tickers": ["ULKER", "CCOLA", "AEFES", "TATGD", "TUKAS", "BANVT"],
     "description": "Temel tüketim; savunmacı talep."},
    {"id": "h-tech", "name": "Teknoloji ve yazılım", "tickers": ["LOGO", "KAREL", "INDES", "ARDYZ", "PENTA", "LINK"],
     "description": "Yazılım, donanım dağıtımı ve telekom ekipmanı."},
    {"id": "h-telecom", "name": "Telekom", "tickers": ["TCELL", "TTKOM"],
     "description": "Mobil ve sabit hat operatörleri."},
]

_lock = threading.Lock()
_cache: Dict[str, Any] = {"time": 0.0, "data": None}
_TTL = 600


@contextmanager
def _conn():
    from globals import report_repo
    with report_repo._get_connection() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS user_baskets (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, tickers_json TEXT NOT NULL,
                   weights_json TEXT, source TEXT, created_at TEXT NOT NULL)"""
        )
        yield conn


def list_user_baskets() -> List[Dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM user_baskets ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        r = dict(r)
        out.append({
            "id": r["id"], "name": r["name"], "description": r.get("description") or "",
            "tickers": json.loads(r["tickers_json"]), "weights": json.loads(r["weights_json"]) if r.get("weights_json") else None,
            "source": r.get("source") or "manual", "created_at": r["created_at"], "house": False,
        })
    return out


def create_basket(name: str, tickers: List[str], description: str = "", weights: Optional[List[float]] = None, source: str = "manual") -> Dict[str, Any]:
    bid = "u-" + uuid.uuid4().hex[:10]
    now = datetime.date.today().isoformat()
    with _lock:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO user_baskets (id, name, description, tickers_json, weights_json, source, created_at) VALUES (?,?,?,?,?,?,?)",
                (bid, name, description, json.dumps(tickers), json.dumps(weights) if weights else None, source, now),
            )
            conn.commit()
        _cache["data"] = None
    return {"id": bid}


def delete_basket(bid: str) -> int:
    with _lock:
        with _conn() as conn:
            cur = conn.execute("DELETE FROM user_baskets WHERE id = ?", (bid,))
            conn.commit()
        _cache["data"] = None
        return cur.rowcount


def _performance(baskets: List[Dict[str, Any]]) -> None:
    from globals import report_repo
    tickers = sorted({t for b in baskets for t in b["tickers"]} | {"XU100"})
    marks = ",".join("?" * len(tickers))
    with report_repo._get_connection() as conn:
        rows = conn.execute(
            f"""SELECT ticker, date, close FROM historical_prices WHERE ticker IN ({marks})
                AND date >= date((SELECT MAX(date) FROM historical_prices WHERE ticker = 'XU100'), '-400 days')""",
            tickers,
        ).fetchall()
    df = pd.DataFrame([tuple(r) for r in rows], columns=["ticker", "date", "close"])
    wide = df.pivot_table(index="date", columns="ticker", values="close").sort_index()
    if "XU100" in wide:
        wide = wide[wide["XU100"].notna()]
    wide = wide.ffill(limit=5).tail(253)
    rets = wide.pct_change(fill_method=None).iloc[1:]
    rets = rets.mask(rets.abs() > 0.3, 0.0)  # split / bonus-issue artefacts (BIST daily limit is ±10%)
    idx = rets.index
    bench = rets["XU100"].fillna(0.0) if "XU100" in rets else None
    last_year = str(idx[-1])[:4]

    def window(series: pd.Series, n: int) -> Optional[float]:
        return float((1 + series.iloc[-n:]).prod() - 1) if len(series) >= n else None

    for b in baskets:
        names = [t for t in b["tickers"] if t in rets.columns]
        b["missing"] = [t for t in b["tickers"] if t not in rets.columns]
        if not names:
            b["perf"] = None
            continue
        if b.get("weights") and len(b["weights"]) == len(b["tickers"]):
            wmap = dict(zip(b["tickers"], b["weights"]))
            w = pd.Series({t: float(wmap[t]) for t in names})
        else:
            w = pd.Series(1.0, index=names)
        w = w / w.sum()
        R = rets[names].fillna(0.0)
        daily = R.mul(w, axis=1).sum(axis=1)
        curve = (1 + daily).cumprod()
        ytd = daily[[str(d)[:4] == last_year for d in idx]]
        member = []
        for t in names:
            s = R[t]
            member.append({"ticker": t, "weight": float(w[t]), "r1m": window(s, 21), "r3m": window(s, 63), "r1y": window(s, 252)})
        b["perf"] = {
            "r1m": window(daily, 21), "r3m": window(daily, 63), "r1y": window(daily, 252),
            "ytd": float((1 + ytd).prod() - 1) if len(ytd) else None,
            "volatility": float(daily.std() * (252 ** 0.5)),
            "max_drawdown": float((curve / curve.cummax() - 1).min()),
            "bench_r1y": window(bench, 252) if bench is not None else None,
            "bench_ytd": float((1 + bench[[str(d)[:4] == last_year for d in idx]]).prod() - 1) if bench is not None else None,
            "series": [{"date": str(idx[i]), "basket": float(curve.iloc[i] * 100),
                        "bench": float((1 + bench.iloc[: i + 1]).prod() * 100) if bench is not None else None}
                       for i in range(0, len(idx), 5)],
            "members": sorted(member, key=lambda m: -m["weight"]),
            "as_of": str(idx[-1]),
        }
        if b.get("created_at"):
            since = daily[[str(d) >= b["created_at"] for d in idx]]
            b["perf"]["since_created"] = float((1 + since).prod() - 1) if len(since) else None


def get_baskets(force: bool = False) -> Dict[str, Any]:
    with _lock:
        if not force and _cache["data"] is not None and time.time() - _cache["time"] < _TTL:
            return _cache["data"]
    baskets = [dict(b, house=True, source="house", weights=None, created_at=None) for b in HOUSE_BASKETS] + list_user_baskets()
    _performance(baskets)
    data = {"baskets": baskets, "built_at": time.time()}
    with _lock:
        _cache["data"] = data
        _cache["time"] = time.time()
    return data
