# HisseRadarPro v1.0

HisseRadarPro, Borsa İstanbul (BIST) hisselerini gerçek zamanlı takip etmenizi sağlayan, aracı kurumların PDF raporlarını (Garanti BBVA, Deniz Yatırım vb.) otomatik tarayıp ayrıştıran (heuristic scraping) ve size "Hangi kurum, hangi hisseye, ne hedef fiyat verdi?" sorusunun cevabını tek bir ekranda sunan devasa bir veri analiz platformudur.

## Proje Mimarisi

Sistem 3 ana bileşenden oluşmaktadır:

1. **Frontend (React + Vite + Tailwind/CSS):** Modern, neon renkli ve siyah temalı (dark-mode first) terminal estetiğinde bir kullanıcı arayüzü sunar. Tüm veri akışı asenkron (AJAX) şekilde backend'e bağlıdır.
2. **Backend (FastAPI + Python):** `yfinance` multi-threading kütüphanesi kullanarak BIST hisselerinin canlı (15 dk gecikmeli) verilerini devamlı çeker. İstekleri cache'leyerek sıfır gecikmeli API endpoint'leri sunar.
3. **Scraper Network (Python + SQLite):** Aracı kurumların sitelerini veya public dizinlerini periyodik olarak gezer, PDF'leri indirir. PDF'lerin içerisinden Şirket, Hedef Fiyat ve Potansiyel Getiri gibi önemli metrikleri yapay zekaya ihtiyaç duymadan "regex heuristic" yöntemle çıkararak veritabanına kaydeder.

## Nasıl Kurulur ve Çalıştırılır?

Projeyi klonladıktan sonra tek yapmanız gereken backend ve frontend sunucularını başlatmaktır.

### 1. Backend (FastAPI) Başlatma
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8015 --reload
```

### 2. Frontend (Vite) Başlatma
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

> **Not:** Sistem çalışırken `http://localhost:5173` adresine giderek arayüze ulaşabilirsiniz. PDF'lerin açılabilmesi için backend sunucusunun (8015) arka planda aktif çalışıyor olması şarttır, çünkü Vite proxy'si tüm PDF ve Logo taleplerini oraya yönlendirir.
