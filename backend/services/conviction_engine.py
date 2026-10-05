"""
HisseRadarPro — HisseRadar score (decision engine)
==================================================
One score, and only what could be validated goes into it.

Score: the percentile of the technical model in services/ta_lab.py (gradient-boosted trees on
price/volume features and signals, walk-forward validated since 2019: the top decile beat the liquid
equal-weight market in every year out of sample, the bottom decile lagged in every year).

Not in the score, shown as context instead:
- Analyst consensus target, upside, coverage and target revisions. Tested on the 2026 reports against
  the next 20 sessions, none added information beyond the technical model (|t| < 2) and a higher
  upside went with LOWER later returns (a high upside is often a target not yet cut after a fall).
  services/score_evidence.py repeats this test on every rebuild and reports it on the score card.
- Sector-relative valuation, ROE and model-portfolio presence: no point-in-time history exists to
  validate them.

Decision bands (score = percentile among liquid stocks):
  >= 90 and not in a stage-4 decline -> GÜÇLÜ AL     70-90 -> KADEMELİ AL
  30-70 -> BEKLE / İZLE                               < 30 -> RİSKLİ / SAT
Illiquid stocks are capped at KADEMELİ AL: the model was trained on liquid names.
"""

import datetime
import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

MODEL_VERSION = "v3"

try:
    names_path = os.path.join(os.path.dirname(__file__), '..', 'company_names.json')
    with open(names_path, 'r', encoding='utf-8') as f:
        COMPANY_NAMES = json.load(f)
except Exception:
    COMPANY_NAMES = {}

BANDS = [
    (90, "GÜÇLÜ AL", "STRONG_BUY", "#3F8A6B"),
    (70, "KADEMELİ AL", "BUY", "#C8A24A"),
    (30, "BEKLE / İZLE", "HOLD", "#C9883A"),
    (0, "RİSKLİ / SAT", "AVOID", "#C0524E"),
]
STAGE_LABEL = {1: "1. evre (taban)", 2: "2. evre (yükseliş)", 3: "3. evre (tepe)", 4: "4. evre (düşüş)"}


def _tr_num(v: float, digits: int = 1) -> str:
    return f"{v:,.{digits}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _tr_pct(v: float, digits: int = 1, sign: bool = True) -> str:
    s = "-" if v < 0 else ("+" if sign and v > 0 else "")
    return f"{s}%{_tr_num(abs(v), digits)}"


def _ta_rows() -> Dict[str, Dict[str, Any]]:
    try:
        from services import ta_lab
        lab = ta_lab.get_lab()
        return {r["ticker"]: r for r in lab["rows"]} if lab else {}
    except Exception as e:
        logger.warning(f"Score: technical lab unavailable: {e}")
        return {}


def _signal_meta() -> Dict[str, Dict[str, Any]]:
    try:
        from services import ta_lab
        lab = ta_lab.get_lab()
        if not lab:
            return {}
        return {s["key"]: {"label": s["label"], "verdict": lab["evidence"][s["key"]]["verdict"],
                           "mean20": lab["evidence"][s["key"]]["horizons"].get(20, {}).get("mean")}
                for s in ta_lab.SIGNALS}
    except Exception:
        return {}


