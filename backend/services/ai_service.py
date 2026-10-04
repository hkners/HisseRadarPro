import os
import re
import json
import logging
import time
from typing import Dict, Any, List
import google.generativeai as genai
from globals import report_repo, price_service

logger = logging.getLogger(__name__)

def configure_ai():
    """Configure the Google Gemini AI with the API key from environment."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        try:
            env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
            if os.path.exists(env_path):
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.startswith('GEMINI_API_KEY='):
                            api_key = line.split('=', 1)[1].strip()
                            break
        except Exception:
            pass

    if api_key:
        genai.configure(api_key=api_key)
        return True
    return False

CANDIDATE_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
]

_active_model_name = None

# The UI never shows emojis; ask the model not to produce them and strip any that slip through.
_NO_EMOJI_RULE = "\n\nBiçim kuralı: Yanıtta hiçbir emoji, ikon veya piktogram kullanma; yalnızca düz metin ve Markdown."
_EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50\u2B06\u2B07\u2B05\uFE0F\u200D]")


def strip_emoji(text: str) -> str:
    """Removes emoji/pictograph code points (and the space they leave behind)."""
    if not text:
        return text
    return re.sub(r"[ \t]{2,}", " ", _EMOJI_RE.sub("", text))


def _generate_content_with_fallback(prompt: str, generation_config=None):
    """Tries generating content with candidate models, caching the working model."""
    global _active_model_name

    configure_ai()
    prompt = f"{prompt}{_NO_EMOJI_RULE}"

    models_to_try = []
    if _active_model_name and _active_model_name in CANDIDATE_MODELS:
        models_to_try.append(_active_model_name)
    for m in CANDIDATE_MODELS:
        if m not in models_to_try:
            models_to_try.append(m)

    last_err = None
    for model_name in models_to_try:
        try:
            model = genai.GenerativeModel(model_name)
            if generation_config:
                res = model.generate_content(prompt, generation_config=generation_config)
            else:
                res = model.generate_content(prompt)
            _active_model_name = model_name
            return res
        except Exception as e:
            err_str = str(e)
            logger.warning(f"Gemini model {model_name} failed: {err_str}")
            if _active_model_name == model_name:
                _active_model_name = None
            last_err = e
            continue

    raise last_err or RuntimeError("No Gemini models available")

from collections import OrderedDict

# In-memory caches with timestamp to avoid redundant API calls and save tokens
_ai_summary_cache = OrderedDict()
_AI_SUMMARY_CACHE_MAX_SIZE = 500
_ai_thesis_cache = {}
_ai_market_cache = {"timestamp": 0, "data": None}

def get_ai_financial_analysis(ticker: str) -> Dict[str, Any]:
    """Reads fundamentals and returns narrative financial analysis."""
    if ticker in _ai_summary_cache:
        # Move to end to mark as recently used
        _ai_summary_cache.move_to_end(ticker)
        return {"ticker": ticker, "summary": _ai_summary_cache[ticker], "cached": True}

    if not configure_ai():
        return {
            "error": "API Key not found", 
            "message": "Gemini API anahtarı bulunamadı."
        }

    company_info = report_repo.get_all_company_info().get(ticker)
    if not company_info:
        return {"error": "No data", "message": f"{ticker} için şirket verisi bulunamadı."}
        
    fundamentals = company_info.get("fundamentals", {})
    if not fundamentals:
        return {"error": "No fundamentals", "message": f"{ticker} için temel analiz verisi bulunamadı."}

    prompt = _build_financial_prompt(ticker, company_info.get("sector", "Bilinmiyor"), fundamentals)

    try:
        response = _generate_content_with_fallback(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.4,
                max_output_tokens=2500
            ),
        )
        summary = strip_emoji(response.text)
        
        # Enforce LRU cache limit
        _ai_summary_cache[ticker] = summary
        _ai_summary_cache.move_to_end(ticker)
        if len(_ai_summary_cache) > _AI_SUMMARY_CACHE_MAX_SIZE:
            _ai_summary_cache.popitem(last=False)
            
        return {"ticker": ticker, "summary": summary, "cached": False, "source": "gemini"}
    except Exception as e:
        logger.warning(f"AI financial analysis failed for {ticker}, falling back to deterministic summary: {e}")
        fallback_summary = _build_fallback_financial_summary(ticker, company_info.get("sector", "Bilinmiyor"), fundamentals)
        _ai_summary_cache[ticker] = fallback_summary
        _ai_summary_cache.move_to_end(ticker)
        if len(_ai_summary_cache) > _AI_SUMMARY_CACHE_MAX_SIZE:
            _ai_summary_cache.popitem(last=False)
        return {"ticker": ticker, "summary": fallback_summary, "cached": False, "source": "deterministic"}

def get_ai_stock_thesis(ticker: str) -> Dict[str, Any]:
    """
    Returns 3 Bull and 2 Bear thesis bullet points for the stock.
    Strictly token-optimized (<200 tokens response), cached for 24h.
    Falls back gracefully to deterministic analysis if AI fails.
    """
    ticker = ticker.upper().strip()
    now = time.time()
    if ticker in _ai_thesis_cache:
        entry = _ai_thesis_cache[ticker]
        if now - entry["time"] < 86400:  # 24 hours
            return {**entry["data"], "cached": True}

    # Gather data context
    company_info = report_repo.get_all_company_info().get(ticker, {})
    fundamentals = company_info.get("fundamentals", {})
    reports = report_repo.get_reports(ticker=ticker, limit=10) or []
    spot = price_service.get_price(ticker)
    live_price = spot.get("price", 0.0) if isinstance(spot, dict) else 0.0

    # Fallback default deterministic thesis
    from services.conviction_engine import conviction_engine
    setup = conviction_engine.get_stock_setup(ticker)

    fallback_bulls = setup["drivers"] if setup else [
        f"Konsensüs hedef fiyatı güncel seviyenin üzerinde prim potansiyeli sunuyor.",
        f"Şirketin temel rasyoları sektör ortalamalarına göre dengeli.",
        f"Teknik göstergelerde dip seviyelerden tepki sinyalleri izleniyor."
    ]
    fallback_bears = [
        setup["risk_statement"] if setup else "Stop seviyesinin altına sarkma halinde teknik baskı artabilir.",
        "Genel piyasa satış dalgaları ve sektörel girdi maliyetleri yakından izlenmelidir."
    ]

    fallback_data = {
        "ticker": ticker,
        "bull_cases": fallback_bulls,
        "bear_cases": fallback_bears,
        "source": "deterministic"
    }

    if not configure_ai():
        return fallback_data

    # Short, high-efficiency prompt
    broker_count = len(reports)
    pe = fundamentals.get("trailingPE", "N/A")
    roe = fundamentals.get("returnOnEquity", "N/A")
    upside = setup["upside_pct"] if setup else 0.0

    prompt = f"""Sen tecrübeli bir BIST portföy yöneticisisin. 
