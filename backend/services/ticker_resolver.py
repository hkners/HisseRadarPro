"""
Ticker Resolver Service
Centralizes TICKER_MAP and match_ticker() logic used by multiple routers.
"""
import os
import re


TICKER_MAP = {
    # A
    "1000 Yatırımlar Holding": "YATAS",
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
    "Avrupakent GYO": "AVGYO",
    "Aygaz": "AYGAZ",
    # B
    "Besler Gıda": "BSRGZ",
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
    "Girişim Elektrik": "GEREL",
    "Grainturk": "GRTRK", "Graintürk": "GRTRK",
    "Gülermak": "GLRMK", "Gülermak Ağır Sanayi": "GLRMK",
    # H
    "Halkbank": "HALKB",
    "Hareket Proje Taşımacılık": "HRKET", "Hareket Proje Taşımacılığı": "HRKET",
    # I - İ
    "IC Enterra": "ICUGS",
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
    "Koza Altın": "KOZAL", "Koza Anadolu": "KOZAA", "Koza Altın İşletmeleri": "KOZAL",
    "Kuzey Boru": "KZBGY",
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
    "Rönesans Gayrimenkul": "RYGYO", "Rönesans Gayrimenkul Yatırım": "RYGYO",
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
    "Tapdi Oksijen": "TDGYO",
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
    "Yayla Agro Gıda": "YAYLA",
}


def load_bist_tickers(all_bist_file: str) -> list:
    """Load BIST ticker list from file and merge with TICKER_MAP values."""
    tickers = []
    try:
        with open(all_bist_file, "r", encoding="utf-8") as f:
            tickers = [line.strip() for line in f if line.strip()]
    except Exception as e:
        print("Warning: Could not load all_bist.txt, falling back to empty list.", e)

    for val in TICKER_MAP.values():
        if val not in tickers:
            tickers.append(val)
    return tickers


def match_ticker(name: str, bist_tickers: list) -> str | None:
    """Match a company name or ticker string to a canonical BIST ticker."""
    if not name:
        return None
    name_strip = name.strip()

    # Exact match in TICKER_MAP
    for k, v in TICKER_MAP.items():
        if k.lower() == name_strip.lower():
            return v

    # Substring match in TICKER_MAP
    for k, v in TICKER_MAP.items():
        if k.lower() in name_strip.lower():
            return v

    # Direct ticker match
    upper_name = name_strip.upper()
    if upper_name in bist_tickers:
        return upper_name

    # Short ticker heuristic
    if len(upper_name) <= 5 and upper_name.isupper() and upper_name.isalpha():
        if upper_name == "BİM" or upper_name == "BIM":
            return "BIMAS"
        if upper_name == "TOFAŞ" or upper_name == "TOFAS":
            return "TOASO"
        return upper_name

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
