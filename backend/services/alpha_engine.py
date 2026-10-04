import datetime
import json
import os
import logging
import threading
import time
from typing import List, Dict, Any
from globals import report_repo, price_service
from services.ticker_resolver import parse_rating

logger = logging.getLogger(__name__)

# Load company names once
try:
    names_path = os.path.join(os.path.dirname(__file__), '..', 'company_names.json')
    with open(names_path, 'r', encoding='utf-8') as f:
        COMPANY_NAMES = json.load(f)
except Exception:
    COMPANY_NAMES = {}

class AlphaEngine:
    """
    AI Alpha Insights Engine
    Synthesizes Technical, Fundamental, and Sentiment (Broker Reports) into a unified Alpha Score (0-100).
    Also runs simplified historical backtests to validate the score's predictive power.
    """
    def __init__(self):
        self.weights = {
            "technical": 0.30,
            "fundamental": 0.30,
            "sentiment": 0.40
        }
        self._cached_screener = []
        self._last_updated = None
        
        # Start background refresh thread
        self._thread = threading.Thread(target=self._background_refresh, daemon=True)
        self._thread.start()

    def _background_refresh(self):
        """Periodically refresh the screener data in the background."""
        while True:
            try:
                logger.info("AlphaEngine: Starting background calculation for screener...")
                self._cached_screener = self._generate_screener()
                self._last_updated = datetime.datetime.now()
                logger.info("AlphaEngine: Background calculation finished.")
            except Exception as e:
                logger.error(f"AlphaEngine: Error in background refresh: {e}")
            time.sleep(900)  # Refresh every 15 minutes, in step with the live price refresh

    @staticmethod
    def _calculate_sma(prices: List[float], period: int = 20) -> float:
        if len(prices) < period:
            return None
        return sum(prices[-period:]) / period

    @staticmethod
    def _calculate_rsi(prices: List[float], period: int = 14) -> float:
        if len(prices) <= period:
            return None
        gains = []
        losses = []
        for i in range(1, len(prices)):
            change = prices[i] - prices[i-1]
            if change > 0:
                gains.append(change)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(change))
                
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        
        if avg_loss == 0:
            return 100.0
            
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            
        if avg_loss == 0:
            return 100.0
            
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _calculate_ta_score(self, ta_data: Dict) -> float:
        """Calculate TA Score (0-100) using continuous linear interpolation calibrated to TradingView recommendation bands."""
        if not ta_data or "summary" not in ta_data:
            return 50.0
        
        summary = ta_data["summary"]
        rec = summary.get("RECOMMENDATION", "NEUTRAL")
        rec_score = summary.get("RECOMMENDATION_SCORE")
        if rec_score is not None:
            try:
                r = float(rec_score)
                # Calibrated piecewise continuous mapping:
                # STRONG_BUY band: r in [0.5, 1.0] -> 85.0 to 100.0 (center 0.75 -> 95.0, top -> 100.0)
                # BUY band: r in [0.1, 0.5) -> 70.0 to 80.0 (center 0.3 -> 75.0)
                # NEUTRAL band: r in (-0.1, 0.1) -> 45.0 to 55.0 (center 0.0 -> 50.0)
                # SELL band: r in (-0.5, -0.1] -> 20.0 to 30.0 (center -0.3 -> 25.0)
                # STRONG_SELL band: r in [-1.0, -0.5] -> 0.0 to 10.0 (center -0.75 -> 5.0)
                if rec == "STRONG_BUY" or r >= 0.5:
                    return min(100.0, max(85.0, 85.0 + ((r - 0.5) / 0.5) * 15.0))
                elif rec == "BUY" or (0.1 <= r < 0.5):
                    return min(85.0, max(65.0, 70.0 + ((r - 0.1) / 0.4) * 10.0))
                elif rec == "NEUTRAL" or (-0.1 < r < 0.1):
                    return min(55.0, max(45.0, 50.0 + (r / 0.1) * 5.0))
                elif rec == "SELL" or (-0.5 < r <= -0.1):
                    return min(35.0, max(15.0, 20.0 + ((r + 0.5) / 0.4) * 10.0))
                else:  # STRONG_SELL or r <= -0.5
                    return min(15.0, max(0.0, ((r + 1.0) / 0.5) * 10.0))
            except (ValueError, TypeError):
                pass

        score_map = {
            "STRONG_BUY": 100.0,
            "BUY": 75.0,
            "NEUTRAL": 50.0,
            "SELL": 25.0,
            "STRONG_SELL": 0.0
        }
        return score_map.get(rec, 50.0)

    def _calculate_fa_score(self, fa_data: Dict) -> float:
        """Calculate Fundamental Analysis Score (0-100) using continuous linear interpolation for PE, PB, and ROE."""
        if not fa_data:
            return 50.0
            
        score = 50.0
        
        def safe_float(val):
            try:
                return float(val) if val is not None else None
            except (ValueError, TypeError):
                return None

        # F/K (P/E) scoring: continuous linear interpolation through legacy breakpoints
        # Breakpoints: <= 7 -> +20, 10 -> +10, 20 -> 0.0, 30 -> -15.0
        pe = safe_float(fa_data.get("trailingPE"))
        if pe is not None and pe > 0:
            if pe <= 7.0:
                score += 20.0
            elif pe <= 10.0:
                score += 20.0 - ((pe - 7.0) / 3.0) * 10.0  # +20.0 down to +10.0
            elif pe <= 20.0:
                score += 10.0 - ((pe - 10.0) / 10.0) * 10.0  # +10.0 down to 0.0
            elif pe <= 30.0:
                score += 0.0 - ((pe - 20.0) / 10.0) * 15.0  # 0.0 down to -15.0
            else:
                score -= 15.0
            
        # PD/DD (P/B) scoring: continuous linear interpolation through legacy breakpoints
        # Breakpoints: <= 1.5 -> +15.0, 2.0 -> 0.0, 5.0 -> -10.0
        pb = safe_float(fa_data.get("priceToBook"))
        if pb is not None and pb > 0:
            if pb <= 1.5:
                score += 15.0
            elif pb <= 2.0:
                score += 15.0 - ((pb - 1.5) / 0.5) * 15.0  # +15.0 down to 0.0
            elif pb <= 5.0:
                score += 0.0 - ((pb - 2.0) / 3.0) * 10.0  # 0.0 down to -10.0
            else:
                score -= 10.0
            
        # ROE scoring: continuous linear interpolation through legacy breakpoints
        # Breakpoints: >= 0.30 -> +15.0, 0.15 -> +10.0, 0.0 -> 0.0, -0.10 -> -20.0
        roe = safe_float(fa_data.get("returnOnEquity"))
        if roe is not None:
            if roe >= 0.30:
                score += 15.0
            elif roe >= 0.15:
                score += 10.0 + ((roe - 0.15) / 0.15) * 5.0  # +10.0 to +15.0
            elif roe >= 0.0:
                score += (roe / 0.15) * 10.0  # 0.0 to +10.0
            elif roe >= -0.10:
                score += max(-20.0, (roe / 0.10) * 20.0)  # 0.0 down to -20.0
            else:
                score -= 20.0
            
        return max(0.0, min(100.0, score))

    def _calculate_sentiment_score(self, ticker: str, reports: List[Dict]) -> float:
        """Calculate Sentiment Score based on Scraped Broker Reports with continuous interpolation matching legacy breakpoints."""
        if not reports:
            return 50.0
            
        score = 50.0
        total_potential = 0.0
        pot_count = 0
        buy_count = 0
        
        for r in reports:
            try:
                pot = float(r.get("potansiyel") or 0)
                if pot > 0:
                    total_potential += pot
                    pot_count += 1
            except (ValueError, TypeError):
                pass
            if parse_rating(str(r.get("rating", ""))) == "AL":
                buy_count += 1
                
        avg_pot = (total_potential / pot_count) if pot_count > 0 else 0.0
        
        # Reward high average upside potential with continuous linear interpolation
        # Legacy breakpoints: avg_pot > 40 -> +30, avg_pot > 20 -> +15, 0 -> 0
        if avg_pot > 0:
            if avg_pot <= 20.0:
                score += (avg_pot / 20.0) * 15.0  # 0 to +15.0 (at 20 -> 15.0)
            elif avg_pot <= 40.0:
                score += 15.0 + ((avg_pot - 20.0) / 20.0) * 15.0  # +15.0 to +30.0 (at 40 -> 30.0)
            else:
                score += 30.0
            
        # Reward consensus buys with continuous linear interpolation
        # Legacy breakpoints: buy_ratio > 0.7 -> +20, buy_ratio < 0.3 -> -20, neutral 0.5 -> 0
        if len(reports) > 0:
            buy_ratio = buy_count / len(reports)
            if buy_ratio >= 0.7:
                score += 20.0
            elif buy_ratio >= 0.5:
                score += ((buy_ratio - 0.5) / 0.2) * 20.0  # 0.0 to +20.0
            elif buy_ratio >= 0.3:
                score += ((buy_ratio - 0.5) / 0.2) * 20.0  # -20.0 to 0.0
            else:
                score -= 20.0
                
        return max(0.0, min(100.0, score))

    def get_alpha_screener(self) -> List[Dict[str, Any]]:
        """Returns the cached Alpha Score for all companies instantly."""
        if not self._cached_screener:
            logger.info("AlphaEngine: Cache empty, waiting for background thread to finish...")
            # Wait for background thread to populate cache instead of running it synchronously
            # to avoid duplicate heavy DB queries.
            deadline = time.time() + 90  # never block a request forever
            while not self._cached_screener and time.time() < deadline:
                time.sleep(0.5)
        return self._cached_screener

    def _generate_screener(self) -> List[Dict[str, Any]]:
        """Generates the Alpha Score for all companies (CPU intensive)."""
        companies = report_repo.get_all_company_info()
        
        # If the database is completely empty (fundamentals not scraped yet), 
        # fallback to evaluating technicals for all active tickers
        if not companies:
            for ticker in price_service.bist_tickers:
                companies[ticker] = {}

        # Fetch all reports once and group by ticker to avoid N individual DB queries
        all_reports = report_repo.get_reports(limit=10000) or []
        reports_by_ticker = {}
        for r in all_reports:
            t = str(r.get("ticker") or "").upper().strip()
            if t:
                if t not in reports_by_ticker:
                    reports_by_ticker[t] = []
                reports_by_ticker[t].append(r)

        results = []
        
        for ticker, data in companies.items():
            raw_reports = reports_by_ticker.get(ticker, [])
            
            ta_score = self._calculate_ta_score(data.get("technical_analysis", {}))
            fa_score = self._calculate_fa_score(data.get("fundamentals", {}))
            sent_score = self._calculate_sentiment_score(ticker, raw_reports)
            
            alpha_score = (
                ta_score * self.weights["technical"] +
                fa_score * self.weights["fundamental"] +
                sent_score * self.weights["sentiment"]
            )
            
            spot = price_service.get_price(ticker)
            price = spot.get("price", 0.0) if isinstance(spot, dict) else 0.0
            
            signal = "NÖTR"
            if alpha_score >= 80: signal = "GÜÇLÜ AL"
            elif alpha_score >= 65: signal = "AL"
            elif alpha_score <= 35: signal = "SAT"
            elif alpha_score <= 20: signal = "GÜÇLÜ SAT"

            results.append({
                "ticker": ticker,
                "company_name": COMPANY_NAMES.get(ticker, ticker),
                "sector": data.get("sector", "Bilinmiyor"),
                "price": price,
                "ta_score": round(ta_score, 1),
                "fa_score": round(fa_score, 1),
                "sentiment_score": round(sent_score, 1),
                "alpha_score": round(alpha_score, 1),
                "signal": signal,
                "broker_reports": raw_reports
            })
            
            # Yield GIL to prevent blocking FastAPI requests
            time.sleep(0.001)
            
        # Sort by best alpha score
        results.sort(key=lambda x: x["alpha_score"], reverse=True)

        # Asynchronously save alpha scores to score_history table without blocking caller
        def _async_save_alpha_history():
            try:
                today_str = datetime.date.today().isoformat()
                now_str = datetime.datetime.now().isoformat()
                history_records = []
                for r in results:
                    history_records.append({
                        "ticker": r["ticker"],
                        "snapshot_date": today_str,
                        "conviction_score": None,
                        "alpha_score": r.get("alpha_score"),
                        "technical_component": r.get("ta_score"),
                        "fundamental_component": r.get("fa_score"),
                        "sentiment_component": r.get("sentiment_score"),
                        "consensus_component": None,
                        "revision_momentum": None,
                        "price_momentum_percentile": None,
                        "created_at": now_str
                    })
                report_repo.upsert_score_history(history_records)
                logger.info(f"AlphaEngine: Persisted {len(history_records)} score history snapshots.")
            except Exception as e:
                logger.error(f"AlphaEngine: Error persisting score history: {e}")

        threading.Thread(target=_async_save_alpha_history, daemon=True).start()

        return results

    def run_historical_backtest(self, days_ago: int = 30, metric: str = "ALPHA", condition: str = "GREATER", threshold: float = 70.0, tickers: str = None) -> Dict[str, Any]:
        """
        Runs a mock backtest for various metrics.
        metrics: ALPHA, RSI, SMA, POTENTIAL
        condition: GREATER, LESS
        """
        companies = report_repo.get_all_company_info()
        
        if not companies:
            for t in price_service.bist_tickers:
                companies[t] = {}
                
        target_tickers = list(companies.keys())
        if tickers:
            selected = [t.strip().upper() for t in tickers.split(",") if t.strip()]
            if selected:
                target_tickers = [t for t in target_tickers if t in selected]
        
        import datetime
        target_date = (datetime.date.today() - datetime.timedelta(days=days_ago)).isoformat()
        
        trades = []
        total_return = 0
        winners = 0
        losers = 0
        
        for ticker in target_tickers:
            history = report_repo.get_historical_prices(ticker)
            if not history: continue
            
            # Find prices up to target_date
            past_prices = []
            for p in history:
                d_str = p['date'].split(' ')[0]
                if d_str <= target_date:
                    past_prices.append(p['close'])
                    
            if not past_prices: continue
            
            past_price = past_prices[-1]
            
            # Find current price
            current_price = history[-1]['close']
            
            reports = report_repo.get_reports(ticker=ticker)
            hist_reports = [r for r in reports if str(r.get("report_date", "")) <= target_date]
            
            avg_pot = 0
            if hist_reports:
                pots = [float(r.get("potansiyel") or 0) for r in hist_reports if r.get("potansiyel")]
                if pots:
                    avg_pot = sum(pots)/len(pots)
            
            hist_alpha = 50 + (avg_pot / 2)
            hist_alpha = max(0, min(100, hist_alpha))
            
            metric_val = None
            if metric == "ALPHA":
                metric_val = hist_alpha
            elif metric == "POTENTIAL":
                metric_val = avg_pot
            elif metric == "RSI":
                metric_val = self._calculate_rsi(past_prices)
            elif metric == "SMA":
                sma = self._calculate_sma(past_prices)
                if sma and sma > 0:
                    metric_val = ((past_price - sma) / sma) * 100
                    
            if metric_val is None:
                continue
                
            is_signal = False
            if condition == "GREATER" and metric_val > threshold:
                is_signal = True
            elif condition == "LESS" and metric_val < threshold:
                is_signal = True
            
            if is_signal:
                ret_pct = ((current_price - past_price) / past_price) * 100
                if ret_pct > 0: winners += 1
                else: losers += 1
                total_return += ret_pct
                
                latest_date = max([str(r.get("report_date", "")) for r in hist_reports]) if hist_reports else "Yok"
                trades.append({
                    "ticker": ticker,
                    "sector": companies.get(ticker, {}).get("sector", "Bilinmiyor"),
                    "buy_date": target_date,
                    "buy_price": past_price,
                    "sell_price": current_price,
                    "return_pct": round(ret_pct, 2),
                    "hist_alpha": round(metric_val, 1),  # using hist_alpha key to pass metric_val to UI
                    "broker_count": len(hist_reports),
                    "avg_potential": round(avg_pot, 1) if avg_pot else 0,
                    "latest_report_date": latest_date
                })
                
        trade_count = winners + losers
        win_rate = (winners / trade_count * 100) if trade_count > 0 else 0
        avg_return = (total_return / trade_count) if trade_count > 0 else 0
        
        return {
            "period_days": days_ago,
            "total_trades": trade_count,
            "win_rate_pct": round(win_rate, 2),
            "avg_return_pct": round(avg_return, 2),
            "trades": sorted(trades, key=lambda x: x["return_pct"], reverse=True)
        }

alpha_engine = AlphaEngine()
