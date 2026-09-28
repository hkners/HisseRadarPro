import pandas as pd
import numpy as np

def calc_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period, min_periods=1).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period, min_periods=1).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def calculate_technical_indicators(records: list) -> dict:
    """
    Given a list of historical price dicts (date, open, high, low, close, volume),
    computes various technical indicators using plain pandas and returns a summary.
    """
    if not records or len(records) < 50:
        return {"error": "Not enough data for technical analysis. Minimum 50 days required."}

    # Create DataFrame
    df = pd.DataFrame(records)
    # Ensure correct types and sorting
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df.set_index('date', inplace=True)
    
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    close = df['close']
    
    # Calculate indicators
    for length in [5, 10, 20, 30, 50, 100, 200]:
        df[f'SMA_{length}'] = close.rolling(window=length).mean()
        df[f'EMA_{length}'] = close.ewm(span=length, adjust=False).mean()
        
    df['RSI_14'] = calc_rsi(close, 14)
    
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    df['MACD_12_26_9'] = ema_12 - ema_26
    df['MACDs_12_26_9'] = df['MACD_12_26_9'].ewm(span=9, adjust=False).mean()
    df['MACDh_12_26_9'] = df['MACD_12_26_9'] - df['MACDs_12_26_9']
    
    df['ADX_14'] = None # Dummy fallback
    df['STOCHk_14_3_3'] = None
    df['STOCHd_14_3_3'] = None
    df['CCI_20_0.015'] = None
    df['WILLR_14'] = None
    
    # Get latest row
    latest = df.iloc[-1].replace([np.inf, -np.inf, np.nan], None).to_dict()
    current_price = latest.get('close')
    
    if current_price is None:
        return {"error": "Invalid price data"}

    # Build response payload
    indicators = {
        "SMA5": latest.get('SMA_5'),
        "SMA10": latest.get('SMA_10'),
        "SMA20": latest.get('SMA_20'),
        "SMA30": latest.get('SMA_30'),
        "SMA50": latest.get('SMA_50'),
        "SMA100": latest.get('SMA_100'),
        "SMA200": latest.get('SMA_200'),
        "EMA5": latest.get('EMA_5'),
        "EMA10": latest.get('EMA_10'),
        "EMA20": latest.get('EMA_20'),
        "EMA30": latest.get('EMA_30'),
        "EMA50": latest.get('EMA_50'),
        "EMA100": latest.get('EMA_100'),
        "EMA200": latest.get('EMA_200'),
        "RSI": latest.get('RSI_14'),
        "MACD.macd": latest.get('MACD_12_26_9'),
        "MACD.signal": latest.get('MACDs_12_26_9'),
        "MACD.hist": latest.get('MACDh_12_26_9'),
        "ADX": latest.get('ADX_14'),
        "Stoch.K": latest.get('STOCHk_14_3_3'),
        "Stoch.D": latest.get('STOCHd_14_3_3'),
        "CCI20": latest.get('CCI_20_0.015'),
        "W.R": latest.get('WILLR_14'),
        "current_price": current_price
    }
    
    # Determine buy/sell signals
    buy_count = 0
    sell_count = 0
    
    # Simple MA logic
    if indicators['SMA50'] and current_price > indicators['SMA50']: buy_count += 1
    elif indicators['SMA50'] and current_price < indicators['SMA50']: sell_count += 1
    
    if indicators['EMA20'] and current_price > indicators['EMA20']: buy_count += 1
    elif indicators['EMA20'] and current_price < indicators['EMA20']: sell_count += 1
    
    # Simple Oscillator logic
    rsi = indicators['RSI']
    if rsi:
        if rsi < 30: buy_count += 1
        elif rsi > 70: sell_count += 1
        
    macd = indicators['MACD.macd']
    sig = indicators['MACD.signal']
    if macd is not None and sig is not None:
        if macd > sig: buy_count += 1
        elif macd < sig: sell_count += 1

    total = buy_count + sell_count
    recommendation = "NEUTRAL"
    if total > 0:
        score = (buy_count - sell_count) / total
        if score > 0.5: recommendation = "STRONG_BUY"
        elif score > 0.1: recommendation = "BUY"
        elif score < -0.5: recommendation = "STRONG_SELL"
        elif score < -0.1: recommendation = "SELL"
        
    summary = {
        "RECOMMENDATION": recommendation,
        "BUY": buy_count,
        "SELL": sell_count,
        "NEUTRAL": max(0, 5 - total)
    }

    return {
        "indicators": indicators,
        "summary": summary,
        "oscillators": {"RECOMMENDATION": recommendation, "COMPUTE": {}},
        "moving_averages": {"RECOMMENDATION": recommendation, "COMPUTE": {}}
    }
