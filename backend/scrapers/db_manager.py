import hashlib
import json
import logging
import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


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
        
        self._init_db()
        self._sync_on_init()


    from contextlib import contextmanager

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()


    def _init_db(self) -> None:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
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
                        report_title TEXT
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
                        cached, prompt_id, file_hash, pdf_url, report_title
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        report_title=excluded.report_title
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
                    r.get("report_title", "")
                ))
            conn.commit()

    def save_reports(self, reports: List[Dict[str, Any]]) -> None:
        """Saves reports to both SQLite DB and JSON file."""
        with self._lock:
            self._upsert_reports_db(reports)
            all_reports = self._get_all_reports_db()
            self.save_json_reports(all_reports)

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        d["cached"] = bool(d["cached"])
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
        query = "SELECT * FROM scraped_reports WHERE 1=1"
        params = []

        if ticker and ticker.strip():
            query += " AND UPPER(ticker) = UPPER(?)"
            params.append(ticker.strip())

        if broker and broker.strip():
            query += " AND UPPER(broker) LIKE UPPER(?)"
            params.append(f"%{broker.strip()}%")

        if rating and rating.strip():
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
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            results = []
            term = search.strip().lower() if (search and search.strip()) else None
            for r in rows:
                d = self._row_to_dict(r)
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

    def get_company_info(self, ticker: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM company_info WHERE ticker = ?", (ticker,))
            row = cursor.fetchone()
            if row:
                d = dict(row)
                if d.get("fundamentals_json"):
                    d["fundamentals"] = json.loads(d["fundamentals_json"])
                return d
            return None

    def get_historical_prices(self, ticker: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM historical_prices WHERE ticker = ? ORDER BY date ASC", (ticker,))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

ReportRepository = ReportDBManager
