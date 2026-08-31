# Scrapers (Veri Kazıyıcılar)

Bu dizin, HisseRadarPro'nun internetten otomatik veri çeken, analiz eden ve PDF'leri diske kaydeden "Veri Toplama Motoru"nu oluşturur. 

> **Not:** LLM (Yapay Zeka) modellerine çok fazla bağımlı olmamak ve maliyeti düşürmek amacıyla, ayrıştırma mantığı büyük ölçüde RegEx ve Rule-Based (Heuristic) yapıya taşınmıştır.

## Kritik Dosyalar ve İşlevleri

### `scraper_network.py`
Tüm scraper mekanizmasını koordine eden orkestratör dosyadır. `base_scraper.py` sınıfından türeyen aracı kurum scraper'larını sırayla veya eşzamanlı başlatır.

### `db_manager.py`
Projenin kalbi olan veritabanı (SQLite) işlemlerini yönetir. Hem `scraped_reports.db` dosyasına yazar, hem de frontend'in daha hızlı okuyabilmesi adına (opsiyonel olarak) verileri JSON olarak `scraped_reports.json` dosyasına senkronize eder (yedekleme mantığı). Tabloları oluşturur, çift kayıt (duplicate) oluşmasını file_hash üzerinden engeller.

### `llm_parser.py`
Projenin PDF analiz motorudur. Başlığında "LLM" kelimesi geçmesine rağmen asıl işlevini heuristic (sezgisel) regex kurallarıyla yapar.
- PDF dosyasını okur (PyMuPDF - fitz kullanarak).
- İçerisindeki "Hedef Fiyat: 50.00 TL", "AL", "TUT" gibi ifadeleri saptar.
- `cats.json` içerisindeki sektör ve bülten formatlarıyla eşleştirme yaparak kategorizasyonu çıkarır.
- Eğer API Key tanımlanırsa, çok zorlu PDF'lerde yapay zeka üzerinden ayrıştırma yeteneğine sahiptir (Fallback).

### `deniz_scraper.py`
Deniz Yatırım'ın halka açık Araştırma Raporları sayfasını kazıyan spesifik bottur.
- Gelişmiş pagination (sayfalama) yaparak yüzlerce raporu asenkron olarak çeker.
- PDF linklerini bulup `downloads` klasörüne indirir.
- İndirilen PDF'leri `llm_parser.py`'a gönderir ve sonucu veritabanına kaydeder.

### `/downloads/` Klasörü
İndirilen gerçek PDF dosyalarının barındırıldığı yerdir. FastAPI tarafından StaticFiles olarak dışarı sunulurlar, bu nedenle silinmemelidir.

### `/logs/` ve `/cache/` Klasörleri
LLM'in daha önce ayrıştırdığı verilerin JSON formatında önbelleğe alındığı ve sistem kayıtlarının tutulduğu dizinlerdir. Performans artışı sağlar.