Hisse: {ticker}, Fiyat: {live_price} TL, Beklenen Potansiyel: +%{upside}, Rapor Sayısı: {broker_count}, F/K: {pe}, ROE: {roe}.

Görev: Bu hisse için yatırımcının hızla karar almasını sağlayacak tam olarak 3 adet BOĞA (Alım Gerekçesi) ve 2 adet AYI (Temel Risk) maddesi yaz.
Her madde en fazla 15 kelime, net, vurucu ve Türkçe olmalı.

Yanıtını SADECE geçerli bir JSON formatında ver:
{{
  "bull_cases": ["madde 1", "madde 2", "madde 3"],
  "bear_cases": ["risk 1", "risk 2"]
}}
"""

    try:
        res = _generate_content_with_fallback(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                max_output_tokens=1000,
                response_mime_type="application/json"
            )
        )
        parsed = json.loads(strip_emoji(res.text))
        result = {
            "ticker": ticker,
            "bull_cases": parsed.get("bull_cases", fallback_bulls)[:3],
            "bear_cases": parsed.get("bear_cases", fallback_bears)[:2],
            "source": "gemini"
        }
        _ai_thesis_cache[ticker] = {"time": now, "data": result}
        return {**result, "cached": False}
    except Exception as e:
        logger.warning(f"AI stock thesis failed for {ticker}, returning fallback: {e}")
        return fallback_data

def get_ai_market_pulse_summary() -> Dict[str, Any]:
    """
    Returns a 1-2 sentence high-level daily market take.
    Cached for 12 hours to avoid token cost.
    """
    now = time.time()
    if _ai_market_cache["data"] and (now - _ai_market_cache["timestamp"] < 43200):
        return {**_ai_market_cache["data"], "cached": True}

    from services.conviction_engine import conviction_engine
    dash = conviction_engine.get_dashboard_summary()
    regime = dash.get("market_regime", {})
    top_stocks = [s["ticker"] for s in dash.get("top_buys", [])[:4]]

    fallback_summary = f"{regime.get('badge', 'BIST 100')}: {regime.get('advice', 'Piyasada seçici hisse bazlı hareketler öne çıkıyor.')} Radardaki güçlü adaylar: {', '.join(top_stocks)}."

    if not configure_ai():
        return {"summary": fallback_summary, "cached": False, "source": "rule_based"}

    prompt = f"""Sen bir borsa baş analistisin. 
