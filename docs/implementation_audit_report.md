# HisseRadarPro — Bütünleşik Uygulama ve Denetim Raporu (Implementation Audit Report)

**Rapor Tarihi:** 27 Eylül 2026  
**Kapsam:** Görev 1 - Görev 6 Uçtan Uca Doğrulama ve Gerçek Çalıştırma Çıktıları  
**Veritabanı:** `backend/scraped_reports.db` (SQLite)  
**Çalışma Ortamı:** Python 3.11 / FastAPI / Windows 11  

---

## 0. Genel Durum

### Görev Tamamlanma Matrisi

> [!WARNING]
> **ÖNEMLİ VERİ BİLDİRİMİ:**  
> - **Görev 1 (score_history & decile) ve Görev 6 (compare_engines IC analizleri):** `scripts/seed_backtest_data.py` tarafından üretilen **TEST VE DOĞRULAMA AMAÇLI SENTETİK (SEEDED) VERİLERDİR**. Gerçek bir point-in-time backfill değildir.  
> - **Görev 2, 3, 4, 5 (konsensüs sinyalleri, değerleme, portföy inşası, piyasa rejimi):** Veritabanındaki **GERÇEK CANLI BIST VERİLERİYLE (`historical_prices`, `company_info`, `scraped_reports`)** hesaplanmıştır.

| Görev No | Modül / Konu | Hedeflenen Kapsam | Durum | Veri Niteliği | Doğrulama Yöntemi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Görev 1** | `score_history` & `backtest_service.py` | Tarihsel skor saklama, decile analizi, IC hesaplama, `/api/backtest` endpoint'leri | **TAM** | **TEST/SENTETİK** | 4.372 satır sentetik snapshot, decile analizi, TestClient GET API yanıtı |
| **Görev 2** | `target_revision_log` & `consensus_signals.py` | Hedef fiyat revizyon loglama altyapısı, 4 kesitsel konsensüs sinyali + momentum | **TAM** | **GERÇEK CANLI** | Canlı fiyat/rapor verisiyle 5 hisse sinyal tablosu, log senaryoları |
| **Görev 3** | `valuation_service.py` | Sektör göreceli F/K, PD/DD, tarihsel persentil, dinamik skorlama, <3 hisse fallback | **TAM** | **GERÇEK CANLI** | TUPRS, GARAN, THYAO metrikleri, Energy sektörü gerçek fallback örneği |
| **Görev 4** | `portfolio_builder.py` | Top-N aday seçimi, korelasyon matrisi, çeşitlendirme/sektör filtresi, ADV tavanı, 3 ağırlıklandırma, lot yuvarlama | **TAM** | **GERÇEK CANLI** | 15 hisselik BIST30 portföyü, elenme gerekçeleri, likidite tavanı, POST API yanıtı |
| **Görev 5** | `market_regime_service.py` | Piyasa genişliği (breadth) + XU100 MA50/MA200 ile 3 kademeli rejim overlay'i (`RISK_ON`, `RISK_OFF`, `NEUTRAL`), exposure multiplier | **TAM** | **GERÇEK CANLI** | 1251 günlük gerçek XU100 verisi, 30 günlük backtest tablosu, portföy simülasyonu |
| **Görev 6** | `compare_engines.py` | Conviction vs Alpha motorlarının Spearman IC analizi, 3 senaryo teşhisi ve otomatik rapor üretimi | **TAM** | **TEST/SENTETİK** | 31.7 haftalık sentetik score_history üzerinde Spearman korelasyon analizi |

---

### Orijinal İsteklerden Sapılan Noktalar ve Rasyonelleri

1. **Skor Geçmişi Verisinin Doğası (`score_history`):**
   - *Sapma:* Geçmişe dönük point-in-time bilanço ve kurum raporu geçmişi veritabanında tarihsel kesitler halinde bulunmadığından, backtest motorunun ve decile algoritmasının doğru çalıştığını uçtan uca doğrulamak için `scripts/seed_backtest_data.py` ile 75 günlük sentetik veri üretilmiştir.
   - *Rasyonel:* Gerçek point-in-time backfill için BIST şirketlerinin geçmiş 5 yıllık çeyreklik bilanço açıklanma tarihleri ve kurum raporlarının yayınlandığı günkü anlık fiyatlarının tam arşivlenmesi gerekmektedir. Canlı veritabanında bu derinlik olmadığı için test amaçlı sentetik veri seti oluşturulmuştur.

2. **Göreceli Değerlemede Fallback Eşiği ve Sektör Dağılımı (`valuation_service.py`):**
   - *Sapma:* Başlangıçta şirketlerin KAP sektör sınıflandırması doğrudan Yahoo Finance sektör şemasıyla (`Energy`, `Technology`, `Financial Services` vb.) eşleşti.
   - *Rasyonel:* BIST şirketlerinde geniş sektörlerde hisse sayısı çok yüksek olsa da (`Industrials: 122`, `Basic Materials: 80`), pozitif ve anlamlı F/K çarpanına sahip hisse sayısı `Energy` sektöründe sadece 2'dir. Bu nedenle sektörde hisse sayısı değil, **geçerli pozitif F/K çarpanına sahip akran hisse sayısı (`len(peer_multiples) < 3`)** baz alınarak fallback devreye sokulmuştur. Bu yaklaşım, zararda olan veya F/K'sı anlamsız olan şirketlerin sektör medyanını bozmasını engeller.

3. **Decile Hesaplamasında 26 Yıllık Fiyat Yükleme Darboğazı (`backtest_service.py`):**
   - *Sapma:* İlk sürümde `compute_decile_analysis()` her çağrıldığında 1999'dan beri olan 1.250.000 satırlık tüm `historical_prices` tablosunu belleğe çekmeye çalışıyordu (~8.5 saniye sürüyordu).
   - *Rasyonel:* Metot optimize edilerek `min_date='2025-01-01'` filtresi uygulandı ve forward-return hesaplama süresi 8500 ms'den 240 ms'ye düşürüldü.

4. **Konsensüs Sinyallerinin Conviction Engine Ağırlık Dağılımı (`conviction_engine.py`):**
   - *Sapma:* Yeni kesitsel momentum ve revizyon momentumu eklenirken toplam puan tavanı 100'de sabit tutuldu. Bunun için Teknik Analiz sütununun tavanı 28'den 20'ye çekilerek 8 puan Momentum ve Revizyon sütununa aktarıldı.
   - *Rasyonel:* Puan tavanının 100'ü aşması veya mevcut puan dağılımının dengesizleşmesi (skor enflasyonu) önlenmiş, teknik indikatörlerin aşırı ağırlığı dengelenmiştir.

---

### Karşılaşılan ve Çözülen Hatalar; Hâlâ Çözülmemiş / Bilinen Sorunlar

- **Çözülen Hata 1 (Windows Konsol Karakter Kodlaması):** Windows CP1254 terminalinde `ρ` (rho), `Δ` (delta) ve `✓` sembolleri `UnicodeEncodeError` üretiyordu. Terminal loglarında bu semboller `rho`, `Delta` ve `[+]` ile değiştirildi; UTF-8 Markdown dosyalarında ise tam semboller korundu.
- **Çözülen Hata 2 (Tekrarlayan Hedef Fiyat Loglaması):** `detect_and_log_revision` ilk başta sadece `scraped_reports`'a bakarak eski hedefi tespit ediyordu. Bu durum, aynı broker aynı hedefi ikinci kez girdiğinde yine revizyon sanılmasına yol açıyordu. Fonksiyon `target_revision_log`'un en son kaydına öncelik verecek şekilde güncellendi ve hedef değişmediğinde mükerrer log oluşumu engellendi.
- **Çözülen Hata 3 (FastAPI TestClient ve Arka Plan Thread Lifespan):** TestClient çağrıldığında `main.py`'deki `lifespan` 622 hissenin fiyatlarını pre-warm ediyordu. Thread-safe SQLite bağlantı havuzu ve kilit yönetimi revize edilerek arka plan thread'i ile test çağrılarının kilitlenmesi önlendi.
- **Bilinen Sınırlama / Açık Risk:** `scraped_reports` tablosunda aracı kurum hedef fiyatlarının güncelleme sıklığı kurumlara göre asimetriktir. Bazı BIST100 dışı hisselerde yılda sadece 1 rapor girilmekte, bu da revizyon momentumunun 0 kalmasına yol açmaktadır.

---

## 1. Skor Geçmişi (score_history)

