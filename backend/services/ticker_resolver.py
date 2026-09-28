"""
Ticker Resolver Service
Centralizes TICKER_MAP and match_ticker() logic used by multiple routers.
"""
import os
import re


TICKER_MAP = {
    # A
    "1000 Yatırımlar Holding": "BINHO",
    "Agesa": "AGESA", "Agesa Hayat Emeklilik": "AGESA",
    "Akbank": "AKBNK",
    "Akçansa": "AKCNS",
    "Aksa Akrilik": "AKSA", "Aksa Enerji": "AKSEN",
    "Aksigorta": "AKGRT",
    "Alarko GYO": "ALGYO", "Alarko Holding": "ALARK",
    "Anadolu Grubu Holding": "AGHOL", "Anadolu Hayat Emeklilik": "ANHYT",
    "Anadolu Sigorta": "ANSGR",
    "Arçelik": "ARCLK",
    "ASELSAN": "ASELS", "Aselsan": "ASELS",
    "Astor Enerji": "ASTOR",
    "Avrupakent GYO": "AVPGY",
    "Aygaz": "AYGAZ",
    # B
    "Besler Gıda": "BESLR",
    "Bor Şeker": "BORSK",
    "Büyük Şefler Gıda": "BIGCH",
    "BİM": "BIMAS", "BIM": "BIMAS",
    # C
    "CW Enerji": "CWENE",
    "Coca Cola İçecek": "CCOLA", "Coca-Cola İçecek": "CCOLA",
    # Ç
    "Çimsa": "CIMSA",
    # D
    "Doğan Holding": "DOHOL",
    "Doğuş Otomotiv": "DOAS",
    # E
    "Emlak Konut GYO": "EKGYO",
    "Enerjisa": "ENJSA", "Enerjisa Enerji": "ENJSA",
    "Enerya": "ENERY", "Enerya Enerji": "ENERY",
    "Enka": "ENKAI", "Enka İnşaat": "ENKAI",
    "Ereğli": "EREGL", "Erdemir": "EREGL", "Ereğli Demir Çelik": "EREGL",
    "Europower": "EUPWR", "Europower Eneri": "EUPWR", "Europower Enerji": "EUPWR",
    # F
    "Ford Otomotiv": "FROTO", "Ford Otosan": "FROTO",
    # G
    "Galata Wind": "GWIND",
    "Garanti BBVA": "GARAN", "Garanti Bankası": "GARAN", "Türkiye Garanti Bankası": "GARAN",
    "Gediz Ambalaj": "GEDZA",
    "Gelecek Varlık Yönetimi": "GLCVY",
    "Girişim Elektrik": "GESAN",
    "Grainturk": "GRTHO", "Graintürk": "GRTHO", "Graintürk Holding": "GRTHO",
    "Gülermak": "GLRMK", "Gülermak Ağır Sanayi": "GLRMK",
    # H
    "Halkbank": "HALKB",
    "Hareket Proje Taşımacılık": "HRKET", "Hareket Proje Taşımacılığı": "HRKET",
    # I - İ
    "IC Enterra": "ENTRA",
    "İş Bankası": "ISCTR", "İ Bankası": "ISCTR", "Türkiye İş Bankası": "ISCTR",
    "Türkiye İ Bankası": "ISCTR", "Türkiye İ Bankası (C)": "ISCTR",
    "İş GYO": "ISGYO", "İ GYO": "ISGYO",
    "İsdemir": "ISDMR",
    "İndeks Bilgisayar": "INDES",
    # K
    "Kalekim": "KLKIM",
    "Kardemir D": "KRDMD", "Kardemir": "KRDMD",
    "Kimteks Poliüretan": "KMPUR",
    "Kordsa": "KORDS",
    "Koton": "KOTON", "Koton Mağazacılık": "KOTON",
    "Koç Holding": "KCHOL",
    "Koza Altın": "TRALT", "Koza Altın İşletmeleri": "TRALT", "Türk Altın": "TRALT", "Türk Altın İşletmeleri": "TRALT",
    "Koza Anadolu": "TRMET", "TR Anadolu Metal": "TRMET", "TR Anadolu Metal Madencilik": "TRMET",
    "Kuzey Boru": "KBORU",
    # L
    "Lila Kağıt": "LILAK",
    "Logo Yazılım": "LOGO",
    "Lokman Hekim": "LKMNH",
    # M
    "MLP Sağlık": "MPARK", "Medical Park": "MPARK",
    "Mavi": "MAVI", "Mavi Giyim": "MAVI",
    "Migros": "MGROS",
    # O
    "Oncosem": "ONCSM",
    "Otokar": "OTKAR",
    "OYAK Çimento": "OYAKC", "Oyak Çimento": "OYAKC",
    # P
    "Pegasus": "PGSUS", "Pegasus Hava Taşımacılığı": "PGSUS", "Pegasus Hava Taşımacılık": "PGSUS",
    # R
    "Rönesans Gayrimenkul": "RGYAS", "Rönesans Gayrimenkul Yatırım": "RGYAS",
    # S
    "Sabancı Holding": "SAHOL",
    "Selçuk Ecza Deposu": "SELEC",
    "Smart Güneş Enerjisi": "SMRTG",
    # Ş
    "ŞOK Marketler": "SOKM", "Şok Marketler": "SOKM",
    "Şişecam": "SISE",
    # T
    "TAB Gıda": "TABGD", "Tab Gıda": "TABGD",
    "TAV Holding": "TAVHL", "TAV Havalimanları": "TAVHL", "TAV Havalimanları Holding": "TAVHL", "Tav Havalimanları": "TAVHL",
    "Tapdi Oksijen": "TNZTP",
    "Teknosa": "TKNSA",
    "Telekomunikasyon Sektörü": "TCELL",
    "Tofaş": "TOASO", "TOFAŞ": "TOASO",
    "Torunlar GYO": "TRGYO",
    "TSKB": "TSKB",
    "Turkcell": "TCELL",
    "Tüpraş": "TUPRS",
    "Türk Hava Yolları": "THYAO",
    "Türk Telekom": "TTKOM",
    "Türk Traktör": "TTRAK", "Türk Traktör ve Ziraat Makineleri": "TTRAK",
    "Türkiye Sigorta": "TURSG",
    "Türkiye Vakıflar Bankası": "VAKBN",
    # U - Ü
    "Ülker": "ULKER",
    # V
    "VakıfBank": "VAKBN", "Vakıfbank": "VAKBN",
    "Vestel Beyaz Eşya": "VESBE",
    # Y
    "YEO Teknoloji": "YEOTK",
    "Yapı Kredi Bankası": "YKBNK", "Yapı ve Kredi Bankası": "YKBNK",
    "Yayla Agro Gıda": "YYLGD",
}

