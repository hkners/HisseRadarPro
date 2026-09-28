import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';
import PageContainer from '../components/common/PageContainer';
import { usePolling } from '../hooks/usePolling';
import { BIST30, BIST100 } from '../utils/bistIndices';

const ScreenerRow = React.memo(({ row, getPotentialColor }) => {
  const pe = row.fundamentals?.pe_ratio;
  const pb = row.fundamentals?.pb_ratio;
  const displayPe = (typeof pe === 'number') ? pe.toFixed(2) : 'N/A';
  const displayPb = (typeof pb === 'number') ? pb.toFixed(2) : 'N/A';
  
  return (
    <tr className="row-hoverable">
      <td style={{ textAlign: 'center', width: '4.5%' }}>
        <ImageWithFallback 
          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${row.ticker}.png`} 
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
            {row.in_model_portfolio && <span className="badge badge-gold" style={{ fontSize: '9px', padding: '1px 3px' }}>MOD</span>}
          </div>
        </div>
      </td>
      <td style={{ fontWeight: '700', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {row.current_price !== "N/A" ? (typeof row.current_price === 'number' ? row.current_price.toFixed(2) : row.current_price) : 'N/A'}
        {row.live_change_pct !== undefined && row.live_change_pct !== null && row.live_change_pct !== 0 && (
          <span style={{ 
            color: row.live_change_pct > 0 ? 'var(--color-up)' : 'var(--color-down)',
            fontSize: '0.75rem', marginLeft: '6px'
          }}>
            {row.live_change_pct > 0 ? '\u25b2' : '\u25bc'} {Math.abs(row.live_change_pct).toFixed(1)}%
          </span>
        )}
      </td>
      <td style={{ color: '#fff', fontWeight: 'bold', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {typeof row.avg_target === 'number' ? row.avg_target.toFixed(2) : 'N/A'}
      </td>
      <td className={getPotentialColor(typeof row.upside_potential === 'number' ? row.upside_potential : 0)} style={{ fontWeight: 'bold', color: (typeof row.upside_potential === 'number' && row.upside_potential > 0) ? ((row.is_excessive_rr || row.upside_potential > 150) ? '#ffab00' : 'var(--color-up)') : 'var(--color-down)', textAlign: 'right', paddingRight: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
          {(row.is_excessive_rr || (typeof row.upside_potential === 'number' && row.upside_potential > 150)) && (
            <span title="Aşırı yüksek potansiyel (eski rapor veya düşen bıçak olabilir)" style={{ fontSize: '10px', cursor: 'help' }}>⚠️</span>
          )}
          <span>{(typeof row.upside_potential === 'number' && row.upside_potential > 0) ? '+' : ''}{typeof row.upside_potential === 'number' ? row.upside_potential.toFixed(2) + '%' : 'N/A'}</span>
          {typeof row.upside_potential === 'number' && row.upside_potential > 0 && (
            <div style={{ width: '50px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${Math.min(row.upside_potential, 100)}%`, height: '100%', background: (row.is_excessive_rr || row.upside_potential > 150) ? '#ffab00' : 'var(--color-up)' }}></div>
            </div>
          )}
        </div>
      </td>
      <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '13px' }}>{row.count}</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '3px' }}>Kurum</span>
      </td>

      <td style={{ textAlign: 'center', color: 'var(--text-highlight)' }}>{displayPe}</td>
      <td style={{ textAlign: 'center', color: 'var(--text-highlight)' }}>{displayPb}</td>
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