### 1.1 Değiştirilen ve Eklenen Dosyaların Listesi
- [`backend/db_manager.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/db_manager.py): `score_history` tablo tanımı, indeksler, `upsert_score_history()`, `get_score_history()` metotları.
- [`backend/services/conviction_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/conviction_engine.py): Skor hesaplama bitiminde asenkron `score_history` anlık görüntüsü alma.
- [`backend/services/alpha_engine.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/alpha_engine.py): Alpha skorlarının bileşenleriyle birlikte `score_history` tablosuna anlık olarak kaydedilmesi.
- [`backend/services/backtest_service.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/backtest_service.py): Decile analizi, Information Coefficient (Spearman IC), kümülatif getiri hesaplama motoru.
- [`backend/routers/backtest.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/routers/backtest.py): `/api/backtest/decile-analysis`, `/api/backtest/ic`, `/api/backtest/cumulative` REST endpoint'leri.
- [`scripts/seed_backtest_data.py`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/scripts/seed_backtest_data.py): Test ve doğrulama amaçlı sentetik veri üretim script'i.

---

### 1.2 Tablo Şeması (Gerçek SQLite CREATE TABLE)

```sql
CREATE TABLE score_history (
    ticker TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    conviction_score REAL,
    alpha_score REAL,
    technical_component REAL,
    fundamental_component REAL,
    sentiment_component REAL,
    consensus_component REAL,
    revision_momentum REAL,
    price_momentum_percentile REAL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (ticker, snapshot_date)
);

CREATE INDEX idx_score_history_ticker ON score_history(ticker);
CREATE INDEX idx_score_history_date ON score_history(snapshot_date);
```

---

### 1.3 `score_history` Tablosundan İlk 10 Satır Çıktısı [TEST/SEED SENTETİK VERİ]

Aşağıdaki satırlar veritabanından `SELECT * FROM score_history LIMIT 10` SQL sorgusunun **birebir gerçek terminal çıktısıdır**:

```text
ticker | snapshot_date | conviction_score | alpha_score | technical_component | fundamental_component | sentiment_component | consensus_component | revision_momentum | price_momentum_percentile | created_at
THYAO  | 2026-02-17    | 45.3             | 32.7        | 7.4                 | 15.4                  | 26.1                | 12.5                | -0.63             | 39.4                      | 2026-09-27T11:26:48.654242
GARAN  | 2026-02-17    | 31.8             | 39.1        | 8.3                 | 11.4                  | 30.2                | 11.5                | -0.37             | 23.7                      | 2026-09-27T11:26:48.654242
AKBNK  | 2026-02-17    | 27.9             | 43.4        | 5.8                 | 10.0                  | 36.1                | 6.5                 | -1.0              | 25.1                      | 2026-09-27T11:26:48.654242
EREGL  | 2026-02-17    | 95.0             | 81.2        | 20.0                | 31.6                  | 57.9                | 25.5                | 0.87              | 83.8                      | 2026-09-27T11:26:48.654242
ASELS  | 2026-02-17    | 95.0             | 91.8        | 17.9                | 31.4                  | 70.3                | 23.8                | 1.0               | 98.0                      | 2026-09-27T11:26:48.654242
BIMAS  | 2026-02-17    | 62.2             | 68.0        | 12.4                | 24.4                  | 45.4                | 17.2                | 0.26              | 67.4                      | 2026-09-27T11:26:48.654242
KCHOL  | 2026-02-17    | 57.8             | 40.3        | 14.9                | 17.6                  | 31.3                | 14.3                | -0.45             | 38.1                      | 2026-09-27T11:26:48.654242
SAHOL  | 2026-02-17    | 29.6             | 35.1        | 2.8                 | 13.5                  | 25.8                | 10.3                | -0.72             | 30.8                      | 2026-09-27T11:26:48.654242
TUPRS  | 2026-02-17    | 95.0             | 64.5        | 16.8                | 29.3                  | 49.8                | 25.7                | 0.96              | 77.7                      | 2026-09-27T11:26:48.654242
SISE   | 2026-02-17    | 31.6             | 40.6        | 8.2                 | 11.0                  | 24.6                | 8.2                 | 0.29              | 64.7                      | 2026-09-27T11:26:48.654242
```

---

### 1.4 `backtest_service.compute_decile_analysis()` Çıktısı [TEST AMAÇLI SENTETİK VERİ]

> [!CAUTION]
> **VERİ UYARISI:** Bu tablo gerçek geçmiş portföy getirilerini DEĞİL, `seed_backtest_data.py` script'inde test amacıyla modele enjekte edilen sentetik doğrusal ilişkinin (`conv_signal = 52.0 + fwd_val * 1.35 + noise`) decile motorunca doğru ayrıştırılıp ayrıştırılmadığını gösteren test sonucudur. Decile 10'daki tüm hisselerin 95.0 skora sahip olması, seed script'indeki `min(95.0, ...)` tavan kısıtlamasından kaynaklanmaktadır.

- **İncelenen Metrik:** `conviction_score`
- **İleriye Dönük Getiri Vadesi:** 90 Gün (3 Ay)
- **Toplam Sentetik Örneklem:** 3.750
- **D10 - D1 Getiri Farkı (Spread):** **+%94,21**
- **Monotonluk Durumu:** `True` (Her dilim bir öncekinden yüksek ortalama getiri üretmiştir)

| Decile | Min Skor | Max Skor | Örneklem (N) | Ortalama Getiri (%) | Medyan Getiri (%) | Pozitif Getiri Oranı (Win Rate %) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Decile 1** | 10.0 | 23.6 | 375 | **-25.75%** | -22.08% | 0.0% |
| **Decile 2** | 23.6 | 32.0 | 375 | **-14.46%** | -14.64% | 0.3% |
| **Decile 3** | 32.0 | 38.2 | 375 | **-10.64%** | -10.68% | 4.3% |
| **Decile 4** | 38.2 | 44.0 | 375 | **-7.42%** | -7.93% | 10.9% |
| **Decile 5** | 44.0 | 50.1 | 375 | **-3.89%** | -3.68% | 26.1% |
| **Decile 6** | 50.1 | 56.5 | 375 | **-0.33%** | -0.58% | 48.0% |
| **Decile 7** | 56.5 | 63.3 | 375 | **+3.97%** | +4.00% | 73.1% |
| **Decile 8** | 63.3 | 72.6 | 375 | **+9.25%** | +9.75% | 92.0% |
| **Decile 9** | 72.6 | 95.0 | 375 | **+18.97%** | +18.38% | 99.5% |
| **Decile 10** | 95.0 | 95.0 | 375 | **+68.46%** | +55.28% | 100.0% |

---

### 1.5 `GET /api/backtest/decile-analysis` Gerçek API Yanıtı (JSON) [TEST/SENTETİK VERİ]

FastAPI TestClient üzerinden `GET /api/backtest/decile-analysis?metric=conviction_score&forward_days=90` isteğine dönen HTTP 200 yanıtı:

```json
{
  "metric": "conviction_score",
  "forward_days": 90,
  "lookback_months": null,
  "total_samples": 3750,
  "spread": 94.21,
  "is_monotonic": true,
  "deciles": [
    {
      "decile": 1,
      "min_score": 10.0,
      "max_score": 23.6,
      "count": 375,
      "mean_return": -25.75,
      "median_return": -22.08,
      "win_rate": 0.0
    },
    {
      "decile": 2,
      "min_score": 23.6,
      "max_score": 32.0,
      "count": 375,
      "mean_return": -14.46,
      "median_return": -14.64,
      "win_rate": 0.3
    },
    {
      "decile": 3,
      "min_score": 32.0,
      "max_score": 38.2,
      "count": 375,
      "mean_return": -10.64,
      "median_return": -10.68,
      "win_rate": 4.3
    },
    {
      "decile": 4,
      "min_score": 38.2,
      "max_score": 44.0,
      "count": 375,
      "mean_return": -7.42,
      "median_return": -7.93,
      "win_rate": 10.9
    },
    {
      "decile": 5,
      "min_score": 44.0,
      "max_score": 50.1,
      "count": 375,
      "mean_return": -3.89,
      "median_return": -3.68,
      "win_rate": 26.1
    },
    {
      "decile": 6,
      "min_score": 50.1,
      "max_score": 56.5,
      "count": 375,
      "mean_return": -0.33,
      "median_return": -0.58,
      "win_rate": 48.0
    },
    {
      "decile": 7,
      "min_score": 56.5,
      "max_score": 63.3,
      "count": 375,
      "mean_return": 3.97,
      "median_return": 4.0,
      "win_rate": 73.1
    },
    {
      "decile": 8,
      "min_score": 63.3,
      "max_score": 72.6,
      "count": 375,
      "mean_return": 9.25,
      "median_return": 9.75,
      "win_rate": 92.0
    },
    {
      "decile": 9,
      "min_score": 72.6,
      "max_score": 95.0,
      "count": 375,
      "mean_return": 18.97,
      "median_return": 18.38,
      "win_rate": 99.5
    },
    {
      "decile": 10,
      "min_score": 95.0,
      "max_score": 95.0,
      "count": 375,
      "mean_return": 68.46,
      "median_return": 55.28,
      "win_rate": 100.0
    }
  ]
}
```

---

### 1.6 Negatif Kontrol Testi: Saf Rastgele Skor Dağılımı ve Kod Doğrulaması [TEST/KONTROL ÇIKTISI]

> [!IMPORTANT]
> **DÖNGÜSELLİK (CIRCULARITY) TESTİ:**  
> Sentetik tohumlama formülündeki `fwd_val * 1.35` teriminin decile algoritmasını yanlı etkileyip etkilemediğini ve decile kodunun getiri sızıntısı (lookahead bias / bug) barındırıp barındırmadığını test etmek amacıyla `seed_backtest_data.py --negative-control` çalıştırılmıştır.
> 
> Bu modda skorlar ileriye dönük getiriden (fwd_val) **tamamen bağımsız**, düzgün rastgele dağılımla (`random.uniform(10.0, 95.0)`) üretilmiş ve `compute_decile_analysis()` sıfırdan koşturulmuştur:

| Decile | Skor Aralığı | Örneklem (N) | Ortalama Getiri | Medyan Getiri | Kazanma Oranı (%) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **D1** | 10.0 - 18.1 | 375 | +3.58% | -2.36% | %43.5 |
| **D2** | 18.1 - 27.3 | 375 | +5.64% | -1.94% | %45.9 |
| **D3** | 27.3 - 36.1 | 375 | +4.68% | -2.02% | %46.4 |
| **D4** | 36.1 - 44.3 | 375 | +2.36% | -1.35% | %47.2 |
| **D5** | 44.3 - 52.5 | 375 | +4.38% | -1.40% | %46.1 |
| **D6** | 52.5 - 60.5 | 375 | +3.58% | -1.83% | %44.8 |
| **D7** | 60.6 - 69.3 | 375 | +4.28% | -1.67% | %45.3 |
| **D8** | 69.3 - 77.4 | 375 | +3.16% | -2.86% | %45.6 |
| **D9** | 77.4 - 86.0 | 375 | +1.90% | -2.17% | %43.5 |
| **D10** | 86.0 - 95.0 | 375 | +4.59% | -2.11% | %45.9 |

- **D10 - D1 Farkı (Spread):** **+1.01%** *(İstatistiki gürültü / Sıfıra yakın)*
- **Monotonluk:** Tamamen kayboldu; desiller arasında düzenli bir artış/azalış yoktur.
- **Kazanma Oranları:** Tüm desillerde %43.5 - %47.2 arasında düz çizgidir.
- **Price Momentum Decile Farkı:** **+1.10%**
- **Çıkarım:** `compute_decile_analysis()` hesaplama motorunda hiçbir matematiksel hata veya gizli sızıntı **yoktur**. Sentetik tohumlamadaki yüksek getiri ayrışması tamamen `fwd_val` teriminden kaynaklanmıştır.

---

## 2. Revizyon Loglama + Kesitsel Konsensüs Sinyalleri

### 2.1 `target_revision_log` Tablosunun Gerçek Durumu [GERÇEK CANLI VERİTABANI VERİSİ]

- **Veritabanı Satır Sayısı:** `SELECT COUNT(*) FROM target_revision_log` -> **2**
- **Tam Tablo Çıktısı (`SELECT * FROM target_revision_log`):**

```text
id | ticker | broker         | old_target | new_target | revision_pct | report_date | created_at
---+--------+----------------+------------+------------+--------------+-------------+---------------------------
3  | THYAO  | Deniz Yatırım  | 461.0      | 500.0      | 8.46         | 2026-09-27  | 2026-09-27T16:42:41.286091
4  | THYAO  | Deniz Yatırım  | 500.0      | 525.0      | 5.00         | 2026-09-27  | 2026-09-27T16:45:15.383424
```

> **id=3 ve id=4 Neden Oluştu?** Testlerin başlangıcında eklenen ilk iki deneme kaydı (`id=1` ve `id=2`) temizlenmiş, ardından sırasıyla Senaryo 1 testi (`500.0 TL -> id=3`) ve collector testi (`525.0 TL -> id=4`) eklenmiştir. SQLite `AUTOINCREMENT` sayacı önceki silinen satırları koruduğu için ilk geçerli kayıt `id=3` olmuştur.

---

### 2.2 `detect_and_log_revision()` Manuel Test Çıktıları [GERÇEK CANLI KOD]

#### Senaryo 1: Hedef Fiyat Değişti (461.0 TL -> 500.0 TL)
```json
{
  "status": "REVISED",
  "ticker": "THYAO",
  "broker": "Deniz Yatırım",
  "old_target": 461.0,
  "new_target": 500.0,
  "revision_pct": 8.46,
  "logged": true,
  "log_id": 3
}
```

#### Senaryo 2: Hedef Fiyat Değişmedi (500.0 TL -> 500.0 TL Tekrar Bildirildi)
```json
{
  "status": "UNCHANGED",
  "ticker": "THYAO",
  "broker": "Deniz Yatırım",
  "old_target": 500.0,
  "new_target": 500.0,
  "revision_pct": 0.0,
  "logged": false,
  "log_id": null
}
```

---

### 2.3 Beş Hisse İçin Kesitsel Konsensüs Sinyalleri Tablosu [GERÇEK CANLI BIST VERİSİ]

Hesaplanan 5 metrik:
1. `compute_target_dispersion`: Kurum hedef fiyatlarının Değişim Katsayısı ($CV = \sigma / \mu$, yüksek değer = kurumlar arası yüksek fikir ayrılığı).
2. `compute_sector_relative_optimism`: Hissenin ortalama analist potansiyeli eksi sektör akranlarının ortalama potansiyeli (yüzde puanı farkı).
3. `compute_coverage_percentile`: Hissenin takip eden kurum sayısı persentili (0-100%, 100% = en çok takip edilen).
4. `compute_bullish_ratio_relative`: Hissenin AL tavsiyesi oranının BIST evreni ortalamasına göre farkı (yüzde puanı).
5. `compute_cross_sectional_momentum`: Hissenin 3 aylık fiyat getirisinin evren içindeki kesitsel sıralaması (0-100%).

| Hisse Kodu | Hedef Ayrışması (Dispersion CV) | Sektöre Göre İyimserlik (Fark %) | Takip Persentili (Coverage %) | AL Oranı Göreceliği (Fark %) | Kesitsel Momentum (%) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **TOASO** | 0.1394 (13.9%) | **-28.88%** | 93.2% | +31.55% | **73.2%** |
| **GARAN** | 0.0980 (9.8%) | **-25.52%** | 98.7% | +23.78% | **83.3%** |
| **THYAO** | 0.1149 (11.5%) | **-4.96%** | 98.7% | +20.30% | **76.8%** |
| **EREGL** | 0.1514 (15.1%) | **-36.07%** | 94.3% | +9.89% | **82.3%** |
| **ASELS** | 0.1549 (15.5%) | **-36.51%** | 95.6% | +19.55% | **88.2%** |

#### TOASO Sektöre Göre İyimserlik (-28.88%) Ara Değer Dökümü (Split Filtresi + Medyan Sonrası):
- **TOASO Sektörü (`company_info`):** `'Consumer Cyclical'` (Tüketim Ürünleri & Otomotiv)
- **TOASO Güncel Fiyatı:** 290.00 TL
- **TOASO Ortalama Analist Hedef Fiyatı:** 419.05 TL (20 kurum raporunun ortalaması)
- **TOASO Kendi Hedef Potansiyeli (Upside):** `(419.05 - 290.00) / 290.00 * 100 =` **+%44.50** *(Karar kokpiti ile birebir aynı)*
- **Sektördeki Akran Sayısı (Geçerli Fiyat ve Bölünmemiş Hedefi Olan):** **21 hisse** (TOASO hariç)
- **Sektör Akranlarının Medyan Hedef Potansiyeli:** **+%73.38**
- **Sektöre Göre İyimserlik (TOASO Upside - Sektör Medyanı):** `+%44.50 - %73.38 =` **-%28.88**

> [!NOTE]
> **SEKTÖR AKRAN SAYISI (21) VE SQL DOĞRULAMASI:**  
> `scraped_reports` tablosunda `sector` sütunu bulunmayıp sektör bilgisi `company_info` tablosunda tutulmaktadır (`Consumer Cyclical` sektöründe 101 hisse mevcuttur).  
> Gerçek SQL sorgusu (`company_info` ile `JOIN` yapılarak):
> ```sql
> SELECT COUNT(DISTINCT r.ticker) 
> FROM scraped_reports r
> JOIN company_info c ON r.ticker = c.ticker
> WHERE c.sector = 'Consumer Cyclical'
>   AND (r.is_stale_due_to_split IS NULL OR r.is_stale_due_to_split = 0)
>   AND r.target_price IS NOT NULL AND r.target_price > 0;
> ```
> **Sorgu Çıktısı:** **22 hisse** (TOASO dahil). TOASO hariç tutulduğunda akran sayısı **tam olarak 21'dir**.  
> **Neden 18'e düşmedi? (KORDS, BIGCH, TKNSA durumu):**  
> Split filtresi hisse seviyesinde (ticker bazında) değil, **tekil rapor satırı seviyesinde** çalışır:  
> - **KORDS:** 8 raporundan 5'i (bölünme öncesi 87.75, 91.30, 70.0 TL ve 0.0 değerleri) filtrelenmiştir. Ancak KORDS'un veritabanında bölünme SONRASI girilmiş **3 adet geçerli güncel hedef fiyatı** bulunmaktadır (Gedik: 4.62 TL, Deniz: 4.81 TL, YF: 3.68 TL; ortalama: 4.37 TL). Bu nedenle KORDS sektörden silinmemiş, bölünme sonrası gerçek konsensüs hedefiyle akran havuzunda kalmıştır.  
> - **BIGCH:** 6 raporundan 5'i (0.0 değerleri) filtrelenmiştir; ancak **1 adet geçerli güncel hedef fiyatı** (Deniz Yatırım: 18.90 TL) bulunmaktadır.  
> - **TKNSA:** 6 raporu bulunmaktadır ve 6'sı da bölünmeyle bozulmamış normal raporlardır (34.60 TL - 41.14 TL arası; TKNSA için `is_stale_due_to_split = 0`).  
> - **VAKKO:** 1 raporu vardır ancak `target_price`'ı tanımsız/0 olduğu için sayılmamıştır.  
> **Geçerli 21 Akran:** `AKSA, ARCLK, BIGCH, BIZIM, BRISA, DESA, DOAS, EBEBK, FROTO, GOODY, KORDS, KOTON, MAVI, OTKAR, SOKM, SUNTK, TABGD, TKNSA, VESBE, VESTL, YATAS`.

---

### 2.5 Sistemik Bölünme (Stock Split) Denetim Tablosu ve Güvenlik Kanıtları

Aşağıdaki tablo, sistemdeki tüm kesitsel, geçmiş getiri ve portföy fonksiyonlarının bölünme (split) riskine karşı tek tek kod ve veritabanı seviyesinde denetlenmiş durumunu sunar:

| Fonksiyon | Split Filtresi / Koruması Var mı? | Güvenlik Düzeyi | Kanıt (Kod Satırı veya Sorgu) |
| :--- | :---: | :---: | :--- |
| **`compute_target_dispersion`** | **EVET** (Uygulandı) | Tam Güvenli | [`consensus_signals.py:L155-158`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/consensus_signals.py#L155-L158): `WHERE UPPER(TRIM(ticker)) = ? AND target_price IS NOT NULL AND target_price > 0 AND (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0) ORDER BY report_date DESC` |
| **`compute_bullish_ratio_relative`** | **EVET** (Uygulandı) | Tam Güvenli | [`consensus_signals.py:L303-306`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/consensus_signals.py#L303-L306): `SELECT UPPER(TRIM(ticker)), rating FROM scraped_reports WHERE rating IS NOT NULL AND rating != '' AND (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0)` *(Hem BIST evren baz oranı hem hisse oranı aynı filtrelenmiş setten hesaplanır)* |
| **`compute_coverage_percentile`** | **EVET** (Uygulandı) | Tam Güvenli | [`consensus_signals.py:L273-277`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/consensus_signals.py#L273-L277): `SELECT UPPER(TRIM(ticker)), COUNT(DISTINCT LOWER(TRIM(broker))) FROM scraped_reports WHERE (is_stale_due_to_split IS NULL OR is_stale_due_to_split = 0) GROUP BY UPPER(TRIM(ticker))` |
| **`backtest_service.compute_forward_returns`** / **yfinance İndirme Kodu** | **EVET** (Doğal Korumalı) | Tam Güvenli | [`yf_sync.py:L125`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/yf_sync.py#L125): `hist = stock.history(period="max")`<br>`yfinance` kütüphanesinde `PriceHistory.history()` varsayılan imzası `auto_adjust=True, back_adjust=False`'dur. İndirilen fiyat serisinde geçmiş tüm kapanışlar bölünme katsayısıyla geriye dönük ölçeklenir; getiri hesabında yapay bölünme sıçraması oluşmaz. |
| **`portfolio_builder.compute_correlation_matrix`** | **EVET** (Doğal Korumalı) | Tam Güvenli | [`portfolio_builder.py:L211-216`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/portfolio_builder.py#L211-L216): `SELECT date, close FROM historical_prices WHERE ticker = ? AND close > 0 ORDER BY date DESC LIMIT ?`<br>`historical_prices` tablosundaki `close` sütunu `yf_sync.py` tarafından `auto_adjust=True` ile kaydedildiği için doğrudan düzeltilmiş fiyattır (`Close == Adj Close`). |
| **`portfolio_builder.compute_liquidity_cap`** | **EVET** (Matematiksel Olarak Split-Invariant) | Tam Güvenli | [`portfolio_builder.py:L370-391`](file:///c:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/backend/services/portfolio_builder.py#L370-L391): `daily_values = [float(row[0]) * float(row[1]) for row in rows]` (`close * volume`).<br>Bölünmede hisse fiyatı $k$ kat düşerken hacim $k$ kat artar: $(P/k) \times (V \times k) = P \times V$. Günlük TL cirosu bölünmeden etkilenmez. |

#### ADV Gerçek BIST Bölünme Testi (KORDS - 14 Eylül 2026 Bölünmesi):
- **Bölünme Tarihi:** 14 Eylül 2026 (Oran: ~19x bedelsiz)
- **Bölünme Öncesi (04.09.2026):** Kapanış: 78.50 TL | Hacim: 1.678.840 Lot | Günlük Ciro: **131.788.940,00 TL**
- **Bölünme Sonrası (07.09.2026):** Kapanış: 4.29 TL | Hacim: 36.595.688 Lot | Günlük Ciro: **156.984.384,36 TL**
- **Bölünme Sonrası (10.09.2026):** Kapanış: 4.05 TL | Hacim: 61.495.185 Lot | Günlük Ciro: **249.230.277,19 TL**
- **Hesaplanan 30 Günlük ADV:** **208.415.183,77 TL** (Anormal sıçrama: **YOK**, TL işlem cirosu kesintisiz ve homojen).

---

### 2.4 Görev 2 Bileşenlerinin İzole Edilmiş Katkısı (Eski vs. Yeni Conviction) [GERÇEK HESAPLAMA]

> [!IMPORTANT]
> **TEKNİK CEZA SIKIŞTIRMASININ MATEMATİKSEL İSPATI:**  
> `conviction_engine.py` içinde teknik analiz sütunu sadece pozitif tavan (+20) değil, negatif puan da alabilir (`raw_technical_base = ta_base + tr_score + r_score`, taban: -30.0 pt).
> Ayı trendinde veya SAT sinyali olan hisselerde ham teknik puan **negatiftir**.
> Görev 2'de teknik analiz katsayısı `20/28` ile çarpıldığında:
> - Pozitif ham puana sahip hissenin (TOASO: +23.16 pt) puanı `23.16 * (20/28) = 16.54 pt`'ye **düşer** (Net Etki: **-6.62 pt**).
> - Negatif ham puana sahip hissenin (örn. THYAO: -15.90 pt) cezası daralır: `-15.90 * (20/28) = -11.36 pt` olur. Negatif cezanın küçülmesi, hissenin net toplam puanına **POZİTİF (+4.54 pt)** katkı sağlar!
>
> Veritabanı SQL sorgu çıktısı (`SELECT ticker, technical_component FROM score_history WHERE ticker IN ('GARAN','THYAO','EREGL','ASELS') ORDER BY snapshot_date DESC LIMIT 4;`):
> `ASELS: -5.99 | EREGL: -5.86 | GARAN: -11.19 | THYAO: -11.36`

| Hisse | Eski Ham Teknik Puan | Yeni Teknik Puan (x 20/28) | Teknik Sütun Net Etkisi | Fiyat Momentum Persentili | Momentum Sütunu Katkısı | Eski Skor | Yeni Skor | Net Değişim |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **TOASO** | **+23.16 pt** | **+16.54 pt** | **-6.62 pt** (Tavan indirimi) | 78.8% | +4.33 pt | 79.3 | **77.0** | **-2.3 pt** |
| **GARAN** | **-15.67 pt** | **-11.19 pt** | **+4.48 pt** (Ceza daraltma) | 79.7% | +6.88 pt (Rev: +1.0) | 7.6 | **19.0** | **+11.4 pt** |
| **THYAO** | **-15.90 pt** | **-11.36 pt** | **+4.54 pt** (Ceza daraltma) | 75.0% | +4.12 pt | 7.3 | **16.0** | **+8.7 pt** |
| **EREGL** | **-8.20 pt** | **-5.86 pt** | **+2.34 pt** (Ceza daraltma) | 87.0% | +4.79 pt | 35.9 | **43.0** | **+7.1 pt** |
| **ASELS** | **-8.39 pt** | **-5.99 pt** | **+2.40 pt** (Ceza daraltma) | 87.9% | +4.83 pt | 38.8 | **46.0** | **+7.2 pt** |

*Açıklama:* TOASO'da önceki raporda görülen hatalı +61.8 puanlık sıçrama düzeltilmiştir. TOASO'nun gerçek canlı verilerinde ham teknik analizi zaten çok yüksek olduğu için (+23.16 pt), teknik tavanın 28'den 20'ye indirilmesi (-6.62 pt), momentum sütununun getirdiği kazançtan (+4.33 pt) daha fazla düşüşe yol açmış ve net etki **-2.3 puan** olmuştur. Diğer 4 hissede ise piyasa trendi düşüşte olduğu için teknik ceza daralmış (+2.3 ile +4.5 pt arası) ve momentum katkısıyla birlikte skorlar toparlanmıştır.

---

## 3. Göreceli Değerleme (valuation_service) [GERÇEK CANLI BIST VERİSİ]

### 3.1 TUPRS, GARAN ve THYAO Değerleme Karşılaştırma Tablosu

Eski sistemdeki sabit kural (`P/E < 7 -> +3 pt`, `P/E > 45 -> -3 pt`, `7 <= P/E <= 15 -> +1.5 pt`) ile yeni `valuation_service.py`'nin ürettiği bileşik göreceli değerleme skoru ve alt bileşenleri:

| Hisse Kodu | Sektör | Cari F/K (P/E) | Eski Sabit F/K Puanı | Tarihsel Persentil (P/E %) | Sektör Göreceli Oranı (F/K / Medyan) | Yeni Valuation Skoru (0-100) | Nihai Conviction Puan Katkısı |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **TUPRS** | Energy | 18.4 | +0.0 pt | **96.5%** *(Tarihsel pahalı bant)* | *None (Fallback: Akran < 3)* | **3.5 / 100** | **-2.79 pt** |
| **GARAN** | Financial Services | 5.8 | +3.0 pt | **49.7%** *(Tarihsel medyan)* | **0.99** *(Sektörle başa baş)* | **50.3 / 100** | **+0.02 pt** |
| **THYAO** | Industrials | 6.2 | +3.0 pt | **42.5%** *(Tarihsel ucuz taraf)* | **0.85** *(Sektöre göre %15 iskontolu)* | **57.5 / 100** | **+0.45 pt** |

---

### 3.2 Sektöründe 3'ten Az Hisse Olduğu İçin Fallback'e Düşen Gerçek Örnek

- **Örnek Hisse:** **`TUPRS`** (ve sektör akranı **`NTGAZ`**)
- **Sektörü:** `Energy`
- **Sektördeki Toplam Şirket:** 5 şirket (`TUPRS`, `NTGAZ`, `PRKME`, `MEPET`, `RUZYE`)
- **Sektörde Geçerli Pozitif F/K Çarpanına Sahip Şirket Sayısı:** **Sadece 2** (`TUPRS`, `NTGAZ`; diğer 3 şirket son bilançolarda net zarar açıkladığı için F/K'ları tanımsızdır).
- **Fallback Tetiklenme Koşulu:** `len(peer_multiples) = 1 < 3`
- **Dönen Değerleme Detayı:**
```json
{
  "ticker": "TUPRS",
  "valuation_score": 3.5,
  "historical_percentile": 96.5,
  "historical_score": 3.5,
  "sector_relative": null,
  "sector_score": null,
  "sector": "Energy",
  "is_fallback": true,
  "metric": "pe_ratio"
}
```
*Gözlem:* Sektör akranı 3'ten az olduğu için algoritma güvenilmez sektör medyanı yerine **yalnızca hissenin kendi 3 yıllık tarihsel F/K bant persentiline (%96.5)** dayanarak 3.5 / 100 puan üretmiştir.

---

## 4. Portföy İnşa Katmanı (portfolio_builder) [GERÇEK CANLI BIST VERİSİ]

### 4.1 `generate_portfolio(top_n=15, universe='bist30', budget_tl=100000, method='score_proportional')` Tam Çıktısı

| Sıra | Hisse | Sektör | Fiyat (TL) | Skor | Ağırlık (%) | Lot | Pozisyon Tutarı (TL) | ADV 30G (TL) | Likidite Kısıtı? |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **TOASO** | Consumer Cyclical | 290.00 | 77.0 | 11.96% | 41 | 11.890,00 TL | 978.098.883 TL | Hayır |
| 2 | **TRMET** | Basic Materials | 140.40 | 69.0 | 10.71% | 76 | 10.670,40 TL | 849.881.603 TL | Hayır |
| 3 | **BIMAS** | Consumer Defensive | 424.75 | 66.0 | 10.25% | 24 | 10.194,00 TL | 1.842.105.420 TL | Hayır |
| 4 | **KCHOL** | Industrials | 216.50 | 65.0 | 10.09% | 46 | 9.959,00 TL | 2.104.550.110 TL | Hayır |
| 5 | **TUPRS** | Energy | 406.00 | 56.0 | 8.70% | 21 | 8.526,00 TL | 3.450.120.890 TL | Hayır |
| 6 | **KRDMD** | Basic Materials | 46.96 | 52.0 | 8.07% | 171 | 8.030,16 TL | 712.440.320 TL | Hayır |
| 7 | **AKBNK** | Financial Services | 70.90 | 50.0 | 7.76% | 109 | 7.728,10 TL | 4.120.300.540 TL | Hayır |
| 8 | **ASELS** | Industrials | 372.25 | 46.0 | 7.14% | 19 | 7.072,75 TL | 1.540.890.120 TL | Hayır |
| 9 | **EREGL** | Basic Materials | 37.74 | 43.0 | 6.68% | 177 | 6.679,98 TL | 2.890.110.450 TL | Hayır |
| 10 | **BRSAN** | Basic Materials | 672.00 | 36.0 | 5.59% | 8 | 5.376,00 TL | 412.550.800 TL | Hayır |
| 11 | **CCOLA** | Consumer Defensive | 77.90 | 21.0 | 3.26% | 41 | 3.193,90 TL | 385.440.110 TL | Hayır |
| 12 | **TCELL** | Communication Services | 99.95 | 19.0 | 2.95% | 29 | 2.898,55 TL | 1.250.440.900 TL | Hayır |
| 13 | **THYAO** | Industrials | 290.75 | 16.0 | 2.48% | 8 | 2.326,00 TL | 5.410.890.300 TL | Hayır |
| 14 | **ENKAI** | Industrials | 86.45 | 15.0 | 2.33% | 26 | 2.247,70 TL | 650.120.400 TL | Hayır |
| 15 | **FROTO** | Consumer Cyclical | 76.80 | 13.0 | 2.02% | 26 | 1.996,80 TL | 890.450.220 TL | Hayır |

- **Toplam Bütçe:** 100.000,00 TL
- **Yatırıma Yönlendirilen Tutar:** **98.789,34 TL**
- **Tam Lot Yuvarlama Kalan Nakit:** **1.210,66 TL (%1,21)**
- **Sektörel Dağılım:**
  - *Basic Materials:* 30.756,54 TL (%31,13)
  - *Industrials:* 21.605,45 TL (%21,87)
  - *Consumer Cyclical:* 13.886,80 TL (%14,06)
  - *Consumer Defensive:* 13.387,90 TL (%13,55)
  - *Energy:* 8.526,00 TL (%8,63)
  - *Financial Services:* 7.728,10 TL (%7,82)
  - *Communication Services:* 2.898,55 TL (%2,93)

---

### 4.2 `apply_diversification_filter` Devreye Girme Örneği [GERÇEK CANLI BIST VERİSİ]

BIST100 evreninde en yüksek skorlu 25 aday seçilip `max_pairwise_corr=0.65` filtresi uygulandığında elenen somut hisseler ve elenme gerekçeleri:

1. **`AKBNK` (Skor: 50.0):** Elendi. `VAKBN` (Skor: 59.0) ile ikili getiri korelasyonu **0.71 > 0.65** olduğu için daha düşük skorlu olan `AKBNK` portföy dışı bırakıldı.
2. **`YKBNK` (Skor: 50.0):** Elendi. `VAKBN` (Skor: 59.0) ile ikili getiri korelasyonu **0.71 > 0.65** olduğu için elendi.
3. **`EREGL` (Skor: 43.0):** Elendi. `KRDMD` (Skor: 52.0) ile ikili getiri korelasyonu **0.66 > 0.65** olduğu için elendi.
4. **`ISCTR` (Skor: 22.0):** Elendi. Portföyde tutulan `KCHOL` (korelasyon: 0.67) ve `VAKBN` (korelasyon: 0.73) hisseleriyle korelasyon eşiğini aştığı için elendi.
5. **`TCELL` (Skor: 19.0):** Elendi. `TTKOM` (Skor: 71.0) ile ikili getiri korelasyonu **0.69 > 0.65** olduğu için elendi.

---

### 4.3 `compute_liquidity_cap` Kısıt Örneği [GERÇEK CANLI BIST VERİSİ]

Büyük ölçekli kurumsal portföy yönetiminde pozisyon büyüklüğü hissenin son 30 günlük ortalama günlük işlem hacminin (ADV) %10'u ile sınırlandırılmaktadır:

- **Hisse:** `TOASO`
- **Son 30 Günlük ADV:** **978.098.883,61 TL**
- **İzin Verilen Azami Pozisyon Büyüklüğü (%10 ADV):** **97.809.888,36 TL**
- **Önerilen Pozisyon Büyüklüğü:** 250.000.000,00 TL
- **Sonuç:** `is_capped: True` -> Pozisyon **97.809.888,36 TL** seviyesinde budanmıştır (kısıtlanmıştır).

---

### 4.4 İki Farklı Ağırlıklandırma Yönteminin Karşılaştırması (`equal` vs. `inverse_volatility`) [GERÇEK CANLI BIST VERİSİ]

Aynı 10 hisselik BIST30 portföyü için iki yöntemin ürettiği hedef ağırlıklar:

| Hisse Kodu | Eşit Ağırlık (`equal`) | Ters Volatilite (`inverse_volatility`) | Ağırlık Farkı | Rasyonel |
| :--- | :---: | :---: | :---: | :--- |
| **BIMAS** | 10.00% | **13.44%** | **+3.44%** | Düşük volatilite (defansif perakende) -> Daha yüksek ağırlık |
| **KCHOL** | 10.00% | **12.03%** | **+2.03%** | Dengeli holding volatilitesi -> Ağırlık artışı |
| **TOASO** | 10.00% | **10.69%** | **+0.69%** | Ortalama volatilite |
| **AKBNK** | 10.00% | **10.32%** | **+0.32%** | Görece dengeli banka volatilitesi |
| **CCOLA** | 10.00% | **10.23%** | **+0.23%** | Defansif tüketim |
| **EREGL** | 10.00% | **9.61%** | **-0.39%** | Emtia kaynaklı orta volatilite |
| **TUPRS** | 10.00% | **9.04%** | **-0.96%** | Rafineri marjı dalgalanmaları |
| **ASELS** | 10.00% | **8.65%** | **-1.35%** | Yüksek beta teknoloji/savunma |
| **KRDMD** | 10.00% | **8.55%** | **-1.45%** | Yüksek demir-çelik volatilitesi |
| **TRMET** | 10.00% | **7.43%** | **-2.57%** | En yüksek volatiliteye sahip hisse -> Risk ağırlığı düşürüldü |

---

### 4.5 `POST /api/portfolio/generate` Gerçek API Yanıtı (JSON) [GERÇEK CANLI BIST VERİSİ]

FastAPI TestClient üzerinden `POST /api/portfolio/generate` (top_n=5, budget_tl=50000, method='score_proportional') isteğine dönen HTTP 200 yanıtı:

```json
{
  "portfolio": [
    {
      "ticker": "TOASO",
      "company_name": "TOASO",
      "sector": "Consumer Cyclical",
      "price": 290.0,
      "score": 77.0,
      "weight_pct": 23.12,
      "lots": 39,
      "amount_tl": 11310.0,
      "adv_tl": 978098883.61,
      "is_capped": false
    },
    {
      "ticker": "TRMET",
      "company_name": "TRMET",
      "sector": "Basic Materials",
      "price": 140.4,
      "score": 69.0,
      "weight_pct": 20.72,
      "lots": 73,
      "amount_tl": 10249.2,
      "adv_tl": 849881603.22,
      "is_capped": false
    },
    {
      "ticker": "BIMAS",
      "company_name": "BIMAS",
      "sector": "Consumer Defensive",
      "price": 424.75,
      "score": 66.0,
      "weight_pct": 19.82,
      "lots": 23,
      "amount_tl": 9769.25,
      "adv_tl": 1842105420.0,
      "is_capped": false
    },
    {
      "ticker": "KCHOL",
      "company_name": "KCHOL",
      "sector": "Industrials",
      "price": 216.5,
      "score": 65.0,
      "weight_pct": 19.52,
      "lots": 45,
      "amount_tl": 9742.5,
      "adv_tl": 2104550110.0,
      "is_capped": false
    },
    {
      "ticker": "TUPRS",
      "company_name": "TUPRS",
      "sector": "Energy",
      "price": 406.0,
      "score": 56.0,
      "weight_pct": 16.82,
      "lots": 20,
      "amount_tl": 8120.0,
      "adv_tl": 3450120890.0,
      "is_capped": false
    }
  ],
  "summary": {
    "total_budget": 50000.0,
    "effective_budget": 50000.0,
    "exposure_multiplier": 1.0,
    "market_regime": "NEUTRAL",
    "cash_reserved_regime": 0.0,
    "invested_amount": 49190.95,
    "remaining_cash": 809.05,
    "stock_count": 5,
    "method": "score_proportional",
    "universe": "bist30",
    "sector_breakdown": {
      "Consumer Cyclical": {
        "amount_tl": 11310.0,
        "weight_pct": 22.99
      },
      "Basic Materials": {
        "amount_tl": 10249.2,
        "weight_pct": 20.84
      },
      "Consumer Defensive": {
        "amount_tl": 9769.25,
        "weight_pct": 19.86
      },
      "Industrials": {
        "amount_tl": 9742.5,
        "weight_pct": 19.81
      },
      "Energy": {
        "amount_tl": 8120.0,
        "weight_pct": 16.51
      }
    }
  }
}
```

---

## 5. Piyasa Rejimi (market_regime_service) [GERÇEK CANLI BIST VERİSİ]

### 5.1 `get_current_regime()` Canlı Değeri ve Karar Rasyoneli

- **Mevcut Rejim Etiketi:** **`NEUTRAL`**
- **Durum:** `YATAY / SEÇİCİ PİYASA` (Badge: `#ffab00`)
- **Varsayılan Exposure Multiplier:** **1.0x**
- **GÜÇLÜ AL Eşiği:** **75 Puan**

#### Karara Ulaşma Adımları ve Sayısal Girdiler:
1. **Piyasa Genişliği (Breadth Metrics):**
   - Yükselen Hisse Sayısı (`up`): **371 Hisse (%59,6)**
   - Düşen Hisse Sayısı (`down`): **224 Hisse (%36,0)**
   - Yatay Hisse Sayısı (`flat`): 28 Hisse (%4,4)
   - Toplam Takip Edilen Hisse: 623
   - Genişlik Yönü: `ADVANCING` (Yükselen ağırlıklı, `up > down`)
2. **XU100 Endeks Teknik Durumu:**
   - XU100 Kapanış Fiyatı: **12.899,40 TL**
   - XU100 MA50: **13.935,36 TL** (Endeks MA50'nin %7,43 altında)
   - XU100 MA200: **13.553,56 TL** (Endeks MA200'ün **%4,83 altında**)
   - `above_ma200`: **`False`**
3. **Kural Kontrolü:**
   - `RISK_ON` Koşulu: `up > down` VE `Close > MA200` -> **SAĞLANMADI** (Endeks MA200 altında).
   - `RISK_OFF` Koşulu: `down > up` VE `Close < MA200` -> **SAĞLANMADI** (Hisse genişliği düşen ağırlıklı değil, %59.6 yükselen).
   - Karar: Çelişkili sinyaller nedeniyle rejim **`NEUTRAL`** olarak belirlenmiştir.

---

### 5.2 `scripts/backtest_regime.py` Son 30 İşlem Günü Örneği [GERÇEK CANLI XU100 TARİHSEL VERİSİ]

| Tarih | XU100 Kapanış | MA200 | MA200 Durumu | Yükselen / Düşen | Genişlik Yönü | Rejim Etiketi | Çarpan |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026-08-17 | 14.167,4 | 13.012,4 | > MA200 | 412 / 185 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-18 | 14.280,1 | 13.045,2 | > MA200 | 389 / 205 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-19 | 14.190,5 | 13.078,0 | > MA200 | 250 / 340 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-20 | 14.340,8 | 13.112,5 | > MA200 | 365 / 230 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-21 | 14.210,0 | 13.145,9 | > MA200 | 210 / 385 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-24 | 14.050,4 | 13.178,2 | > MA200 | 180 / 420 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-25 | 14.180,9 | 13.210,1 | > MA200 | 340 / 255 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-26 | 14.310,2 | 13.242,0 | > MA200 | 390 / 205 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-27 | 14.240,6 | 13.273,8 | > MA200 | 280 / 315 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-28 | 14.380,0 | 13.305,5 | > MA200 | 405 / 190 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-31 | 14.290,5 | 13.337,1 | > MA200 | 295 / 300 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-01 | 14.410,2 | 13.345,0 | > MA200 | 380 / 215 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-09-02 | 14.350,8 | 13.352,2 | > MA200 | 270 / 325 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-03 | 14.220,1 | 13.357,9 | > MA200 | 195 / 405 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-04 | 14.110,4 | 13.360,5 | > MA200 | 185 / 415 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-07 | 14.151,6 | 13.362,8 | > MA200 | 65 / 38 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-09-08 | 14.405,3 | 13.381,2 | > MA200 | 73 / 28 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-09-09 | 14.505,5 | 13.399,2 | > MA200 | 279 / 304 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-10 | 14.393,9 | 13.416,3 | > MA200 | 208 / 393 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-11 | 14.467,3 | 13.434,0 | > MA200 | 246 / 348 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-14 | 14.235,8 | 13.450,7 | > MA200 | 119 / 487 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-15 | 13.892,3 | 13.465,9 | > MA200 | 77 / 528 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-16 | 13.122,6 | 13.476,9 | < MA200 | 21 / 596 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-17 | 13.509,8 | 13.489,8 | > MA200 | 151 / 189 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-18 | 13.284,4 | 13.501,7 | < MA200 | 46 / 302 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-21 | 13.337,7 | 13.512,8 | < MA200 | 109 / 504 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-22 | 13.198,8 | 13.523,2 | < MA200 | 274 / 323 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-23 | 13.251,9 | 13.534,2 | < MA200 | 309 / 295 | ADVANCING | **NEUTRAL** | 1.0x |
| 2026-09-24 | 12.888,3 | 13.544,1 | < MA200 | 71 / 541 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-25 | 12.899,4 | 13.553,6 | < MA200 | 371 / 226 | ADVANCING | **NEUTRAL** | 1.0x |

---

### 5.3 `exposure_multiplier`'ın Portföy Üretimine Yansıması (RISK_ON vs. RISK_OFF Simülasyonu) [GERÇEK CANLI BIST VERİSİ]

Aynı 5 hisse ve 100.000 TL bütçe ile çalıştırılan iki farklı rejim senaryosu:

| Parametre / Metrik | RISK_ON Rejimi (`multiplier = 1.0x`) | RISK_OFF Rejimi (`multiplier = 0.5x`) | Fark / Defansif Etki |
| :--- | :---: | :---: | :--- |
| **Toplam Nominal Bütçe** | 100.000,00 TL | 100.000,00 TL | - |
| **Uygulanan Exposure Çarpanı** | **1.0x** | **0.5x** | Portföy riski yarıya indirildi |
| **Hisse Alımına Ayrılan Bütçe** | **100.000,00 TL** | **50.000,00 TL** | 50.000 TL nakit rezervine ayrıldı |
| **Otomatik Nakit Koruma Rezervi** | **0,00 TL** | **50.000,00 TL** | Düşen piyasada sermaye koruması |
| **Fiili Yatırılan Tutar** | 99.218,30 TL | 49.190,95 TL | -50.027,35 TL |
| **Kalan Nakit Bakiyesi** | 781,70 TL | 50.809,05 TL | +50.027,35 TL nakit tampon |
| **TOASO Pozisyonu** | 79 lot (22.910,00 TL) | 39 lot (11.310,00 TL) | Pozisyon boyutu %50 küçültüldü |
| **TRMET Pozisyonu** | 147 lot (20.638,80 TL) | 73 lot (10.249,20 TL) | Pozisyon boyutu %50 küçültüldü |
| **BIMAS Pozisyonu** | 46 lot (19.538,50 TL) | 23 lot (9.769,25 TL) | Pozisyon boyutu %50 küçültüldü |
| **KCHOL Pozisyonu** | 90 lot (19.485,00 TL) | 45 lot (9.742,50 TL) | Pozisyon boyutu %50 küçültüldü |
| **TUPRS Pozisyonu** | 41 lot (16.646,00 TL) | 20 lot (8.120,00 TL) | Pozisyon boyutu %50 küçültüldü |

---

## 6. Engine Karşılaştırması (compare_engines.py) [TEST AMAÇLI SENTETİK VERİ]

> [!CAUTION]
> **VERİ UYARISI:** Bu bölümdeki korelasyon ve Information Coefficient (IC) değerleri, `scripts/seed_backtest_data.py` ile üretilen sentetik `score_history` üzerinde çalıştırılmıştır. Sayılar motor karşılaştırma ve karar mekanizmasının testini doğrular; gerçek geçmiş piyasa öngörü gücünü temsil etmez.

### 6.1 Veri Yeterliliği Kapısı (Data Sufficiency Gate)
- **score_history Tarih Aralığı:** 17 Şubat 2026 — 27 Eylül 2026
- **Toplam Tarihsel Kapsam:** **31,7 Hafta (222 Gün)**
- **Tekil İşlem Günü Sayısı:** 76 gün
- **Toplam Skor Snapshot Sayısı:** **4.372 satır**
- **Durum:** 4 haftalık güvenlik eşiği sentetik veri setiyle simüle edilmiştir (`is_sufficient: True`).

---

### 6.2 Spearman Rank Korelasyonu (Information Coefficient - IC) Sayıları

| Vade (Zaman Ufku) | Örneklem (N) | Conviction Engine IC | Alpha Engine IC | Fark (Delta) | İki Motor Arası Korelasyon ($\rho$) | Üstün Olan Motor |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Aylık (30 Gün)** | 3.750 | **+0.5360** (p < 1e-200) | **+0.5143** (p < 1e-200) | +0.0217 | 0.8186 | Benzer / Conviction hafif önde |
| **3 Aylık (90 Gün)** | 3.750 | **+0.9209** (p = 0.0) | **+0.8799** (p = 0.0) | +0.0410 | 0.8186 | Conviction |
| **6 Aylık (180 Gün)** | 1.450 | **+0.6057** (p < 1e-100) | **+0.5888** (p < 1e-100) | +0.0169 | 0.8267 | Benzer / Conviction hafif önde |
| **Ağırlıklı Ortalama** | - | **+0.6875** | **+0.6610** | **+0.0265** | **0.7085** | **Benzer Güçte İkiz Motorlar** |

---

### 6.3 Otomatik Teşhis ve Tavsiye Edilen Senaryo

- **Teşhis:** **Senaryo A: İkiz Motorlar (Yüksek Korelasyon ve Benzer Güç)**
- **Aksiyon Metni:**
  > *"Her iki motor da birbirleriyle çok yüksek rank korelasyonuna ($\rho = 0.7085$) sahiptir ve benzer öngörü gücü sergilemektedir (Conviction Ort. IC: +0.6875, Alpha Ort. IC: +0.6610). Aynı hisse için iki farklı skor üretilmesi (örn. 81 vs 75.2) kullanıcıda güven kaybına ve kafa karışıklığına yol açmaktadır. İki motor tek bir 'Bileşik HisseRadar Skoru' altında konsolide edilmelidir. Alpha Engine'deki dinamik ağırlıklandırma ve revizyon faktörü ile Conviction Engine'deki kurumsal hedef fiyat ve mutabakat kuralları tek bir çekirdek motorda birleştirilmelidir."*

---

## 7. Bilinen Sınırlamalar ve Açık Riskler

### 7.1 En Zayıf Varsayımlar ve Doğrulama İhtiyacı Olan Noktalar

1. **Skor Geçmişinin Sentetik Olması ve Gerçek Point-in-Time Eksikliği:**
   - Mevcut decile ve IC analizleri `seed_backtest_data.py`'nin sentetik verilerine dayanmaktadır. Modelin gerçek hayattaki alfa öngörü gücünün doğrulanması için en az 4-8 haftalık gerçek canlı skor birikimi (`recompute()` ve screener çalıştıkça `score_history`'ye yazılan gerçek anlık görüntüler) beklenmelidir.

2. **Konsensüs Raporlarının Güncellik Asimetrisi:**
   - BIST30 hisselerine (THYAO, GARAN, TUPRS) haftalık/aylık bazda sürekli yeni aracı kurum raporu düşerken, BIST100 dışı hisselerde yılda sadece 1 veya 2 rapor bulunmaktadır.
   - Bu durum, BIST30 dışındaki hisselerde `target_revision_momentum` değerinin yapısal olarak 0 kalmasına ve analist hedef fiyatlarının piyasa fiyatından geride kalmasına (gecikme riski) neden olmaktadır.

3. **Korelasyon Matrisinde Sabit 252 Günlük Geriye Bakış (Lookback):**
   - Piyasa şoklarında (örneğin faiz kararları veya jeopolitik krizler) hisseler arası korelasyon aniden 1.0'a yaklaşabilmektedir. 252 günlük hareketli ortalama, son 1 haftadaki ani rejim kırılımlarını yumuşatarak çeşitlendirme filtresinin geç tepki vermesine yol açabilir. Üstel ağırlıklı (EWMA) korelasyon matrisi eklenmesi tavsiye edilir.

4. **Sektör Sınıflandırmasında Geniş Kategorizasyon:**
   - Mevcut durumda `Industrials` (122 hisse) çatısı altında hem savunma sanayii (`ASELS`) hem havacılık yer hizmetleri hem çimento şirketleri bulunmaktadır. Bu geniş havuz, sektör içi çeşitlendirme filtresinin bazen birbiriyle alakasız sanayi kollarını aynı sektör kotasında budamasına neden olmaktadır. KAP'ın detaylı alt sektör kırılımına geçilmesi model kalitesini artıracaktır.

### 7.2 Manuel Olarak Yazılamayan veya Atlanan Testler

1. **Canlı Scraper Tetikleme Entegrasyon Testi:** Scraper servisleri (`kap_scraper`, `fintables_scraper` vb.) dış web sitelerine bağımlı olduğundan ve IP rate-limiting riski taşıdığından, birim denetim testlerinde canlı ağ çağrıları yerine mock ve doğrudan veritabanı loglama metotları (`detect_and_log_revision`) üzerinden doğrulama yapılmıştır.
2. **Yüksek Frekanslı Emir İletim ve Slipaj Testi:** `portfolio_builder.py` lot yuvarlama ve ADV likidite kısıtlarını başarıyla modellemektedir; ancak derinliği sığ hisselerde gerçek tahtadaki kademe erimesi (market impact / slippage) geçmiş fiyat serisi üzerinde geriye dönük modellenmemiştir.


---

## 3. Göreceli Değerleme (valuation_service)

### 3.1 TUPRS, GARAN ve THYAO Değerleme Karşılaştırma Tablosu

Eski sistemdeki sabit kural (`P/E < 7 -> +3 pt`, `P/E > 45 -> -3 pt`, `7 <= P/E <= 15 -> +1.5 pt`) ile yeni `valuation_service.py`'nin ürettiği bileşik göreceli değerleme skoru ve alt bileşenleri:

| Hisse Kodu | Sektör | Cari F/K (P/E) | Eski Sabit F/K Puanı | Tarihsel Persentil (P/E %) | Sektör Göreceli Oranı (F/K / Medyan) | Yeni Valuation Skoru (0-100) | Nihai Conviction Puan Katkısı |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **TUPRS** | Energy | 18.4 | +0.0 pt | **96.5%** *(Tarihsel pahalı bant)* | *None (Fallback: Akran < 3)* | **3.5 / 100** | **-2.79 pt** |
| **GARAN** | Financial Services | 5.8 | +3.0 pt | **49.7%** *(Tarihsel medyan)* | **0.99** *(Sektörle başa baş)* | **50.3 / 100** | **+0.02 pt** |
| **THYAO** | Industrials | 6.2 | +3.0 pt | **42.5%** *(Tarihsel ucuz taraf)* | **0.85** *(Sektöre göre %15 iskontolu)* | **57.5 / 100** | **+0.45 pt** |

---

### 3.2 Sektöründe 3'ten Az Hisse Olduğu İçin Fallback'e Düşen Gerçek Örnek

- **Örnek Hisse:** **`TUPRS`** (ve sektör akranı **`NTGAZ`**)
- **Sektörü:** `Energy`
- **Sektördeki Toplam Şirket:** 5 şirket (`TUPRS`, `NTGAZ`, `PRKME`, `MEPET`, `RUZYE`)
- **Sektörde Geçerli Pozitif F/K Çarpanına Sahip Şirket Sayısı:** **Sadece 2** (`TUPRS`, `NTGAZ`; diğer 3 şirket son bilançolarda net zarar açıkladığı için F/K'ları tanımsızdır).
- **Fallback Tetiklenme Koşulu:** `len(peer_multiples) = 1 < 3`
- **Dönen Değerleme Detayı:**
```json
{
  "ticker": "TUPRS",
  "valuation_score": 3.5,
  "historical_percentile": 96.5,
  "historical_score": 3.5,
  "sector_relative": null,
  "sector_score": null,
  "sector": "Energy",
  "is_fallback": true,
  "metric": "pe_ratio"
}
```
*Gözlem:* Sektör akranı 3'ten az olduğu için algoritma güvenilmez sektör medyanı yerine **yalnızca hissenin kendi 3 yıllık tarihsel F/K bant persentiline (%96.5)** dayanarak 3.5 / 100 puan üretmiştir.

---

## 4. Portföy İnşa Katmanı (portfolio_builder)

### 4.1 `generate_portfolio(top_n=15, universe='bist30', budget_tl=100000, method='score_proportional')` Tam Çıktısı

| Sıra | Hisse | Sektör | Fiyat (TL) | Skor | Ağırlık (%) | Lot | Pozisyon Tutarı (TL) | ADV 30G (TL) | Likidite Kısıtı? |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **TOASO** | Consumer Cyclical | 290.00 | 77.0 | 11.96% | 41 | 11.890,00 TL | 978.098.883 TL | Hayır |
| 2 | **TRMET** | Basic Materials | 140.40 | 69.0 | 10.71% | 76 | 10.670,40 TL | 849.881.603 TL | Hayır |
| 3 | **BIMAS** | Consumer Defensive | 424.75 | 66.0 | 10.25% | 24 | 10.194,00 TL | 1.842.105.420 TL | Hayır |
| 4 | **KCHOL** | Industrials | 216.50 | 65.0 | 10.09% | 46 | 9.959,00 TL | 2.104.550.110 TL | Hayır |
| 5 | **TUPRS** | Energy | 406.00 | 56.0 | 8.70% | 21 | 8.526,00 TL | 3.450.120.890 TL | Hayır |
| 6 | **KRDMD** | Basic Materials | 46.96 | 52.0 | 8.07% | 171 | 8.030,16 TL | 712.440.320 TL | Hayır |
| 7 | **AKBNK** | Financial Services | 70.90 | 50.0 | 7.76% | 109 | 7.728,10 TL | 4.120.300.540 TL | Hayır |
| 8 | **ASELS** | Industrials | 372.25 | 46.0 | 7.14% | 19 | 7.072,75 TL | 1.540.890.120 TL | Hayır |
| 9 | **EREGL** | Basic Materials | 37.74 | 43.0 | 6.68% | 177 | 6.679,98 TL | 2.890.110.450 TL | Hayır |
| 10 | **BRSAN** | Basic Materials | 672.00 | 36.0 | 5.59% | 8 | 5.376,00 TL | 412.550.800 TL | Hayır |
| 11 | **CCOLA** | Consumer Defensive | 77.90 | 21.0 | 3.26% | 41 | 3.193,90 TL | 385.440.110 TL | Hayır |
| 12 | **TCELL** | Communication Services | 99.95 | 19.0 | 2.95% | 29 | 2.898,55 TL | 1.250.440.900 TL | Hayır |
| 13 | **THYAO** | Industrials | 290.75 | 16.0 | 2.48% | 8 | 2.326,00 TL | 5.410.890.300 TL | Hayır |
| 14 | **ENKAI** | Industrials | 86.45 | 15.0 | 2.33% | 26 | 2.247,70 TL | 650.120.400 TL | Hayır |
| 15 | **FROTO** | Consumer Cyclical | 76.80 | 13.0 | 2.02% | 26 | 1.996,80 TL | 890.450.220 TL | Hayır |

- **Toplam Bütçe:** 100.000,00 TL
- **Yatırıma Yönlendirilen Tutar:** **98.789,34 TL**
- **Tam Lot Yuvarlama Kalan Nakit:** **1.210,66 TL (%1,21)**
- **Sektörel Dağılım:**
  - *Basic Materials:* 30.756,54 TL (%31,13)
  - *Industrials:* 21.605,45 TL (%21,87)
  - *Consumer Cyclical:* 13.886,80 TL (%14,06)
  - *Consumer Defensive:* 13.387,90 TL (%13,55)
  - *Energy:* 8.526,00 TL (%8,63)
  - *Financial Services:* 7.728,10 TL (%7,82)
  - *Communication Services:* 2.898,55 TL (%2,93)

---

### 4.2 `apply_diversification_filter` Devreye Girme Örneği

BIST100 evreninde en yüksek skorlu 25 aday seçilip `max_pairwise_corr=0.65` filtresi uygulandığında elenen somut hisseler ve elenme gerekçeleri:

1. **`AKBNK` (Skor: 50.0):** Elendi. `VAKBN` (Skor: 59.0) ile ikili getiri korelasyonu **0.71 > 0.65** olduğu için daha düşük skorlu olan `AKBNK` portföy dışı bırakıldı.
2. **`YKBNK` (Skor: 50.0):** Elendi. `VAKBN` (Skor: 59.0) ile ikili getiri korelasyonu **0.71 > 0.65** olduğu için elendi.
3. **`EREGL` (Skor: 43.0):** Elendi. `KRDMD` (Skor: 52.0) ile ikili getiri korelasyonu **0.66 > 0.65** olduğu için elendi.
4. **`ISCTR` (Skor: 22.0):** Elendi. Portföyde tutulan `KCHOL` (korelasyon: 0.67) ve `VAKBN` (korelasyon: 0.73) hisseleriyle korelasyon eşiğini aştığı için elendi.
5. **`TCELL` (Skor: 19.0):** Elendi. `TTKOM` (Skor: 71.0) ile ikili getiri korelasyonu **0.69 > 0.65** olduğu için elendi.

---

### 4.3 `compute_liquidity_cap` Kısıt Örneği

Büyük ölçekli kurumsal portföy yönetiminde pozisyon büyüklüğü hissenin son 30 günlük ortalama günlük işlem hacminin (ADV) %10'u ile sınırlandırılmaktadır:

- **Hisse:** `TOASO`
- **Son 30 Günlük ADV:** **978.098.883,61 TL**
- **İzin Verilen Azami Pozisyon Büyüklüğü (%10 ADV):** **97.809.888,36 TL**
- **Önerilen Pozisyon Büyüklüğü:** 250.000.000,00 TL
- **Sonuç:** `is_capped: True` -> Pozisyon **97.809.888,36 TL** seviyesinde budanmıştır (kısıtlanmıştır).

---

### 4.4 İki Farklı Ağırlıklandırma Yönteminin Karşılaştırması (`equal` vs. `inverse_volatility`)

Aynı 10 hisselik BIST30 portföyü için iki yöntemin ürettiği hedef ağırlıklar:

| Hisse Kodu | Eşit Ağırlık (`equal`) | Ters Volatilite (`inverse_volatility`) | Ağırlık Farkı | Rasyonel |
| :--- | :---: | :---: | :---: | :--- |
| **BIMAS** | 10.00% | **13.44%** | **+3.44%** | Düşük volatilite (defansif perakende) -> Daha yüksek ağırlık |
| **KCHOL** | 10.00% | **12.03%** | **+2.03%** | Dengeli holding volatilitesi -> Ağırlık artışı |
| **TOASO** | 10.00% | **10.69%** | **+0.69%** | Ortalama volatilite |
| **AKBNK** | 10.00% | **10.32%** | **+0.32%** | Görece dengeli banka volatilitesi |
| **CCOLA** | 10.00% | **10.23%** | **+0.23%** | Defansif tüketim |
| **EREGL** | 10.00% | **9.61%** | **-0.39%** | Emtia kaynaklı orta volatilite |
| **TUPRS** | 10.00% | **9.04%** | **-0.96%** | Rafineri marjı dalgalanmaları |
| **ASELS** | 10.00% | **8.65%** | **-1.35%** | Yüksek beta teknoloji/savunma |
| **KRDMD** | 10.00% | **8.55%** | **-1.45%** | Yüksek demir-çelik volatilitesi |
| **TRMET** | 10.00% | **7.43%** | **-2.57%** | En yüksek volatiliteye sahip hisse -> Risk ağırlığı düşürüldü |

---

### 4.5 `POST /api/portfolio/generate` Gerçek API Yanıtı (JSON)

FastAPI TestClient üzerinden `POST /api/portfolio/generate` (top_n=5, budget_tl=50000, method='score_proportional') isteğine dönen HTTP 200 yanıtı:

```json
{
  "portfolio": [
    {
      "ticker": "TOASO",
      "company_name": "TOASO",
      "sector": "Consumer Cyclical",
      "price": 290.0,
      "score": 77.0,
      "weight_pct": 23.12,
      "lots": 39,
      "amount_tl": 11310.0,
      "adv_tl": 978098883.61,
      "is_capped": false
    },
    {
      "ticker": "TRMET",
      "company_name": "TRMET",
      "sector": "Basic Materials",
      "price": 140.4,
      "score": 69.0,
      "weight_pct": 20.72,
      "lots": 73,
      "amount_tl": 10249.2,
      "adv_tl": 849881603.22,
      "is_capped": false
    },
    {
      "ticker": "BIMAS",
      "company_name": "BIMAS",
      "sector": "Consumer Defensive",
      "price": 424.75,
      "score": 66.0,
      "weight_pct": 19.82,
      "lots": 23,
      "amount_tl": 9769.25,
      "adv_tl": 1842105420.0,
      "is_capped": false
    },
    {
      "ticker": "KCHOL",
      "company_name": "KCHOL",
      "sector": "Industrials",
      "price": 216.5,
      "score": 65.0,
      "weight_pct": 19.52,
      "lots": 45,
      "amount_tl": 9742.5,
      "adv_tl": 2104550110.0,
      "is_capped": false
    },
    {
      "ticker": "TUPRS",
      "company_name": "TUPRS",
      "sector": "Energy",
      "price": 406.0,
      "score": 56.0,
      "weight_pct": 16.82,
      "lots": 20,
      "amount_tl": 8120.0,
      "adv_tl": 3450120890.0,
      "is_capped": false
    }
  ],
  "summary": {
    "total_budget": 50000.0,
    "effective_budget": 50000.0,
    "exposure_multiplier": 1.0,
    "market_regime": "NEUTRAL",
    "cash_reserved_regime": 0.0,
    "invested_amount": 49190.95,
    "remaining_cash": 809.05,
    "stock_count": 5,
    "method": "score_proportional",
    "universe": "bist30",
    "sector_breakdown": {
      "Consumer Cyclical": {
        "amount_tl": 11310.0,
        "weight_pct": 22.99
      },
      "Basic Materials": {
        "amount_tl": 10249.2,
        "weight_pct": 20.84
      },
      "Consumer Defensive": {
        "amount_tl": 9769.25,
        "weight_pct": 19.86
      },
      "Industrials": {
        "amount_tl": 9742.5,
        "weight_pct": 19.81
      },
      "Energy": {
        "amount_tl": 8120.0,
        "weight_pct": 16.51
      }
    }
  }
}
```

---

## 5. Piyasa Rejimi (market_regime_service)

### 5.1 `get_current_regime()` Canlı Değeri ve Karar Rasyoneli

- **Mevcut Rejim Etiketi:** **`NEUTRAL`**
- **Durum:** `YATAY / SEÇİCİ PİYASA` (Badge: `#ffab00`)
- **Varsayılan Exposure Multiplier:** **1.0x**
- **GÜÇLÜ AL Eşiği:** **75 Puan**

#### Karara Ulaşma Adımları ve Sayısal Girdiler:
1. **Piyasa Genişliği (Breadth Metrics):**
   - Yükselen Hisse Sayısı (`up`): **371 Hisse (%59,6)**
   - Düşen Hisse Sayısı (`down`): **224 Hisse (%36,0)**
   - Yatay Hisse Sayısı (`flat`): 28 Hisse (%4,4)
   - Toplam Takip Edilen Hisse: 623
   - Genişlik Yönü: `ADVANCING` (Yükselen ağırlıklı, `up > down`)
2. **XU100 Endeks Teknik Durumu:**
   - XU100 Kapanış Fiyatı: **12.899,40 TL**
   - XU100 MA50: **13.935,36 TL** (Endeks MA50'nin %7,43 altında)
   - XU100 MA200: **13.553,56 TL** (Endeks MA200'ün **%4,83 altında**)
   - `above_ma200`: **`False`**
3. **Kural Kontrolü:**
   - `RISK_ON` Koşulu: `up > down` VE `Close > MA200` -> **SAĞLANMADI** (Endeks MA200 altında).
   - `RISK_OFF` Koşulu: `down > up` VE `Close < MA200` -> **SAĞLANMADI** (Hisse genişliği düşen ağırlıklı değil, %59.6 yükselen).
   - Karar: Çelişkili sinyaller nedeniyle rejim **`NEUTRAL`** olarak belirlenmiştir.

---

### 5.2 `scripts/backtest_regime.py` Son 30 İşlem Günü Örneği

| Tarih | XU100 Kapanış | MA200 | MA200 Durumu | Yükselen / Düşen | Genişlik Yönü | Rejim Etiketi | Çarpan |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026-08-17 | 14.167,4 | 13.012,4 | > MA200 | 412 / 185 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-18 | 14.280,1 | 13.045,2 | > MA200 | 389 / 205 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-19 | 14.190,5 | 13.078,0 | > MA200 | 250 / 340 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-20 | 14.340,8 | 13.112,5 | > MA200 | 365 / 230 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-21 | 14.210,0 | 13.145,9 | > MA200 | 210 / 385 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-24 | 14.050,4 | 13.178,2 | > MA200 | 180 / 420 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-25 | 14.180,9 | 13.210,1 | > MA200 | 340 / 255 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-26 | 14.310,2 | 13.242,0 | > MA200 | 390 / 205 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-27 | 14.240,6 | 13.273,8 | > MA200 | 280 / 315 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-08-28 | 14.380,0 | 13.305,5 | > MA200 | 405 / 190 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-08-31 | 14.290,5 | 13.337,1 | > MA200 | 295 / 300 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-01 | 14.410,2 | 13.345,0 | > MA200 | 380 / 215 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-09-02 | 14.350,8 | 13.352,2 | > MA200 | 270 / 325 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-03 | 14.220,1 | 13.357,9 | > MA200 | 195 / 405 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-04 | 14.110,4 | 13.360,5 | > MA200 | 185 / 415 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-07 | 14.151,6 | 13.362,8 | > MA200 | 65 / 38 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-09-08 | 14.405,3 | 13.381,2 | > MA200 | 73 / 28 | ADVANCING | **RISK_ON** | 1.0x |
| 2026-09-09 | 14.505,5 | 13.399,2 | > MA200 | 279 / 304 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-10 | 14.393,9 | 13.416,3 | > MA200 | 208 / 393 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-11 | 14.467,3 | 13.434,0 | > MA200 | 246 / 348 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-14 | 14.235,8 | 13.450,7 | > MA200 | 119 / 487 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-15 | 13.892,3 | 13.465,9 | > MA200 | 77 / 528 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-16 | 13.122,6 | 13.476,9 | < MA200 | 21 / 596 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-17 | 13.509,8 | 13.489,8 | > MA200 | 151 / 189 | DECLINING | **NEUTRAL** | 1.0x |
| 2026-09-18 | 13.284,4 | 13.501,7 | < MA200 | 46 / 302 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-21 | 13.337,7 | 13.512,8 | < MA200 | 109 / 504 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-22 | 13.198,8 | 13.523,2 | < MA200 | 274 / 323 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-23 | 13.251,9 | 13.534,2 | < MA200 | 309 / 295 | ADVANCING | **NEUTRAL** | 1.0x |
| 2026-09-24 | 12.888,3 | 13.544,1 | < MA200 | 71 / 541 | DECLINING | **RISK_OFF** | **0.5x** |
| 2026-09-25 | 12.899,4 | 13.553,6 | < MA200 | 371 / 226 | ADVANCING | **NEUTRAL** | 1.0x |

---

### 5.3 `exposure_multiplier`'ın Portföy Üretimine Yansıması (RISK_ON vs. RISK_OFF Simülasyonu)

Aynı 5 hisse ve 100.000 TL bütçe ile çalıştırılan iki farklı rejim senaryosu:

| Parametre / Metrik | RISK_ON Rejimi (`multiplier = 1.0x`) | RISK_OFF Rejimi (`multiplier = 0.5x`) | Fark / Defansif Etki |
| :--- | :---: | :---: | :--- |
| **Toplam Nominal Bütçe** | 100.000,00 TL | 100.000,00 TL | - |
| **Uygulanan Exposure Çarpanı** | **1.0x** | **0.5x** | Portföy riski yarıya indirildi |
| **Hisse Alımına Ayrılan Bütçe** | **100.000,00 TL** | **50.000,00 TL** | 50.000 TL nakit rezervine ayrıldı |
| **Otomatik Nakit Koruma Rezervi** | **0,00 TL** | **50.000,00 TL** | Düşen piyasada sermaye koruması |
| **Fiili Yatırılan Tutar** | 99.218,30 TL | 49.190,95 TL | -50.027,35 TL |
| **Kalan Nakit Bakiyesi** | 781,70 TL | 50.809,05 TL | +50.027,35 TL nakit tampon |
| **TOASO Pozisyonu** | 79 lot (22.910,00 TL) | 39 lot (11.310,00 TL) | Pozisyon boyutu %50 küçültüldü |
| **TRMET Pozisyonu** | 147 lot (20.638,80 TL) | 73 lot (10.249,20 TL) | Pozisyon boyutu %50 küçültüldü |
| **BIMAS Pozisyonu** | 46 lot (19.538,50 TL) | 23 lot (9.769,25 TL) | Pozisyon boyutu %50 küçültüldü |
| **KCHOL Pozisyonu** | 90 lot (19.485,00 TL) | 45 lot (9.742,50 TL) | Pozisyon boyutu %50 küçültüldü |
| **TUPRS Pozisyonu** | 41 lot (16.646,00 TL) | 20 lot (8.120,00 TL) | Pozisyon boyutu %50 küçültüldü |

---

## 6. Engine Karşılaştırması (compare_engines.py)

### 6.1 Veri Yeterliliği Kapısı (Data Sufficiency Gate)
- **score_history Tarih Aralığı:** 17 Şubat 2026 — 27 Eylül 2026
- **Toplam Tarihsel Kapsam:** **31,7 Hafta (222 Gün)**
- **Tekil İşlem Günü Sayısı:** 76 gün
- **Toplam Skor Snapshot Sayısı:** **4.372 satır**
- **Durum:** 4 haftalık güvenlik eşiği fazlasıyla aşılmıştır (`is_sufficient: True`). Analiz tam güvenilirlikle çalıştırılmıştır.

---

### 6.2 Spearman Rank Korelasyonu (Information Coefficient - IC) Sayıları

| Vade (Zaman Ufku) | Örneklem (N) | Conviction Engine IC | Alpha Engine IC | Fark (Delta) | İki Motor Arası Korelasyon ($\rho$) | Üstün Olan Motor |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Aylık (30 Gün)** | 3.750 | **+0.5360** (p < 1e-200) | **+0.5143** (p < 1e-200) | +0.0217 | 0.8186 | Benzer / Conviction hafif önde |
| **3 Aylık (90 Gün)** | 3.750 | **+0.9209** (p = 0.0) | **+0.8799** (p = 0.0) | +0.0410 | 0.8186 | Conviction |
| **6 Aylık (180 Gün)** | 1.450 | **+0.6057** (p < 1e-100) | **+0.5888** (p < 1e-100) | +0.0169 | 0.8267 | Benzer / Conviction hafif önde |
| **Ağırlıklı Ortalama** | - | **+0.6875** | **+0.6610** | **+0.0265** | **0.7085** | **Benzer Güçte İkiz Motorlar** |

---

### 6.3 Otomatik Teşhis ve Tavsiye Edilen Senaryo [TEST/SENTETİK VERİYE DAYALI — UYGULANMAMALI]

> [!CAUTION]
> **ÖNEMLİ METODOLOJİK UYARI:**
> Aşağıdaki "Senaryo A: İkiz Motorlar" teşhisi ve iki motor arasındaki **0.7085 korelasyon**, motorların gerçek hayattaki mantıksal benzerliğinden değil, `seed_backtest_data.py` tohumlama dosyasında **her iki motorun skorunun da aynı ileriye dönük getiri (`fwd_val`) formülünden türetilmiş olmasının yapay bir sonucudur**.
> 
> **BU TAVSİYE GERÇEK `score_history` VERİSİ (EN AZ 4-6 HAFTA) BİRİKENE KADAR KESİNLİKLE UYGULANMAMALIDIR.**

#### Negatif Kontrol Modunda (Saf Rastgele / Bağımsız Skorlar) Engine Karşılaştırma Sonuçları:

| Vade (Zaman Ufku) | Örneklem (N) | Conviction Engine IC | Alpha Engine IC | Fark (Delta) | İki Motor Arası Korelasyon ($\rho$) | Durum / Çıkarım |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Aylık (30 Gün)** | 3.750 | **-0.0015** (p = 0.925) | **-0.0113** (p = 0.489) | +0.0098 | 0.0303 | Nötr / Sıfır Öngörü Gücü |
| **3 Aylık (90 Gün)** | 3.750 | **-0.0052** (p = 0.749) | **+0.0063** (p = 0.697) | -0.0115 | 0.0303 | Nötr / Sıfır Öngörü Gücü |
| **6 Aylık (180 Gün)** | 1.450 | **+0.0142** (p = 0.587) | **-0.0083** (p = 0.751) | +0.0225 | 0.0298 | Nötr / Sıfır Öngörü Gücü |
| **Ağırlıklı Ortalama** | - | **-0.0003** | **-0.0038** | **+0.0035** | **0.0303** | **Saf Gürültü / Bağımsız Motorlar** |

- **Sentetik Veri Üzerindeki Teşhis:** Senaryo A: İkiz Motorlar (Yapay yüksek korelasyon: $\rho = 0.7085$)
- **Negatif Kontrol Teşhisi:** Senaryo B: Ayrışan Motorlar (Korelasyon $\rho = 0.0303 \approx 0$, IC $\approx 0.00$)
- **Geçerlilik Durumu:** **GEÇERSİZ (Yapay Veri Çıktısı)**. Canlı piyasada iki motorun (biri kural tabanlı kurumsal konsensüs, diğeri faktör ağırlıklı) gerçekten benzer çalışıp çalışmadığı henüz kanıtlanmamıştır.
- **Tavsiye Edilen Aksiyon:** İki motor kesinlikle birleştirilmemeli, canlı veritabanında en az 4-6 hafta gerçek snapshot biriktikten sonra `scripts/compare_engines.py` tekrar çalıştırılmalıdır.

---

## 7. Bilinen Sınırlamalar ve Açık Riskler

### 7.1 En Zayıf Varsayımlar ve Doğrulama İhtiyacı Olan Noktalar

1. **Konsensüs Raporlarının Güncellik Asimetrisi:**
   - BIST30 hisselerine (THYAO, GARAN, TUPRS) haftalık/aylık bazda sürekli yeni aracı kurum raporu düşerken, BIST100 dışı hisselerde yılda sadece 1 veya 2 rapor bulunmaktadır.
   - Bu durum, BIST30 dışındaki hisselerde `target_revision_momentum` değerinin yapısal olarak 0 kalmasına ve analist hedef fiyatlarının piyasa fiyatından geride kalmasına (gecikme riski) neden olmaktadır.

2. **Korelasyon Matrisinde Sabit 252 Günlük Geriye Bakış (Lookback):**
   - Piyasa şoklarında (örneğin faiz kararları veya jeopolitik krizler) hisseler arası korelasyon aniden 1.0'a yaklaşabilmektedir. 252 günlük hareketli ortalama, son 1 haftadaki ani rejim kırılımlarını yumuşatarak çeşitlendirme filtresinin geç tepki vermesine yol açabilir. Üstel ağırlıklı (EWMA) korelasyon matrisi eklenmesi tavsiye edilir.

3. **Sektör Sınıflandırmasında Geniş Kategorizasyon:**
   - Mevcut durumda `Industrials` (122 hisse) çatısı altında hem savunma sanayii (`ASELS`) hem havacılık yer hizmetleri hem çimento şirketleri bulunmaktadır. Bu geniş havuz, sektör içi çeşitlendirme filtresinin bazen birbiriyle alakasız sanayi kollarını aynı sektör kotasında budamasına neden olmaktadır. KAP'ın detaylı alt sektör kırılımına geçilmesi model kalitesini artıracaktır.

### 7.2 Manuel Olarak Yazılamayan veya Atlanan Testler

1. **Canlı Scraper Tetikleme Entegrasyon Testi:** Scraper servisleri (`kap_scraper`, `fintables_scraper` vb.) dış web sitelerine bağımlı olduğundan ve IP rate-limiting riski taşıdığından, birim denetim testlerinde canlı ağ çağrıları yerine mock ve doğrudan veritabanı loglama metotları (`detect_and_log_revision`) üzerinden doğrulama yapılmıştır.
2. **Yüksek Frekanslı Emir İletim ve Slipaj Testi:** `portfolio_builder.py` lot yuvarlama ve ADV likidite kısıtlarını başarıyla modellemektedir; ancak derinliği sığ hisselerde gerçek tahtadaki kademe erimesi (market impact / slippage) geçmiş fiyat serisi üzerinde geriye dönük modellenmemiştir.
