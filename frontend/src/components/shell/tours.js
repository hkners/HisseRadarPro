// Per-page onboarding steps. `match` picks the tour for a pathname; `target` (optional) is a CSS
// selector to outline while the step is shown. Copy is short and plain on purpose.
export const TOURS = [
  {
    id: 'dashboard',
    match: p => p === '/',
    steps: [
      { title: 'Dashboard\'a hoş geldin', body: 'Burası günün özeti: piyasa rejimi, karar motorunun öne çıkardığı hisseler ve kurumların son görüşleri.' },
      { title: 'Her yere tek tuşla', body: 'Ctrl K ile hisse, şirket, kurum veya sayfa arayabilirsin. Menüdeki gruplar portföyün, araçların ve araştırma sayfalarındır.', target: '.search-trigger' },
      { title: 'Turu sonra tekrar aç', body: 'Her sayfanın kendi kısa turu var. Üst çubuktaki soru işaretinden istediğin zaman yeniden başlatabilirsin.', target: '[data-tour="help"]' },
    ],
  },
  {
    id: 'screener',
    match: p => p.startsWith('/screener'),
    steps: [
      { title: 'Tarayıcı', body: 'Tüm BIST hisselerini temel, kurum ve teknik kriterlerle filtrele.' },
      { title: 'Hazır kurallar', body: 'Her çip kuralını taramaya ekler. Yanındaki sayı, tıkladığında kaç hisse kalacağını gösterir.', target: '.count-chip' },
      { title: 'Kaydet ve tekrar kullan', body: 'Beğendiğin taramayı adlandırıp kaydedebilir, sonra tek tıkla açabilirsin.' },
    ],
  },
  {
    id: 'stock',
    match: p => p.startsWith('/hisse/'),
    steps: [
      { title: 'Hisse sayfası', body: 'Fiyat, teknik görünüm, kurum raporları ve temel veriler tek ekranda.' },
      { title: 'Değerleme şeridi', body: 'Fiyatı kurum hedefleri ve emsal çarpanlarla karşılaştırır. Yüzdeler güncel fiyata göre potansiyeldir, tahmin değildir.', target: '.vstrip' },
      { title: 'Değerleme sekmesi', body: 'Football field grafiği tüm yöntemlerin aralığını ve fiyatın nerede durduğunu tek bakışta gösterir.' },
    ],
  },
  {
    id: 'portfolio',
    match: p => p.startsWith('/portfolio'),
    steps: [
      { title: 'Portföyüm', body: 'Pozisyonların, maliyetin, kâr/zararın ve ağırlıkların burada.' },
      { title: 'Gerçek ve kâğıt hesap', body: 'Gerçek pozisyonlarını ve denemek istediğin kâğıt portföyü ayrı tutabilir, ikisini birlikte de görebilirsin.', target: '.page-header-actions .pill-tabs' },
      { title: 'CSV ile içe aktar', body: 'Aracı kurum ekstreni CSV olarak yükle; önizlemede kontrol ettikten sonra aktarılır.' },
    ],
  },
  {
    id: 'analytics',
    match: p => p.startsWith('/analytics'),
    steps: [
      { title: 'Risk & Analiz', body: 'Portföyünün riskini bir risk masası gibi gör: volatilite, beta, kayıp riski, yoğunlaşma ve senaryolar.' },
      { title: 'Sekmeler', body: 'Pozisyon riski, korelasyon ve senaryolar sekmeleri, riskin nereden geldiğini gösterir. Rakamlar bugünkü ağırlıklarla geçmiş bir yıldan hesaplanır.', target: '.pill-tabs' },
    ],
  },
  {
    id: 'compare',
    match: p => p.startsWith('/compare'),
    steps: [
      { title: 'Karşılaştır', body: 'İki ile dört varlığı aynı başlangıca (100) çekip karşılaştır. XU100 de eklenebilir.' },
      { title: 'Kim önde', body: 'Her çift için hangisinin hangi tarihten beri önde olduğunu ve aradaki farkı gösterir.' },
    ],
  },
  {
    id: 'macro',
    match: p => p.startsWith('/macro'),
    steps: [
      { title: 'Makro', body: 'Günün piyasa rejimi, önemli göstergeler ve kısa bir brif. Tüm sayılar aynı anlık görüntüden gelir.' },
      { title: 'Neden önemli', body: 'Her göstergenin yanında neyi ölçtüğü ve nasıl okunacağı yazar.' },
    ],
  },
  {
    id: 'industries',
    match: p => p.startsWith('/industries'),
    steps: [
      { title: 'Sektörler', body: 'Sektörleri değerleme, kurum görüşü ve getiriyle yan yana karşılaştır. Bir satıra tıklayınca hisseleri açılır.' },
    ],
  },
];

export const TOUR_EVENT = 'hr:tour:start';

/** Asks the tour for the current page to start, even if it was seen or tours are switched off. */
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

export const tourForPath = (pathname) => TOURS.find(t => t.match(pathname)) || null;