BIST genel durumu: {regime.get('badge')}, Yükselen: {regime.get('advancing')}, Düşen: {regime.get('declining')}.
En güçlü konsensüs hisseleri: {', '.join(top_stocks)}.

Yatırımcıya sabah bülteni tadında TAM OLARAK 2 CÜMLELİK son derece akıcı, profesyonel bir piyasa tavsiyesi ve sektör özeti yaz. Yanıtta sadece metni ver."""

    try:
        res = _generate_content_with_fallback(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                max_output_tokens=600
            )
        )
        summary = strip_emoji(res.text).strip()
        data = {"summary": summary, "source": "gemini"}
        _ai_market_cache["timestamp"] = now
        _ai_market_cache["data"] = data
        return {**data, "cached": False}
    except Exception as e:
        logger.warning(f"AI market pulse failed, returning fallback: {e}")
        return {"summary": fallback_summary, "cached": False, "source": "fallback"}

def get_ai_portfolio_audit(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Provides a concise 3-bullet action audit for user portfolio."""
    if not holdings:
        return {"advice": ["Portföyünüzde henüz hisse bulunmuyor.", "Takip ettiğiniz hisseleri ekleyerek başlayabilirsiniz."]}

    from services.conviction_engine import conviction_engine
    scored = {s["ticker"]: s for s in conviction_engine.get_all_scored_stocks()}

    total_val = 0
    total_expected_return = 0
    high_risk_tickers = []
    strong_tickers = []

    for h in holdings:
        t = h.get("ticker", "").upper()
        qty = float(h.get("quantity", 0))
        cost = float(h.get("avgCost") or h.get("cost") or 0)
        s_data = scored.get(t, {})
        price = s_data.get("price") or cost
        val = qty * price
        total_val += val

        upside = s_data.get("upside_pct", 0)
        total_expected_return += val * (upside / 100.0)

        score = s_data.get("score", 50)
        if score >= 75:
            strong_tickers.append(t)
        elif score < 45:
            high_risk_tickers.append(t)

    weighted_upside = round((total_expected_return / total_val * 100), 1) if total_val > 0 else 0

    advice = [
        f"Portföyünüzün aracı kurum konsensüslerine göre beklenen ağırlıklı getiri potansiyeli: +%{weighted_upside}."
    ]

    if strong_tickers:
        advice.append(f"Portföyün lokomotifleri: {', '.join(strong_tickers)} (Yüksek inançlı alım ve model portföy desteği var).")
    if high_risk_tickers:
        advice.append(f"Risk uyarısı: {', '.join(high_risk_tickers)} için kurum desteği zayıfladı veya teknik olarak stop seviyesine yakın. Kademeli kâr al veya stop gözden geçir.")
    else:
        advice.append("Hisse dağılımınız dengeli; stop seviyelerini izleyerek pozisyonlarınızı koruyabilirsiniz.")

    return {
        "weighted_upside_pct": weighted_upside,
        "strong_holdings": strong_tickers,
        "risk_holdings": high_risk_tickers,
        "action_bullets": advice
    }

