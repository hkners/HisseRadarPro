import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';
import FreshSignalsWidget from '../components/FreshSignalsWidget';
import ConvictionBuyCard from '../components/ConvictionBuyCard';
import CockpitDetailModal from '../components/CockpitDetailModal';
import { getCachedData, setCachedData } from '../utils/apiCache';

export default function Home() {
  const dashboardUrl = `${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/dashboard`;
  const cached = getCachedData(dashboardUrl);

  const [stats, setStats] = useState(cached?.kurum_stats || []);
  const [topStocks, setTopStocks] = useState(cached?.top_stocks || []);
  const [recentModels, setRecentModels] = useState(cached?.models || []);
  const [latestRecommendations, setLatestRecommendations] = useState(cached?.latest_recommendations || []);
  const [allStocks, setAllStocks] = useState(cached?.stocks?.stocks || []);
  const [conviction, setConviction] = useState(cached?.conviction || null);
  const [strategyTab, setStrategyTab] = useState('TOP_BUYS'); // 'TOP_BUYS', 'MOMENTUM', 'VALUE', 'MODELS'
  const [expandCards, setExpandCards] = useState(false);
  const { favorites: favoriteTickers } = useFavorites();
  const [marketPulse, setMarketPulse] = useState(cached?.market_pulse || { up: 0, down: 0, flat: 0, total: 0 });
  const [marketRegimeData, setMarketRegimeData] = useState(cached?.market_regime || null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(false);
  const [isLive, setIsLive] = useState(cached?.stocks?.status === "LIVE");
  const [detailModal, setDetailModal] = useState({ isOpen: false, data: null, type: 'STOCK' });

  useEffect(() => {
    let mounted = true;
    
    const loadDashboardData = () => {
      fetch(dashboardUrl)
        .then(res => res.json())
        .then(data => {
          if (!mounted) return;
          setCachedData(dashboardUrl, data);
          
          if (data.kurum_stats) setStats(data.kurum_stats);
          if (data.top_stocks) setTopStocks(data.top_stocks);
          if (data.models) setRecentModels(data.models);
          if (data.latest_recommendations) setLatestRecommendations(data.latest_recommendations);
          if (data.market_pulse) setMarketPulse(data.market_pulse);
          if (data.market_regime) setMarketRegimeData(data.market_regime);
          if (data.conviction) setConviction(data.conviction);
          
          if (data.stocks) {
            setAllStocks(data.stocks.stocks);
            setIsLive(data.stocks.status === "LIVE");
          }
          
          setLoading(false);
          setError(false);
          
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
    const intervalId = setInterval(loadDashboardData, 60000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [dashboardUrl]);

  const favoriteStocks = useMemo(() => {
    return allStocks.filter(s => favoriteTickers.includes(s.ticker));
  }, [allStocks, favoriteTickers]);

  const [viewMode, setViewMode] = useState('CARDS'); // 'CARDS' or 'TABLE'
  const [cardPage, setCardPage] = useState(0);
  const CARDS_PER_PAGE = 3;

  // Strategy bucket selection
  const activeStrategyStocks = useMemo(() => {
    if (!conviction) return [];
    if (strategyTab === 'TOP_BUYS') return conviction.top_buys || [];
    if (strategyTab === 'MOMENTUM') return conviction.strategies?.momentum || [];
    if (strategyTab === 'VALUE') return conviction.strategies?.value || [];
    if (strategyTab === 'MODELS') return conviction.strategies?.models || [];
    return conviction.top_buys || [];
  }, [conviction, strategyTab]);

  const totalCards = activeStrategyStocks.length;
  const totalPages = Math.max(1, Math.ceil(totalCards / CARDS_PER_PAGE));
  const currentCardSlice = activeStrategyStocks.slice(cardPage * CARDS_PER_PAGE, (cardPage + 1) * CARDS_PER_PAGE);

  const handleTabChange = (tab) => {
    setStrategyTab(tab);
    setCardPage(0);
  };

  const regime = conviction?.market_regime;
  const currentRegimeLabel = marketRegimeData?.regime || regime?.regime || (regime?.status === 'BULL' ? 'RISK_ON' : regime?.status === 'BEAR' ? 'RISK_OFF' : 'NEUTRAL') || 'NEUTRAL';
  const regimeMultiplier = marketRegimeData?.exposure_multiplier ?? (currentRegimeLabel === 'RISK_OFF' ? 0.5 : 1.0);

  return (
    <div className="dashboard-layout">
      {loading ? (
        <div style={{ color: 'var(--text-highlight)', textAlign: 'center', padding: '40px' }}>
          <div className="blink" style={{ fontSize: '20px', marginBottom: '8px' }}>●</div>
          PİYASA VERİLERİ VE ALIM KURULUMLARI YÜKLENİYOR...
        </div>
      ) : (
        <>
          {/* 1. COCKPIT TOP RIBBON (Title + Market Regime + Adv/Dec + Tactical AI in ~50px) */}
          <div 
            className="panel-neon terminal-header-ribbon" 
            style={{ 
              padding: '6px 12px', 
              marginBottom: '8px',
              border: `1px solid ${regime?.color || 'var(--color-neutral)'}`,
              background: 'linear-gradient(90deg, rgba(20,24,33,0.95) 0%, rgba(13,16,23,0.95) 100%)',
              borderRadius: '6px',
              minHeight: '36px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              {/* Left: Cockpit Title & Market Regime */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span className={error ? "blink" : ""} style={{ color: error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)', fontSize: '10px' }}>●</span>
                <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-highlight)', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
                  KARAR KOKPİTİ
                </span>
                <span style={{ 
                  padding: '1px 6px', 
                  borderRadius: '3px', 
                  fontSize: '9.5px', 
                  fontWeight: '900', 
                  background: regime?.status === 'BULL' ? 'rgba(0, 230, 118, 0.15)' : regime?.status === 'BEAR' ? 'rgba(255, 82, 82, 0.15)' : 'rgba(255, 171, 0, 0.15)',
                  color: regime?.status === 'BULL' ? 'var(--color-up)' : regime?.status === 'BEAR' ? 'var(--color-red)' : 'var(--color-neutral)',
                  border: `1px solid ${regime?.color || 'var(--color-neutral)'}`,
                  whiteSpace: 'nowrap'
                }}>
                  {regime?.status === 'BULL' ? 'BOĞA' : regime?.status === 'BEAR' ? 'AYI PİYASASI' : 'YATAY'}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: regime?.color || '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {regime?.badge ? regime.badge.replace(/^AYI PİYASASI\s*\(?|\)?$/gi, '') : 'Satış Baskısı Var'}
                </span>
              </div>

              {/* Right: Breadth Ratio + Live Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {/* 3-Kademeli Piyasa Rejimi Rozeti: RISK_ON / NEUTRAL / RISK_OFF */}
                <div 
                  title={`Piyasa Rejimi: ${currentRegimeLabel} | Risk Çarpanı: ${regimeMultiplier}x | ${currentRegimeLabel === 'RISK_OFF' ? 'Güçlü Al Eşiği: 83' : 'Güçlü Al Eşiği: 75'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    fontWeight: '900',
                    letterSpacing: '0.2px',
                    background: currentRegimeLabel === 'RISK_ON' 
                      ? 'rgba(0, 230, 118, 0.15)' 
                      : currentRegimeLabel === 'RISK_OFF' 
                        ? 'rgba(255, 51, 102, 0.18)' 
                        : 'rgba(255, 171, 0, 0.15)',
                    color: currentRegimeLabel === 'RISK_ON' 
                      ? 'var(--color-up)' 
                      : currentRegimeLabel === 'RISK_OFF' 
                        ? 'var(--color-red)' 
                        : 'var(--color-warning)',
                    border: `1px solid ${
                      currentRegimeLabel === 'RISK_ON' 
                        ? 'rgba(0, 230, 118, 0.4)' 
                        : currentRegimeLabel === 'RISK_OFF' 
                          ? 'rgba(255, 51, 102, 0.4)' 
                          : 'rgba(255, 171, 0, 0.4)'
                    }`,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ fontSize: '7px' }}>●</span>
                  <span>Piyasa Rejimi: {currentRegimeLabel}</span>
                  {currentRegimeLabel === 'RISK_OFF' && (
                    <span style={{ fontSize: '8px', opacity: 0.85 }}>({regimeMultiplier}x)</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', fontSize: '10px', fontWeight: 'bold' }}>
                  <span style={{ background: 'rgba(63, 185, 80, 0.12)', color: 'var(--color-up)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(63, 185, 80, 0.25)' }}>
                    ▲ Yükselen: {marketPulse.up} ({((marketPulse.up / Math.max(1, marketPulse.total)) * 100).toFixed(0)}%)
                  </span>
                  <span style={{ background: 'rgba(88, 166, 255, 0.12)', color: 'var(--color-neutral)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(88, 166, 255, 0.25)' }}>
                    ► Yatay: {marketPulse.flat}
                  </span>
                  <span style={{ background: 'rgba(248, 81, 73, 0.12)', color: 'var(--color-red)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(248, 81, 73, 0.25)' }}>
                    ▼ Düşen: {marketPulse.down} ({((marketPulse.down / Math.max(1, marketPulse.total)) * 100).toFixed(0)}%)
                  </span>
                </div>
                <div style={{ fontSize: '9px', color: error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)', border: `1px solid ${error ? 'var(--color-red)' : isLive ? 'var(--color-up)' : 'var(--color-warning)'}`, padding: '1px 5px', borderRadius: '3px', fontWeight: '600' }}>
                  {error ? 'OFFLINE' : isLive ? 'CANLI' : 'DERLENİYOR'}
                </div>
              </div>
            </div>

            {/* Tactical Advice & AI Summary in single condensed row with click-to-expand */}
            {(regime?.advice || conviction?.ai_market_pulse) && (
              <div style={{ 
                marginTop: '4px', 
                paddingTop: '4px', 
                borderTop: '1px solid rgba(255,255,255,0.06)', 
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {regime?.advice && (
                  <div 
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }}
                    title={regime?.advice}
                  >
                    <strong style={{ color: 'var(--color-warning)' }}>🎯 Taktik: </strong>
                    <span style={{ color: 'var(--text-primary)' }}>{regime?.advice}</span>
                  </div>
                )}
                {conviction?.ai_market_pulse && (
                  <div 
                    onClick={() => setDetailModal({
                      isOpen: true,
                      data: {
                        regime,
                        marketPulse,
                        ai_market_pulse: conviction.ai_market_pulse
                      },
                      type: 'AI_PULSE'
                    })}
                    style={{ 
                      color: '#00e5ff', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap', 
                      flex: '1 1 auto', 
                      minWidth: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="BIST 100 Yapay Zeka Derin Piyasa Analizini Aç (Tıkla)"
                  >
                    <span style={{ 
                      background: 'rgba(0, 229, 255, 0.15)', 
                      color: '#00e5ff', 
                      border: '1px solid rgba(0, 229, 255, 0.35)', 
                      padding: '1px 5px', 
                      borderRadius: '3px', 
                      fontWeight: 'bold', 
                      fontSize: '9px', 
                      flexShrink: 0 
                    }}>
                      AI RAPOR ↗
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conviction.ai_market_pulse}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. STRATEJİ SEÇİCİ & YÜKSEK İNANÇLI ALIM KARTLARI / TABLOSU */}
          <div style={{ marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
              {/* Sol: Strateji Butonları */}
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap', flex: 1, scrollbarWidth: 'none' }}>
                <button 
                  onClick={() => handleTabChange('TOP_BUYS')}
                  style={{
                    background: strategyTab === 'TOP_BUYS' ? 'var(--color-up)' : 'rgba(255,255,255,0.05)',
                    color: strategyTab === 'TOP_BUYS' ? '#000' : 'var(--text-primary)',
                    border: `1px solid ${strategyTab === 'TOP_BUYS' ? 'var(--color-up)' : 'rgba(255,255,255,0.1)'}`,
                    padding: '3px 9px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  YÜKSEK İNANÇ ({conviction?.top_buys?.length || 0})
                </button>

                <button 
                  onClick={() => handleTabChange('MOMENTUM')}
                  style={{
                    background: strategyTab === 'MOMENTUM' ? '#00e5ff' : 'rgba(255,255,255,0.05)',
                    color: strategyTab === 'MOMENTUM' ? '#000' : 'var(--text-primary)',
                    border: `1px solid ${strategyTab === 'MOMENTUM' ? '#00e5ff' : 'rgba(255,255,255,0.1)'}`,
                    padding: '3px 9px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  MOMENTUM ({conviction?.strategies?.momentum?.length || 0})
                </button>

                <button 
                  onClick={() => handleTabChange('VALUE')}
                  style={{
                    background: strategyTab === 'VALUE' ? '#ffab00' : 'rgba(255,255,255,0.05)',
                    color: strategyTab === 'VALUE' ? '#000' : 'var(--text-primary)',
                    border: `1px solid ${strategyTab === 'VALUE' ? '#ffab00' : 'rgba(255,255,255,0.1)'}`,
                    padding: '3px 9px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  KELEPİR DEĞER ({conviction?.strategies?.value?.length || 0})
                </button>

                <button 
                  onClick={() => handleTabChange('MODELS')}
                  style={{
                    background: strategyTab === 'MODELS' ? '#b388ff' : 'rgba(255,255,255,0.05)',
                    color: strategyTab === 'MODELS' ? '#000' : 'var(--text-primary)',
                    border: `1px solid ${strategyTab === 'MODELS' ? '#b388ff' : 'rgba(255,255,255,0.1)'}`,
                    padding: '3px 9px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  MODEL PORTFÖY ({conviction?.strategies?.models?.length || 0})
                </button>
              </div>

              {/* Sağ: Kartlar / Tablo Seçici + Sayfalama + Filtrele */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {/* View Mode Toggle: Kartlar vs Tablo */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', padding: '1px' }}>
                  <button
                    onClick={() => setViewMode('CARDS')}
                    style={{
                      background: viewMode === 'CARDS' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                      color: viewMode === 'CARDS' ? '#00e5ff' : 'var(--text-muted)',
                      border: 'none',
                      padding: '2px 7px',
                      borderRadius: '3px',
                      fontSize: '9.5px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    title="Kart Görünümü"
                  >
                    🗂️ Kartlar
                  </button>
                  <button
                    onClick={() => setViewMode('TABLE')}
                    style={{
                      background: viewMode === 'TABLE' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                      color: viewMode === 'TABLE' ? '#00e5ff' : 'var(--text-muted)',
                      border: 'none',
                      padding: '2px 7px',
                      borderRadius: '3px',
                      fontSize: '9.5px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    title="Kompakt Liste Tablosu"
                  >
                    📊 Tablo ({totalCards})
                  </button>
                </div>

                {/* Pager if in Cards mode and has more than 3 cards */}
                {viewMode === 'CARDS' && totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                    <button
                      onClick={() => setCardPage(p => Math.max(0, p - 1))}
                      disabled={cardPage === 0}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: cardPage === 0 ? 'var(--text-muted)' : '#fff',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        cursor: cardPage === 0 ? 'default' : 'pointer',
                        fontSize: '9.5px'
                      }}
                    >
                      ❮
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>
                      {cardPage + 1}/{totalPages}
                    </span>
                    <button
                      onClick={() => setCardPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={cardPage >= totalPages - 1}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: cardPage >= totalPages - 1 ? 'var(--text-muted)' : '#fff',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        cursor: cardPage >= totalPages - 1 ? 'default' : 'pointer',
                        fontSize: '9.5px'
                      }}
                    >
                      ❯
                    </button>
                  </div>
                )}

                <Link to="/screener" className="ticker-link text-neutral" style={{ fontSize: '10.5px', whiteSpace: 'nowrap' }}>
                  Filtrele →
                </Link>
              </div>
            </div>

            {/* Render: Either 3-Card Grid or Full Table View */}
            {viewMode === 'CARDS' ? (
              <div className="conviction-grid">
                {currentCardSlice.map(stock => (
                  <ConvictionBuyCard 
                    key={stock.ticker} 
                    stock={stock} 
                    onOpenDetail={(stk) => setDetailModal({ isOpen: true, data: stk, type: 'STOCK' })}
                  />
                ))}

                {activeStrategyStocks.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '16px', color: 'var(--text-muted)', border: '1px dashed #333', borderRadius: '4px', fontSize: '11px' }}>
                    Bu strateji için şu anda aktif kriterleri karşılayan hisse bulunmuyor.
                  </div>
                )}
              </div>
            ) : (
              /* High-Density Compact Table View for All Stocks in Active Strategy */
              <div className="panel" style={{ maxHeight: '210px', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--border-color)', margin: 0 }}>
                <div className="panel-content panel-scrollable" style={{ padding: '2px 4px' }}>
                  <table className="data-table compact" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>HİSSE</th>
                        <th>ŞİRKET</th>
                        <th style={{ textAlign: 'center' }}>SKOR / KARAR</th>
                        <th>GÜNCEL</th>
                        <th>FARK</th>
                        <th>HEDEF</th>
                        <th>POTANSİYEL</th>
                        <th>STOP LOSS</th>
                        <th>R:R</th>
                        <th>ALIM BÖLGESİ</th>
                        <th>KURUM</th>
                        <th>ÖNE ÇIKAN GEREKÇE</th>
                        <th style={{ textAlign: 'center' }}>İŞLEM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStrategyStocks.map((stock) => (
                        <tr key={stock.ticker} className="row-hoverable">
                          <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <FavoriteStar ticker={stock.ticker} style={{ fontSize: '12px' }} />
                            <ImageWithFallback
                              src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${stock.ticker}.png`}
                              alt={stock.ticker}
                              fallbackName={stock.ticker}
                              size={16}
                              style={{ width: '16px', height: '16px', borderRadius: '3px', background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                            />
                            <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-highlight" style={{ fontSize: '11px' }}>
                              {stock.ticker}
                            </Link>
                            {stock.model_count > 0 && (
                              <span style={{ fontSize: '9px', background: 'rgba(210, 153, 34, 0.15)', color: 'var(--color-warning)', padding: '0 3px', borderRadius: '2px', fontWeight: 'bold' }}>
                                M{stock.model_count}
                              </span>
                            )}
                          </td>
                          <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', color: 'var(--text-muted)' }} title={stock.company_name}>
                            {stock.company_name}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ 
                              background: stock.color || 'var(--color-up)', 
                              color: '#000', 
                              fontSize: '9px', 
                              fontWeight: 'bold', 
                              padding: '1px 5px', 
                              borderRadius: '3px',
                              marginRight: '4px'
                            }}>
                              {stock.decision}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>
                              {stock.score}p
                            </span>
                          </td>
                          <td style={{ fontWeight: 'bold', fontSize: '11px' }}>
                            {stock.price ? stock.price.toFixed(2) : '-'} TL
                          </td>
                          <td className={stock.change_pct >= 0 ? "text-up" : "text-down"} style={{ fontWeight: 'bold', fontSize: '10.5px' }}>
                            {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct ? stock.change_pct.toFixed(1) : '0.0'}%
                          </td>
                          <td style={{ fontWeight: 'bold', color: 'var(--color-up)', fontSize: '11px' }}>
                            {stock.consensus_target ? stock.consensus_target.toFixed(1) : '-'} TL
                          </td>
                          <td className="text-up" style={{ fontWeight: 'bold', fontSize: '11px' }}>
                            +%{stock.upside_pct ? stock.upside_pct.toFixed(1) : '0.0'}
                          </td>
                          <td className="text-red" style={{ fontWeight: 'bold', fontSize: '10.5px' }}>
                            {stock.stop_loss ? stock.stop_loss.toFixed(1) : '-'} (-%{stock.stop_loss_pct ? stock.stop_loss_pct.toFixed(1) : '0.0'})
                          </td>
                          <td style={{ fontWeight: 'bold', fontSize: '10.5px', color: (stock.risk_reward > 10.0 || stock.is_excessive_rr) ? '#ffab00' : 'var(--color-cyan)' }} title={(stock.risk_reward > 10.0 || stock.is_excessive_rr) ? "Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir" : ""}>
                            {(stock.risk_reward > 10.0 || stock.is_excessive_rr) ? '⚠️ 1:' : '1:'}{stock.risk_reward}
                          </td>
                          <td style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {stock.entry_zone?.low}-{stock.entry_zone?.high}
                          </td>
                          <td style={{ fontWeight: 'bold', fontSize: '10.5px', color: 'var(--text-neutral)' }}>
                            {stock.broker_count}
                          </td>
                          <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', color: 'var(--text-main)' }} title={stock.drivers?.[0]}>
                            {stock.drivers?.[0] || '-'}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => setDetailModal({ isOpen: true, data: stock, type: 'STOCK' })}
                              style={{
                                background: 'rgba(57, 197, 207, 0.15)',
                                border: '1px solid rgba(57, 197, 207, 0.3)',
                                color: 'var(--color-cyan)',
                                fontSize: '9.5px',
                                fontWeight: 'bold',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                marginRight: '6px'
                              }}
                              title="Tüm detayları ve risk stratejisini gör"
                            >
                              Detay
                            </button>
                            <Link to={`/hisse/${stock.ticker}`} style={{ color: 'var(--color-cyan)', fontSize: '10px', fontWeight: 'bold', textDecoration: 'none' }}>
                              İncele &gt;
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 3. İKİNCİL PANELLER (4 Kolonlu Kompakt Grid: Konsensüs, Taze Sinyaller, Favoriler, Aracı Kurumlar) */}
          <div className="dashboard-4col-grid">
            {/* Panel 1: Top Consensus Targets */}
            <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-up'}`} style={{ height: '100%', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ color: 'var(--color-up)', display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px' }}>
                <span>🎯 KONSENSÜS HEDEFLERİ</span>
                <Link to="/screener" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[TÜMÜ]</Link>
              </div>
              <div className="panel-content panel-scrollable" style={{ padding: '6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '9.5px', fontWeight: 'bold', paddingBottom: '3px', borderBottom: '1px solid #1a1a1a', textTransform: 'uppercase' }}>
                    <div style={{ width: '75px', textAlign: 'left' }}>HİSSE</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>POTANSİYEL</div>
                    <div style={{ width: '35px', textAlign: 'right' }}>RAPOR</div>
                  </div>
                  {topStocks.slice(0, 10).map(stock => (
                    <div key={stock.ticker} className="row-hoverable" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #14171c' }}>
                      <div style={{ width: '75px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ImageWithFallback 
                          src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${stock.ticker}.png`} 
                          alt={stock.ticker} 
                          fallbackName={stock.ticker}
                          size={15}
                          style={{ width: '15px', height: '15px', borderRadius: '50%', background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                        />
                        <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-up" style={{ fontSize: '11px' }}>{stock.ticker}</Link>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        {(stock.is_excessive_rr || (typeof stock.upside_potential === 'number' && stock.upside_potential > 150)) && (
                          <span title="Aşırı yüksek potansiyel (eski rapor veya düşen bıçak olabilir)" style={{ fontSize: '10px', cursor: 'help' }}>⚠️</span>
                        )}
                        <span className={(typeof stock.upside_potential === 'number' && stock.upside_potential > 0) ? ((stock.is_excessive_rr || stock.upside_potential > 150) ? "" : "text-up") : "text-neutral"} style={{ fontWeight: 'bold', fontSize: '11px', color: (stock.is_excessive_rr || (typeof stock.upside_potential === 'number' && stock.upside_potential > 150)) ? '#ffab00' : '' }}>
                          {(typeof stock.upside_potential === 'number' && stock.upside_potential > 0) ? '+' : ''}{typeof stock.upside_potential === 'number' ? stock.upside_potential.toFixed(1) + '%' : 'N/A'}
                        </span>
                      </div>
                      <div style={{ width: '35px', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-neutral)', fontSize: '11px' }}>
                        {stock.count}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel 2: Fresh Signals Widget */}
            <FreshSignalsWidget />

            {/* Panel 3: Favorites Watchlist */}
            <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-warning'}`} style={{ height: '100%', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ color: 'var(--color-warning)', display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px' }}>
                <span>⭐ FAVORİ TAKİP LİSTESİ</span>
                <Link to="/stocks" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[YÖNET]</Link>
              </div>
              <div className="panel-content panel-scrollable" style={{ padding: '6px' }}>
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>HİSSE</th>
                      <th>FİYAT</th>
                      <th>FARK</th>
                      <th style={{ textAlign: 'center' }}>HEDEF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {favoriteStocks.map(stock => (
                      <tr key={stock.ticker} className="row-hoverable">
                        <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FavoriteStar ticker={stock.ticker} style={{ fontSize: '12px' }} />
                          <Link to={`/hisse/${stock.ticker}`} className="ticker-link text-warning" style={{ fontSize: '11px' }}>{stock.ticker}</Link>
                        </td>
                        <td style={{ fontWeight: 'bold', fontSize: '11px' }}>
                          {stock.price ? stock.price.toFixed(2) : '-'}
                        </td>
                        <td className={stock.change_pct > 0 ? "text-up" : stock.change_pct < 0 ? "text-down" : "text-neutral"} style={{ fontWeight: 'bold', fontSize: '10.5px' }}>
                          {stock.change_pct > 0 ? '▲' : stock.change_pct < 0 ? '▼' : ''} {stock.change_pct !== null && stock.change_pct !== undefined ? Math.abs(stock.change_pct).toFixed(1) + '%' : '-'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '11px' }}>
                          <span className={(typeof stock.avg_potential === 'number' && stock.avg_potential > 0) ? "text-up" : "text-neutral"} style={{ fontWeight: 'bold' }}>
                            {(typeof stock.avg_potential === 'number' && stock.avg_potential > 0) ? '+' : ''}{typeof stock.avg_potential === 'number' && stock.avg_potential !== 0 ? stock.avg_potential.toFixed(1) + '%' : '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {favoriteStocks.length === 0 && (
                      <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '15px' }}>Yıldızla favori hisse ekleyin.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel 4: Brokerage Leaders */}
            <div className={`panel-neon panel-flex ${error ? 'neon-down' : 'neon-warning'}`} style={{ height: '100%', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ color: 'var(--color-warning)', display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px' }}>
                <span>🏛️ ARACI KURUM LİDERLERİ</span>
                <Link to="/brokerages" className="ticker-link text-neutral" style={{ fontSize: '9px' }}>[TÜMÜ]</Link>
              </div>
              <div className="panel-content panel-scrollable" style={{ padding: '6px' }}>
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>KURUM</th>
                      <th style={{ textAlign: 'center', width: '45px' }}>RAPOR</th>
                      <th style={{ textAlign: 'right', width: '70px' }}>ORT. HEDEF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.slice(0, 10).map(k => (
                      <tr key={k.kurum} className="row-hoverable">
                        <td style={{ fontWeight: 'bold', maxWidth: '175px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '5px' }} title={k.kurum}>
                          <ImageWithFallback 
                            src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/brokers/${slugifyBroker(k.kurum)}.png`} 
                            alt={k.kurum} 
                            fallbackName={k.kurum}
                            size={15}
                            style={{ width: '15px', height: '15px', borderRadius: '50%', background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                          />
                          <Link to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} className="ticker-link text-highlight" title={k.kurum} style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {k.kurum}
                          </Link>
                        </td>
                        <td className="text-neutral" style={{ fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>{k.count}</td>
                        <td className={(typeof k.avg_potential === 'number' && k.avg_potential > 0) ? "text-up" : "text-neutral"} style={{ fontWeight: 'bold', fontSize: '11px', textAlign: 'right' }}>
                          {typeof k.avg_potential === 'number' && k.avg_potential !== 0 ? (
                            <>{(k.avg_potential > 0) ? '+' : ''}{k.avg_potential.toFixed(1)}%</>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Cockpit Detail Modal for Stock Inspection & AI Deep Analysis */}
          <CockpitDetailModal
            isOpen={detailModal.isOpen}
            onClose={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
            data={detailModal.data}
            type={detailModal.type}
          />
        </>
      )}
    </div>
  );
}