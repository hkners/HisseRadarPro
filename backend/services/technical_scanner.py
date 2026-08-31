import os
import pandas as pd
import ta
import numpy as np

def calculate_technical_signals(base_dir):
    from globals import report_repo, BIST_TICKERS
    
    results = []

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
            
            sma20 = ta.trend.sma_indicator(close_series, window=20).iloc[-1]
            sma50 = ta.trend.sma_indicator(close_series, window=50).iloc[-1]
            
            if len(df) >= 200:
                sma200 = ta.trend.sma_indicator(close_series, window=200).iloc[-1]
            else:
                sma200 = None
                
            macd = ta.trend.macd(close_series).iloc[-1]
            macd_signal = ta.trend.macd_signal(close_series).iloc[-1]
            
            rsi = ta.momentum.rsi(close_series, window=14).iloc[-1]
            
            current_price = close_series.iloc[-1]
            
            # Determine Signals
            reasons = []
            score = 0
            
            # 1. RSI
            if pd.isna(rsi):
                rsi_signal = "NÖTR"
            elif rsi < 30:
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
                if df['close'].iloc[-2] and not pd.isna(ta.trend.macd(close_series).iloc[-2]):
                    prev_macd = ta.trend.macd(close_series).iloc[-2]
                    prev_sig = ta.trend.macd_signal(close_series).iloc[-2]
                    if prev_macd <= prev_sig:
                        reasons.append("MACD yukarı kesti (Golden Cross)")
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
                if df['close'].iloc[-2] and not pd.isna(ta.trend.sma_indicator(close_series, window=20).iloc[-2]):
                    prev_sma20 = ta.trend.sma_indicator(close_series, window=20).iloc[-2]
                    prev_sma50 = ta.trend.sma_indicator(close_series, window=50).iloc[-2]
                    if prev_sma20 <= prev_sma50:
                        reasons.append("SMA20, SMA50'yi yukarı kesti")
            else:
                sma_state = "SAT"
                score -= 1
                if df['close'].iloc[-2] and not pd.isna(ta.trend.sma_indicator(close_series, window=20).iloc[-2]):
                    prev_sma20 = ta.trend.sma_indicator(close_series, window=20).iloc[-2]
                    prev_sma50 = ta.trend.sma_indicator(close_series, window=50).iloc[-2]
                    if prev_sma20 >= prev_sma50:
                        reasons.append("SMA20, SMA50'yi aşağı kesti")
                        
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
                "overall": overall,
                "reasons": reasons
            })
            
        except Exception as e:
            print(f"Error processing {ticker} for technical scanner: {e}")
            
    return results
