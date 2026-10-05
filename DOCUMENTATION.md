# HisseRadarPro v3.0 — Ultimate System Anatomy & Architecture Deep Dive

> **Son güncelleme:** 2026-09-26  
> **Evren:** 622 hisse (BIST Sabit Evreni)  
> **Geliştirici Notu:** Bu dokümantasyon, HisseRadarPro sisteminin her bir satır kodunun, hesaplama mantığının, AI entegrasyonlarının, scraper (veri toplayıcı) güvenlik atlatmalarının ve Arayüz (Frontend) state yönetiminin milimetrik detaylarını içerir. 

---

## 1. Mimari Genel Bakış ve Teknoloji Yığını

HisseRadarPro, Borsa İstanbul (BIST) pay senetlerini analiz etmek için geliştirilmiş, mikroservis benzeri "daemon thread" mimarisine sahip kurumsal düzeyde bir analiz platformudur.

### Teknoloji Yığını (Tech Stack)
*   **Backend:** Python 3.11, FastAPI (Asenkron API sunucusu), `uvicorn` (Port: 8015).
*   **Frontend:** React 18, Vite (Port: 5173), saf CSS (Glassmorphism & Neon UI bileşenleri).
*   **Veritabanı Katmanı:** SQLite (`scraped_reports.db`) performans için PRAGMA WAL modu ile çalıştırılır ve felaket kurtarma için `scraped_reports.json` ile anlık (atomic) yedeklenir.
*   **Web Scraping & Anti-Bot:** `undetected_chromedriver` (v153), BeautifulSoup, `requests`.
*   **Yapay Zeka (LLM):** Google Gemini (`gemini-3.6-flash` ana model, `gemini-flash-lite-latest` fallback model).
*   **Finansal Veri Sağlayıcıları:** `yfinance` (Temel ve tarihsel fiyat verileri), TradingView (Teknik Analiz).

---

## 2. FastAPI Backend Çekirdeği (`main.py`)

Sunucu, `contextlib.asynccontextmanager` ile yazılmış bir lifespan üzerinden asenkron başlatılır. Sunucu ayağa kalkarken sırasıyla:
1.  **JSON Cache Yüklemesi:** `load_static_json_cache()` fonksiyonu eski `models.json` dosyasını belleğe alır.
2.  **Thread'lerin Uyanması:** `price_service.start_background_worker()` ve `start_ta_sync_worker()` çağrılarak 15 dakikada bir veri çeken sonsuz döngü (while True) arka plan işlemleri (daemon=True) ayağa kalkar.
3.  **Engine Tetiklemeleri:** `conviction_engine.recompute()` ve `alpha_engine._generate_screener()` çalıştırılarak puanlama sistemleri hesaplanır.
4.  **CORS & Statik Mount:** `/assets` ve `/logos` gibi dizinler statik olarak mount edilir. API olmayan tüm istekler `index.html`'e yönlendirilerek React Router'ın (SPA) çalışması sağlanır.
5.  **SSE (Server-Sent Events):** Frontend'deki "Verileri Senkronize Et" butonuna basıldığında `/api/scraped-reports/stream-scrape` endpoint'i üzerinden Python `yield` anahtar kelimesiyle frontend'e canlı log akışı sağlanır (`event.data === "[DONE]"` ile sonlandırılır).

---

## 3. Veritabanı Mimarisi (`db_manager.py`)

Veritabanı yöneticisi `ReportDBManager`, `threading.Lock()` kullanarak eşzamanlı erişimleri (Concurrency) güvenli hale getirir. 

### 3.1 Performans (PRAGMA) Ayarları
```sql
PRAGMA journal_mode=WAL;
PRAGMA cache_size=-8000;
PRAGMA synchronous=NORMAL;
```
Bu ayarlar, SQLite'ın okuma-yazma kilitlenmelerini (database is locked) önleyerek arka plandaki scraper'ların veri yazarken bile kullanıcıların (frontend) sorunsuz okuma yapabilmesini (WAL = Write-Ahead Logging) sağlar. 8 MB'lık RAM cache tahsis edilmiştir.

### 3.2 Tablo Şemaları ve Görevleri
Sistemde 5 ana tablo mevcuttur:
1.  **`scraped_reports`:** Aracı kurumların hisse önerilerini tutar. Performans için `ticker`, `broker`, `rating` ve `report_date` sütunlarına B-Tree Index (`CREATE INDEX`) atılmıştır.
2.  **`company_info`:** `yfinance` üzerinden çekilen bilanço ve rasyoları `fundamentals_json` ve `technical_analysis_json` sütunlarında string olarak (JSON serialize) tutar.
3.  **`historical_prices`:** Hisse başına 1 yıllık Günlük (D) OHLCV (Açılış, Yüksek, Düşük, Kapanış, Hacim) verisini tutar. Bileşik (Composite) Primary Key: `(ticker, date)` kullanır.
4.  **`user_portfolio`:** Kullanıcının portföyündeki hisseleri (`quantity` ve `cost`) saklar.
5.  **`portfolio_transactions`:** Her alım (BUY) ve satım (SELL) işleminde bir log kaydı oluşturarak `tx_date`, `price` ve `quantity` tutar.

