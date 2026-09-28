import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import { getCachedData, setCachedData } from '../utils/apiCache';

function parseBuySignals(json) {
  if (!json) return [];
  const isNewFormat = typeof json === 'object' && !Array.isArray(json) && 'status' in json;
  const actualData = isNewFormat ? json.data : (Array.isArray(json) ? json : []);
  if (!Array.isArray(actualData)) return [];

  // TREND FİLTRESİ:
  // Düşüş trendindeki, ortalamaların altında kalan veya TradingView SAT olan hisseleri eler
  const buySignals = actualData.filter(item => {
    // 1. Genel karar mutlaka AL veya GÜÇLÜ AL olmalı
    if (item.overall !== 'AL' && item.overall !== 'GÜÇLÜ AL') return false;

    // 2. Trend Filtresi Koruması (Düşen bıçakları ve SAT trendini engelle)
    if (item.trend_state === 'DÜŞÜŞ') return false;
    if (item.tv_recommendation === 'SELL' || item.tv_recommendation === 'STRONG_SELL') return false;
    if (item.sma_state === 'SAT') return false;
    if (item.current_price && item.sma50 && item.current_price < item.sma50 * 0.98) return false;

    // 3. Taze Sinyal Kuralı: Son 5 gün içinde gerçekleşmiş MACD veya SMA kesişimi olmalı
    const hasFreshCrossover = 
      (item.macd_buy_days_ago !== null && item.macd_buy_days_ago <= 5) ||
      (item.sma_buy_days_ago !== null && item.sma_buy_days_ago <= 5) ||
      (item.reasons && item.reasons.some(r => r.includes('yukarı kesti') || r.includes('Golden Cross') || r.includes('taze al')));

    return hasFreshCrossover;
  });

  // Taze kesişim gününe göre sırala (en yeni kesişim en üstte)
  buySignals.sort((a, b) => {
    const daysA = Math.min(a.macd_buy_days_ago ?? 99, a.sma_buy_days_ago ?? 99);
    const daysB = Math.min(b.macd_buy_days_ago ?? 99, b.sma_buy_days_ago ?? 99);
    if (daysA !== daysB) return daysA - daysB;
    if (a.overall === 'GÜÇLÜ AL' && b.overall !== 'GÜÇLÜ AL') return -1;
    if (b.overall === 'GÜÇLÜ AL' && a.overall !== 'GÜÇLÜ AL') return 1;
    return 0;
  });

  return buySignals.slice(0, 10);
}

const FreshSignalsWidget = () => {
  const url = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8015/api'}/technical-screener`;
  const cachedJson = getCachedData(url);
  const initialSignals = cachedJson ? parseBuySignals(cachedJson) : [];

  const [signals, setSignals] = useState(initialSignals);
  const [loading, setLoading] = useState(initialSignals.length === 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let intervalId;
    
    const fetchSignals = () => {
      fetch(url)
        .then(res => res.json())
        .then(json => {
          setCachedData(url, json);
          const isNewFormat = json && typeof json === 'object' && !Array.isArray(json) && 'status' in json;
          
          if (isNewFormat && json.status === 'calculating') {
            if (signals.length === 0) setLoading(true);
          } else {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            const buySignals = parseBuySignals(json);
            setSignals(buySignals);
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
    <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-up'}`} style={{ height: '100%', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ color: 'var(--color-up)', display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px' }}>
        <span>⚡ TAZE AL SİNYALLERİ (MACD/SMA)</span>
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
                    <span className={`rating-badge ${stock.overall?.includes('SAT') ? 'rating-badge--sat' : (stock.overall?.includes('AL') ? 'rating-badge--al' : 'rating-badge--tut')}`} style={{ fontSize: '9px' }}>
                      {stock.overall}
                    </span>
                  </td>
                  <td style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={stock.reasons ? stock.reasons.join(' • ') : ''}>
                    {stock.reasons?.find(r => r.includes('yukarı') || r.includes('taze') || r.includes('Cross') || r.includes('Golden')) || 
                     (stock.macd_buy_days_ago !== null && stock.macd_buy_days_ago <= 5 ? `MACD AL (${stock.macd_buy_days_ago === 0 ? 'Bugün' : stock.macd_buy_days_ago + 'g önce'})` : 
                     (stock.sma_buy_days_ago !== null && stock.sma_buy_days_ago <= 5 ? `SMA20>50 (${stock.sma_buy_days_ago === 0 ? 'Bugün' : stock.sma_buy_days_ago + 'g önce'})` : stock.reasons?.[0] || 'Trend AL'))}
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