export default function Screener() {
  const { data: fetchedData, loading } = usePolling(`${import.meta.env.VITE_API_URL || '/api'}/screener`, 0);
  const data = Array.isArray(fetchedData) ? fetchedData : (fetchedData && Array.isArray(fetchedData.data) ? fetchedData.data : []);

  const [search, setSearch] = useState('');
  const [minPotential, setMinPotential] = useState(-50);
  const [minReports, setMinReports] = useState(1);
  const [onlyModels, setOnlyModels] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [indexFilter, setIndexFilter] = useState('ALL');
  
  const { favorites } = useFavorites();

  const [sortConfig, setSortConfig] = useState({ key: 'upside_potential', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    let result = data;
    
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(item => 
        (item.ticker && item.ticker.toLowerCase().includes(term)) ||
        (item.company && item.company.toLowerCase().includes(term))
      );
    }

    if (minPotential > -50) {
      result = result.filter(item => typeof item.upside_potential === 'number' && item.upside_potential >= minPotential);
    }
    
    if (minReports > 1) {
      result = result.filter(item => item.count >= minReports);
    }

    if (onlyModels) {
      result = result.filter(item => item.in_model_portfolio === true);
    }
    
    if (onlyFavorites) {
      result = result.filter(item => favorites.includes(item.ticker));
    }

    if (indexFilter === 'BIST30') {
      result = result.filter(item => BIST30.includes(item.ticker));
    } else if (indexFilter === 'BIST100') {
      result = result.filter(item => BIST100.includes(item.ticker));
    }

    return result;
  }, [data, search, minPotential, minReports, onlyModels, onlyFavorites, indexFilter, favorites]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'current_price') {
        aVal = typeof aVal === 'number' ? aVal : -999999;
        bVal = typeof bVal === 'number' ? bVal : -999999;
      }
      if (sortConfig.key === 'avg_target' || sortConfig.key === 'upside_potential') {
        aVal = typeof aVal === 'number' ? aVal : (sortConfig.direction === 'desc' ? -999999 : 999999);
        bVal = typeof bVal === 'number' ? bVal : (sortConfig.direction === 'desc' ? -999999 : 999999);
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortConfig, minPotential, minReports, onlyModels, onlyFavorites]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const getPotentialColor = (pct) => {
    if (pct > 50) return 'bg-green-30';
    if (pct > 20) return 'bg-green-20';
    if (pct > 0) return 'bg-green-10';
    if (pct < -20) return 'bg-red-30';
    if (pct < 0) return 'bg-red-10';
    return '';
  };

  return (
    <PageContainer 
      title="KONSENSÜS HİSSE TARAYICI"
      badge={{
        label: `${sortedData.length} HİSSE`,
        background: 'rgba(57, 197, 207, 0.15)',
        color: 'var(--color-cyan)',
        borderColor: 'rgba(57, 197, 207, 0.35)'
      }}
      subtitle="Aracı Kurum Raporlarından Agrege Edilen Potansiyel ve Çarpan Analizi"
    >
      <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>
          {/* Controls and Filters Ribbon */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  borderRadius: '4px',
                  fontSize: '11px',
                  outline: 'none'
                }}
              />
              <button 
                onClick={() => { setMinPotential(-50); setMinReports(1); setOnlyModels(false); setOnlyFavorites(false); setIndexFilter('ALL'); setSearch(''); }}
                className={`action-button ${minPotential === -50 && minReports === 1 && !onlyModels && !onlyFavorites && indexFilter === 'ALL' && !search ? 'active' : ''}`}
              >
                [TÜMÜ]
              </button>
              <button 
                onClick={() => { setMinPotential(30); setMinReports(3); setOnlyModels(false); setOnlyFavorites(false); setIndexFilter('ALL'); }}
                className={`action-button ${minPotential === 30 && minReports === 3 ? 'active-green' : ''}`}
                style={minPotential === 30 && minReports === 3 ? {} : { color: 'var(--color-up)', borderColor: 'rgba(0, 230, 118, 0.3)' }}
              >
                [KONSENSÜS %30+]
              </button>
              <button 
                onClick={() => { setOnlyModels(!onlyModels); setMinPotential(-50); setMinReports(1); }}
                className={`action-button ${onlyModels ? 'active-purple' : ''}`}
                style={onlyModels ? {} : { color: '#b388ff', borderColor: 'rgba(179, 136, 255, 0.3)' }}
              >
                [MODEL PORTFÖY]
              </button>
              <button 
                onClick={() => { setMinPotential(40); setMinReports(1); setOnlyModels(false); }}
                className={`action-button ${minPotential === 40 ? 'active-cyan' : ''}`}
                style={minPotential === 40 ? {} : { color: 'var(--color-cyan)', borderColor: 'rgba(0, 229, 255, 0.3)' }}
              >
                [YÜKSEK İSKONTO]
              </button>
              <button 
                onClick={() => { setOnlyFavorites(!onlyFavorites); }}
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
              <button 
                onClick={() => { setMinPotential(-50); setMinReports(1); setOnlyModels(false); setOnlyFavorites(false); setIndexFilter('ALL'); setSearch(''); }}
                className="action-button"
                style={{ color: 'var(--text-muted)' }}
              >
                [SIFIRLA]
              </button>
            </div>

            {/* Inline Sliders */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                <span>Pot:</span>
                <input 
                  type="range" min="-50" max="100" step="10" 
                  value={minPotential} 
                  onChange={(e) => setMinPotential(Number(e.target.value))} 
                  style={{ width: '75px', cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--color-cyan)', fontWeight: 'bold', width: '32px' }}>%{minPotential}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                <span>Rapor:</span>
                <input 
                  type="range" min="1" max="15" step="1" 
                  value={minReports} 
                  onChange={(e) => setMinReports(Number(e.target.value))} 
                  style={{ width: '55px', cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--color-warning)', fontWeight: 'bold', width: '16px' }}>{minReports}</span>
              </div>
            </div>
          </div>

          <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
            <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <tr>
                  <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                  <th style={{ width: '18%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('ticker')}>HİSSE {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                  <th style={{ width: '10.5%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('current_price')}>FİYAT (TL) {sortConfig.key === 'current_price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                  <th style={{ width: '11.5%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('avg_target')}>HEDEF FİYAT {sortConfig.key === 'avg_target' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                  <th style={{ width: '17.5%', cursor: 'pointer', textAlign: 'right', paddingRight: '15px' }} onClick={() => handleSort('upside_potential')}>POTANSİYEL {sortConfig.key === 'upside_potential' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                  <th style={{ width: '10%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('count')}>KURUMLAR {sortConfig.key === 'count' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                  <th style={{ width: '9.5%', textAlign: 'center' }}>F/K</th>
                  <th style={{ width: '9.5%', textAlign: 'center' }}>PD/DD</th>
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
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '16px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '80px', height: '16px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '16px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '40px', height: '16px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '40px', height: '16px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '50px', height: '20px', margin: '0 auto' }} />
                      </td>
                    </tr>
                  ))
                ) : paginatedData.length > 0 ? (
                  paginatedData.map(row => (
                    <ScreenerRow 
                      key={row.ticker} 
                      row={row} 
                      getPotentialColor={getPotentialColor}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>VERİ BULUNAMADI.</td>
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
                style={{ opacity: (currentPage === totalPages || totalPages === 0) ? 0.4 : 1, cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer' }}
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