### 3.3 Veri Bütünlüğü ve Banned Brokers (Filtreleme)
Borsa İstanbul ekosisteminde çok sık spekülatif veya eksik rapor çıkaran, analiz kalitesi düşük aracı kurumlar sisteme girmeden "Hard Reject" yer.
*   **Yasaklı Kurumlar Kümesi:** `{"pusula", "tera", "a1 capital", "atlas", "info", "bulls", "trive", "pardus"}`
*   **Algoritma:** `is_broker_banned()` fonksiyonu, `normalize_broker_name()` (Akbank -> Ak Yatırım gibi standartlaştırmalar) işleminden sonra kurum isminde bu yasaklı kelimelerden biri geçiyorsa raporu tamamen bloklar. Bu durum, "Conviction Engine"in ortalamasının bu spekülatif verilerle bozulmasını engeller.

---

## 4. Ticker Yönetimi ve Sağlık Monitörü (`ticker_resolver.py` & `ticker_health_service.py`)

Sistemde sonsuz bir hisse kümesi yoktur, yalnızca `all_bist.txt` içerisindeki onaylı **622 hisse** kabul edilir.

### 4.1 Alias (Eş Anlamlı) Haritalaması (Ticker Mapping)
Kurumlar bazen şirketlerin eski adlarını veya iştirak isimlerini rapora yazarlar. Bunu önlemek için devasa bir dictionary eşleştirmesi kullanılır:
*   "Koza Altın" / "Türk Altın" -> `TRALT`
*   "Graintürk" -> `GRTHO`
*   "Doğuş Otomotiv" -> `DOAS`
Bu sayede scraper farklı yazım hatalarını yakalasa bile veritabanına tek bir kural (canonical_ticker) üzerinden yazılır.

### 4.2 Ticker Health Service (Sağlık Monitörü)
Geceleri çalışan `identify_non_equity_instrument()` metodu, `company_info` tablosunu tarayarak borsada işlem gören gerçek hisseler haricindeki araçları tespit edip eler.
*   **Tespit Mantığı:** Eğer bir sembol "ISKUR", "DMLKTG" (Gayrimenkul Sertifikası) ise veya isimde "VARANT", "FONU", "CERTIFICATE" geçiyorsa o varlık `NON_EQUITY_INSTRUMENT` olarak işaretlenir ve arayüzde analiz edilmesi engellenir. Eğer hisse kapanış verisi 30 günden eskiyse `STALE` (Veri Gelmiyor) olarak işaretlenir.

---

## 5. Veri Toplama Motorları (Scraper Pipelines)

### 5.1 Fintables Scraper: Undetected ChromeDriver (v2.0 Devrimi)
Önceki versiyonda kullanılan Playwright tabanlı yapı, Cloudflare'in Turnstile (Just a moment...) bot koruması tarafından tespit edilip engellendiği için, kod `undetected_chromedriver` (v153) kullanacak şekilde baştan yazılmıştır.
*   **Anti-Bot Taktikleri:** 
    1. Sistemde yüklü olan Chrome ile birebir aynı sürüm (v153) taklit edilir.
    2. Tarayıcıyı `-32000,-32000` X,Y koordinatlarına atayarak (window position), kullanıcıyı rahatsız etmeden tamamen arkaplanda çalışması sağlanır. Başsız (Headless) mod kullanılmaz, çünkü Headless mod `navigator.webdriver = true` flag'i ile Cloudflare tarafından hemen anlaşılır.
    3. `THYAO` hissesine gidilerek 12 döngülük (max 60 saniye) bir bekleme (warm-up) ile Cloudflare çerezi elde edilir.
*   **React DOM Polling:** Fintables veriyi HTML olarak sunmaz, sayfa yüklendikten sonra API'den JavaScript ile JSON çeker ve DOM'u günceller. Scraper, `time.sleep(5)` beklemek yerine, `page_source` içerisindeki `</td>` sayısını sayar. Eğer 5'ten fazla hücre oluştuysa verinin geldiğini anlar ve beklemeden taramaya başlar (Büyük oranda hız artışı).
*   **Regex ve Parse Mantığı:** 
    `parse_fintables_number` fonksiyonu; string içerisindeki boşluk, '%' işareti ve yazıları temizleyip Türkçe olan virgül (`,`) ayracını noktaya (`.`) çevirerek float değişkene döndürür.
