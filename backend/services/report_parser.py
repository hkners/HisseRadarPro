import re

def parse_turkish_price(price_str: str) -> float:
    """
    Parses a price string considering Turkish formats.
    Examples: 
      "1.500,50" -> 1500.5
      "162.00" -> 162.0
      "162,00" -> 162.0
      "11.520" -> 11520.0
      "16.200,00" -> 16200.0
    """
    if not price_str:
        return 0.0
        
    s = str(price_str).strip()
    # Remove everything except digits, comma, dot
    s = re.sub(r'[^\d,\.]', '', s)
    if not s:
        return 0.0

    # If it has both dot and comma (e.g. 1.500,50)
    if '.' in s and ',' in s:
        # Check which one comes last
        if s.rfind(',') > s.rfind('.'):
            # Comma is the decimal separator
            s = s.replace('.', '')
            s = s.replace(',', '.')
        else:
            # Dot is the decimal separator
            s = s.replace(',', '')
    elif ',' in s:
        # In Turkish, if there's only a comma, it's a decimal separator
        # unless it has exactly 3 digits after it, which might be a typo for thousands
        parts = s.split(',')
        if len(parts) > 1 and len(parts[-1]) == 3:
            # e.g., 1,500 -> 1500
            s = s.replace(',', '')
        else:
            s = s.replace(',', '.')
    elif '.' in s:
        # In Turkish, if there's only a dot, it's usually a thousands separator (1.500)
        # unless it has 1 or 2 digits after it (e.g., 162.00 or 162.5), then it's a decimal
        parts = s.split('.')
        if len(parts) > 1 and len(parts[-1]) in [1, 2]:
            pass # keep dot as decimal
        else:
            s = s.replace('.', '')
            
    try:
        return float(s)
    except ValueError:
        return 0.0

def extract_prices_from_text(text: str):
    """
    Extracts Target Price and Current Price from a Turkish brokerage report text.
    """
    if not text:
        return 0.0, 0.0
        
    target_match = re.search(r'Hedef\s*(?:Hisse\s*)?Fiyat[a-zıA-Zı]*[^\d\n\r]*([0-9][0-9,\.]*)', text, re.IGNORECASE)
    target_price = parse_turkish_price(target_match.group(1)) if target_match else 0.0
    
    current_match = re.search(r'(?:Kapanış|Mevcut\s*Fiyat|Güncel\s*Fiyat|Hisse\s*Fiyatı|(?<!Hedef\s)(?<!Hedef\sHisse\s)Fiyat)\s*(?:\([^\)]*\))?[^\d\n\r]*([0-9][0-9,\.]*)', text, re.IGNORECASE)
    current_price = parse_turkish_price(current_match.group(1)) if current_match else 0.0
    
    return target_price, current_price
