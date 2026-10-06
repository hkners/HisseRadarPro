"""Splits, dividends and dividend un-adjustment for the portfolio (no network)."""
import pytest

from services import corporate_actions as CA

ACTS = {"ABC": [
    {"date": "2025-03-10", "dividend": 2.0, "split": None},
    {"date": "2025-06-02", "dividend": None, "split": 2.0},   # 100% bonus issue
    {"date": "2025-09-15", "dividend": 1.0, "split": None},
]}


@pytest.fixture(autouse=True)
def fake_actions(monkeypatch):
    monkeypatch.setattr(CA, "actions", lambda tickers: {t: ACTS.get(t, []) for t in tickers})


def tx(i, kind, qty, price, day):
    return {"id": i, "ticker": "ABC", "account": "real", "tx_type": kind, "quantity": qty, "price": price, "tx_date": day}


def test_split_converts_to_current_basis():
    adj = CA.adjust_transactions([tx(1, "BUY", 100, 50.0, "2025-01-02"), tx(2, "BUY", 10, 30.0, "2025-07-01")],
                                 fetch_missing=False)
    assert adj[0]["quantity"] == 200 and adj[0]["price"] == 25.0 and adj[0]["raw_quantity"] == 100
    assert adj[1]["quantity"] == 10 and adj[1]["split_factor"] == 1.0


def test_dividends_follow_holdings_on_ex_date():
    adj = CA.adjust_transactions([
        tx(1, "BUY", 100, 50.0, "2025-01-02"),   # 200 shares on today's basis
        tx(2, "SELL", 50, 60.0, "2025-08-01"),   # after the bonus issue: already on today's basis, 150 left
        tx(3, "BUY", 30, 40.0, "2025-09-15"),    # bought on the ex-date: not entitled
    ], fetch_missing=False)
    d = CA.dividends_received(adj)
    by_date = {e["ex_date"]: e for e in d["events"]}
    assert by_date["2025-03-10"]["shares"] == 200 and by_date["2025-03-10"]["gross"] == 400.0
    assert by_date["2025-09-15"]["shares"] == 150 and by_date["2025-09-15"]["gross"] == 150.0
    assert d["total_net"] == pytest.approx(550 * (1 - CA.DIVIDEND_WITHHOLDING))


def test_undo_dividend_adjustment():
    # raw closes 100 (before ex-date), then 98 after a 2 TL dividend; yfinance scales the past by 0.98
    dates = ["2025-03-06", "2025-03-07", "2025-03-10", "2025-03-11"]
    raw = [99.0, 100.0, 98.0, 97.0]
    adjusted = [99.0 * 0.98, 100.0 * 0.98, 98.0, 97.0]
    out = CA.undo_dividend_adjustment("ABC", dates, adjusted)
    # the later 1 TL dividend (2025-09-15) is after the last date and must not touch anything
    assert out == pytest.approx(raw)
