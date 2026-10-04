"""
HisseRadarPro — Portfolio Builder Service
=========================================
Otomatik portföy inşası, ağırlıklandırma, korelasyon ve likidite optimizasyon motoru:
1. build_candidate_portfolio: Seçilen evrende (all, bist30, bist100) en yüksek skorlu adayları belirler.
2. compute_correlation_matrix: 252 günlük getiri serileri üzerinden Pearson korelasyon matrisi çıkarır.
3. apply_diversification_filter: Yüksek korelasyonlu (>0.70) ve aşırı sektör yoğunlaşması (>%30) oluşturan hisseleri eler.
4. compute_liquidity_cap: Son 30 günlük ortalama hacme (ADV) göre %10 üst tavan kontrolü yapar.
5. compute_position_weights: Eşit, skora orantılı ve ters volatilite yöntemleriyle ağırlıklandırır.
6. generate_portfolio: Bütçeye göre tam sayı lot hesabı (Math.floor) ve kalan nakit ile nihai portföyü üretir.
"""

import datetime
import json
import logging
import math
import statistics
import time
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

BIST30_TICKERS = {
    "AKBNK", "ALARK", "ARCLK", "ASELS", "ASTOR", "BIMAS", "BRSAN", "CCOLA", "CWENE", "DOAS",
    "EKGYO", "ENKAI", "EREGL", "FROTO", "GARAN", "GUBRF", "HEKTS", "ISCTR", "KCHOL", "KONTR",
    "KRDMD", "MIATK", "ODAS", "OYAKC", "PETKM", "PGSUS", "SAHOL", "SASA",
    "SISE", "TCELL", "THYAO", "TOASO", "TRALT", "TRMET", "TUPRS", "YKBNK"
}

BIST100_TICKERS = {
    "AEFES", "AGHOL", "AHGAZ", "AKBNK", "AKCNS", "AKFGY", "AKFYE", "AKSA", "AKSEN", "ALARK",
    "ALBRK", "ALFAS", "ARCLK", "ASELS", "ASTOR", "AYDEM", "BIMAS", "BOBET", "BRSAN", "BRYAT",
    "BUCIM", "CANTE", "CCOLA", "CIMSA", "CWENE", "DOAS", "DOHOL", "ECILC", "EGEEN", "EKGYO",
    "ENERY", "ENJSA", "ENKAI", "EREGL", "EUREN", "EUPWR", "FROTO", "GARAN", "GESAN", "GLYHO",
    "GUBRF", "GWIND", "HALKB", "HEKTS", "IPEKE", "ISCTR", "ISDMR", "ISGYO", "ISMEN", "IZENR",
    "KARSN", "KAYSE", "KCAER", "KCHOL", "KLSER", "KMPUR", "KONTR", "KONYA",
    "KRDMD", "MAVI", "MIATK", "MGROS", "ODAS", "OTKAR", "OYAKC", "PENTA", "PETKM", "PGSUS",
    "PNLSN", "QUAGR", "SAHOL", "SASA", "SDTTR", "SISE", "SKBNK", "SMRTG", "SOKM", "TABGD",
    "TAVHL", "TCELL", "THYAO", "TKFEN", "TOASO", "TSKB", "TTKOM", "TTRAK", "TUKAS", "TUPRS",
    "TURSG", "ULKER", "VAKBN", "VESBE", "VESTL", "YEOTK", "YKBNK", "YYLGD", "ZOREN"
}


