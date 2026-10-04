"""
HisseRadarPro — Copilot
=======================
Chat about the user's portfolio and BIST stocks, answered only from the app's own data.

Flow for each user message:
1. Route: regex finds ticker codes; a small Gemini call (JSON) adds tickers named by company name
   and picks the topics (portfolio, macro, compare, valuation, news/why, strategy, sector).
2. Retrieve: the matching context blocks are built from existing services (screener universe,
   valuation, conviction engine, broker reports, portfolio analytics, macro snapshot, compare).
3. Answer: Gemini writes a short Turkish answer grounded in those blocks, plus follow-up questions.
The response also lists which data blocks were used so the UI can link to them.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_TICKERS = 4


def _tr_sector(name):
    from services.macro_service import SECTOR_TR
    return SECTOR_TR.get(name, name) if name else name


def _round_floats(obj, digits: int = 4):
    """Rounds every float so the model never sees long decimals it might mis-format."""
    if isinstance(obj, float):
        return round(obj, digits)
    if isinstance(obj, dict):
        return {k: _round_floats(v, digits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_floats(v, digits) for v in obj]
    return obj
TOPICS = ("portfolio", "macro", "compare", "valuation", "why", "strategy", "sector", "stock")


def _known_tickers() -> set:
    from globals import BIST_TICKERS
    return set(BIST_TICKERS) | {"XU100"}


def _regex_tickers(text: str, known: set) -> List[str]:
    # Only tokens typed in capitals: many tickers are everyday words ("hedef", "mavi", "park"),
    # so lower-case mentions are left to the model, which sees the sentence.
    found = []
    for tok in re.findall(r"[A-ZÇĞİÖŞÜ0-9]{3,6}", text or ""):
        t = tok.replace("İ", "I")
        if t in known and t not in found and not t.isdigit():
            found.append(t)
    return found


def _route(question: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
    from services.ai_service import _generate_content_with_fallback, genai

    known = _known_tickers()
    tickers = _regex_tickers(question, known)
    convo = "\n".join(f"{m['role']}: {m['content'][:300]}" for m in history[-4:])
    prompt = f"""Bir Borsa İstanbul asistanına gelen soruyu sınıflandır. Yalnızca JSON döndür.
Önceki konuşma (bağlam için):
{convo}

Soru: \"\"\"{question}\"\"\"

Şema: {{"tickers": [BIST hisse kodları, şirket adıyla anılanlar dahil, en fazla 4; önceki konuşmadaki hisseye atıf varsa onu da ekle],
 "topics": [şu listeden ilgili olanlar: portfolio, macro, compare, valuation, why, strategy, sector, stock]}}