# Ticker Aliases: Maps historical or renamed tickers to their active canonical symbol
ALIAS_MAP = {
    "KOZAL": "TRALT",
    "KOZAA": "TRMET",
    "GRTRK": "GRTHO",
    "BSRGZ": "BESLR",
}


def load_bist_tickers(all_bist_file: str) -> list:
    """Load BIST ticker list from file and merge with TICKER_MAP values, resolving aliases."""
    tickers = []
    try:
        with open(all_bist_file, "r", encoding="utf-8") as f:
            for line in f:
                sym = line.strip().upper()
                if sym:
                    canonical = ALIAS_MAP.get(sym, sym)
                    if canonical not in tickers:
                        tickers.append(canonical)
    except Exception as e:
        print("Warning: Could not load all_bist.txt, falling back to empty list.", e)

    for val in TICKER_MAP.values():
        canonical = ALIAS_MAP.get(val, val)
        if canonical not in tickers:
            tickers.append(canonical)
    return tickers


# Pre-computed O(1) lookup dict: lowercase company name -> ticker
_TICKER_LOOKUP = {k.lower(): v for k, v in TICKER_MAP.items()}
# Pre-computed set of all known ticker symbols (uppercase) for fast membership test
_TICKER_SET = None


def _get_ticker_set(bist_tickers: list) -> set:
    """Lazily build a set of all known tickers for O(1) membership checks."""
    global _TICKER_SET
    if _TICKER_SET is None:
        _TICKER_SET = set(bist_tickers)
    return _TICKER_SET


def match_ticker(name: str, bist_tickers: list) -> str | None:
    """Match a company name or ticker string to a canonical BIST ticker.
    Uses O(1) dict lookup instead of O(n) iteration over TICKER_MAP.
    Resolves known ticker aliases (e.g. KOZAL -> TRALT) to canonical symbols.
    """
    if not name:
        return None
    name_strip = name.strip()

    # 0. Direct check in ALIAS_MAP
    upper_name = name_strip.upper()
    if upper_name in ALIAS_MAP:
        return ALIAS_MAP[upper_name]

    # 1. O(1) exact match in pre-computed lowercase lookup
    result = _TICKER_LOOKUP.get(name_strip.lower())
    if result:
        return ALIAS_MAP.get(result, result)

    # 2. Direct ticker match via set (O(1))
    ticker_set = _get_ticker_set(bist_tickers)
    if upper_name in ticker_set:
        return ALIAS_MAP.get(upper_name, upper_name)

    # 3. Short ticker heuristic (rare fallback)
    if len(upper_name) <= 5 and upper_name.isalpha():
        if upper_name in ("BİM", "BIM"):
            return "BIMAS"
        if upper_name in ("TOFAŞ", "TOFAS"):
            return "TOASO"
        return ALIAS_MAP.get(upper_name, upper_name)

    # 4. Substring match (slow path, only for fuzzy names — rare)
    name_lower = name_strip.lower()
    for k, v in TICKER_MAP.items():
        if k.lower() in name_lower:
            return ALIAS_MAP.get(v, v)

    return None


def parse_rating(text: str) -> str:
    """
    Centralized rating parser. Extracts AL/TUT/SAT from a string.
    Used by kurum-stats, screener, consensus, and LLM parser.
    """
    if not text:
        return "OTHER"
    pot_str = str(text).upper()

    if "END" in pot_str and ("ÜZER" in pot_str or "UZER" in pot_str):
        return "AL"
    if "END" in pot_str and "PARALEL" in pot_str:
        return "TUT"
    if "END" in pot_str and "ALT" in pot_str:
        return "SAT"
    if "AL" in pot_str:
        return "AL"
    if "TUT" in pot_str:
        return "TUT"
    if "SAT" in pot_str:
        return "SAT"
    return "OTHER"