class PortfolioBuilder:
    def __init__(self, repo=None):
        self._repo = repo

    def _get_repo(self):
        if self._repo is not None:
            return self._repo
        try:
            from db_manager import ReportRepository
            self._repo = ReportRepository()
            return self._repo
        except Exception:
            from globals import report_repo
            return report_repo

    def build_candidate_portfolio(
        self,
        top_n: int = 15,
        universe: str = "all",
        score_metric: str = "conviction_score",
        repo=None
    ) -> List[Dict[str, Any]]:
        """
        Seçilen evrende (all, bist30, bist100) en yüksek skora sahip aday hisseleri toplar.
        """
        r = repo or self._get_repo()
        clean_univ = (universe or "all").lower().strip()

        # Determine eligible ticker universe
        allowed_set = None
        if clean_univ in ("bist30", "bist_30"):
            allowed_set = BIST30_TICKERS
        elif clean_univ in ("bist100", "bist_100"):
            allowed_set = BIST100_TICKERS

        company_info_map = r.get_all_company_info() or {}

        # 1. Fetch scores: Query score_history first for instant candidate loading
        scored_candidates = []
        score_col = "alpha_score" if score_metric == "alpha_score" else "conviction_score"
        try:
            with r._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(f"""
                    SELECT s.ticker, s.{score_col}, ci.sector, hp.close
                    FROM score_history s
                    LEFT JOIN company_info ci ON s.ticker = ci.ticker
                    LEFT JOIN historical_prices hp ON s.ticker = hp.ticker AND hp.date = (
                        SELECT MAX(date) FROM historical_prices WHERE ticker = s.ticker
                    )
                    WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM score_history)
                      AND s.{score_col} IS NOT NULL
                      AND s.{score_col} > 0
                    ORDER BY s.{score_col} DESC
                """)
                try:
                    from globals import price_service
                    live_prices = price_service.prices
                except Exception:
                    live_prices = {}
                for row in cursor.fetchall():
                    t = str(row[0] or "").upper().strip()
                    if allowed_set and t not in allowed_set:
                        continue
                    sc = float(row[1])
                    sec = row[2] or "Genel"
                    # Lots are sized with the live price; the last stored close is only a fallback, and a
                    # stock with no price at all is skipped (it used to be sized at an assumed 100 TL).
                    live = (live_prices.get(t) or {}).get("price")
                    if live and live > 0:
                        pr = float(live)
                    elif row[3] is not None and float(row[3]) > 0:
                        pr = float(row[3])
                    else:
                        continue
                    scored_candidates.append({
                        "ticker": t,
                        "score": round(sc, 1),
                        "price": round(pr, 2),
                        "sector": sec,
                        "company_name": t
                    })
        except Exception as e:
            logger.warning(f"Error querying score_history for candidates: {e}")

        # Fallback to in-memory ConvictionEngine or AlphaEngine if score_history was empty
        if not scored_candidates:
            if score_metric == "alpha_score":
                try:
                    # The running singleton: AlphaEngine() would start another endless refresh thread.
                    from services.alpha_engine import alpha_engine
                    alpha_data = alpha_engine.get_alpha_screener() or []
                    for item in alpha_data:
                        t = item.get("ticker", "").upper().strip()
                        if allowed_set and t not in allowed_set:
                            continue
                        price = item.get("price") or 0.0
                        score = item.get("alpha_score") or item.get("score") or 0.0
                        if price > 0 and score > 0:
                            c_info = company_info_map.get(t, {})
                            scored_candidates.append({
                                "ticker": t,
                                "score": float(score),
                                "price": float(price),
                                "sector": c_info.get("sector") or "Genel",
                                "company_name": item.get("company_name") or t
                            })
                except Exception as e:
                    logger.warning(f"Error fetching alpha candidates: {e}")
            else:
                try:
                    # The running singleton: a fresh ConvictionEngine has an empty cache.
                    from services.conviction_engine import conviction_engine
                    cached = {s["ticker"]: s for s in conviction_engine.get_all_scored_stocks()}
                    for t, setup in cached.items():
                        if allowed_set and t not in allowed_set:
                            continue
                        price = setup.get("price") or 0.0
                        score = setup.get("score") or 0.0
                        if price > 0 and score > 0:
                            c_info = company_info_map.get(t, {})
                            scored_candidates.append({
                                "ticker": t,
                                "score": float(score),
                                "price": float(price),
                                "sector": c_info.get("sector") or "Genel",
                                "company_name": setup.get("company_name") or t
                            })
                except Exception as e:
                    logger.warning(f"Error fetching conviction candidates: {e}")

        # If still empty (e.g. isolated test environment), fallback to company_info with mock prices
        if not scored_candidates:
            with r._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ticker, sector FROM company_info")
                for row in cursor.fetchall():
                    t = row["ticker"]
                    if allowed_set and t not in allowed_set:
                        continue
                    # Fetch latest close
                    cursor.execute("SELECT close FROM historical_prices WHERE ticker = ? ORDER BY date DESC LIMIT 1", (t,))
                    pr = cursor.fetchone()
                    if pr and pr[0] and pr[0] > 0:
                        scored_candidates.append({
                            "ticker": t,
                            "score": 50.0,
                            "price": float(pr[0]),
                            "sector": row["sector"] or "Genel",
                            "company_name": t
                        })

        # Sort descending by score
        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        # Return candidate pool with buffer for diversification filter
        pool_size = max(top_n * 2, 25)
        return scored_candidates[:pool_size]

    def compute_correlation_matrix(
        self,
        tickers: List[str],
        lookback_days: int = 252,
        repo=None
    ) -> Dict[str, Dict[str, float]]:
        """
        historical_prices'tan seçilen hisselerin günlük getiri serilerini çıkarıp
        ikili Pearson korelasyon matrisi hesaplar.
        """
        r = repo or self._get_repo()
        clean_tickers = [t.upper().strip() for t in tickers]
        if not clean_tickers:
            return {}

        # 1. Fetch daily close prices for each ticker
        ticker_prices: Dict[str, Dict[str, float]] = {}
        with r._get_connection() as conn:
            cursor = conn.cursor()
            for t in clean_tickers:
                cursor.execute(
                    """
                    SELECT date, close FROM (
                        SELECT date, close FROM historical_prices 
                        WHERE ticker = ? AND close > 0 
                        ORDER BY date DESC LIMIT ?
                    ) ORDER BY date ASC
                    """,
                    (t, lookback_days + 1)
                )
                rows = cursor.fetchall()
                if rows:
                    ticker_prices[t] = {r[0]: float(r[1]) for r in rows}

        # 2. Compute daily return series
        ticker_returns: Dict[str, Dict[str, float]] = {}
        for t, prices_dict in ticker_prices.items():
            dates = sorted(prices_dict.keys())
            returns_map = {}
            for i in range(1, len(dates)):
                d_curr = dates[i]
                d_prev = dates[i - 1]
                p_curr = prices_dict[d_curr]
                p_prev = prices_dict[d_prev]
                if p_prev > 0:
                    returns_map[d_curr] = (p_curr - p_prev) / p_prev
            ticker_returns[t] = returns_map

        # 3. Calculate pairwise correlations
        matrix: Dict[str, Dict[str, float]] = {t: {} for t in clean_tickers}

        for i, t1 in enumerate(clean_tickers):
            matrix[t1][t1] = 1.0
            r1 = ticker_returns.get(t1, {})
            for j in range(i + 1, len(clean_tickers)):
                t2 = clean_tickers[j]
                r2 = ticker_returns.get(t2, {})

                # Find common trading days
                common_dates = sorted(set(r1.keys()) & set(r2.keys()))
                if len(common_dates) < 20:
                    # Insufficient overlap / new IPO -> default uncorrelated (0.0)
                    matrix[t1][t2] = 0.0
                    matrix[t2][t1] = 0.0
                    continue

                v1 = [r1[d] for d in common_dates]
                v2 = [r2[d] for d in common_dates]

                # Pearson correlation coefficient
                mean1 = sum(v1) / len(v1)
                mean2 = sum(v2) / len(v2)

                diff1 = [x - mean1 for x in v1]
                diff2 = [x - mean2 for x in v2]

                sum_sq1 = sum(d * d for d in diff1)
                sum_sq2 = sum(d * d for d in diff2)

                if sum_sq1 <= 1e-12 or sum_sq2 <= 1e-12:
                    corr = 0.0
                else:
                    cov = sum(d1 * d2 for d1, d2 in zip(diff1, diff2))
                    corr = cov / math.sqrt(sum_sq1 * sum_sq2)
                    corr = max(-1.0, min(1.0, corr))

                matrix[t1][t2] = round(corr, 4)
                matrix[t2][t1] = round(corr, 4)

        return matrix

    def apply_diversification_filter(
        self,
        candidates: List[Dict[str, Any]],
        correlation_matrix: Dict[str, Dict[str, float]],
        max_pairwise_corr: float = 0.70,
        max_sector_weight: float = 0.30,
        target_size: Optional[int] = None,
        repo=None
    ) -> List[Dict[str, Any]]:
        """
        1. max_pairwise_corr (0.70) üzerinde korele olan çiftlerde skoru düşük olanı eler.
        2. Tek bir sektörün ağırlığı max_sector_weight'i (%30) aşıyorsa o sektörden en düşük skorlu olanları çıkarır.
        3. Tüm hisseler aynı sektördeyse en az 1 hisseyi korur.
        """
        if not candidates:
            return []

        # Sort candidate copies by score desc
        pool = list(candidates)
        pool.sort(key=lambda x: x["score"], reverse=True)

        # --- A. Pairwise Correlation Pruning ---
        eliminated_by_corr = set()
        for i in range(len(pool)):
            ti = pool[i]["ticker"]
            if ti in eliminated_by_corr:
                continue
            for j in range(i + 1, len(pool)):
                tj = pool[j]["ticker"]
                if tj in eliminated_by_corr:
                    continue

                corr = correlation_matrix.get(ti, {}).get(tj, 0.0)
                if corr > max_pairwise_corr:
                    # Lower scored is eliminated (pool is sorted desc, so pool[j] is <= pool[i])
                    eliminated_by_corr.add(tj)

        active = [c for c in pool if c["ticker"] not in eliminated_by_corr]

        # Safety: If aggressive correlation elimination stripped everything down below target_size,
        # retain top scored candidates
        if len(active) == 0 and pool:
            active = [pool[0]]

        # --- B. Sector Concentration Pruning ---
        # Sektör yoğunlaşması: tek bir sektörün adedi / toplam hisse sayısı <= max_sector_weight
        # Hedef portföy boyutunu dikkate al (örn. 10 hisseli bir portföyde max 3 hisse tek sektörden olabilir)
        effective_n = target_size or len(active)
        max_allowed_in_sector = max(1, math.floor(effective_n * max_sector_weight))

        # Check if entire pool is from a single sector (edge case)
        distinct_sectors = set(c.get("sector") or "Genel" for c in active)
        if len(distinct_sectors) == 1:
            # All candidates from same sector: retain up to max_allowed_in_sector (or at least 1)
            return active[:max(1, max_allowed_in_sector)]

        # Group by sector
        sector_groups: Dict[str, List[Dict[str, Any]]] = {}
        for c in active:
            sec = c.get("sector") or "Genel"
            sector_groups.setdefault(sec, []).append(c)

        final_candidates = []
        for sec, items in sector_groups.items():
            # Sort items desc by score
            items.sort(key=lambda x: x["score"], reverse=True)
            # Take up to max_allowed_in_sector
            final_candidates.extend(items[:max_allowed_in_sector])

        # Sort final candidates descending by score
        final_candidates.sort(key=lambda x: x["score"], reverse=True)
        return final_candidates

    def compute_liquidity_cap(
        self,
        ticker: str,
        proposed_position_value: float,
        max_pct_of_adv: float = 0.10,
        repo=None
    ) -> Dict[str, Any]:
        """
        historical_prices hacim verisinden son 30 günlük ortalama günlük işlem hacmini (ADV, TL) hesaplar.
        Önerilen pozisyon büyüklüğü ADV * max_pct_of_adv değerini aşıyorsa pozisyonu kırpar.
        """
        r = repo or self._get_repo()
        clean = ticker.upper().strip()

        with r._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT close, volume FROM (
                    SELECT close, volume FROM historical_prices 
                    WHERE ticker = ? AND close > 0 AND volume > 0
                    ORDER BY date DESC LIMIT 30
                )
                """,
                (clean,)
            )
            rows = cursor.fetchall()

        if not rows:
            # No volume history available (e.g. newly added): don't clip, return fallback
            return {
                "adv_tl": None,
                "max_allowed_position": proposed_position_value,
                "is_capped": False,
                "capped_value": proposed_position_value
            }

        daily_values = [float(row[0]) * float(row[1]) for row in rows]
        adv_tl = sum(daily_values) / len(daily_values)

        max_allowed = adv_tl * max_pct_of_adv

        if proposed_position_value > max_allowed:
            return {
                "adv_tl": round(adv_tl, 2),
                "max_allowed_position": round(max_allowed, 2),
                "is_capped": True,
                "capped_value": round(max_allowed, 2)
            }

        return {
            "adv_tl": round(adv_tl, 2),
            "max_allowed_position": round(max_allowed, 2),
            "is_capped": False,
            "capped_value": proposed_position_value
        }

    def compute_position_weights(
        self,
        final_candidates: List[Dict[str, Any]],
        method: str = "score_proportional",
        repo=None
    ) -> List[Dict[str, Any]]:
        """
        Üç farklı ağırlıklandırma yöntemi:
        1. 'equal': Her hisseye eşit ağırlık (1 / N).
        2. 'score_proportional': Skora orantılı ağırlıklandırma (score / sum_scores).
        3. 'inverse_volatility': 60 günlük getiri volatilitesinin tersiyle ağırlıklandırma (1 / vol).
        """
        if not final_candidates:
            return []

        n = len(final_candidates)
        m = (method or "score_proportional").lower().strip()
        candidates = [dict(c) for c in final_candidates]

        if m == "equal":
            w = 1.0 / n
            for c in candidates:
                c["weight"] = round(w, 4)
            return candidates

        elif m == "inverse_volatility":
            r = repo or self._get_repo()
            vols = {}
            with r._get_connection() as conn:
                cursor = conn.cursor()
                for c in candidates:
                    t = c["ticker"]
                    cursor.execute(
                        """
                        SELECT close FROM (
                            SELECT date, close FROM historical_prices 
                            WHERE ticker = ? AND close > 0 
                            ORDER BY date DESC LIMIT 61
                        ) ORDER BY date ASC
                        """,
                        (t,)
                    )
                    rows = cursor.fetchall()
                    if len(rows) >= 15:
                        closes = [float(row[0]) for row in rows]
                        rets = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes))]
                        vol = statistics.stdev(rets) if len(rets) > 1 else 0.02
                        vols[t] = max(vol, 0.005)
                    else:
                        vols[t] = 0.025  # Fallback volatility ~2.5% daily

            inv_vols = {t: 1.0 / vols[t] for t in vols}
            total_inv = sum(inv_vols.values())
            for c in candidates:
                w = inv_vols.get(c["ticker"], 1.0) / total_inv
                c["weight"] = round(w, 4)
            return candidates

        else:  # 'score_proportional' (default)
            total_score = sum(max(c.get("score", 1.0), 1.0) for c in candidates)
            for c in candidates:
                w = max(c.get("score", 1.0), 1.0) / total_score
                c["weight"] = round(w, 4)
            return candidates

    def generate_portfolio(
        self,
        top_n: int = 15,
        universe: str = "all",
        budget_tl: float = 100000.0,
        method: str = "score_proportional",
        score_metric: str = "conviction_score",
        exposure_multiplier: Optional[float] = None,
        repo=None
    ) -> Dict[str, Any]:
        """
        Nihai portföy üretim motoru.
        Aday toplama -> Korelasyon hesabı -> Çeşitlendirme filtresi -> Ağırlıklandırma ->
        Rejim Çarpanı (RISK_OFF -> varsayılan 0.5x) -> Likidite kırpması -> Math.floor lot hesabı -> Kalan bakiye hesabı.
        """
        r = repo or self._get_repo()
        budget = float(budget_tl) if budget_tl and float(budget_tl) > 0 else 100000.0
        n_target = max(3, min(top_n, 30))

        # Determine market regime & exposure multiplier
        # Default: in RISK_OFF, exposure_multiplier is 0.5; otherwise 1.0. Can be explicitly overridden.
        if exposure_multiplier is not None:
            eff_multiplier = max(0.0, float(exposure_multiplier))
            try:
                from services.market_regime_service import get_current_regime
                current_regime = get_current_regime()
                regime_name = current_regime.get("regime", "NEUTRAL")
            except Exception:
                regime_name = "OVERRIDDEN"
        else:
            try:
                from services.market_regime_service import get_current_regime
                current_regime = get_current_regime()
                regime_name = current_regime.get("regime", "NEUTRAL")
                eff_multiplier = 0.5 if regime_name == "RISK_OFF" else 1.0
            except Exception:
                regime_name = "NEUTRAL"
                eff_multiplier = 1.0

        effective_budget = budget * eff_multiplier

        # 1. Candidate selection
        candidates = self.build_candidate_portfolio(
            top_n=n_target,
            universe=universe,
            score_metric=score_metric,
            repo=r
        )
        if not candidates:
            return {
                "portfolio": [],
                "summary": {
                    "total_budget": budget,
                    "effective_budget": round(effective_budget, 2),
                    "exposure_multiplier": eff_multiplier,
                    "market_regime": regime_name,
                    "cash_reserved_regime": round(budget - effective_budget, 2),
                    "invested_amount": 0.0,
                    "remaining_cash": budget,
                    "stock_count": 0,
                    "method": method,
                    "universe": universe,
                    "sector_breakdown": {}
                },
                "correlation_matrix": {}
            }

        # 2. Correlation matrix
        tickers = [c["ticker"] for c in candidates]
        corr_matrix = self.compute_correlation_matrix(tickers, lookback_days=252, repo=r)

        # 3. Diversification filter
        diversified = self.apply_diversification_filter(
            candidates=candidates,
            correlation_matrix=corr_matrix,
            max_pairwise_corr=0.70,
            max_sector_weight=0.30,
            target_size=n_target,
            repo=r
        )

        final_stocks = diversified[:n_target]

        # 4. Position weights
        weighted_stocks = self.compute_position_weights(
            final_candidates=final_stocks,
            method=method,
            repo=r
        )

        # 5. Liquidity Cap & Lot Calculation (Math.floor(effective_budget / price))
        portfolio_items = []
        total_invested = 0.0
        sector_totals: Dict[str, float] = {}

        for item in weighted_stocks:
            ticker = item["ticker"]
            price = float(item["price"])
            raw_weight = float(item.get("weight", 1.0 / len(weighted_stocks)))
            proposed_position = effective_budget * raw_weight

            # Liquidity check
            liq = self.compute_liquidity_cap(
                ticker=ticker,
                proposed_position_value=proposed_position,
                max_pct_of_adv=0.10,
                repo=r
            )
            alloc_tl = liq["capped_value"]

            # Exact lot rounding matching AddToPortfolioModal.jsx: Math.floor(targetAmount / price)
            lots = math.floor(alloc_tl / price) if price > 0 else 0
            actual_amount = lots * price

            total_invested += actual_amount
            sec = item.get("sector") or "Genel"
            sector_totals[sec] = sector_totals.get(sec, 0.0) + actual_amount

            portfolio_items.append({
                "ticker": ticker,
                "company_name": item.get("company_name", ticker),
                "sector": sec,
                "price": round(price, 2),
                "score": round(item.get("score", 0.0), 1),
                "weight_pct": round(raw_weight * 100.0, 2),
                "lots": int(lots),
                "amount_tl": round(actual_amount, 2),
                "adv_tl": liq.get("adv_tl"),
                "is_capped": liq.get("is_capped", False)
            })

        remaining_cash = round(budget - total_invested, 2)

        # Calculate actual sector weights based on invested TL
        sector_breakdown = {}
        for s_name, s_amt in sector_totals.items():
            pct = (s_amt / total_invested * 100.0) if total_invested > 0 else 0.0
            sector_breakdown[s_name] = {
                "amount_tl": round(s_amt, 2),
                "weight_pct": round(pct, 2)
            }

        return {
            "portfolio": portfolio_items,
            "summary": {
                "total_budget": round(budget, 2),
                "effective_budget": round(effective_budget, 2),
                "exposure_multiplier": eff_multiplier,
                "market_regime": regime_name,
                "cash_reserved_regime": round(budget - effective_budget, 2),
                "invested_amount": round(total_invested, 2),
                "remaining_cash": remaining_cash,
                "stock_count": len(portfolio_items),
                "method": method,
                "universe": universe,
                "sector_breakdown": sector_breakdown
            },
            "correlation_matrix": corr_matrix
        }


# Singleton instance
_portfolio_builder = PortfolioBuilder()

# Module-level convenience functions matching prompt
def build_candidate_portfolio(top_n: int = 15, universe: str = "all", score_metric: str = "conviction_score", repo=None) -> List[Dict[str, Any]]:
    return _portfolio_builder.build_candidate_portfolio(top_n=top_n, universe=universe, score_metric=score_metric, repo=repo)

def compute_correlation_matrix(tickers: List[str], lookback_days: int = 252, repo=None) -> Dict[str, Dict[str, float]]:
    return _portfolio_builder.compute_correlation_matrix(tickers=tickers, lookback_days=lookback_days, repo=repo)

def apply_diversification_filter(candidates: List[Dict[str, Any]], correlation_matrix: Dict[str, Dict[str, float]], max_pairwise_corr: float = 0.70, max_sector_weight: float = 0.30, target_size: Optional[int] = None, repo=None) -> List[Dict[str, Any]]:
    return _portfolio_builder.apply_diversification_filter(candidates=candidates, correlation_matrix=correlation_matrix, max_pairwise_corr=max_pairwise_corr, max_sector_weight=max_sector_weight, target_size=target_size, repo=repo)

def compute_liquidity_cap(ticker: str, proposed_position_value: float, max_pct_of_adv: float = 0.10, repo=None) -> Dict[str, Any]:
    return _portfolio_builder.compute_liquidity_cap(ticker=ticker, proposed_position_value=proposed_position_value, max_pct_of_adv=max_pct_of_adv, repo=repo)

def compute_position_weights(final_candidates: List[Dict[str, Any]], method: str = "score_proportional", repo=None) -> List[Dict[str, Any]]:
    return _portfolio_builder.compute_position_weights(final_candidates=final_candidates, method=method, repo=repo)

def generate_portfolio(top_n: int = 15, universe: str = "all", budget_tl: float = 100000.0, method: str = "score_proportional", score_metric: str = "conviction_score", exposure_multiplier: Optional[float] = None, repo=None) -> Dict[str, Any]:
    return _portfolio_builder.generate_portfolio(top_n=top_n, universe=universe, budget_tl=budget_tl, method=method, score_metric=score_metric, exposure_multiplier=exposure_multiplier, repo=repo)

