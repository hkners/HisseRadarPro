"""
HisseRadarPro — Portfolio CSV import
====================================
Parses broker statement / spreadsheet exports into portfolio transactions.
Tolerant of what Turkish exports look like in practice:
- delimiter ';', ',' or tab (sniffed),
- Turkish or English headers ("Hisse"/"Sembol"/"Kod", "Adet"/"Lot"/"Miktar", "Maliyet"/"Fiyat", ...),
- Turkish number format ("1.234,56") as well as "1234.56",
- side column values AL/ALIŞ/BUY and SAT/SATIŞ/SELL (missing side means BUY),
- dates as YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY or DD-MM-YYYY (missing date means today).
Every row comes back with a status so the UI can show a preview before anything is written.
"""

import csv
import datetime
import io
import re
from typing import Any, Dict, List, Optional, Set

HEADER_ALIASES = {
    "ticker": {"hisse", "hissekodu", "sembol", "kod", "menkul", "menkulkiymet", "ticker", "symbol", "varlik", "enstruman", "pay"},
    "quantity": {"adet", "miktar", "lot", "nominal", "quantity", "qty", "shares", "adetlot", "pozisyon"},
    "price": {"fiyat", "maliyet", "ortalamamaliyet", "ortmaliyet", "alisfiyati", "islemfiyati", "birimfiyat", "price", "cost", "avgcost", "averagecost"},
    "date": {"tarih", "islemtarihi", "date", "tradedate"},
    "side": {"islem", "islemtipi", "islemturu", "tip", "yon", "alsat", "side", "type", "action"},
}
BUY_WORDS = {"AL", "ALIS", "ALIM", "BUY", "B"}
SELL_WORDS = {"SAT", "SATIS", "SATIM", "SELL", "S"}


def _fold(s: str) -> str:
    s = (s or "").strip().lower()
    for a, b in (("ı", "i"), ("İ", "i"), ("ş", "s"), ("ğ", "g"), ("ü", "u"), ("ö", "o"), ("ç", "c"), ("i̇", "i")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]", "", s)


def _fold_upper(s: str) -> str:
    return _fold(s).upper()


def parse_number(raw: str, kind: str) -> Optional[float]:
    """kind: 'quantity' or 'price'. Handles '1.234,56', '1,234.56', '1234,5', '45.68', '1.500' (lot)."""
    s = (raw or "").strip().replace(" ", "").replace(" ", "").replace("TL", "").replace("₺", "")
    if not s:
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        if kind == "quantity" and re.fullmatch(r"\d{1,3}(,\d{3})+", s):
            s = s.replace(",", "")  # BIST share counts are whole numbers: "1,250" is 1250
        else:
            s = s.replace(",", ".") if s.count(",") == 1 else s.replace(",", "")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    elif kind == "quantity" and re.fullmatch(r"\d{1,3}\.\d{3}", s):
        s = s.replace(".", "")  # "1.500" lot in Turkish exports means 1500
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(raw: str) -> Optional[str]:
    s = (raw or "").strip().split(" ")[0]
    if not s:
        return datetime.date.today().isoformat()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%y"):
        try:
            return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _map_headers(headers: List[str]) -> Dict[str, int]:
    mapping: Dict[str, int] = {}
    for idx, h in enumerate(headers):
        key = _fold(h)
        for field, aliases in HEADER_ALIASES.items():
            if field not in mapping and (key in aliases or any(key.startswith(a) for a in aliases if len(a) > 3)):
                mapping[field] = idx
                break
    return mapping


def parse_csv(content: str, known_tickers: Set[str]) -> Dict[str, Any]:
    text = content.lstrip("﻿").strip()
    if not text:
        return {"rows": [], "errors": ["Dosya boş."], "columns": {}}

    sample = text[:4000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","

    reader = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not reader:
        return {"rows": [], "errors": ["Satır bulunamadı."], "columns": {}}

    mapping = _map_headers(reader[0])
    missing = [f for f in ("ticker", "quantity", "price") if f not in mapping]
    if missing:
        names = {"ticker": "hisse kodu", "quantity": "adet", "price": "fiyat / maliyet"}
        return {
            "rows": [],
            "errors": [f"Başlık satırında şu sütunlar bulunamadı: {', '.join(names[m] for m in missing)}. "
                       f"Bulunan başlıklar: {', '.join(reader[0])}"],
            "columns": {k: reader[0][v] for k, v in mapping.items()},
        }

    rows: List[Dict[str, Any]] = []
    for line_no, cells in enumerate(reader[1:], start=2):
        if not any(c.strip() for c in cells):
            continue
        get = lambda f: cells[mapping[f]] if f in mapping and mapping[f] < len(cells) else ""
        ticker = re.sub(r"\.IS$", "", get("ticker").strip().upper())
        qty = parse_number(get("quantity"), "quantity")
        price = parse_number(get("price"), "price")
        date = parse_date(get("date"))
        side_raw = _fold_upper(get("side"))
        side = "SELL" if side_raw in SELL_WORDS else "BUY" if (side_raw in BUY_WORDS or not side_raw) else None

        problems = []
        if not ticker:
            problems.append("hisse kodu boş")
        elif known_tickers and ticker not in known_tickers:
            problems.append(f"{ticker} BIST listesinde yok")
        if qty is None or qty <= 0:
            problems.append("adet okunamadı")
        if price is None or price <= 0:
            problems.append("fiyat okunamadı")
        if date is None:
            problems.append("tarih okunamadı")
        if side is None:
            problems.append(f"işlem yönü anlaşılamadı ({get('side')})")

        rows.append({
            "line": line_no,
            "ticker": ticker,
            "tx_type": side or "BUY",
            "quantity": qty,
            "price": price,
            "tx_date": date,
            "ok": not problems,
            "message": "; ".join(problems),
        })

    return {
        "rows": rows,
        "errors": [],
        "delimiter": {";": "noktalı virgül", ",": "virgül", "\t": "sekme"}.get(delimiter, delimiter),
        "columns": {k: reader[0][v] for k, v in mapping.items()},
    }
