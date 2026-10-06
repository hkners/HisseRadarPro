"""KAP categorisation and event-study timing (no network)."""
import pandas as pd

from services.kap import category_of, _codes, _ts
from services.kap_events import _entry_positions


def test_categories():
    assert category_of("Payların Geri Alınmasına İlişkin Bildirim") == "buyback"
    assert category_of("Pay Alım Satım Bildirimi") == "insider"
    assert category_of("Yeni İş İlişkisi") == "new_contract"
    assert category_of("Pay Bazında Devre Kesici Bildirimi") == "circuit_breaker"
    assert category_of("Finansal Rapor") == "financials"
    assert category_of("Şirket Genel Bilgi Formu") is None


def test_codes_and_timestamps():
    assert _codes("ASELS, THYAO.E ,") == ["ASELS", "THYAO"]
    assert _ts("05.10.2026 16:39:01") == "2026-10-05T16:39:01"
    assert _ts("bozuk") is None


def test_entry_timing():
    sessions = pd.DatetimeIndex(["2026-10-01", "2026-10-02", "2026-10-05"])  # Thu, Fri, Mon
    ts = pd.Series(pd.to_datetime([
        "2026-10-01 10:00",   # during the session -> that day's close
        "2026-10-01 18:30",   # after the close -> next session
        "2026-10-03 12:00",   # Saturday -> Monday
        "2026-10-02 17:50",   # after the cut-off on Friday -> Monday
    ]))
    pos = _entry_positions(ts, sessions)
    assert list(pos) == [0, 1, 2, 2]
