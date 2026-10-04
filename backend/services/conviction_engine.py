"""
HisseRadarPro — Conviction Engine (Alım Karar Motoru)
===================================================
Synthesizes:
1. Time-Decayed Consensus (Taze raporlar x3 ağırlıklı)
2. Technical Timing & Dynamic Stop-Loss (ATR & 20-day low based)
3. Fundamental Quality & Multiples (ROE, F/K)
4. Model Portfolio Endorsement (Kurumların ortak sepeti)
5. Risk/Reward Ratio (R:R Calculation)
6. Market Regime (BIST Piyasa Trafik Işığı)
"""

import datetime
import json
import logging
import math
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Prompt 2 Momentum Weights: 20% (12 mo) / 30% (3 mo) / 50% (6 mo)
MOMENTUM_WEIGHT_12M = 0.20
MOMENTUM_WEIGHT_3M = 0.30
MOMENTUM_WEIGHT_6M = 0.50

# Load company names once
try:
    names_path = os.path.join(os.path.dirname(__file__), '..', 'company_names.json')
    with open(names_path, 'r', encoding='utf-8') as f:
        COMPANY_NAMES = json.load(f)
except Exception:
    COMPANY_NAMES = {}


class ConvictionEngine:
    def __init__(self, start_background: bool = True):
        self._cached_results = {}
        self._cached_top_buys = []
        self._cached_market_regime = {}
        self._cached_strategies = {
            "momentum": [],
            "value": [],
            "models": []
        }
        self._last_updated = None
        self._is_computing = False
        self._lock = threading.Lock()
        self._universe_momentum_cache = {}
        self._universe_momentum_time = 0

        # Start background updater
        if start_background:
            self._thread = threading.Thread(target=self._background_loop, daemon=True)
            self._thread.start()

    def _background_loop(self):
        """Refreshes conviction data periodically in background."""
        time.sleep(10)  # Wait for PriceService preload
        while True:
            try:
                self.recompute()
            except Exception as e:
                logger.error(f"ConvictionEngine: Error during recomputation: {e}", exc_info=True)
            time.sleep(600)  # live prices refresh every 15 minutes; 3-minute recomputes were wasted work

    def recompute(self):
        """Full recomputation of conviction scores and setups across BIST stocks."""
        if self._is_computing:
            return
        self._is_computing = True

        try:
            from globals import report_repo, price_service, BIST_TICKERS

            all_prices = price_service.prices or {}
            attempts = 0
            while (not all_prices or len(all_prices) < 10) and attempts < 10:
                time.sleep(1)
                all_prices = price_service.prices or {}
                attempts += 1

            if not all_prices or len(all_prices) < 10:
                print("ConvictionEngine: price_service prices not ready yet, skipping cache overwrite.", flush=True)
                return
            print(f"ConvictionEngine: Starting recompute with {len(all_prices)} prices...", flush=True)
            all_reports = report_repo.get_reports(limit=10000) or []
            company_info_map = report_repo.get_all_company_info() or {}

            # Group reports by ticker
            reports_by_ticker = {}
            for r in all_reports:
                t = str(r.get("ticker") or "").upper().strip()
                if not t or t == "BILINMIYOR":
                    continue
                if t not in reports_by_ticker:
                    reports_by_ticker[t] = []
                reports_by_ticker[t].append(r)

            # 1. Compute Market Regime
            market_regime = self._calculate_market_regime(all_prices)
            current_regime = market_regime.get("regime", "NEUTRAL")
            strong_buy_threshold = market_regime.get("strong_buy_threshold", 83 if current_regime == "RISK_OFF" else 75)

            # Precompute cross-sectional momentum metrics across the universe
            try:
                universe_momentum = self._compute_universe_momentum_metrics()
                with self._lock:
                    self._universe_momentum_cache = universe_momentum
                    self._universe_momentum_time = time.time()
            except Exception as e:
                logger.error(f"ConvictionEngine: Failed to compute universe momentum: {e}")
                universe_momentum = {}

            # 2. Score each ticker
            scored_stocks = {}
            top_buys = []
            strat_momentum = []
            strat_value = []
            strat_models = []

            today = datetime.date.today()

            for ticker in BIST_TICKERS:
                p_data = all_prices.get(ticker, {})
                live_price = p_data.get("price")
                if not live_price or live_price <= 0:
                    continue

                recs = reports_by_ticker.get(ticker, [])
                info = company_info_map.get(ticker, {})
                fundamentals = info.get("fundamentals", {})
                ta_data = info.get("technical_analysis", {})

                # History for ATR / Stop calculation (last 60 days sufficient for ATR/SMA/Lows)
                history = report_repo.get_historical_prices(ticker, limit=60) or []

                setup = self._evaluate_stock(
                    ticker=ticker,
                    live_price=live_price,
                    change_pct=p_data.get("change_pct", 0.0),
                    volume=p_data.get("volume", 0),
                    recs=recs,
                    fundamentals=fundamentals,
                    ta_data=ta_data,
                    history=history,
                    today=today,
                    universe_momentum=universe_momentum,
                    strong_buy_threshold=strong_buy_threshold
                )

                if setup:
                    scored_stocks[ticker] = setup

                    # Top high-conviction buys for Dashboard:
                    # In RISK_OFF regime, threshold is heightened (+8 points) for selective defense
                    min_top_score = 72 + (8 if current_regime == "RISK_OFF" else 0)
                    if (
                        setup["score"] >= min_top_score
                        and setup["decision"] == "GÜÇLÜ AL"
                        and setup.get("broker_count", 0) >= 2
                        and setup.get("ta_rec") in ("BUY", "STRONG_BUY")
                        and setup["risk_reward"] >= 1.5
                        and not setup.get("is_excessive_rr")
                        and setup["upside_pct"] >= 15
                    ):
                        top_buys.append(setup)

                    if setup.get("is_momentum") and setup.get("ta_rec") in ("BUY", "STRONG_BUY") and not setup.get("is_excessive_rr"):
                        strat_momentum.append(setup)

                    if setup.get("is_value") and setup.get("ta_rec") not in ("STRONG_SELL",) and not setup.get("is_excessive_rr"):
                        strat_value.append(setup)

                    if setup.get("model_count", 0) >= 2 and setup.get("ta_rec") not in ("STRONG_SELL",) and not setup.get("is_excessive_rr"):
                        strat_models.append(setup)

            # Sort top buys by conviction score desc, then broker count desc, then risk_reward desc (capped at 10.0 to prevent outlier distortion)
            top_buys.sort(key=lambda x: (x["score"], x.get("broker_count", 0), min(x["risk_reward"], 10.0)), reverse=True)

            # If fewer than 6, allow top scoring KADEMELİ AL with multi-broker consensus to fill (excluding excessive R:R)
            if len(top_buys) < 6:
                for s in sorted(scored_stocks.values(), key=lambda x: (x["score"], x.get("broker_count", 0)), reverse=True):
                    if s not in top_buys and s["score"] >= 65 and s.get("broker_count", 0) >= 2 and s.get("ta_rec") in ("BUY", "STRONG_BUY") and s["risk_reward"] >= 1.5 and not s.get("is_excessive_rr") and s["upside_pct"] >= 10:
                        top_buys.append(s)
                    if len(top_buys) >= 6:
                        break

            strat_momentum.sort(key=lambda x: (x["score"], x.get("change_pct", 0.0)), reverse=True)
            strat_value.sort(key=lambda x: (x["score"], x.get("upside_pct", 0.0)), reverse=True)
            strat_models.sort(key=lambda x: (x["model_count"], x["score"]), reverse=True)

            with self._lock:
                self._cached_results = scored_stocks
                self._cached_top_buys = top_buys[:6]  # Best 6
                self._cached_market_regime = market_regime
                self._cached_strategies = {
                    "momentum": strat_momentum[:10],
                    "value": strat_value[:10],
                    "models": strat_models[:10]
                }
                self._last_updated = datetime.datetime.now()
                print(f"ConvictionEngine: Evaluated {len(scored_stocks)} stocks. {len(top_buys)} Top Buys generated.", flush=True)

            logger.info(f"ConvictionEngine: Evaluated {len(scored_stocks)} stocks. {len(top_buys)} Top Buys generated.")

            # Asynchronously save score_history snapshots without blocking recompute()
            def _async_save_history():
                try:
                    today_str = today.isoformat()
                    now_str = datetime.datetime.now().isoformat()
                    history_records = []
                    for t, s in scored_stocks.items():
                        history_records.append({
                            "ticker": t,
                            "snapshot_date": today_str,
                            "conviction_score": s.get("score"),
                            "alpha_score": None,
                            "technical_component": s.get("technical_pillar"),
                            "fundamental_component": s.get("valuation_pillar"),
                            "sentiment_component": None,
                            "consensus_component": s.get("institutional_pillar"),
                            "revision_momentum": s.get("revision_momentum"),
                            "price_momentum_percentile": s.get("price_momentum_percentile"),
                            "created_at": now_str
                        })
                    report_repo.upsert_score_history(history_records)
                    logger.info(f"ConvictionEngine: Persisted {len(history_records)} score history snapshots.")
                except Exception as e:
                    logger.error(f"ConvictionEngine: Error persisting score history: {e}")

            threading.Thread(target=_async_save_history, daemon=True).start()

        finally:
            self._is_computing = False

    def compute_target_revision_momentum(
        self,
        ticker: str,
        today: Optional[datetime.date] = None,
        reports: Optional[List[Dict[str, Any]]] = None
    ) -> float:
        """
        Prompt 2 — Factor 1: Analyst Target Revision Momentum
        Filters reports for the ticker within the last 90 days. Groups by broker and sorts chronologically.
        Detects whether each broker with multiple reports revised target price up or down.
        net_revision_ratio = (up_brokers - down_brokers) / total_revising_brokers.
        Normalized between -1.0 and +1.0. Returns 0.0 if no revision data (e.g. single report per broker).
        """
        if today is None:
            today = datetime.date.today()
        elif isinstance(today, str):
            try:
                today = datetime.date.fromisoformat(today[:10])
            except Exception:
                today = datetime.date.today()
        elif isinstance(today, datetime.datetime):
            today = today.date()

        cutoff_date = today - datetime.timedelta(days=90)
        cutoff_str = cutoff_date.isoformat()

        if reports is None:
            from globals import report_repo
            reports = report_repo.get_reports(ticker=ticker, limit=200) or []

        by_broker: Dict[str, List[Tuple[str, float]]] = {}
        for r in reports:
            r_ticker = str(r.get("ticker") or "").upper().strip()
            if r_ticker and ticker and r_ticker != ticker.upper().strip():
                continue
            r_date_str = str(r.get("report_date") or r.get("tarih") or "")[:10]
            if not r_date_str or r_date_str < cutoff_str:
                continue

            broker = str(r.get("broker") or r.get("kurum") or "").strip()
            if not broker:
                continue

            t_val = r.get("target_price") or r.get("hedefFiyat")
            if not t_val or str(t_val).strip() in ("0", "0.0", "N/A", "Bilinmiyor", "None"):
                continue
            try:
                target_num = float(str(t_val).replace(",", "."))
                if target_num <= 0:
                    continue
            except (ValueError, TypeError):
                continue

            if broker not in by_broker:
                by_broker[broker] = []
            by_broker[broker].append((r_date_str, target_num))

        up_brokers = 0
        down_brokers = 0

        for broker, broker_reps in by_broker.items():
            if len(broker_reps) < 2:
                continue
            broker_reps.sort(key=lambda x: x[0])
            first_p = broker_reps[0][1]
            last_p = broker_reps[-1][1]

            # Detect revision direction with 0.1% tolerance
            if last_p > first_p * 1.001:
                up_brokers += 1
            elif last_p < first_p * 0.999:
                down_brokers += 1

        total_revising_brokers = up_brokers + down_brokers
        if total_revising_brokers == 0:
            return 0.0

        ratio = (up_brokers - down_brokers) / float(total_revising_brokers)
        return max(-1.0, min(1.0, round(ratio, 3)))

    def _compute_universe_momentum_metrics(self) -> Dict[str, float]:
        """
        Computes 3m, 6m, and 12m returns across all available historical prices in the universe
        and returns {ticker: momentum_percentile (0-100)}.
        """
        from globals import report_repo
        cutoff = (datetime.date.today() - datetime.timedelta(days=400)).isoformat()
        with report_repo._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT ticker, date, close FROM historical_prices WHERE date >= ? ORDER BY ticker, date ASC",
                (cutoff,)
            )
            rows = cursor.fetchall()

        history_by_ticker: Dict[str, List[Tuple[str, float]]] = {}
        for r in rows:
            t = r[0]
            if t not in history_by_ticker:
                history_by_ticker[t] = []
            history_by_ticker[t].append((r[1], float(r[2])))

        ret_3m: Dict[str, float] = {}
        ret_6m: Dict[str, float] = {}
        ret_12m: Dict[str, float] = {}

        for t, h in history_by_ticker.items():
            if not h:
                continue
            cur_p = h[-1][1]
            if cur_p <= 0:
                continue
            # ~63 trading days for 3m, ~126 for 6m, ~252 for 12m
            if len(h) >= 63 and h[-63][1] > 0:
                ret_3m[t] = (cur_p - h[-63][1]) / h[-63][1]
            if len(h) >= 126 and h[-126][1] > 0:
                ret_6m[t] = (cur_p - h[-126][1]) / h[-126][1]
            if len(h) >= 252 and h[-252][1] > 0:
                ret_12m[t] = (cur_p - h[-252][1]) / h[-252][1]

        def get_rank(val: Optional[float], ret_dict: Dict[str, float]) -> float:
            if val is None or not ret_dict:
                return 50.0
            vals = list(ret_dict.values())
            less = sum(1 for v in vals if v < val)
            eq = sum(1 for v in vals if v == val)
            return ((less + 0.5 * eq) / len(vals)) * 100.0

        all_tickers = set(history_by_ticker.keys())
        momentum_percentiles = {}
        for t in all_tickers:
            r3 = ret_3m.get(t)
            r6 = ret_6m.get(t)
            r12 = ret_12m.get(t)

            rank3 = get_rank(r3, ret_3m)
            rank6 = get_rank(r6, ret_6m)
            rank12 = get_rank(r12, ret_12m)

            # Apply configurable weights: 20% (12m), 30% (3m), 50% (6m)
            if r12 is not None:
                mom_score = (
                    MOMENTUM_WEIGHT_12M * rank12 +
                    MOMENTUM_WEIGHT_3M * rank3 +
                    MOMENTUM_WEIGHT_6M * rank6
                )
            elif r6 is not None:
                w_tot = MOMENTUM_WEIGHT_3M + MOMENTUM_WEIGHT_6M
                mom_score = (MOMENTUM_WEIGHT_3M * rank3 + MOMENTUM_WEIGHT_6M * rank6) / w_tot
            elif r3 is not None:
                mom_score = rank3
            else:
                mom_score = 50.0

            momentum_percentiles[t] = round(max(0.0, min(100.0, mom_score)), 1)

        return momentum_percentiles

    def compute_cross_sectional_momentum(
        self,
        ticker: str,
        universe_momentum: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Prompt 2 — Factor 2: Price Momentum (Cross-Sectional Percentile Rank).
        Returns momentum percentile (0.0 to 100.0) based on weighted 3m (30%), 6m (50%), 12m (20%) returns.
        """
        clean = ticker.upper().strip()
        if universe_momentum is not None:
            if clean in universe_momentum:
                return universe_momentum[clean]
            from globals import report_repo
            canonical = report_repo.resolve_ticker(clean)
            if canonical in universe_momentum:
                return universe_momentum[canonical]
            return 50.0

        with self._lock:
            if hasattr(self, "_universe_momentum_cache") and self._universe_momentum_cache:
                now = time.time()
                if (now - getattr(self, "_universe_momentum_time", 0)) < 3600:
                    return self._universe_momentum_cache.get(clean, 50.0)

        computed = self._compute_universe_momentum_metrics()
        with self._lock:
            self._universe_momentum_cache = computed
            self._universe_momentum_time = time.time()
        return computed.get(clean, 50.0)

    def _calculate_market_regime(self, all_prices: Dict[str, Any]) -> Dict[str, Any]:
        """Determine broad BIST market posture using MarketRegimeService."""
        try:
            from services.market_regime_service import market_regime_service
            reg_info = market_regime_service.get_current_regime(all_prices=all_prices)
            breadth = reg_info.get("breadth", {})
            regime = reg_info.get("regime", "NEUTRAL")
            status = "BULL" if regime == "RISK_ON" else ("BEAR" if regime == "RISK_OFF" else "NEUTRAL")
            return {
                "regime": regime,
                "status": status,
                "exposure_multiplier": reg_info.get("exposure_multiplier", 1.0),
                "strong_buy_threshold": reg_info.get("strong_buy_threshold", 75),
                "badge": f"{regime} ({reg_info.get('badge_title')})",
                "color": reg_info.get("color", "#C9883A"),
                "advice": reg_info.get("description", ""),
                "advancing": breadth.get("up", 0),
                "declining": breadth.get("down", 0),
                "flat": breadth.get("flat", 0),
                "total": breadth.get("total", 0),
                "up_ratio_pct": breadth.get("up_ratio_pct", 50.0),
                "index_data": reg_info.get("index", {})
            }
        except Exception as e:
            logger.warning(f"Failed to use MarketRegimeService: {e}, falling back to legacy breadth")
            up = 0
            down = 0
            flat = 0
            total = 0

            for t, data in all_prices.items():
                if not isinstance(data, dict):
                    continue
                c = data.get("change_pct")
                if c is not None:
                    total += 1
                    if c > 0.05:
                        up += 1
                    elif c < -0.05:
                        down += 1
                    else:
                        flat += 1

            up_ratio = (up / total) if total > 0 else 0.5

            if up_ratio >= 0.55:
                status = "BULL"
                badge = "BOĞA PİYASASI (ALIM İŞTAHI YÜKSEK)"
                color = "#3F8A6B"
                advice = "Piyasa genelinde alım iştahı güçlü. Yüksek inançlı alım sinyalleri tam ağırlıkla değerlendirilebilir."
            elif up_ratio <= 0.40:
                status = "BEAR"
                badge = "AYI PİYASASI (SATIŞ BASKISI VAR)"
                color = "#C0524E"
                advice = "Piyasa genel baskı altında. Yeni pozisyonlarda nakit oranını yüksek tutun, sadece defansif hisselerde kademeli alım yapın."
            else:
                status = "NEUTRAL"
                badge = "TESTERE / SEÇİCİ PİYASA"
                color = "#C9883A"
                advice = "Piyasada kararsız ve yatay seyir hakim. Endeks yerine hisse bazlı hikayelere ve güçlü bilançolara odaklanın."

            return {
                "regime": "RISK_ON" if status == "BULL" else ("RISK_OFF" if status == "BEAR" else "NEUTRAL"),
                "status": status,
                "exposure_multiplier": 0.5 if status == "BEAR" else 1.0,
                "strong_buy_threshold": 83 if status == "BEAR" else 75,
                "badge": badge,
                "color": color,
                "advice": advice,
                "advancing": up,
                "declining": down,
                "flat": flat,
                "total": total,
                "up_ratio_pct": round(up_ratio * 100, 1)
            }

    def _evaluate_stock(
        self,
        ticker: str,
        live_price: float,
        change_pct: float,
        volume: int,
        recs: List[Dict[str, Any]],
        fundamentals: Dict[str, Any],
        ta_data: Dict[str, Any],
        history: List[Any],
        today: datetime.date,
        universe_momentum: Optional[Dict[str, float]] = None,
        strong_buy_threshold: int = 75
    ) -> Optional[Dict[str, Any]]:
        """Compute full decision package for a single stock."""
        company_name = COMPANY_NAMES.get(ticker, f"{ticker} A.Ş.")
        if today is None:
            today = datetime.date.today()
        elif isinstance(today, str):
            try:
                today = datetime.date.fromisoformat(today[:10])
            except Exception:
                today = datetime.date.today()
        elif isinstance(today, datetime.datetime):
            today = today.date()

        # --- 1. Time-Decayed & Recent Months Consensus Target ---
        weighted_target_sum = 0.0
        weight_sum = 0.0
        recent_target_sum = 0.0
        recent_weight_sum = 0.0
        recent_reports_count = 0
        unique_brokers = set()
        model_count = 0
        fresh_reports_count = 0
        latest_report_date = None

        def _target_of(rep: Dict[str, Any]) -> Optional[float]:
            raw = rep.get("target_price") or rep.get("hedefFiyat")
            try:
                val = float(str(raw).replace(",", "."))
                return val if val > 0 else None
            except (ValueError, TypeError):
                return None

        # Each broker counts once in the consensus: only its most recent report with a valid target.
        # Otherwise a broker that revised its target would be averaged together with its own old view.
        latest_by_broker: Dict[str, Tuple[str, int]] = {}
        for r in recs:
            b_name = (r.get("broker") or r.get("kurum") or "").strip()
            if not b_name or _target_of(r) is None:
                continue
            d = str(r.get("report_date") or r.get("tarih") or "")[:10]
            if b_name not in latest_by_broker or d > latest_by_broker[b_name][0]:
                latest_by_broker[b_name] = (d, id(r))
        consensus_ids = {v[1] for v in latest_by_broker.values()}

        for r in recs:
            broker = r.get("broker") or r.get("kurum") or ""
            if broker:
                unique_brokers.add(broker)

            if r.get("is_model"):
                model_count += 1

            if broker.strip() and id(r) not in consensus_ids:
                continue

            t_val = r.get("target_price") or r.get("hedefFiyat")
            if not t_val or str(t_val).strip() in ("0", "0.0", "N/A", "Bilinmiyor", "None"):
                continue

            try:
                target_num = float(str(t_val).replace(",", "."))
            except (ValueError, TypeError):
                continue

            # Sanity check on target
            if target_num <= 0 or target_num > live_price * 5 or target_num < live_price * 0.3:
                continue

            # Calculate report age decay
            r_date_str = str(r.get("report_date") or r.get("tarih") or "")[:10]
            weight = 0.3  # fallback
            age_days = 200
            if r_date_str and len(r_date_str) == 10:
                try:
                    r_date = datetime.date.fromisoformat(r_date_str)
                    age_days = (today - r_date).days
                    if not latest_report_date or r_date > latest_report_date:
                        latest_report_date = r_date

                    if age_days <= 30:
                        weight = 1.0
                        fresh_reports_count += 1
                    elif age_days <= 60:
                        weight = 0.85
                        fresh_reports_count += 1
                    elif age_days <= 100:
                        weight = 0.6
                        fresh_reports_count += 1
                    elif age_days <= 180:
                        weight = 0.25
                    else:
                        weight = 0.05
                except Exception:
                    weight = 0.3

            weighted_target_sum += (target_num * weight)
            weight_sum += weight

            # Track reports from recent months (within last 100 days / ~3.5 months)
            if age_days <= 100:
                recent_target_sum += (target_num * weight)
                recent_weight_sum += weight
                recent_reports_count += 1

        all_target = round(weighted_target_sum / weight_sum, 2) if weight_sum > 0 else None
        recent_target = round(recent_target_sum / recent_weight_sum, 2) if recent_weight_sum > 0 else None

        # Prioritize recent months target if at least 2 recent reports exist, else all_target
        if recent_target and recent_reports_count >= 2:
            consensus_target = recent_target
            is_recent_consensus = True
        elif all_target:
            consensus_target = all_target
            is_recent_consensus = False
        else:
            consensus_target = None
            is_recent_consensus = False

        if consensus_target and live_price > 0:
            upside_pct = round(((consensus_target - live_price) / live_price) * 100, 2)
        else:
            upside_pct = 0.0

        # --- 2. Technical Indicators & Dynamic Stop Loss ---
        closes = []
        highs = []
        lows = []
        for h in history:
            try:
                if isinstance(h, (tuple, list)):
                    if len(h) >= 5:
                        c = float(h[4])
                        hi = float(h[2])
                        lo = float(h[3])
                        closes.append(c)
                        highs.append(hi)
                        lows.append(lo)
                elif isinstance(h, dict):
                    closes.append(float(h.get("close", 0)))
                    highs.append(float(h.get("high", 0)))
                    lows.append(float(h.get("low", 0)))
            except Exception:
                continue

        sma20 = None
        sma50 = None
        rsi = None
        stop_loss = None
        atr = None

        if len(closes) >= 20:
            sma20 = sum(closes[-20:]) / 20.0
            if len(closes) >= 50:
                sma50 = sum(closes[-50:]) / 50.0

            if len(closes) >= 15 and len(highs) >= 15 and len(lows) >= 15:
                tr_list = []
                for i in range(-14, 0):
                    tr = max(
                        highs[i] - lows[i],
                        abs(highs[i] - closes[i - 1]),
                        abs(lows[i] - closes[i - 1])
                    )
                    tr_list.append(tr)
                atr = sum(tr_list) / len(tr_list)

            recent_low = min(lows[-20:]) if len(lows) >= 20 else live_price * 0.93
            atr_stop = (live_price - 2.0 * atr) if atr else (live_price * 0.94)

            candidate_stop = max(recent_low * 0.99, atr_stop)
            min_stop = live_price * 0.91  # max 9% loss
            max_stop = live_price * 0.96  # min 4% loss
            stop_loss = round(max(min_stop, min(candidate_stop, max_stop)), 2)

            gains = []
            losses = []
            for i in range(-14, 0):
                diff = closes[i] - closes[i - 1]
                if diff > 0:
                    gains.append(diff)
                    losses.append(0.0)
                else:
                    gains.append(0.0)
                    losses.append(abs(diff))
            avg_g = sum(gains) / 14.0
            avg_l = sum(losses) / 14.0
            if avg_l == 0:
                rsi = 100.0
            else:
                rs = avg_g / avg_l
                rsi = round(100.0 - (100.0 / (1.0 + rs)), 1)

        if not stop_loss:
            stop_loss = round(live_price * 0.94, 2)
        if not rsi:
            rsi = 50.0

        entry_low = round(live_price * 0.985, 2)
        entry_high = round(live_price * 1.010, 2)

        # --- 3. Risk / Reward Calculation ---
        risk_amount = live_price - stop_loss
        if consensus_target and consensus_target > live_price and risk_amount > 0:
            reward_amount = consensus_target - live_price
            risk_reward = round(reward_amount / risk_amount, 1)
        else:
            risk_reward = 1.0

        # --- 4. Scoring Logic (0-100) & Technical Integration ---
        # Extract TradingView Technical Analysis if available
        ta_summary = (ta_data or {}).get("summary", {})
        ta_rec = ta_summary.get("RECOMMENDATION")  # STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL
        ta_score = ta_summary.get("RECOMMENDATION_SCORE")  # -1.0 to 1.0
        ta_ind = (ta_data or {}).get("indicators", {})

        # Use TradingView live indicators if available
        if ta_ind.get("RSI") is not None:
            try:
                rsi = float(ta_ind["RSI"])
            except (ValueError, TypeError):
                pass
        if ta_ind.get("SMA20") is not None:
            try:
                sma20 = float(ta_ind["SMA20"])
            except (ValueError, TypeError):
                pass
        if ta_ind.get("SMA50") is not None:
            try:
                sma50 = float(ta_ind["SMA50"])
            except (ValueError, TypeError):
                pass

        # --- 4. Nuanced Multi-Factor Scoring (0 to 100 Points) ---
        # 4.1 Institutional Consensus & Coverage Pillar (Max 26 Points)
        broker_count = len(unique_brokers)
        if broker_count >= 20:
            b_score = 18.0
        elif broker_count >= 10:
            b_score = 14.0 + (broker_count - 10) * 0.4
        elif broker_count >= 5:
            b_score = 10.0 + (broker_count - 5) * 0.8
        elif broker_count >= 3:
            b_score = 6.0 + (broker_count - 3) * 2.0  # 6.0 to 10.0
        elif broker_count > 0:
            b_score = broker_count * 2.0  # 1 -> 2.0, 2 -> 4.0, 3 -> 6.0
        else:
            b_score = 0.0

        if model_count >= 10:
            m_score = 8.0
        elif model_count >= 5:
            m_score = 6.0 + ((model_count - 5) / 5.0) * 2.0  # 6.0 to 8.0
        elif model_count >= 2:
            m_score = 4.0 + ((model_count - 2) / 3.0) * 2.0  # 4.0 to 6.0
        elif model_count > 0:
            m_score = model_count * 2.0  # 1 -> 2.0, 2 -> 4.0
        else:
            m_score = 0.0
        institutional_pillar = min(26.0, b_score + m_score)

        # 4.2 Inflation-Adjusted Return & Valuation Pillar (Max 32 Points)
        # Expected annual inflation benchmark hurdle rate: ~35.0%
        is_falling_knife = bool(
            ta_rec in ("SELL", "STRONG_SELL") and upside_pct >= 40
        )
        if is_falling_knife:
            up_score = -20.0
        elif upside_pct < 0:
            # Overpriced: stock trading above institutional target price (continuous ramp down to -15)
            up_score = max(-15.0, 2.0 + (upside_pct / 30.0) * 17.0)
        elif upside_pct < 20.0:
            # Far below inflation (Negative real purchasing power return)
            up_score = 2.0 + (upside_pct / 20.0) * 3.0  # 2.0 to 5.0 pts
        elif upside_pct < 35.0:
            # Lagging inflation / near break-even
            up_score = 5.0 + ((upside_pct - 20.0) / 15.0) * 5.0  # 5.0 to 10.0 pts
        elif upside_pct < 50.0:
            # Beating inflation (positive real return)
            up_score = 10.0 + ((upside_pct - 35.0) / 15.0) * 6.0  # 10.0 to 16.0 pts
        elif upside_pct < 75.0:
            # Strong inflation beater (+15% to +40% real return above inflation)
            up_score = 16.0 + ((upside_pct - 50.0) / 25.0) * 7.0  # 16.0 to 23.0 pts
        else:
            # High real return potential (continuous taper up to 25.0 max)
            up_score = min(25.0, 23.0 + ((upside_pct - 75.0) / 50.0) * 2.0)

        # Fresh Inflation-Beater Bonus:
        # If target is supported by recent months (last 100 days) with upside >= 45% and positive TA
        if recent_reports_count >= 2 and upside_pct >= 45.0 and not is_falling_knife and ta_rec in ("BUY", "STRONG_BUY"):
            up_score += 4.0  # Fresh real-return institutional conviction bonus

        q_score = 0.0
        roe_res = None
        try:
            from services.valuation_service import compute_sector_relative_roe
            roe_res = compute_sector_relative_roe(ticker)
            if roe_res and roe_res.get("roe_score") is not None:
                q_score += roe_res["roe_score"]
            else:
                roe_val = fundamentals.get("returnOnEquity")
                if roe_val is not None:
                    roe = float(roe_val)
                    if roe >= 0.35:
                        q_score += 4.0
                    elif roe >= 0.20:
                        q_score += 2.5 + ((roe - 0.20) / 0.15) * 1.5
                    elif roe >= 0.10:
                        q_score += 1.0 + ((roe - 0.10) / 0.10) * 1.5
                    elif roe >= 0.0:
                        q_score += (roe / 0.10) * 1.0
                    elif roe >= -0.15:
                        q_score += max(-4.0, (roe / 0.15) * 4.0)
                    else:
                        q_score -= 4.0
        except Exception:
            pass

        valuation_score = None
        val_details = None
        try:
            from services.valuation_service import compute_valuation_score
            val_details = compute_valuation_score(ticker, return_details=True)
            if val_details and val_details.get("valuation_score") is not None:
                valuation_score = float(val_details["valuation_score"])
                # Map 0-100 valuation score into [-3.0, +3.0] points:
                # 100 -> +3.0 (historically & sector-relative deep value)
                # 50  -> 0.0  (fair value / sector median)
                # 0   -> -3.0 (expensive)
                val_pts = ((valuation_score - 50.0) / 50.0) * 3.0
                q_score += max(-3.0, min(3.0, val_pts))
        except Exception as e:
            logger.warning(f"Error computing valuation score for {ticker}: {e}")

        valuation_pillar = max(-20.0, min(32.0, up_score + q_score))

        # 4.3 Technical Trend & Indicators Pillar (Max 28 Points)
        if ta_score is not None:
            try:
                ts = float(ta_score)
                # Continuous interpolation mapping TradingView RECOMMENDATION_SCORE [-1.0, 1.0]
                # Breakpoints: 1.0 -> 15.0, 0.5 -> 10.0, 0.0 -> 1.0, -0.5 -> -15.0, -1.0 -> -30.0
                if ts >= 0.5:
                    ta_base = min(15.0, 10.0 + ((ts - 0.5) / 0.5) * 5.0)
                elif ts >= 0.0:
                    ta_base = 1.0 + (ts / 0.5) * 9.0
                elif ts >= -0.5:
                    ta_base = -15.0 + ((ts + 0.5) / 0.5) * 16.0
                else:
                    ta_base = max(-30.0, -30.0 + ((ts + 1.0) / 0.5) * 15.0)
            except (ValueError, TypeError):
                ts = None
        else:
            ts = None

        if ts is None:
            if ta_rec == "STRONG_BUY":
                ta_base = 15.0
            elif ta_rec == "BUY":
                ta_base = 10.0
            elif ta_rec == "NEUTRAL":
                ta_base = 1.0
            elif ta_rec == "SELL":
                ta_base = -15.0
            elif ta_rec == "STRONG_SELL":
                ta_base = -30.0
            else:
                ta_base = 0.0

        tr_score = 0.0
        if sma50:
            tr_score += 3.0 if live_price > sma50 else -3.0
        if sma20:
            tr_score += 2.0 if live_price > sma20 else -2.0
        if sma20 and sma50:
            tr_score += 3.0 if sma20 > sma50 else -3.0

        r_score = 0.0
        if rsi is not None:
            if rsi < 35.0:
                # Strict circuit breaker: oversold collapse penalty if in downtrend, else 0.0
                r_score = -8.0 if ta_rec in ("SELL", "STRONG_SELL") else 0.0
            elif 35.0 <= rsi < 42.0:
                r_score = 1.0 + ((rsi - 35.0) / 7.0) * 2.0  # 1.0 to 3.0
            elif 42.0 <= rsi < 50.0:
                r_score = 3.0 + ((rsi - 42.0) / 8.0) * 2.0  # 3.0 to 5.0
            elif 50.0 <= rsi <= 65.0:
                r_score = 5.0
            elif 65.0 < rsi <= 72.0:
                r_score = 5.0 - ((rsi - 65.0) / 7.0) * 2.0  # 5.0 down to 3.0
            elif 72.0 < rsi <= 75.0:
                r_score = 3.0 - ((rsi - 72.0) / 3.0) * 7.0  # 3.0 down to -4.0
            else:  # rsi > 75.0
                r_score = -4.0

        # 4.3 Technical Trend & Indicators Pillar (Max 20 Points - 8 points reallocated to Momentum & Revision)
        raw_technical_base = ta_base + tr_score + r_score
        technical_pillar = max(-30.0, min(20.0, raw_technical_base * (20.0 / 28.0)))

        # 4.4 Trade Mechanics & Freshness Pillar (Max 12 Points)
        if risk_reward >= 4.0:
            rr_score = 6.0
        elif risk_reward >= 2.5:
            rr_score = 4.5 + ((risk_reward - 2.5) / 1.5) * 1.5  # 4.5 to 6.0
        elif risk_reward >= 1.8:
            rr_score = 3.0 + ((risk_reward - 1.8) / 0.7) * 1.5  # 3.0 to 4.5
        elif risk_reward >= 1.2:
            rr_score = 1.5 + ((risk_reward - 1.2) / 0.6) * 1.5  # 1.5 to 3.0
        elif risk_reward >= 0.5:
            rr_score = max(-4.0, -4.0 + ((risk_reward - 0.5) / 0.7) * 5.5)  # -4.0 to 1.5
        else:
            rr_score = -4.0

        if recent_reports_count >= 5:
            fresh_score = 6.0
        elif recent_reports_count >= 2:
            fresh_score = 4.0 + ((recent_reports_count - 2) / 3.0) * 2.0  # 4.0 to 6.0
        elif recent_reports_count >= 1:
            fresh_score = 2.0 + (recent_reports_count - 1) * 2.0  # 2.0 to 4.0
        else:
            fresh_score = 0.0

        mechanics_pillar = max(-5.0, min(12.0, rr_score + fresh_score))

        # 4.5 Momentum & Revision Pillar (Max 8.0 Points - Prompt 2)
        # Factor 1: Analyst Target Revision Momentum (-1.0 to 1.0)
        revision_momentum = self.compute_target_revision_momentum(ticker, today=today, reports=recs)

        # Factor 2: Cross-Sectional Price Momentum (0.0 to 100.0 percentile rank)
        price_momentum_percentile = self.compute_cross_sectional_momentum(ticker, universe_momentum=universe_momentum)

        # Price momentum (0-100%) contributes 0.0 to 5.5 points (50th percentile = 2.75 pts)
        price_contrib = (price_momentum_percentile / 100.0) * 5.5
        # Analyst revision momentum (-1.0 to +1.0) contributes -2.5 to +2.5 points (neutral = 0.0 pts)
        revision_contrib = revision_momentum * 2.5
        momentum_pillar = max(-2.5, min(8.0, price_contrib + revision_contrib))

        # Total raw score (Max 100.0):
        # 2.0 (base) + 26.0 (institutional) + 32.0 (valuation) + 20.0 (technical) + 12.0 (mechanics) + 8.0 (momentum) = 100.0
        raw_score = 2.0 + institutional_pillar + valuation_pillar + technical_pillar + mechanics_pillar + momentum_pillar

        # Clamp and round to integer display score first to ensure 100% consistency between displayed score and decision
        final_score = max(5, min(97, int(round(raw_score))))

        # --- HARD DECISION CEILINGS & CIRCUIT BREAKERS ---
        if ta_rec == "STRONG_SELL":
            score = min(final_score, 35)
            decision = "RİSKLİ / SAT"
            decision_badge = "STRONG_SELL"
            color = "#C0524E"
        elif ta_rec == "SELL":
            score = min(final_score, 50)
            if score < 40:
                decision = "RİSKLİ / SAT"
                decision_badge = "AVOID"
                color = "#C0524E"
            else:
                decision = "BEKLE / İZLE"
                decision_badge = "HOLD"
                color = "#C9883A"
        elif ta_rec == "NEUTRAL":
            score = min(final_score, 68)
            if score >= 58:
                decision = "KADEMELİ AL"
                decision_badge = "BUY"
                color = "#C8A24A"
            elif score >= 42:
                decision = "BEKLE / İZLE"
                decision_badge = "HOLD"
                color = "#C9883A"
            else:
                decision = "RİSKLİ / SAT"
                decision_badge = "AVOID"
                color = "#C0524E"
        else:  # BUY, STRONG_BUY or None
            score = final_score
            # GÜÇLÜ AL requires multi-broker institutional conviction, beating inflation, and score >= strong_buy_threshold
            # In RISK_OFF regime, threshold is elevated from 75 to 83 for selective defense
            if score >= strong_buy_threshold and broker_count >= 2 and ta_rec in ("BUY", "STRONG_BUY"):
                decision = "GÜÇLÜ AL"
                decision_badge = "STRONG_BUY"
                color = "#3F8A6B"
            elif score >= 58:
                decision = "KADEMELİ AL"
                decision_badge = "BUY"
                color = "#C8A24A"
            elif score >= 42:
                decision = "BEKLE / İZLE"
                decision_badge = "HOLD"
                color = "#C9883A"
            else:
                decision = "RİSKLİ / SAT"
                decision_badge = "AVOID"
                color = "#C0524E"

        drivers = []
        if ta_rec == "STRONG_SELL":
            drivers.append("UYARI: TradingView teknik göstergeleri 'GÜÇLÜ SAT' veriyor (Trend kırılmış)")
        elif ta_rec == "SELL":
            drivers.append("UYARI: Teknik indikatörler 'SAT' bölgesinde, tepki alımı teyit edilmedi")
        elif ta_rec == "STRONG_BUY":
            drivers.append("TradingView Teknik Skoru: GÜÇLÜ AL (Yükseliş trendi teyitli)")
        elif ta_rec == "BUY":
            drivers.append("TradingView Teknik Skoru: AL (Trend pozitif)")

        if not is_falling_knife:
            if upside_pct >= 40.0 and consensus_target:
                if recent_reports_count >= 2:
                    drivers.append(f"Son aylardaki {recent_reports_count} raporda {consensus_target} TL hedef ile enflasyon üzeri +%{upside_pct} reel getiri potansiyeli")
                else:
                    drivers.append(f"Kurum hedefi ({consensus_target} TL) ile enflasyon üzeri +%{upside_pct} getiri potansiyeli sunuyor")
            elif upside_pct >= 25.0 and consensus_target:
                drivers.append(f"{broker_count} aracı kurum mutabakatıyla {consensus_target} TL hedef (+%{upside_pct} potansiyel)")
            elif consensus_target and upside_pct < 20.0 and upside_pct >= 0:
                drivers.append(f"Kurum hedefi {consensus_target} TL (+%{upside_pct}) yıllık enflasyon beklentisinin altında kalmaktadır")
            elif consensus_target and upside_pct < 0:
                drivers.append(f"Fiyat ({live_price} TL) kurum hedefinin ({consensus_target} TL) üzerindedir (%{upside_pct} primli)")
        else:
            drivers.append(f"Hedef fiyat ({consensus_target} TL) eski tarihli olabilir; fiyat düşüş potansiyeli yanıltıcı kılıyor")

        if sma50 and live_price > sma50:
            drivers.append(f"50 günlük hareketli ortalama üzerinde yükseliş trendinde (RSI: {round(rsi, 1) if rsi else '-'})")
        elif rsi and 40 <= rsi <= 60:
            drivers.append(f"RSI {round(rsi, 1)} ile sağlıklı alım/konsolidasyon aralığında")

        if model_count >= 1 and ta_rec != "STRONG_SELL":
            drivers.append(f"{model_count} aracı kurumun resmi Model Portföyünde yer alıyor")
        elif roe_res and not roe_res.get("is_fallback") and roe_res.get("excess_roe") is not None and roe_res["excess_roe"] >= 0.05:
            drivers.append(f"Sektör Üstü ROE: %{roe_res['roe']*100:.1f} ({roe_res.get('sector')} medyanından +%{roe_res['excess_roe']*100:.1f} yüksek)")
        elif fundamentals.get("returnOnEquity"):
            try:
                roe_val = float(fundamentals["returnOnEquity"]) * 100
                if roe_val > 20:
                    drivers.append(f"Özkaynak Karlılığı (%{roe_val:.1f}) enflasyon üzerinde büyüme vadediyor")
            except Exception:
                pass

        # Check excessive R:R / distorted consensus target (e.g. pre-split unadjusted reports like GRTHO or ultra-tight stops like BESLR)
        is_excessive_rr = bool(risk_reward > 10.0 or upside_pct > 150.0)
        
        # FALSE POSITIVE EXCEPTION: High consensus blue-chips with tight technical stops might naturally exceed R:R 10
        high_conviction_anomaly = False
        recent_weight_ratio = (recent_weight_sum / weight_sum) if weight_sum > 0 else 0
        if is_excessive_rr and broker_count >= 5 and recent_weight_ratio >= 0.5 and ta_rec in ("BUY", "STRONG_BUY"):
            is_excessive_rr = False
            high_conviction_anomaly = True

        rr_warning = "Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir" if is_excessive_rr else None

        if is_excessive_rr:
            drivers.append("DİKKAT: R:R (>1:10) veya getiri aşırı yüksektir; aracı kurum hedefinin sermaye artırımı/bölünme öncesi eski fiyat bazına ait olabileceğini göz önünde bulundurunuz.")
        elif high_conviction_anomaly:
            drivers.append("DİKKAT: Yüksek potansiyel (çoklu güncel kurum onaylı ve pozitif teknik trend).")

        if len(drivers) < 3:
            if price_momentum_percentile >= 80.0:
                drivers.append(f"Güçlü Fiyat Göreceli Gücü: BIST hisseleri arasında son 3-12 ayda en yüksek %{100 - int(price_momentum_percentile)}'lik dilimde (RS: %{price_momentum_percentile:.1f})")
            elif price_momentum_percentile <= 20.0:
                drivers.append(f"Zayıf Fiyat Momentumu: BIST genelinde son 3-12 ayda en düşük %{int(price_momentum_percentile)}'lik dilimde (RS: %{price_momentum_percentile:.1f})")

        if len(drivers) < 3:
            if revision_momentum >= 0.5:
                drivers.append(f"Pozitif Kurum Revizyonu: Hedef fiyatlar son 90 günde yukarı revize edildi (Net Oran: +%{int(revision_momentum * 100)})")
            elif revision_momentum <= -0.5:
                drivers.append(f"Negatif Kurum Revizyonu: Hedef fiyatlar son 90 günde aşağı revize edildi (Net Oran: %{int(revision_momentum * 100)})")

        if len(drivers) < 3 and valuation_score is not None:
            if valuation_score >= 65.0:
                sec_name = (val_details or {}).get("sector") or "sektör"
                drivers.append(f"Cazip Değerleme: {sec_name} emsallerine göre F/K ve PD/DD iskontolu (Değerleme: {valuation_score:.0f}/100)")
            elif valuation_score <= 25.0:
                sec_name = (val_details or {}).get("sector") or "sektör"
                drivers.append(f"Primli Değerleme: {sec_name} emsallerine göre F/K ve PD/DD primli (Değerleme: {valuation_score:.0f}/100)")

        if len(drivers) < 3:
            if decision in ("GÜÇLÜ AL", "KADEMELİ AL"):
                if not is_excessive_rr and not high_conviction_anomaly:
                    drivers.append("Risk/Ödül oranı (R:R) pozitif alım asimetrisi sunuyor")
            else:
                drivers.append("Teknik ve temel göstergeler neticesinde temkinli yaklaşım önerilmektedir")

        stop_loss_pct = round(((live_price - stop_loss) / live_price) * 100, 1)
        if is_falling_knife:
            risk_statement = f"DİKKAT (Düşen Bıçak Riski): Fiyat sert gerilediği için kurum hedefi ({consensus_target} TL) yapay yüksek getiri sunuyor gibi görünebilir. Güçlü sat baskısı varken alım yüksek risklidir."
        elif is_excessive_rr:
            risk_statement = f"DİKKAT (Aşırı R:R / Hedef Fiyat Uyarısı): R:R oranı (1:{risk_reward}) veya potansiyel (+%{upside_pct}) aşırı yüksektir. Sermaye artırımı/bölünme sonrası kurum hedefi güncellenmemiş olabilir veya stop seviyesi çok dardır."
        else:
            risk_statement = f"Önerilen zarar kes seviyesi {stop_loss} TL (-%{stop_loss_pct}). Bu seviye altına sarkarsa pozisyon gözden geçirilmeli."

        is_momentum = bool(
            ta_rec in ("BUY", "STRONG_BUY") and
            live_price > (sma20 or 0) > (sma50 or 0) and
            50 <= (rsi or 50) <= 70 and
            change_pct > 0.0
        )
        is_value = bool(
            ta_rec not in ("STRONG_SELL",) and
            not is_falling_knife and
            (
                (valuation_score is not None and valuation_score >= 65.0) or
                (fundamentals.get("trailingPE") and 0 < float(fundamentals.get("trailingPE", 99)) < 12)
            ) and
            upside_pct >= 25
        )

        return {
            "ticker": ticker,
            "company_name": company_name,
            "price": live_price,
            "change_pct": change_pct,
            "volume": volume,
            "score": score,
            "raw_score": round(raw_score, 2),
            "decision": decision,
            "decision_badge": decision_badge,
            "color": color,
            "consensus_target": consensus_target,
            "upside_pct": upside_pct,
            "entry_zone": {
                "low": entry_low,
                "high": entry_high
            },
            "stop_loss": stop_loss,
            "stop_loss_pct": stop_loss_pct,
            "risk_reward": risk_reward,
            "is_excessive_rr": is_excessive_rr,
            "rr_warning": rr_warning,
            "broker_count": broker_count,
            "model_count": model_count,
            "fresh_reports_count": fresh_reports_count,
            "rsi": round(rsi, 1) if rsi else None,
            "sma20": round(sma20, 2) if sma20 else None,
            "sma50": round(sma50, 2) if sma50 else None,
            "ta_rec": ta_rec,
            "ta_score": ta_score,
            "is_falling_knife": is_falling_knife,
            "drivers": drivers[:3],
            "risk_statement": risk_statement,
            "is_momentum": is_momentum,
            "is_value": is_value,
            "recent_reports_count": recent_reports_count,
            "recent_target": recent_target,
            "latest_report_date": str(latest_report_date) if latest_report_date else None,
            "revision_momentum": revision_momentum,
            "price_momentum_percentile": price_momentum_percentile,
            "valuation_score": valuation_score,
            "valuation_details": val_details,
            "momentum_pillar": round(momentum_pillar, 2),
            "technical_pillar": round(technical_pillar, 2),
            "valuation_pillar": round(valuation_pillar, 2),
            "institutional_pillar": round(institutional_pillar, 2),
            "mechanics_pillar": round(mechanics_pillar, 2)
        }

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Returns market regime + top conviction buys + strategy highlights."""
        if not self._cached_results:
            self.recompute()

        with self._lock:
            return {
                "market_regime": self._cached_market_regime,
                "top_buys": self._cached_top_buys,
                "strategies": self._cached_strategies,
                "last_updated": self._last_updated.isoformat() if self._last_updated else None
            }

    def get_stock_setup(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Returns trade setup for a specific stock."""
        t = ticker.upper().strip()
        with self._lock:
            if t in self._cached_results:
                return self._cached_results[t]
        
        # If cache is not populated, recompute once
        if not self._cached_results:
            self.recompute()
            with self._lock:
                if t in self._cached_results:
                    return self._cached_results[t]
        return None

    def get_all_scored_stocks(self) -> List[Dict[str, Any]]:
        """Returns list of all scored stocks."""
        with self._lock:
            return list(self._cached_results.values())


# Singleton instance
conviction_engine = ConvictionEngine()

# Module-level convenience functions (Prompt 2)
def compute_target_revision_momentum(ticker: str, today: Optional[datetime.date] = None, reports: Optional[List[Dict[str, Any]]] = None) -> float:
    return conviction_engine.compute_target_revision_momentum(ticker, today=today, reports=reports)

def compute_cross_sectional_momentum(ticker: str, universe_momentum: Optional[Dict[str, float]] = None) -> float:
    return conviction_engine.compute_cross_sectional_momentum(ticker, universe_momentum=universe_momentum)