"portfolio": kullanıcının kendi portföyü, pozisyonları, maruziyeti, riski. "macro": piyasa geneli, endeks, rejim.
"why": bir hissenin neden yükseldiği/düştüğü. "strategy": strateji kurma veya test etme."""
    topics: List[str] = []
    try:
        res = _generate_content_with_fallback(
            prompt, generation_config=genai.types.GenerationConfig(temperature=0, max_output_tokens=200, response_mime_type="application/json")
        )
        data = json.loads(res.text)
        for t in data.get("tickers") or []:
            t = str(t).upper().replace(".IS", "").strip()
            if t in known and t not in tickers:
                tickers.append(t)
        topics = [t for t in data.get("topics") or [] if t in TOPICS]
    except Exception as e:
        logger.warning(f"Copilot routing failed, falling back to keywords: {e}")
    q = question.lower()
    if not topics:
        if any(k in q for k in ("portföy", "pozisyon", "maruz", "ağırlı", "riskim", "elimdeki")):
            topics.append("portfolio")
        if any(k in q for k in ("piyasa", "endeks", "xu100", "bist 100", "rejim", "makro")):
            topics.append("macro")
    if len(tickers) >= 2 and "compare" not in topics and any(k in q for k in ("karşılaştır", " vs ", "hangisi", "mı yoksa")):
        topics.append("compare")
    return {"tickers": tickers[:MAX_TICKERS], "topics": topics}


def _stock_block(ticker: str) -> Dict[str, Any]:
    from services.screener_universe import get_universe
    rows = {r["ticker"]: r for r in get_universe()["rows"]}
    row = rows.get(ticker) or {}
    block: Dict[str, Any] = {k: row.get(k) for k in (
        "ticker", "name", "sector", "industry", "price", "change_pct", "market_cap", "pe", "pb", "div_yield", "roe",
        "broker_count", "model_count", "avg_target", "upside", "last_report", "r1m", "r3m", "r1y",
        "dist_52w_high", "sma200_dist", "rsi14", "vol30", "score", "decision",
    )}
    block["sector"] = _tr_sector(block.get("sector"))
    try:
        from services.conviction_engine import conviction_engine
        conv = next((s for s in conviction_engine.get_all_scored_stocks() if s.get("ticker") == ticker), None)
        if conv:
            block["decision_drivers"] = conv.get("drivers")
            block["stop_loss"] = conv.get("stop_loss")
            block["risk_reward"] = conv.get("risk_reward")
    except Exception:
        pass
    try:
        from main import get_cached_recommendations
        from globals import BIST_TICKERS
        from services.ticker_resolver import match_ticker
        reports = [r for r in get_cached_recommendations() if match_ticker(r.get("hisse", ""), BIST_TICKERS) == ticker]
        reports.sort(key=lambda r: str(r.get("tarih", "")), reverse=True)
        block["latest_broker_reports"] = [
            {"kurum": r.get("kurum"), "tarih": r.get("tarih"), "tavsiye": r.get("tavsiye"), "hedef": r.get("hedefFiyat")}
            for r in reports[:6]
        ]
    except Exception:
        pass
    return block


def _valuation_block(ticker: str) -> Optional[Dict[str, Any]]:
    try:
        from globals import price_service, report_repo
        from services.valuation_service import compute_peer_implied_values
        price = (price_service.prices.get(ticker) or {}).get("price")
        v = compute_peer_implied_values(ticker, price, repo=report_repo)
        return {
            "peer_group": v.get("peer_group_name"),
            "pe_implied_mid": (v.get("pe") or {}).get("mid"),
            "pb_implied_mid": (v.get("pb") or {}).get("mid"),
            "pe_sector_median": (v.get("pe") or {}).get("sector_median"),
            "pb_sector_median": (v.get("pb") or {}).get("sector_median"),
        }
    except Exception:
        return None


def _portfolio_block() -> Dict[str, Any]:
    from services.portfolio_analytics import compute_portfolio_analytics
    a = compute_portfolio_analytics()
    if a.get("empty"):
        return {"empty": True}
    return {
        "is_demo": a.get("is_demo"),
        "total_value_tl": a.get("total_value"),
        "positions": [{**{k: p.get(k) for k in ("ticker", "weight", "volatility", "beta", "risk_contribution")}, "sector": _tr_sector(p.get("sector"))}
                      for p in a.get("positions", [])],
        "overview": a.get("overview"),
        "concentration": {**(a.get("concentration") or {}),
                          "sectors": [{"sector": _tr_sector(x["sector"]), "weight": x["weight"]} for x in (a.get("concentration") or {}).get("sectors", [])]},
        "average_correlation": (a.get("correlation") or {}).get("average"),
        "scenarios": [{"name": s["name"], "pnl_pct": s["pnl_pct"]} for s in a.get("scenarios", [])],
    }


def _macro_block() -> Dict[str, Any]:
    from services.macro_service import build_snapshot
    s = build_snapshot()
    sectors = [{**x, "sector": _tr_sector(x["sector"])} for x in s.get("sectors") or []]
    return {k: s.get(k) for k in ("regime", "index", "breadth", "sentiment")} | {"sectors_today": sectors}


def _compare_block(tickers: List[str]) -> Optional[Dict[str, Any]]:
    try:
        from routers.compare import compare
        c = compare(tickers=",".join(tickers), days=365)
        return {"period": f"{c['start']} – {c['end']}", "stats": c["stats"], "pairs": c["pairs"]}
    except Exception as e:
        return {"error": str(getattr(e, "detail", e))}


def chat(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    from services.ai_service import configure_ai, _generate_content_with_fallback, strip_emoji, genai

    if not configure_ai():
        return {"answer": "Yapay zekâ servisi yapılandırılmamış. `backend/.env` içine GEMINI_API_KEY eklenmeli.", "follow_ups": [], "used": [], "tickers": []}

    history = [m for m in messages if m.get("role") in ("user", "assistant") and m.get("content")][-10:]
    question = history[-1]["content"] if history else ""
    route = _route(question, history[:-1])
    tickers, topics = route["tickers"], route["topics"]

    context: Dict[str, Any] = {}
    used: List[Dict[str, Any]] = []
    for t in tickers:
        if t == "XU100":
            continue
        block = _stock_block(t)
        if "valuation" in topics or len(tickers) == 1:
            block["valuation"] = _valuation_block(t)
        context[f"hisse_{t}"] = block
        used.append({"type": "stock", "ticker": t})
    if "portfolio" in topics:
        context["portfoy"] = _portfolio_block()
        used.append({"type": "portfolio"})
    if "macro" in topics or (not tickers and "portfolio" not in topics):
        context["piyasa"] = _macro_block()
        used.append({"type": "macro"})
    if "compare" in topics and len(tickers) >= 2:
        context["karsilastirma"] = _compare_block(tickers)
        used.append({"type": "compare", "tickers": tickers})
    if "strategy" in topics:
        used.append({"type": "strategy"})

    convo = "\n".join(f"{'Kullanıcı' if m['role'] == 'user' else 'Asistan'}: {m['content'][:800]}" for m in history[:-1])
    prompt = f"""Sen HisseRadar Pro'nun Copilot'usun: Borsa İstanbul ve kullanıcının portföyü hakkında Türkçe, kısa ve net cevap veren bir analist asistanı.

