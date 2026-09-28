# HisseRadarPro — Faz 1: Salt Okunur Motor Tanı ve Çelişki Raporu
**Tarih / Zaman:** 2026-09-28 | **Kapsam:** 622 BIST Hissesi Canlı Motor Çıktıları  
**Durum:** `[FAZ 1 — SALT OKUNUR TANI]` (Skorlama, eşik ve arayüz mantığına dokunulmamıştır)

---

## 1. ETİKET EŞİKLERİ VE KOD ANALİZİ

### 1.1 Conviction Engine (İşlem & Alım Karar Motoru)
**Kaynak Dosya:** [`backend/services/conviction_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/conviction_engine.py#L937-L986)

Karar mekanizması katı teknik devre kesiciler (`ta_rec`) ve rejim bazlı dinamik eşiklerle çalışır:

```python
# conviction_engine.py:937-986
strong_buy_threshold = 83 if market_regime == "RISK_OFF" else 75

if ta_rec == "STRONG_SELL":
    final_score = min(final_score, 35)
    decision = "RİSKLİ / SAT"
elif ta_rec == "SELL":
    final_score = min(final_score, 50)
    decision = "BEKLE / İZLE" if final_score >= 40 else "RİSKLİ / SAT"
elif ta_rec == "NEUTRAL":
    final_score = min(final_score, 68)
    if final_score >= 58:
        decision = "KADEMELİ AL"
    elif final_score >= 42:
        decision = "BEKLE / İZLE"
    else:
        decision = "RİSKLİ / SAT"
else:  # BUY veya STRONG_BUY
    if final_score >= strong_buy_threshold and broker_count >= 2:
        decision = "GÜÇLÜ AL"
    elif final_score >= 58:
        decision = "KADEMELİ AL"
    elif final_score >= 42:
        decision = "BEKLE / İZLE"
    else:
        decision = "RİSKLİ / SAT"
```

| Etiket | Skor Aralığı / Kuralı | Ek Koşul (Devre Kesici) | Kod Satırı |
| :--- | :--- | :--- | :--- |
| **GÜÇLÜ AL** | `Skor >= 75` (RISK_OFF ise `83`) | `broker_count >= 2` VE `ta_rec in ('BUY', 'STRONG_BUY')` | L937, L965-L968 |
| **KADEMELİ AL** | `58 <= Skor < 75` (veya `75+` olup tek kurumlu) | `ta_rec != 'SELL'` ve `ta_rec != 'STRONG_SELL'` | L955, L969-L971 |
| **BEKLE / İZLE** | `42 <= Skor < 58` (veya `ta_rec == 'SELL'` için `40 <= Skor <= 50`) | Trend zayıf veya skor bekleme bandında | L948, L957, L972 |
| **RİSKLİ / SAT** | `Skor < 42` (veya `ta_rec == 'STRONG_SELL'` tavan `35`, `SELL` için `< 40`) | Stop/trend ihlali veya yetersiz puan | L942-L945, L950, L959, L974 |

---

### 1.2 Alpha Engine (Göreceli Sıralama & Tarama Motoru)
**Kaynak Dosya:** [`backend/services/alpha_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/alpha_engine.py#L281-L285)

Alpha motorunda sinyal, üç alt faktörün (Teknik %40 + Temel %40 + Beklenti %20) ağırlıklı toplamı olan `alpha_score` üzerinden doğrudan sabit eşiklerle atanır:

```python
# alpha_engine.py:281-285
if alpha_score >= 80.0:
    signal = "GÜÇLÜ AL"
elif alpha_score >= 65.0:
    signal = "AL"
elif alpha_score <= 35.0:
    signal = "SAT"
elif alpha_score <= 20.0:
    signal = "GÜÇLÜ SAT"  # Not: alpha_score <= 35.0 önce çalıştığı için ulaşılamaz!
else:
    signal = "NÖTR"
```

| Etiket | Skor Aralığı | Kod Satırı | Not / Tespit |
| :--- | :--- | :--- | :--- |
| **GÜÇLÜ AL** | `alpha_score >= 80.0` | L281-L282 | En üst dilim |
| **AL** | `65.0 <= alpha_score < 80.0` | L283-L284 | Alım bölgesi |
| **NÖTR** | `35.0 < alpha_score < 65.0` | L289-L290 | Geniş orta bant (30 puanlık aralık) |
| **SAT** | `alpha_score <= 35.0` | L285-L286 | Alt dilim |
| **GÜÇLÜ SAT** | *(Pratikte hiç atanmaz)* | L287-L288 | Kodda `elif alpha_score <= 35` önce geldiği için `<= 20` bloğuna hiçbir hisse düşmez |

---

### 1.3 Karışıklık Matrisindeki 4'ten 3'e Eşleme
**Kaynak Dosya:** [`scripts/check_engine_disagreement.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/scripts/check_engine_disagreement.py#L34-L50)

```python
def classify_conviction(decision: str) -> str:
    d = (decision or "").upper()
    if "AL" in d and "SAT" not in d:
        return "AL"
    elif "SAT" in d or "RİSKLİ" in d or "RISKLI" in d:
        return "SAT"
    return "NOTR"

def classify_alpha(signal: str) -> str:
    s = (signal or "").upper()
    if "AL" in s and "SAT" not in s:
        return "AL"
    elif "SAT" in s:
        return "SAT"
    return "NOTR"
```

- **AL Kategorisi:**
  - Conviction: `GÜÇLÜ AL` + `KADEMELİ AL`
  - Alpha: `GÜÇLÜ AL` + `AL`
- **NÖTR Kategorisi:**
  - Conviction: `BEKLE / İZLE`
  - Alpha: `NÖTR`
- **SAT Kategorisi:**
  - Conviction: `RİSKLİ / SAT`
  - Alpha: `SAT` + `GÜÇLÜ SAT`

---

## 2. SIRALAMA BAZLI UYUM ANALİZİ (622 HİSSE) `[CANLI VERİ]`

Kategori bazlı eşikler Conviction'da 609 SAT ve Alpha'da 477 NÖTR yığılması yaratarak yanıltıcı görünmektedir. Sıralama bazlı ölçümler iki motorun göreceli dizilim uyumunu ortaya koymaktadır:

### 2.1 İstatistiksel Korelasyonlar `[CANLI VERİ]`
- **Spearman Sıra Korelasyonu ($r_s$):** `0.4487` ($p = 3.89 \times 10^{-32}$) `[CANLI VERİ]`
- **Kendall Tau-b Korelasyonu ($\tau$):** `0.3630` ($p = 6.34 \times 10^{-30}$) `[CANLI VERİ]`
- **Pearson Lineer Korelasyonu ($r$):** `0.4987` `[CANLI VERİ]`

> [!NOTE]
> Sıralama korelasyonu ~0.45 ile **orta-güçlü pozitif uyum** göstermektedir. $p$-değerinin $10^{-30}$ mertebesinde olması iki motorun birbirinden tamamen bağımsız ya da rastgele olmadığını, ortak bir kalite çekirdeğini paylaştığını kanıtlamaktadır.

### 2.2 Üst Sıra Kesişimleri `[CANLI VERİ]`
- **İlk 30 Kesişimi:** `16 / 30` hisse (**%53.3**) `[CANLI VERİ]`
  - *Ortak Hisseler (16 adet):* `AHGAZ`, `AKBNK`, `BIMAS`, `ENERY`, `FLAP`, `HALKB`, `HUNER`, `ISDMR`, `KRDMD`, `LOGO`, `MGROS`, `RYSAS`, `TRMET`, `TUKAS`, `TUPRS`, `VAKBN`
- **İlk 50 Kesişimi:** `29 / 50` hisse (**%58.0**) `[CANLI VERİ]`
  - *Ortak Hisseler (29 adet):* İlk 30'a ek olarak `AYGAZ`, `CIMSA`, `GARAN`, `HRKET`, `ISCTR`, `KRGYO`, `KRPLS`, `MAVI`, `MEPET`, `SOKM`, `TUCLK`, `YKBNK`, `ZRGYO`

### 2.3 Yüzdelik Sıra Ayrışması `[CANLI VERİ]`
- **Yüzdelik Sıra Farkı $\ge$ 30 Puan Olan Hisse Sayısı:** `126 / 622` hisse (**%20.3**) `[CANLI VERİ]`
- Geriye kalan **496 hisse (%79.7)** her iki motorun sıralamasında birbirine %30 persentil bandı içinde paralel sıralanmaktadır.

---

### 2.4 En Büyük 15 Sıra Farkı — Conviction Lehine (Conviction Yüksek, Alpha Düşük) `[CANLI VERİ]`

Bu hisseler Conviction'da göreceli olarak daha üst sıralarda yer alırken, Alpha'da alt sıralara itilmiştir:

| Hisse | Conviction Skoru | Conv Sırası (Persentil) | Alpha Skoru | Alpha Sırası (Persentil) | Sıra Farkı ($\Delta\%$) | Rapor Sayısı |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **VESTL** | 10p | Sıra 60 (%90.5) | 32.9p | Sıra 536 (%13.9) | **+%76.7** | 2 |
| **OFSYM** | 16p | Sıra 44 (%93.1) | 33.7p | Sıra 519 (%16.6) | **+%76.5** | 1 |
| **TURGG** | 5p | Sıra 108 (%82.8) | 32.4p | Sıra 545 (%12.4) | **+%70.4** | 0 |
| **EGEEN** | 5p | Sıra 115 (%81.6) | 32.3p | Sıra 547 (%12.1) | **+%69.6** | 0 |
| **TRALT** | 28p | Sıra 23 (%96.5) | 36.0p | Sıra 454 (%27.1) | **+%69.4** | 7 |
| **OTKAR** | 5p | Sıra 113 (%82.0) | 32.9p | Sıra 535 (%14.0) | **+%68.0** | 7 |
| **KONYA** | 5p | Sıra 112 (%82.1) | 33.2p | Sıra 528 (%15.1) | **+%67.0** | 0 |
| **DIRIT** | 5p | Sıra 194 (%68.9) | 28.6p | Sıra 608 (%2.3) | **+%66.7** | 0 |
| **BLUME** | 5p | Sıra 211 (%66.2) | 23.6p | Sıra 622 (%0.0) | **+%66.2** | 0 |
| **ARMGD** | 5p | Sıra 101 (%83.9) | 34.4p | Sıra 500 (%19.7) | **+%64.3** | 1 |
| **BJKAS** | 5p | Sıra 102 (%83.7) | 35.0p | Sıra 484 (%22.2) | **+%61.5** | 0 |
| **ADGYO** | 5p | Sıra 172 (%72.5) | 32.4p | Sıra 542 (%12.9) | **+%59.6** | 0 |
| **ETYAT** | 5p | Sıra 121 (%80.7) | 34.8p | Sıra 491 (%21.1) | **+%59.6** | 0 |
| **MIATK** | 5p | Sıra 203 (%67.5) | 31.0p | Sıra 568 (%8.7) | **+%58.8** | 0 |
| **KNFRT** | 5p | Sıra 202 (%67.6) | 31.5p | Sıra 561 (%9.8) | **+%57.8** | 0 |

*(Not: Conviction'da 5 puan alan yüzlerce hisse arasında tie-breaking ham skor/momentum ile yapılmıştır).*

---

### 2.5 En Büyük 15 Sıra Farkı — Alpha Lehine (Alpha Yüksek, Conviction Düşük) `[CANLI VERİ]`

Bu hisseler Alpha motorunda üst sıralarda yer alırken, Conviction motorunda taban puan (5p) alarak dibe itilmiştir:

| Hisse | Conviction Skoru | Conv Sırası (Persentil) | Alpha Skoru | Alpha Sırası (Persentil) | Sıra Farkı ($\Delta\%$) | Rapor Sayısı |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **BALSU** | 5p | Sıra 620 (%0.3) | 60.1p | Sıra 25 (%96.1) | **-%95.8** | 1 |
| **BESLR** | 5p | Sıra 607 (%2.4) | 61.0p | Sıra 20 (%96.9) | **-%94.5** | 1 |
| **YYLGD** | 5p | Sıra 583 (%6.3) | 62.6p | Sıra 14 (%97.9) | **-%91.6** | 1 |
| **DESA**  | 5p | Sıra 574 (%7.7) | 63.6p | Sıra 10 (%98.5) | **-%90.8** | 1 |
| **ISFIN** | 5p | Sıra 603 (%3.1) | 56.1p | Sıra 60 (%90.5) | **-%87.4** | 1 |
| **BORSK** | 5p | Sıra 572 (%8.1) | 57.6p | Sıra 40 (%93.7) | **-%85.7** | 2 |
| **KMPUR** | 5p | Sıra 567 (%8.9) | 54.7p | Sıra 75 (%88.1) | **-%79.2** | 2 |
| **GLCVY** | 5p | Sıra 604 (%2.9) | 49.3p | Sıra 120 (%80.8) | **-%77.9** | 2 |
| **GOODY** | 5p | Sıra 609 (%2.1) | 47.0p | Sıra 147 (%76.5) | **-%74.4** | 1 |
| **MACKO** | 5p | Sıra 614 (%1.3) | 46.2p | Sıra 173 (%72.3) | **-%71.0** | 1 |
| **CWENE** | 5p | Sıra 590 (%5.2) | 46.5p | Sıra 160 (%74.4) | **-%69.2** | 2 |
| **HOROZ** | 5p | Sıra 611 (%1.8) | 45.1p | Sıra 192 (%69.2) | **-%67.5** | 1 |
| **ALKIM** | 5p | Sıra 610 (%1.9) | 43.9p | Sıra 210 (%66.3) | **-%64.4** | 1 |
| **AVTUR** | 5p | Sıra 579 (%6.9) | 45.7p | Sıra 185 (%70.4) | **-%63.5** | 0 |
| **OZKGY** | 5p | Sıra 587 (%5.6) | 44.7p | Sıra 196 (%68.6) | **-%63.0** | 1 |

> [!IMPORTANT]
> **Kritik Gözlem:** Alpha lehine ayrışan ilk 15 hissenin tamamına yakını **1 veya 2 raporlu** hisselerdir. Bu hisselerde tek bir aracı kurumun aşırı iyimser hedef fiyatı (%100-230 potansiyel), Alpha'nın Beklenti skorunu doğrudan **80-100 puana** fırlatırken, Conviction motorunda tek kurumlu hisseler kurumsal konsensüsten sadece 2 puan alabilmekte ve teknik teyit yoksa doğrudan 5 puana çakılmaktadır.

---

## 3. KAPSAM ANALİZİ (CONVICTION SAT GRUBU: 609 HİSSE) `[CANLI VERİ]`

Tüm 622 hisselik evrende **hiç aracı kurum raporu bulunmayan hisse sayısı: 491 (%78.9)** `[CANLI VERİ]`.

Conviction karar motorunda `RİSKLİ / SAT` grubunda yer alan toplam **609 hissenin** kurum kapsamına göre dağılımı:

| Kurum Kapsamı | Hisse Sayısı | SAT Grubu Oranı | Conviction Medyan Skor | Alpha Beklenti Ortalaması | Alpha Beklenti Medyanı |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **0 Kurum** | **491 hisse** | **%80.6** | **5.0p** | 50.0p | 50.0p |
| **1 Kurum** | **34 hisse** | **%5.6** | **5.0p** | 60.5p | 60.0p |
| **2 Kurum** | **16 hisse** | **%2.6** | **5.0p** | 60.8p | 60.0p |
| **3-5 Kurum** | **19 hisse** | **%3.1** | **5.0p** | 65.1p | 63.3p |
| **6+ Kurum** | **49 hisse** | **%8.0** | **9.0p** | 63.6p | 62.4p |
| **TOPLAM** | **609 hisse** | **%100.0** | **5.0p** | **52.6p** | **50.0p** |

### Temel Çıkarım:
1. Conviction SAT grubunun **%80.6'sı (491 hisse)** piyasada analist takibi olmayan (0 kurum raporlu) hisselerdir.
2. Bu 491 hissede Alpha Beklenti skoru nötr varsayılan **50.0p** üretirken, Conviction motoru kurumsal dayanak olmaması nedeniyle bu hisselere taban **5.0p** vermektedir.
3. Kalan 118 hissede ise kurum sayısı artsa dahi (6+ kurumda 49 hisse), teknik zayıflık (`ta_rec == "SELL"` / `"STRONG_SELL"`) veya negatif reel getiri nedeniyle hisseler SAT kategorisinde kalmaktadır.

---

## 4. TEORİK TAVAN HESABI: HİÇ RAPORU OLMAYAN BİR HİSSE `[KOD İNCELEMESİ]`

**Kaynak:** [`backend/services/conviction_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/conviction_engine.py)

Hiç analist raporu (`broker_count == 0`) ve model portföy kaydı olmayan bir hissenin tüm göstergeleri (teknik, ROE, çarpanlar, hacim, momentum) kusursuz olsa dahi alabileceği teorik tavan:

```
Tavan Puan = Taban (2.0) + Konsensüs + Değerleme + Teknik + Mekanik + Momentum
```

| Kategori | 0 Raporlu Hisse İçin Tavan | Kategorinin Genel Tavanı | İlgili Kod Satırları | Açıklama ve Kayıp Sebebi |
| :--- | :---: | :---: | :--- | :--- |
| **Taban Puan** | **+2.0 pt** | +2.0 pt | `L932` | `raw_score = 2.0 + Σ pillars` |
| **Kurumsal Konsensüs** | **0.0 pt** | +30.0 pt | `L752` | Rapor ve model portföy yok. **30 puan doğrudan kaybedilir.** |
| **Değerleme & Reel Getiri** | **+9.0 pt** | +30.0 pt | `L754-L827` | • Hedef potansiyel yok: Taban `+2.0 pt` (L766)<br>• ROE > %40 (Enflasyon üstü): Max `+4.0 pt` (L806)<br>• Sektörel çarpan ucuzluğu: Max `+3.0 pt` (L822)<br>*(Kayıp: 21 puan)* |
| **Teknik Teyit & Trend** | **+20.0 pt** | +20.0 pt | `L830-L860` | • STRONG_BUY baz: `+15.0 pt` (L835)<br>• SMA50 üstü ve eğimli: `+3.0 pt` (L843)<br>• RSI 45-60 ideal: `+2.0 pt` (L857)<br>*(Teknik tam puandır, rapordan etkilenmez)* |
| **İşlem Mekaniği** | **+7.0 pt** | +12.0 pt | `L862-L910` | • Rapor tazeliği: `0.0 pt` (L881 - 5 puan kaybedilir)<br>• Risk/Getiri > 3.0: `+4.0 pt` (L897)<br>• Stop mesafesi %3-6: `+2.0 pt` (L906)<br>• Hacim > 1.2x SMA20: `+1.0 pt` (L910) |
| **Momentum & Revizyon**| **+5.5 pt** | +9.0 pt | `L912-L928` | • Revizyon momentumu: `0.0 pt` (L917 - 3.5 puan kaybedilir)<br>• Fiyat momentumu 100. persentil: `+5.5 pt` (L927) |
| **TEORİK TOPLAM TAVAN**| **43.5 pt $\rightarrow$ 44 PUAN** | **98.0 pt** | `L932-L935` | `raw_score = 43.5` $\rightarrow$ `round = 44` |

### Bu tavan SAT eşiğinin altında mı?
- Conviction Motorunda:
  - `KADEMELİ AL` Eşiği: **`Skor >= 58`**
  - `BEKLE / İZLE` Eşiği: **`42 <= Skor < 58`**
  - `RİSKLİ / SAT` Eşiği: **`Skor < 42`**

> [!CAUTION]
> **Kritik Sonuç:** 
> Raporu olmayan bir hisse, BIST'in en mükemmel tekniğine ve kârlılığına sahip olsa dahi **en fazla 44 puan** alabilmektedir.
> 1. Bu hissenin **`KADEMELİ AL` (58)** veya **`GÜÇLÜ AL` (75)** alması **matematiksel olarak İMKÂNSIZDIR**.
> 2. Ulaşabileceği maksimum 44 puan, `BEKLE / İZLE` bandının (42-57) en alt sınırındadır.
> 3. Hacim, RSI veya R:R'dan gelecek en ufak 3 puanlık bir eksilmede skor **41'e düşmekte** ve hisse doğrudan **`RİSKLİ / SAT` (<42)** sepetine düşmektedir.
> Bu durum 491 raporsuz hissenin neden neredeyse tamamının SAT grubuna yığıldığını matematiksel olarak ispatlamaktadır.

---

## 5. ALPHA BEKLENTİ FORMÜLÜ VE DAVRANIŞI `[KOD İNCELEMESİ]`

**Kaynak:** [`backend/services/alpha_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/alpha_engine.py#L185-L231)

```python
def _calculate_sentiment_score(self, ticker: str, reports: List[Dict]) -> float:
    """Calculate Sentiment Score based on Scraped Broker Reports with continuous interpolation matching legacy breakpoints."""
    if not reports:
        return 50.0
        
    score = 50.0
    total_potential = 0.0
    pot_count = 0
    buy_count = 0
    
    for r in reports:
        try:
            pot = float(r.get("potansiyel") or 0)
            if pot > 0:
                total_potential += pot
                pot_count += 1
        except (ValueError, TypeError):
            pass
        if "AL" in str(r.get("rating", "")).upper() or "END.ÜSTÜ" in str(r.get("rating", "")).upper():
            buy_count += 1
            
    avg_pot = (total_potential / pot_count) if pot_count > 0 else 0.0
    
    # Reward high average upside potential with continuous linear interpolation
    if avg_pot > 0:
        if avg_pot <= 20.0:
            score += (avg_pot / 20.0) * 15.0  # 0 to +15.0
        elif avg_pot <= 40.0:
            score += 15.0 + ((avg_pot - 20.0) / 20.0) * 15.0  # +15.0 to +30.0
        else:
            score += 30.0
        
    # Reward consensus buys with continuous linear interpolation
    if len(reports) > 0:
        buy_ratio = buy_count / len(reports)
        if buy_ratio >= 0.7:
            score += 20.0
        elif buy_ratio >= 0.5:
            score += ((buy_ratio - 0.5) / 0.2) * 20.0  # 0.0 to +20.0
        elif buy_ratio >= 0.3:
            score += ((buy_ratio - 0.5) / 0.2) * 20.0  # -20.0 to 0.0
        else:
            score -= 20.0
            
    return max(0.0, min(100.0, score))
```

### Soruların Net Cevapları:

#### (a) Tek kurumlu hissede nasıl hesaplanıyor, hangi durumda 100 oluyor?
- `len(reports) == 1`. 
- Eğer o tek kurum "AL" veya "END.ÜSTÜ" vermişse: `buy_ratio = 1.0 >= 0.7` $\rightarrow$ **+20.0 puan**.
- Eğer o kurumun hedef fiyat potansiyeli `%40`'ın üzerindeyse (örn. `%57`, `%120`, `%236`): `avg_pot > 40` $\rightarrow$ **+30.0 puan**.
- Taban Puan: **50.0 puan**.
- **Toplam:** `50.0 + 30.0 + 20.0 = 100.0 TAM PUAN!`
- *Örnek Canlı Veri:* `ENERY`, `AHGAZ`, `BALSU` tek kurum raporuyla Beklenti skorunda **100.0 tam puan** almıştır.

#### (b) Hedef fiyata göre negatif potansiyel (örn. TUPRS -%7.6 veya RYGYO -%33.4) skoru düşürüyor mu?
- **HAYIR, DÜŞÜRMÜYOR.**
- Satır 198'deki `if pot > 0:` filtresi nedeniyle, negatif veya 0 potansiyelli raporlar `total_potential` toplamına ve `pot_count` sayacına dahil edilmez.
- Eğer tüm kurumlar negatif potansiyel verdiyse `pot_count = 0` olur ve `avg_pot = 0.0` kalır. Potansiyelden gelen puan `0` olur; ancak herhangi bir eksi puan/ceza uygulanmaz.
- Skor tabanı 50.0'da kalır. Ceza sadece kurum tavsiyesinde "SAT/TUT" çoğunluktaysa (`buy_ratio < 0.3` ise `-20.0 pt`) verilir.

#### (c) Skor rating oranından mı, potansiyelden mi, ikisinden mi türetiliyor?
- **İKİSİNDEN BİRDEN TÜRETİLMEKTEDİR:**
  $$\text{Sentiment} = \text{clamp}\Big(50.0 + \text{Potansiyel Katkısı } [0, +30] + \text{Tavsiye Katkısı } [-20, +20], 0, 100\Big)$$
  - Taban: `50.0`
  - Ortalama Pozitif Potansiyel Katkısı: `[0.0, +30.0]`
  - Alım Oranı Katkısı: `[-20.0, +20.0]`

---

## 6. YAN YANA BİLEŞEN DÖKÜM TABLOSU (12 ODAK HİSSE) `[CANLI VERİ]`

İki motorun tüm alt bileşenlerinin tek bir tabloda karşılaştırmalı dökümü:

| Hisse | Kurum Sayısı | Hedef Pot. (%) | Conv Skor / Karar | Konsensüs (max 30) | Değerleme (max 30) | Teknik (max 20) | Mekanik (max 12) | Momentum (max 9) | Alpha Skor / Sinyal | Alpha Teknik | Alpha Temel | Alpha Beklenti |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :---: | :---: |
| **ENERY** | 1 | +%57.5 | **51p** (BEKLE) | 2.0 | +19.0 | +14.6 | +8.0 | +5.2 | **85.9p** (GÜÇLÜ AL) | 76.4 | 76.7 | 100.0 |
| **AHGAZ** | 1 | +%56.7 | **48p** (BEKLE) | 2.0 | +17.7 | +12.8 | +8.0 | +5.3 | **80.2p** (GÜÇLÜ AL) | 73.0 | 61.0 | 100.0 |
| **ORGE**  | 1 | +%79.5 | **5p** (SAT) | 2.0 | -17.4 | +0.3 | +8.0 | +5.0 | **57.1p** (NÖTR) | 25.8 | 84.6 | 60.0 |
| **TUPRS** | 21 | +%1.6 | **45p** (BEKLE) | 26.0 | +2.5 | +5.1 | +2.0 | +7.9 | **63.1p** (NÖTR) | 45.5 | 83.0 | 61.5 |
| **RYGYO** | 1 | -%33.4 | **11p** (SAT) | 2.0 | -12.3 | +14.6 | -0.1 | +5.3 | **76.8p** (AL) | 76.4 | 96.6 | 62.3 |
| **ISDMR** | 1 | +%9.4 | **33p** (SAT) | 2.0 | +4.3 | +15.1 | +3.9 | +5.2 | **74.7p** (AL) | 77.5 | 69.9 | 76.3 |
| **YYLGD** | 1 | +%121.0 | **5p** (SAT) | 4.0 | -15.2 | -25.3 | +10.0 | +3.0 | **62.6p** (NÖTR) | 7.0 | 94.9 | 80.0 |
| **BALSU** | 1 | +%236.3 | **5p** (SAT) | 2.0 | -17.8 | -22.4 | +6.0 | +0.6 | **60.1p** (NÖTR) | 9.8 | 57.3 | 100.0 |
| **TRMET** | 4 | +%57.8 | **67p** (KADEMELİ AL) | 12.0 | +22.4 | +13.4 | +12.0 | +4.9 | **60.7p** (NÖTR) | 74.2 | 43.6 | 63.3 |
| **MAVI**  | 17 | +%64.2 | **18p** (SAT) | 24.0 | -17.6 | -4.3 | +12.0 | +1.7 | **57.1p** (NÖTR) | 26.4 | 60.2 | 77.8 |
| **KCHOL** | 19 | +%51.0 | **27p** (SAT) | 25.6 | -20.0 | +2.1 | +12.0 | +4.9 | **56.7p** (NÖTR) | 27.4 | 64.0 | 73.2 |
| **SOKM**  | 13 | +%51.8 | **61p** (KADEMELİ AL) | 21.2 | +15.1 | +5.4 | +12.0 | +5.0 | **58.6p** (NÖTR) | 46.7 | 52.2 | 72.3 |

### Tablo Analiz Çıkarımları:
1. **BALSU & YYLGD Çelişkisi:** İki hisse de Alpha'da yüksek temel puan ve tek kurumun %120-236 hedefiyle Beklenti'den 80-100 puan alarak ~60p (üst-nötr) seviyesindedir. Ancak Conviction'da berbat teknik (-22 ile -25 puan) ve negatif reel getiri (-15 ile -17 puan) nedeniyle ham skorları negatif çıkmış (`-29.6` ve `-21.5`), skoru taban olan **5p**'ye yapışmıştır.
2. **RYGYO & ISDMR (Taban Tabana Zıt):** Alpha'da güçlü teknik ve temel çarpanlarla 75-77 puanla **AL** alırken; Conviction'da sadece 1 kurum takip ettiği için Kurumsal Konsensüs 2 puanda kalmış, Değerleme cezasıyla skorları 11 ve 33 puanda kalarak **SAT** kategorisine düşmüştür.
3. **KCHOL & MAVI (Yüksek Kurum Ama SAT):** KCHOL (19 kurum, 25.6p konsensüs) ve MAVI (17 kurum, 24.0p konsensüs) en yüksek kurumsal desteğe sahipken, Değerleme sütunundaki enflasyon altı getiri/çarpan cezası (-20.0p ve -17.6p) ve zayıf teknik nedeniyle Conviction skoru 27 ve 18 puanda kalarak SAT olmuştur.

---

## 7. NORMALİZASYON VE SKOR SINIRLAMA MEKANİZMASI `[KOD İNCELEMESİ]`

Conviction sütunlarının teorik maksimumları toplamı **+98**, minimumları toplamı **-57.5** puandır.

**Kaynak Kod:** [`backend/services/conviction_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/conviction_engine.py#L932-L935)

```python
raw_score = 2.0 + institutional_pillar + valuation_pillar + technical_pillar + mechanics_pillar + momentum_pillar
final_score = max(5, min(97, int(round(raw_score))))
```

### Analiz:
1. **Normalizasyon Yoktur (Clamping Vardır):** Kodda matematiksel bir min-max normalizasyonu `(raw - min) / (max - min) * 100` veya sigmoid dönüştürme **YAPILMAMAKTADIR**.
2. **Doğrudan Toplamsal (Additive):** 2.0 taban puanının üzerine 5 sütunun ham puanları cebirsel olarak eklenir.
3. **Kırpma / Truncation (`max(5, min(97, ...))`):**
   - Ham skoru 0'ın altına düşen tüm hisseler (örneğin BALSU ham `-29.6`, YYLGD ham `-21.5`, ORGE ham `-0.02`), `max(5, ...)` devreye girdiği için doğrudan **5 puana** eşitlenir.
   - Ham skoru 97'yi aşan tüm hisseler `min(97, ...)` ile **97 puana** sabitlenir.
4. **Sonuç:** Negatif değerlerin 5'e sıkıştırılması, evrendeki hisselerin alt diliminde çok sayıda 5 puanlık hisse yığılmasına yol açmaktadır.

---

## 8. SİSTEM ÇIKTISI GÜNCELLEMESİ (check_engine_disagreement.py)

[`scripts/check_engine_disagreement.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/scripts/check_engine_disagreement.py) dosyasına mevcut karışıklık matrisi korunarak Madde 2'deki sıralama bazlı metrikler entegre edilmiştir. 

Terminal çıktısı canlı test edilmiş ve doğrulanmıştır:
- Spearman: `0.4487`
- Kendall: `0.3630`
- İlk 30 Kesişimi: `16/30 (%53.3)`
- İlk 50 Kesişimi: `29/50 (%58.0)`
- Sıra Farkı $\ge$ %30: `126/622 (%20.3)`
- İki yönlü 15'er hisselik ayrışma listesi

---

*Rapor Sonu — Tüm veriler canlı çalışan motor ve veri tabanından anlık olarak derlenmiştir.*
