import hashlib
import json
import logging
import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

def normalize_broker_name(name):
    if not name: return "Bilinmiyor"
    n = name.strip()
    mapping = {
        "Ak": "Ak Yatırım", "Akbank": "Ak Yatırım",
        "Garanti": "Garanti BBVA", "Garanti BBVA Yatırım": "Garanti BBVA",
        "İş": "İş Yatırım", "Deniz": "Deniz Yatırım",
        "Ziraat": "Ziraat Yatırım", "Yapı Kr.": "Yapı Kredi Yatırım",
        "Yapı Kredi": "Yapı Kredi Yatırım", "Vakıf": "Vakıf Yatırım",
        "Halk": "Halk Yatırım", "TEB Yat.": "TEB Yatırım",
        "TEB": "TEB Yatırım", "A1": "A1 Capital",
        "Gedik": "Gedik Yatırım", "Oyak": "Oyak Yatırım",
        "Ahlatcı": "Ahlatcı Yatırım", "Alnus": "Alnus Yatırım",
        "Bulls": "Bulls Yatırım", "Destek": "Destek Yatırım",
        "Fiba": "Fiba Yatırım", "FibaYatırım": "Fiba Yatırım",
        "Global  Menkul": "Global Menkul", "Global": "Global Menkul",
        "Kuv.Türk": "Kuveyt Türk", "Kuveyt Türk Yatırım": "Kuveyt Türk",
        "Phillip": "PhillipCapital", "Phillip Capital": "PhillipCapital",
        "Pusula": "Pusula Yatırım", "Tacirler": "Tacirler Yatırım",
        "Tera": "Tera Yatırım", "İnfo": "İnfo Yatırım",
        "İntegral": "İntegral Yatırım", "Şeker": "Şeker Yatırım",
        "Yat. Fin.": "Yatırım Finansman", "Yatırım Finansman": "Yatırım Finansman",
        "Ünlü": "Ünlü & Co",
    }
    return mapping.get(n, n)


BANNED_BROKERS = {
    "pusula", "pusula yatırım", 
    "tera", "tera yatırım", 
    "a1", "a1 capital", "a1 capital yatırım", 
    "atlas", "atlas yatırım", 
    "info", "i̇nfo", "info yatırım", "i̇nfo yatırım", 
    "bulls", "bulls yatırım", 
    "trive", "trive yatırım", 
    "pardus", "pardus yatırım"
}

def is_broker_banned(name):
    if not name: return False
    norm = normalize_broker_name(name).lower()
    if norm in BANNED_BROKERS: return True
    for b in BANNED_BROKERS:
        if b in norm: return True
    return False


