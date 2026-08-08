# Empirical Schema & Contract Validation Report

**Target Output File**: `backend/scrapers/scraped_reports.json`  
**Validator Script**: `.agents/teamwork_preview_challenger_m2m3_2/test_contract.py`  
**Verdict**: **PASS** (100% Schema & Contract Compliance)

---

## 1. Executive Summary

Empirical schema and contract validation was performed on the research report scraper network output (`backend/scrapers/scraped_reports.json`). All 13 mandatory fields required by `PROJECT.md` (`Parser -> Backend/UI Contract`) were verified for structural completeness, correct Python/JSON data typing, non-emptiness, logical consistency, and SHA-256 format compliance.

---

## 2. Field-by-Field Validation Matrix

| Field | Required Type | Sample Value | Validated Criteria | Status |
|---|---|---|---|---|
| `id` | `str` | `"report_c71c67fe3581"` | Non-empty string, unique per report record | **PASS** |
| `ticker` | `str` | `"THYAO"` | Alphanumeric uppercase string (e.g. THYAO, GARAN, ASELS, AKBNK) | **PASS** |
| `broker` | `str` | `"Garanti BBVA"` | Non-empty string brokerage name | **PASS** |
| `rating` | `str` | `"AL"` | Non-empty rating classification string | **PASS** |
| `target_price` | `float` | `450.0` | Numeric float, non-negative value | **PASS** |
| `current_price` | `float` | `315.5` | Numeric float, non-negative value | **PASS** |
| `potansiyel` | `float` | `42.6` | Numeric float, matches `((target_price - current_price) / current_price) * 100` | **PASS** |
| `report_date` | `str` | `"2026-08-01"` | ISO format date string (`YYYY-MM-DD`) | **PASS** |
| `summary` | `str` | `"GARANTİ BBVA YATIRIM..."` | Non-empty text summary | **PASS** |
| `full_text` | `str` | `"GARANTİ BBVA YATIRIM..."` | Non-empty PDF extracted text | **PASS** |
| `cached` | `bool` | `true` | Boolean (`True` or `False`) | **PASS** |
| `prompt_id` | `str` | `"v1_research_extractor"` | Exact string match with `PROMPT_ID` contract | **PASS** |
| `file_hash` | `str` | `"sha256:2245741..."` | String starting with `sha256:` followed by 64 hex characters | **PASS** |

---

## 3. Empirical Test Oracle Output

The test oracle script `test_contract.py` was executed directly against `backend/scrapers/scraped_reports.json`.

```text
--- Running Empirical Contract & Schema Validation on backend/scrapers/scraped_reports.json ---
Loaded 4 scraped reports.

ALL CONTRACT & SCHEMA CHECKS PASSED SUCCESSFULLY!
```

- Total Reports Scraped & Parsed: **4**
- Missing Fields Detected: **0**
- Null Values Detected: **0**
- Type Mismatches Detected: **0**
- Calculation Discrepancies: **0**

---

## 4. Logical & Stress Harness Verification

1. **Potential Return (`potansiyel`) Verification**:
   - THYAO: Target = 450.0, Current = 315.5, Potansiyel = 42.6% (Calculated: 42.63%) -> Verified.
   - GARAN: Target = 160.0, Current = 112.0, Potansiyel = 42.86% (Calculated: 42.86%) -> Verified.
   - ASELS: Target = 95.0, Current = 64.5, Potansiyel = 47.29% (Calculated: 47.29%) -> Verified.
   - AKBNK: Target = 75.0, Current = 62.0, Potansiyel = 20.97% (Calculated: 20.97%) -> Verified.

2. **Caching & Audit Log Verification**:
   - `backend/scrapers/cache/llm_cache.json` populated with SHA-256 keyed report payloads.
   - `backend/scrapers/logs/llm_audit.log` records audit trails with `PROMPT_ID=v1_research_extractor`, token usage, SHA-256 file hashes, and `CACHED=True/False` flags.

---

## 5. Conclusion & Recommendation

The scraped report JSON structure strictly satisfies the `Parser -> Backend/UI Contract` specified in `PROJECT.md`. The output is ready for downstream consumption by backend storage and API endpoints (Milestone 4).
