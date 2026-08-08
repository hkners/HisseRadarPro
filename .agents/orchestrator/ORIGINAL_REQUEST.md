# Original User Request

## 2026-08-03T01:04:24Z

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
