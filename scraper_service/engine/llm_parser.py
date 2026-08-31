import datetime
import json
import logging
import os
import re
import uuid
from typing import Any, Dict, Optional

from cache_manager import CacheManager

logger = logging.getLogger(__name__)


def parse_turkish_float(val: Any) -> float:
    """
    Parse float values handling Turkish number formatting:
    Thousands separator: '.' (dot), e.g., 1.450,00 -> 1450.0
    Decimal separator: ',' (comma), e.g., 315,50 -> 315.5
    """
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).strip()
    if not val_str:
        return 0.0
    clean = re.sub(r"[^\d.,-]", "", val_str)
    if not clean:
        return 0.0

    if "." in clean and "," in clean:
        clean = clean.replace(".", "").replace(",", ".")
    elif "," in clean and "." not in clean:
        clean = clean.replace(",", ".")
    elif "." in clean and "," not in clean:
        parts = clean.split(".")
        if len(parts) > 2:
            clean = clean.replace(".", "")
        elif len(parts) == 2:
            if len(parts[1]) == 3 and parts[0] != "0" and len(parts[0]) >= 1 and not parts[0].startswith("-"):
                clean = clean.replace(".", "")
    try:
        return float(clean)
    except ValueError:
        return 0.0


class LLMParser:
    """
    LLM-based PDF text parser with structured JSON extraction.
    Features:
      - Prompt template loading (prompts/v1_research_extractor.txt)
      - Multi-backend PDF text extraction (pypdf, fitz, pdfplumber, pure stream parser)
      - LLM client call (OpenAI / Gemini / OpenAI-compatible API)
      - Heuristic fallback parser when API keys are omitted or API fails
      - Mandatory caching integration (CacheManager)
      - Prompt audit logging (logs/llm_audit.log)
    """

    PROMPT_ID = "v1_research_extractor"

    def __init__(
        self,
        prompt_path: Optional[str] = None,
        cache_manager: Optional[CacheManager] = None,
        log_path: Optional[str] = None,
    ):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.prompt_path = prompt_path or os.path.join(
            base_dir, "prompts", "v1_research_extractor.txt"
        )
        self.cache_manager = cache_manager or CacheManager()
        
        log_dir = os.path.join(base_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        self.log_path = log_path or os.path.join(log_dir, "llm_audit.log")

        self.prompt_template = self._load_prompt_template()

    def _load_prompt_template(self) -> str:
        if os.path.exists(self.prompt_path):
            try:
                with open(self.prompt_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                logger.error(f"Error loading prompt template {self.prompt_path}: {e}")
        return "Extract stock research report JSON. Ensure you support multiple stocks if mentioned. Format: {'summary': '...', 'catalysts': '...', 'stocks': [{'ticker': '...', 'broker': '...', 'rating': '...', 'target_price': float, 'current_price': float, 'potansiyel': float}]}. If no target price is found, omit it."

    def extract_pdf_text(self, pdf_path: str) -> str:
        """
        Extract raw text content from PDF file using available libraries with fallbacks.
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        extracted_text = ""

        # Strategy 1: Try pypdf
        try:
            import pypdf
            reader = pypdf.PdfReader(pdf_path)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
            if extracted_text.strip():
                return extracted_text.strip()
        except Exception:
            pass

        # Strategy 2: Try fitz (PyMuPDF)
        try:
            import fitz
            doc = fitz.open(pdf_path)
            for page in doc:
                text = page.get_text()
                if text:
                    extracted_text += text + "\n"
            if extracted_text.strip():
                return extracted_text.strip()
        except Exception:
            pass

        # Strategy 3: Try pdfplumber
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        extracted_text += text + "\n"
            if extracted_text.strip():
                return extracted_text.strip()
        except Exception:
            pass

        # Strategy 4: Fallback raw stream parser for plain text inside PDF streams
        try:
            with open(pdf_path, "rb") as f:
                content = f.read().decode("latin-1", errors="ignore")
                
            # Extract text enclosed in (text) Tj or BT ... ET blocks
            tj_matches = re.findall(r"\((.*?)\)\s*Tj", content, re.DOTALL)
            if tj_matches:
                cleaned = []
                for match in tj_matches:
                    clean_str = match.replace("\\(", "(").replace("\\)", ")").strip()
                    if clean_str:
                        cleaned.append(clean_str)
                extracted_text = "\n".join(cleaned)
            else:
                # Extract printable ASCII/UTF-8 words
                words = re.findall(r"[A-Za-z0-9ÇĞİÖŞÜçğıöşü%./:-]{2,}", content)
                extracted_text = " ".join(words)
        except Exception as e:
            logger.error(f"Raw PDF text extraction failed for {pdf_path}: {e}")

        return extracted_text.strip() or "Empty report text."

    def _heuristic_parse(self, text: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Rule-based heuristic parser for equity research text when LLM API is unavailable.
        """
        metadata = metadata or {}
        
        report_title = metadata.get("report_title", "")
        ticker = metadata.get("ticker", "")
        
        # 1. Ticker Extraction with expanded exclusion list
        if not ticker:
            search_source = f"{report_title}\n{text[:500]}" if report_title else text[:500]
            raw_matches = re.findall(r"\b[A-ZÇĞİÖŞÜ]{4,5}\b", search_source)
            exclude_words = {
                "BBVA", "DENIZ", "GARAN", "BULTEN", "RAPOR", "ARASTIRMA", "HAFTALIK", "GUNLUK",
                "GÜNLÜK", "BÜLTEN", "ARAŞTIRMA", "YATIRIM", "MODEL", "PORTFOY", "PORTFÖY",
                "HISSE", "HİSSE", "SIRKET", "ŞİRKET", "OZET", "ÖZET", "ANALIZ", "ANALİZ",
                "DEGER", "DEĞER", "HEDEF", "TÜRK", "TURK", "OCAK", "SUBAT", "ŞUBAT", "MART",
                "NISAN", "NİSAN", "MAYIS", "HAZIRAN", "HAZİRAN", "TEMMUZ", "AGUSTOS", "AĞUSTOS",
                "EYLUL", "EYLÜL", "EKIM", "EKİM", "KASIM", "ARALIK", "TARİH", "TARIH",
                "FİYAT", "FIYAT", "TUTAR", "SATIŞ", "SATIS", "BIST", "ENDEK", "ENDEKS",
                "FON", "YENI", "YENİ", "TAVSİYE", "TAVSIYE", "GETİRİ", "GETIRI", "SONUC", "SONUÇ"
            }
            valid_candidates = [m for m in raw_matches if m.upper() not in exclude_words]
            if valid_candidates:
                ticker = valid_candidates[0]

        # 2. Broker Extraction
        broker = metadata.get("broker", "")
        if not broker:
            if "garanti" in text.lower():
                broker = "Garanti BBVA"
            elif "deniz" in text.lower():
                broker = "Deniz Yatırım"
            elif "ak yatır" in text.lower():
                broker = "Ak Yatırım"
            elif "iş yatır" in text.lower():
                broker = "İş Yatırım"
            else:
                broker = "Araştırma Kurumu"

        # 3. Rating Extraction with strict case sensitivity and word boundaries
        rating = "AL"
        if re.search(r"\b(ENDEKSÜSTÜ GETİRİ|ENDEKSÜSTÜ|OUTPERFORM)\b", text):
            rating = "ENDEKSÜSTÜ GETİRİ"
        elif re.search(r"\b(AL|BUY)\b", text):
            rating = "AL"
        elif re.search(r"\b(TUT|HOLD|NEUTRAL|NÖTR|ENDEKSE PARALEL)\b", text):
            rating = "TUT"
        elif re.search(r"\b(SAT|SELL|UNDERPERFORM|ENDEKSİN ALTINDA)\b", text):
            rating = "SAT"
        elif re.search(r"ENDEKSÜSTÜ|OUTPERFORM", text, re.IGNORECASE):
            rating = "ENDEKSÜSTÜ GETİRİ"
        elif re.search(r"ENDEKSE PARALEL", text, re.IGNORECASE):
            rating = "TUT"
        elif re.search(r"ENDEKSİN ALTINDA", text, re.IGNORECASE):
            rating = "SAT"

        # 4. Target Price Extraction using parse_turkish_float
        target_price = 0.0
        tp_match = re.search(
            r"(?:Hedef Fiyat|Hedef|Target Price|TP)[^\d]*(\d+(?:[.,]\d+)*)",
            text,
            re.IGNORECASE,
        )
        if tp_match:
            target_price = parse_turkish_float(tp_match.group(1))

        # 5. Current Price Extraction using parse_turkish_float
        current_price = 0.0
        cp_match = re.search(
            r"(?:Mevcut Fiyat|Cari Fiyat|Son Fiyat|Current Price|CP)[^\d]*(\d+(?:[.,]\d+)*)",
            text,
            re.IGNORECASE,
        )
        if cp_match:
            current_price = parse_turkish_float(cp_match.group(1))

        # 6. Potansiyel Extraction using parse_turkish_float
        potansiyel = 0.0
        pot_match = re.search(
            r"(?:Getiri Potansiyeli|Potansiyel|Upside)[^\d%]*%?\s*([+-]?\d+(?:[.,]\d+)*)",
            text,
            re.IGNORECASE,
        )
        if pot_match:
            potansiyel = parse_turkish_float(pot_match.group(1))

        # Always recalculate if both prices exist
        if target_price > 0 and current_price > 0:
            potansiyel = round(((target_price - current_price) / current_price) * 100, 2)

        # 7. Date Extraction
        report_date = metadata.get("report_date", "")
        if not report_date:
            date_match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
            if date_match:
                report_date = date_match.group(1)
            else:
                date_match_tr = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", text)
                if date_match_tr:
                    d, m, y = date_match_tr.groups()
                    report_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
                else:
                    report_date = datetime.date.today().strftime("%Y-%m-%d")

        # 8. Summary Extraction
        summary = ""
        sum_match = re.search(r"Özet:\s*(.*?)(?=\n\n|\n[A-ZÇĞİÖŞÜA-Z]|Katalizörler:|$)", text, re.DOTALL | re.IGNORECASE)
        if sum_match:
            summary = sum_match.group(1).strip()
        else:
            lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 30]
            summary = " ".join(lines[:2]) if lines else f"{broker} {ticker} araştırma raporu ve hedef fiyat değerlendirmesi."

        # 9. Catalysts Extraction
        catalysts = ""
        cat_match = re.search(r"Katalizörler:\s*(.*?)(?=\n\n|$)", text, re.DOTALL | re.IGNORECASE)
        if cat_match:
            catalysts = cat_match.group(1).strip()
        else:
            catalysts = "Güçlü bilanço, artan operasyonel marjlar ve pazar payı büyümesi."

        return {
            "ticker": ticker,
            "broker": broker,
            "rating": rating,
            "target_price": target_price,
            "current_price": current_price,
            "potansiyel": potansiyel,
            "report_date": report_date,
            "summary": summary,
            "catalysts": catalysts,
            "stocks": [
                {
                    "ticker": ticker,
                    "rating": rating,
                    "target_price": target_price,
                    "current_price": current_price,
                    "potansiyel": potansiyel
                }
            ] if target_price > 0 else []
        }

    def _call_llm_api(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Call OpenAI / Gemini / OpenAI-compatible API if key is present.
        Returns parsed dict or None if key is omitted or call fails.
        """
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None

        try:
            import openai
            client = openai.OpenAI(api_key=api_key, base_url=os.getenv("OPENAI_BASE_URL"))
            max_chunk = 4000
            text_chunk = text[:max_chunk] if text else ""
            prompt_content = f"{self.prompt_template}\n\nReport Text:\n{text_chunk}"
            
            response = client.chat.completions.create(
                model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": self.prompt_template},
                    {"role": "user", "content": prompt_content},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            raw_result = response.choices[0].message.content
            if not raw_result:
                return None
            clean_json = raw_result.strip()
            if clean_json.startswith("```"):
                clean_json = re.sub(r"^```[a-z]*\n?", "", clean_json)
                clean_json = re.sub(r"\n?```$", "", clean_json)
            parsed = json.loads(clean_json)
            return parsed
        except Exception as e:
            logger.warning(f"LLM API call failed ({e}). Falling back to heuristic parser.")
            return None

    def log_audit(
        self,
        prompt_id: str,
        file_hash: str,
        input_tokens: int,
        output_tokens: int,
        status: str,
        cached: bool,
    ) -> None:
        """Log prompt usage, token metrics, and caching state to llm_audit.log."""
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        log_line = (
            f"[{timestamp}] PROMPT_ID={prompt_id} FILE_HASH={file_hash} "
            f"INPUT_TOKENS={input_tokens} OUTPUT_TOKENS={output_tokens} "
            f"CACHED={cached} STATUS={status}\n"
        )
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(log_line)
        except Exception as e:
            logger.error(f"Failed writing to audit log {self.log_path}: {e}")

    def parse_report(
        self, pdf_path: str, file_hash: str, metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Parse equity research PDF into structured report JSON object.
        Implements mandatory SHA-256 caching & audit logging.
        """
        metadata = metadata or {}

        # 1. Check Mandatory Cache
        cached_result = self.cache_manager.get(file_hash)
        if cached_result:
            logger.info(f"Cache HIT for PDF hash {file_hash}")
            self.log_audit(
                prompt_id=self.PROMPT_ID,
                file_hash=file_hash,
                input_tokens=0,
                output_tokens=0,
                status="CACHE_HIT",
                cached=True,
            )
            return cached_result

        logger.info(f"Cache MISS for PDF hash {file_hash}. Extracting and parsing text...")

        # 2. Extract PDF Text
        extracted_text = self.extract_pdf_text(pdf_path)

        # 3. Process with LLM API or Heuristic Fallback
        parsed_data = self._call_llm_api(extracted_text)
        if not parsed_data:
            parsed_data = self._heuristic_parse(extracted_text, metadata=metadata)

        # Calculate token metrics estimation
        input_tokens = len(extracted_text.split()) + len(self.prompt_template.split())
        output_tokens = len(str(parsed_data).split())

        # 4. Construct Final Response according to Contract
        report_id = f"report_{uuid.uuid4().hex[:12]}"
        
        target_price = parse_turkish_float(parsed_data.get("target_price", 0.0))
        current_price = parse_turkish_float(parsed_data.get("current_price", 0.0))
        potansiyel = parse_turkish_float(parsed_data.get("potansiyel", 0.0))
        
        # Always recalculate if both prices exist
        if target_price > 0 and current_price > 0:
            potansiyel = round(((target_price - current_price) / current_price) * 100, 2)

        title = str(metadata.get("report_title") or parsed_data.get("report_title") or f"{parsed_data.get('ticker', 'Report')} {parsed_data.get('broker', 'Research')} Raporu")

        final_report = {
            "id": report_id,
            "ticker": str(parsed_data.get("ticker", metadata.get("ticker", "UNKNOWN"))).upper(),
            "broker": str(parsed_data.get("broker", metadata.get("broker", "Unknown Broker"))),
            "rating": str(parsed_data.get("rating", "AL")),
            "target_price": target_price,
            "current_price": current_price,
            "potansiyel": potansiyel,
            "report_date": str(parsed_data.get("report_date", metadata.get("report_date", ""))),
            "report_title": title,
            "pdf_url": str(metadata.get("pdf_url", "")),
            "summary": str(parsed_data.get("summary", "")),
            "catalysts": str(parsed_data.get("catalysts", "")),
            "full_text": extracted_text[:1000],
            "stocks": parsed_data.get("stocks", []),
            "cached": False,
            "prompt_id": self.PROMPT_ID,
            "file_hash": file_hash,
        }

        # 5. Store in Mandatory Cache
        self.cache_manager.set(file_hash, final_report)

        # 6. Audit Logging
        self.log_audit(
            prompt_id=self.PROMPT_ID,
            file_hash=file_hash,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            status="SUCCESS",
            cached=False,
        )

        return final_report