*   **Tarih Filtresi (Data Pruning):** 
    Scraper içerisine eklenen kural: `if report_date < "2026-01-01": continue`
    Bu kural string'lerin leksikografik (lexicographical) doğasını kullanarak, 2026 yılı öncesine ait binlerce çöp raporun veritabanına yazılmasını önler. Yalnızca 2026 yılı ve sonrasındaki (taze) raporlar alınır.

### 5.2 YFinance Senkronizasyonu (`yf_sync.py`)
*   Borsadaki 622 hissenin 1 yıllık (1y) Günlük (1d) OHLCV (Açılış, Kapanış, Hacim) verisini çeker. 
*   Eğer sıfırdan çekiliyorsa `run_sync_all()` çalışır. Veritabanı doluysa `run_incremental_sync()` çalışarak, DB'deki son tarihten (`MAX(date)`) itibaren bugüne kadar olan kısmi günleri çeker (Network tasarrufu).
*   **Hata Yönetimi:** Kapanmış (Delist) hisseler "No data found for X" fırlattığında, log ekranını kirletmemek için `logging.getLogger("yfinance").setLevel(logging.CRITICAL)` ile terminal sessize alınmıştır.

---

## 6. HisseRadar Skoru ve Teknik Analiz Laboratuvarı (`ta_lab.py`, `conviction_engine.py`)

Skora yalnızca örneklem dışında işe yaradığı gösterilen bilgi girer. Eski puan sistemi (kurumsal 26, değerleme 32, teknik 20 puan gibi elle ayarlanmış ağırlıklar) 2015-2026 BIST verisiyle test edildiğinde desteklenmedi ve kaldırıldı.

### 6.1 Veri ve göstergeler
* `historical_prices` OHLCV, ±%30 üzeri günlük hareketler (bölünme/bedelsiz) nötrlenerek düzeltilmiş tek bir fiyat bazına çevrilir; açılış/yüksek/düşük aynı bazla ölçeklenir. XU100 1997'den beri tam.
* Hisse ve gün başına: SMA20/50/150/200 ve eğimleri, Wilder RSI(14) ve RSI(2), ATR(14), ADX/+DI/-DI, MACD, Bollinger genişliği ve sıkışma, 52 hafta aralığı, Donchian 55, IBD tarzı göreli güç notu (3-6-9-12 ay 40/20/20/20), XU100'e göre RS çizgisi, yükseliş/düşüş hacmi oranı, hacim artışı, cep pivotu.
* **Weinstein evresi:** 150 günlük ortalamanın eğimi XU100'ün aynı dönemdeki eğiminden çıkarılır (enflasyon kaynaklı genel yükselişi ayıklamak için); 1 taban, 2 yükseliş, 3 tepe, 4 düşüş.
* **Minervini trend şablonu:** 8 koşul (ortalama sıralaması, SMA200 eğimi, 52 hafta dibine/zirvesine uzaklık); göreli güç ayrıca kontrol edilir.
* Likit evren: 20 günlük ortalama işlem hacmi en az 2 milyon TL, en az 200 seanslık geçmiş, fiyat en az 1 TL.

### 6.2 Sinyal karneleri
* 31 klasik sinyal (evre geçişleri, altın/ölüm kesişimi, 52 hafta ve kanal kırılımları, sıkışma kırılımı, RS çizgisi, MACD, RSI aşırı alım/satım, geri çekilmeler, birikim/dağıtım, cep pivotu, hacimli boşluk).
* Her sinyal için ertesi kapanıştan girişle 5/20/60 seanslık, likit eşit ağırlıklı evrene göre fazla getiri; isabet oranı; aylara göre kümelenmiş t değeri; pozitif yıl oranı; XU100'ün 200 günlük ortalamasının üstü/altı rejimlerinde ayrı sonuç.
* Hüküm: t ≥ 3 ve yılların %60'ı pozitif ise güçlü olumlu; t ≥ 2 olumlu; simetrik olarak olumsuz; arası "kanıt yok". Klasik yorumu tersine çıkan sinyaller işaretlenir (ör. RSI 30 altı BIST'te olumsuz, RSI 70 üstü olumlu).