def _build_financial_prompt(ticker: str, sector: str, fundamentals: Dict) -> str:
    def get_val(key, default="-"):
        val = fundamentals.get(key)
        return val if val is not None else default

    text = f"Sen profesyonel bir hisse senedi analistisin. {ticker} ({sector}) verileri:\n"
    text += f"- F/K: {get_val('trailingPE')}, PD/DD: {get_val('priceToBook')}, ROE: {get_val('returnOnEquity')}\n"
    text += f"- Borç/Özsermaye: {get_val('debtToEquity')}, Temettü: {get_val('dividendYield')}\n"
    text += "Yatırımcıya 4 kısa başlıkta (Genel Durum, Borç/Risk, Değerleme, Sonuç) özet değerlendirme yaz."
    return text

def _build_fallback_financial_summary(ticker: str, sector: str, fundamentals: Dict) -> str:
    """Builds a deterministic, professional financial summary if Gemini AI is unavailable."""
    def get_num(key):
        val = fundamentals.get(key)
        try:
            return float(val) if val is not None else None
        except (ValueError, TypeError):
            return None

    pe = get_num('trailingPE')
    pb = get_num('priceToBook')
    roe = get_num('returnOnEquity')
    de = get_num('debtToEquity')
    div = get_num('dividendYield')

    pe_str = f"{pe:.2f}" if pe is not None else "Bilinmiyor"
    pb_str = f"{pb:.2f}" if pb is not None else "Bilinmiyor"
    roe_str = f"%{roe * 100:.2f}" if (roe is not None and abs(roe) < 1.0) else (f"%{roe:.2f}" if roe is not None else "Bilinmiyor")
    de_str = f"{de:.2f}" if de is not None else "Dengeli"
    div_str = f"%{div * 100:.2f}" if div is not None else "0.00%"

    return f"""### {ticker} ({sector}) Temel Analiz Değerlendirmesi

**1. Genel Durum**
{ticker}, {sector} sektöründe güçlü operasyonel faaliyetlerini sürdürmektedir. Şirketin özkaynak kârlılığı ({roe_str}) sektör dinamikleri doğrultusunda sermaye verimliliğini yansıtmaktadır.

**2. Borç ve Bilanço Riski**
Şirketin Borç/Özsermaye oranı {de_str} seviyesindedir. Bilanço yapısı, net nakit akışları ve işletme sermayesi yönetimi açısından piyasa koşullarına karşı dirençli bir görünüm sunmaktadır.

**3. Değerleme Rasyoları**
Güncel çarpanlar incelendiğinde; Fiyat/Kazanç (F/K) oranı **{pe_str}**, Piyasa Değeri / Defter Değeri (PD/DD) oranı **{pb_str}** ve temettü verimi **{div_str}** seviyesindedir.

**4. Sonuç ve Stratejik Görünüm**
Temel göstergeler ve konsensüs analist raporları birlikte ele alındığında, şirketin değerleme çarpanları makul seviyelerde bulunmakta olup orta-uzun vadeli portföy perspektifinde yakından takip edilmelidir."""

