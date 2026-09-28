import urllib.request
import json

targets = ['TRALT', 'TRMET', 'GRTHO', 'BESLR']

print("======================================================================")
print("1. TESTING /api/stocks/prices")
print("======================================================================")
try:
    req = urllib.request.urlopen("http://127.0.0.1:8015/api/stocks/prices")
    data = json.loads(req.read().decode("utf-8"))
    prices = data.get("prices", {})
    print(f"Total prices in response: {len(prices)}")
    for sym in targets:
        p = prices.get(sym)
        print(f"  {sym:7s} -> Price: {p.get('price')} TL | Change: {p.get('change_pct')}% | Volume: {p.get('volume')}")
except Exception as e:
    print(f"Error testing /api/stocks/prices: {e}")

print("\n======================================================================")
print("2. TESTING /api/conviction/all")
print("======================================================================")
try:
    req = urllib.request.urlopen("http://127.0.0.1:8015/api/conviction/all")
    conv_list = json.loads(req.read().decode("utf-8"))
    conv_map = {item["ticker"]: item for item in conv_list}
    print(f"Total scored stocks in response: {len(conv_list)}")
    for sym in targets:
        c = conv_map.get(sym, {})
        print(f"  {sym:7s} -> Score: {c.get('score')} | Decision: {c.get('decision')} | Price: {c.get('price')} TL | Stop: {c.get('stop_loss')} TL | Upside: {c.get('upside_pct')}% | R:R: {c.get('risk_reward')}")
except Exception as e:
    print(f"Error testing /api/conviction/all: {e}")

print("\n======================================================================")
print("3. TESTING /api/alpha/screener")
print("======================================================================")
try:
    req = urllib.request.urlopen("http://127.0.0.1:8015/api/alpha/screener")
    alpha_data = json.loads(req.read().decode("utf-8"))
    alpha_list = alpha_data if isinstance(alpha_data, list) else alpha_data.get("stocks", alpha_data.get("results", []))
    alpha_map = {item.get("ticker"): item for item in alpha_list}
    print(f"Total alpha screener stocks: {len(alpha_list)}")
    for sym in targets:
        a = alpha_map.get(sym, {})
        print(f"  {sym:7s} -> Alpha Score: {a.get('alpha_score')} | Action: {a.get('action')} | TA Score: {a.get('ta_score')} | FA Score: {a.get('fa_score')}")
except Exception as e:
    print(f"Error testing /api/alpha/screener: {e}")

print("\n======================================================================")
print("4. TESTING /api/technical-screener")
print("======================================================================")
try:
    req = urllib.request.urlopen("http://127.0.0.1:8015/api/technical-screener")
    tech_data = json.loads(req.read().decode("utf-8"))
    tech_list = tech_data if isinstance(tech_data, list) else tech_data.get("stocks", tech_data.get("data", []))
    tech_map = {item.get("ticker"): item for item in tech_list}
    print(f"Total technical screener stocks: {len(tech_list)}")
    for sym in targets:
        t = tech_map.get(sym, {})
        print(f"  {sym:7s} -> Signal: {t.get('signal')} | RSI: {t.get('rsi')} | Close: {t.get('close')} | SMA20: {t.get('sma20')}")
except Exception as e:
    print(f"Error testing /api/technical-screener: {e}")
