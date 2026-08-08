# Backend - HisseRadarPro

Bu dizin, HisseRadarPro'nun beyin takımını oluşturan `FastAPI` tabanlı web sunucusunu barındırır. 

## Ana Bileşenler

### `main.py`
Projenin API ağ geçididir. Frontend'in tüm veriyi çektiği yer burasıdır.
- **YFinance Arka Plan Görevi:** `yfinance` kullanarak BIST listesindeki yüzlerce hissenin güncel fiyatını (15dk gecikmeli) arka planda multi-thread (çoklu iş parçacıklı) olarak sürekli günceller.
- **Statik Dosya Sunumu (Mounting):** Frontend tarafında PDF'lerin ve kurum logolarının görüntülenebilmesi için `/downloads` ve `/logos` klasörlerini `StaticFiles` ile dışa açar. Vite proxy'si bu sayede engellere takılmadan dosyaları çekebilir.
- **API Endpointleri:**
  - `/stocks`: Hisselerin canlı fiyat, özet ve istatistiklerini döner.
  - `/recommendations/{ticker}`: O hisseye özel veritabanından hedef fiyat analizlerini getirir.
  - `/scraped-reports`: Tüm kurum raporlarının (Bilanço Notu, Telekonferans vb.) dökümünü sağlar.
  - `/screener`: Temel hisse analizleri (F/K, PD/DD) için screener listesi verir.

### `all_bist.txt`
Borsa İstanbul'da işlem gören tüm şirketlerin kısaltmalarını barındıran sabit veri dosyasıdır (örn: `THYAO`, `ASELS`).

### `run_all_scrapers.py`
Tüm otomatik kazıyıcıları (scraper) tetikleyen ana yürütme (execution) script'idir. Sunucu dışında ayrı bir terminalde düzenli aralıklarla (cron vb.) çalıştırılması tavsiye edilir.

### `download_logos.py`
Aracı kurumların logolarını web'den indirerek `/logos` dizinine kaydeder ve frontend'in görselleri oradan render etmesini sağlar.
