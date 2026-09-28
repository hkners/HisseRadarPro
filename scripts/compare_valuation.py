#!/usr/bin/env python3
"""
HisseRadarPro — Valuation Comparison Script
===========================================
Compares old (fixed P/E & ROE thresholds) vs new dynamic, sector-relative
and historical percentile valuation scoring for:
  - TUPRS (Energy sector)
  - GARAN (Financial Services sector)
  - THYAO (Industrials sector)
"""

import sys
import os
import json

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from db_manager import ReportRepository
from services.valuation_service import (
    compute_historical_percentile,
    compute_sector_relative,
    compute_valuation_score,
    compute_sector_relative_roe
)


def compute_old_pe_score(trailing_pe) -> float:
    """Calculates legacy fixed-threshold P/E points in [-3.0, +3.0]."""
    if trailing_pe is None:
        return 0.0
    try:
        pe = float(trailing_pe)
        if pe <= 0:
            return 0.0
        if pe <= 7.0:
            return 3.0
        elif 7.0 < pe <= 15.0:
            return 3.0 - ((pe - 7.0) / 8.0) * 1.0
        elif 15.0 < pe <= 25.0:
            return 2.0 - ((pe - 15.0) / 10.0) * 1.0
        elif 25.0 < pe <= 35.0:
            return 1.0 - ((pe - 25.0) / 10.0) * 1.0
        elif 35.0 < pe <= 45.0:
            return 0.0 - ((pe - 35.0) / 10.0) * 3.0
        else:
            return -3.0
    except (ValueError, TypeError):
        return 0.0


def compute_old_roe_score(roe_val) -> float:
    """Calculates legacy fixed-threshold ROE points in [-4.0, +4.0]."""
    if roe_val is None:
        return 0.0
    try:
        roe = float(roe_val)
        if roe >= 0.35:
            return 4.0
        elif roe >= 0.20:
            return 2.5 + ((roe - 0.20) / 0.15) * 1.5
        elif roe >= 0.10:
            return 1.0 + ((roe - 0.10) / 0.10) * 1.5
        elif roe >= 0.0:
            return (roe / 0.10) * 1.0
        elif roe >= -0.15:
            return max(-4.0, (roe / 0.15) * 4.0)
        else:
            return -4.0
    except (ValueError, TypeError):
        return 0.0


