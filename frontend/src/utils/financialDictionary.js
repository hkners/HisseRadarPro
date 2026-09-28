/**
 * HisseRadarPro — Finansal Tablolar Sözlüğü ve Muhasebe Hiyerarşisi
 * yfinance'tan gelen ham İngilizce kalemleri BIST/SPK standartlarına uygun
 * %100 Türkçe, açıklamalı ve mantıksal sıralı formata dönüştürür.
 */

export const FINANCIAL_DICTIONARY = {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. GELİR TABLOSU (INCOME STATEMENT)
  // ─────────────────────────────────────────────────────────────────────────────
  "Total Revenue": {
    tr: "Hasılat (Toplam Satış Gelirleri)",
    desc: "Şirketin ana faaliyetleri kapsamında mal ve hizmet satışlarından elde ettiği brüt gelir. Büyümenin ana motorudur.",
    category: "Ana Gelir & Kârlılık",
    isKey: true,
    isMajor: true,
    order: 10
  },
  "Operating Revenue": {
    tr: "Faaliyet Gelirleri",
    desc: "Şirketin doğrudan operasyonel faaliyetlerinden sağlanan gelir toplamıdır.",
    category: "Ana Gelir & Kârlılık",
    isKey: false,
    isMajor: false,
    order: 11
  },
  "Cost Of Revenue": {
    tr: "Satışların Maliyeti (-)",
    desc: "Satılan malların üretimi veya hizmetlerin sunumu için yapılan doğrudan hammadde, işçilik ve operasyon maliyetleridir.",
    category: "Ana Gelir & Kârlılık",
    isKey: true,
    isMajor: false,
    order: 20
  },
  "Reconciled Cost Of Revenue": {
    tr: "Satışların Maliyeti (Düzeltilmiş) (-)",
    desc: "Muhasebe standartlarına göre düzeltilmiş ve teyit edilmiş satış maliyetleri toplamı.",
    category: "Ana Gelir & Kârlılık",
    isKey: false,
    isMajor: false,
    order: 21
  },
  "Gross Profit": {
    tr: "Brüt Kâr",
    desc: "Toplam Satış Gelirlerinden Satışların Maliyeti düşüldükten sonra kalan kâr. Şirketin fiyatlama gücünü gösterir.",
    category: "Ana Gelir & Kârlılık",
    isKey: true,
    isMajor: true,
    order: 30
  },
  "Operating Expense": {
    tr: "Faaliyet Giderleri (OPEX) (-)",
    desc: "Pazarlama, satış, dağıtım, Ar-Ge ve genel yönetim giderlerinin toplamıdır.",
    category: "Faaliyet Performansı",
    isKey: true,
    isMajor: false,
    order: 40
  },
  "Selling General And Administration": {
    tr: "Pazarlama, Satış ve Genel Yönetim Giderleri (-)",
    desc: "Şirketin operasyonlarını yürütmek, ürünlerini pazarlamak ve idari işleri sürdürmek için yaptığı harcamalardır.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 41
  },
  "Selling And Marketing Expense": {
    tr: "Pazarlama ve Satış Giderleri (-)",
    desc: "Reklam, tanıtım, bayi komisyonları ve satış ekibi harcamaları.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 42
  },
  "General And Administrative Expense": {
    tr: "Genel Yönetim Giderleri (-)",
    desc: "Yönetim ofisi, danışmanlık, hukuk ve idari personel giderleri.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 43
  },
  "Other Operating Expenses": {
    tr: "Diğer Faaliyet Giderleri (-)",
    desc: "Ana faaliyet giderleri kapsamına girmeyen diğer operasyonel harcamalar.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 44
  },
  "Operating Income": {
    tr: "Esas Faaliyet Kârı (FVÖK / EBIT)",
    desc: "Faiz ve Vergi Öncesi Kâr (EBIT). Şirketin finansman ve vergi yapısından bağımsız, ana işinden ne kadar kâr ürettiğini gösterir.",
    category: "Faaliyet Performansı",
    isKey: true,
    isMajor: true,
    order: 50
  },
  "Total Operating Income As Reported": {
    tr: "Raporlanan Faaliyet Kârı",
    desc: "Şirketin mali tablolarında resmi olarak beyan ettiği operasyonel kâr rakamı.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 51
  },
  "EBIT": {
    tr: "FVÖK (Faiz ve Vergi Öncesi Kâr)",
    desc: "Şirketin finansman yapısı ve vergi dilimlerinden bağımsız operasyonel kârlılığıdır.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: true,
    order: 52
  },
  "EBITDA": {
    tr: "FAVÖK (Faiz, Amortisman ve Vergi Öncesi Kâr)",
    desc: "EBITDA. Şirketin nakit yaratma kabiliyetini gösteren en temel BIST rasyosudur. Amortisman ve finansman öncesi operasyonel kâr.",
    category: "Faaliyet Performansı",
    isKey: true,
    isMajor: true,
    order: 60
  },
  "Normalized EBITDA": {
    tr: "Düzeltilmiş FAVÖK (Tek Seferlik Hariç)",
    desc: "Olağandışı veya bir defaya mahsus kâr/zarar kalemlerinden arındırılmış sürdürülebilir FAVÖK.",
    category: "Faaliyet Performansı",
    isKey: true,
    isMajor: false,
    order: 61
  },
  "Depreciation And Amortization In Income Statement": {
    tr: "Dönem Amortisman ve İtfa Payları (-)",
    desc: "Maddi ve maddi olmayan duran varlıkların dönem içerisindeki yıpranma payı.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 65
  },
  "Reconciled Depreciation": {
    tr: "Dönem Amortisman Gideri (Net)",
    desc: "Mali tablolarda operasyonel maliyetlerle dengelenmiş amortisman gideri.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 66
  },
  "Depreciation Income Statement": {
    tr: "Maddi Duran Varlık Amortismanı",
    desc: "Bina, makine ve teçhizatın gelir tablosuna yansıyan yıpranma payı.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 67
  },
  "Rent Expense Supplemental": {
    tr: "Kira Giderleri",
    desc: "İşletme faaliyetleri için ödenen kira ve kullanım bedelleri.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 68
  },
  "Rent And Landing Fees": {
    tr: "Kira ve Meydan/Hizmet Bedelleri",
    desc: "Havacılık ve ulaştırma şirketlerinde ödenen havaalanı iniş ve yer hizmetleri ücretleri.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 69
  },
  "Net Interest Income": {
    tr: "Net Faiz Geliri / Gideri",
    desc: "Elde edilen faiz gelirleri ile ödenen kredi/borç faiz giderleri arasındaki net fark.",
    category: "Finansman & Vergi",
    isKey: true,
    isMajor: false,
    order: 70
  },
  "Interest Income": {
    tr: "Faiz Gelirleri (+)",
    desc: "Bankadaki nakit ve mevduatlardan elde edilen faiz kazançları.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 71
  },
  "Interest Expense": {
    tr: "Faiz Giderleri (-)",
    desc: "Kullanılan banka kredileri ve ihraç edilen tahviller için ödenen faizler.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 72
  },
  "Net Non Operating Interest Income Expense": {
    tr: "Faaliyet Dışı Net Faiz Dengesi",
    desc: "Ana faaliyet alanı dışındaki finansal işlemlerden kaynaklanan faiz geliri ve gideri dengesi.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 73
  },
  "Total Other Finance Cost": {
    tr: "Toplam Finansman Maliyetleri (-)",
    desc: "Kredi komisyonları, kur farkları ve diğer finansal aracılık maliyetleri.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 74
  },
  "Other Non Operating Income Expenses": {
    tr: "Faaliyet Dışı Diğer Gelir / Giderler",
    desc: "Kur farkı, kambiyo kâr/zararı ve menkul kıymet gelirleri gibi faaliyet dışı kalemler.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 75
  },
  "Total Unusual Items": {
    tr: "Tek Seferlik (Olağandışı) Kalemler",
    desc: "Varlık satışı, fabrika taşınması veya ceza/tazminat gibi olağandışı tek seferlik gelir/giderler.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 76
  },
  "Total Unusual Items Excluding Goodwill": {
    tr: "Şerefiye Hariç Tek Seferlik Kalemler",
    desc: "Şerefiye değer düşüklüğü hariç tutulmuş olağandışı kalemler toplamı.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 77
  },
  "Special Income Charges": {
    tr: "Özel Gelir ve Karşılıklar",
    desc: "Dönemsel özel gelirler veya ayrılan tek seferlik karşılıklar.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 78
  },
  "Other Special Charges": {
    tr: "Diğer Özel Giderler (-)",
    desc: "Beklenmeyen hukuki veya operasyonel karşılıklar.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 79
  },
  "Pretax Income": {
    tr: "Vergi Öncesi Kâr",
    desc: "Tüm operasyonel ve finansman gelir/giderleri sonrası kurumlar vergisi matrahı öncesi kâr.",
    category: "Finansman & Vergi",
    isKey: true,
    isMajor: false,
    order: 80
  },
  "Tax Provision": {
    tr: "Dönem Vergi Gideri / Geliri (-)",
    desc: "Şirketin kârı üzerinden devlete ödeyeceği kurumlar vergisi ve ertelenmiş vergi tutarı.",
    category: "Finansman & Vergi",
    isKey: true,
    isMajor: false,
    order: 81
  },
  "Tax Effect Of Unusual Items": {
    tr: "Olağandışı Kalemlerin Vergi Etkisi",
    desc: "Tek seferlik gelir veya giderlerin kurumlar vergisi üzerindeki artırıcı veya azaltıcı etkisi.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 82
  },
  "Tax Rate For Calcs": {
    tr: "Efektif Vergi Oranı",
    desc: "Şirketin fiilen tabi olduğu kurumlar vergisi oranı.",
    category: "Finansman & Vergi",
    isKey: false,
    isMajor: false,
    order: 83
  },
  "Net Income Continuous Operations": {
    tr: "Sürdürülen Faaliyetler Net Kârı",
    desc: "Durdurulan faaliyetler hariç, şirketin devam eden işlerinden elde ettiği net kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 89
  },
  "Net Income From Continuing Operation Net Minority Interest": {
    tr: "Sürdürülen Faaliyetler Net Kârı (Ana Ortaklık)",
    desc: "Ana ortaklık payına düşen sürdürülen faaliyetler net dönem kârı.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 90
  },
  "Net Income Including Noncontrolling Interests": {
    tr: "Azınlık Payları Dahil Net Dönem Kârı",
    desc: "Konsolide bilançoda bağlı ortaklıklardaki tüm pay sahiplerine ait toplam net kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 91
  },
  "Minority Interests": {
    tr: "Azınlık (Kontrol Gücü Olmayan) Payları (-)",
    desc: "Konsolide edilen şirketlerde ana şirkete ait olmayan azınlık hissedarlarının kâr payı.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 92
  },
  "Net Income": {
    tr: "Net Dönem Kârı (Ana Ortaklık)",
    desc: "Tüm giderler, finansman maliyetleri ve vergiler düşüldükten sonra hissedarlara kalan nihai kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: true,
    isMajor: true,
    order: 95
  },
  "Net Income Common Stockholders": {
    tr: "Adi Hisse Sahiplerine Kalan Net Kâr",
    desc: "İmtiyazlı temettüler düşüldükten sonra BIST'te işlem gören paylara ait net kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: true,
    order: 96
  },
  "Normalized Income": {
    tr: "Düzeltilmiş Net Kâr",
    desc: "Tek seferlik kalemler arındırılmış şirketin düzenli ve sürdürülebilir net kârı.",
    category: "Net Kâr & Hisse Başına",
    isKey: true,
    isMajor: false,
    order: 97
  },
  "Diluted NI Availto Com Stockholders": {
    tr: "Seyreltilmiş Net Kâr",
    desc: "Olası hisse senedi opsiyonları veya dönüştürülebilir tahviller hesaba katıldığında kalan net kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 98
  },
  "Basic EPS": {
    tr: "Hisse Başına Kâr (HBK / TL)",
    desc: "Net kârın ödenmiş sermayeye (hisse adedine) bölünmesiyle bulunur. Bir hissenin kazandırdığı kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: true,
    isMajor: true,
    order: 100
  },
  "Diluted EPS": {
    tr: "Seyreltilmiş Hisse Başına Kâr (TL)",
    desc: "Tüm potansiyel hisse dönüşümleri sonrası hisse başına kâr.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 101
  },
  "Basic Average Shares": {
    tr: "Ortalama Hisse Adedi",
    desc: "Dönem içindeki ortalama dolaşımdaki toplam pay sayısı.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 102
  },
  "Diluted Average Shares": {
    tr: "Seyreltilmiş Ortalama Hisse Adedi",
    desc: "Tüm dönüştürülebilir haklar dahil ortalama hisse adedi.",
    category: "Net Kâr & Hisse Başına",
    isKey: false,
    isMajor: false,
    order: 103
  },
  "Total Expenses": {
    tr: "Toplam Şirket Giderleri (-)",
    desc: "Maliyetler, faaliyet giderleri ve finansman harcamalarının genel toplamı.",
    category: "Faaliyet Performansı",
    isKey: false,
    isMajor: false,
    order: 45
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. BİLANÇO (BALANCE SHEET)
  // ─────────────────────────────────────────────────────────────────────────────
  "Cash And Cash Equivalents": {
    tr: "Kasa ve Bankalar (Nakit ve Benzerleri)",
    desc: "Şirketin vadesiz hesapları, kasadaki nakit ve anında nakde çevrilebilir 3 aydan kısa vadeli mevduatları.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: true,
    isMajor: false,
    order: 200
  },
  "Cash Cash Equivalents And Short Term Investments": {
    tr: "Nakit, Benzerleri ve Kısa Vadeli Finansal Yatırımlar",
    desc: "Kasadaki nakit ve 1 yıldan kısa vadeli para piyasası fonları, Hazine bonoları vb.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: true,
    isMajor: false,
    order: 201
  },
  "Other Short Term Investments": {
    tr: "Diğer Kısa Vadeli Finansal Yatırımlar",
    desc: "Likidite amacıyla tutulan kısa vadeli menkul kıymetler.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 202
  },
  "Accounts Receivable": {
    tr: "Ticari Alacaklar (Müşterilerden)",
    desc: "Müşterilere vadeli satılan mal ve hizmetlerin henüz tahsil edilmemiş bedelleri.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: true,
    isMajor: false,
    order: 210
  },
  "Gross Accounts Receivable": {
    tr: "Brüt Ticari Alacaklar",
    desc: "Şüpheli alacak karşılığı düşülmeden önceki toplam alacak.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 211
  },
  "Allowance For Doubtful Accounts Receivable": {
    tr: "Şüpheli Alacaklar Karşılığı (-)",
    desc: "Tahsil edilmesi riskli görülen alacaklar için ayrılan ihtiyat payı.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 212
  },
  "Other Receivables": {
    tr: "Diğer Alacaklar",
    desc: "Ticari faaliyet dışı ilişkili taraflardan veya depozitolardan doğan alacaklar.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 215
  },
  "Inventory": {
    tr: "Stoklar (Hammaddeler, Mamuller)",
    desc: "Üretimde kullanılacak hammaddeler, yarı mamuller ve depoda satışa hazır bitmiş ürünler.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: true,
    isMajor: false,
    order: 220
  },
  "Raw Materials": {
    tr: "İlk Madde ve Malzemeler (Hammadde)",
    desc: "Üretim için bekleyen hammadde stoğu.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 221
  },
  "Finished Goods": {
    tr: "Mamuller (Satışa Hazır Ürünler)",
    desc: "Üretimi tamamlanmış satışa hazır mallar.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 222
  },
  "Other Inventories": {
    tr: "Diğer Stoklar",
    desc: "Yoldaki mallar, yedek parçalar ve sarf malzemeleri.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 223
  },
  "Prepaid Assets": {
    tr: "Peşin Ödenmiş Giderler (Gelecek Aylara Ait)",
    desc: "Peşin ödenen kira, sigorta poliçeleri ve abonelik bedelleri.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 225
  },
  "Other Current Assets": {
    tr: "Diğer Dönen Varlıklar",
    desc: "1 yıl içinde nakde dönüşecek diğer kısa vadeli aktifler.",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: false,
    isMajor: false,
    order: 226
  },
  "Current Assets": {
    tr: "TOPLAM DÖNEN VARLIKLAR (Kısa Vadeli Aktifler)",
    desc: "1 yıl içinde nakde çevrilebilecek tüm varlıkların toplamı (Nakit + Alacaklar + Stoklar).",
    category: "Dönen Varlıklar (Kısa Vadeli)",
    isKey: true,
    isMajor: true,
    order: 230
  },
  "Net PPE": {
    tr: "Maddi Duran Varlıklar (Net Tesis, Makine, Cihaz)",
    desc: "Şirketin fabrika, arazi, bina, makine ve teçhizatlarının birikmiş amortisman düşülmüş net değeri.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: true,
    isMajor: false,
    order: 240
  },
  "Gross PPE": {
    tr: "Brüt Maddi Duran Varlıklar",
    desc: "Amortisman düşülmeden önceki tarihi alım maliyetleri toplamı.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 241
  },
  "Accumulated Depreciation": {
    tr: "Birikmiş Amortismanlar (-)",
    desc: "Maddi duran varlıkların bugüne kadar ayrılmış toplam yıpranma payı.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 242
  },
  "Construction In Progress": {
    tr: "Yapılmakta Olan Yatırımlar",
    desc: "Henüz tamamlanmamış ve devreye alınmamış fabrika veya tesis yatırımları.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 243
  },
  "Goodwill And Other Intangible Assets": {
    tr: "Şerefiye ve Maddi Olmayan Duran Varlıklar",
    desc: "Şirket satın almalarından doğan şerefiye ile patent, lisans, yazılım ve marka hakları toplamı.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: true,
    isMajor: false,
    order: 250
  },
  "Goodwill": {
    tr: "Şerefiye (Goodwill)",
    desc: "Bir şirket satın alınırken defter değerinin üzerinde ödenen marka/itibar primi.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 251
  },
  "Other Intangible Assets": {
    tr: "Maddi Olmayan Duran Varlıklar (Patent, Lisans)",
    desc: "Fikri mülkiyet, yazılım hakları ve lisanslar.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 252
  },
  "Investmentin Financial Assets": {
    tr: "Finansal Duran Varlıklar",
    desc: "Uzun vadeli elde tutulan hisse senetleri, tahviller ve fon yatırımları.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 260
  },
  "Long Term Equity Investment": {
    tr: "Uzun Vadeli Özkaynak Yatırımları (İştirakler)",
    desc: "Şirketin pay sahibi olduğu bağlı ortaklık ve iştiraklerdeki hisse değerleri.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: false,
    isMajor: false,
    order: 261
  },
  "Total Non Current Assets": {
    tr: "TOPLAM DURAN VARLIKLAR (Uzun Vadeli Aktifler)",
    desc: "1 yıldan uzun vadede kullanılacak tüm tesis, makine, gayrimenkul ve yatırımların toplamı.",
    category: "Duran Varlıklar (Uzun Vadeli)",
    isKey: true,
    isMajor: true,
    order: 270
  },
  "Total Assets": {
    tr: "TOPLAM AKTİFLER (TOPLAM VARLIKLAR)",
    desc: "Şirketin sahip olduğu tüm değerlerin (Dönen + Duran Varlıklar) genel toplamı.",
    category: "Aktif Toplamı",
    isKey: true,
    isMajor: true,
    order: 280
  },
  "Accounts Payable": {
    tr: "Ticari Borçlar (Tedarikçilere Borçlar)",
    desc: "Hammadde ve malzeme alımı yapılan tedarikçilere henüz ödenmemiş ticari faturalar.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: true,
    isMajor: false,
    order: 290
  },
  "Payables": {
    tr: "Toplam Ticari ve Faaliyet Borçları",
    desc: "Tedarikçilere ve operasyonel iş ortaklarına olan borçlar toplamı.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: false,
    isMajor: false,
    order: 291
  },
  "Current Debt": {
    tr: "Kısa Vadeli Finansal Borçlar (Krediler)",
    desc: "1 yıl içinde vadesi dolacak banka kredileri ve ihraç edilmiş finansman bonoları.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: true,
    isMajor: false,
    order: 300
  },
  "Current Debt And Capital Lease Obligation": {
    tr: "Kısa Vadeli Krediler ve Kiralama Borçları",
    desc: "1 yıl içinde ödenecek banka borçları ile finansal kiralama (leasing) taksitleri.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: false,
    isMajor: false,
    order: 301
  },
  "Current Capital Lease Obligation": {
    tr: "Kısa Vadeli Finansal Kiralama (Leasing) Borçları",
    desc: "Kiralama sözleşmelerinden doğan ve 1 yıl içinde ödenecek taksitler.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: false,
    isMajor: false,
    order: 302
  },
  "Total Tax Payable": {
    tr: "Ödenecek Vergi ve Yasal Yükümlülükler",
    desc: "Devlete vadesi gelmiş henüz ödenmemiş kurumlar vergisi ve SGK primleri.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: false,
    isMajor: false,
    order: 305
  },
  "Other Current Liabilities": {
    tr: "Diğer Kısa Vadeli Yükümlülükler",
    desc: "Çalışanlara borçlar, müşteri avansları ve ertelenmiş gelirler.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: false,
    isMajor: false,
    order: 306
  },
  "Current Liabilities": {
    tr: "TOPLAM KISA VADELİ YÜKÜMLÜLÜKLER (1 Yıldan Kısa Borçlar)",
    desc: "Şirketin 1 yıl içinde ödemek zorunda olduğu tüm borçların (ticari, finansal, vergi) toplamı.",
    category: "Kısa Vadeli Yükümlülükler (Borçlar)",
    isKey: true,
    isMajor: true,
    order: 310
  },
  "Long Term Debt": {
    tr: "Uzun Vadeli Finansal Borçlar (Banka Kredileri)",
    desc: "Geri ödeme vadesi 1 yıldan uzun olan banka kredileri ve tahvil borçları.",
    category: "Uzun Vadeli Yükümlülükler",
    isKey: true,
    isMajor: false,
    order: 320
  },
  "Long Term Debt And Capital Lease Obligation": {
    tr: "Uzun Vadeli Krediler ve Kiralama Yükümlülükleri",
    desc: "1 yıldan uzun vadeli krediler ile leasing sözleşmelerinin toplamı.",
    category: "Uzun Vadeli Yükümlülükler",
    isKey: false,
    isMajor: false,
    order: 321
  },
  "Long Term Capital Lease Obligation": {
    tr: "Uzun Vadeli Kiralama Borçları",
    desc: "Gelecek yıllara yayılan leasing ve kiralama borçları.",
    category: "Uzun Vadeli Yükümlülükler",
    isKey: false,
    isMajor: false,
    order: 322
  },
  "Non Current Deferred Taxes Liabilities": {
    tr: "Ertelenmiş Vergi Yükümlülüğü (Uzun Vadeli)",
    desc: "Vergi usul farklarından dolayı gelecekte ödenecek ertelenmiş vergi borcu.",
    category: "Uzun Vadeli Yükümlülükler",
    isKey: false,
    isMajor: false,
    order: 325
  },
  "Non Current Pension And Other Postretirement Benefit Plans": {
    tr: "Kıdem Tazminatı ve Emeklilik Karşılıkları",
    desc: "Çalışanlara ileride ödenecek kıdem tazminatı için ayrılan uzun vadeli fon.",
    category: "Uzun Vadeli Yükümlülükler",
    isKey: false,
    isMajor: false,
    order: 326
  },
  "Total Non Current Liabilities Net Minority Interest": {
    tr: "TOPLAM UZUN VADELİ YÜKÜMLÜLÜKLER",
    desc: "1 yıldan uzun vadeli tüm borç ve karşılıkların genel toplamı.",
    category: "Uzun Vadeli Yükümlülükler",
    isKey: true,
    isMajor: true,
    order: 330
  },
  "Total Liabilities Net Minority Interest": {
    tr: "TOPLAM YÜKÜMLÜLÜKLER (TOPLAM BORÇLAR)",
    desc: "Kısa ve uzun vadeli tüm borçların genel toplamı. Şirketin dış kaynak yükümlülüğünü gösterir.",
    category: "Pasif Toplamı",
    isKey: true,
    isMajor: true,
    order: 340
  },
  "Capital Stock": {
    tr: "Ödenmiş Sermaye",
    desc: "Şirketin MKK ve ticaret siciline tescil edilmiş resmi sermaye tutarı.",
    category: "Özkaynaklar (Net Değer)",
    isKey: true,
    isMajor: false,
    order: 350
  },
  "Common Stock": {
    tr: "Ödenmiş Sermaye (Adi Hisse)",
    desc: "Hissedarların koyduğu nominal sermaye tutarı.",
    category: "Özkaynaklar (Net Değer)",
    isKey: false,
    isMajor: false,
    order: 351
  },
  "Retained Earnings": {
    tr: "Geçmiş Yıllar Kârları / Zararları",
    desc: "Geçmiş dönemlerde kazanılan ve temettü olarak dağıtılmayıp şirket bünyesinde tutulan kârlar.",
    category: "Özkaynaklar (Net Değer)",
    isKey: true,
    isMajor: false,
    order: 355
  },
  "Additional Paid In Capital": {
    tr: "Hisse Senedi İhraç Primleri (Emisyon Primi)",
    desc: "Halka arzda veya bedelli sermaye artırımında hisselerin nominal değerin üzerinde satılmasıyla oluşan fon.",
    category: "Özkaynaklar (Net Değer)",
    isKey: false,
    isMajor: false,
    order: 356
  },
  "Treasury Stock": {
    tr: "Geri Alınan Paylar (-)",
    desc: "Şirketin borsadan kendi hisselerini geri alması sonucu ödenen tutar (Özkaynak azaltıcı etki).",
    category: "Özkaynaklar (Net Değer)",
    isKey: false,
    isMajor: false,
    order: 357
  },
  "Stockholders Equity": {
    tr: "TOPLAM ÖZKAYNAKLAR (Ana Ortaklık Net Değeri)",
    desc: "Toplam Varlıklardan Toplam Borçlar düşüldükten sonra kalan net şirket serveti.",
    category: "Özkaynaklar (Net Değer)",
    isKey: true,
    isMajor: true,
    order: 360
  },
  "Total Equity Gross Minority Interest": {
    tr: "TOPLAM ÖZKAYNAKLAR (Azınlık Payları Dahil)",
    desc: "Ana ortaklık ve bağlı ortaklıklardaki tüm ortaklara ait konsolide özsermaye büyüklüğü.",
    category: "Özkaynaklar (Net Değer)",
    isKey: true,
    isMajor: true,
    order: 361
  },
  "Total Debt": {
    tr: "Toplam Finansal Borç",
    desc: "Şirketin bankalara ve tahvil sahiplerine olan kısa ve uzun vadeli faizli borçlarının toplamı.",
    category: "Finansal Borçluluk & Sağlık",
    isKey: true,
    isMajor: false,
    order: 370
  },
  "Net Debt": {
    tr: "Net Finansal Borç (Borçlar - Nakit)",
    desc: "Toplam Finansal Borç eksi Nakit Mevcudu. Negatif ise şirket 'Net Nakit Zengini' konumundadır.",
    category: "Finansal Borçluluk & Sağlık",
    isKey: true,
    isMajor: true,
    order: 371
  },
  "Working Capital": {
    tr: "Net İşletme Sermayesi (Dönen Varlıklar - Kısa Borçlar)",
    desc: "Dönen Varlıklar eksi Kısa Vadeli Borçlar. Pozitif olması şirketin kısa vadeli borç ödeme rahatlığını gösterir.",
    category: "Finansal Borçluluk & Sağlık",
    isKey: true,
    isMajor: false,
    order: 375
  },
  "Net Tangible Assets": {
    tr: "Net Maddi Varlıklar (Maddi Aktifler - Borçlar)",
    desc: "Şerefiye ve patentler hariç, şirketin somut fiziksel varlıklarının borçlar sonrası kalan değeri.",
    category: "Finansal Borçluluk & Sağlık",
    isKey: true,
    isMajor: false,
    order: 380
  },
  "Tangible Book Value": {
    tr: "Maddi Defter Değeri",
    desc: "Maddi olmayan varlıklar düşülmüş defter değeri.",
    category: "Finansal Borçluluk & Sağlık",
    isKey: false,
    isMajor: false,
    order: 381
  },
  "Invested Capital": {
    tr: "Yatırılan Sermaye (Faaliyet Sermayesi)",
    desc: "Şirketin operasyonlarına bağladığı sermaye miktarı (Özsermaye + Net Borç).",
    category: "Finansal Borçluluk & Sağlık",
    isKey: false,
    isMajor: false,
    order: 382
  },
  "Capital Lease Obligations": {
    tr: "Toplam Kiralama (Leasing) Yükümlülükleri",
    desc: "Şirketin tüm kiralama sözleşmelerinden doğan borç toplamı.",
    category: "Finansal Borçluluk & Sağlık",
    isKey: false,
    isMajor: false,
    order: 383
  },
  "Ordinary Shares Number": {
    tr: "Dolaşımdaki Hisse Sayısı",
    desc: "Şirketin piyasada ve yatırımcılarda bulunan toplam pay adedi.",
    category: "Sermaye Yapısı",
    isKey: false,
    isMajor: false,
    order: 390
  },
  "Share Issued": {
    tr: "Toplam İhraç Edilmiş Hisse Adedi",
    desc: "Şirketin ihraç ettiği tüm nominal hisselerin toplam sayısı.",
    category: "Sermaye Yapısı",
    isKey: false,
    isMajor: false,
    order: 391
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. NAKİT AKIŞ TABLOSU (CASH FLOW STATEMENT)
  // ─────────────────────────────────────────────────────────────────────────────
  "Operating Cash Flow": {
    tr: "İŞLETME FAALİYETLERİNDEN NAKİT AKIŞI",
    desc: "Şirketin ana operasyonlarından fiilen kasaya giren nakit. Kâğıt üzerindeki kârın gerçek nakde dönüşme kalitesini gösterir.",
    category: "İşletme Nakit Akışı",
    isKey: true,
    isMajor: true,
    order: 500
  },
  "Depreciation And Amortization": {
    tr: "Amortisman ve İtfa Düzeltmesi (+)",
    desc: "Nakit çıkışı gerektirmeyen amortisman giderinin nakit akışına geri eklenmesi.",
    category: "İşletme Nakit Akışı",
    isKey: true,
    isMajor: false,
    order: 510
  },
  "Change In Working Capital": {
    tr: "İşletme Sermayesindeki Değişim (Nakit Etkisi)",
    desc: "Alacaklar, stoklar ve ticari borçlardaki dönemsel değişimin nakit girişi veya çıkışı etkisi.",
    category: "İşletme Nakit Akışı",
    isKey: true,
    isMajor: false,
    order: 520
  },
  "Change In Receivables": {
    tr: "Ticari Alacaklardaki Değişim",
    desc: "Alacakların tahsil edilmesi nakit girişi (+), alacakların artması nakit çıkışı (-) yaratır.",
    category: "İşletme Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 521
  },
  "Change In Inventory": {
    tr: "Stoklardaki Değişim",
    desc: "Stok alımı nakit çıkışı (-), stokların satılması nakit girişi (+) sağlar.",
    category: "İşletme Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 522
  },
  "Change In Payable": {
    tr: "Ticari Borçlardaki Değişim",
    desc: "Tedarikçilere borçların artması nakit koruma (+), borç ödemesi nakit çıkışı (-) anlamına gelir.",
    category: "İşletme Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 523
  },
  "Other Non Cash Items": {
    tr: "Nakit Çıkışı Gerektirmeyen Diğer Kalemler",
    desc: "Karşılıklar, kambiyo farkları gibi nakit hareketi doğurmayan düzeltmeler.",
    category: "İşletme Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 530
  },
  "Capital Expenditure": {
    tr: "Sermaye Harcamaları (CAPEX) (-)",
    desc: "Yeni fabrika, makine ve teknoloji yatırımları için kasadan çıkan nakit tutarı. Gelecekteki büyümenin anahtarıdır.",
    category: "Yatırım Nakit Akışı",
    isKey: true,
    isMajor: true,
    order: 540
  },
  "Purchase Of PPE": {
    tr: "Maddi Duran Varlık Alımları (-)",
    desc: "Fabrika, bina, makine ve teçhizat alımı için yapılan nakit harcama.",
    category: "Yatırım Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 541
  },
  "Sale Of PPE": {
    tr: "Maddi Duran Varlık Satış Geliri (+)",
    desc: "Eski bina veya makine satılarak kasaya giren nakit.",
    category: "Yatırım Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 542
  },
  "Net PPE Purchase And Sale": {
    tr: "Net Duran Varlık Yatırımı (-)",
    desc: "Duran varlık alımları eksi duran varlık satış gelirleri.",
    category: "Yatırım Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 543
  },
  "Net Investment Purchase And Sale": {
    tr: "Net Finansal Yatırım Girişi / Çıkışı",
    desc: "Hisse senedi ve fon gibi finansal araçların alım ve satımından doğan net nakit akışı.",
    category: "Yatırım Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 545
  },
  "Investing Cash Flow": {
    tr: "YATIRIM FAALİYETLERİNDEN NAKİT AKIŞI",
    desc: "Şirketin büyüme ve kapasite artışı amacıyla yaptığı yatırımlar için kasadan çıkan net nakit.",
    category: "Yatırım Nakit Akışı",
    isKey: true,
    isMajor: true,
    order: 550
  },
  "Issuance Of Debt": {
    tr: "Yeni Kredi Kullanımı ve Tahvil İhracı (+)",
    desc: "Bankalardan çekilen yeni krediler veya çıkarılan tahviller sayesinde kasaya giren nakit.",
    category: "Finansman Nakit Akışı",
    isKey: true,
    isMajor: false,
    order: 560
  },
  "Repayment Of Debt": {
    tr: "Kredi ve Borç Anapara Geri Ödemeleri (-)",
    desc: "Bankalara ve alacaklılara yapılan kredi anapara geri ödemeleri.",
    category: "Finansman Nakit Akışı",
    isKey: true,
    isMajor: false,
    order: 561
  },
  "Net Issuance Payments Of Debt": {
    tr: "Net Borçlanma / Borç Ödeme Dengesi",
    desc: "Kullanılan yeni krediler eksi ödenen eski krediler.",
    category: "Finansman Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 562
  },
  "Cash Dividends Paid": {
    tr: "Ortaklara Ödenen Nakit Temettüler (-)",
    desc: "Şirketin kâr payı olarak hissedarların banka hesaplarına nakit dağıttığı tutar.",
    category: "Finansman Nakit Akışı",
    isKey: true,
    isMajor: true,
    order: 570
  },
  "Repurchase Of Capital Stock": {
    tr: "Hisse Geri Alım Harcamaları (-)",
    desc: "Şirketin borsadan kendi hisselerini geri satın almak için ödediği nakit.",
    category: "Finansman Nakit Akışı",
    isKey: false,
    isMajor: false,
    order: 575
  },
  "Financing Cash Flow": {
    tr: "FİNANSMAN FAALİYETLERİNDEN NAKİT AKIŞI",
    desc: "Kredi kullanımı, borç ödemesi ve temettü dağıtımı gibi finansal işlemlerin net nakit dengesi.",
    category: "Finansman Nakit Akışı",
    isKey: true,
    isMajor: true,
    order: 580
  },
  "Free Cash Flow": {
    tr: "SERBEST NAKİT AKIŞI (FCF)",
    desc: "İşletme Nakit Akışı eksi Sermaye Harcamaları (CAPEX). Şirketin büyüme yatırımlarını yaptıktan sonra hissedarlara temettü dağıtmak veya borç kapatmak için cebinde kalan gerçek net nakit!",
    category: "Nakit Dengesi & Serbest Nakit",
    isKey: true,
    isMajor: true,
    order: 600
  },
  "Changes In Cash": {
    tr: "Dönem İçi Net Nakit Artışı / Azalışı",
    desc: "Tüm operasyonel, yatırım ve finansman faaliyetleri sonrası dönem boyunca kasadaki net nakit değişimi.",
    category: "Nakit Dengesi & Serbest Nakit",
    isKey: true,
    isMajor: true,
    order: 610
  },
  "Beginning Cash Position": {
    tr: "Dönem Başı Nakit Mevcudu",
    desc: "İlgili çeyreğin ilk gününde şirketin kasasında ve bankasında bulunan nakit.",
    category: "Nakit Dengesi & Serbest Nakit",
    isKey: false,
    isMajor: false,
    order: 620
  },
  "Effect Of Exchange Rate Changes": {
    tr: "Kur Farklarının Nakit Üzerindeki Etkisi",
    desc: "Döviz cinsinden tutulan nakitlerin kur hareketleri sonucu oluşan değer artışı veya azalışı.",
    category: "Nakit Dengesi & Serbest Nakit",
    isKey: false,
    isMajor: false,
    order: 625
  },
  "End Cash Position": {
    tr: "Dönem Sonu Nakit ve Nakit Benzerleri",
    desc: "İlgili çeyreğin son günü itibarıyla şirketin kasasında ve bankasında fiilen bulunan nakit mevcudu.",
    category: "Nakit Dengesi & Serbest Nakit",
    isKey: true,
    isMajor: true,
    order: 630
  }
};

/**
 * Bilinmeyen veya eksik bir anahtar geldiğinde temiz fallback üretir.
 */
export function getFinancialItemMeta(key) {
  if (FINANCIAL_DICTIONARY[key]) {
    return FINANCIAL_DICTIONARY[key];
  }

  // De-camelcase veya snake/kebab temizliği
  const cleanName = key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();

  return {
    tr: cleanName,
    desc: "Bu finansal kalem şirket raporundan otomatik aktarılmıştır.",
    category: "Diğer Kalemler",
    isKey: false,
    isMajor: false,
    order: 999
  };
}