### 6.3 Model
* Gradyan artırmalı karar ağaçları (scikit-learn HistGradientBoosting): 30 göstergenin günlük kesitsel sırası (trend, 52 hafta konumu, göreli güç, sektör momentumu, volatilite/risk: en büyük günlük artış, çarpıklık, beta, hisseye özgü oynaklık; hacim/likidite: Amihud, işlem hacmi; gece/seans içi getiri) + 5 piyasa koşulu (genişlik, XU100-SMA200, XU100 1 ay, piyasa oynaklığı, küçük hisselerin göreli gücü) + 31 sinyal bayrağı → sonraki 20 seansın fazla getirisi (her gün %2-%98 aralığına kırpılmış).
* Sinyallere monoton kısıt: her eğitimde yalnızca o eğitim verisine bakılarak, anlamlı (|t| ≥ 2) sinyallerin skoru etkileyebileceği yön sabitlenir.
* Yürüyen pencere: 2019'dan itibaren her yıl, yıl başından 90 gün öncesine kadarki veriyle eğitilen modelle tahmin edilir. Örneklem dışı sonuçlar (2019-2026): IC 0,068 (t 9,4); en iyi %10 her yıl evrenin üzerinde (+1,49 puan/20 gün), en kötü %10 her yıl altında; dilimler sıralı; aylık dengelemeli en iyi %10 maliyet sonrası yıllık ~%75 (evren ~%55, en kötü %10 ~%4). Beş sürüm karşılaştırıldı; seçilen sürüm IC'yi 8 yılın 7'sinde, en iyi-en kötü farkını 8 yılın 6'sında iyileştirdi.
* Doğrusal (IC ağırlıklı) birleşim denendi ve bırakıldı: sıralamayı iyi yapsa da en iyi dilimi evrenin üzerine taşıyamadı.
* Yerel açıklama: her girdi nötr değere çekildiğinde tahminin değişimi; Trend, 52 hafta konumu, Göreli güç, Volatilite, Hacim, Osilatör gruplarında toplanır.
* Seviyeler: son ~250 seansın 5 çubuklu tepe/diplerinden, en fazla 1 ATR genişliğinde kümeler. Stop: en yakın desteğin 0,5 ATR altı (1-3 ATR aralığındaysa), değilse 2,5 ATR.
* Hesaplama ayrı bir alt süreçte yapılır (~35 sn, ~1,2 GB tepe bellek işletim sistemine geri döner), `backend/cache/ta_lab.pkl` dosyasına yazılır, her yeni seans verisiyle yenilenir.

### 6.4 HisseRadar skoru ve karar
* Skor = modelin likit hisseler arasındaki yüzdelik sırası (0-100). Bantlar: 90+ GÜÇLÜ AL (4. evrede değilse), 70-90 KADEMELİ AL, 30-70 BEKLE / İZLE, 30 altı RİSKLİ / SAT. Likit olmayan hisseler en fazla KADEMELİ AL olabilir.
* Kurum hedefi, potansiyel, kapsam, revizyonlar, sektöre göre değerleme ve model portföy bilgisi **skora girmez**, bağlam olarak gösterilir. 2026 raporlarıyla yapılan testte teknik modelin ötesinde bilgi taşımadılar (|t| < 2), yüksek potansiyel sonraki getiriyle ters yönlü çıktı. `score_evidence.py` bu testi her güncellemede tekrarlar ve Skor Karnesi'nde gösterir.
* Günlük skorlar `score_history` tablosuna `model_version = 'v3'` ile yazılır; Skor Karnesi 20 seansı dolan kayıtları gerçekleşen getiriyle karşılaştırır.

### 6.5 Uç noktalar
* `/api/ta/status`, `/api/ta/overview` (genişlik, evreler, sektör rotasyonu, model), `/api/ta/screener`, `/api/ta/signals`, `/api/ta/stock/{ticker}`, `/api/ta/scorecard`, `POST /api/ta/rebuild`.
* `/api/stocks/{ticker}/score-breakdown`: skor, grup katkıları, sinyaller, işlem planı ve skora dahil olmayan bağlam.

### 6.6 Alarmlar (`alerts.py`)
* Türler: fiyat üstü/altı, günlük değişim, skor eşiği, karar değişimi, teknik sinyal, portföy stop seviyesi. Kapsam: tek hisse, portföy veya tüm likit hisseler (türe göre).
* Fiyat/skor/karar alarmları dakikada bir, sinyal alarmları her model güncellemesinde kontrol edilir. Tek seferlik alarmlar tetiklenince kapanır; tekrarlı ve çoklu hisse alarmları her hisse için günde en fazla bir kez tetiklenir.
* Bildirimler `alert_events` tablosunda tutulur; üst bardaki zil ve (izin verilirse) tarayıcı bildirimi gösterir.

## 7. Tek skor kararı (Alpha skoru kaldırıldı)
* Alpha skoru (%30 TradingView tavsiyesi, %30 F/K-PD/DD-ROE eşikleri, %40 kurum potansiyeli/AL oranı) HisseRadar skoruyla aynı yöntemle karşılaştırıldı.
* TradingView tavsiyesi fiyat geçmişinden yeniden üretildi: 2019-2026 IC ≈ 0. Alpha'nın tam formülü 2026'da (temel veriler bugünkü değerlerle, yani alpha lehine) en iyi dilimi en kötüsünden kötü çıkardı; temel analiz parçası ters çalıştı.
* HisseRadar modeli aynı tarihlerde IC 0,087 (t 6,8). Bu yüzden tek skor HisseRadar skorudur; Alpha Insights sayfası, `alpha_engine.py` ve `/api/alpha/*` kaldırıldı. Alpha sayfasındaki geçmiş tarih testi Skor Karnesi'ne taşındı (`/api/ta/point-in-time`).