class ConvictionEngine:
    def __init__(self, start_background: bool = True):
        self._cached_results: Dict[str, Dict[str, Any]] = {}
        self._cached_top_buys: List[Dict[str, Any]] = []
        self._cached_market_regime: Dict[str, Any] = {}
        self._cached_strategies: Dict[str, List[Dict[str, Any]]] = {"momentum": [], "value": [], "models": []}
        self._last_updated: Optional[datetime.datetime] = None
        self._is_computing = False
        self._lock = threading.Lock()
        if start_background:
            threading.Thread(target=self._background_loop, daemon=True).start()

    def _background_loop(self):
        time.sleep(10)  # wait for the price preload
        while True:
            try:
                self.recompute()
            except Exception as e:
                logger.error(f"ConvictionEngine: recompute failed: {e}", exc_info=True)
            time.sleep(600)  # live prices refresh every 15 minutes

    # ------------------------------------------------------------------ analyst context

    def compute_target_revision_momentum(self, ticker: str, today: Optional[datetime.date] = None,
                                         reports: Optional[List[Dict[str, Any]]] = None) -> float:
        """(brokers that raised their target - brokers that cut it) / brokers that revised, last 90 days."""
        today = _as_date(today)
        cutoff = (today - datetime.timedelta(days=90)).isoformat()
        if reports is None:
            from globals import report_repo
            reports = report_repo.get_reports(ticker=ticker, limit=200) or []
        by_broker: Dict[str, List[Tuple[str, float]]] = {}
        for r in reports:
            r_t = str(r.get("ticker") or "").upper().strip()
            if r_t and ticker and r_t != ticker.upper().strip():
                continue
            d = str(r.get("report_date") or r.get("tarih") or "")[:10]
            broker = str(r.get("broker") or r.get("kurum") or "").strip()
            tp = _target_of(r)
            if d and d >= cutoff and broker and tp:
                by_broker.setdefault(broker, []).append((d, tp))
        up = down = 0
        for reps in by_broker.values():
            if len(reps) < 2:
                continue
            reps.sort()
            first, last = reps[0][1], reps[-1][1]
            up += last > first * 1.001
            down += last < first * 0.999
        return round((up - down) / (up + down), 3) if up + down else 0.0

    def _consensus(self, recs: List[Dict[str, Any]], live_price: float, today: datetime.date) -> Dict[str, Any]:
        """Each broker's most recent target, weighted by age (context only, not in the score)."""
        latest: Dict[str, Tuple[str, float]] = {}
        brokers, model_count, fresh, recent = set(), 0, 0, 0
        latest_date = None
        for r in recs:
            b = (r.get("broker") or r.get("kurum") or "").strip()
            if b:
                brokers.add(b)
            if r.get("is_model"):
                model_count += 1
            d = str(r.get("report_date") or r.get("tarih") or "")[:10]
            tp = _target_of(r)
            if not b or not tp or not (live_price * 0.3 <= tp <= live_price * 5):
                continue
            if b not in latest or d > latest[b][0]:
                latest[b] = (d, tp)
        w_sum = wt_sum = 0.0
        for d, tp in latest.values():
            try:
                rd = datetime.date.fromisoformat(d)
                age = (today - rd).days
                latest_date = rd if latest_date is None or rd > latest_date else latest_date
            except ValueError:
                age = 200
            w = 1.0 if age <= 30 else 0.85 if age <= 60 else 0.6 if age <= 100 else 0.25 if age <= 180 else 0.05
            fresh += age <= 100
            recent += age <= 30
            w_sum += w
            wt_sum += w * tp
        target = round(wt_sum / w_sum, 2) if w_sum else None
        upside = round((target / live_price - 1) * 100, 2) if target and live_price else 0.0
        return {"consensus_target": target, "upside_pct": upside, "broker_count": len(brokers),
                "model_count": model_count, "fresh_reports_count": fresh, "recent_reports_count": recent,
                "latest_report_date": latest_date.isoformat() if latest_date else None}

    # ------------------------------------------------------------------ market regime (context)

    def _calculate_market_regime(self, all_prices: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from services.market_regime_service import market_regime_service
            reg = market_regime_service.get_current_regime(all_prices=all_prices)
            b = reg.get("breadth", {})
            regime = reg.get("regime", "NEUTRAL")
            return {
                "regime": regime, "status": {"RISK_ON": "BULL", "RISK_OFF": "BEAR"}.get(regime, "NEUTRAL"),
                "exposure_multiplier": reg.get("exposure_multiplier", 1.0),
                "badge": f"{regime} ({reg.get('badge_title')})", "color": reg.get("color", "#C9883A"),
                "advice": reg.get("description", ""), "advancing": b.get("up", 0), "declining": b.get("down", 0),
                "flat": b.get("flat", 0), "total": b.get("total", 0), "up_ratio_pct": b.get("up_ratio_pct", 50.0),
                "trend_breadth": (b.get("trend") or {}).get("pct_above_ma"), "index_data": reg.get("index", {}),
            }
        except Exception as e:
            logger.warning(f"Market regime unavailable: {e}")
            return {"regime": "NEUTRAL", "status": "NEUTRAL", "exposure_multiplier": 1.0, "color": "#C9883A"}

    # ------------------------------------------------------------------ scoring

    def _evaluate_stock(self, ticker: str, live_price: float, change_pct: float, volume: Any,
                        recs: List[Dict[str, Any]], fundamentals: Dict[str, Any], ta_data: Dict[str, Any],
                        history: List[Any], today: Any, universe_momentum: Any = None,
                        strong_buy_threshold: int = 75, ta_row: Optional[Dict[str, Any]] = None,
                        signal_meta: Optional[Dict[str, Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
        """Decision package for one stock. Signature kept for existing callers; the score comes from ta_row."""
        today = _as_date(today)
        if ta_row is None:
            ta_row = _ta_rows().get(ticker)
        if signal_meta is None:
            signal_meta = _signal_meta()
        ctx = self._consensus(recs, live_price, today)
        revision = self.compute_target_revision_momentum(ticker, today=today, reports=recs)

        has_model = bool(ta_row and ta_row.get("score") is not None)
        score = int(round(ta_row["score"])) if has_model else 50
        liquid = bool(ta_row.get("liquid")) if ta_row else False
        stage = int(ta_row["stage"]) if ta_row and ta_row.get("stage") is not None else None

        decision, badge, color = BANDS[2][1:]
        for floor, d, b, c in BANDS:
            if score >= floor:
                decision, badge, color = d, b, c
                break
        if badge == "STRONG_BUY" and (stage == 4 or not liquid):
            decision, badge, color = BANDS[1][1:]
        if not has_model:
            decision, badge, color = "BEKLE / İZLE", "HOLD", "#C9883A"

        # Risk: stop from the lab (below the nearest support, or 2.5 ATR), never above the price.
        stop = ta_row.get("stop") if ta_row and ta_row.get("stop") else round(live_price * 0.92, 2)
        stop = round(min(stop, live_price * 0.995), 2)
        risk = live_price - stop
        target = ctx["consensus_target"]
        rr = round((target - live_price) / risk, 1) if target and target > live_price and risk > 0 else None

        valuation_score, val_details = None, None
        try:
            from services.valuation_service import compute_valuation_score
            val_details = compute_valuation_score(ticker, return_details=True)
            valuation_score = val_details.get("valuation_score") if val_details else None
        except Exception:
            pass

        upside = ctx["upside_pct"]
        stale_target = bool(target and upside >= 40 and stage == 4)
        drivers: List[str] = []
        expected = ta_row.get("expected_excess_20d") if ta_row else None
        if has_model:
            dec = ta_row.get("decile")
            if expected is not None and dec:
                drivers.append(f"Teknik model: {dec}. dilim; bu dilim geçmişte 20 işlem gününde piyasa ortalamasına göre "
                               f"{_tr_pct(expected * 100, 2)} getiri verdi (örneklem dışı).")
            for d in (ta_row.get("drivers_pos") or [])[:2]:
                drivers.append(f"Skoru yükselten: {d['label']}")
            for d in (ta_row.get("drivers_neg") or [])[:1]:
                drivers.append(f"Skoru düşüren: {d['label']}")
        else:
            drivers.append("Teknik model bu hisse için hesaplanamadı (yetersiz fiyat geçmişi); skor nötr.")
        if not liquid and has_model:
            drivers.append("Düşük likidite: model likit hisselerle eğitildi, sonuç daha az güvenilir.")

        if stale_target:
            risk_statement = (f"Kurum hedefi ({_tr_num(target, 2)} TL, {_tr_pct(upside)}) fiyatın çok üzerinde ama hisse düşüş evresinde; "
                              "hedef henüz güncellenmemiş olabilir. Geçmiş veride yüksek potansiyel sonraki getiriyi artırmadı.")
        else:
            risk_statement = (f"Zarar kes önerisi {_tr_num(stop, 2)} TL ({_tr_pct((stop / live_price - 1) * 100)}): "
                              "en yakın desteğin biraz altı ya da 2,5 ATR.")

        signals = list(ta_row.get("signals") or []) if ta_row else []
        is_momentum = bool(stage == 2 and ((ta_row or {}).get("template") or 0) >= 7 and score >= 70)
        is_value = bool(valuation_score is not None and valuation_score >= 65 and stage != 4 and score >= 50)

        return {
            "ticker": ticker,
            "company_name": COMPANY_NAMES.get(ticker, ticker),
            "price": live_price, "change_pct": change_pct, "volume": volume,
            "score": score, "raw_score": float(ta_row["score"]) if has_model else 50.0,
            "model_version": MODEL_VERSION, "has_model": has_model, "liquid": liquid,
            "decision": decision, "decision_badge": badge, "color": color,
            "decile": ta_row.get("decile") if ta_row else None,
            "expected_excess_20d": expected,
            "stage": stage, "stage_label": STAGE_LABEL.get(stage) if stage else None,
            "template": ta_row.get("template") if ta_row else None,
            "rs_rating": ta_row.get("rs_rating") if ta_row else None,
            "signals": signals,
            "signal_details": [{"key": k, **signal_meta.get(k, {})} for k in signals],
            "groups": ta_row.get("groups") if ta_row else [],
            "drivers_pos": ta_row.get("drivers_pos") if ta_row else [],
            "drivers_neg": ta_row.get("drivers_neg") if ta_row else [],
            # analyst context (not in the score)
            **ctx,
            "recent_target": target,
            "revision_momentum": revision,
            "price_momentum_percentile": ta_row.get("rs_rating") if ta_row else None,
            # valuation context (not in the score)
            "valuation_score": valuation_score, "valuation_details": val_details,
            # trade plan
            "entry_zone": {"low": round(live_price * 0.985, 2), "high": round(live_price * 1.01, 2)},
            "stop_loss": stop, "stop_loss_pct": round((live_price - stop) / live_price * 100, 1),
            "risk_reward": rr if rr is not None else 0.0,
            "is_excessive_rr": False, "rr_warning": None,
            "is_falling_knife": stale_target,
            "rsi": ta_row.get("rsi14") if ta_row else None,
            "sma50": ta_row.get("sma50") if ta_row else None,
            "sma200": ta_row.get("sma200") if ta_row else None,
            "drivers": drivers[:4],
            "risk_statement": risk_statement,
            "is_momentum": is_momentum, "is_value": is_value,
        }

    def recompute(self):
        if self._is_computing:
            return
        self._is_computing = True
        try:
            from globals import report_repo, price_service, BIST_TICKERS
            all_prices = price_service.prices or {}
            for _ in range(10):
                if len(all_prices) >= 10:
                    break
                time.sleep(1)
                all_prices = price_service.prices or {}
            if len(all_prices) < 10:
                return
            rows = _ta_rows()
            meta = _signal_meta()
            reports_by_ticker: Dict[str, List[Dict[str, Any]]] = {}
            for r in report_repo.get_reports(limit=20000) or []:
                t = str(r.get("ticker") or "").upper().strip()
                if t and t != "BILINMIYOR":
                    reports_by_ticker.setdefault(t, []).append(r)
            company = report_repo.get_all_company_info() or {}
            regime = self._calculate_market_regime(all_prices)
            today = datetime.date.today()

            scored: Dict[str, Dict[str, Any]] = {}
            for ticker in BIST_TICKERS:
                p = all_prices.get(ticker, {})
                price = p.get("price")
                if not price or price <= 0:
                    continue
                setup = self._evaluate_stock(
                    ticker=ticker, live_price=price, change_pct=p.get("change_pct") or 0.0, volume=p.get("volume") or 0,
                    recs=reports_by_ticker.get(ticker, []), fundamentals=(company.get(ticker) or {}).get("fundamentals", {}),
                    ta_data={}, history=[], today=today, ta_row=rows.get(ticker), signal_meta=meta,
                )
                if setup:
                    scored[ticker] = setup

            ranked = sorted(scored.values(), key=lambda s: -s["score"])
            top = [s for s in ranked if s["decision_badge"] == "STRONG_BUY" and s["liquid"]][:6]
            if len(top) < 6:
                top += [s for s in ranked if s["decision_badge"] == "BUY" and s["liquid"] and s not in top][:6 - len(top)]
            momentum = [s for s in ranked if s["is_momentum"] and s["liquid"]][:10]
            value = sorted([s for s in scored.values() if s["is_value"] and s["liquid"]],
                           key=lambda s: (-(s["valuation_score"] or 0), -s["score"]))[:10]
            models = sorted([s for s in scored.values() if s["model_count"] >= 2 and s["decision_badge"] != "AVOID"],
                            key=lambda s: (-s["model_count"], -s["score"]))[:10]
            with self._lock:
                self._cached_results = scored
                self._cached_top_buys = top
                self._cached_market_regime = regime
                self._cached_strategies = {"momentum": momentum, "value": value, "models": models}
                self._last_updated = datetime.datetime.now()
            logger.info(f"ConvictionEngine: scored {len(scored)} stocks ({sum(1 for s in scored.values() if s['has_model'])} with the model)")
            if any(s["has_model"] for s in scored.values()):
                threading.Thread(target=self._save_history, args=(scored, today), daemon=True).start()
        finally:
            self._is_computing = False

    def _save_history(self, scored: Dict[str, Dict[str, Any]], today: datetime.date) -> None:
        try:
            from globals import report_repo
            now = datetime.datetime.now().isoformat()
            report_repo.upsert_score_history([{
                "ticker": t, "snapshot_date": today.isoformat(),
                "conviction_score": s["score"] if s["has_model"] else None,
                "alpha_score": None,
                "technical_component": s.get("expected_excess_20d"),
                "fundamental_component": s.get("valuation_score"),
                "sentiment_component": None,
                "consensus_component": s.get("upside_pct"),
                "revision_momentum": s.get("revision_momentum"),
                "price_momentum_percentile": s.get("rs_rating"),
                "model_version": MODEL_VERSION,
                "created_at": now,
            } for t, s in scored.items()])
        except Exception as e:
            logger.error(f"ConvictionEngine: saving score history failed: {e}")

    # ------------------------------------------------------------------ accessors

    def get_dashboard_summary(self) -> Dict[str, Any]:
        if not self._cached_results:
            self.recompute()
        with self._lock:
            return {"market_regime": self._cached_market_regime, "top_buys": self._cached_top_buys,
                    "strategies": self._cached_strategies,
                    "last_updated": self._last_updated.isoformat() if self._last_updated else None}

    def get_stock_setup(self, ticker: str) -> Optional[Dict[str, Any]]:
        t = ticker.upper().strip()
        with self._lock:
            if t in self._cached_results:
                return self._cached_results[t]
        if not self._cached_results:
            self.recompute()
            with self._lock:
                return self._cached_results.get(t)
        return None

    def get_all_scored_stocks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._cached_results.values())


def _as_date(today: Any) -> datetime.date:
    if isinstance(today, datetime.datetime):
        return today.date()
    if isinstance(today, datetime.date):
        return today
    if isinstance(today, str):
        try:
            return datetime.date.fromisoformat(today[:10])
        except ValueError:
            pass
    return datetime.date.today()


def _target_of(r: Dict[str, Any]) -> Optional[float]:
    raw = r.get("target_price") or r.get("hedefFiyat")
    try:
        v = float(str(raw).replace(",", "."))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


conviction_engine = ConvictionEngine()


def compute_target_revision_momentum(ticker: str, today: Optional[datetime.date] = None,
                                     reports: Optional[List[Dict[str, Any]]] = None) -> float:
    return conviction_engine.compute_target_revision_momentum(ticker, today=today, reports=reports)


def compute_cross_sectional_momentum(ticker: str, universe_momentum: Optional[Dict[str, float]] = None) -> float:
    """Kept for compatibility: the technical lab's relative strength rating (1-99)."""
    row = _ta_rows().get(ticker.upper().strip()) or {}
    return float(row.get("rs_rating") or 50.0)
