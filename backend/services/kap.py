"""
HisseRadarPro — KAP (Public Disclosure Platform) feed
=====================================================
Uses the public JSON endpoints behind kap.org.tr, within KAP's stated terms: high-volume access must go
through the official data service (MKK API Portal), so this module keeps request volume to the level
of a person using the site:
- one request returns a whole day's disclosure list (a few hundred items, metadata only);
- at most one request every few seconds (REQUEST_GAP), with back-off after errors;
- disclosure details are fetched only when the user opens a disclosure.
The historical backfill is a one-off, user-started job that fetches one day per request and resumes
where it stopped. Bulk details or attachments would need the official API.

Tables: kap_disclosures (one row per disclosure), kap_disclosure_tickers (disclosure x ticker, role
'filer' for the company that filed, 'related' for stocks named in exchange/regulator notices),
kap_days (days already fetched).
"""

import datetime
import logging
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

BASE = "https://www.kap.org.tr"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (HisseRadarPro personal research; low-volume)",
    "Referer": "https://www.kap.org.tr/tr/bildirim-sorgu",
    "Accept": "application/json",
}
REQUEST_GAP = 3.0          # seconds between requests
DISCLOSURE_URL = "https://www.kap.org.tr/tr/Bildirim/{idx}"

# Event categories: KAP subject -> (key, Turkish label, ticker role used for studies)
CATEGORIES: List[Dict[str, Any]] = [
    {"key": "buyback", "label": "Pay geri alımı", "subjects": ["Payların Geri Alınmasına İlişkin Bildirim"], "role": "filer"},
    {"key": "insider", "label": "Pay alım satım bildirimi (yönetici / ortak)", "subjects": ["Pay Alım Satım Bildirimi"], "role": "filer"},
    {"key": "new_contract", "label": "Yeni iş ilişkisi", "subjects": ["Yeni İş İlişkisi"], "role": "filer"},
    {"key": "dividend", "label": "Kâr payı dağıtımı", "subjects": ["Kar Payı Dağıtım İşlemlerine İlişkin Bildirim"], "role": "filer"},
    {"key": "capital", "label": "Sermaye artırımı / azaltımı", "subjects": ["Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim"], "role": "filer"},
    {"key": "asset_buy", "label": "Finansal duran varlık edinimi", "subjects": ["Finansal Duran Varlık Edinimi"], "role": "filer"},
    {"key": "asset_sell", "label": "Finansal duran varlık satışı", "subjects": ["Finansal Duran Varlık Satışı"], "role": "filer"},
    {"key": "merger", "label": "Birleşme", "subjects": ["Birleşme İşlemlerine İlişkin Bildirim"], "role": "filer"},
    {"key": "tender", "label": "Pay alım teklifi", "subjects": ["Pay Alım Teklifi Yoluyla Pay Toplanmasına İlişkin Bildirim"], "role": "filer"},
    {"key": "rating", "label": "Kredi derecelendirmesi", "subjects": ["Kredi Derecelendirmesi"], "role": "filer"},
    {"key": "financials", "label": "Finansal rapor", "subjects_contains": ["Finansal Rapor"], "role": "filer"},
    {"key": "special", "label": "Özel durum açıklaması", "subjects": ["Özel Durum Açıklaması (Genel)"], "role": "filer"},
    {"key": "circuit_breaker", "label": "Pay bazında devre kesici", "subjects": ["Pay Bazında Devre Kesici Bildirimi"], "role": "related"},
    {"key": "spk_ban", "label": "SPK işlem yasağı duyurusu", "subjects": ["SPK İşlem Yasağı Nedeniyle Pay Duyurusu"], "role": "related"},
    {"key": "measure", "label": "Borsa tedbiri (VBTS vb.)", "subjects_contains": ["Tedbir"], "role": "related"},
    {"key": "index_change", "label": "Endeks değişikliği", "subjects": ["Endeks Şirketlerinde Değişiklik"], "role": "related"},
]
CATEGORY_BY_KEY = {c["key"]: c for c in CATEGORIES}

_session = None
_last_request = 0.0
_req_lock = threading.Lock()
_db_lock = threading.Lock()
_backfill: Dict[str, Any] = {"running": False, "done": 0, "total": 0, "error": None, "started": None}


def category_of(subject: Optional[str]) -> Optional[str]:
    s = subject or ""
    for c in CATEGORIES:
        if s in c.get("subjects", []) or any(x in s for x in c.get("subjects_contains", [])):
            return c["key"]
    return None


# ------------------------------------------------------------------ HTTP

