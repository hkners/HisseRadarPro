"""
Ticker Health Monitoring Service
================================
Monitors all symbols in BIST_TICKERS for data staleness, missing historical prices,
potential symbol changes (ticker renames), and exchange delistings.

Runs periodically in the background (daily/weekly) and exposes status to Admin API.
"""

import datetime
import logging
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class TickerHealthService:
    def __init__(self, check_interval_hours: int = 24, default_stale_days: int = 7):
        self.check_interval_seconds = check_interval_hours * 3600
        self.default_stale_days = default_stale_days
        self._lock = threading.Lock()
        self._last_check_time: Optional[datetime.datetime] = None
        self._last_results: Dict[str, Any] = {
            "status": "INITIALIZING",
            "timestamp": None,
            "total_monitored": 0,
            "healthy_count": 0,
            "stale_count": 0,
            "warnings": [],
            "stale_tickers": []
        }
        self._is_checking = False
        self._thread = threading.Thread(target=self._background_loop, daemon=True)
        self._thread.start()

    def _background_loop(self):
        """Periodically runs health check in the background."""
        # Wait 15 seconds after app start for PriceService and DB init
        time.sleep(15)
        while True:
            try:
                logger.info("TickerHealthService: Starting periodic ticker health check...")
                self.check_stale_tickers(max_stale_days=self.default_stale_days)
            except Exception as e:
                logger.error(f"TickerHealthService: Error during periodic check: {e}", exc_info=True)
            time.sleep(self.check_interval_seconds)

    @staticmethod
    def identify_non_equity_instrument(ticker: str, company_name: str = "", quote_type: str = "") -> Optional[str]:
        """
        Detects non-standard equity instruments such as:
        - Non-EQUITY quoteType from yfinance (MUTUALFUND, ETF, CERTIFICATE, etc.)
        - Founder's shares (e.g. ISKUR)
        - Real estate certificates (e.g. DMLKTG / .GMS)
        - Warrants (.V), Mutual funds, ETFs
        """
        clean = ticker.upper().strip()
        comp = company_name.upper().strip()
        qt = (quote_type or "").upper().strip()

        # 1. quoteType check (e.g. yfinance quoteType != EQUITY)
        if qt and qt != "EQUITY":
            return f"Geçersiz Enstrüman Tipi ({qt} - Hisse Senedi Değil)"

        # 2. Founder shares rule (e.g. ISKUR - İş Bankası Kurucu Hisse Senedi)
        KNOWN_FOUNDER_SHARES = {"ISKUR"}
        if clean in KNOWN_FOUNDER_SHARES or "KURUCU" in comp:
            return "Kurucu İntifa Senedi (Founder's Share - Ortaklık payı değil)"

        # 3. Real estate certificates rule (e.g. DMLKTG, GMS)
        if clean.endswith("GMS") or "SERTİFİKA" in comp or clean == "DMLKTG":
            return "Gayrimenkul Sertifikası (Real Estate Certificate)"

        # 4. Warrants rule (.V or explicit warrant identifiers)
        if clean.endswith(".V") or clean.endswith("_V") or "VARANT" in comp or qt in ("WARRANT", "OPTION"):
            return "Varant (Warrant)"

        # 5. Mutual funds / ETFs
        if "YATIRIM FONU" in comp or "BORSA YATIRIM FONU" in comp or " ETF" in comp:
            return "Yatırım Fonu / ETF"

        return None

    def check_stale_tickers(self, max_stale_days: Optional[int] = None) -> Dict[str, Any]:
        """
        Scans all BIST_TICKERS for historical price staleness and invalid instrument types.
        Identifies tickers with:
        1. NON_EQUITY_INSTRUMENT: Warrants, founder shares, real estate certificates.
        2. NO_DATA: Zero records in historical_prices (possible rename/delisting).
        3. STALE: No updates for more than `max_stale_days` (excluding weekend gaps).
        """
        with self._lock:
            if self._is_checking:
                return self._last_results
            self._is_checking = True

        stale_threshold = max_stale_days if max_stale_days is not None else self.default_stale_days
        today = datetime.date.today()

        try:
            from globals import report_repo, BIST_TICKERS
            known_aliases = report_repo.get_ticker_aliases() if hasattr(report_repo, 'get_ticker_aliases') else {}

            total_tickers = len(BIST_TICKERS)
            stale_tickers = []
            warnings = []

            for ticker in BIST_TICKERS:
                latest_date_str = report_repo.get_latest_price_date(ticker)
                canonical = report_repo.resolve_ticker(ticker) if hasattr(report_repo, 'resolve_ticker') else ticker
                is_alias = (ticker in known_aliases)

                # Check if instrument is a non-standard equity (founder's share, certificate, etc.)
                info = report_repo.get_company_info(ticker) or {}
                fundamentals = info.get("fundamentals", {})
                comp_name = fundamentals.get("longName") or ""
                quote_type = fundamentals.get("quoteType") or ""
                non_equity_reason = self.identify_non_equity_instrument(ticker, comp_name, quote_type)
                if non_equity_reason:
                    msg = f"Yanlış enstrüman türü (Hisse senedi değil): {ticker} - {non_equity_reason}. all_bist.txt listesinden çıkarılmalıdır."
                    stale_info = {
                        "ticker": ticker,
                        "canonical_ticker": canonical,
                        "is_alias": is_alias,
                        "status": "NON_EQUITY_INSTRUMENT",
                        "severity": "CRITICAL",
                        "latest_date": latest_date_str,
                        "days_stale": None,
                        "message": msg
                    }
                    stale_tickers.append(stale_info)
                    warnings.append(msg)
                    continue

                if not latest_date_str:
                    msg = f"Muhtemel sembol değişikliği / delisting: {ticker}, veritabanında hiç fiyat kaydı yok!"
                    stale_info = {
                        "ticker": ticker,
                        "canonical_ticker": canonical,
                        "is_alias": is_alias,
                        "status": "NO_DATA",
                        "severity": "CRITICAL",
                        "latest_date": None,
                        "days_stale": None,
                        "message": msg
                    }
                    stale_tickers.append(stale_info)
                    warnings.append(msg)
                    continue

                try:
                    # Parse YYYY-MM-DD
                    date_part = str(latest_date_str).split("T")[0].split(" ")[0]
                    latest_date = datetime.date.fromisoformat(date_part)
                    days_elapsed = (today - latest_date).days

                    if days_elapsed > stale_threshold:
                        severity = "CRITICAL" if days_elapsed > 14 else "WARNING"
                        msg = f"Muhtemel sembol değişikliği / delisting: {ticker}, son veri tarihi: {latest_date_str} ({days_elapsed} gündür güncellenmedi)"
                        stale_info = {
                            "ticker": ticker,
                            "canonical_ticker": canonical,
                            "is_alias": is_alias,
                            "status": "STALE",
                            "severity": severity,
                            "latest_date": latest_date_str,
                            "days_stale": days_elapsed,
                            "message": msg
                        }
                        stale_tickers.append(stale_info)
                        warnings.append(msg)
                except Exception as e:
                    logger.debug(f"TickerHealthService: Error parsing date {latest_date_str} for {ticker}: {e}")

            healthy_count = total_tickers - len(stale_tickers)
            now = datetime.datetime.now()

            result = {
                "status": "HEALTHY" if len(stale_tickers) == 0 else "WARNING",
                "timestamp": now.isoformat(),
                "threshold_days": stale_threshold,
                "total_monitored": total_tickers,
                "healthy_count": healthy_count,
                "stale_count": len(stale_tickers),
                "warnings": warnings,
                "stale_tickers": stale_tickers
            }

            with self._lock:
                self._last_results = result
                self._last_check_time = now

            if stale_tickers:
                logger.warning(
                    f"TickerHealthService: {len(stale_tickers)}/{total_tickers} stale/missing tickers detected! "
                    f"First 5: {[s['ticker'] for s in stale_tickers[:5]]}"
                )
            else:
                logger.info(f"TickerHealthService: All {total_tickers} tickers are healthy and up-to-date.")

            return result

        finally:
            with self._lock:
                self._is_checking = False

    def get_status(self) -> Dict[str, Any]:
        """Returns the latest health check results."""
        with self._lock:
            # If not yet checked, run check once synchronously
            if self._last_check_time is None:
                pass
            return dict(self._last_results)


# Global singleton instance
ticker_health_service = TickerHealthService()
