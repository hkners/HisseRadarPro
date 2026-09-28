import os
import pandas as pd
import ta
import numpy as np
import threading
import time
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class TechnicalScanner:
    def __init__(self):
        self._cached_data = []
        self._last_updated = None
        
        # Start background caching thread
        thread = threading.Thread(target=self._background_refresh, daemon=True)
        thread.start()

    def _background_refresh(self):
        """Periodically calculate technical indicators in the background."""
        while True:
            try:
                logger.info("TechnicalScanner: Starting background calculation...")
                self._cached_data = self._generate_technical_signals()
                self._last_updated = datetime.now()
                logger.info("TechnicalScanner: Background calculation finished.")
            except Exception as e:
                logger.error(f"TechnicalScanner: Error in background refresh: {e}")
            time.sleep(300) # Refresh every 5 minutes

    def get_technical_screener_data(self):
        """Returns the cached technical data instantly."""
        if not self._cached_data:
            logger.info("TechnicalScanner: Cache empty, waiting for background thread to finish...")
            # Wait for background thread to populate cache instead of running it synchronously
            while not self._cached_data:
                time.sleep(0.5)
        return self._cached_data

    def _generate_technical_signals(self):
        from globals import report_repo, BIST_TICKERS, base_dir
        
        results = []
        
        company_info = report_repo.get_all_company_info()

        for ticker in BIST_TICKERS:
            try:
                history = report_repo.get_historical_prices(ticker)
                if not history or len(history) < 50:
                    continue
                
                df = pd.DataFrame(history)
                
                # The db returns a list of tuples or dicts
                if isinstance(history[0], tuple) or isinstance(history[0], list):
                    if len(history[0]) >= 5:
                        df = pd.DataFrame(history, columns=["date", "open", "high", "low", "close", "volume"][:len(history[0])])
                
                if 'close' not in df.columns:
                    continue
                    
                df['close'] = pd.to_numeric(df['close'], errors='coerce')
                df = df.dropna(subset=['close'])
                
                if len(df) < 50:
                    continue
                    
                # Calculate Indicators
                close_series = df['close']
                
                sma20_series = ta.trend.sma_indicator(close_series, window=20)
                sma50_series = ta.trend.sma_indicator(close_series, window=50)
                
                sma20 = sma20_series.iloc[-1]
                sma50 = sma50_series.iloc[-1]
                
                if len(df) >= 200:
                    sma200 = ta.trend.sma_indicator(close_series, window=200).iloc[-1]
                else:
                    sma200 = None
                    
                macd_series = ta.trend.macd(close_series)
                macd_signal_series = ta.trend.macd_signal(close_series)
                
                macd = macd_series.iloc[-1]
                macd_signal = macd_signal_series.iloc[-1]
                
                # Calculate days since last AL cross
                macd_diff = np.array(macd_series - macd_signal_series)
                macd_cross_up = (macd_diff[1:] > 0) & (macd_diff[:-1] <= 0)
                macd_true_idx = np.where(macd_cross_up)[0]
                macd_buy_days_ago = int(len(macd_cross_up) - 1 - macd_true_idx[-1]) if len(macd_true_idx) > 0 else None
                
                sma_diff = np.array(sma20_series - sma50_series)
                sma_cross_up = (sma_diff[1:] > 0) & (sma_diff[:-1] <= 0)
                sma_true_idx = np.where(sma_cross_up)[0]
                sma_buy_days_ago = int(len(sma_cross_up) - 1 - sma_true_idx[-1]) if len(sma_true_idx) > 0 else None
                
                rsi = ta.momentum.rsi(close_series, window=14).iloc[-1]
                
                current_price = close_series.iloc[-1]
                
                import json
                
                # Extract TradingView analysis from company info if available
                info = company_info.get(ticker, {})
                ta_raw = info.get("technical_analysis")
                tv_summary_rec = None
                tv_ma_rec = None
                if ta_raw:
                    if isinstance(ta_raw, str):
                        try:
                            ta_raw = json.loads(ta_raw)
                        except Exception:
                            ta_raw = {}
                    if isinstance(ta_raw, dict):
                        tv_summary_rec = (ta_raw.get("summary") or {}).get("RECOMMENDATION")
                        tv_ma_rec = (ta_raw.get("moving_averages") or {}).get("RECOMMENDATION")

                # Trend Filter Analysis
                is_downtrend = False
                is_uptrend = False

                # 1. Price vs Moving Averages Check
                if not pd.isna(current_price) and not pd.isna(sma50):
                    if current_price < sma50 and (pd.isna(sma20) or sma20 < sma50 or current_price < sma20):
                        is_downtrend = True
                    elif current_price >= sma50 and (pd.isna(sma20) or sma20 >= sma50):
                        is_uptrend = True

                # 2. TradingView Trend Confirmation
                if tv_summary_rec in ("SELL", "STRONG_SELL") or tv_ma_rec in ("SELL", "STRONG_SELL"):
                    is_downtrend = True
                    is_uptrend = False
                elif tv_summary_rec in ("BUY", "STRONG_BUY") and not is_downtrend:
                    is_uptrend = True

                trend_state = "DÜŞÜŞ" if is_downtrend else ("YÜKSELİŞ" if is_uptrend else "NÖTR")

                # Determine Signals
                reasons = []
                score = 0
                
                # 1. RSI
                if pd.isna(rsi):
                    rsi_signal = "NÖTR"
                elif rsi < 30:
                    if is_downtrend:
                        # Falling knife: Deep oversold under heavy selling pressure is NOT a trend buy!
                        rsi_signal = "AŞIRI SATIM"
                        reasons.append(f"Aşırı satım (RSI: {rsi:.1f}) - Düşüş Trendi")
                        # Do not add +1 score to prevent promoting falling knives to AL
                    else:
                        rsi_signal = "AL"
                        score += 1
                        reasons.append(f"Aşırı satım bölgesi (RSI: {rsi:.1f})")
                elif rsi > 70:
                    rsi_signal = "SAT"
                    score -= 1
                    reasons.append(f"Aşırı alım bölgesi (RSI: {rsi:.1f})")
                else:
                    rsi_signal = "NÖTR"
                    
                # 2. MACD
                if pd.isna(macd) or pd.isna(macd_signal):
                    macd_state = "NÖTR"
                elif macd > macd_signal:
                    macd_state = "AL"
                    score += 1
                    if macd_buy_days_ago == 0:
                        reasons.append("MACD yukarı kesti (Golden Cross)")
                    elif macd_buy_days_ago is not None and macd_buy_days_ago <= 3:
                        reasons.append(f"MACD taze al ({macd_buy_days_ago}g önce)")
                    elif not is_downtrend:
                        reasons.append("MACD pozitif bölgede")
                else:
                    macd_state = "SAT"
                    score -= 1
                    if df['close'].iloc[-2] and not pd.isna(ta.trend.macd(close_series).iloc[-2]):
                        prev_macd = ta.trend.macd(close_series).iloc[-2]
                        prev_sig = ta.trend.macd_signal(close_series).iloc[-2]
                        if prev_macd >= prev_sig:
                            reasons.append("MACD aşağı kesti (Death Cross)")
                            
                # 3. SMA 20/50
                if pd.isna(sma20) or pd.isna(sma50):
                    sma_state = "NÖTR"
                elif sma20 > sma50:
                    sma_state = "AL"
                    score += 1
                    if sma_buy_days_ago == 0:
                        reasons.append("SMA20, SMA50'yi yukarı kesti")
                    elif sma_buy_days_ago is not None and sma_buy_days_ago <= 3:
                        reasons.append(f"SMA20>50 Golden Cross ({sma_buy_days_ago}g önce)")
                    else:
                        reasons.append("SMA trendi pozitif (SMA20>50)")
                else:
                    sma_state = "SAT"
                    score -= 1
                    if df['close'].iloc[-2] and not pd.isna(ta.trend.sma_indicator(close_series, window=20).iloc[-2]):
                        prev_sma20 = ta.trend.sma_indicator(close_series, window=20).iloc[-2]
                        prev_sma50 = ta.trend.sma_indicator(close_series, window=50).iloc[-2]
                        if prev_sma20 >= prev_sma50:
                            reasons.append("SMA20, SMA50'yi aşağı kesti")
                            
                # Overall Decision with Trend Filter Protection
                if is_downtrend:
                    # A stock in confirmed downtrend can never be AL or GÜÇLÜ AL
                    if score <= -1 or tv_summary_rec in ("SELL", "STRONG_SELL"):
                        overall = "GÜÇLÜ SAT" if score <= -2 else "SAT"
                    else:
                        overall = "NÖTR"
                else:
                    if score >= 2:
                        overall = "GÜÇLÜ AL"
                    elif score == 1:
                        overall = "AL"
                    elif score == 0:
                        overall = "NÖTR"
                    elif score == -1:
                        overall = "SAT"
                    else:
                        overall = "GÜÇLÜ SAT"
                    
                results.append({
                    "ticker": ticker,
                    "company": info.get("name", ticker),
                    "current_price": float(current_price) if not pd.isna(current_price) else None,
                    "sma20": float(sma20) if not pd.isna(sma20) else None,
                    "sma50": float(sma50) if not pd.isna(sma50) else None,
                    "sma200": float(sma200) if sma200 is not None and not pd.isna(sma200) else None,
                    "macd": float(macd) if not pd.isna(macd) else None,
                    "macd_signal": float(macd_signal) if not pd.isna(macd_signal) else None,
                    "rsi": float(rsi) if not pd.isna(rsi) else None,
                    "macd_state": macd_state,
                    "rsi_state": rsi_signal,
                    "sma_state": sma_state,
                    "trend_state": trend_state,
                    "tv_recommendation": tv_summary_rec,
                    "macd_buy_days_ago": macd_buy_days_ago,
                    "sma_buy_days_ago": sma_buy_days_ago,
                    "overall": overall,
                    "reasons": reasons
                })
                
                # Yield GIL to prevent blocking FastAPI requests
                time.sleep(0.001)
                
            except Exception as e:
                logger.error(f"Error processing {ticker} for technical scanner: {e}")
                
        return results

technical_scanner_service = TechnicalScanner()
