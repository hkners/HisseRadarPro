# Original User Request

## 2026-08-03T01:04:10Z

# Teamwork Project Prompt

Birçok farklı aracı kurumun (Garanti BBVA, Deniz Yatırım vb.) web sitelerini tarayarak araştırma raporlarını (PDF, HTML vb.) otomatik indirecek, LLM yardımıyla verileri parse edecek ve hisse tavsiyelerini/hedef fiyatları çıkarıp HisseRadarPro sistemine entegre edecek otonom bir veri toplama ağı inşa edilecek.

Working directory: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\scrapers`
Integrity mode: development

## Requirements

### R1. Geniş Kapsamlı Veri Tarama (Scraping)
Sistem, aracı kurumların (özellikle Garanti BBVA Araştırma Raporları sayfası ve diğerleri) kurumsal web sitelerindeki araştırma raporları sayfalarını taramalı, yeni yayınlanan bültenleri/PDF'leri tespit edip indirmelidir.

### R2. LLM Tabanlı PDF Analizi ve Önbellekleme (Caching)
İndirilen PDF raporlarındaki karmaşık verileri (hisse kodu, öneri türü, hedef fiyat vb.) ayıklamak için OpenAI/Gemini gibi bir LLM API'sine başvuran bir modül geliştirilmelidir. **Maliyetleri kontrol altında tutmak için çok önemli bir şart:** Parse edilen veya daha önce taranan raporlar mutlaka kaydedilmeli (caching), aynı rapor ikinci kez LLM'e gönderilmemelidir.

### R3. Sisteme Esnek Entegrasyon
Ayıklanan veriler HisseRadarPro'nun mevcut veri yapısına entegre edilmelidir. Verilerin Screener ana formülüne dahil edilip edilmeyeceği veya UI'da nasıl gösterileceği (ayrı bir panel vb.) konusu tamamen sizin (ajan takımının) inisiyatifinde ve en uygun bulduğunuz mimariye bırakılmıştır.

### R4. Tekrarlanabilirlik ve Kayıt Altına Alma
Raporların ve verilerin işlenmesini sağlayan tüm sorgular (LLM promptları), çıkarım (extraction) formatları ve elde edilen sonuç özetleri sisteme yapısal olarak kaydedilmeli; sonradan tekrar kullanılabilir ve sorgulanabilir olmalıdır.

### R5. Kapsamlı Dokümantasyon
Yazılan tüm scraper'lar, entegrasyon dosyaları ve API bağlantıları klasör içerisinde detaylıca dokümante edilmelidir. Böylece hangi scriptin nerede kullanılacağı, hangi dosyanın hangi kurumdan veri çektiği net bir şekilde anlaşılabilmelidir.

## Acceptance Criteria

### Doğrulama ve Başarı Kriterleri
- [ ] En az 2 aracı kurumun (örneğin Garanti ve Deniz Yatırım) rapor sayfasından PDF veya veri çeken çalışan bir Python botu/scripti yazılmış olmalıdır.
- [ ] LLM entegrasyonu ile PDF içinden en az %90 oranında doğru (Hisse Adı, Tavsiye, Hedef Fiyat) verisi çıkarılabilmelidir.
- [ ] Botun aynı raporu iki kez işlemediğini (caching mekanizmasının çalıştığını) kanıtlayan bir `verify_scraping.py` veya benzeri bir log çıktısı/test bulunmalıdır.
- [ ] Kullanılan tüm LLM yapılandırmaları ve promptların kaydedildiği bir mekanizma olmalıdır.
- [ ] Uygulama yeniden başlatıldığında (`npm run dev` & `python main.py`), çıkarılan bu yeni verilerin UI'da bozulma yaratmadan gösterildiği görülmelidir.
- [ ] Projenin çalışmasını anlatan açıklayıcı bir Markdown dokümantasyonu (Ör: `SCRAPERS_README.md`) hazırlanmış olmalıdır.

## Follow-up — 2026-08-02T22:23:23Z

Hey team, I had to recover main.py from scratch because it got accidentally wiped during a regex replacement. The backend port has been updated to 8015 to fix binding issues. The event loop blocking issue with yfinance has also been resolved. 
If you previously added endpoints to main.py (like /api/scraped-reports/trigger-scrape) or any imports, they have been wiped. Please re-apply your integration logic to the new main.py! Keep using port 8015 for your tests. Keep up the good work on scraping those brokerage reports!

## 2026-08-06T18:11:28Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

HisseRadarPro projesinin baştan sona (frontend, backend, veri çekme ve LLM modülleri) detaylı bir kod denetiminden (audit) geçirilmesi, mevcut mimari eksikliklerin, performans darboğazlarının ve olası hataların kod düzeyinde düzeltilmesi. Ayrıca kullanıcı deneyimini artıracak yeni özelliklerin (filtreler, grafikler) sisteme entegre edilmesi.

Working directory: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro`
Integrity mode: benchmark

## Requirements

### R1. Sistem Denetimi ve Hata Giderme (Audit & Fix)
Ajan ekibi, projedeki tüm modülleri taramalı (LLM regex ayrıştırma hataları, API gecikmeleri, React DOM render yavaşlıkları) ve buldukları tüm hataları aktif olarak kodlayarak çözmelidir.

### R2. Performans Optimizasyonu
Özellikle frontend tarafındaki binlerce satırlık listelerin render performansı (sayfalama/sanallaştırma) ve backend'deki veritabanı okuma performansları en üst düzeye çıkarılmalıdır.

### R3. Yeni Özellikler ve Arayüz (UI/UX) İyileştirmeleri
Siyah zemin, neon renkler ve monospace font gibi terminal estetiğine sadık kalınarak; sisteme yeni filtreleme mantıkları, analitik grafikler veya özet ekranları gibi kullanıcı deneyimini zenginleştirecek yeni özellikler eklenmelidir.

### R4. Temiz Kod (Clean Code) ve Refactoring
Karmaşıklaşmış dosyalar (örn: `ResearchReports.jsx`, `main.py`, `db_manager.py`) modüler parçalara (components) bölünmeli, best-practice standartlarına uygun ve gelecekte kolayca büyütülebilir hale getirilmelidir.

## Acceptance Criteria

### Doğrulama ve Başarı Kriterleri
- [ ] Frontend projesi `npm run build` komutu kullanıldığında hiçbir uyarı (warning) veya hata vermeden başarılı bir şekilde derlenmelidir.
- [ ] Backend sunucusu (`python main.py` veya `uvicorn`) başlatıldığında hiçbir 500 hata kodu, çökme veya "port kullanımda" hatası üretmemelidir.
- [ ] Ajan ekibi, yaptıkları geliştirmeleri test etmek için arka planda yerel sunucuları çalıştırıp curl/HTTP istekleriyle API'nin 200 OK yanıt verdiğini ve verilerin eksiksiz geldiğini programatik olarak doğrulamalıdır.
- [ ] Ekranda binlerce veri gösterildiğinde tarayıcının kilitlenmesini engellemek için, frontend tarafında sayfalama (pagination) veya sanallaştırma (virtualization) çözümlerinin çalıştığı görülmelidir.


