"""
Export Router
Handles /api/export/xlsx — turns table data posted by the UI (screener, backtest, strategies,
portfolio) into an Excel workbook.
"""
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/export", tags=["export"])


class Column(BaseModel):
    key: str
    label: Optional[str] = None
    format: Optional[str] = None  # pct (fraction), pct100 (already in %), num, int


class Sheet(BaseModel):
    name: str
    columns: List[Column]
    rows: List[Dict[str, Any]] = Field(default_factory=list, max_length=20000)


class ExportRequest(BaseModel):
    filename: str = "hisseradar"
    title: str = ""
    sheets: List[Sheet] = Field(..., min_length=1, max_length=10)


@router.post("/xlsx")
def export_xlsx(req: ExportRequest):
    from services.excel_export import build_table_workbook
    data = build_table_workbook([s.model_dump() for s in req.sheets], title=req.title)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", req.filename).strip("-") or "hisseradar"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe}.xlsx"'},
    )