## 8. AI Service (Yapay Zeka) - Gemini Prompt Mühendisliği

Kullanıcı "Yapay Zeka Analizi" sekmesine tıkladığında `ai_service.py` modülü tetiklenir.
*   **Bağlam İnşası (Context Assembling):** Hissenin; Son fiyatı, TradingView önerisi (AL/SAT), Finansal Rasyoları (F/K, PD/DD), Zarar Kes noktası ve Konsensüs Hedefi dev bir JSON dizgesi (string) haline getirilip LLM'e (Gemini) yedirilir.
*   **Fallback Mekanizması:** İstek `gemini-3.6-flash`'a atılır. Model aşırı yüklenme (429) veya bölgesel yasak hatası verirse, kod `CANDIDATE_MODELS` listesinde yer alan `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` gibi modellere teker teker düşerek, hatasız cevabı alana kadar dener (`_generate_content_with_fallback`).
*   **Prompt (Karakter) Mühendisliği:** Modele "Sen 20 yıllık deneyimli bir Borsa İstanbul stratejistisin" direktifi verilir. 
    *   Kullanıcı **Muhafazakar** seçtiyse prompt içine borçluluk ve temettü arayışını katar.
    *   Kullanıcı **Agresif** seçtiyse RSI, Momentum ve kısa vadeli yüksek potansiyeli bulmasını ister.
    *   Modele kesinlikle "Lütfen metnin sonuna mutlaka okunaklı bir Markdown tablosu (Özet Risk-Ödül Tablosu) ekle" emri verilir.
*   **Memory Cache:** Gemini API'sine gereksiz istek atarak limitleri bitirmemek için sonuçlar 500 adetlik `_ai_summary_cache` (OrderedDict) belleğinde tutulur (LRU Cache benzeri).

---

## 9. Bölünme (Sermaye Artırımı) Tespit Modülü (`flag_stale_split_reports.py`)

Şirketler %300 bedelsiz sermaye artırımı yaptığında (Örn: 120 TL'lik hisse 30 TL'ye düşer), geçmişte verilen "150 TL Hedef Fiyat" raporları hala veritabanında olduğu için algoritmayı şaşırtarak hissenin sanki **%400 potansiyeli varmış** gibi davranmasına neden olur.
*   **Cron Job:** Gece saat 03:00'da çalışan bir Python dosyasıdır.
*   **Çalışma Mantığı:** Bütün raporları döner. Eğer `target_price > current_price * 4` (Yani potansiyel %300'den büyükse), bu durum gerçek dışı kabul edilir. (Hiçbir aracı kurum BIST'te kısa vadede %300 potansiyel vermez).
*   **Temizlik:** Bu raporların `is_stale_due_to_split` flag'i 1 yapılır (İşaretlenir) ve hesaplama döngülerinde sonsuza dek yok sayılır.

---

## 10. Frontend (Arayüz) Formülleri ve UX Mimarisi

Kullanıcı arayüzü, React (Vite.js) ile bir Single Page Application (SPA) olarak geliştirilmiştir. Sayfa geçişlerinde ekran yenilenmez, bileşenler asenkron render edilir (`React.lazy`). State yönetimi için React Hook'ları (`useState`, `useEffect`) ağırlıklı kullanılır. Koyu tema (Glassmorphism, transparanlık, blur efektleri) varsayılandır.

### 10.1 Portföye Ekleme Modülü (`AddToPortfolioModal.jsx`)
Portföy yönetimi, kullanıcının doğrudan hisse eklemesini sağlar. Geleneksel "Adet" bazlı alımın yanı sıra, uygulamada gelişmiş bir "Tutar/Bütçe (TL)" modu bulunur.
*   **Algoritma:**
    Eğer kullanıcı 10.000 TL bütçe (`targetAmount`) belirlediyse ve hissenin anlık fiyatı (`priceNum`) 23.40 TL ise;
    ```javascript
    const calculatedQtyFromAmount = Math.floor(targetAmtNum / priceNum); // Math.floor(10000 / 23.40) = 427 Adet tam lot.
    const actualTotalAmount = calculatedQtyFromAmount * priceNum; // 427 * 23.40 = 9991.80 TL (Gerçekte alınacak tutar)
    const remainingBudget = targetAmtNum - actualTotalAmount; // 10000 - 9991.80 = 8.20 TL (Artan para)
    ```
    Bu formül sayesinde, ondalıklı hisse (fractional share) kavramı Borsa İstanbul'da olmadığı için (her şey tam sayı lot üzerinden yürüdüğü için), sistem hatasız ve tam matematiksel doğrulukta bir alım hesaplar ve kalan 8.20 TL'yi kullanıcıya gösterir.

