import React, { useEffect, useState, useMemo, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import { sortReportsByDateDesc } from '../utils/dateUtils';
import ImageWithFallback from '../components/ImageWithFallback';
import PageContainer from '../components/common/PageContainer';
import FavoriteStar from '../components/common/FavoriteStar';
import { useFavorites } from '../hooks/useFavorites';

export default function BrokerageDetail() {
  const { kurumName } = useParams();
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'POSITIVE', 'HIGH_POT', 'LIVE_ONLY'
  const [sortConfig, setSortConfig] = useState({ key: 'tarih', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const { favorites } = useFavorites();

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL || '/api'}/kurum/${kurumName}`)
      .then(res => res.json())
      .then(data => {
        const sorted = sortReportsByDateDesc(data);
        setRecs(sorted);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [kurumName]);

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  const displayName = kurumName.replace(/-/g, ' ').toUpperCase();
  const brokerSlug = slugifyBroker(kurumName.replace(/-/g, ' '));

  const getPotentialColor = (pot) => {
    if (pot === null || pot === undefined) return 'var(--text-muted)';
    const str = String(pot);
    const num = parseFloat(str.replace('%', '').replace(',', '.'));
    if (isNaN(num)) return 'var(--text-muted)';
    if (num > 50) return 'var(--positive)';
    if (num > 20) return 'var(--positive)';
    if (num > 0) return 'var(--positive)';
    if (num < -20) return 'var(--negative)';
    if (num < 0) return 'var(--negative)';
    return 'var(--color-neutral)';
  };

  const formatPotential = (pot) => {
    if (pot === null || pot === undefined || pot === "N/A" || pot === "Bilinmiyor" || pot === "None") return "-";
    const val = parseFloat(pot);
    if (isNaN(val)) return "-";
    return val >= 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  };

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Pre-process items for numeric search & sorting
  const processedRecs = useMemo(() => {
    const isUnknown = (val) => !val || val === 'Bilinmiyor' || val === 'N/A' || val === 'None' || val === 'null' || val === 0 || val === '0' || val === '0.0';
    
    return recs.map(r => {
      let reportPrice = isUnknown(r.mevcutFiyat) ? null : parseFloat(String(r.mevcutFiyat).replace(',', '.'));
      let targetPrice = isUnknown(r.hedefFiyat) ? null : parseFloat(String(r.hedefFiyat).replace(',', '.'));
      if (isNaN(reportPrice)) reportPrice = null;
      if (isNaN(targetPrice)) targetPrice = null;

      let livePotential = null;
      if (r.live_price && targetPrice) {
        livePotential = parseFloat(((targetPrice - r.live_price) / r.live_price * 100).toFixed(2));
      }

      let originalPot = null;
      if (r.potansiyel && !isUnknown(r.potansiyel)) {
        const pNum = parseFloat(String(r.potansiyel).replace('%', '').replace(',', '.'));
        if (!isNaN(pNum)) originalPot = pNum;
      }

      const activePot = livePotential !== null ? livePotential : originalPot;

      return {
        ...r,
        reportPrice,
        targetPrice,
        livePotential,
        originalPot,
        activePot
      };
    });
  }, [recs]);

  const filteredRecs = useMemo(() => {
    let result = processedRecs;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => 
        (r.ticker && r.ticker.toLowerCase().includes(q)) || 
        (r.hisse && r.hisse.toLowerCase().includes(q))
      );
    }

    if (filter === 'POSITIVE') {
      result = result.filter(r => r.activePot !== null && r.activePot > 0);
    } else if (filter === 'HIGH_POT') {
      result = result.filter(r => r.activePot !== null && r.activePot >= 40);
    } else if (filter === 'LIVE_ONLY') {
      result = result.filter(r => r.live_price !== null && r.live_price !== undefined);
    } else if (filter === 'FAVORITES') {
      result = result.filter(r => r.ticker && favorites.includes(r.ticker));
    }

    return result;
  }, [processedRecs, search, filter, favorites]);

  const sortedRecs = useMemo(() => {
    let sortable = [...filteredRecs];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'ticker' || sortConfig.key === 'hisse' || sortConfig.key === 'tarih') {
          return sortConfig.direction === 'asc'
            ? String(valA || '').localeCompare(String(valB || ''), 'tr')
            : String(valB || '').localeCompare(String(valA || ''), 'tr');
        }

        if (valA === null || valA === undefined) valA = (sortConfig.direction === 'desc' ? -999999 : 999999);
        if (valB === null || valB === undefined) valB = (sortConfig.direction === 'desc' ? -999999 : 999999);

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [filteredRecs, sortConfig]);

  const totalRecs = recs.length;
  const matchedRecs = recs.filter(r => r.ticker).length;
  
  const avgPotential = useMemo(() => {
    const valid = processedRecs.filter(r => r.activePot !== null);
    if (valid.length === 0) return '0.0';
    const sum = valid.reduce((acc, r) => acc + r.activePot, 0);
    return (sum / valid.length).toFixed(1);
  }, [processedRecs]);

  const totalPages = Math.ceil(sortedRecs.length / itemsPerPage) || 1;
  const paginatedRecs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedRecs.slice(start, start + itemsPerPage);
  }, [sortedRecs, currentPage, itemsPerPage]);

  return (
    <PageContainer
      title={displayName}
      badge={{
        label: `${totalRecs} RAPOR`,
        background: 'rgba(200, 162, 74, 0.12)',
        color: 'var(--color-neutral)',
        borderColor: 'rgba(200, 162, 74, 0.3)'
      }}
      subtitle={`${totalRecs} raporun ${matchedRecs} tanesi bir BIST hissesiyle eşleşti.`}
      statusDot="var(--color-neutral)"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px' }}>
            Ort. Potansiyel: <strong style={{ color: 'var(--color-up)' }}>%{avgPotential}</strong>
          </span>
          <Link to="/brokerages" className="action-button" style={{ textDecoration: 'none', fontSize: '10.5px' }}>
            &lt; TÜM KURUMLAR
          </Link>
        </div>
      }
      scrollable={true}
    >
      <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>

          {/* Controls and Filters Ribbon */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Hisse Ara..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '220px',
                  height: '28px',
                  padding: '3px 10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  outline: 'none'
                }}
              />
              <button 
                onClick={() => { setFilter('ALL'); setSearch(''); setCurrentPage(1); }}
                className={`action-button ${filter === 'ALL' && !search ? 'active' : ''}`}
              >
                Tümü
              </button>
              <button 
                onClick={() => { setFilter('POSITIVE'); setCurrentPage(1); }}
                className={`action-button ${filter === 'POSITIVE' ? 'active-green' : ''}`}
              >
                Pozitif potansiyel
              </button>
              <button 
                onClick={() => { setFilter('HIGH_POT'); setCurrentPage(1); }}
                className={`action-button ${filter === 'HIGH_POT' ? 'active-purple' : ''}`}
              >
                Yüksek potansiyel (%40+)
              </button>
              <button 
                onClick={() => { setFilter('LIVE_ONLY'); setCurrentPage(1); }}
                className={`action-button ${filter === 'LIVE_ONLY' ? 'active-cyan' : ''}`}
              >
                Güncel fiyatlı
              </button>
              <button 
                onClick={() => { setFilter('FAVORITES'); setCurrentPage(1); }}
                className={`action-button ${filter === 'FAVORITES' ? 'active-warning' : ''}`}
              >
                Favoriler{favorites.length > 0 ? ` (${favorites.length})` : ''}
              </button>
              <button 
                onClick={() => { setFilter('ALL'); setSearch(''); setCurrentPage(1); }}
                className="action-button"
              >
                Sıfırla
              </button>
            </div>
          </div>

          <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
            <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <tr>
                  <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                  <th style={{ width: '17.5%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('ticker')}>
                    HİSSE {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '11%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('tarih')}>
                    TARİH {sortConfig.key === 'tarih' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '11%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('reportPrice')}>
                    RAPOR FİYATI {sortConfig.key === 'reportPrice' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '13%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('targetPrice')}>
                    HEDEF FİYAT {sortConfig.key === 'targetPrice' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '15%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('live_price')}>
                    GÜNCEL FİYAT {sortConfig.key === 'live_price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '14%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('activePot')}>
                    POTANSİYEL {sortConfig.key === 'activePot' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '14%', textAlign: 'center' }}>
                    İŞLEM
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 20 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="skeleton-bar" style={{ width: '15px', height: '15px', borderRadius: '3px' }} />
                          <div className="skeleton-bar" style={{ width: '60px', height: '14px' }} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '70px', height: '14px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '65px', height: '14px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '50px', height: '20px', margin: '0 auto' }} />
                      </td>
                    </tr>
                  ))
                ) : paginatedRecs.length > 0 ? (
                  paginatedRecs.map((r, i) => {
                    const isExpanded = expandedRow === i;
                    const tickerDisplay = r.ticker || r.hisse;
                    const linkTarget = r.ticker ? `/hisse/${r.ticker}` : '#';

                    return (
                      <Fragment key={i}>
                        <tr className="row-hoverable" onClick={() => toggleRow(i)}>
                          <td style={{ textAlign: 'center', width: '4.5%' }}>
                            <ImageWithFallback 
                              src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${r.ticker || 'UNKNOWN'}.png`} 
                              alt={tickerDisplay} 
                              fallbackName={tickerDisplay}
                              size={26}
                              style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                            />
                          </td>
                          <td style={{ textAlign: 'left', width: '17.5%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {r.ticker ? (
                                <FavoriteStar ticker={r.ticker} size={15} style={{ marginRight: 0 }} />
                              ) : (
                                <span style={{ width: '15px', display: 'inline-block' }} />
                              )}
                              <Link to={linkTarget} className="ticker-link" onClick={(e) => e.stopPropagation()} style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                <span style={{ color: r.ticker ? 'var(--text-highlight)' : 'var(--color-warning)' }}>
                                  {tickerDisplay}
                                </span>
                              </Link>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                            {r.tarih}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                            {r.reportPrice !== null ? r.reportPrice.toFixed(2) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                            {r.targetPrice !== null ? r.targetPrice.toFixed(2) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                            {r.live_price ? (
                              <span>
                                <span style={{ color: 'var(--text-highlight)' }}>{r.live_price.toFixed(2)}</span>
                                {r.live_change_pct !== null && r.live_change_pct !== undefined && (
                                  <span style={{ 
                                    color: r.live_change_pct > 0 ? 'var(--color-up)' : r.live_change_pct < 0 ? 'var(--color-down)' : 'var(--color-neutral)',
                                    fontSize: '11px', marginLeft: '4px'
                                  }}>
                                    {r.live_change_pct > 0 ? '▲' : r.live_change_pct < 0 ? '▼' : ''}{Math.abs(r.live_change_pct).toFixed(1)}%
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                            {r.livePotential !== null ? (
                              <span style={{ color: getPotentialColor(r.livePotential + '%') }}>
                                %{r.livePotential > 0 ? '+' : ''}{r.livePotential.toFixed(1)}
                              </span>
                            ) : r.originalPot !== null ? (
                              <span style={{ color: getPotentialColor(r.originalPot + '%') }}>
                                {formatPotential(r.originalPot)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="action-button" 
                              style={{ 
                                padding: '3px 8px', 
                                fontSize: '10.5px',
                                color: (!r.full_text && !r.pdf_url) ? 'var(--neon-blue)' : 'var(--neon-cyan)'
                              }}
                              onClick={(e) => { e.stopPropagation(); toggleRow(i); }}
                            >
                              {isExpanded ? 'Kapat' : ((!r.full_text || r.full_text === "Metin bulunamadı.") && !r.pdf_url) ? 'Detay' : 'Metin'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="accordion-row">
                            <td colSpan="8" style={{ padding: '10px 14px', background: 'rgba(0, 0, 0, 0.4)', borderBottom: '1px solid var(--border-color)' }}>
                              <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
                                <div style={{ color: 'var(--text-highlight)', marginBottom: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>{r.hisse} RAPOR ÖZET VE METNİ ({r.tarih}):</span>
                                  {r.ticker && (
                                    <Link to={`/hisse/${r.ticker}`} className="action-button" style={{ padding: '1px 6px', fontSize: '9.5px', textDecoration: 'none' }}>
                                      Hisse kokpitine git
                                    </Link>
                                  )}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                  {(!r.full_text || r.full_text === "Metin bulunamadı.") && (!r.metin || r.metin === "Metin bulunamadı.") ? 
                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                      Bu veri Fintables üzerinden aracı kurumun hedef fiyat ve model portföy tablolarından otomatik olarak entegre edilmiştir. Aracı kurumun detaylı PDF rapor metnine ulaşılamamaktadır.
                                    </span> : 
                                    (r.full_text || r.metin)
                                  }
                                </div>
                                {(r.pdf_url || r.link) && (
                                  <div>
                                    <a 
                                      href={r.pdf_url || r.link} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="action-button active-cyan"
                                      style={{ display: 'inline-block', textDecoration: 'none', padding: '3px 8px', fontSize: '10px' }}
                                    >
                                      Orijinal kaynağa git ↗
                                    </a>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      Bu aracı kurum için arama kriterine uygun rapor bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
            <div style={{ color: 'var(--text-muted)' }}>
              Gösterilen: {sortedRecs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedRecs.length)} / Toplam: {sortedRecs.length}
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button 
                className="action-button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', height: '26px', fontSize: '10.5px' }}
              >
                &lt; Önceki
              </button>
              <span style={{ padding: '3px 8px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
                Sayfa {currentPage} / {totalPages || 1}
              </span>
              <button 
                className="action-button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                style={{ opacity: (currentPage === totalPages || totalPages === 0) ? 0.4 : 1, cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer', height: '26px', fontSize: '10.5px' }}
              >
                Sonraki &gt;
              </button>
            </div>
          </div>

        </div>
      </div>
    </PageContainer>
  );
}