class ReportDBManager:
    """
    Database Manager & Repository for Scraped Research Reports.
    Reads from and writes to both SQLite DB (`scraped_reports.db`) and JSON file (`scraped_reports.json`).
    Provides thread-safe operations for indexed SQL queries, CRUD, multi-parameter filtering, pagination, and stats aggregation.
    """

    def __init__(self, db_path: Optional[str] = None, json_path: Optional[str] = None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.json_path = json_path or os.path.join(base_dir, "scraped_reports.json")
        if db_path:
            self.db_path = db_path
        elif json_path:
            self.db_path = self.json_path.rsplit(".", 1)[0] + ".db"
        else:
            self.db_path = os.path.join(base_dir, "scraped_reports.db")
        self._lock = threading.Lock()
        self._cached_reports = None
        # Cache for company_info batch queries
        self._company_info_cache = None
        self._company_info_cache_time = 0
        
        self._init_db()
        self._sync_on_init()


    from contextlib import contextmanager

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for concurrent reads during writes
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA cache_size=-8000")  # 8MB cache
        conn.execute("PRAGMA synchronous=NORMAL")
        try:
            yield conn
        finally:
            conn.close()


    def _init_db(self) -> None:
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS scraped_reports (
                        id TEXT PRIMARY KEY,
                        ticker TEXT,
                        broker TEXT,
                        rating TEXT,
                        target_price REAL,
                        current_price REAL,
                        potansiyel REAL,
                        report_date TEXT,
                        summary TEXT,
                        catalysts TEXT,
                        full_text TEXT,
                        cached INTEGER,
                        prompt_id TEXT,
                        file_hash TEXT,
                        pdf_url TEXT,
                        report_title TEXT,
                        is_model INTEGER DEFAULT 0,
                        is_stale_due_to_split INTEGER DEFAULT 0
                    )
                """)
                # Create mandatory indexes for high-performance query execution
                conn.execute("CREATE INDEX IF NOT EXISTS idx_scraped_reports_ticker ON scraped_reports(ticker)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_scraped_reports_broker ON scraped_reports(broker)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_scraped_reports_rating ON scraped_reports(rating)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_scraped_reports_date ON scraped_reports(report_date)")
                
                # Create table for caching Yahoo Finance company fundamentals
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS company_info (
                        ticker TEXT PRIMARY KEY,
                        sector TEXT,
                        fundamentals_json TEXT,
                        technical_analysis_json TEXT,
                        last_updated TEXT
                    )
                """)
                
                # Create table for caching 1-year historical prices
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS historical_prices (
                        ticker TEXT,
                        date TEXT,
                        open REAL,
                        high REAL,
                        low REAL,
                        close REAL,
                        volume INTEGER,
                        PRIMARY KEY (ticker, date)
                    )
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_scraped_reports_potansiyel ON scraped_reports(potansiyel)")
                # Cross-ticker date-range scans (momentum ranks, regime breadth, baskets) otherwise read all rows.
                conn.execute("CREATE INDEX IF NOT EXISTS idx_historical_prices_date ON historical_prices(date)")
                
                # Create table for personal portfolio
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_portfolio (
                        ticker TEXT PRIMARY KEY,
                        quantity REAL,
                        cost REAL
                    )
                """)
                
                # Create table for portfolio transactions
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS portfolio_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ticker TEXT,
                        tx_type TEXT,
                        quantity REAL,
                        price REAL,
                        tx_date TEXT
                    )
                """)

                # Create table for ticker aliases (e.g. KOZAL -> TRALT, KOZAA -> TRMET, GRTRK -> GRTHO)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS ticker_aliases (
                        alias TEXT PRIMARY KEY,
                        canonical_ticker TEXT NOT NULL,
                        notes TEXT,
                        created_at TEXT
                    )
                """)
                seed_aliases = [
                    ("KOZAL", "TRALT", "Borsa İstanbul sembol değişikliği (Koza Altın -> Türk Altın)", "2026-09-23"),
                    ("KOZAA", "TRMET", "Borsa İstanbul sembol değişikliği (Koza Anadolu Metal -> TR Anadolu Metal)", "2026-09-23"),
                    ("GRTRK", "GRTHO", "Borsa İstanbul sembol değişikliği (Graintürk -> Graintürk Holding)", "2026-09-23"),
                    ("BSRGZ", "BESLR", "Yazım hatası düzeltmesi (Besler Gıda -> BESLR)", "2026-09-23"),
                ]
                conn.executemany("""
                    INSERT OR IGNORE INTO ticker_aliases (alias, canonical_ticker, notes, created_at)
                    VALUES (?, ?, ?, ?)
                """, seed_aliases)

                # Create table for score history (snapshot per day)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS score_history (
                        ticker TEXT NOT NULL,
                        snapshot_date TEXT NOT NULL,
                        conviction_score REAL,
                        alpha_score REAL,
                        technical_component REAL,
                        fundamental_component REAL,
                        sentiment_component REAL,
                        consensus_component REAL,
                        revision_momentum REAL,
                        price_momentum_percentile REAL,
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (ticker, snapshot_date)
                    )
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_score_history_ticker ON score_history(ticker)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_score_history_date ON score_history(snapshot_date)")

                # Migration guard: check if new columns exist in score_history
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(score_history)")
                existing_cols = {row["name"] for row in cursor.fetchall()}
                if "revision_momentum" not in existing_cols:
                    conn.execute("ALTER TABLE score_history ADD COLUMN revision_momentum REAL")
                if "price_momentum_percentile" not in existing_cols:
                    conn.execute("ALTER TABLE score_history ADD COLUMN price_momentum_percentile REAL")

                # Migration guard: paper vs real money accounts on portfolio transactions
                cursor.execute("PRAGMA table_info(portfolio_transactions)")
                tx_cols = {row["name"] for row in cursor.fetchall()}
                if "account" not in tx_cols:
                    conn.execute("ALTER TABLE portfolio_transactions ADD COLUMN account TEXT NOT NULL DEFAULT 'real'")

                # Migration guard: check if sector column exists in company_info
                cursor.execute("PRAGMA table_info(company_info)")
                company_info_cols = {row["name"] for row in cursor.fetchall()}
                if "sector" not in company_info_cols:
                    conn.execute("ALTER TABLE company_info ADD COLUMN sector TEXT")

                # Auto-backfill missing sectors from fundamentals_json if any
                cursor.execute("SELECT ticker, fundamentals_json FROM company_info WHERE sector IS NULL OR sector = ''")
                missing_sector_rows = cursor.fetchall()
                for row in missing_sector_rows:
                    t_sym = row["ticker"]
                    f_json = row["fundamentals_json"]
                    sec = None
                    if f_json:
                        try:
                            f_data = json.loads(f_json)
                            sec = f_data.get("sector") or f_data.get("sectorKey") or f_data.get("category")
                        except Exception:
                            pass
                    if sec:
                        conn.execute("UPDATE company_info SET sector = ? WHERE ticker = ?", (sec, t_sym))

                # Create table for target revision logs
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS target_revision_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ticker TEXT NOT NULL,
                        broker TEXT NOT NULL,
                        old_target REAL,
                        new_target REAL,
                        revision_pct REAL,
                        report_date TEXT,
                        created_at TEXT NOT NULL
                    )
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_revision_log_ticker ON target_revision_log(ticker)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_revision_log_date ON target_revision_log(report_date)")

                conn.commit()

    def _sync_on_init(self) -> None:
        """Ensure SQLite DB is populated from JSON if DB is empty or JSON from DB if JSON is empty."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM scraped_reports")
                count = cursor.fetchone()[0]
                
            if count == 0 and os.path.exists(self.json_path):
                reports = self.load_json_reports(include_full_text=True)
                if reports:
                    self._upsert_reports_db(reports)
            elif count > 0 and (not os.path.exists(self.json_path) or os.path.getsize(self.json_path) == 0):
                all_reports = self._get_all_reports_db()
                self.save_json_reports(all_reports)

    def load_json_reports(self, include_full_text: bool = False) -> List[Dict[str, Any]]:
        """Reads reports directly from scraped_reports.json, cached in memory."""
        if self._cached_reports is not None:
            if include_full_text:
                return [r.copy() for r in self._cached_reports]
            return [{k: v for k, v in r.items() if k != "full_text"} for r in self._cached_reports]

        if not os.path.exists(self.json_path):
            return []
        try:
            with open(self.json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                reports = data if isinstance(data, list) else []
                self._cached_reports = reports
                if include_full_text:
                    return [r.copy() for r in self._cached_reports]
                return [{k: v for k, v in r.items() if k != "full_text"} for r in self._cached_reports]
        except Exception as e:
            logger.error(f"Error reading {self.json_path}: {e}")
            return []

    def save_json_reports(self, reports: List[Dict[str, Any]]) -> None:
        """Atomic write of reports to scraped_reports.json."""
        os.makedirs(os.path.dirname(self.json_path), exist_ok=True)
        tmp_file = self.json_path + ".tmp"
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(reports, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, self.json_path)
            self._cached_reports = reports  # Update memory cache
        except Exception as e:
            logger.error(f"Error writing to {self.json_path}: {e}")
            if os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except OSError:
                    pass

    def _upsert_reports_db(self, reports: List[Dict[str, Any]]) -> None:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            for r in reports:
                file_hash = r.get("file_hash", "")
                report_id = r.get("id")
                if not report_id:
                    if file_hash:
                        report_id = f"report_{file_hash[-12:]}"
                    else:
                        raw_str = f"{r.get('ticker')}_{r.get('broker')}_{r.get('report_date')}_{r.get('report_title')}"
                        report_id = f"report_{hashlib.md5(raw_str.encode('utf-8')).hexdigest()[:12]}"

                cursor.execute("""
                    INSERT INTO scraped_reports (
                        id, ticker, broker, rating, target_price, current_price,
                        potansiyel, report_date, summary, catalysts, full_text,
                        cached, prompt_id, file_hash, pdf_url, report_title, is_model,
                        is_stale_due_to_split
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        ticker=excluded.ticker,
                        broker=excluded.broker,
                        rating=excluded.rating,
                        target_price=excluded.target_price,
                        current_price=excluded.current_price,
                        potansiyel=excluded.potansiyel,
                        report_date=excluded.report_date,
                        summary=excluded.summary,
                        catalysts=excluded.catalysts,
                        full_text=excluded.full_text,
                        cached=excluded.cached,
                        prompt_id=excluded.prompt_id,
                        file_hash=excluded.file_hash,
                        pdf_url=excluded.pdf_url,
                        report_title=excluded.report_title,
                        is_model=excluded.is_model,
                        is_stale_due_to_split=excluded.is_stale_due_to_split
                """, (
                    report_id,
                    r.get("ticker", ""),
                    r.get("broker", ""),
                    r.get("rating", ""),
                    float(r.get("target_price", 0.0) or 0.0),
                    float(r.get("current_price", 0.0) or 0.0),
                    float(r.get("potansiyel", 0.0) or 0.0),
                    r.get("report_date", ""),
                    r.get("summary", ""),
                    r.get("catalysts", ""),
                    r.get("full_text", ""),
                    1 if r.get("cached") else 0,
                    r.get("prompt_id", ""),
                    r.get("file_hash", ""),
                    r.get("pdf_url", ""),
                    r.get("report_title", ""),
                    1 if r.get("is_model") else 0,
                    1 if r.get("is_stale_due_to_split") else 0
                ))
            conn.commit()

    def save_reports(self, reports: List[Dict[str, Any]]) -> int:
        """Saves reports to both SQLite DB and JSON file. Returns count saved."""
        valid_reports = []
        for r in reports:
            r["broker"] = normalize_broker_name(r.get("broker"))
            if not is_broker_banned(r["broker"]):
                valid_reports.append(r)

        with self._lock:
            self._upsert_reports_db(valid_reports)
            all_reports = self._get_all_reports_db()
            self.save_json_reports(all_reports)
            
        return len(valid_reports)

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        d["cached"] = bool(d["cached"])
        if "is_model" in d:
            d["is_model"] = bool(d["is_model"])
        if "is_stale_due_to_split" in d:
            d["is_stale_due_to_split"] = bool(d["is_stale_due_to_split"])
        return d

    def _get_all_reports_db(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM scraped_reports ORDER BY report_date DESC")
            rows = cursor.fetchall()
            return [self._row_to_dict(r) for r in rows]

    def reload(self) -> None:
        """Reload data from scraped_reports.json into SQLite DB."""
        reports = self.load_json_reports(include_full_text=True)
        if reports:
            with self._lock:
                self._upsert_reports_db(reports)

    def get_report_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single research report by ID from SQLite DB."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM scraped_reports WHERE id = ?", (report_id,))
            row = cursor.fetchone()
            if row:
                d = self._row_to_dict(row)
                if not d.get("summary") and d.get("full_text"):
                    d["summary"] = d["full_text"]
                return d
            return None

    def get_reports(
        self,
        ticker: Optional[str] = None,
        broker: Optional[str] = None,
        rating: Optional[str] = None,
        search: Optional[str] = None,
        min_upside: Optional[float] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieves filtered research reports directly from SQLite using indexed SQL queries.
        Supports filtering by:
        - ticker (case-insensitive exact match using index)
        - broker (case-insensitive substring match using index)
        - rating (case-insensitive substring match using index)
        - search (full-text SQL search across report_title, summary, catalysts, full_text, ticker, broker)
        - min_upside (minimum potansiyel yield percentage using index)
        - limit & offset (SQL pagination)
        """
        query = "SELECT * FROM scraped_reports WHERE is_stale_due_to_split = 0"
        params = []

        if ticker and ticker.strip():
            variants = self.get_all_ticker_variants(ticker.strip())
            placeholders = ",".join("?" * len(variants))
            query += f" AND UPPER(ticker) IN ({placeholders})"
            params.extend([v.upper() for v in variants])

        if broker and broker.strip():
            query += " AND UPPER(broker) LIKE UPPER(?)"
            params.append(f"%{broker.strip()}%")

        rating_category = None
        if rating and rating.strip():
            if rating.strip().upper() in ("AL", "TUT", "SAT"):
                # Category filter through the shared parser ("Endeks Üstü" is AL, "Endekse Paralel" is not).
                rating_category = rating.strip().upper()
                query += " AND rating_cat(rating) = ?"
                params.append(rating_category)
            else:
                query += " AND UPPER(rating) LIKE UPPER(?)"
                params.append(f"%{rating.strip()}%")

        if min_upside is not None:
            query += " AND potansiyel >= ?"
            params.append(float(min_upside))

        if search and search.strip():
            term = f"%{search.strip()}%"
            query += " AND (UPPER(report_title) LIKE UPPER(?) OR UPPER(summary) LIKE UPPER(?) OR UPPER(catalysts) LIKE UPPER(?) OR UPPER(full_text) LIKE UPPER(?) OR UPPER(ticker) LIKE UPPER(?) OR UPPER(broker) LIKE UPPER(?))"
            params.extend([term] * 6)

        query += " ORDER BY report_date DESC"

        if limit is not None and limit > 0:
            query += " LIMIT ?"
            params.append(int(limit))
            if offset is not None and offset >= 0:
                query += " OFFSET ?"
                params.append(int(offset))
        elif offset is not None and offset >= 0:
            query += " LIMIT -1 OFFSET ?"
            params.append(int(offset))

        with self._get_connection() as conn:
            if rating_category:
                from services.ticker_resolver import parse_rating
                conn.create_function("rating_cat", 1, parse_rating, deterministic=True)
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            results = []
            seen_reports = set()
            term = search.strip().lower() if (search and search.strip()) else None
            for r in rows:
                d = self._row_to_dict(r)
                if ticker:
                    rep_key = (d.get("broker"), d.get("report_date"), d.get("target_price"))
                    if rep_key in seen_reports:
                        continue
                    seen_reports.add(rep_key)
                if not d.get("summary") and d.get("full_text"):
                    d["summary"] = d["full_text"]
                elif term and d.get("full_text") and term in str(d["full_text"]).lower():
                    s_low = str(d.get("summary", "")).lower()
                    t_low = str(d.get("report_title", "")).lower()
                    c_low = str(d.get("catalysts", "")).lower()
                    if term not in s_low and term not in t_low and term not in c_low:
                        d["summary"] = (str(d.get("summary", "")) + " " + str(d["full_text"])).strip()
                results.append(d)
            return results



    def get_stats(self) -> Dict[str, Any]:
        """
        Computes aggregated statistics over all research reports using SQL queries.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM scraped_reports")
            total_reports = cursor.fetchone()[0]

            cursor.execute("SELECT broker, COUNT(*) FROM scraped_reports GROUP BY broker")
            broker_counts = {row[0] or "Unknown": row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT rating, COUNT(*) FROM scraped_reports GROUP BY rating")
            rating_counts = {row[0] or "NEUTRAL": row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT AVG(potansiyel) FROM scraped_reports WHERE potansiyel IS NOT NULL")
            avg_row = cursor.fetchone()
            avg_upside = round(avg_row[0], 2) if avg_row and avg_row[0] is not None else 0.0

            cursor.execute("SELECT * FROM scraped_reports ORDER BY potansiyel DESC LIMIT 5")
            top_rows = cursor.fetchall()
            top_recommendations = [self._row_to_dict(r) for r in top_rows]

        return {
            "total_reports": total_reports,
            "broker_counts": broker_counts,
            "rating_counts": rating_counts,
            "avg_potential": avg_upside,
            "top_recommendations": top_recommendations
        }

    # --- Ticker Alias Resolution Methods ---
    def get_ticker_aliases(self) -> Dict[str, str]:
        """Returns dict mapping alias -> canonical_ticker."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT alias, canonical_ticker FROM ticker_aliases")
            return {row[0].upper(): row[1].upper() for row in cursor.fetchall()}

    def resolve_ticker(self, ticker: str) -> str:
        """Resolves any alias to its active canonical ticker symbol."""
        if not ticker:
            return ""
        clean = ticker.upper().strip()
        aliases = self.get_ticker_aliases()
        return aliases.get(clean, clean)

    def get_all_ticker_variants(self, ticker: str) -> List[str]:
        """Returns list containing the canonical ticker and all known aliases."""
        if not ticker:
            return []
        clean = ticker.upper().strip()
        aliases = self.get_ticker_aliases()
        canonical = aliases.get(clean, clean)
        variants = {canonical, clean}
        for alias, can in aliases.items():
            if can == canonical:
                variants.add(alias)
        return list(variants)

    def get_company_info(self, ticker: str) -> Optional[Dict[str, Any]]:
        # Use batch cache if available (avoids per-ticker DB hit)
        import time as _time
        clean = ticker.upper().strip() if ticker else ""
        if self._company_info_cache is not None and (_time.time() - self._company_info_cache_time) < 300:
            info = self._company_info_cache.get(clean)
            if info and info.get("sector") and info.get("sector") != "Bilinmiyor":
                return info
            canonical = self.resolve_ticker(clean)
            if canonical != clean:
                can_info = self._company_info_cache.get(canonical)
                if can_info:
                    return can_info
            return info
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM company_info WHERE ticker = ?", (clean,))
            row = cursor.fetchone()
            if not row or (dict(row).get("sector") == "Bilinmiyor"):
                canonical = self.resolve_ticker(clean)
                if canonical != clean:
                    cursor.execute("SELECT * FROM company_info WHERE ticker = ?", (canonical,))
                    can_row = cursor.fetchone()
                    if can_row:
                        row = can_row
            if row:
                d = dict(row)
                if d.get("fundamentals_json"):
                    d["fundamentals"] = json.loads(d["fundamentals_json"])
                if d.get("technical_analysis_json"):
                    d["technical_analysis"] = json.loads(d["technical_analysis_json"])
                return d
            return None

    def get_all_company_info(self) -> Dict[str, Dict[str, Any]]:
        """Batch load ALL company_info into a dict keyed by ticker. Cached for 5 min."""
        import time as _time
        now = _time.time()
        if self._company_info_cache is not None and (now - self._company_info_cache_time) < 300:
            return self._company_info_cache
        result = {}
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM company_info")
            for row in cursor.fetchall():
                d = dict(row)
                if d.get("fundamentals_json"):
                    d["fundamentals"] = json.loads(d["fundamentals_json"])
                if d.get("technical_analysis_json"):
                    d["technical_analysis"] = json.loads(d["technical_analysis_json"])
                result[d["ticker"]] = d
        self._company_info_cache = result
        self._company_info_cache_time = now
        return result

    def get_historical_prices(self, ticker: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if limit:
                cursor.execute(
                    "SELECT * FROM (SELECT * FROM historical_prices WHERE ticker = ? ORDER BY date DESC LIMIT ?) ORDER BY date ASC",
                    (ticker, limit)
                )
            else:
                cursor.execute("SELECT * FROM historical_prices WHERE ticker = ? ORDER BY date ASC", (ticker,))
            rows = cursor.fetchall()
            if not rows:
                canonical = self.resolve_ticker(ticker)
                if canonical != ticker:
                    if limit:
                        cursor.execute(
                            "SELECT * FROM (SELECT * FROM historical_prices WHERE ticker = ? ORDER BY date DESC LIMIT ?) ORDER BY date ASC",
                            (canonical, limit)
                        )
                    else:
                        cursor.execute("SELECT * FROM historical_prices WHERE ticker = ? ORDER BY date ASC", (canonical,))
                    rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def get_latest_price_date(self, ticker: str) -> Optional[str]:
        """Returns the latest date string for a ticker's historical prices, or None."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(date) FROM historical_prices WHERE ticker = ?", (ticker,))
            row = cursor.fetchone()
            if row and row[0]:
                return row[0]
            canonical = self.resolve_ticker(ticker)
            if canonical != ticker:
                cursor.execute("SELECT MAX(date) FROM historical_prices WHERE ticker = ?", (canonical,))
                row = cursor.fetchone()
                return row[0] if row and row[0] else None
            return None

    # --- YFinance Data Sync Methods ---
    def upsert_company_info(self, ticker: str, sector: str, fundamentals_json: str, last_updated: str) -> None:
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO company_info (ticker, sector, fundamentals_json, technical_analysis_json, last_updated)
                    VALUES (?, ?, ?, NULL, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        sector=excluded.sector,
                        fundamentals_json=excluded.fundamentals_json,
                        last_updated=excluded.last_updated
                """, (ticker, sector, fundamentals_json, last_updated))
                conn.commit()

    def update_technical_analysis(self, ticker: str, ta_json: str) -> None:
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    UPDATE company_info 
                    SET technical_analysis_json = ? 
                    WHERE ticker = ?
                """, (ta_json, ticker))
                conn.commit()

    def upsert_historical_prices(self, records: List[tuple]) -> None:
        """records is a list of (ticker, date, open, high, low, close, volume)"""
        with self._lock:
            with self._get_connection() as conn:
                conn.executemany("""
                    INSERT INTO historical_prices (ticker, date, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticker, date) DO UPDATE SET
                        open=excluded.open,
                        high=excluded.high,
                        low=excluded.low,
                        close=excluded.close,
                        volume=excluded.volume
                """, records)
                conn.commit()

    # --- Score History Methods ---
    def upsert_score_history(self, records: List[Dict[str, Any]]) -> int:
        """
        Upserts daily score snapshots into score_history.
        Uses COALESCE so conviction_engine and alpha_engine can update
        their respective metrics independently on the same date without overwriting each other.
        """
        if not records:
            return 0
        rows = []
        for r in records:
            ticker = str(r.get("ticker", "")).upper().strip()
            snapshot_date = str(r.get("snapshot_date", ""))[:10]
            if not ticker or not snapshot_date:
                continue
            rows.append((
                ticker,
                snapshot_date,
                r.get("conviction_score"),
                r.get("alpha_score"),
                r.get("technical_component"),
                r.get("fundamental_component"),
                r.get("sentiment_component"),
                r.get("consensus_component"),
                r.get("revision_momentum"),
                r.get("price_momentum_percentile"),
                r.get("created_at") or r.get("snapshot_date")
            ))
        if not rows:
            return 0
        with self._lock:
            with self._get_connection() as conn:
                conn.executemany("""
                    INSERT INTO score_history (
                        ticker, snapshot_date, conviction_score, alpha_score,
                        technical_component, fundamental_component, sentiment_component,
                        consensus_component, revision_momentum, price_momentum_percentile, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticker, snapshot_date) DO UPDATE SET
                        conviction_score = COALESCE(excluded.conviction_score, score_history.conviction_score),
                        alpha_score = COALESCE(excluded.alpha_score, score_history.alpha_score),
                        technical_component = COALESCE(excluded.technical_component, score_history.technical_component),
                        fundamental_component = COALESCE(excluded.fundamental_component, score_history.fundamental_component),
                        sentiment_component = COALESCE(excluded.sentiment_component, score_history.sentiment_component),
                        consensus_component = COALESCE(excluded.consensus_component, score_history.consensus_component),
                        revision_momentum = COALESCE(excluded.revision_momentum, score_history.revision_momentum),
                        price_momentum_percentile = COALESCE(excluded.price_momentum_percentile, score_history.price_momentum_percentile),
                        created_at = excluded.created_at
                """, rows)
                conn.commit()
        return len(rows)

    def get_score_history(
        self,
        ticker: Optional[str] = None,
        metric: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Query score_history with optional filters."""
        query = "SELECT * FROM score_history WHERE 1=1"
        params = []
        if ticker:
            query += " AND ticker = ?"
            params.append(ticker.upper().strip())
        if metric:
            # Validate metric against column name injection
            allowed_cols = {
                "conviction_score", "alpha_score", "technical_component",
                "fundamental_component", "sentiment_component", "consensus_component",
                "revision_momentum", "price_momentum_percentile"
            }
            if metric in allowed_cols:
                query += f" AND {metric} IS NOT NULL"
        if from_date:
            query += " AND snapshot_date >= ?"
            params.append(from_date)
        if to_date:
            query += " AND snapshot_date <= ?"
            params.append(to_date)
        query += " ORDER BY snapshot_date ASC, ticker ASC"
        if limit:
            query += f" LIMIT {int(limit)}"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [dict(r) for r in cursor.fetchall()]

    def get_price_on_or_after(self, ticker: str, target_date: str) -> Optional[Dict[str, Any]]:
        """Returns the first available historical price trading day on or after target_date."""
        clean = ticker.upper().strip()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM historical_prices WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1",
                (clean, target_date)
            )
            row = cursor.fetchone()
            if not row:
                canonical = self.resolve_ticker(clean)
                if canonical != clean:
                    cursor.execute(
                        "SELECT * FROM historical_prices WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1",
                        (canonical, target_date)
                    )
                    row = cursor.fetchone()
            return dict(row) if row else None

    # --- User Portfolio Methods ---
    PORTFOLIO_ACCOUNTS = ("real", "paper")

    def _replay_transactions(self, account: Optional[str] = None) -> Dict[tuple, Dict[str, float]]:
        """Average-cost replay of every transaction, per (ticker, account).
        A sale realises (sale price - average cost) x quantity. A sale larger than the position is
        capped at the position (the API rejects such sales; this guards older data)."""
        book: Dict[tuple, Dict[str, float]] = {}
        for tx in self.get_portfolio_transactions(account):
            key = (tx['ticker'], tx.get('account') or 'real')
            pos = book.setdefault(key, {'quantity': 0.0, 'total_cost': 0.0, 'realized': 0.0, 'sold_qty': 0.0})
            qty = float(tx['quantity'])
            price = float(tx['price'])
            if tx['tx_type'] == 'BUY':
                pos['quantity'] += qty
                pos['total_cost'] += qty * price
            elif tx['tx_type'] == 'SELL' and pos['quantity'] > 1e-9:
                sold = min(qty, pos['quantity'])
                avg_cost = pos['total_cost'] / pos['quantity']
                pos['realized'] += sold * (price - avg_cost)
                pos['sold_qty'] += sold
                pos['quantity'] -= sold
                pos['total_cost'] -= sold * avg_cost
        return book

    def get_user_portfolio(self, account: Optional[str] = None) -> List[Dict[str, Any]]:
        """Open positions derived from transactions, one row per (ticker, account).
        account: 'real' | 'paper' | None (both)."""
        result = []
        for (t, acc), data in self._replay_transactions(account).items():
            if data['quantity'] > 1e-9:
                result.append({
                    'ticker': t,
                    'account': acc,
                    'quantity': data['quantity'],
                    'cost': data['total_cost'] / data['quantity'],
                    'realized_pnl': data['realized'],
                })
        return result

    def get_realized_pnl(self, account: Optional[str] = None) -> Dict[str, Any]:
        """Realised profit/loss from sales, including fully closed positions."""
        rows = [
            {'ticker': t, 'account': acc, 'realized_pnl': d['realized'], 'sold_quantity': d['sold_qty'],
             'open_quantity': d['quantity']}
            for (t, acc), d in self._replay_transactions(account).items() if d['sold_qty'] > 0
        ]
        return {'total': sum(r['realized_pnl'] for r in rows), 'rows': sorted(rows, key=lambda r: r['realized_pnl'])}

    def holdings_as_of(self, account: str, extra: Optional[List[Dict[str, Any]]] = None) -> Optional[str]:
        """Replays the account's transactions plus `extra` in date order and returns an error message
        if any sale exceeds the quantity held at that moment, otherwise None."""
        txs = [dict(t, _order=(str(t['tx_date'])[:10], 0, t['id'])) for t in self.get_portfolio_transactions(account)]
        for i, t in enumerate(extra or []):
            txs.append(dict(t, _order=(str(t.get('tx_date') or '')[:10], 1, i)))
        held: Dict[str, float] = {}
        for t in sorted(txs, key=lambda x: x['_order']):
            tk = str(t['ticker']).upper()
            qty = float(t['quantity'])
            if str(t['tx_type']).upper() == 'BUY':
                held[tk] = held.get(tk, 0.0) + qty
            else:
                have = held.get(tk, 0.0)
                if qty > have + 1e-9:
                    n = lambda v: f"{v:.4f}".rstrip("0").rstrip(".").replace(".", ",")
                    return f"{tk}: {t['_order'][0]} tarihinde elde {n(have)} adet varken {n(qty)} adet satış girilemez."
                held[tk] = have - qty
        return None

    def get_portfolio_transactions(self, account: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if account:
                cursor.execute("SELECT * FROM portfolio_transactions WHERE account = ? ORDER BY tx_date ASC, id ASC", (account,))
            else:
                cursor.execute("SELECT * FROM portfolio_transactions ORDER BY tx_date ASC, id ASC")
            return [dict(r) for r in cursor.fetchall()]

    def add_portfolio_transaction(self, ticker: str, tx_type: str, quantity: float, price: float, tx_date: str, account: str = "real") -> None:
        with self._lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO portfolio_transactions (ticker, tx_type, quantity, price, tx_date, account)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (ticker.upper(), tx_type.upper(), quantity, price, tx_date, account))
                conn.commit()

    def add_portfolio_transactions_batch(self, transactions: List[Dict[str, Any]], account: str = "real") -> int:
        """Batch insert multiple portfolio transactions in a single transaction. Returns rows inserted."""
        import datetime
        if not transactions:
            return 0
        records = [
            (
                tx["ticker"].upper().strip(),
                tx.get("tx_type", "BUY").upper(),
                float(tx["quantity"]),
                float(tx["price"]),
                tx.get("tx_date") or datetime.date.today().isoformat(),
                tx.get("account") or account,
            )
            for tx in transactions
            if float(tx.get("quantity", 0)) > 0 and float(tx.get("price", 0)) > 0
        ]
        if not records:
            return 0
        with self._lock:
            with self._get_connection() as conn:
                conn.executemany("""
                    INSERT INTO portfolio_transactions (ticker, tx_type, quantity, price, tx_date, account)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, records)
                conn.commit()
        return len(records)

    def add_to_portfolio(self, ticker: str, quantity: float, cost: float, account: str = "real") -> None:
        # Legacy method fallback: Just add a BUY transaction for today if we're adding via the old UI
        import datetime
        self.add_portfolio_transaction(ticker, 'BUY', quantity, cost, datetime.date.today().isoformat(), account)

    def remove_from_portfolio(self, ticker: str, account: Optional[str] = None) -> int:
        """Deletes every transaction of a ticker (optionally only in one account). Returns rows removed."""
        with self._lock:
            with self._get_connection() as conn:
                if account:
                    cur = conn.execute("DELETE FROM portfolio_transactions WHERE ticker = ? AND account = ?", (ticker.upper(), account))
                else:
                    cur = conn.execute("DELETE FROM portfolio_transactions WHERE ticker = ?", (ticker.upper(),))
                conn.commit()
                return cur.rowcount

ReportRepository = ReportDBManager
