import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';
import { BIST30, BIST100 } from '../utils/bistIndices';
import PageContainer from '../components/common/PageContainer';
import { usePolling } from '../hooks/usePolling';

const ScreenerRow = React.memo(({ row, getSignalColor, getSignalBadge }) => {
  return (
    <tr className="row-hoverable">
      <td style={{ textAlign: 'center', width: '4.5%' }}>
        <ImageWithFallback 
          src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${row.ticker}.png`} 
          alt={row.ticker} 
          fallbackName={row.ticker}
          size={26}
          style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
        />
      </td>
      <td style={{ textAlign: 'left', width: '18%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FavoriteStar ticker={row.ticker} size={15} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Link to={`/hisse/${row.ticker}`} className="ticker-link" style={{ fontSize: '13px', fontWeight: 'bold' }}>
              {row.ticker}
            </Link>
            {BIST30.includes(row.ticker) && <span className="badge badge-subtle" style={{ fontSize: '9px', padding: '1px 3px' }}>B30</span>}
          </div>
        </div>
      </td>
      <td style={{ fontWeight: '700', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {row.current_price !== null ? row.current_price.toFixed(2) : 'N/A'}
      </td>
      
      {/* Genel Sinyal */}
      <td style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {getSignalBadge(row.overall)}
      </td>

      {/* RSI */}
      <td style={{ textAlign: 'center', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', color: row.rsi < 30 ? 'var(--color-up)' : row.rsi > 70 ? 'var(--color-down)' : '#aaa' }}>
        {row.rsi !== null ? row.rsi.toFixed(1) : 'N/A'}
      </td>
      
      {/* MACD */}
      <td style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ 
          color: row.macd_state === 'AL' ? 'var(--color-up)' : row.macd_state === 'SAT' ? 'var(--color-down)' : '#aaa',
          fontWeight: 'bold',
          fontSize: '11px'
        }}>
          {row.macd_state}
          {row.macd_state === 'AL' && row.macd_buy_days_ago !== null && (
            <span style={{ fontSize: '0.7rem', fontWeight: 'normal', marginLeft: '4px', opacity: 0.8 }}>
              ({row.macd_buy_days_ago === 0 ? 'Bugün' : `${row.macd_buy_days_ago}g`})
            </span>
          )}
        </span>
      </td>
      
      {/* SMA Trend */}
      <td style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ 
          color: row.sma_state === 'AL' ? 'var(--color-up)' : row.sma_state === 'SAT' ? 'var(--color-down)' : '#aaa',
          fontWeight: 'bold',
          fontSize: '11px'
        }}>
          {row.sma_state === 'AL' ? 'Yükseliş (SMA20>50)' : row.sma_state === 'SAT' ? 'Düşüş (SMA20<50)' : 'Nötr'}
          {row.sma_state === 'AL' && row.sma_buy_days_ago !== null && (
            <span style={{ fontSize: '0.7rem', fontWeight: 'normal', marginLeft: '4px', opacity: 0.8 }}>
              ({row.sma_buy_days_ago === 0 ? 'Bugün' : `${row.sma_buy_days_ago}g`})
            </span>
          )}
        </span>
      </td>

      {/* Detay */}
      <td style={{ fontSize: '0.75rem', color: '#aaa', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.reasons?.join(', ')}>
        {row.reasons?.join(', ') || '-'}
      </td>

      {/* İşlem */}
      <td style={{ textAlign: 'center' }}>
        <Link 
          to={`/hisse/${row.ticker}`} 
          className="action-button" 
          style={{ padding: '3px 8px', fontSize: '10.5px' }}
        >
          [KOKPİT]
        </Link>
      </td>
    </tr>
  );
});

export default function TechnicalScreener() {
  const transformData = (actualData) => {
    const list = Array.isArray(actualData) 
      ? actualData 
      : (actualData && Array.isArray(actualData.data) ? actualData.data : []);

    return list.map(item => {
        let score = 0;
        if (item.overall === 'GÜÇLÜ AL') score = 2;
        else if (item.overall === 'AL') score = 1;
        else if (item.overall === 'SAT') score = -1;
        else if (item.overall === 'GÜÇLÜ SAT') score = -2;
        return { ...item, overall_score: score };
    });
  };

  const { data: fetchedData, loading, error } = usePolling(
    `${import.meta.env.VITE_API_URL || '/api'}/technical-screener`,
    5000,
    transformData
  );

  const [convictionMap, setConvictionMap] = useState({});

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/conviction/all`)
      .then(res => res.ok ? res.json() : [])
      .then(list => {
        const m = {};
        if (Array.isArray(list)) {
          list.forEach(item => { m[item.ticker] = item; });
        }
        setConvictionMap(m);
      })
      .catch(() => {});
  }, []);

  const data = fetchedData || [];

  const [search, setSearch] = useState('');
  const [signalFilter, setSignalFilter] = useState('ALL');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [indexFilter, setIndexFilter] = useState('ALL');
  
  const { favorites } = useFavorites();
  const [sortConfig, setSortConfig] = useState({ key: 'overall_score', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSignalColor = (signal) => {
    if (signal.includes('AL')) return 'var(--color-up)';
    if (signal.includes('SAT')) return 'var(--color-down)';
    return '#aaa';
  };

  const getSignalBadge = (signal) => {
    let bg = '#333';
    let color = '#aaa';
    if (signal === 'GÜÇLÜ AL') { bg = 'rgba(0,255,128,0.2)'; color = 'var(--color-up)'; }
    if (signal === 'AL') { bg = 'rgba(0,255,128,0.1)'; color = 'var(--color-up)'; }
    if (signal === 'SAT') { bg = 'rgba(255,80,80,0.1)'; color = 'var(--color-down)'; }
    if (signal === 'GÜÇLÜ SAT') { bg = 'rgba(255,80,80,0.2)'; color = 'var(--color-down)'; }
    
    return (
      <span style={{
        background: bg, color: color, padding: '4px 8px', borderRadius: '4px',
        fontWeight: 'bold', fontSize: '0.85rem'
      }}>
        {signal}
      </span>
    );
  };

  const filteredData = useMemo(() => {
    let result = data;
    
    if (indexFilter === 'BIST30') {
      result = result.filter(i => BIST30.includes(i.ticker));
    } else if (indexFilter === 'BIST100') {
      result = result.filter(i => BIST100.includes(i.ticker));
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(item => 
        (item.ticker && item.ticker.toLowerCase().includes(term)) ||
        (item.company && item.company.toLowerCase().includes(term))
      );
    }

    if (signalFilter !== 'ALL') {
      if (signalFilter === 'AL') result = result.filter(i => i.overall_score > 0);
      else if (signalFilter === 'SAT') result = result.filter(i => i.overall_score < 0);
      else if (signalFilter === 'NOTR') result = result.filter(i => i.overall_score === 0);
      else if (signalFilter === 'RECENT_BUY') {
        result = result.filter(i => 
          (i.macd_buy_days_ago !== null && i.macd_buy_days_ago <= 5) || 
          (i.sma_buy_days_ago !== null && i.sma_buy_days_ago <= 5)
        );
      }
      else if (signalFilter === 'DOUBLE_CONFIRM') {
        result = result.filter(i => {
          const conv = convictionMap[i.ticker];
          return i.overall_score > 0 && conv && conv.upside_pct >= 20;
        });
      }
    }
    
    if (onlyFavorites) {
      result = result.filter(item => favorites.includes(item.ticker));
    }

    return result;
  }, [data, convictionMap, search, signalFilter, onlyFavorites, favorites, indexFilter]);

  // ... (inside component)

  const sortedData = useMemo(() => {
    let finalData = filteredData;
    if (sortConfig.key) {
      finalData = [...filteredData].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        if (aVal === null || aVal === undefined) aVal = (sortConfig.direction === 'desc' ? -999999 : 999999);
        if (bVal === null || bVal === undefined) bVal = (sortConfig.direction === 'desc' ? -999999 : 999999);

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return finalData;
  }, [filteredData, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  
  const currentData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, signalFilter, onlyFavorites, sortConfig, indexFilter]);

  return (
    <PageContainer 
      title="TEKNİK RADAR"
      badge={{
        label: `${sortedData.length} HİSSE`,
        background: 'rgba(63, 185, 80, 0.15)',
        color: 'var(--color-up)',
        borderColor: 'rgba(63, 185, 80, 0.35)'
      }}
      subtitle="Günlük Kapanışlara Göre TradingView, MACD, RSI ve SMA Kesişimleri"
      statusDot="var(--color-up)"
    >
      <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>
          <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Hisse / Şirket Ara..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ 
                  width: '220px',
                  height: '30px',
                  padding: '4px 10px', 
                  borderRadius: '4px', 
                  border: '1px solid var(--border-color)', 
                  background: 'var(--bg-secondary)', 
                  color: '#fff', 
                  fontSize: '11px',
                  outline: 'none'
                }}
              />
              <button 
                onClick={() => { setSignalFilter('ALL'); setIndexFilter('ALL'); setOnlyFavorites(false); setSearch(''); }}
                className={`action-button ${signalFilter === 'ALL' && indexFilter === 'ALL' && !onlyFavorites ? 'active' : ''}`}
              >
                [TÜMÜ]
              </button>
              <button 
                onClick={() => { setSignalFilter('DOUBLE_CONFIRM'); }}
                className={`action-button ${signalFilter === 'DOUBLE_CONFIRM' ? 'active-cyan' : ''}`}
                style={signalFilter === 'DOUBLE_CONFIRM' ? {} : { color: 'var(--color-cyan)', borderColor: 'rgba(0, 229, 255, 0.3)' }}
              >
                [ÇİFTE TEYİT]
              </button>
              <button 
                onClick={() => { setSignalFilter('AL'); }}
                className={`action-button ${signalFilter === 'AL' ? 'active-green' : ''}`}
                style={signalFilter === 'AL' ? {} : { color: 'var(--color-up)', borderColor: 'rgba(0, 230, 118, 0.3)' }}
              >
                [AL SİNYALİ]
              </button>
              <button 
                onClick={() => { setSignalFilter('RECENT_BUY'); }}
                className={`action-button ${signalFilter === 'RECENT_BUY' ? 'active-purple' : ''}`}
                style={signalFilter === 'RECENT_BUY' ? {} : { color: '#b388ff', borderColor: 'rgba(179, 136, 255, 0.3)' }}
              >
                [YENİ AL]
              </button>
              <button 
                onClick={() => setOnlyFavorites(!onlyFavorites)}
                className={`action-button ${onlyFavorites ? 'active-warning' : ''}`}
                style={onlyFavorites ? {} : { color: 'var(--color-warning)', borderColor: 'rgba(255, 170, 0, 0.3)' }}
              >
                [FAVORİLER]
              </button>
              <button 
                onClick={() => setIndexFilter(indexFilter === 'BIST30' ? 'ALL' : 'BIST30')}
                className={`action-button ${indexFilter === 'BIST30' ? 'active' : ''}`}
              >
                [BIST 30]
              </button>
              <button 
                onClick={() => setIndexFilter(indexFilter === 'BIST100' ? 'ALL' : 'BIST100')}
                className={`action-button ${indexFilter === 'BIST100' ? 'active' : ''}`}
              >
                [BIST 100]
              </button>
            </div>

            {/* Right Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select 
                value={signalFilter} 
                onChange={(e) => setSignalFilter(e.target.value)}
                style={{ height: '30px', padding: '0 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-highlight)', fontSize: '11px', cursor: 'pointer', outline: 'none' }}
              >
                <option value="ALL">Filtre: Tüm Sinyaller</option>
                <option value="DOUBLE_CONFIRM">Filtre: Çifte Teyit (AL + Kurum)</option>
                <option value="AL">Filtre: Sadece AL</option>
                <option value="SAT">Filtre: Sadece SAT</option>
                <option value="NOTR">Filtre: Nötr</option>
                <option value="RECENT_BUY">Filtre: Son 5 Günde AL</option>
              </select>
            </div>
          </div>

          <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
            <table className="data-table data-table-fixed" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <tr>
                  <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                  <th onClick={() => handleSort('ticker')} style={{ width: '18%', cursor: 'pointer', textAlign: 'left' }}>
                    HİSSE {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th onClick={() => handleSort('current_price')} style={{ width: '9.5%', cursor: 'pointer', textAlign: 'right' }}>
                    FİYAT (TL) {sortConfig.key === 'current_price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th onClick={() => handleSort('overall_score')} style={{ width: '12%', cursor: 'pointer', textAlign: 'center' }}>
                    GENEL SİNYAL {sortConfig.key === 'overall_score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th onClick={() => handleSort('rsi')} style={{ width: '8.5%', cursor: 'pointer', textAlign: 'center' }}>
                    RSI (14) {sortConfig.key === 'rsi' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '11.5%', textAlign: 'center' }}>MACD</th>
                  <th style={{ width: '14.5%', textAlign: 'center' }}>TREND (SMA20/50)</th>
                  <th style={{ width: '12.5%', textAlign: 'left' }}>ÖNE ÇIKANLAR</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>İŞLEM</th>
                </tr>
              </thead>
              <tbody>
                {loading && data.length === 0 ? (
                  Array.from({ length: 14 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="skeleton-bar" style={{ width: '15px', height: '15px', borderRadius: '50%' }} />
                          <div className="skeleton-bar" style={{ width: '60px', height: '14px' }} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '50px', height: '16px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '70px', height: '20px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '40px', height: '16px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '60px', height: '16px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '110px', height: '16px', margin: '0 auto' }} />
                      </td>
                      <td>
                        <div className="skeleton-bar" style={{ width: '90px', height: '14px' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '50px', height: '20px', margin: '0 auto' }} />
                      </td>
                    </tr>
                  ))
                ) : error && data.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--color-down)' }}>
                      Hata: {error}
                    </td>
                  </tr>
                ) : currentData.length > 0 ? (
                  currentData.map(row => (
                    <ScreenerRow 
                      key={row.ticker} 
                      row={row} 
                      getSignalColor={getSignalColor}
                      getSignalBadge={getSignalBadge}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                      Kriterlere uygun hisse bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
            <div style={{ color: 'var(--text-muted)' }}>
              Gösterilen: {sortedData.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedData.length)} / Toplam: {sortedData.length}
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button 
                className="action-button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
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
                style={{ opacity: currentPage === totalPages || totalPages === 0 ? 0.4 : 1, cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer' }}
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
