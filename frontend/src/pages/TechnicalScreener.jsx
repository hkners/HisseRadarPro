import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';

const ScreenerRow = React.memo(({ row, getSignalColor, getSignalBadge }) => {
  return (
    <tr className="row-hoverable">
      <td style={{ textAlign: 'center' }}>
        <ImageWithFallback 
          src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${row.ticker}.png`} 
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
        {row.current_price !== null ? row.current_price.toFixed(2) : 'N/A'}
      </td>
      
      {/* RSI */}
      <td style={{ textAlign: 'center', fontWeight: 'bold', color: row.rsi < 30 ? 'var(--color-up)' : row.rsi > 70 ? 'var(--color-down)' : '#aaa' }}>
        {row.rsi !== null ? row.rsi.toFixed(1) : 'N/A'}
      </td>
      
      {/* MACD */}
      <td style={{ textAlign: 'center' }}>
        <span style={{ 
          color: row.macd_state === 'AL' ? 'var(--color-up)' : row.macd_state === 'SAT' ? 'var(--color-down)' : '#aaa',
          fontWeight: 'bold'
        }}>
          {row.macd_state}
        </span>
      </td>
      
      {/* SMA Trend */}
      <td style={{ textAlign: 'center' }}>
        <span style={{ 
          color: row.sma_state === 'AL' ? 'var(--color-up)' : row.sma_state === 'SAT' ? 'var(--color-down)' : '#aaa',
          fontWeight: 'bold'
        }}>
          {row.sma_state === 'AL' ? 'Yükseliş (SMA20 > SMA50)' : row.sma_state === 'SAT' ? 'Düşüş (SMA20 < SMA50)' : 'Nötr'}
        </span>
      </td>

      {/* Genel Sinyal */}
      <td style={{ textAlign: 'center' }}>
        {getSignalBadge(row.overall)}
      </td>
      
      {/* Detay */}
      <td style={{ fontSize: '0.75rem', color: '#aaa', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.reasons?.join(', ')}>
        {row.reasons?.join(', ') || '-'}
      </td>
    </tr>
  );
});

export default function TechnicalScreener() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [signalFilter, setSignalFilter] = useState('ALL');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  
  const { favorites } = useFavorites();
  const [sortConfig, setSortConfig] = useState({ key: 'overall_score', direction: 'desc' });

  useEffect(() => {
    let intervalId;
    
    const fetchData = () => {
      fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8015/api'}/technical-screener`)
        .then(res => res.json())
        .then(json => {
          // Check if it's the new format {status: "...", data: [...]} or just an array
          const isNewFormat = json && typeof json === 'object' && !Array.isArray(json) && 'status' in json;
          const actualData = isNewFormat ? json.data : (Array.isArray(json) ? json : []);
          
          if (isNewFormat && json.status === 'calculating') {
            // Keep loading true, and poll again in 5 seconds if not already set
            setLoading(true);
          } else {
            // Stop polling
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            // Assign a numeric score for sorting purposes
            const scoredData = actualData.map(item => {
                let score = 0;
                if (item.overall === 'GÜÇLÜ AL') score = 2;
                else if (item.overall === 'AL') score = 1;
                else if (item.overall === 'SAT') score = -1;
                else if (item.overall === 'GÜÇLÜ SAT') score = -2;
                return { ...item, overall_score: score };
            });
            setData(scoredData);
            setLoading(false);
          }
        })
        .catch(err => {
          console.error(err);
          // if there's an error, stop polling so we don't spam
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setLoading(false);
        });
    };

    fetchData(); // Initial fetch
    intervalId = setInterval(fetchData, 5000); // Poll every 5 seconds

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

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
    }
    
    if (onlyFavorites) {
      result = result.filter(item => favorites.includes(item.ticker));
    }

    return result;
  }, [data, search, signalFilter, onlyFavorites, favorites]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (aVal === null || aVal === undefined) aVal = (sortConfig.direction === 'desc' ? -999999 : 999999);
      if (bVal === null || bVal === undefined) bVal = (sortConfig.direction === 'desc' ? -999999 : 999999);

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  if (loading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Teknik Radar</h1>
        <div style={{ textAlign: 'center', padding: '50px', color: '#888' }}>
          <div className="spinner" style={{ margin: '0 auto 20px auto' }}></div>
          Tüm hisselerin teknik analizleri hesaplanıyor, lütfen bekleyin...
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Teknik Radar
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#888', marginLeft: '10px' }}>
             Tüm hisselerin günlük kapanışlarına göre MACD, RSI ve SMA kesişimleri.
          </span>
        </h1>
      </div>

      <div className="card" style={{ marginBottom: '20px', padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', background: 'var(--bg-card)', flexShrink: 0 }}>
        <input 
          type="text" 
          placeholder="Hisse Ara..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: '#fff', flex: '1', minWidth: '200px' }}
        />
        
        <select 
          value={signalFilter} 
          onChange={(e) => setSignalFilter(e.target.value)}
          style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: '#fff' }}
        >
          <option value="ALL">Tüm Sinyaller</option>
          <option value="AL">Sadece AL Verenler</option>
          <option value="SAT">Sadece SAT Verenler</option>
          <option value="NOTR">Nötr</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#ccc' }}>
          <input 
            type="checkbox" 
            checked={onlyFavorites} 
            onChange={(e) => setOnlyFavorites(e.target.checked)} 
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          Sadece Favoriler
        </label>
      </div>

      <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>
                Hisse {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('current_price')} style={{ cursor: 'pointer' }}>
                Fiyat {sortConfig.key === 'current_price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('rsi')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                RSI (14) {sortConfig.key === 'rsi' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ textAlign: 'center' }}>MACD</th>
              <th style={{ textAlign: 'center' }}>Trend (SMA20/50)</th>
              <th onClick={() => handleSort('overall_score')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                Genel Sinyal {sortConfig.key === 'overall_score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Öne Çıkanlar</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length > 0 ? (
              sortedData.map(row => (
                <ScreenerRow 
                  key={row.ticker} 
                  row={row} 
                  getSignalColor={getSignalColor}
                  getSignalBadge={getSignalBadge}
                />
              ))
            ) : (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                  Kriterlere uygun hisse bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '15px', color: '#888', fontSize: '0.85rem', textAlign: 'right' }}>
        Gösterilen hisse sayısı: {sortedData.length}
      </div>
    </div>
  );
}
