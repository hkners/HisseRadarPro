"""
HisseRadarPro — Alerts
======================
Alert kinds (scope = a ticker, 'PORTFOY' for every holding, or '*' for every liquid stock where noted):
- price_above / price_below {level}           live price crosses a level (ticker)
- change_above / change_below {pct}           daily change beyond a percentage (ticker, PORTFOY)
- score_above / score_below {level}           HisseRadar score crosses a level (ticker, PORTFOY)
- decision {decision}                         decision becomes e.g. "GÜÇLÜ AL" (ticker, PORTFOY, *)
- signal {signal}                             a technical signal appears (ticker, PORTFOY, *)
- portfolio_stop                              a holding trades below the suggested stop (PORTFOY)

Price, change, score and decision alerts are checked every minute against live prices and the
decision engine; signal alerts when the technical lab is rebuilt for a new session. A one-shot alert
switches off after firing; a repeating one fires at most once per day per stock. Fired alerts are
stored as events that the top bar shows (and the browser can turn into notifications).
"""

import datetime
import json
import logging
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)

KINDS = {
    "price_above": "Fiyat üstüne çıkarsa", "price_below": "Fiyat altına inerse",
    "change_above": "Günlük artış", "change_below": "Günlük düşüş",
    "score_above": "Skor üstüne çıkarsa", "score_below": "Skor altına inerse",
    "decision": "Karar değişirse", "signal": "Teknik sinyal oluşursa", "portfolio_stop": "Portföy stop seviyesi",
    "kap": "KAP bildirimi gelirse",
}
SCOPES_ALLOWED = {
    "price_above": {"ticker"}, "price_below": {"ticker"},
    "change_above": {"ticker", "PORTFOY"}, "change_below": {"ticker", "PORTFOY"},
    "score_above": {"ticker", "PORTFOY"}, "score_below": {"ticker", "PORTFOY"},
    "decision": {"ticker", "PORTFOY", "*"}, "signal": {"ticker", "PORTFOY", "*"},
    "portfolio_stop": {"PORTFOY"},
    "kap": {"ticker", "PORTFOY", "*"},
}
_lock = threading.Lock()


def _n(v: float, d: int = 2) -> str:
    return f"{v:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


@contextmanager
def _conn():
    from globals import report_repo
    with report_repo._get_connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY, ticker TEXT NOT NULL, kind TEXT NOT NULL, params TEXT, note TEXT,
            active INTEGER NOT NULL DEFAULT 1, repeat INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL, last_triggered TEXT)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS alert_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id TEXT, ticker TEXT, kind TEXT, message TEXT,
            value REAL, triggered_at TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_events_seen ON alert_events(seen, triggered_at)")
        yield conn


# ------------------------------------------------------------------ CRUD

