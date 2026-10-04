"""
Market Regime Service (services/market_regime_service.py)
Determines market regime by combining BIST market breadth (advancers vs decliners)
with XU100 Index technical position relative to its 50 and 200-day moving averages (MA50, MA200).

3-Tier Regime Definition:
- RISK_ON:  Breadth is advancing (up > down) AND XU100 Close > MA200
- RISK_OFF: Breadth is declining (down > up) AND XU100 Close < MA200
- NEUTRAL:  All other market conditions (mixed signals, choppy / transitional market)

Provides:
- get_current_regime(): Returns current regime status, metadata, exposure multiplier, and thresholds
- compute_regime_for_date(): Historical regime calculation for backtesting
"""

import os
import sqlite3
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime


def _get_default_db_path() -> str:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, "scraped_reports.db")


class MarketRegimeService:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or _get_default_db_path()
        self._cached_regime: Optional[Dict[str, Any]] = None
        self._cache_timestamp: float = 0.0
        self._cache_ttl: float = 60.0  # 60 seconds TTL

    def calculate_breadth_from_prices(
        self,
        prices: Dict[str, Any],
        up_threshold: float = 0.05,
        down_threshold: float = -0.05
    ) -> Dict[str, Any]:
        """
        Calculates breadth metrics (advancers, decliners, flat) from a live prices dictionary.
        Does NOT touch or alter the original breadth calculation logic.
        """
        up = 0
        down = 0
        flat = 0
        total = 0

        for t, data in prices.items():
            if t in ("XU100", "XU100.IS", "XU030"):
                continue
            if not isinstance(data, dict):
                continue
            c = data.get("change_pct")
            if c is not None:
                try:
                    c_float = float(c)
                except (ValueError, TypeError):
                    continue
                total += 1
                if c_float > up_threshold:
                    up += 1
                elif c_float < down_threshold:
                    down += 1
                else:
                    flat += 1

        up_ratio = (up / total) if total > 0 else 0.5
        down_ratio = (down / total) if total > 0 else 0.5

        is_advancing = up > down
        is_declining = down > up
        is_balanced = up == down

        bias = "ADVANCING" if is_advancing else ("DECLINING" if is_declining else "BALANCED")

        return {
            "up": up,
            "down": down,
            "flat": flat,
            "total": total,
            "up_ratio": round(up_ratio, 4),
            "down_ratio": round(down_ratio, 4),
            "up_ratio_pct": round(up_ratio * 100, 1),
            "down_ratio_pct": round(down_ratio * 100, 1),
            "bias": bias,
            "is_advancing": is_advancing,
            "is_declining": is_declining,
            "is_balanced": is_balanced
        }

    def get_index_metrics(
        self,
        as_of_date: Optional[str] = None,
        ticker: str = "XU100"
    ) -> Dict[str, Any]:
        """
        Fetches historical prices for XU100 index and calculates Close, MA50, and MA200.
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()

        if as_of_date:
            c.execute("""
                SELECT date, close
                FROM historical_prices
                WHERE ticker = ? AND date <= ?
                ORDER BY date ASC
            """, (ticker, as_of_date))
        else:
            c.execute("""
                SELECT date, close
                FROM historical_prices
                WHERE ticker = ?
                ORDER BY date ASC
            """, (ticker,))

        rows = c.fetchall()
        conn.close()

        if not rows:
            # Fallback if ticker not found
            return {
                "ticker": ticker,
                "date": as_of_date or datetime.now().strftime("%Y-%m-%d"),
                "close": 0.0,
                "ma50": 0.0,
                "ma200": 0.0,
                "above_ma50": True,
                "above_ma200": True,
                "is_available": False
            }

        dates = [r[0] for r in rows]
        closes = [float(r[1]) for r in rows]
        last_date = dates[-1]
        last_close = closes[-1]

        # Calculate MA50
        if len(closes) >= 50:
            ma50 = sum(closes[-50:]) / 50.0
        else:
            ma50 = sum(closes) / len(closes)

        # Calculate MA200
        if len(closes) >= 200:
            ma200 = sum(closes[-200:]) / 200.0
        else:
            ma200 = sum(closes) / len(closes)

        above_ma50 = last_close > ma50
        above_ma200 = last_close > ma200
        pct_diff_ma200 = ((last_close - ma200) / ma200 * 100) if ma200 > 0 else 0.0

        return {
            "ticker": ticker,
            "date": last_date,
            "close": round(last_close, 2),
            "ma50": round(ma50, 2),
            "ma200": round(ma200, 2),
            "above_ma50": above_ma50,
            "above_ma200": above_ma200,
            "pct_diff_ma200": round(pct_diff_ma200, 2),
            "is_available": True
        }

    def determine_regime_label(
        self,
        is_breadth_advancing: bool,
        is_breadth_declining: bool,
        above_ma200: bool
    ) -> str:
        """
        Pure rule-based regime assignment:
        - RISK_ON:  breadth yükselen ağırlıklı VE endeks MA200 üzerinde
        - RISK_OFF: breadth düşen ağırlıklı VE endeks MA200 altında
        - NEUTRAL:  diğer tüm durumlar
        """
        if is_breadth_advancing and above_ma200:
            return "RISK_ON"
        elif is_breadth_declining and not above_ma200:
            return "RISK_OFF"
        else:
            return "NEUTRAL"

    def get_current_regime(
        self,
        all_prices: Optional[Dict[str, Any]] = None,
        as_of_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluates and returns current market regime, exposure multipliers, and thresholds.
        """
        # If all_prices not provided, attempt to pull from price_service or latest DB prices
        if all_prices is None:
            all_prices = self._fetch_latest_prices_from_db(as_of_date)

        breadth = self.calculate_breadth_from_prices(all_prices)
        index_data = self.get_index_metrics(as_of_date=as_of_date, ticker="XU100")

        regime = self.determine_regime_label(
            is_breadth_advancing=breadth["is_advancing"],
            is_breadth_declining=breadth["is_declining"],
            above_ma200=index_data["above_ma200"]
        )

        # Multipliers & Threshold adjustments
        if regime == "RISK_OFF":
            exposure_multiplier = 0.5
            strong_buy_threshold = 83  # 75 + 8 points shift
            color = "#C0524E"
            badge_title = "AYI / DEFANSİF PİYASA"
            description = (
                f"Piyasa zayıf (Düşen: {breadth['down']}, Yükselen: {breadth['up']}) "
                f"ve XU100 ({index_data['close']} TL) 200 günlük ortalamanın ({index_data['ma200']} TL) altında. "
                "Riskten kaçış modu aktif; nakit tamponunu koruyun (Pozisyon tavanı: %50)."
            )
        elif regime == "RISK_ON":
            exposure_multiplier = 1.0
            strong_buy_threshold = 75  # Standard threshold
            color = "#3F8A6B"
            badge_title = "BOĞA / POZİTİF PİYASA"
            description = (
                f"Piyasa alıcılı (Yükselen: {breadth['up']}, Düşen: {breadth['down']}) "
                f"ve XU100 ({index_data['close']} TL) 200 günlük ortalamanın ({index_data['ma200']} TL) üzerinde. "
                "Risk iştahı yüksek; alım fırsatları tam ağırlıkla değerlendirilebilir."
            )
        else:  # NEUTRAL
            exposure_multiplier = 1.0
            strong_buy_threshold = 75  # Standard threshold
            color = "#C9883A"
            badge_title = "YATAY / SEÇİCİ PİYASA"
            description = (
                f"Kararsız piyasa görünümü (Yükselen: {breadth['up']}, Düşen: {breadth['down']}). "
                f"XU100: {index_data['close']} TL (MA200: {index_data['ma200']} TL). "
                "Endeks yönünden ziyade hisse bazlı değerlemelere ve güçlü bilançolara odaklanın."
            )

        return {
            "regime": regime,
            "status": regime,
            "exposure_multiplier": exposure_multiplier,
            "strong_buy_threshold": strong_buy_threshold,
            "color": color,
            "badge": regime,
            "badge_title": badge_title,
            "description": description,
            "breadth": breadth,
            "index": index_data,
            "as_of_date": as_of_date or index_data.get("date"),
            "timestamp": datetime.now().isoformat()
        }

    def _fetch_latest_prices_from_db(self, as_of_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetches price changes from DB if live prices dictionary is not available.
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()

        if as_of_date:
            target_date = as_of_date
        else:
            c.execute("SELECT MAX(date) FROM historical_prices WHERE ticker != 'XU100'")
            row = c.fetchone()
            target_date = row[0] if row and row[0] else None

        if not target_date:
            conn.close()
            return {}

        # Get previous trading date
        c.execute("""
            SELECT DISTINCT date FROM historical_prices
            WHERE date < ? AND ticker != 'XU100'
            ORDER BY date DESC LIMIT 1
        """, (target_date,))
        prev_row = c.fetchone()
        prev_date = prev_row[0] if prev_row else None

        if not prev_date:
            conn.close()
            return {}

        c.execute("""
            SELECT h1.ticker, h1.close, h2.close as prev_close, h1.volume
            FROM historical_prices h1
            JOIN historical_prices h2 ON h1.ticker = h2.ticker
            WHERE h1.date = ? AND h2.date = ? AND h1.ticker != 'XU100'
        """, (target_date, prev_date))
        rows = c.fetchall()
        conn.close()

        prices = {}
        for t, cl, prev_cl, vol in rows:
            if prev_cl and prev_cl > 0:
                pct = ((cl - prev_cl) / prev_cl) * 100.0
            else:
                pct = 0.0
            prices[t] = {
                "price": cl,
                "change_pct": round(pct, 2),
                "volume": vol or 0
            }
        return prices


# Global singleton instance
market_regime_service = MarketRegimeService()


def get_current_regime(
    all_prices: Optional[Dict[str, Any]] = None,
    as_of_date: Optional[str] = None
) -> Dict[str, Any]:
    """Helper wrapper for current regime lookup."""
    return market_regime_service.get_current_regime(all_prices=all_prices, as_of_date=as_of_date)
