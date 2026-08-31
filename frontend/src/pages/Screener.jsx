import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';

const ScreenerRow = React.memo(({ row, getPotentialColor }) => {
  const pe = row.fundamentals?.pe_ratio;
  const pb = row.fundamentals?.pb_ratio;
  const displayPe = (typeof pe === 'number') ? pe.toFixed(2) : 'N/A';
  const displayPb = (typeof pb === 'number') ? pb.toFixed(2) : 'N/A';
  
  return (
    <tr className="row-hoverable">
      <td style={{ textAlign: 'center' }}>
        <ImageWithFallback 
          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${row.ticker}.png`} 
          alt={row.ticker} 
          fallbackName={row.ticker}
          size={28}
          style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
        />
      </td>
      <td>
        <FavoriteStar ticker={row.ticker} style={{ fontSize: '14px' }} />
        <Link to={`/hisse/${row.ticker}`} className="ticker-link text-highlight" style={{ fontWeight: 'bold' }}>
          {row.ticker}
        </Link>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {row.company || row.ticker}
        </div>
      </td>
      <td style={{ fontWeight: '700' }}>
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
      <td style={{ color: '#fff', fontWeight: 'bold' }}>{typeof row.avg_target === 'number' ? row.avg_target.toFixed(2) : 'N/A'}</td>
      <td style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>{row.count}</td>

      <td style={{ textAlign: 'center', color: 'var(--text-highlight)' }}>{displayPe}</td>
      <td style={{ textAlign: 'center', color: 'var(--text-highlight)' }}>{displayPb}</td>
      <td className={getPotentialColor(typeof row.upside_potential === 'number' ? row.upside_potential : 0)} style={{ fontWeight: 'bold', color: (typeof row.upside_potential === 'number' && row.upside_potential > 0) ? 'var(--color-up)' : 'var(--color-down)', textAlign: 'right', paddingRight: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <span>{(typeof row.upside_potential === 'number' && row.upside_potential > 0) ? '+' : ''}{typeof row.upside_potential === 'number' ? row.upside_potential.toFixed(2) + '%' : 'N/A'}</span>
          {typeof row.upside_potential === 'number' && row.upside_potential > 0 && (
            <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(row.upside_potential, 100)}%`, height: '100%', background: 'var(--color-up)' }}></div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});

export default function Screener() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [minPotential, setMinPotential] = useState(-50);
  const [minReports, setMinReports] = useState(1);
  const [onlyModels, setOnlyModels] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  
  const { favorites } = useFavorites();

  const [sortConfig, setSortConfig] = useState({ key: 'upside_potential', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/screener`)
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

    return result;
  }, [data, search, minPotential, minReports, onlyModels, onlyFavorites, favorites]);

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
    <div className="panel flex-1">
      <div className="panel-header" style={{ color: 'var(--color-neutral)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>CONSENSUS SCREENER (AI AGGREGATED FROM 300+ REPORTS)</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          TOTAL: {sortedData.length} STOCKS
        </span>
      </div>
      <div className="panel-content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '15px' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            &gt; CLICK HEADERS TO SORT. SHOWING HIGHEST UPSIDE POTENTIAL BY DEFAULT.
          </p>
          
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '15px', background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>SEARCH TICKER/COMPANY</label>
              <input
                type="text"
                className="search-box"
                placeholder="Ör: THYAO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '220px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '10px', color: 'var(--color-up)', fontWeight: 'bold' }}>MIN UPSIDE (%)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="range" min="-50" max="100" step="10" 
                  value={minPotential} 
                  onChange={(e) => setMinPotential(Number(e.target.value))} 
                  style={{ width: '120px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 'bold', width: '30px' }}>{minPotential}%</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '10px', color: 'var(--color-warning)', fontWeight: 'bold' }}>MIN REPORTS</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="range" min="1" max="15" step="1" 
                  value={minReports} 
                  onChange={(e) => setMinReports(Number(e.target.value))} 
                  style={{ width: '120px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 'bold', width: '20px' }}>{minReports}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="onlyFavorites"
                  checked={onlyFavorites}
                  onChange={(e) => setOnlyFavorites(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="onlyFavorites" style={{ fontSize: '12px', color: 'var(--color-warning)', fontWeight: 'bold', cursor: 'pointer' }}>
                  FAVORİLER
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="onlyModels"
                  checked={onlyModels}
                  onChange={(e) => setOnlyModels(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="onlyModels" style={{ fontSize: '12px', color: 'var(--color-cyan)', fontWeight: 'bold', cursor: 'pointer' }}>
                  MODEL PORTFÖY HİSSELERİ
                </label>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-highlight)' }}>ANALYZING REPORTS...</div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('ticker')}>TICKER ↕</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('current_price')}>LIVE PRICE (TRY) ↕</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_target')}>CONSENSUS TARGET ↕</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('count')}>REPORT COUNT ↕</th>
                  <th style={{ textAlign: 'center' }}>F/K</th>
                  <th style={{ textAlign: 'center' }}>PD/DD</th>
                  <th style={{ cursor: 'pointer', textAlign: 'right', paddingRight: '20px' }} onClick={() => handleSort('upside_potential')}>UPSIDE POTENTIAL ↕</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(row => (
                  <ScreenerRow 
                    key={row.ticker} 
                    row={row} 
                    getPotentialColor={getPotentialColor}
                  />
                ))}
                {paginatedData.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>NO DATA AVAILABLE.</td>
                  </tr>
                )}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div style={{ padding: '15px 0 5px 0', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--border-color)', marginTop: '15px' }}>
                <button 
                  className="btn-read" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{ opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  ◀ PREV
                </button>
                <span style={{ fontSize: '13px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
                  PAGE {currentPage} / {totalPages}
                </span>
                <button 
                  className="btn-read"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{ opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  NEXT ▶
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}