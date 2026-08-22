import os
import threading
from db_manager import ReportRepository
from services.ticker_resolver import load_bist_tickers
from services.price_service import PriceService

base_dir = os.path.dirname(os.path.abspath(__file__))
ALL_BIST_FILE = os.path.join(base_dir, "all_bist.txt")

report_repo = ReportRepository()
BIST_TICKERS = load_bist_tickers(ALL_BIST_FILE)
price_service = PriceService(BIST_TICKERS, refresh_interval=900)

_static_json_cache = {
    "recommendations": [],
    "models": [],
}
_static_json_lock = threading.Lock()
