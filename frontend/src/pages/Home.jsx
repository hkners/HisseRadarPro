import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';
import FreshSignalsWidget from '../components/FreshSignalsWidget';

export default function Home() {
  const [stats, setStats] = useState([]);
  const [topStocks, setTopStocks] = useState([]);
  const [recentModels, setRecentModels] = useState([]);
  const [latestRecommendations, setLatestRecommendations] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const { favorites: favoriteTickers } = useFavorites();
  const [marketPulse, setMarketPulse] = useState({ up: 0, down: 0, flat: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isLive, setIsLive] = useState(false);


  useEffect(() => {
    let mounted = true;
    
    const loadDashboardData = () => {
      // Single unified dashboard endpoint — replaces 5 separate API calls
      fetch(`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/dashboard`)
        .then(res => res.json())
        .then(data => {
          if (!mounted) return;
          
          // Kurum stats
          if (data.kurum_stats) setStats(data.kurum_stats);
          
          // Top stocks (pre-sorted by count)
          if (data.top_stocks) setTopStocks(data.top_stocks);
          
          // Models
          if (data.models) setRecentModels(data.models);
          
          // Latest recommendations
          if (data.latest_recommendations) setLatestRecommendations(data.latest_recommendations);
          
          // Market pulse
          if (data.market_pulse) setMarketPulse(data.market_pulse);
          
          // Favorites from stocks data
          if (data.stocks) {
            setAllStocks(data.stocks.stocks);
            setMarketPulse(data.market_pulse || { up: 0, down: 0, flat: 0, total: 0 });
            setIsLive(data.status === "LIVE");
          }
          
          setLoading(false);
          setError(false);
          
          // If still fetching prices, retry after 3s
          if (data.stocks && (data.stocks.status === "FETCHING" || data.stocks.status === "INITIALIZING")) {
            setTimeout(loadDashboardData, 3000);
          }
        })
        .catch(err => {
          console.error("Dashboard fetch error:", err);
          if (!mounted) return;
          setError(true);
          setLoading(false);
          setTimeout(loadDashboardData, 5000);
        });
    };

    loadDashboardData();
    
    // Auto-refresh data every 60 seconds when idle
    const intervalId = setInterval(loadDashboardData, 60000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const favoriteStocks = React.useMemo(() => {
    return allStocks.filter(s => favoriteTickers.includes(s.ticker));
  }, [allStocks, favoriteTickers]);

  return (
    <div className="dashboard-layout" style={{ animation: 'fadeIn 0.5s ease-in' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h2 style={{ color: 'var(--text-highlight)', display: 'flex', alignItems: 'center', margin: 0, fontSize: '16px' }}>
          <span className={error ? "blink" : ""} style={{ color: error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)', marginRight: '10px' }}>●</span> 
          COMMAND CENTER DASHBOARD
        </h2>
        <div style={{ fontSize: '11px', color: error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)', border: `1px solid ${error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)'}`, padding: '4px 10px', borderRadius: '4px' }}>
          {error ? 'OFFLINE - RECONNECTING...' : isLive ? 'SYSTEM ONLINE - LIVE PRICING' : 'SYSTEM BOOTING - FETCHING DATA...'}
        </div>
      </div>
      
      {loading ? (
        <div style={{ color: 'var(--text-highlight)', textAlign: 'center', padding: '50px' }}>
          <div className="blink" style={{ fontSize: '24px', marginBottom: '10px' }}>●</div>
          ESTABLISHING SECURE CONNECTION...
        </div>
      ) : (
        <>
          {/* Market Pulse Bar */}
          <div className="panel-neon neon-neutral" style={{ padding: '8px 15px', marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
              <span style={{ color: 'var(--text-muted)' }}>MARKET PULSE (BIST LIVE)</span>
              <span><span style={{color: 'var(--text-muted)'}}>TOTAL:</span> {marketPulse.total}</span>
            </div>
            
            <div className="sentiment-bar-container">
              <div className="sentiment-fill sentiment-up" style={{ width: `${(marketPulse.up / Math.max(1, marketPulse.total)) * 100}%`, transition: 'width 1s ease' }}></div>
              <div className="sentiment-fill sentiment-flat" style={{ width: `${(marketPulse.flat / Math.max(1, marketPulse.total)) * 100}%`, transition: 'width 1s ease' }}></div>
              <div className="sentiment-fill sentiment-down" style={{ width: `${(marketPulse.down / Math.max(1, marketPulse.total)) * 100}%`, transition: 'width 1s ease' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', fontWeight: 'bold' }}>
              <span style={{ color: 'var(--color-up)' }}>▲ ADVANCING: {marketPulse.up} ({((marketPulse.up / Math.max(1, marketPulse.total)) * 100).toFixed(1)}%)</span>
              <span style={{ color: 'var(--color-neutral)' }}>► FLAT: {marketPulse.flat}</span>
              <span style={{ color: 'var(--color-red)' }}>▼ DECLINING: {marketPulse.down} ({((marketPulse.down / Math.max(1, marketPulse.total)) * 100).toFixed(1)}%)</span>
            </div>
          </div>

          <div className="dashboard-grid">
          
            {/* SOL KOLON: Top Consensus + Favorites + Models */}
            <div className="dashboard-col">
              {/* Top Recommendations Summary */}
              <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-up'}`} style={{ flex: 1, minHeight: 0 }}>
                <div className="panel-header" style={{ color: 'var(--color-up)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>TOP CONSENSUS TARGETS</span>
                  <Link to="/screener" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[MORE]</Link>
                </div>
                <div className="panel-content panel-scrollable" style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 'bold', paddingBottom: '4px', borderBottom: '1px solid #1a1a1a', textTransform: 'uppercase' }}>
                      <div style={{ width: '80px', textAlign: 'left' }}>TICKER</div>
                      <div style={{ flex: 1, textAlign: 'center' }}>UPSIDE</div>
                      <div style={{ width: '40px', textAlign: 'right' }}>REPS</div>
                    </div>
                    {topStocks.slice(0, 10).map(stock => (
                      <div key={stock.ticker} className="row-hoverable" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid #1a1a1a' }}>
                        <div style={{ width: '80px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ImageWithFallback 
                            src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${stock.ticker}.png`} 
                            alt={stock.ticker} 
                            fallbackName={stock.ticker}
                            size={16}
                            style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                          />
                          <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-up">{stock.ticker}</Link>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 15px' }}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <span className={(typeof stock.upside_potential === 'number' && stock.upside_potential > 0) ? "text-up" : (typeof stock.upside_potential === 'number' && stock.upside_potential < 0) ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                              {(typeof stock.upside_potential === 'number' && stock.upside_potential > 0) ? '+' : ''}{typeof stock.upside_potential === 'number' ? stock.upside_potential.toFixed(2) + '%' : 'N/A'}
                            </span>
                          </div>
                          {typeof stock.upside_potential === 'number' && stock.upside_potential > 0 && (
                            <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '1.5px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(stock.upside_potential, 100)}%`, height: '100%', background: 'var(--color-up)', margin: '0 auto' }}></div>
                            </div>
                          )}
                        </div>
                        <div style={{ width: '40px', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-neutral)' }}>
                          {stock.count}
                        </div>
                      </div>
                    ))}
                    {topStocks.length === 0 && !error && (
                      <div style={{ textAlign: 'center', color: 'var(--color-warning)', padding: '10px' }}>AWAITING DATA SYNC...</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Favorites Watchlist */}
              <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-warning'}`} style={{ flex: 1, minHeight: 0 }}>
                <div className="panel-header" style={{ color: 'var(--color-warning)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>FAVORITES WATCHLIST</span>
                  <Link to="/hisseler" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[MANAGE]</Link>
                </div>
                <div className="panel-content panel-scrollable">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>TICKER</th>
                        <th>PRICE</th>
                        <th>CHANGE</th>
                        <th style={{ textAlign: 'center' }}>UPSIDE</th>
                        <th>REPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {favoriteStocks.map(stock => (
                        <tr key={stock.ticker} className="row-hoverable">
                          <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FavoriteStar ticker={stock.ticker} style={{ fontSize: '14px' }} />
                            <ImageWithFallback 
                              src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${stock.ticker}.png`} 
                              alt={stock.ticker} 
                              fallbackName={stock.ticker}
                              size={16}
                              style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                            />
                            <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-warning">{stock.ticker}</Link>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>
                            {stock.price ? stock.price.toFixed(2) : 'N/A'}
                          </td>
                          <td className={stock.change_pct > 0 ? "text-up" : stock.change_pct < 0 ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                            {stock.change_pct > 0 ? '▲' : stock.change_pct < 0 ? '▼' : ''} {stock.change_pct !== null && stock.change_pct !== undefined ? Math.abs(stock.change_pct).toFixed(2) + '%' : 'N/A'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={(typeof stock.avg_potential === 'number' && stock.avg_potential > 0) ? "text-up" : (typeof stock.avg_potential === 'number' && stock.avg_potential < 0) ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                              {(typeof stock.avg_potential === 'number' && stock.avg_potential > 0) ? '+' : ''}{typeof stock.avg_potential === 'number' && stock.avg_potential !== 0 ? stock.avg_potential.toFixed(2) + '%' : 'N/A'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 'bold', color: 'var(--text-neutral)' }}>
                            {stock.rec_count || 0}
                          </td>
                        </tr>
                      ))}
                      {favoriteStocks.length === 0 && !error && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>NO FAVORITES STARRED.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* SAĞ KOLON: Brokerage Leaderboard */}
            <div className="dashboard-col">
              {/* Fresh Technical Signals */}
              <FreshSignalsWidget />

              {/* Brokerage Directory */}
              <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-warning'}`} style={{ flex: 1 }}>
                <div className="panel-header" style={{ color: 'var(--color-warning)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>BROKERAGE LEADERBOARD</span>
                  <Link to="/brokerages" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[ALL]</Link>
                </div>
                <div className="panel-content panel-scrollable">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>BROKERAGE</th>
                        <th>REPS</th>
                        <th>AVG UP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.slice(0, 20).map(k => (
                        <tr key={k.kurum} className="row-hoverable">
                          <td style={{ fontWeight: 'bold', maxWidth: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ImageWithFallback 
                              src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${slugifyBroker(k.kurum)}.png`} 
                              alt={k.kurum} 
                              fallbackName={k.kurum}
                              size={16}
                              style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                            />
                            <Link to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} className="ticker-link text-highlight" title={k.kurum}>
                              {k.kurum}
                            </Link>
                          </td>
                          <td className="text-neutral" style={{ fontWeight: 'bold' }}>{k.count}</td>
                          <td className={(typeof k.avg_potential === 'number' && k.avg_potential > 0) ? "text-up" : (typeof k.avg_potential === 'number' && k.avg_potential < 0) ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                            {typeof k.avg_potential === 'number' && k.avg_potential !== 0 ? (
                              <>{(k.avg_potential > 0) ? '+' : ''}{k.avg_potential.toFixed(2)}%</>
                            ) : 'N/A'}
                          </td>
                        </tr>
                      ))}
                      {stats.length === 0 && !error && (
                        <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-warning)' }}>AWAITING DATA SYNC...</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}