def _request(method: str, path: str, json_body: Optional[dict] = None, retries: int = 2):
    import requests
    global _session, _last_request
    with _req_lock:
        if _session is None:
            _session = requests.Session()
            _session.get(f"{BASE}/tr/bildirim-sorgu", headers=HEADERS, timeout=20)
            _last_request = time.time()
        for attempt in range(retries + 1):
            wait = REQUEST_GAP - (time.time() - _last_request)
            if wait > 0:
                time.sleep(wait)
            try:
                if method == "GET":
                    r = _session.get(BASE + path, headers=HEADERS, timeout=30)
                else:
                    r = _session.post(BASE + path, headers={**HEADERS, "Content-Type": "application/json"}, json=json_body, timeout=30)
                _last_request = time.time()
                if r.status_code == 200:
                    return r.json()
                logger.warning(f"KAP {path}: HTTP {r.status_code}")
            except Exception as e:
                _last_request = time.time()
                logger.warning(f"KAP {path}: {e}")
            time.sleep(REQUEST_GAP * (attempt + 2))  # back off
        return None


# ------------------------------------------------------------------ storage

def _conn():
    from globals import report_repo
    return report_repo._get_connection()


def _ensure_tables() -> None:
    with _conn() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS kap_disclosures (
            idx INTEGER PRIMARY KEY, publish_ts TEXT NOT NULL, subject TEXT, category TEXT, summary TEXT,
            kap_title TEXT, stock_codes TEXT, related_stocks TEXT, disclosure_class TEXT,
            is_late INTEGER, attachment_count INTEGER, modify_status TEXT)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_kap_disc_ts ON kap_disclosures(publish_ts)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_kap_disc_cat ON kap_disclosures(category)")
        conn.execute("""CREATE TABLE IF NOT EXISTS kap_disclosure_tickers (
            idx INTEGER NOT NULL, ticker TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (idx, ticker, role))""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_kap_tick ON kap_disclosure_tickers(ticker)")
        conn.execute("CREATE TABLE IF NOT EXISTS kap_days (day TEXT PRIMARY KEY, count INTEGER, fetched_at TEXT)")
        conn.commit()


def _ts(publish_date: str) -> Optional[str]:
    try:
        return datetime.datetime.strptime(publish_date.strip(), "%d.%m.%Y %H:%M:%S").isoformat()
    except (AttributeError, ValueError):
        return None


def _codes(text: Optional[str]) -> List[str]:
    return [c.strip().upper().split(".")[0] for c in (text or "").split(",") if c.strip()]


def _store(items: List[Dict[str, Any]]) -> int:
    rows, links = [], []
    for d in items:
        ts = _ts(d.get("publishDate", ""))
        idx = d.get("disclosureIndex")
        if not ts or idx is None:
            continue
        subject = (d.get("subject") or "").strip()
        rows.append((idx, ts, subject, category_of(subject), (d.get("summary") or "").strip(), d.get("kapTitle"),
                     d.get("stockCodes"), d.get("relatedStocks"), d.get("disclosureClass"), int(bool(d.get("isLate"))),
                     d.get("attachmentCount"), d.get("modifyStatus")))
        for t in _codes(d.get("stockCodes")):
            links.append((idx, t, "filer"))
        for t in _codes(d.get("relatedStocks")):
            links.append((idx, t, "related"))
    if not rows:
        return 0
    with _db_lock, _conn() as conn:
        conn.executemany("""INSERT INTO kap_disclosures (idx, publish_ts, subject, category, summary, kap_title, stock_codes,
                            related_stocks, disclosure_class, is_late, attachment_count, modify_status)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                            ON CONFLICT(idx) DO UPDATE SET summary = excluded.summary, modify_status = excluded.modify_status""", rows)
        conn.executemany("INSERT OR IGNORE INTO kap_disclosure_tickers (idx, ticker, role) VALUES (?,?,?)", links)
        conn.commit()
    return len(rows)


def fetch_day(day: datetime.date, mark_done: bool = True) -> Optional[int]:
    """All disclosures of one calendar day (one request)."""
    _ensure_tables()
    items = _request("POST", "/tr/api/disclosure/members/byCriteria",
                     {"fromDate": day.isoformat(), "toDate": day.isoformat(), "mkkMemberOidList": [], "subjectList": []})
    if items is None:
        return None
    n = _store(items)
    if mark_done and day < datetime.date.today():
        with _db_lock, _conn() as conn:
            conn.execute("INSERT OR REPLACE INTO kap_days (day, count, fetched_at) VALUES (?,?,?)",
                         (day.isoformat(), len(items), datetime.datetime.now().isoformat(timespec="seconds")))
            conn.commit()
    return n


def sync_recent() -> Dict[str, Any]:
    """Today and yesterday (two requests); called every 30 minutes by the worker."""
    today = datetime.date.today()
    out = {}
    for day in (today - datetime.timedelta(days=1), today):
        out[day.isoformat()] = fetch_day(day, mark_done=day < today)
    return out


def _backfill_job(days: int) -> None:
    try:
        _ensure_tables()
        with _conn() as conn:
            done = {r[0] for r in conn.execute("SELECT day FROM kap_days").fetchall()}
        today = datetime.date.today()
        todo = [today - datetime.timedelta(days=i) for i in range(1, days + 1)]
        todo = [d for d in todo if d.isoformat() not in done]
        _backfill.update(total=len(todo), done=0)
        for d in todo:
            if not _backfill["running"]:
                break
            if fetch_day(d) is None:
                _backfill["error"] = f"{d.isoformat()} alınamadı; daha sonra devam edilebilir."
                time.sleep(REQUEST_GAP * 10)
            _backfill["done"] += 1
    except Exception as e:
        _backfill["error"] = str(e)[:300]
        logger.error(f"KAP backfill failed: {e}")
    finally:
        _backfill["running"] = False
        try:
            from services import kap_events
            kap_events.invalidate()
        except Exception:
            pass


def start_backfill(days: int = 730) -> Dict[str, Any]:
    if _backfill["running"]:
        return backfill_status()
    _backfill.update(running=True, error=None, started=time.time())
    threading.Thread(target=_backfill_job, args=(days,), name="kap-backfill", daemon=True).start()
    return backfill_status()


def stop_backfill() -> Dict[str, Any]:
    _backfill["running"] = False
    return backfill_status()


def backfill_status() -> Dict[str, Any]:
    _ensure_tables()
    with _conn() as conn:
        days = conn.execute("SELECT COUNT(*), MIN(day), MAX(day) FROM kap_days").fetchone()
        n = conn.execute("SELECT COUNT(*) FROM kap_disclosures").fetchone()[0]
    remaining = max(0, _backfill["total"] - _backfill["done"])
    return {**{k: v for k, v in _backfill.items() if k != "started"}, "days_stored": days[0], "first_day": days[1],
            "last_day": days[2], "disclosures": n, "eta_minutes": round(remaining * REQUEST_GAP / 60, 1) if _backfill["running"] else 0}


# ------------------------------------------------------------------ reads

def _row(r) -> Dict[str, Any]:
    d = dict(r)
    d["category_label"] = CATEGORY_BY_KEY.get(d.get("category"), {}).get("label")
    d["url"] = DISCLOSURE_URL.format(idx=d["idx"])
    return d


def disclosures(tickers: Optional[List[str]] = None, categories: Optional[List[str]] = None,
                since: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    _ensure_tables()
    q = "SELECT DISTINCT d.* FROM kap_disclosures d"
    args: List[Any] = []
    where = []
    if tickers:
        q += " JOIN kap_disclosure_tickers t ON t.idx = d.idx"
        where.append(f"t.ticker IN ({','.join('?' * len(tickers))})")
        args += tickers
    if categories:
        where.append(f"d.category IN ({','.join('?' * len(categories))})")
        args += categories
    if since:
        where.append("d.publish_ts >= ?")
        args.append(since)
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY d.publish_ts DESC LIMIT ?"
    args.append(limit)
    with _conn() as conn:
        rows = conn.execute(q, args).fetchall()
    return [_row(r) for r in rows]


def detail(idx: int) -> Optional[Dict[str, Any]]:
    """One disclosure's text (one request, only when the user opens it)."""
    data = _request("GET", f"/tr/api/notification/attachment-detail/{int(idx)}")
    if not data:
        return None
    first = data[0] if isinstance(data, list) and data else data
    body = (first.get("disclosureBody") or [""]) if isinstance(first, dict) else [""]
    html = body[0] if isinstance(body, list) and body else str(body)
    import re
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return {"idx": idx, "text": text[:12000], "url": DISCLOSURE_URL.format(idx=idx)}


def start_worker() -> None:
    def loop():
        time.sleep(40)
        while True:
            try:
                sync_recent()
                from services.alerts import evaluate_kap_alerts
                evaluate_kap_alerts()
            except Exception as e:
                logger.warning(f"KAP worker: {e}")
            time.sleep(1800)
    threading.Thread(target=loop, name="kap-sync", daemon=True).start()