### 10.2 Finansal Tablolar ve Türkçe Çeviri (`TabFundamentals.jsx`)
`yfinance`'ten gelen çeyreklik ve yıllık bilanço/gelir tablosu verileri İngilizce stringler (Örn: `Cost Of Revenue`, `Total Revenue`, `Interest Expense`) içerir. Bunu son kullanıcıya olduğu gibi göstermek yerine, araya `financialDictionary.js` adında dev bir Mapping (Sözlük) katmanı konmuştur.
*   **Muhasebe Hiyerarşisi (Sıralama Algoritması):** 
    Sözlükteki her elemanın bir `order` değeri vardır. `Total Revenue` (Hasılat) order=10 iken, `Gross Profit` (Brüt Kar) order=30'dur. Veriler tabloya basılmadan önce:
    ```javascript
    rows.sort((a, b) => a.order - b.order)
    ```
    ile küçükten büyüğe dizilir. Böylece en üstte gelirler, ortada giderler, en altta vergi ve net kar görünecek şekilde Nizami bir SPK / UFRS gelir tablosu formu oluşturulur.
*   **Sayı Formatlama (Milyon TL'ye Çevirme):**
    ```javascript
    const formatMln = (val) => {
        if (val === null || val === undefined || isNaN(val)) return "-";
        const mln = val / 1_000_000;
        return mln.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    };
    ```
    Bilanço rakamları çok uzun olduğu için (Örn: 23,400,000,000 TL), 1 milyona bölünerek sadeleştirilir ve `toLocaleString('tr-TR')` ile Türk standardına (Nokta-Virgül ayrımı) sokulur.

---

## 11. Arka Plan Senkronizasyonu (Zamanlayıcı / Scheduler)

Projede Python'un `schedule` kütüphanesi kullanılarak bir zamanlayıcı (`scrapers/scheduler.py`) ayağa kaldırılır. Bu dosya tamamen bağımsız bir terminal process'i olarak 7/24 arkada çalışır:
*   **03:00** - `job_stale_splits()`: Gece yarısı bölünme yapan hisselerin rapor temizliğini yapar.
*   **08:30** - `job_fintables_sync()`: Piyasa (Borsa) açılmadan 1 saat önce Fintables'tan o sabaha ait en güncel kurum tavsiyelerini undetected_chrome üzerinden çeker.
*   **12:30** - Öğlen tatili bitişi tekrar rapor kontrolü yapılır.
*   **18:30** - `job_yf_sync()`: Borsa saat 18:10'da kapandıktan sonra, günün son kapanış fiyatlarını (Close) ve oluştuysa yeni Hacim (Volume) mumlarını yfinance üzerinden çeker.
*   **18:45** - `job_ta_sync()`: Fiyatlar güncellendikten sonra TradingView Scanner çalıştırılarak yeni fiyatlara göre RSI, MACD, SMA sinyallerinin 1 günlük son halleri veritabanına işlenir. 
*(Tüm bu işlemler SQLite WAL modu sayesinde, önyüzdeki kullanıcının ekranını kilitlemeden tamamen sessiz ve asenkron yürütülür).*

---

## 12. VİOP Teorik Fiyat Hesaplayıcı (`viop_service.py`)
* Kaynaklarımızda VİOP piyasa verisi (kontrat fiyatı, açık pozisyon) yoktur. Önceki sürüm bu alanları rastgele sayılarla dolduruyordu; kaldırıldı.
* Sayfa yalnızca BIST 30 pay vadelileri için teorik fiyatı hesaplar: F = S × (1 + (r − q) × gün/365). r kullanıcının girdiği yıllık faiz, q son 12 ayın temettü verimi; vade ayın son iş günü (3 günden az kaldıysa sonraki ay).
* Uç nokta: `GET /api/viop/fair-value?rate=0.40`.

## 13. React Error Boundary ve Hata Yakalama (Frontend)
React tarafında uygulamanın çökmesini (White Screen of Death) engellemek için özel bir `ErrorBoundary.jsx` sınıf bileşeni (Class Component) mevcuttur.
*   Bir bileşen (Örn: `TradingViewChart.jsx`) render edilirken hata fırlatırsa, React ağacı komple çökmek yerine `getDerivedStateFromError` tetiklenir.
*   Kullanıcıya o bileşenin yerinde "Bu araç yüklenirken bir hata oluştu" şeklinde zarif bir UI kutucuğu gösterilir. Konsola tam stack-trace basılır. Bu sayede uygulamanın geri kalanı (Menüler, Portföy vs.) çalışmaya devam eder.

## 14. Güvenlik, Logging ve Debugging (Terminal Çıktıları)
Sistem `logging` kütüphanesi üzerinden sürekli state (durum) yayınlar.
*   **Log Level:** `INFO` seviyesindedir. Ancak gereksiz kirliliği önlemek için `yfinance` gibi çok konuşan dış kütüphanelerin log seviyesi `logging.getLogger("yfinance").setLevel(logging.CRITICAL)` ile susturulmuştur.
*   Sunucu üzerinde çalışan her işlem (`schedule`, `fintables_scraper`, `ai_service`) hangi hisseyi kaç saniyede tamamladığını, kaç satırın güncellendiğini konsola basar. Olası bir bot tespiti (Cloudflare ban) anında "ERROR: Could not bypass Cloudflare. Aborting." hatası basılıp döngü kırılarak IP'nin karalisteye alınması (Blacklist) önlenir.

## 15. Otomatik Portföy İnşa ve Optimizasyon Motoru (`portfolio_builder.py`)

Kullanıcının skor bazlı ve risk kontrollü portföy oluşturabilmesi için geliştirilen kantitatif optimizasyon motorudur.

### 15.1 Çekirdek Fonksiyonlar ve Matematiksel Mantık
1. **Aday Seçimi (`build_candidate_portfolio`):**
   * Seçilen evrende (`all`, `bist30`, `bist100`) ve seçilen skora göre (`conviction_score` veya `alpha_score`) en yüksek skorlu ilk `top_n` hisseyi seçer.
   * `score_history` tablosundaki en güncel snapshot'ı kullanarak saniyeler içinde çalışır (DB caching).
2. **Korelasyon Matrisi (`compute_correlation_matrix`):**
   * Son 252 işlem gününün `historical_prices` kapanış fiyatları üzerinden günlük logaritmik/yüzdesel getiri serilerini hesaplar.
   * Çiftler arası Pearson korelasyon katsayısını ($r$) çıkarır. Yeterli kesişim günü (< 20 gün) bulunmayan veya yeni halka arz olan hisselerde güvenli varsayılan olarak $r = 0.0$ kullanır.
3. **Çeşitlendirme Filtresi (`apply_diversification_filter`):**
   * **Çiftli Korelasyon Eşiği:** İki hisse arasındaki $r > 0.70$ (özelleştirilebilir) ise puanı daha düşük olan hisse elenir.
   * **Sektör Yoğunlaşma Kısıtı:** Tek bir sektörün portföy içindeki hisse adedi payı maksimum %30 (`max_sector_weight=0.30`) ile sınırlandırılır. Kotayı aşan hisseler elenir. Tüm adayların aynı sektörde olduğu ekstrem durumlarda portföyün boş kalmaması için en yüksek skorlu en az 1 hisse korunur.
4. **Likidite Kısıtı (`compute_liquidity_cap`):**
   * Son 30 işlem gününün ortalama günlük işlem hacmini (ADV = Ortalama Hacim $\times$ Fiyat) hesaplar.
   * Önerilen pozisyon büyüklüğünün ADV'nin %10'unu (`max_pct_of_adv=0.10`) aşmasına izin vermez; aşarsa pozisyonu tavan değere çeker.
5. **Ağırlıklandırma Yöntemleri (`compute_position_weights`):**
   * **`equal` (Eşit Ağırlık):** $w_i = \frac{1}{N}$
   * **`score_proportional` (Skor Orantılı):** $w_i = \frac{\text{Skor}_i}{\sum \text{Skor}}$
   * **`inverse_volatility` (Ters Volatilite):** Son 60 günün günlük getiri standart sapması ($\sigma_i$) hesaplanır. $w_i \propto \frac{1}{\sigma_i}$. Geçmiş verisi < 10 gün olan hisseler medyan volatilite ile cezalandırılmadan normalize edilir.
6. **Lot Aritmetiği ve Nakit Yönetimi (`generate_portfolio`):**
   * BIST kurallarına tam uyum: $\text{Lot} = \lfloor \frac{\text{Tahsis Edilen TL}}{\text{Fiyat}} \rfloor$ (`math.floor`).
   * Yuvarlama sonrası kalan tutar (`remaining_cash`) nakit sürüklenmesi (cash drag) olarak raporlanır.

### 15.2 API Uç Noktaları (`routers/portfolio.py`)
* `POST /api/portfolio/generate`:
  * Parametreler: `top_n`, `universe`, `budget_tl`, `score_metric`, `weighting_method`, `max_pairwise_corr`, `max_sector_weight`, `max_pct_of_adv`.
  * Yanıt: Filtrelenen adaylar, elenen hisseler (sebepleriyle birlikte), ağırlıklar, hesaplanan lotlar ve sektör dağılımı.
* `POST /api/portfolio/batch`:
  * `add_portfolio_transactions_batch()` DB yöneticisi ile tüm hisseleri tek bir atomik transaction içinde portföye ekler ve maliyet ortalamalarını günceller.

### 15.3 Frontend Entegrasyonu (`Portfolio.jsx`)
* Portföy sayfasında `[ ⚡ ÖNERİLEN PORTFÖY OLUŞTUR ]` paneli.
* Bütçe, evren, model metriği, ağırlıklandırma yöntemi seçimi.
* Üretilen portföyde interaktif onay kutuları, anlık lot düzenleme ve tek tıkla `[ Seçilenleri Portföye Ekle ]` toplu aktarımı.

## 16. Piyasa Rejim Motoru (`market_regime_service.py`)

BIST piyasa genişliği (hisselerin kendi 50 günlük ortalamasının üzerindeki payı) ve XU100 endeksinin 200 günlük ortalamaya göre konumunu birleştiren 3 kademeli rejim motorudur. Tek günün yükselen/düşen oranı her gün değiştiği için karar artık bu orana değil trend genişliğine dayanır (veri yoksa günlük orana döner).

### 16.1 Rejim Sınıflandırma Mantığı
* **`RISK_ON` (Risk İştahı Yüksek / Boğa):**
  * Hisselerin en az %55'i 50 günlük ortalamasının üzerinde **VE** XU100 Kapanış $>$ MA200.
  * Pozisyon risk çarpanı: `1.0x` (Tam bütçe tahsisi).
  * "GÜÇLÜ AL" karar eşiği: Standart $\ge 75$ puan.
  * Renk: Neon Yeşil (`#00e676`).
* **`RISK_OFF` (Riskten Kaçış / Defansif Ayı):**
  * Hisselerin en fazla %40'ı 50 günlük ortalamasının üzerinde **VE** XU100 Kapanış $<$ MA200.
  * Pozisyon risk çarpanı (`exposure_multiplier`): `0.5x` (Bütçenin yarısı otomatik olarak nakitte korunur).
  * "GÜÇLÜ AL" karar eşiği: $+8$ puan yukarı çekilerek $\ge 83$ puan yapılır (Kötü rejimde azami seçicilik).
  * Renk: Mercan Kırmızı (`#ff3366`).
* **`NEUTRAL` (Dengeli / Seçici / Testere):**
  * Diğer tüm kombinasyonlar (örneğin endeks MA200 altında ancak hisselerde tepki yükselişi var, ya da endeks MA200 üzerinde ancak hisseler ağırlıklı düşüşte).
  * Pozisyon risk çarpanı: `1.0x`.
  * "GÜÇLÜ AL" karar eşiği: Standart $\ge 75$ puan.
  * Renk: Kehribar Sarı (`#ffab00`).

### 16.2 Motor Entegrasyonları
* **`conviction_engine.py`:**
  * Rejim `RISK_OFF` olduğunda `_evaluate_stock` içindeki "GÜÇLÜ AL" etiketi eşiği 75'ten 83'e çıkarılır.
  * Dashboard Top Buy seçim eşiği de 72'den 80'e yükseltilir.
* **`portfolio_builder.py`:**
  * `generate_portfolio(...)` fonksiyonunda `exposure_multiplier: Optional[float] = None` parametresi desteklenir.
  * Parametre verilmezse rejimden otomatik çekilir: `RISK_OFF` rejiminde bütçeye otomatik 0.5x çarpanı uygulanır; kalan tutar `cash_reserved_regime` olarak güvenli nakit tamponunda tutulur.
* **Dashboard Frontend (`Home.jsx`):**
  * Karar Kokpiti üst bandında, hisse breadth sayılarının hemen yanında `[ ● Piyasa Rejimi: RISK_ON / NEUTRAL / RISK_OFF ]` rozeti yer alır ve rejim durumuna göre yeşil/sarı/kırmızı olarak renk kodlanır.

## 17. Fiyat Geçmişi Senkronizasyonu (`price_history_sync.py`)
* Backend açıkken arka planda çalışır; son kapanmış seans (hafta içi 18:30 sonrası) eksikse tüm hisselerin eksik günlerini tek toplu yfinance isteğiyle çeker.
* Bölünme veya bedelsiz sonrası yfinance geçmişi yeniden ölçeklerse ilgili hissenin tüm geçmişi yeniden indirilir.
* Durum: `GET /api/admin/price-history`, elle tetikleme: `POST /api/admin/price-history/sync` ("Senkronize et" düğmesi de tetikler).

---
> **Dokümantasyonun Sonu.** Bu belge, HisseRadarPro v3.0 sisteminin sahip olduğu istisnasız tüm modülleri, sınıfları, değişken atamalarını ve iş mantıklarını (business logic) milimetrik olarak barındırmaktadır.

