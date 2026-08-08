# Frontend - HisseRadarPro

Bu dizin, HisseRadarPro projesinin kullanıcıyla etkileşime geçtiği yüzüdür. Siber-punk esintili (siyah zemin, neon renkler, monospace font) terminal estetiğinde tasarlanmıştır.

## Teknolojik Altyapı
- **React 18:** Modern komponent tabanlı mimari.
- **Vite:** İnanılmaz hızlı geliştirme (HMR) ve build aracı.
- **Tailwind CSS / Plain CSS:** Tüm estetik yapı `src/index.css` ve `src/App.css` üzerinden yönetilmektedir.

## Önemli Konfigürasyonlar
### `vite.config.js` Proxy Kuralları
Vite geliştirme sunucusu (5173), CORS hatalarını önlemek ve frontend üzerinden doğrudan klasörlere erişebilmek için proxy kullanır.
`/api`, `/downloads` ve `/logos` istekleri doğrudan backend sunucusuna (8015) yönlendirilir.

## Dizin Yapısı ve Bileşenler (Components)

### `src/App.jsx`
Uygulamanın ana iskeletidir. `react-router-dom` kullanarak sayfalar arası gezinmeyi sağlar. Navbar (Üst Menü) yapısı burada bulunur.

### `src/pages/`
Ana sayfaların bulunduğu dizindir.
- **`Home.jsx`:** Dashboard ekranı. Sistem durumu, canlı veri akışları ve özetler burada gösterilir.
- **`ResearchReports.jsx`:** İndirilen tüm araştırma raporlarının (PDF'ler dahil) kurum ve şirket bazlı filtrelenebildiği ana tablodur.
- **`Stocks.jsx` & `StockDetail.jsx`:** Hisselerin canlı fiyatlarının, BIST verilerinin ve o hisseye özel yazılmış hedeflerin/tavsiyelerin incelendiği ekranlardır.

### `src/components/`
Tekrar kullanılabilir, bağımsız UI bileşenleridir.
- **`ReportTable.jsx` & `ReportRow.jsx`:** Veri tablolarının ve PDF butonlarının dinamik olarak render edildiği kompleks bileşenlerdir.
- **`ReportFilters.jsx`:** Raporlar sayfasındaki kurum, kategori (bilanço, telekonferans), tavsiye gibi filtrelemelerin UI kısımlarını oluşturur.
- **`Sidebar.jsx` vb.:** Yan menü veya yardımcı araçlar.