def list_alerts() -> List[Dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM alerts ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["params"] = json.loads(d["params"] or "{}")
        d["active"], d["repeat"] = bool(d["active"]), bool(d["repeat"])
        d["kind_label"] = KINDS.get(d["kind"], d["kind"])
        out.append(d)
    return out


def create_alert(ticker: str, kind: str, params: Dict[str, Any], note: str = "", repeat: bool = False) -> Dict[str, Any]:
    aid = "a-" + uuid.uuid4().hex[:10]
    with _lock, _conn() as conn:
        conn.execute("INSERT INTO alerts (id, ticker, kind, params, note, active, repeat, created_at) VALUES (?,?,?,?,?,1,?,?)",
                     (aid, ticker, kind, json.dumps(params, ensure_ascii=False), note, int(repeat),
                      datetime.datetime.now().isoformat(timespec="seconds")))
        conn.commit()
    return {"id": aid}


def update_alert(aid: str, active: Optional[bool] = None) -> int:
    with _lock, _conn() as conn:
        cur = conn.execute("UPDATE alerts SET active = ? WHERE id = ?", (int(bool(active)), aid))
        conn.commit()
        return cur.rowcount


def delete_alert(aid: str) -> int:
    with _lock, _conn() as conn:
        cur = conn.execute("DELETE FROM alerts WHERE id = ?", (aid,))
        conn.commit()
        return cur.rowcount


def list_events(limit: int = 50, unseen_only: bool = False) -> Dict[str, Any]:
    with _conn() as conn:
        q = "SELECT * FROM alert_events" + (" WHERE seen = 0" if unseen_only else "") + " ORDER BY id DESC LIMIT ?"
        rows = [dict(r) for r in conn.execute(q, (limit,)).fetchall()]
        unseen = conn.execute("SELECT COUNT(*) FROM alert_events WHERE seen = 0").fetchone()[0]
    return {"events": rows, "unseen": unseen}


def mark_seen(ids: Optional[List[int]] = None) -> int:
    with _lock, _conn() as conn:
        if ids:
            cur = conn.execute(f"UPDATE alert_events SET seen = 1 WHERE id IN ({','.join('?' * len(ids))})", ids)
        else:
            cur = conn.execute("UPDATE alert_events SET seen = 1 WHERE seen = 0")
        conn.commit()
        return cur.rowcount


# ------------------------------------------------------------------ evaluation

def _holdings() -> List[str]:
    from globals import report_repo
    return sorted({p["ticker"] for p in report_repo.get_user_portfolio(None)})


def _targets(alert: Dict[str, Any], universe: Iterable[str]) -> List[str]:
    scope = alert["ticker"]
    if scope == "PORTFOY":
        return _holdings()
    if scope == "*":
        return list(universe)
    return [scope]


def _fire(alert: Dict[str, Any], hits: List[Tuple[str, str, Optional[float]]]) -> int:
    """Records events; one-shot alerts switch off, repeating ones skip stocks already fired today."""
    if not hits:
        return 0
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with _lock, _conn() as conn:
        fired = 0
        for ticker, message, value in hits:
            if alert["repeat"]:
                seen = conn.execute(
                    "SELECT 1 FROM alert_events WHERE alert_id = ? AND ticker = ? AND substr(triggered_at, 1, 10) = ?",
                    (alert["id"], ticker, today)).fetchone()
                if seen:
                    continue
            conn.execute("INSERT INTO alert_events (alert_id, ticker, kind, message, value, triggered_at) VALUES (?,?,?,?,?,?)",
                         (alert["id"], ticker, alert["kind"], message, value, now))
            fired += 1
        if fired:
            conn.execute("UPDATE alerts SET last_triggered = ?, active = ? WHERE id = ?",
                         (now, 1 if alert["repeat"] else 0, alert["id"]))
        conn.commit()
    return fired


def evaluate_live() -> int:
    """Price, change, score, decision and portfolio-stop alerts against live data."""
    from globals import price_service
    alerts = [a for a in list_alerts() if a["active"] and a["kind"] not in ("signal", "kap")]
    if not alerts:
        return 0
    prices = price_service.prices
    try:
        from services.conviction_engine import conviction_engine
        setups = {s["ticker"]: s for s in conviction_engine.get_all_scored_stocks()}
    except Exception:
        setups = {}
    total = 0
    for a in alerts:
        p, kind, hits = a["params"], a["kind"], []
        for t in _targets(a, setups.keys()):
            live = prices.get(t) or {}
            price, chg, s = live.get("price"), live.get("change_pct"), setups.get(t) or {}
            if kind == "price_above" and price and price >= float(p.get("level", 0)):
                hits.append((t, f"{t} {_n(float(p['level']))} TL seviyesinin üzerine çıktı ({_n(price)} TL).", price))
            elif kind == "price_below" and price and price <= float(p.get("level", 0)):
                hits.append((t, f"{t} {_n(float(p['level']))} TL seviyesinin altına indi ({_n(price)} TL).", price))
            elif kind == "change_above" and chg is not None and chg >= float(p.get("pct", 0)):
                hits.append((t, f"{t} bugün %{_n(chg, 1)} yükseldi.", chg))
            elif kind == "change_below" and chg is not None and chg <= -abs(float(p.get("pct", 0))):
                hits.append((t, f"{t} bugün %{_n(abs(chg), 1)} düştü.", chg))
            elif kind == "score_above" and s.get("has_model") and s.get("score", 0) >= float(p.get("level", 0)):
                hits.append((t, f"{t} HisseRadar skoru {s['score']} ({s['decision']}).", s["score"]))
            elif kind == "score_below" and s.get("has_model") and s.get("score", 100) <= float(p.get("level", 0)):
                hits.append((t, f"{t} HisseRadar skoru {s['score']} seviyesine indi ({s['decision']}).", s["score"]))
            elif kind == "decision" and s.get("has_model") and s.get("decision") == p.get("decision"):
                if a["ticker"] == "*" and not s.get("liquid"):
                    continue
                hits.append((t, f"{t} kararı: {s['decision']} (skor {s['score']}).", s.get("score")))
            elif kind == "portfolio_stop" and price and s.get("stop_loss") and price <= s["stop_loss"]:
                hits.append((t, f"{t} önerilen stop seviyesinin ({_n(s['stop_loss'])} TL) altında: {_n(price)} TL.", price))
        total += _fire(a, hits)
    return total


def evaluate_signal_alerts(lab: Optional[Dict[str, Any]] = None) -> int:
    """Signal alerts against the latest technical lab (events of the last session, states as of today)."""
    if lab is None:
        from services import ta_lab
        lab = ta_lab.get_lab()
    if not lab:
        return 0
    from services.ta_lab import SIGNAL_BY_KEY
    rows = {r["ticker"]: r for r in lab["rows"]}
    total = 0
    for a in [a for a in list_alerts() if a["active"] and a["kind"] == "signal"]:
        key = a["params"].get("signal")
        if key not in SIGNAL_BY_KEY:
            continue
        label = SIGNAL_BY_KEY[key]["label"]
        verdict = lab["evidence"].get(key, {}).get("verdict_label", "")
        hits = []
        for t in _targets(a, [r["ticker"] for r in lab["rows"] if r["liquid"]]):
            r = rows.get(t)
            if r and key in r["signals"]:
                hits.append((t, f"{t}: {label} ({lab['as_of']}). BIST kanıtı: {verdict}.", r.get("score")))
        # A one-shot signal alert on many stocks still fires once, with every match in the event list.
        total += _fire(a, hits[:40])
    return total


def evaluate_kap_alerts() -> int:
    """New KAP disclosures (since the alert was created) of the chosen category; each disclosure fires once."""
    from services.kap import disclosures, CATEGORY_BY_KEY
    total = 0
    for a in [a for a in list_alerts() if a["active"] and a["kind"] == "kap"]:
        cat = a["params"].get("category") or "any"
        tickers = None if a["ticker"] == "*" else _targets(a, [])
        if tickers is not None and not tickers:
            continue
        items = disclosures(tickers, None if cat == "any" else [cat], a["created_at"], 100)
        if a["ticker"] == "*" and cat == "any":
            items = [d for d in items if d.get("category")]  # never "every disclosure on the exchange"
        with _conn() as conn:
            seen = {int(r[0]) for r in conn.execute("SELECT value FROM alert_events WHERE alert_id = ? AND value IS NOT NULL", (a["id"],)).fetchall()}
        hits = []
        for d in items:
            if d["idx"] in seen:
                continue
            code = (d.get("stock_codes") or d.get("related_stocks") or "").split(",")[0].strip() or "KAP"
            label = CATEGORY_BY_KEY.get(d.get("category"), {}).get("label") or d.get("subject") or "Bildirim"
            hits.append((code, f"{code} KAP: {label}. {d.get('summary') or ''}".strip(), d["idx"]))
        # Repeating alerts would skip a second disclosure of the same stock on the same day; KAP alerts
        # must report every disclosure, so record them directly.
        if hits:
            now = datetime.datetime.now().isoformat(timespec="seconds")
            with _lock, _conn() as conn:
                conn.executemany("INSERT INTO alert_events (alert_id, ticker, kind, message, value, triggered_at) VALUES (?,?,?,?,?,?)",
                                 [(a["id"], t, "kap", m, idx, now) for t, m, idx in hits[:50]])
                conn.execute("UPDATE alerts SET last_triggered = ? WHERE id = ?", (now, a["id"]))
                conn.commit()
            total += len(hits[:50])
    return total


def start_worker() -> None:
    def loop():
        time.sleep(30)
        while True:
            try:
                evaluate_live()
            except Exception as e:
                logger.error(f"Alert worker: {e}")
            time.sleep(60)
    threading.Thread(target=loop, name="alerts", daemon=True).start()