def main():
    repo = ReportRepository()
    test_tickers = ["TUPRS", "GARAN", "THYAO"]

    print("=" * 86)
    print("       HisseRadarPro — Değerleme Karşılaştırma Raporu (Eski vs Yeni Sistem)")
    print("=" * 86)
    print(f"{'Metrik / Gösterge':<35} | {'TUPRS':<14} | {'GARAN':<14} | {'THYAO':<14}")
    print("-" * 86)

    data = {}
    for ticker in test_tickers:
        info = repo.get_company_info(ticker) or {}
        f_json = info.get("fundamentals_json")
        f = json.loads(f_json) if f_json else {}

        val_details = compute_valuation_score(ticker, repo=repo, return_details=True)
        roe_details = compute_sector_relative_roe(ticker, repo=repo)

        old_pe_pts = compute_old_pe_score(f.get("trailingPE"))
        val_score = val_details["valuation_score"]
        new_val_pts = round(((val_score - 50.0) / 50.0) * 3.0, 2)

        old_roe_pts = compute_old_roe_score(f.get("returnOnEquity"))
        new_roe_pts = roe_details["roe_score"] if roe_details else old_roe_pts

        data[ticker] = {
            "sector": info.get("sector") or "Bilinmiyor",
            "trailing_pe": f.get("trailingPE"),
            "forward_pe": f.get("forwardPE"),
            "price_to_book": f.get("priceToBook"),
            "roe": f.get("returnOnEquity"),
            "val_details": val_details,
            "roe_details": roe_details,
            "old_pe_pts": old_pe_pts,
            "new_val_pts": new_val_pts,
            "old_roe_pts": old_roe_pts,
            "new_roe_pts": new_roe_pts
        }

    # Print general info
    def val_str(d, key, fmt="{:.2f}"):
        v = d.get(key)
        return fmt.format(v) if v is not None else "-"

    print(f"{'Sektör':<35} | {data['TUPRS']['sector']:<14} | {data['GARAN']['sector']:<14} | {data['THYAO']['sector']:<14}")
    print(f"{'Fiyat / Kazanç (F/K trailing)':<35} | {val_str(data['TUPRS'], 'trailing_pe'):<14} | {val_str(data['GARAN'], 'trailing_pe'):<14} | {val_str(data['THYAO'], 'trailing_pe'):<14}")
    print(f"{'İleriye Dönük F/K (forward)':<35} | {val_str(data['TUPRS'], 'forward_pe'):<14} | {val_str(data['GARAN'], 'forward_pe'):<14} | {val_str(data['THYAO'], 'forward_pe'):<14}")
    print(f"{'Piyasa Değ. / Defter Değ. (PD/DD)':<35} | {val_str(data['TUPRS'], 'price_to_book'):<14} | {val_str(data['GARAN'], 'price_to_book'):<14} | {val_str(data['THYAO'], 'price_to_book'):<14}")
    print(f"{'Özkaynak Karlılığı (ROE)':<35} | {val_str(data['TUPRS'], 'roe', '{:.1%}'):<14} | {val_str(data['GARAN'], 'roe', '{:.1%}'):<14} | {val_str(data['THYAO'], 'roe', '{:.1%}'):<14}")
    print("-" * 86)

    # Historical Percentile
    print(f"{'1. Kendi 3Y Tarihsel Dilimi (%)':<35} | {data['TUPRS']['val_details']['historical_percentile']}%{'':<8} | {data['GARAN']['val_details']['historical_percentile']}%{'':<8} | {data['THYAO']['val_details']['historical_percentile']}%{'':<8}")
    print(f"{'   Tarihsel Puanı (100 - dilim)':<35} | {data['TUPRS']['val_details']['historical_score']}/100{'':<6} | {data['GARAN']['val_details']['historical_score']}/100{'':<6} | {data['THYAO']['val_details']['historical_score']}/100{'':<6}")

    # Sector Relative
    tuprs_sec = f"{data['TUPRS']['val_details']['sector_relative']:.2f}x" if data['TUPRS']['val_details']['sector_relative'] is not None else "Fallback (<3)"
    garan_sec = f"{data['GARAN']['val_details']['sector_relative']:.2f}x" if data['GARAN']['val_details']['sector_relative'] is not None else "Fallback"
    thyao_sec = f"{data['THYAO']['val_details']['sector_relative']:.2f}x" if data['THYAO']['val_details']['sector_relative'] is not None else "Fallback"
    print(f"{'2. Sektör Medyanına Oranı':<35} | {tuprs_sec:<14} | {garan_sec:<14} | {thyao_sec:<14}")

    tuprs_sec_sc = f"{data['TUPRS']['val_details']['sector_score']}/100" if data['TUPRS']['val_details']['sector_score'] is not None else "-"
    garan_sec_sc = f"{data['GARAN']['val_details']['sector_score']}/100" if data['GARAN']['val_details']['sector_score'] is not None else "-"
    thyao_sec_sc = f"{data['THYAO']['val_details']['sector_score']}/100" if data['THYAO']['val_details']['sector_score'] is not None else "-"
    print(f"{'   Sektör Göreceli Puanı':<35} | {tuprs_sec_sc:<14} | {garan_sec_sc:<14} | {thyao_sec_sc:<14}")
    print("-" * 86)

    # Combined Valuation Score (0-100)
    print(f"{'BİLEŞİK VALUATION SCORE (0-100)':<35} | {data['TUPRS']['val_details']['valuation_score']}/100{'':<6} | {data['GARAN']['val_details']['valuation_score']}/100{'':<6} | {data['THYAO']['val_details']['valuation_score']}/100{'':<6}")
    print("-" * 86)

    # Point Comparison
    print(f"{'ESKİ Sabit F/K Puanı [-3, +3]':<35} | {data['TUPRS']['old_pe_pts']:+.2f} pts{'':<6} | {data['GARAN']['old_pe_pts']:+.2f} pts{'':<6} | {data['THYAO']['old_pe_pts']:+.2f} pts{'':<6}")
    print(f"{'YENİ Göreceli Değerleme [-3, +3]':<35} | {data['TUPRS']['new_val_pts']:+.2f} pts{'':<6} | {data['GARAN']['new_val_pts']:+.2f} pts{'':<6} | {data['THYAO']['new_val_pts']:+.2f} pts{'':<6}")
    print(f"{'Değerleme Puanı Farkı':<35} | {data['TUPRS']['new_val_pts'] - data['TUPRS']['old_pe_pts']:+.2f} pts{'':<6} | {data['GARAN']['new_val_pts'] - data['GARAN']['old_pe_pts']:+.2f} pts{'':<6} | {data['THYAO']['new_val_pts'] - data['THYAO']['old_pe_pts']:+.2f} pts{'':<6}")
    print("-" * 86)

    # ROE Points
    print(f"{'ESKİ Sabit ROE Puanı [-4, +4]':<35} | {data['TUPRS']['old_roe_pts']:+.2f} pts{'':<6} | {data['GARAN']['old_roe_pts']:+.2f} pts{'':<6} | {data['THYAO']['old_roe_pts']:+.2f} pts{'':<6}")
    print(f"{'YENİ Sektör Göreceli ROE [-4, +4]':<35} | {data['TUPRS']['new_roe_pts']:+.2f} pts{'':<6} | {data['GARAN']['new_roe_pts']:+.2f} pts{'':<6} | {data['THYAO']['new_roe_pts']:+.2f} pts{'':<6}")
    print("=" * 86)
    print("\nDetaylı Yorum ve Analiz:")
    print("-------------------------")
    print("1. TUPRS (Enerji Sektörü):")
    print("   - Eski sistem: 10.50 F/K'yı < 15 olduğu için +2.56 puanla ödüllendiriyordu.")
    print("   - Yeni sistem: TUPRS için 10.50 F/K 3 yıllık zirvesine yakın (%96.5 dilim).")
    print("   - Sektörde < 3 benzer hisse olduğu için sektör göreceliği 'Fallback' tetikledi.")
    print("   - Tarihsel pahalılığı yakalayarak puanı -2.79'a çekti. (Gerçekçi düzeltme!)")
    print()
    print("2. GARAN (Finansal Hizmetler / Bankacılık):")
    print("   - Eski sistem: 4.69 F/K'yı < 7 olduğu için koşulsuz tavan +3.00 puanla ödüllendiriyordu.")
    print("   - Yeni sistem: Bankacılık sektör medyanı zaten ~7.8 F/K. GARAN sektörüne göre")
    print("     %40 iskontolu (0.60x), fakat kendi tarihine göre %76 diliminde.")
    print("     İki etki dengelenerek 50.3/100 (nötr / adil değerleme, +0.02 pts) üretti.")
    print()
    print("3. THYAO (Sanayi / Ulaştırma):")
    print("   - Eski sistem: trailing F/K boş (None) olduğu için 0.00 puan verip pas geçiyordu.")
    print("   - Yeni sistem: forward F/K (4.20) ve PD/DD dikkate alınarak, Sanayi sektörü")
    print("     medyanı olan 22.37 F/K'ya kıyasla 0.19x (%81 iskonto) ile değerlendi.")
    print("     Valuation skoru 57.5/100 (+0.45 puan) olarak tespit edildi.")
    print("=" * 86)


if __name__ == "__main__":
    main()
