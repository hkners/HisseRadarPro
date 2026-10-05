"""Unit tests for the technical analysis lab and the HisseRadar score (synthetic data, no database)."""
import numpy as np
import pandas as pd
import pytest

from services import ta_lab as L


def _frames(n=520):
    """Three synthetic stocks over n sessions: a steady riser, a steady faller and a flat one, plus XU100."""
    idx = pd.bdate_range("2023-01-02", periods=n)
    t = np.arange(n)
    closes = {
        "UPP": 10 * np.exp(0.004 * t),
        "DWN": 50 * np.exp(-0.003 * t),
        "FLT": 20 + 0.2 * np.sin(t / 7.0),
        "XU100": 1000 * np.exp(0.0005 * t),
    }
    close = pd.DataFrame(closes, index=idx)
    high, low = close * 1.01, close * 0.99
    vol = pd.DataFrame(5_000_000.0, index=idx, columns=close.columns)
    return {"close_raw": close, "close": close.copy(), "open": close.shift(1).fillna(close), "high": high, "low": low, "volume": vol}


@pytest.fixture(scope="module")
def built():
    d = _frames()
    f = L._indicators(d)
    masks = L._signal_masks(f, d)
    return d, f, masks


def test_stage_and_template(built):
    _, f, _ = built
    last = f["stage"].index[-1]
    assert f["stage"].at[last, "UPP"] == 2
    assert f["stage"].at[last, "DWN"] == 4
    assert f["template"].at[last, "UPP"] == 8
    assert f["template"].at[last, "DWN"] <= 1


def test_indicators_ranges(built):
    _, f, _ = built
    last = f["rsi14"].index[-1]
    assert f["rsi14"].at[last, "UPP"] > 70
    assert f["rsi14"].at[last, "DWN"] < 30
    assert 0 <= f["adx"].at[last, "UPP"] <= 100
    assert f["plus_di"].at[last, "UPP"] > f["minus_di"].at[last, "UPP"]
    assert f["dist_hi52"].at[last, "UPP"] > -0.02
    assert f["rs_rating"].at[last, "UPP"] > f["rs_rating"].at[last, "DWN"]


def test_signals_follow_definitions(built):
    _, _, masks = built
    last = masks["stage2"].index[-1]
    assert masks["stage2"].at[last, "UPP"] and not masks["stage2"].at[last, "DWN"]
    assert masks["stage4"].at[last, "DWN"]
    assert masks["rsi_oversold"].at[last, "DWN"]
    assert masks["near_hi52"].at[last, "UPP"]
    # Event signals fire on the first day only.
    ev = masks["golden_cross"]["UPP"]
    assert ev.sum() <= 1


def test_levels_cluster_within_one_atr():
    hi = np.array([10, 11, 12, 11, 10, 11, 12.05, 11, 10, 9, 8, 9, 10, 9, 8.02, 9, 10], dtype=float)
    lo = hi - 0.5
    lv = L._levels(hi, lo, close=10.0, atr=0.5)
    res_prices = [x["price"] for x in lv["resistances"]]
    assert any(abs(p - 12.0) < 0.1 for p in res_prices)
    top = next(x for x in lv["resistances"] if abs(x["price"] - 12.0) < 0.1)
    assert top["touches"] >= 2  # 12.0 and 12.05 merged
    assert all(x["price"] < 10.0 for x in lv["supports"])


def test_verdict_thresholds():
    assert L._verdict(0.01, 3.5, 0.8)[0] == "guclu_pozitif"
    assert L._verdict(0.01, 2.2, 0.5)[0] == "pozitif"
    assert L._verdict(-0.01, -3.2, 0.2)[0] == "guclu_negatif"
    assert L._verdict(0.001, 0.5, 0.6)[0] == "notr"
    assert L._verdict(None, None, None)[0] == "veri_yok"


def test_signal_directions_from_training_data():
    rng = np.random.default_rng(0)
    dates = pd.bdate_range("2020-01-01", periods=320)
    rows = []
    for d in dates:
        for i in range(40):
            flag = i < 10
            rows.append((d, f"T{i}", 1.0 if flag else 0.0, (0.02 if flag else 0.0) + rng.normal(0, 0.01)))
    df = pd.DataFrame(rows, columns=["date", "ticker", "accumulation", "yw"]).set_index(["date", "ticker"])
    for k in L.SIG_KEYS:
        if k != "accumulation":
            df[k] = 0.0
    dirs = L._signal_directions(df)
    assert dirs["accumulation"] == 1
    assert dirs["stage4"] == 0


def test_groups_cover_every_input_once():
    keys = [k for _, _, ks in L.GROUPS for k in ks]
    assert sorted(keys) == sorted(L.X_COLS)


def _row(score, stage=2, liquid=True):
    return {"ticker": "TST", "score": score, "decile": min(10, int(score // 10) + 1), "expected_excess_20d": 0.01,
            "stage": stage, "template": 8, "rs_rating": 90, "liquid": liquid, "signals": [], "groups": [],
            "drivers_pos": [], "drivers_neg": [], "stop": 95.0, "rsi14": 60, "sma50": 90, "sma200": 80}


@pytest.mark.parametrize("score,stage,liquid,expected", [
    (95, 2, True, "GÜÇLÜ AL"),
    (95, 4, True, "KADEMELİ AL"),   # never a strong buy in a stage-4 decline
    (95, 2, False, "KADEMELİ AL"),  # illiquid names are capped
    (75, 2, True, "KADEMELİ AL"),
    (50, 3, True, "BEKLE / İZLE"),
    (10, 4, True, "RİSKLİ / SAT"),
])
def test_decision_bands(score, stage, liquid, expected):
    from services.conviction_engine import ConvictionEngine
    ce = ConvictionEngine(start_background=False)
    s = ce._evaluate_stock("TST", 100.0, 0.0, 0, [], {}, {}, [], "2026-10-02", ta_row=_row(score, stage, liquid), signal_meta={})
    assert s["decision"] == expected
    assert s["stop_loss"] < 100.0


def test_consensus_uses_latest_target_per_broker():
    from services.conviction_engine import ConvictionEngine
    ce = ConvictionEngine(start_background=False)
    recs = [
        {"broker": "A", "report_date": "2026-09-01", "target_price": 150},
        {"broker": "A", "report_date": "2026-03-01", "target_price": 300},  # superseded
        {"broker": "B", "report_date": "2026-09-10", "target_price": 130},
    ]
    ctx = ce._consensus(recs, 100.0, pd.Timestamp("2026-09-20").date())
    assert 130 <= ctx["consensus_target"] <= 150
    assert ctx["broker_count"] == 2
