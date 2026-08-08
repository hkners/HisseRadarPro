import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';

const BIST30 = ['AKBNK', 'ALARK', 'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'CCOMP', 'CWENE', 'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL', 'KONTR', 'KOZAA', 'KOZAL', 'KRDMD', 'MIATK', 'ODAS', 'PGSUS', 'PETKM', 'SAHOL', 'SASA', 'SISE', 'TCELL', 'THYAO', 'TOASO', 'TUPRS', 'YKBNK'];
const BIST100 = [
  'AGHOL', 'AKBNK', 'AKCNS', 'AKFGY', 'AKFYE', 'AKSA', 'AKSEN', 'ALARK', 'ALBRK', 'ALFAS',
  'ARCLK', 'ARDYZ', 'ASELS', 'ASTOR', 'ASUZU', 'BERA', 'BIENY', 'BIMAS', 'BIOEN', 'BOBET',
  'BRSAN', 'BRYAT', 'BUCIM', 'CANTE', 'CCOLA', 'CIMSA', 'CWENE', 'DOAS', 'DOHOL', 'ECILC',
  'ECZYT', 'EGEEN', 'EKGYO', 'ENJSA', 'ENKAI', 'EREGL', 'EUPWR', 'EUREN', 'FROTO', 'GARAN',
  'GENIL', 'GESAN', 'GLYHO', 'GUBRF', 'GWIND', 'HALKB', 'HEKTS', 'HKTM', 'ISCTR', 'ISGYO',
  'ISMEN', 'IZENR', 'KCAER', 'KCHOL', 'KLSER', 'KMPUR', 'KONTR', 'KONYA', 'KOZAA', 'KOZAL',
  'KRDMD', 'KZBGY', 'MAVI', 'MGROS', 'MIATK', 'ODAS', 'OTKAR', 'OYAKC', 'PENTA', 'PETKM',
  'PGSUS', 'PNLSN', 'QUAGR', 'SAHOL', 'SASA', 'SAYAS', 'SISE', 'SKBNK', 'SMRTG', 'SOKM',
  'TABGD', 'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TOASO', 'TSKB', 'TTKOM', 'TTRAK', 'TUKAS',
  'TUPRS', 'TURSG', 'ULKER', 'VAKBN', 'VESBE', 'VESTL', 'YEOTK', 'YKBNK', 'YYLGD', 'ZOREN'
];
const XBANK = ['AKBNK', 'GARAN', 'YKBNK', 'ISCTR', 'VAKBN', 'HALKB', 'TSKB', 'SKBNK', 'ALBRK', 'ICBCT', 'KLNMA', 'QNBFL'];



const getPotentialColor = (pct) => {
  if (pct > 50) return '#00ff00';
  if (pct > 20) return '#55cc55';
  if (pct > 0) return '#88aa88';
  if (pct < -20) return '#ff0000';
  if (pct < 0) return '#cc5555';
  return 'var(--color-neutral)';
};

export default function Stocks() {
  const [data, setData] = useState({ status: 'INITIALIZING', last_updated: null, stocks: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'BIST30'
  const [sortConfig, setSortConfig] = useState({ key: 'ticker', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('hisseRadarFavorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (ticker) => {
    setFavorites(prev => {
      const newFavs = prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker];
      localStorage.setItem('hisseRadarFavorites', JSON.stringify(newFavs));
      return newFavs;
    });
  };

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/stocks`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const processedData = useMemo(() => {
    if (!data.stocks) return [];
    
    // 1. Filter by Search
    let result = data.stocks.filter(s => 
      s.ticker.toLowerCase().includes(search.toLowerCase()) || 
      s.name.toLowerCase().includes(search.toLowerCase())
    );

    // 2. Filter by Tab
    if (filter === 'BIST30') {
      result = result.filter(s => BIST30.includes(s.ticker));
    } else if (filter === 'BIST100') {
      result = result.filter(s => BIST100.includes(s.ticker));
    } else if (filter === 'XBANK') {
      result = result.filter(s => XBANK.includes(s.ticker));
    } else if (filter === 'RECOMMENDED') {
      result = result.filter(s => s.rec_count > 0);
    } else if (filter === 'FAVORITES') {
      result = result.filter(s => favorites.includes(s.ticker));
    }

    // 3. Sort
    result.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      
      if (valA === null || valA === undefined) valA = -999999;
      if (valB === null || valB === undefined) valB = -999999;
      
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data.stocks, search, filter, sortConfig, favorites]);

  // Pagination logic
  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const maxVolume = useMemo(() => {
    let m = 0;
    paginatedData.forEach(s => {
      if (s.volume > m) m = s.volume;
    });
    return m;
  }, [paginatedData]);

  const formatVolume = (vol) => {
    if (vol === null || vol === undefined) return 'N/A';
    if (vol > 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol > 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol;
  };

  return (
    <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>BIST INDEX TRACKER // {processedData.length} SYMBOLS</span>
        <span className="blink" style={{ color: data.status === 'FETCHING' ? 'var(--color-warning)' : 'var(--color-up)', fontSize: '0.9rem'}}>
          {data.status === 'FETCHING' ? 'DOWNLOADING LIVE DATA...' : `SYNCED [${data.last_updated}]`}
        </span>
      </div>
      
      <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
          <input 
            type="text" 
            className="search-box" 
            placeholder="SEARCH TICKER OR COMPANY..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => { setFilter('ALL'); setCurrentPage(1); }} 
              className="action-button"
              style={{ background: filter === 'ALL' ? 'var(--bg-highlight)' : 'transparent', color: filter === 'ALL' ? 'var(--bg-panel)' : 'var(--text-highlight)' }}
            >
              [TÜMÜ]
            </button>
            <button 
              onClick={() => { setFilter('RECOMMENDED'); setCurrentPage(1); }} 
              className="action-button"
              style={{ background: filter === 'RECOMMENDED' ? 'var(--bg-highlight)' : 'transparent', color: filter === 'RECOMMENDED' ? 'var(--bg-panel)' : 'var(--text-highlight)' }}
            >
              [ÖNERİLENLER]
            </button>
            <button 
              onClick={() => { setFilter('FAVORITES'); setCurrentPage(1); }} 
              className="action-button"
              style={{ background: filter === 'FAVORITES' ? 'var(--bg-highlight)' : 'transparent', color: filter === 'FAVORITES' ? 'var(--bg-panel)' : 'var(--text-highlight)' }}
            >
              [FAVORİLER]
            </button>
            <button 
              onClick={() => { setFilter('BIST30'); setCurrentPage(1); }} 
              className="action-button"
              style={{ background: filter === 'BIST30' ? 'var(--bg-highlight)' : 'transparent', color: filter === 'BIST30' ? 'var(--bg-panel)' : 'var(--text-highlight)' }}
            >
              [BIST 30]
            </button>
            <button 
              onClick={() => { setFilter('BIST100'); setCurrentPage(1); }} 
              className="action-button"
              style={{ background: filter === 'BIST100' ? 'var(--bg-highlight)' : 'transparent', color: filter === 'BIST100' ? 'var(--bg-panel)' : 'var(--text-highlight)' }}
            >
              [BIST 100]
            </button>
            <button 
              onClick={() => { setFilter('XBANK'); setCurrentPage(1); }} 
              className="action-button"
              style={{ background: filter === 'XBANK' ? 'var(--bg-highlight)' : 'transparent', color: filter === 'XBANK' ? 'var(--bg-panel)' : 'var(--text-highlight)' }}
            >
              [XBANK]
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-highlight)', textAlign: 'center', padding: '40px' }}>INITIALIZING BIST CONNECTION...</div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="data-table">
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 1, boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                  <tr>
                    <th style={{ width: '50px' }}></th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('ticker')}>TICKER {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>COMPANY {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('price')}>PRICE (TRY) {sortConfig.key === 'price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('change_pct')}>CHANGE % {sortConfig.key === 'change_pct' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('volume')}>VOLUME {sortConfig.key === 'volume' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('avg_potential')}>POTENTIAL {sortConfig.key === 'avg_potential' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('rec_count')}>BROKERS {sortConfig.key === 'rec_count' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                    <th style={{ textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map(s => (
                    <tr key={s.ticker} className="row-hoverable">
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span 
                          onClick={() => toggleFavorite(s.ticker)}
                          style={{ cursor: 'pointer', marginRight: '8px', color: favorites.includes(s.ticker) ? 'var(--color-warning)' : 'var(--text-muted)' }}
                        >
                          ★
                        </span>
                        <ImageWithFallback 
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${s.ticker}.png`} 
                          alt={s.ticker} 
                          fallbackName={s.ticker}
                          size={32}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff', objectFit: 'contain', verticalAlign: 'middle' }}
                        />
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        <Link to={`/hisse/${s.ticker}`} className="ticker-link">
                          {s.ticker}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{s.name}</td>
                      <td style={{ fontWeight: 'bold', textAlign: 'right', color: '#fff' }}>
                        {s.price ? s.price.toFixed(2) : 'N/A'}
                      </td>
                      <td style={{ 
                        fontWeight: 'bold', 
                        textAlign: 'right', 
                        color: s.change_pct > 0 ? 'var(--color-up)' : (s.change_pct < 0 ? 'var(--color-down)' : 'var(--text-muted)') 
                      }}>
                        {s.change_pct > 0 ? '▲ ' : (s.change_pct < 0 ? '▼ ' : '')}
                        {s.change_pct !== null && s.change_pct !== undefined ? Math.abs(s.change_pct).toFixed(2) + '%' : 'N/A'}
                      </td>
                      <td style={{ 
                        textAlign: 'right', 
                        color: 'var(--color-neutral)',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute', top: '4px', bottom: '4px', right: 0,
                          background: 'rgba(255, 255, 255, 0.05)', borderRadius: '2px',
                          width: maxVolume > 0 && s.volume ? `${(s.volume / maxVolume) * 100}%` : '0%',
                          zIndex: 0
                        }}></div>
                        <span style={{ position: 'relative', zIndex: 1 }}>{formatVolume(s.volume)}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {s.rec_count > 0 ? (
                          <span style={{ 
                            background: `${getPotentialColor(s.avg_potential)}20`, 
                            color: getPotentialColor(s.avg_potential), 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            border: `1px solid ${getPotentialColor(s.avg_potential)}50`
                          }}>
                            {s.avg_potential > 0 ? '+' : ''}{s.avg_potential.toFixed(1)}%
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        {s.rec_count > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex' }}>
                              {s.brokerages.slice(0, 4).map((broker, idx) => (
                                <ImageWithFallback
                                  key={broker}
                                  src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${slugifyBroker(broker)}.png`}
                                  alt={broker}
                                  fallbackName={broker}
                                  size={32}
                                  title={broker}
                                  style={{
                                    width: '24px', height: '24px', borderRadius: '50%', 
                                    background: '#fff', objectFit: 'contain', 
                                    marginLeft: idx === 0 ? '0' : '-8px',
                                    border: '1px solid var(--bg-panel)',
                                    zIndex: 10 - idx
                                  }}
                                />
                              ))}
                              {s.rec_count > 4 && (
                                <div style={{
                                  width: '24px', height: '24px', borderRadius: '50%',
                                  background: 'var(--bg-highlight)', color: 'var(--text-highlight)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.6rem', fontWeight: 'bold',
                                  marginLeft: '-8px', border: '1px solid var(--bg-panel)', zIndex: 1
                                }}>
                                  +{s.rec_count - 4}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)' }}>[{s.rec_count}]</span>
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Link to={`/hisse/${s.ticker}`} className="action-button" style={{ fontSize: '0.8rem', padding: '2px 8px', textDecoration: 'none' }}>
                          ANALYZE
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {paginatedData.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>NO DATA MATCHES FILTERS.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '15px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <button 
                  className="action-button" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{ opacity: currentPage === 1 ? 0.3 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  &lt; PREV
                </button>
                <span style={{ color: 'var(--text-highlight)', fontWeight: 'bold', fontSize: '0.9rem' }}>PAGE {currentPage} / {totalPages}</span>
                <button 
                  className="action-button" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{ opacity: currentPage === totalPages ? 0.3 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  NEXT &gt;
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}