import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';

export default function Screener() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter(item => 
      (item.ticker && item.ticker.toLowerCase().includes(term)) ||
      (item.company && item.company.toLowerCase().includes(term))
    );
  }, [data, search]);

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        // Handle strings for ticker comparison
        if (typeof valA === 'string' && typeof valB === 'string' && sortConfig.key === 'ticker') {
          return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        
        // Handle N/A for numeric columns
        if (valA === "N/A" || valA === null || valA === undefined) valA = -999999;
        if (valB === "N/A" || valB === null || valB === undefined) valB = -999999;
        
        if (valA < valB) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortConfig]);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            &gt; CLICK HEADERS TO SORT. SHOWING HIGHEST UPSIDE POTENTIAL BY DEFAULT.
          </p>
          <input
            type="text"
            className="search-box"
            placeholder="SEARCH TICKER OR COMPANY..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '220px' }}
          />
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
                  <th style={{ textAlign: 'center' }}>CONSENSUS RATING</th>
                  <th style={{ cursor: 'pointer', textAlign: 'right', paddingRight: '20px' }} onClick={() => handleSort('upside_potential')}>UPSIDE POTENTIAL ↕</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(row => (
                  <tr key={row.ticker} className="row-hoverable">
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
                    <td style={{ textAlign: 'center' }}>
                      {row.ratings && (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
                          {row.ratings.AL > 0 && <span style={{ background: 'var(--color-up)', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>{row.ratings.AL} AL</span>}
                          {row.ratings.TUT > 0 && <span style={{ background: 'var(--color-warning)', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>{row.ratings.TUT} TUT</span>}
                          {row.ratings.SAT > 0 && <span style={{ background: 'var(--color-down)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>{row.ratings.SAT} SAT</span>}
                        </div>
                      )}
                    </td>
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
                ))}
                {paginatedData.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>NO DATA AVAILABLE.</td>
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