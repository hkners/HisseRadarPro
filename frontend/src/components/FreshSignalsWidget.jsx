import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';

const FreshSignalsWidget = () => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let intervalId;
    
    const fetchSignals = () => {
      fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8015/api'}/technical-screener`)
        .then(res => res.json())
        .then(json => {
          const isNewFormat = json && typeof json === 'object' && !Array.isArray(json) && 'status' in json;
          const actualData = isNewFormat ? json.data : (Array.isArray(json) ? json : []);
          
          if (isNewFormat && json.status === 'calculating') {
            setLoading(true);
          } else {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            
            // Filter only stocks with "AL" or "GÜÇLÜ AL" that have fresh signal reasons (crossover)
            const buySignals = actualData.filter(item => {
                if (item.overall !== 'AL' && item.overall !== 'GÜÇLÜ AL') return false;
                if (!item.reasons || item.reasons.length === 0) return false;
                
                // We only care about MACD or SMA crossovers (yeni al verenler)
                const hasGoldenCross = item.reasons.some(r => r.includes('yukarı kesti') || r.includes('satım bölgesi'));
                return hasGoldenCross;
            });
            
            // Limit to top 10 for dashboard
            setSignals(buySignals.slice(0, 10));
            setLoading(false);
          }
        })
        .catch(err => {
          console.error(err);
          if (intervalId) clearInterval(intervalId);
          setError(true);
          setLoading(false);
        });
    };

    fetchSignals();
    intervalId = setInterval(fetchSignals, 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return (
    <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-up'}`} style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-header" style={{ color: 'var(--color-up)', display: 'flex', justifyContent: 'space-between' }}>
        <span>TAZE AL SİNYALLERİ (MACD / SMA)</span>
        <Link to="/technical-screener" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[TÜMÜ]</Link>
      </div>
      <div className="panel-content panel-scrollable">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
             Sinyaller Hesaplanıyor...
          </div>
        ) : (
          <table className="data-table compact">
            <thead>
              <tr>
                <th>HİSSE</th>
                <th>SİNYAL</th>
                <th>NEDEN</th>
              </tr>
            </thead>
            <tbody>
              {signals.map(stock => (
                <tr key={stock.ticker} className="row-hoverable">
                  <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ImageWithFallback 
                      src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${stock.ticker}.png`} 
                      alt={stock.ticker} 
                      fallbackName={stock.ticker}
                      size={16}
                      style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                    />
                    <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-highlight">{stock.ticker}</Link>
                  </td>
                  <td>
                    <span className="rating-badge rating-badge--al" style={{ fontSize: '9px' }}>
                      {stock.overall}
                    </span>
                  </td>
                  <td style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {stock.reasons.find(r => r.includes('yukarı') || r.includes('satım')) || stock.reasons[0]}
                  </td>
                </tr>
              ))}
              {signals.length === 0 && !loading && !error && (
                <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Bugün yeni AL veren hisse bulunamadı.</td></tr>
              )}
              {error && (
                <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-down)' }}>Veri alınamadı.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default FreshSignalsWidget;
