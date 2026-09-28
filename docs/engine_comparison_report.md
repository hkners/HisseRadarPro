# HisseRadarPro — Conviction Engine vs. Alpha Engine Karşılaştırma ve Entegrasyon Raporu

> **Rapor Tarihi:** 2026-09-27  
> **İncelenen Tarih Aralığı:** 2026-02-17 — 2026-09-27  
> **Toplam İncelenen Skor Kaydı:** 4,372 adet (625 hisse)  
> **Motorlar Arası Rank Korelasyonu:** ρ = 0.0303 (Pearson r = 0.0344)  
> **Nihai Karar:** **🔵 SENARYO B — Senaryo B: Farklılaşan Faktör Profili**  

---

## 1. Yönetici Özeti ve Stratejik Karar

**Teşhis:** Motorlar orta düzeyde koreledir (rho = 0.0303), farklı alt faktörlere odaklanmaktadırlar.

**Uygulama Önerisi:**  
Arayüzde motorların yatırım profilleri (Momentum vs Temel Kurumsal) açıkça etiketlenerek ayrıştırılmalıdır.

---

## 2. İleriye Dönük Getiri Tahmin Gücü (Spearman Rank IC Analizi)

Spearman Rank Korelasyonu (Information Coefficient / IC), bir skorlama motorunun hisseleri sıralama yeteneğini ve ardından gelen gerçekleşen getiriyi ne kadar doğru tahmin ettiğini ölçer.

| Vade (Ufuk) | Gözlem Sayısı (N) | Conviction Engine IC | Alpha Engine IC | IC Farkı (Δ) | İstatistiksel Anlamlılık | Üstün Olan Motor |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Aylık (30 Gün)** | 3,750 | **-0.0015** | **-0.0113** | +0.0098 | Anlamsız | **Eşit / Benzer** |
| **3 Aylık (90 Gün)** | 3,750 | **-0.0052** | **+0.0063** | -0.0115 | Anlamsız | **Alpha Engine** |
| **6 Aylık (180 Gün)** | 1,450 | **+0.0142** | **-0.0083** | +0.0225 | Anlamsız | **Conviction Engine** |

> **Not:** Bilgi Katsayısı (IC) kantitatif finans literatüründe:
> * IC > 0.05: İyi öngörü gücü
> * IC > 0.15: Çok güçlü öngörü gücü
> * IC > 0.50+: Güçlü trend ve çok yüksek faktör ayrıştırma yeteneğine işaret eder.

---

## 3. İki Motor Arasındaki Benzerlik ve Örtüşme (Cross-Engine Correlation)

Aynı hisse senedi için iki motorun ürettiği skorların birbiriyle uyumu:

* **Spearman Rank Korelasyonu (ρ):** `0.0303`
* **Pearson Lineer Korelasyonu (r):** `0.0344`

İki motor arasındaki korelasyon orta seviyededir; bu da motorların farklı faktör ağırlıkları nedeniyle hisseleri farklı sıraladığını gösterir.

---

## 4. Alt Bileşenlerin Getiri Tahmin Performansı (Factor IC)

HisseRadarPro skorlarını oluşturan alt faktörlerin 1 ve 3 aylık getiriyi öngörme güçleri:

| Alt Faktör Bileşeni | 1 Aylık IC (30 Gün) | 3 Aylık IC (90 Gün) | Birincil Kullanım Alanı |
| :--- | :---: | :---: | :--- |
| **Teknik Gösterge Skoru** | +0.0301 | +0.0142 | Kısa vadeli momentum ve aşırı alım/satım filtreleme |
| **Temel Değerleme Skoru (F/K, PD/DD, Sektör)** | +0.0196 | +0.0073 | Orta/uzun vadeli adil değerleme ve marjinal getiri |
| **Piyasa Duyarlılığı & Hacim Skoru** | +0.0036 | +0.0207 | Likidite ve kurumsal para girişi teyidi |
| **Aracı Kurum Hedef Fiyat & Konsensüs** | -0.0079 | -0.0035 | Enflasyon üzeri reel prim potansiyeli ve hedef revizyonları |

---

## 5. Senaryo Değerlendirmesi ve Uygulama Yol Haritası

### Seçilen Senaryo: Senaryo B: Farklılaşan Faktör Profili

Motorlar orta düzeyde koreledir (rho = 0.0303), farklı alt faktörlere odaklanmaktadırlar.

### Mimari ve Arayüz Adımları (Next Steps)
1. **Arayüzde Net İsimlendirme ve Ayrıştırma:**
   - Alpha Engine: **'HisseRadar Taktik Alfa (Kısa Vade: 1-4 Hafta)'** olarak etiketlenmelidir.
   - Conviction Engine: **'HisseRadar Kurumsal İnanç (Orta Vade: 3-6 Ay)'** olarak etiketlenmelidir.
2. **Kart Üzerinde Zaman Ufku İkonları:**
   - Kullanıcıya her iki skorun hangi vade için geçerli olduğu görsel rozetlerle anlatılmalıdır.

---
*Bu rapor `scripts/compare_engines.py` tarafından otomatik olarak üretilmiştir.*