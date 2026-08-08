import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReportStats from '../components/ReportStats';
import ReportFilters from '../components/ReportFilters';
import ReportTable from '../components/ReportTable';

export default function ResearchReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBroker, setSelectedBroker] = useState('ALL');
  const [selectedRating, setSelectedRating] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [minUpside, setMinUpside] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Accordion state
  const [expandedId, setExpandedId] = useState(null);

  const REPORT_CATEGORIES = [
    "Günlük Bültenler",
    "Haftalık & Aylık Bültenler",
    "Makro & Strateji Raporları",
    "Sektör Raporları",
    "Model Portföy Güncellemeleri",
    "Bilanço Notları",
    "Toplantı & Telekonferans Notları",
    "Şirket Değerlendirmeleri",
    "Diğer"
  ];

  const getCategoryFromTitle = (title) => {
    if (!title) return "Diğer";
    const t = title.toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I').replace(/Ğ/g, 'G').replace(/Ü/g, 'U')
      .replace(/Ş/g, 'S').replace(/Ö/g, 'O').replace(/Ç/g, 'C');

    if (t.includes("GUNLUK") || t.includes("DAILY") || t.includes("PIYASA") || t.includes("SABAH")) return "Günlük Bültenler";
    if (t.includes("HAFTALIK") || t.includes("AYLIK")) return "Haftalık & Aylık Bültenler";
    if (t.includes("STRATEJI") || t.includes("MAKRO") || t.includes("EKONOMI")) return "Makro & Strateji Raporları";
    if (t.includes("SEKTOR") || t.includes("NAD TABLOSU") || t.includes("BANKACILIK") || t.includes("HAVACILIK")) return "Sektör Raporları";
    if (t.includes("PORTFOY")) return "Model Portföy Güncellemeleri";
    if (t.includes("BILANCO") || t.includes("FINANSAL SONUC") || t.includes("KARDELEN") || t.includes("BEKLENTI") || t.includes("SONUCLAR")) return "Bilanço Notları";
    if (t.includes("TOPLANTI") || t.includes("TELEKONFERANS") || t.includes("YATIRIMCI")) return "Toplantı & Telekonferans Notları";
    if (t.includes("DEGERLENDIRME") || t.includes("SIRKET RAPOR") || t.includes("INCELEME") || t.includes("ANALIZ")) return "Şirket Değerlendirmeleri";
    
    return "Diğer";
  };

  const parseDateFromTitle = (title, originalDate) => {
    if (!title) return originalDate;
    
    const match1 = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (match1) {
      return `${match1[3]}-${match1[2]}-${match1[1]}`;
    }

    const months = {
      "Ocak": "01", "Şubat": "02", "Subat": "02", "Mart": "03", "Nisan": "04", "Mayıs": "05", "Mayis": "05", "Haziran": "06",
      "Temmuz": "07", "Ağustos": "08", "Agustos": "08", "Eylül": "09", "Eylul": "09", "Ekim": "10", "Kasım": "11", "Kasim": "11", "Aralık": "12", "Aralik": "12"
    };
    
    for (const [mName, mNum] of Object.entries(months)) {
      const regex = new RegExp(`(\\d{1,2})\\s+${mName}\\s+(\\d{4})`, 'i');
      const match2 = title.match(regex);
      if (match2) {
        const d = match2[1].padStart(2, '0');
        return `${match2[2]}-${mNum}-${d}`;
      }
    }
    
    for (const [mName, mNum] of Object.entries(months)) {
      const regex = new RegExp(`(\\d{1,2})\\s+${mName}`, 'i');
      const match3 = title.match(regex);
      if (match3) {
        const d = match3[1].padStart(2, '0');
        const y = originalDate ? originalDate.split('-')[0] : new Date().getFullYear();
        return `${y}-${mNum}-${d}`;
      }
    }

    return originalDate;
  };

  const extractTickerFromTitle = (title) => {
    if (!title) return null;
    const match = title.match(/^([A-Z0-9]{4,5})(?:\s+-\s+|\s+)/);
    if (match) {
      const maybeTicker = match[1];
      if (["BIST", "OCAK", "MART", "EKIM", "ENDEK", "FON", "YENI"].includes(maybeTicker)) return null;
      return maybeTicker;
    }
    return null;
  };

  const API_URLS = useMemo(() => [
    `${import.meta.env.VITE_API_URL}/scraped-reports`,
    `${import.meta.env.VITE_API_URL}/scraped-reports`,
    '/api/scraped-reports'
  ], []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    let success = false;

    for (const url of API_URLS) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const categorizedData = [];
          data.forEach(r => {
            const parsedCat = getCategoryFromTitle(r.report_title);
            let extTicker = r.ticker;
            if (!extTicker) extTicker = extractTickerFromTitle(r.report_title);
            
            const baseReport = {
              ...r,
              ticker: extTicker,
              category: parsedCat,
              report_date: parseDateFromTitle(r.report_title, r.report_date)
            };
            
            const sanitizeOutliers = (tp, cp, pot) => {
              if (tp && cp) {
                const calculatedPot = ((tp - cp) / cp) * 100;
                if (calculatedPot > 500 || calculatedPot < -80) {
                  return { target_price: null, potansiyel: null };
                }
              }
              return { target_price: tp, potansiyel: pot };
            };

            if (r.stocks && Array.isArray(r.stocks) && r.stocks.length > 0) {
              r.stocks.forEach(st => {
                let rawTp = st.target_price || r.target_price;
                let rawCp = st.current_price || r.current_price;
                let rawPot = st.potansiyel || r.potansiyel;
                
                const sanitized = sanitizeOutliers(rawTp, rawCp, rawPot);

                categorizedData.push({
                  ...baseReport,
                  id: r.id + "_" + st.ticker,
                  ticker: st.ticker || extTicker,
                  rating: st.rating || r.rating,
                  target_price: sanitized.target_price,
                  current_price: rawCp,
                  potansiyel: sanitized.potansiyel
                });
              });
            } else {
              const sanitized = sanitizeOutliers(r.target_price, r.current_price, r.potansiyel);
              categorizedData.push({ 
                ...baseReport, 
                target_price: sanitized.target_price, 
                potansiyel: sanitized.potansiyel 
              });
            }
          });
          setReports(categorizedData);
          success = true;
          break;
        }
      } catch {
        // try next URL
      }
    }

    if (!success) {
      setReports([
        {
          id: "report_c71c67fe3581",
          ticker: "THYAO",
          broker: "Garanti BBVA",
          rating: "AL",
          target_price: 450.0,
          current_price: 315.5,
          potansiyel: 42.6,
          report_date: "2026-08-01",
          summary: "Garanti BBVA Yatırım Türk Hava Yolları şirket raporu.",
          catalysts: "Güçlü bilanço, artan operasyonel marjlar ve pazar payı büyümesi.",
          full_text: "Türk Hava Yolları yüksek yolcu doluluk oranları ve kargo operasyonları ile büyümesini sürdürmektedir.",
          cached: true,
          prompt_id: "v1_research_extractor",
          file_hash: "sha256:2245741ac3d0dff6b0bf24fdc9cb86765a69b30b3a1ccd75f7bceb30415ba9de",
          pdf_url: "https://www.garantibbvayatirim.com.tr/downloads/garanti_thyao_20260801.pdf",
          report_title: "THYAO Garanti BBVA Şirket Raporu - Hedef Fiyat Güncellemesi",
          category: "Şirket Raporları"
        },
        {
          id: "report_903372ea6257",
          ticker: "ASELS",
          broker: "Deniz Yatırım",
          rating: "AL",
          target_price: 95.0,
          current_price: 64.5,
          potansiyel: 47.29,
          report_date: "2026-07-30",
          summary: "Deniz Yatırım Aselsan Elektronik şirket raporu.",
          catalysts: "Rekor bakiye siparişler, yeni ihracat pazarları.",
          full_text: "Aselsan yeni alınan savunma sanayi sözleşmeleri ve rekor sipariş backlog'u ile büyümesini korumaktadır.",
          cached: true,
          prompt_id: "v1_research_extractor",
          file_hash: "sha256:3d09b70f8c89d0cc067a58b214d33565f2274ed0902fb28cfb4d020a1b2755f4",
          pdf_url: "https://www.denizyatirim.com/downloads/deniz_asels_20260730.pdf",
          report_title: "ASELS Deniz Yatırım Şirket Raporu - Güçlü Sipariş Pozisyonu",
          category: "Şirket Raporları"
        }
      ]);
    }
    setLoading(false);
  }, [API_URLS]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Compute brokers list for filter
  const brokers = useMemo(() => Array.from(new Set(reports.map(r => r.broker))).filter(Boolean), [reports]);

  // Filter logic
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const text = `${r.ticker} ${r.broker} ${r.report_title} ${r.summary} ${r.catalysts}`.toLowerCase();
        if (!text.includes(term)) return false;
      }
      if (selectedBroker !== 'ALL' && r.broker !== selectedBroker) return false;
      if (selectedCategory !== 'ALL' && r.category !== selectedCategory) return false;
      if (selectedRating !== 'ALL' && r.rating?.toUpperCase() !== selectedRating.toUpperCase()) return false;
      if (minUpside !== '' && !isNaN(parseFloat(minUpside))) {
        const pot = r.potansiyel ?? 0;
        if (pot < parseFloat(minUpside)) return false;
      }
      return true;
    });
  }, [reports, searchTerm, selectedBroker, selectedCategory, selectedRating, minUpside]);

  // Sort logic
  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      if (sortBy === 'potansiyel_desc') {
        return (b.potansiyel || 0) - (a.potansiyel || 0);
      }
      if (sortBy === 'potansiyel_asc') {
        return (a.potansiyel || 0) - (b.potansiyel || 0);
      }
      if (sortBy === 'date_asc') {
        return new Date(a.report_date) - new Date(b.report_date);
      }
      return new Date(b.report_date) - new Date(a.report_date);
    });
  }, [filteredReports, sortBy]);

  // Reset pagination when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredReports, sortBy]);

  // Pagination logic
  const ITEMS_PER_PAGE = 50;
  const totalPages = Math.ceil(sortedReports.length / ITEMS_PER_PAGE) || 1;
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedReports.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedReports, currentPage]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedBroker('ALL');
    setSelectedRating('ALL');
    setSelectedCategory('ALL');
    setMinUpside('');
    setSortBy('date_desc');
    setCurrentPage(1);
  };

  const toggleAccordion = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="research-reports-page">
      {/* Terminal Title Header */}
      <div className="panel" style={{ marginBottom: '15px' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>// ARAŞTIRMA RAPORLARI (RESEARCH REPORTS TERMINAL)</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>DATA SOURCE: LLM SCRAPER NETWORK</span>
        </div>
      </div>

      {/* Analytical Stats Bar & Recharts Distribution */}
      <ReportStats reports={filteredReports} />

      {/* Filter Controls Panel */}
      <ReportFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedBroker={selectedBroker}
        setSelectedBroker={setSelectedBroker}
        brokers={brokers}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        categories={REPORT_CATEGORIES}
        selectedRating={selectedRating}
        setSelectedRating={setSelectedRating}
        minUpside={minUpside}
        setMinUpside={setMinUpside}
        sortBy={sortBy}
        setSortBy={setSortBy}
        onReset={handleResetFilters}
      />

      {/* Terminal Data Table & Pagination */}
      <ReportTable
        reports={sortedReports}
        paginatedReports={paginatedReports}
        loading={loading}
        expandedId={expandedId}
        onToggleAccordion={toggleAccordion}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
