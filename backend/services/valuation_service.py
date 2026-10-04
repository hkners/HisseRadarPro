"""
HisseRadarPro — Valuation Service (Dinamik ve Göreceli Değerleme Motoru)
======================================================================
Bu servis, sabit ve sektörden bağımsız F/K ve ROE eşikleri yerine:
1. compute_historical_percentile: Hissenin kendi 3 yıllık geçmiş çarpan serisindeki dilimini hesaplar (ucuzluk).
2. compute_sector_relative: Hissenin aynı sektördeki diğer hisselerin medyan çarpanına oranını hesaplar.
3. compute_valuation_score: %60 Tarihsel + %40 Sektör Göreceliği ağırlığıyla 0-100 arası tek bir değerleme skoru üretir.
4. compute_sector_relative_roe: ROE'yi sektör medyanına göre göreli hale getirir (özkaynak karlılığı üstünlüğü).
"""

import datetime
import json
import logging
import statistics
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


class ValuationService:
    def __init__(self, repo=None):
        self._repo = repo
        self._sector_cache: Dict[str, Dict[str, Any]] = {}
        self._industry_cache: Dict[str, Dict[str, Any]] = {}
        self._sector_cache_time: float = 0.0
        self._hist_cache: Dict[Tuple[str, str, int], Tuple[float, float]] = {}
        self._lock = threading.Lock()

    def _get_repo(self):
        if self._repo is not None:
            return self._repo
        try:
            from db_manager import ReportRepository
            self._repo = ReportRepository()
            return self._repo
        except Exception:
            from globals import report_repo
            return report_repo

    def _refresh_sector_cache_if_needed(self, repo):
        now = time.time()
        with self._lock:
            if self._sector_cache and (now - self._sector_cache_time) < 300:
                return

            all_companies = repo.get_all_company_info() or {}
            sector_data: Dict[str, Dict[str, List[float]]] = {}
            industry_data: Dict[str, Dict[str, List[float]]] = {}

            for ticker, row in all_companies.items():
                sec = row.get("sector")
                if not sec or sec == "Unknown":
                    continue

                if sec not in sector_data:
                    sector_data[sec] = {
                        "pe_list": [],
                        "pb_list": [],
                        "roe_list": [],
                        "tickers": []
                    }

                sector_data[sec]["tickers"].append(ticker)

                # Parse fundamentals
                f_json = row.get("fundamentals_json")
                if not f_json:
                    continue
                try:
                    f = json.loads(f_json) if isinstance(f_json, str) else f_json
                except Exception:
                    continue

                # P/E
                pe = f.get("trailingPE")
                if pe is None or float(pe) <= 0:
                    pe = f.get("forwardPE")
                try:
                    if pe is not None and 0 < float(pe) < 300:
                        sector_data[sec]["pe_list"].append((ticker, float(pe)))
                except (ValueError, TypeError):
                    pass

                # P/B
                pb = f.get("priceToBook")
                try:
                    if pb is not None and 0 < float(pb) < 100:
                        sector_data[sec]["pb_list"].append((ticker, float(pb)))
                except (ValueError, TypeError):
                    pass

                # ROE
                roe = f.get("returnOnEquity")
                try:
                    if roe is not None:
                        r_flt = float(roe)
                        if -1.0 <= r_flt <= 2.0:
                            sector_data[sec]["roe_list"].append((ticker, r_flt))
                except (ValueError, TypeError):
                    pass

                industry = f.get("industry")
                if industry:
                    ind = industry_data.setdefault(industry, {"pe_list": [], "pb_list": [], "tickers": []})
                    ind["tickers"].append(ticker)
                    for key in ("pe_list", "pb_list"):
                        hit = [m for (t, m) in sector_data[sec][key] if t == ticker]
                        if hit:
                            ind[key].append((ticker, hit[0]))

            self._sector_cache = sector_data
            self._industry_cache = industry_data
            self._sector_cache_time = now

    def compute_historical_percentile(
        self,
        ticker: str,
        metric: str = "pe_ratio",
        lookback_years: int = 3,
        repo=None
    ) -> Optional[float]:
        """
        Hissenin kendi tarihi F/K veya PD/DD serisi içinde şu anki değerinin
        yüzdelik dilimini hesaplar (0-100).
        Düşük yüzdelik = tarihine göre ucuz (örn. %10 = geçmişinin %90'ından daha ucuz).
        Eğer tam bilanço bazlı geçmiş serisi yoksa güncel EPS/BV ile geçmiş fiyat
        serisinden çarpan serisi türetilir.
        """
        r = repo or self._get_repo()
        clean = ticker.upper().strip()

        cache_key = (clean, metric, lookback_years)
        now = time.time()
        with self._lock:
            cached = self._hist_cache.get(cache_key)
            if cached and (now - cached[1]) < 300:
                return cached[0]

        comp_info = r.get_company_info(clean)
        if not comp_info:
            return None

        f_json = comp_info.get("fundamentals_json")
        f = {}
        if f_json:
            try:
                f = json.loads(f_json) if isinstance(f_json, str) else f_json
            except Exception:
                f = {}

        # Fetch latest price
        with r._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT date, close FROM historical_prices WHERE ticker = ? ORDER BY date DESC LIMIT 1",
                (clean,)
            )
            latest_row = cursor.fetchone()
            if not latest_row:
                return None
            latest_date, current_price = latest_row[0], latest_row[1]

            # Fetch lookback historical prices
            cursor.execute(
                """
                SELECT date, close FROM historical_prices 
                WHERE ticker = ? AND date >= date(?, ? || ' years')
                ORDER BY date ASC
                """,
                (clean, latest_date, f"-{lookback_years}")
            )
            hist_rows = cursor.fetchall()

        prices = [row[1] for row in hist_rows if row[1] is not None and row[1] > 0]
        if len(prices) < 20:
            return None

        # Determine current multiple and divisor for historical series
        current_multiple = None
        divisor = None

        if metric in ("pe_ratio", "pe"):
            trailing_pe = f.get("trailingPE")
            trailing_eps = f.get("trailingEps")
            forward_pe = f.get("forwardPE")
            forward_eps = f.get("forwardEps")

            if trailing_pe is not None and float(trailing_pe) > 0:
                current_multiple = float(trailing_pe)
                if trailing_eps and float(trailing_eps) > 0:
                    divisor = float(trailing_eps)
            elif forward_pe is not None and float(forward_pe) > 0:
                current_multiple = float(forward_pe)
                if forward_eps and float(forward_eps) > 0:
                    divisor = float(forward_eps)
            elif trailing_eps and float(trailing_eps) > 0 and current_price > 0:
                divisor = float(trailing_eps)
                current_multiple = current_price / divisor
            elif forward_eps and float(forward_eps) > 0 and current_price > 0:
                divisor = float(forward_eps)
                current_multiple = current_price / divisor

            # If P/E is not available (e.g. temporary trailing loss), fallback to P/B
            if current_multiple is None:
                pb = f.get("priceToBook")
                if pb is not None and float(pb) > 0:
                    current_multiple = float(pb)
                    bv = (current_price / current_multiple) if current_multiple > 0 else None
                    if bv and bv > 0:
                        divisor = bv

        elif metric in ("pb_ratio", "pb"):
            pb = f.get("priceToBook")
            if pb is not None and float(pb) > 0:
                current_multiple = float(pb)
                bv = (current_price / current_multiple) if current_multiple > 0 else None
                if bv and bv > 0:
                    divisor = bv

        if current_multiple is None:
            # If no multiple exists at all, derive percentile from price directly
            current_multiple = current_price
            divisor = 1.0

        if divisor and divisor > 0:
            hist_multiples = [p / divisor for p in prices]
        else:
            hist_multiples = prices

        # Calculate percentile: proportion of historical multiples strictly below current multiple
        count_below = sum(1 for m in hist_multiples if m < current_multiple)
        count_equal = sum(1 for m in hist_multiples if m == current_multiple)
        # Mid-point percentile ranking
        percentile = ((count_below + 0.5 * count_equal) / len(hist_multiples)) * 100.0
        res = round(percentile, 1)
        with self._lock:
            self._hist_cache[cache_key] = (res, now)
        return res

    def compute_sector_relative(
        self,
        ticker: str,
        metric: str = "pe_ratio",
        repo=None
    ) -> Optional[float]:
        """
        Hissenin aynı sektördeki diğer hisselerin medyan çarpanına oranını hesaplar.
        Örnek: Hissenin F/K'sı 6, sektör medyanı 10 ise oran 0.60 döner (sektöre göre %40 ucuz).
        Sektörde 3'ten az hisse varsa None döndürür (fallback tetiklenecek).
        """
        r = repo or self._get_repo()
        clean = ticker.upper().strip()
        self._refresh_sector_cache_if_needed(r)

        comp_info = r.get_company_info(clean)
        if not comp_info:
            return None

        sector = comp_info.get("sector")
        if not sector or sector not in self._sector_cache:
            return None

        sec_data = self._sector_cache[sector]

        # Extract ticker's multiple
        f_json = comp_info.get("fundamentals_json")
        f = {}
        if f_json:
            try:
                f = json.loads(f_json) if isinstance(f_json, str) else f_json
            except Exception:
                f = {}

        ticker_multiple = None
        list_key = "pe_list" if metric in ("pe_ratio", "pe") else "pb_list"

        if metric in ("pe_ratio", "pe"):
            pe = f.get("trailingPE")
            if pe is None or float(pe) <= 0:
                pe = f.get("forwardPE")
            try:
                if pe is not None and 0 < float(pe) < 300:
                    ticker_multiple = float(pe)
            except (ValueError, TypeError):
                pass
        else:
            pb = f.get("priceToBook")
            try:
                if pb is not None and 0 < float(pb) < 100:
                    ticker_multiple = float(pb)
            except (ValueError, TypeError):
                pass

        if ticker_multiple is None:
            return None

        # Peers in sector (excluding the ticker itself)
        peer_multiples = [
            m for (t, m) in sec_data[list_key]
            if t != clean and m > 0
        ]

        # Sektörde 3'ten az hisse varsa None döndür
        if len(peer_multiples) < 3:
            return None

        sector_median = statistics.median(peer_multiples)
        if sector_median <= 0:
            return None

        relative_ratio = ticker_multiple / sector_median
        return round(relative_ratio, 2)

    def compute_valuation_score(
        self,
        ticker: str,
        metric: str = "pe_ratio",
        repo=None,
        return_details: bool = False
    ) -> Union[float, Dict[str, Any]]:
        """
        İki fonksiyonu %60 (kendi tarihi) / %40 (sektör göreceliği) ağırlığıyla
        birleştirip 0-100 arası tek bir valuation_score üretir.
        - Düşük tarihsel dilim = cazip (örn. percentile=20 -> hist_score=80).
        - Sektör çarpanı medyanın altındaysa (ratio < 1.0) -> sector_score > 50.
        - Sektör göreceliği None dönerse sadece kendi tarihi percentile'a göre hesaplar.
        """
        r = repo or self._get_repo()
        clean = ticker.upper().strip()

        hist_percentile = self.compute_historical_percentile(clean, metric=metric, repo=r)
        sec_relative = self.compute_sector_relative(clean, metric=metric, repo=r)

        # 1. Historical Attractiveness Score (0-100)
        # Low percentile = cheaper = higher score
        if hist_percentile is not None:
            hist_score = 100.0 - hist_percentile
        else:
            hist_score = 50.0  # Neutral fallback

        # 2. Sector Relative Score (0-100)
        if sec_relative is not None:
            if sec_relative <= 1.0:
                # 0.5 ratio -> 100 score, 1.0 ratio -> 50 score
                sec_score = min(100.0, 50.0 + (1.0 - sec_relative) * 100.0)
            else:
                # 1.0 ratio -> 50 score, 2.0 ratio -> 0 score
                sec_score = max(0.0, 50.0 - (sec_relative - 1.0) * 50.0)

            valuation_score = round(0.60 * hist_score + 0.40 * sec_score, 1)
            is_fallback = False
        else:
            # Fallback to 100% historical percentile
            sec_score = None
            valuation_score = round(hist_score, 1)
            is_fallback = True

        valuation_score = max(0.0, min(100.0, valuation_score))

        if return_details:
            comp_info = r.get_company_info(clean) or {}
            sector = comp_info.get("sector")
            return {
                "ticker": clean,
                "valuation_score": valuation_score,
                "historical_percentile": hist_percentile,
                "historical_score": round(hist_score, 1),
                "sector_relative": sec_relative,
                "sector_score": round(sec_score, 1) if sec_score is not None else None,
                "sector": sector,
                "is_fallback": is_fallback,
                "metric": metric
            }

        return valuation_score

    def compute_peer_implied_values(
        self,
        ticker: str,
        price: Optional[float],
        repo=None,
        book_price: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Sektör emsallerinin F/K ve PD/DD dağılımını (çeyreklikler) hissenin kendi
        hisse başı kârı ve defter değerine uygulayarak ima edilen fiyat aralığını üretir.
        Football field grafiği için düşük (%25) / orta (medyan) / yüksek (%75) değer döner.
        Sektörde 3'ten az emsal varsa ilgili yöntem None olur.
        """
        r = repo or self._get_repo()
        clean = ticker.upper().strip()
        self._refresh_sector_cache_if_needed(r)

        comp_info = r.get_company_info(clean) or {}
        sector = comp_info.get("sector")
        f_json = comp_info.get("fundamentals_json")
        f = {}
        if f_json:
            try:
                f = json.loads(f_json) if isinstance(f_json, str) else f_json
            except Exception:
                f = {}

        def _num(v) -> Optional[float]:
            try:
                return float(v) if v is not None else None
            except (ValueError, TypeError):
                return None

        def _quartiles(values: List[float]) -> Optional[Tuple[float, float, float]]:
            if len(values) < 3:
                return None
            q = statistics.quantiles(sorted(values), n=4, method="inclusive")
            return q[0], q[1], q[2]

        # Prefer the narrower industry group (e.g. "Banks - Regional") when it has enough peers.
        industry = f.get("industry")
        ind_data = self._industry_cache.get(industry) if industry else None
        sec_data = self._sector_cache.get(sector) if sector else None

        def _peers(group, key):
            return [m for (t, m) in group[key] if t != clean] if group else []

        use_industry = ind_data is not None and len(_peers(ind_data, "pe_list")) >= 5
        group = ind_data if use_industry else sec_data
        peers_pe = _peers(group, "pe_list")
        peers_pb = _peers(group, "pb_list")

        result: Dict[str, Any] = {
            "ticker": clean,
            "sector": sector,
            "industry": industry,
            "peer_group": "industry" if use_industry else "sector",
            "peer_group_name": industry if use_industry else sector,
            "peer_count": len(group["tickers"]) - 1 if group else 0,
            "pe": None,
            "pb": None,
        }

        eps = _num(f.get("trailingEps"))
        pe_now = _num(f.get("trailingPE"))
        q_pe = _quartiles(peers_pe)
        if q_pe and eps and eps > 0:
            result["pe"] = {
                "current_multiple": round(pe_now, 2) if pe_now and pe_now > 0 else None,
                "sector_p25": round(q_pe[0], 2),
                "sector_median": round(q_pe[1], 2),
                "sector_p75": round(q_pe[2], 2),
                "per_share": round(eps, 4),
                "low": round(q_pe[0] * eps, 2),
                "mid": round(q_pe[1] * eps, 2),
                "high": round(q_pe[2] * eps, 2),
                "peers_used": len(peers_pe),
            }

        # Book value per share is not stored; derive it from the P/B multiple and the price it was
        # computed at (close on the fundamentals date), falling back to the current price.
        pb_now = _num(f.get("priceToBook"))
        q_pb = _quartiles(peers_pb)
        pb_base = book_price if book_price and book_price > 0 else price
        if q_pb and pb_now and pb_now > 0 and pb_base and pb_base > 0:
            bvps = pb_base / pb_now
            result["pb"] = {
                "current_multiple": round(pb_now, 2),
                "sector_p25": round(q_pb[0], 2),
                "sector_median": round(q_pb[1], 2),
                "sector_p75": round(q_pb[2], 2),
                "per_share": round(bvps, 4),
                "low": round(q_pb[0] * bvps, 2),
                "mid": round(q_pb[1] * bvps, 2),
                "high": round(q_pb[2] * bvps, 2),
                "peers_used": len(peers_pb),
            }

        return result

    def compute_sector_relative_roe(
        self,
        ticker: str,
        repo=None
    ) -> Optional[Dict[str, Any]]:
        """
        ROE'yi sektör medyanına göre göreceli hale getirir.
        Return:
            {
                "ticker": str,
                "roe": float,
                "sector": str,
                "sector_median_roe": Optional[float],
                "excess_roe": Optional[float],
                "roe_score": float,  # -4.0 to +4.0
                "is_fallback": bool
            }
        """
        r = repo or self._get_repo()
        clean = ticker.upper().strip()
        self._refresh_sector_cache_if_needed(r)

        comp_info = r.get_company_info(clean)
        if not comp_info:
            return None

        sector = comp_info.get("sector")
        f_json = comp_info.get("fundamentals_json")
        f = {}
        if f_json:
            try:
                f = json.loads(f_json) if isinstance(f_json, str) else f_json
            except Exception:
                f = {}

        roe_val = f.get("returnOnEquity")
        if roe_val is None:
            return None

        try:
            roe = float(roe_val)
        except (ValueError, TypeError):
            return None

        # Check sector peers
        if not sector or sector not in self._sector_cache:
            peer_roes = []
        else:
            peer_roes = [
                r_val for (t, r_val) in self._sector_cache[sector]["roe_list"]
                if t != clean
            ]

        if len(peer_roes) < 3:
            # Fallback to absolute ROE interpolation
            if roe >= 0.35:
                roe_pts = 4.0
            elif roe >= 0.20:
                roe_pts = 2.5 + ((roe - 0.20) / 0.15) * 1.5
            elif roe >= 0.10:
                roe_pts = 1.0 + ((roe - 0.10) / 0.10) * 1.5
            elif roe >= 0.0:
                roe_pts = (roe / 0.10) * 1.0
            elif roe >= -0.15:
                roe_pts = max(-4.0, (roe / 0.15) * 4.0)
            else:
                roe_pts = -4.0

            return {
                "ticker": clean,
                "roe": round(roe, 4),
                "sector": sector,
                "sector_median_roe": None,
                "excess_roe": None,
                "roe_score": round(roe_pts, 2),
                "is_fallback": True
            }

        sector_median_roe = statistics.median(peer_roes)
        excess_roe = roe - sector_median_roe

        # 50% absolute ROE + 50% relative ROE (excess over sector median)
        # Absolute part: [-4.0, +4.0]
        if roe >= 0.35:
            abs_pts = 4.0
        elif roe >= 0.20:
            abs_pts = 2.5 + ((roe - 0.20) / 0.15) * 1.5
        elif roe >= 0.10:
            abs_pts = 1.0 + ((roe - 0.10) / 0.10) * 1.5
        elif roe >= 0.0:
            abs_pts = (roe / 0.10) * 1.0
        elif roe >= -0.15:
            abs_pts = max(-4.0, (roe / 0.15) * 4.0)
        else:
            abs_pts = -4.0

        # Relative part: [-4.0, +4.0] based on excess ROE
        # +15% excess ROE -> +4.0 pts, 0 excess -> 0.0 pts, -15% excess -> -4.0 pts
        if excess_roe >= 0.15:
            rel_pts = 4.0
        elif excess_roe >= 0.0:
            rel_pts = (excess_roe / 0.15) * 4.0
        elif excess_roe >= -0.15:
            rel_pts = (excess_roe / 0.15) * 4.0
        else:
            rel_pts = -4.0

        combined_roe_score = round(0.50 * abs_pts + 0.50 * rel_pts, 2)

        return {
            "ticker": clean,
            "roe": round(roe, 4),
            "sector": sector,
            "sector_median_roe": round(sector_median_roe, 4),
            "excess_roe": round(excess_roe, 4),
            "roe_score": combined_roe_score,
            "is_fallback": False
        }


# Singleton service instance
_valuation_service = ValuationService()

# Module-level convenience functions matching user prompt
def compute_historical_percentile(ticker: str, metric: str = "pe_ratio", lookback_years: int = 3, repo=None) -> Optional[float]:
    return _valuation_service.compute_historical_percentile(ticker, metric=metric, lookback_years=lookback_years, repo=repo)

def compute_sector_relative(ticker: str, metric: str = "pe_ratio", repo=None) -> Optional[float]:
    return _valuation_service.compute_sector_relative(ticker, metric=metric, repo=repo)

def compute_valuation_score(ticker: str, metric: str = "pe_ratio", repo=None, return_details: bool = False) -> Union[float, Dict[str, Any]]:
    return _valuation_service.compute_valuation_score(ticker, metric=metric, repo=repo, return_details=return_details)

def compute_sector_relative_roe(ticker: str, repo=None) -> Optional[Dict[str, Any]]:
    return _valuation_service.compute_sector_relative_roe(ticker, repo=repo)

def compute_peer_implied_values(ticker: str, price: Optional[float], repo=None, book_price: Optional[float] = None) -> Dict[str, Any]:
    return _valuation_service.compute_peer_implied_values(ticker, price, repo=repo, book_price=book_price)
