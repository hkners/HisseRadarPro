import random
import datetime
import math
import threading
import time
import logging
from globals import price_service, report_repo

logger = logging.getLogger(__name__)

class ViopService:
    def __init__(self):
        self.risk_free_rate = 0.45 # 45% annual interest rate assumption
        self._cached_data = []
        self._last_updated = None
        
        # Start background refresh thread
        self._thread = threading.Thread(target=self._background_refresh, daemon=True)
        self._thread.start()

    def _background_refresh(self):
        """Periodically refresh the VIOP screener data in the background."""
        while True:
            try:
                logger.info("ViopService: Starting background calculation for VIOP screener...")
                self._cached_data = self._generate_viop_screener_data()
                self._last_updated = datetime.datetime.now()
                logger.info("ViopService: Background calculation finished.")
            except Exception as e:
                logger.error(f"ViopService: Error in background refresh: {e}")
            time.sleep(300) # Refresh every 5 minutes

    def _calculate_theoretical_price(self, spot_price, days_to_expiry):
        # F = S * (1 + r * t)
        if spot_price <= 0: return 0
        t = days_to_expiry / 365.0
        return spot_price * (1 + self.risk_free_rate * t)

    def get_viop_screener_data(self):
        """Returns the cached VIOP data instantly."""
        if not self._cached_data:
            logger.info("ViopService: Cache empty, waiting for background thread to finish...")
            # Wait for background thread to populate cache instead of running it synchronously
            while not self._cached_data:
                time.sleep(0.5)
        return self._cached_data

    def _generate_viop_screener_data(self):
        """Generates realistic VIOP data for all stocks in the database."""
        all_companies = report_repo.get_all_company_info()
        tickers = list(all_companies.keys())
        
        # We'll just generate the closest expiry contract (e.g. end of current month)
        today = datetime.date.today()
        # Find last business day of current month
        next_month = today.replace(day=28) + datetime.timedelta(days=4)
        last_day = next_month - datetime.timedelta(days=next_month.day)
        
        days_to_expiry = (last_day - today).days
        if days_to_expiry <= 0:
            days_to_expiry = 30 # Roll over to next month if expired today
            
        contract_month_str = last_day.strftime("%m%y")
            
        results = []
        for ticker in tickers:
            # We only generate VIOP data for BIST30 ideally, but let's do it for all we have or a subset
            # Filter somewhat liquid ones (randomly selected subset for realism if we don't know bist30)
            
            spot_data = price_service.get_price(ticker)
            if not isinstance(spot_data, dict) or not spot_data.get('price'):
                continue
                
            spot_price = spot_data['price']
            
            # Generate deterministic but random-looking APS (Open Interest) based on ticker hash
            seed = sum(ord(c) for c in ticker)
            random.seed(seed + today.toordinal())
            
            base_aps = random.randint(10000, 500000)
            aps_change_pct = random.uniform(-15.0, 25.0) # -15% to +25%
            
            theo_price = self._calculate_theoretical_price(spot_price, days_to_expiry)
            
            # Market price is slightly deviated from theoretical price
            market_price = theo_price * random.uniform(0.98, 1.02)
            
            # Arbitrage Return (Annualized)
            # Yield = (Market/Spot - 1) * (365 / days_to_expiry)
            arbitrage_yield = (market_price / spot_price - 1) * (365 / days_to_expiry) * 100
            
            # Trend calculation based on APS and Price change
            spot_change = spot_data.get('change_pct', 0)
            
            trend = "NEUTRAL"
            trend_color = "var(--text-muted)"
            if spot_change > 0 and aps_change_pct > 5:
                trend = "STRONG LONG (New Buyers)"
                trend_color = "var(--color-up)"
            elif spot_change > 0 and aps_change_pct < -5:
                trend = "SHORT COVERING"
                trend_color = "#4ade80"
            elif spot_change < 0 and aps_change_pct > 5:
                trend = "STRONG SHORT (New Sellers)"
                trend_color = "var(--color-red)"
            elif spot_change < 0 and aps_change_pct < -5:
                trend = "LONG LIQUIDATION"
                trend_color = "#f87171"

            results.append({
                "contract": f"F_{ticker}{contract_month_str}",
                "ticker": ticker,
                "spot_price": spot_price,
                "spot_change": spot_change,
                "market_price": round(market_price, 2),
                "theo_price": round(theo_price, 2),
                "arbitrage_yield": round(arbitrage_yield, 2),
                "aps": int(base_aps * (1 + aps_change_pct/100)),
                "aps_change_pct": round(aps_change_pct, 2),
                "trend": trend,
                "trend_color": trend_color,
                "days_to_expiry": days_to_expiry
            })
            
            # Yield GIL to prevent blocking FastAPI requests
            time.sleep(0.001)
            
        # Reset random seed
        random.seed()
        
        # Sort by Arbitrage Yield descending
        results.sort(key=lambda x: x['arbitrage_yield'], reverse=True)
        return results

viop_service = ViopService()
