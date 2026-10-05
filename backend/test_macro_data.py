"""Real and USD conversions in services/macro_data.py, on synthetic CPI and FX series."""
import pandas as pd
import pytest

from services import macro_data as M


@pytest.fixture(autouse=True)
def fake_series(monkeypatch):
    # CPI +2% every month from Jan 2024; USD/TRY from 30 rising 1% per month; policy 40%.
    months = pd.date_range("2024-01-01", "2026-09-01", freq="MS")
    cpi_index = pd.Series([100 * 1.02 ** (i + 1) for i in range(len(months))], index=months)
    data = {
        "cpi_index": cpi_index,
        "cpi_mom": pd.Series(2.0, index=months),
        "cpi_yoy": pd.Series((1.02 ** 12 - 1) * 100, index=months),
        "usdtry": pd.Series([30 * 1.01 ** i for i in range(len(months))], index=months),
        "policy_rate": pd.Series([40.0], index=[pd.Timestamp("2024-01-01")]),
    }
    monkeypatch.setattr(M, "series", lambda name: data.get(name, pd.Series(dtype=float)))
    M._cache["key"] = None
    yield
    M._cache["key"] = None


def test_flat_nominal_curve_loses_in_real_and_usd_terms():
    idx = pd.date_range("2025-01-31", "2026-01-31", freq="ME")
    curve = pd.Series(100.0, index=idx)
    conv = M.deflate_curve(curve)
    # Twelve months of 2% inflation: a flat nominal value loses ~21% of its purchasing power.
    assert conv["real"].iloc[-1] == pytest.approx(100 / 1.02 ** 12, rel=1e-3)
    assert conv["usd"].iloc[-1] < 100


def test_cagr_of_doubling_in_one_year():
    s = pd.Series([100.0, 200.0], index=pd.to_datetime(["2025-01-01", "2026-01-01"]))
    assert M.cagr(s) == pytest.approx(1.0, rel=1e-2)


def test_point_in_time_cpi_is_known_from_the_fifth_of_next_month():
    idx = pd.date_range("2025-03-01", "2025-03-10", freq="D")
    fr = M.daily_frames(idx)
    known = fr["cpi_yoy_known"]
    assert known.notna().all()  # February's figure is known in March


def test_position_costs_in_real_and_usd_terms():
    txs = [
        {"ticker": "AAA", "account": "real", "tx_type": "BUY", "quantity": 10, "price": 100, "tx_date": "2025-01-31"},
        {"ticker": "AAA", "account": "real", "tx_type": "SELL", "quantity": 5, "price": 120, "tx_date": "2025-06-30"},
    ]
    out = M.position_costs(txs)[("AAA", "real")]
    assert out["qty"] == 5
    assert out["cost"] == pytest.approx(500)
    assert out["cost_real"] > out["cost"]          # inflated to today's prices
    # Bought at the 2025-01-31 rate (January 2025 value 30 x 1.01^12); half sold, so half the USD cost remains.
    assert out["cost_usd"] == pytest.approx(10 * 100 / (30 * 1.01 ** 12) / 2, rel=1e-6)
    assert out["usdtry_today"] > 30
