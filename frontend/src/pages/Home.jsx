import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';

export default function Home() {
  const [stats, setStats] = useState([]);
  const [topStocks, setTopStocks] = useState([]);
  const [recentModels, setRecentModels] = useState([]);
  const [latestRecommendations, setLatestRecommendations] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [marketPulse, setMarketPulse] = useState({ up: 0, down: 0, flat: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const loadDashboardData = () => {
      Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/kurum-stats`).then(res => res.json()),
        fetch(`${import.meta.env.VITE_API_URL}/screener`).then(res => res.json()),
        fetch(`${import.meta.env.VITE_API_URL}/models`).then(res => res.json()),
        fetch(`${import.meta.env.VITE_API_URL}/stocks`).then(res => res.json()),
        fetch(`${import.meta.env.VITE_API_URL}/recommendations/latest`).then(res => res.json())
      ]).then(([statsData, screenerData, modelsData, stocksData, latestRecs]) => {
        if (!mounted) return;
        
        setStats(statsData);
        const sortedStocks = screenerData.sort((a, b) => b.count - a.count).slice(0, 5);
        setTopStocks(sortedStocks);
        setRecentModels(modelsData.slice(0, 3));
        setLatestRecommendations(latestRecs || []);
        
        // Calculate Market Pulse
        if (stocksData.stocks) {
          let up = 0, down = 0, flat = 0;
          stocksData.stocks.forEach(s => {
            if (s.change_pct > 0) up++;
            else if (s.change_pct < 0) down++;
            else flat++;
          });
          setMarketPulse({ up, down, flat, total: stocksData.stocks.length });
        }
        
        // Read Favorites from localStorage
        try {
           const saved = localStorage.getItem('hisseRadarFavorites');
           if (saved) {
             const favTickers = JSON.parse(saved);
             if (stocksData.stocks) {
                const favStocks = stocksData.stocks.filter(s => favTickers.includes(s.ticker));
                setFavorites(favStocks);
             }
           }
        } catch {}
        
        setIsLive(stocksData.status === "READY");
        setLoading(false);
        setError(false);
        
        // Auto retry if backend is still initializing/fetching prices
        if (stocksData.status === "FETCHING" || stocksData.status === "INITIALIZING") {
          setTimeout(loadDashboardData, 3000);
        }
      }).catch(err => {
        console.error("Dashboard fetch error:", err);
        if (!mounted) return;
        setError(true);
        setLoading(false);
        // Retry connection every 5 seconds if offline
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

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-in' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--text-highlight)', display: 'flex', alignItems: 'center', margin: 0 }}>
          <span className={error ? "blink" : ""} style={{ color: error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)', marginRight: '10px' }}>●</span> 
          COMMAND CENTER DASHBOARD
        </h2>
        <div style={{ fontSize: '12px', color: error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)', border: `1px solid ${error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)'}`, padding: '4px 10px', borderRadius: '4px' }}>
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
          <div style={{ 
            display: 'flex', justifyContent: 'space-between', padding: '10px 20px', 
            background: 'var(--bg-panel)', border: '1px solid var(--border-color)', 
            marginBottom: '20px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold'
          }}>
            <div style={{ display: 'flex', gap: '30px' }}>
              <span style={{ color: 'var(--text-muted)' }}>MARKET PULSE:</span>
              <span><span style={{color: 'var(--text-muted)'}}>TOTAL:</span> {marketPulse.total}</span>
              <span style={{ color: 'var(--color-up)' }}>▲ ADVANCING: {marketPulse.up}</span>
              <span style={{ color: 'var(--color-red)' }}>▼ DECLINING: {marketPulse.down}</span>
              <span style={{ color: 'var(--color-neutral)' }}>► FLAT: {marketPulse.flat}</span>
            </div>
            <div style={{ color: 'var(--color-warning)' }}>
              BIST LIVE 
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>
          
          {/* Favorites Watchlist */}
          <div className="panel" style={{ border: error ? '1px solid var(--color-red)' : '1px solid var(--color-warning)' }}>
            <div className="panel-header" style={{ color: 'var(--color-warning)' }}>
              FAVORITES WATCHLIST
            </div>
            <div className="panel-content" style={{ fontSize: '13px' }}>
              <p className="text-muted" style={{ marginBottom: '15px' }}>
                &gt; YOUR STARRED EQUITIES
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TICKER</th>
                    <th>PRICE (TRY)</th>
                    <th>CHANGE</th>
                  </tr>
                </thead>
                <tbody>
                  {favorites.map(stock => (
                    <tr key={stock.ticker} className="row-hoverable">
                      <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageWithFallback 
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${stock.ticker}.png`} 
                          alt={stock.ticker} 
                          fallbackName={stock.ticker}
                          size={20}
                          style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                        <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-warning">{stock.ticker}</Link>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {stock.price ? stock.price.toFixed(2) : 'N/A'}
                      </td>
                      <td className={stock.change_pct > 0 ? "text-up" : stock.change_pct < 0 ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                        {stock.change_pct > 0 ? '▲' : stock.change_pct < 0 ? '▼' : ''} {stock.change_pct !== null && stock.change_pct !== undefined ? Math.abs(stock.change_pct).toFixed(2) + '%' : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  {favorites.length === 0 && !error && (
                    <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>NO FAVORITES STARRED.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: '15px', textAlign: 'right' }}>
                <Link to="/hisseler" className="ticker-link text-neutral">[MANAGE FAVORITES]</Link>
              </div>
            </div>
          </div>

          {/* Top Recommendations Summary */}
          <div className="panel" style={{ border: error ? '1px solid var(--color-red)' : undefined }}>
            <div className="panel-header" style={{ color: 'var(--color-up)' }}>
              TOP CONSENSUS TARGETS
            </div>
            <div className="panel-content" style={{ fontSize: '13px' }}>
              <p className="text-muted" style={{ marginBottom: '15px' }}>
                &gt; MOST RECOMMENDED EQUITIES
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TICKER</th>
                    <th>UPSIDE</th>
                    <th>REPORTS</th>
                  </tr>
                </thead>
                <tbody>
                  {topStocks.map(stock => (
                    <tr key={stock.ticker} className="row-hoverable">
                      <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageWithFallback 
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${stock.ticker}.png`} 
                          alt={stock.ticker} 
                          fallbackName={stock.ticker}
                          size={20}
                          style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                        <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-up">{stock.ticker}</Link>
                      </td>
                      <td className={stock.upside_potential > 0 ? "text-up" : stock.upside_potential < 0 ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                        {stock.upside_potential > 0 ? '+' : ''}{stock.upside_potential.toFixed(2)}%
                      </td>
                      <td className="text-neutral">{stock.count}</td>
                    </tr>
                  ))}
                  {topStocks.length === 0 && !error && (
                    <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-warning)' }}>AWAITING DATA SYNC...</td></tr>
                  )}
                  {error && topStocks.length === 0 && (
                    <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-red)' }}>CONNECTION LOST.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: '15px', textAlign: 'right' }}>
                <Link to="/screener" className="ticker-link text-neutral">[OPEN SCREENER]</Link>
              </div>
            </div>
          </div>

          {/* Brokerage Directory */}
          <div className="panel" style={{ border: error ? '1px solid var(--color-red)' : undefined }}>
            <div className="panel-header" style={{ color: 'var(--color-warning)' }}>
              BROKERAGE LEADERBOARD
            </div>
            <div className="panel-content" style={{ fontSize: '13px' }}>
              <p className="text-muted" style={{ marginBottom: '15px' }}>
                &gt; BY RESEARCH VOLUME
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>BROKERAGE</th>
                    <th>REPORTS</th>
                    <th>AVG UPSIDE</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.slice(0, 5).map(k => (
                    <tr key={k.kurum} className="row-hoverable">
                      <td style={{ fontWeight: 'bold', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageWithFallback 
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${slugifyBroker(k.kurum)}.png`} 
                          alt={k.kurum} 
                          fallbackName={k.kurum}
                          size={20}
                          style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                        <Link to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} className="ticker-link text-highlight">
                          {k.kurum}
                        </Link>
                      </td>
                      <td>{k.count}</td>
                      <td className={k.avg_potential > 0 ? "text-up" : k.avg_potential < 0 ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                        {k.avg_potential > 0 ? '+' : ''}{k.avg_potential.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                  {stats.length === 0 && !error && (
                    <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-warning)' }}>AWAITING DATA SYNC...</td></tr>
                  )}
                  {error && stats.length === 0 && (
                    <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-red)' }}>CONNECTION LOST.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: '15px', textAlign: 'right' }}>
                <Link to="/brokerages" className="ticker-link text-neutral">[VIEW DIRECTORY]</Link>
              </div>
            </div>
          </div>

          {/* Recent Model Portfolios */}
          <div className="panel panel-wide" style={{ border: error ? '1px solid var(--color-red)' : undefined }}>
            <div className="panel-header" style={{ color: 'var(--color-red)' }}>
              LATEST RESEARCH INTELLIGENCE
            </div>
            <div className="panel-content" style={{ fontSize: '13px' }}>
              <p className="text-muted" style={{ marginBottom: '15px' }}>
                &gt; FRESH MODEL PORTFOLIOS
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recentModels.map(m => (
                  <Link key={m.id} to="/models" style={{ textDecoration: 'none' }}>
                    <div className="row-hoverable" style={{ padding: '10px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ImageWithFallback 
                        src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${slugifyBroker(m.kurum)}.png`} 
                        alt={m.kurum} 
                        fallbackName={m.kurum}
                        size={28}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ color: 'var(--color-red)', fontSize: '0.8rem', marginBottom: '4px' }}>
                          {m.tarih} | {m.kurum}
                        </div>
                        <div style={{ color: 'var(--text-highlight)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          {m.title}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {recentModels.length === 0 && !error && (
                  <div style={{ textAlign: 'center', color: 'var(--color-warning)' }}>AWAITING DATA SYNC...</div>
                )}
                {error && recentModels.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--color-red)' }}>CONNECTION LOST.</div>
                )}
              </div>
              <div style={{ marginTop: '15px', textAlign: 'right' }}>
                <Link to="/models" className="ticker-link text-neutral">[VIEW ALL REPORTS]</Link>
              </div>
            </div>
          </div>

          {/* Latest Recommendations */}
          <div className="panel panel-wide" style={{ border: error ? '1px solid var(--color-red)' : undefined }}>
            <div className="panel-header" style={{ color: 'var(--color-up)' }}>
              LIVE MARKET SIGNALS
            </div>
            <div className="panel-content" style={{ fontSize: '13px' }}>
              <p className="text-muted" style={{ marginBottom: '15px' }}>
                &gt; LATEST BROKER RECOMMENDATIONS
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {latestRecommendations.map((r, i) => (
                  <Link key={i} to={`/hisse/${r.ticker}`} style={{ textDecoration: 'none' }}>
                    <div className="row-hoverable" style={{ padding: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ImageWithFallback 
                        src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${r.ticker}.png`} 
                        alt={r.ticker} 
                        fallbackName={r.ticker}
                        size={28}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--color-warning)', fontSize: '0.75rem', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{r.kurum}</span>
                          <span style={{color: 'var(--text-muted)'}}>{r.tarih}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ 
                            color: r.oneri && r.oneri.toUpperCase().includes('SAT') ? 'var(--color-red)' : 
                                   (r.oneri && r.oneri.toUpperCase().includes('TUT') ? 'var(--color-warning)' : 'var(--text-highlight)'), 
                            fontWeight: 'bold' 
                          }}>
                            {r.ticker} {r.oneri ? `- ${r.oneri}` : '- Değerlendirme Raporu'}
                          </span>
                          {r.hedef_fiyat && (
                            <span style={{ color: 'var(--color-up)', fontWeight: 'bold' }}>Hedef: {r.hedef_fiyat}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {latestRecommendations.length === 0 && !error && (
                  <div style={{ textAlign: 'center', color: 'var(--color-warning)' }}>AWAITING DATA SYNC...</div>
                )}
              </div>
              <div style={{ marginTop: '15px', textAlign: 'right' }}>
                <Link to="/screener" className="ticker-link text-neutral">[VIEW SCREENER]</Link>
              </div>
            </div>
          </div>

        </div>
        </>
      )}
    </div>
  );
}