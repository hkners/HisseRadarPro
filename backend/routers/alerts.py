"""
Alerts Router
Handles /api/alerts — alert rules and the events they fire.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertIn(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=12)
    kind: str
    params: Dict[str, Any] = {}
    note: str = Field("", max_length=200)
    repeat: bool = False


class AlertPatch(BaseModel):
    active: bool


class SeenIn(BaseModel):
    ids: Optional[List[int]] = None


@router.get("")
def get_alerts():
    from services.alerts import list_alerts, KINDS
    return {"alerts": list_alerts(), "kinds": KINDS}


@router.post("")
def add_alert(a: AlertIn):
    from globals import BIST_TICKERS
    from services.alerts import KINDS, SCOPES_ALLOWED, create_alert, evaluate_live, evaluate_signal_alerts
    kind = a.kind
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail="Bilinmeyen alarm türü.")
    scope = a.ticker.strip().upper().replace(".IS", "")
    scope_kind = scope if scope in ("PORTFOY", "*") else "ticker"
    if scope_kind not in SCOPES_ALLOWED[kind]:
        raise HTTPException(status_code=400, detail="Bu alarm türü seçilen kapsamla kullanılamaz.")
    if scope_kind == "ticker" and scope not in BIST_TICKERS:
        raise HTTPException(status_code=400, detail=f"{scope} BIST listesinde yok.")
    p = a.params or {}
    try:
        if kind in ("price_above", "price_below", "score_above", "score_below"):
            p = {"level": float(p["level"])}
            if p["level"] <= 0:
                raise ValueError
        elif kind in ("change_above", "change_below"):
            p = {"pct": abs(float(p["pct"]))}
        elif kind == "decision":
            if p.get("decision") not in ("GÜÇLÜ AL", "KADEMELİ AL", "BEKLE / İZLE", "RİSKLİ / SAT"):
                raise ValueError
            p = {"decision": p["decision"]}
        elif kind == "signal":
            from services.ta_lab import SIGNAL_BY_KEY
            if p.get("signal") not in SIGNAL_BY_KEY:
                raise ValueError
            p = {"signal": p["signal"]}
        else:
            p = {}
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Alarm parametresi geçersiz.")
    res = create_alert(scope, kind, p, a.note.strip(), a.repeat or scope in ("PORTFOY", "*"))
    # Check right away so a condition that already holds shows up without waiting a minute.
    try:
        evaluate_signal_alerts() if kind == "signal" else evaluate_live()
    except Exception:
        pass
    return res


@router.patch("/{alert_id}")
def patch_alert(alert_id: str, body: AlertPatch):
    from services.alerts import update_alert
    if not update_alert(alert_id, body.active):
        raise HTTPException(status_code=404, detail="Alarm bulunamadı.")
    return {"status": "success"}


@router.delete("/{alert_id}")
def remove_alert(alert_id: str):
    from services.alerts import delete_alert
    if not delete_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alarm bulunamadı.")
    return {"status": "success"}


@router.get("/events/list")
def get_events(limit: int = 50, unseen_only: bool = False):
    from services.alerts import list_events
    return list_events(min(max(limit, 1), 200), unseen_only)


@router.post("/events/seen")
def post_seen(body: SeenIn):
    from services.alerts import mark_seen
    return {"updated": mark_seen(body.ids)}