Kurallar:
- YALNIZCA aşağıdaki VERİ bölümündeki sayılara dayan. Veride olmayan fiyat, haber, tarih veya olay uydurma; bilmiyorsan açıkça söyle.
- "Neden düştü/yükseldi" sorularında haber verisine erişimin yok; elindeki teknik, kurum ve piyasa verisiyle olası açıklamaları ve bunların sınırını belirt.
- Yatırım tavsiyesi verme; "al", "sat", "tut" diye yönlendirme yapma. Değerlendirme ve riskleri anlat.
- En fazla 170 kelime. Gerekirse kısa madde işaretleri kullan. Yüzdeleri Türkçe yaz (%12,5). Ondalıkları virgülle yaz.
- Portföy verisinde is_demo true ise bunun örnek portföy olduğunu belirt.
- Strateji kurma veya test etme isteğinde Backtest sayfasını, düşünce/tez sorularında Studio sayfasını öner.
- Sektör adlarını verideki Türkçe haliyle aynen kullan.
- Oranlar veride kesir olarak gelebilir (0.241 = %24,1); portföy ağırlıkları ve risk payları kesirdir, screener alanlarındaki r1m, upside gibi değerler zaten yüzdedir.

Önceki konuşma:
{convo or '(yok)'}

VERİ (JSON):
{json.dumps(_round_floats(context), ensure_ascii=False, default=str)[:14000]}

Kullanıcının sorusu: \"\"\"{question}\"\"\"

Yanıtı şu JSON şemasıyla ver: {{"answer": "markdown metin", "follow_ups": ["kullanıcının sorabileceği 3 kısa devam sorusu"]}}"""
    try:
        res = _generate_content_with_fallback(
            prompt, generation_config=genai.types.GenerationConfig(temperature=0.3, max_output_tokens=1200, response_mime_type="application/json")
        )
        data = json.loads(strip_emoji(res.text))
        answer = str(data.get("answer") or "").strip()
        follow_ups = [str(f) for f in (data.get("follow_ups") or [])][:3]
    except Exception as e:
        logger.warning(f"Copilot answer failed: {e}")
        answer, follow_ups = "Şu anda cevap üretemedim. Biraz sonra tekrar dener misin?", []

    cards = []
    for t in tickers:
        b = context.get(f"hisse_{t}")
        if b:
            cards.append({k: b.get(k) for k in ("ticker", "name", "price", "change_pct", "upside", "broker_count", "score", "r3m")})
    return {"answer": answer, "follow_ups": follow_ups, "used": used, "tickers": cards, "route": route}
