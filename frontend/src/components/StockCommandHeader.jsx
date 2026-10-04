import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import FavoriteStar from './common/FavoriteStar';
import { getCachedData } from '../utils/apiCache';
import { AlertTriangle } from 'lucide-react';

const BIST30 = new Set(['AKBNK', 'ALARK', 'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'CCOMP', 'CWENE', 'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL', 'KONTR', 'KRDMD', 'MIATK', 'ODAS', 'PGSUS', 'PETKM', 'SAHOL', 'SASA', 'SISE', 'TCELL', 'THYAO', 'TOASO', 'TRALT', 'TRMET', 'TUPRS', 'YKBNK']);

export default function StockCommandHeader({ 
  ticker, 
  stock, 
  fundamentals, 
  setup, 
  onOpenPortfolioModal,
  layoutMode = 'terminal',
  onToggleLayoutMode,
  onOpenBreakdown
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [allStocks, setAllStocks] = useState([]);
  const [showThesis, setShowThesis] = useState(false);
  const [aiThesis, setAiThesis] = useState(null);
  const searchContainerRef = useRef(null);

  // Load stocks list from cache or API for quick switcher
  useEffect(() => {
    const cached = getCachedData(`${import.meta.env.VITE_API_URL}/stocks`);
    if (cached && cached.stocks) {
      setAllStocks(cached.stocks);
    } else {
      fetch(`${import.meta.env.VITE_API_URL}/stocks`)
        .then(res => res.json())
        .then(data => {
          if (data && data.stocks) setAllStocks(data.stocks);
        })
        .catch(() => {});
    }
  }, []);

  // Fetch AI thesis if not fetched yet
  useEffect(() => {
    if (!ticker) return;
    fetch(`${import.meta.env.VITE_API_URL}/conviction/ai-thesis/${ticker}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setAiThesis(data);
      })
      .catch(() => {});
  }, [ticker]);

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter stocks for quick search
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim() || allStocks.length === 0) return [];
    const q = searchQuery.toUpperCase();
    return allStocks
      .filter(s => s.ticker.includes(q) || (s.name && s.name.toUpperCase().includes(q)))
      .slice(0, 6);
  }, [searchQuery, allStocks]);

  // Prev / Next Navigation
  const handleNavigateStep = (direction) => {
    if (allStocks.length === 0) return;
    const currentIndex = allStocks.findIndex(s => s.ticker === ticker);
    if (currentIndex === -1) return;
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= allStocks.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = allStocks.length - 1;
    navigate(`/hisse/${allStocks[nextIndex].ticker}`);
  };

  const matchedStock = allStocks.find(s => s.ticker === ticker);
  const currentPriceVal = stock?.price ?? matchedStock?.price;
  const changePct = stock?.change_pct ?? matchedStock?.change_pct;
  const companyName = stock?.name || matchedStock?.name || fundamentals?.shortName || fundamentals?.sector || 'Borsa İstanbul';
  const isBist30 = BIST30.has(ticker);
  const isPositive = changePct !== undefined && changePct !== null && changePct > 0;
  const isNegative = changePct !== undefined && changePct !== null && changePct < 0;

  const decisionColor = setup?.color || 'var(--color-warning)';
  const decisionText = setup?.decision || 'BEKLE';
  const score = setup?.score || 50;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px', flexShrink: 0 }}>
      {/* ─── SINGLE FUSED MASTER COMMAND RIBBON (40px) ─── */}
      <div 
        className="panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 12px',
          borderRadius: '6px',
          background: 'linear-gradient(90deg, rgba(18, 18, 20, 0.98) 0%, rgba(18, 18, 20, 0.98) 100%)',
          border: '1px solid var(--border-color)',
          fontSize: '11px',
          whiteSpace: 'nowrap',
          overflowX: 'auto'
        }}
      >
        {/* Left: Identity, Logo, Ticker & Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Link 
            to="/stocks" 
            className="action-button" 
            style={{ padding: '3px 7px', fontSize: '10px', textDecoration: 'none', color: 'var(--text-muted)' }}
            title="Hisseler listesine dön"
          >
            ← LİSTE
          </Link>

          <ImageWithFallback 
            src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${ticker}.png`} 
            alt={ticker} 
            fallbackName={ticker}
            size={26}
            style={{ width: '26px', height: '26px', borderRadius: '4px', background: '#fff', objectFit: 'contain', padding: '1px' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <FavoriteStar ticker={ticker} />
            <span style={{ fontSize: '15px', fontWeight: '900', color: 'var(--text-primary)' }} title={companyName}>
              {ticker}
            </span>
            {isBist30 && (
              <span style={{ fontSize: '8px', fontWeight: 'bold', background: 'rgba(200, 162, 74, 0.15)', color: 'var(--color-cyan)', border: '1px solid rgba(200, 162, 74, 0.3)', padding: '1px 3px', borderRadius: '2px' }}>
                B30
              </span>
            )}
          </div>

          {/* Live Price & Delta Pill */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', background: 'rgba(0,0,0,0.35)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '15px', fontWeight: '900', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {currentPriceVal ? currentPriceVal.toFixed(2) : '-'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>TL</span>
            {changePct !== undefined && changePct !== null && (
              <span style={{
                fontSize: '11px',
                fontWeight: 'bold',
                fontVariantNumeric: 'tabular-nums',
                color: isPositive ? 'var(--color-up)' : isNegative ? 'var(--color-down)' : 'var(--text-muted)',
                marginLeft: '4px'
              }}>
                {isPositive ? '▲ +' : isNegative ? '▼ ' : ''}{Math.abs(changePct).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Center: Conviction Setup Ribbon */}
        {setup && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Decision Pill */}
            <span style={{
              background: decisionColor,
              color: ['var(--negative)', 'var(--negative)', 'var(--negative)', 'var(--negative)'].includes(decisionColor) ? 'var(--text-primary)' : '#000000',
              fontSize: '9px',
              fontWeight: '900',
              padding: '2px 6px',
              borderRadius: '3px',
              letterSpacing: '0.4px'
            }}>
              {decisionText} {Math.round(score)}
            </span>

            {/* Engine Disagreement Alert Badge */}
            {setup?.is_disagreeing && (
              <span 
                title={setup.disagreement_reason || `Karar Skoru: ${Math.round(score)}p (${decisionText}) vs Alpha Motoru: ${setup.alpha_score}p (${setup.alpha_signal}) zıt görüşte`}
                style={{
                  background: 'rgba(201, 136, 58, 0.15)',
                  border: '1px solid rgba(201, 136, 58, 0.4)',
                  color: 'var(--warning)',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'help',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <AlertTriangle size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />İki motor farklı görüşte
              </span>
            )}

            {/* Entry Range */}
            {setup.entry_zone?.low && (
              <div style={{ display: 'flex', gap: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Alım:</span>
                <span style={{ color: 'var(--gold)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                  {setup.entry_zone.low}-{setup.entry_zone.high}
                </span>
              </div>
            )}

            {/* Consensus Target */}
            {setup.consensus_target && (
              <div style={{ display: 'flex', gap: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Hedef:</span>
                <span style={{ color: 'var(--color-up)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                  {setup.consensus_target.toFixed(2)}
                  {setup.upside_pct ? ` (+${setup.upside_pct.toFixed(0)}%)` : ''}
                </span>
              </div>
            )}

            {/* Stop-Loss */}
            {setup.stop_loss && (
              <div style={{ display: 'flex', gap: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Stop:</span>
                <span style={{ color: 'var(--color-red)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                  {setup.stop_loss}
                </span>
              </div>
            )}

            {/* R:R */}
            {setup.risk_reward && (
              <div style={{ display: 'flex', gap: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>R:R:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                  1:{setup.risk_reward.toFixed(1)}
                </span>
              </div>
            )}

            {/* AI Thesis Toggle Button */}
            <button
              id="ai-thesis-btn"
              data-testid="ai-thesis-btn"
              onClick={() => setShowThesis(!showThesis)}
              style={{
                background: showThesis ? 'rgba(200, 162, 74, 0.15)' : 'transparent',
                border: '1px solid rgba(200, 162, 74, 0.3)',
                color: 'var(--color-cyan)',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {showThesis ? '▲ AI Kapat' : '▼ AI Oku'}
            </button>

            {/* Score Breakdown Toggle Button */}
            {onOpenBreakdown && (
              <button
                id="score-breakdown-btn"
                data-testid="score-breakdown-btn"
                onClick={onOpenBreakdown}
                title="Karar Skoru 5 alt bileşenini incele"
                style={{
                  background: 'rgba(200, 162, 74, 0.12)',
                  border: '1px solid rgba(200, 162, 74, 0.35)',
                  color: 'var(--color-cyan)',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                Skor Detayı
              </button>
            )}
          </div>
        )}

        {/* Right: Switcher, Portfolio Add & Terminal Layout Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Prev / Next Buttons */}
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              onClick={() => handleNavigateStep('prev')}
              className="action-button"
              style={{ padding: '3px 6px', fontSize: '10px' }}
              title="Önceki hisse"
            >
              ◀
            </button>
            <button
              onClick={() => handleNavigateStep('next')}
              className="action-button"
              style={{ padding: '3px 6px', fontSize: '10px' }}
              title="Sonraki hisse"
            >
              ▶
            </button>
          </div>

          {/* Quick Search Box */}
          <div ref={searchContainerRef} style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Hisse Ara..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              className="search-box"
              style={{ width: '90px', padding: '3px 6px', fontSize: '10px' }}
            />
            {showSearchDropdown && searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                width: '180px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.8)',
                zIndex: 100,
                overflow: 'hidden'
              }}>
                {searchResults.map(s => (
                  <div
                    key={s.ticker}
                    onClick={() => {
                      navigate(`/hisse/${s.ticker}`);
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    }}
                    style={{
                      padding: '6px 9px',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(200, 162, 74, 0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{s.ticker}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{s.price ? `${s.price.toFixed(2)} TL` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add to Portfolio Button */}
          <button
            id="portfolio-add-btn"
            data-testid="portfolio-add-btn"
            onClick={onOpenPortfolioModal}
            className="action-button"
            style={{
              background: 'rgba(200, 162, 74, 0.15)',
              color: 'var(--color-cyan)',
              border: '1px solid rgba(200, 162, 74, 0.4)',
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap'
            }}
            title="Bu hisseyi portföyünüze ekleyin"
          >
            + PORTFÖY
          </button>

          {/* Layout Mode Switcher */}
          {onToggleLayoutMode && (
            <button
              id="layout-toggle-btn"
              data-testid="layout-toggle-btn"
              onClick={onToggleLayoutMode}
              className="action-button"
              style={{
                background: layoutMode === 'terminal' ? 'rgba(63, 138, 107, 0.15)' : 'rgba(255,255,255,0.05)',
                color: layoutMode === 'terminal' ? 'var(--color-up)' : 'var(--text-muted)',
                border: `1px solid ${layoutMode === 'terminal' ? 'rgba(63, 138, 107, 0.4)' : 'var(--border-color)'}`,
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
              title={layoutMode === 'terminal' ? '3 Sütunlu Kaydırmasız Terminal Modu Etkin (Değiştirmek için tıkla)' : 'Klasik 2 Sütun Modu Etkin (Terminal için tıkla)'}
            >
              {layoutMode === 'terminal' ? '3\'LÜ TERMİNAL' : 'KLASİK DÜZEN'}
            </button>
          )}
        </div>
      </div>

      {/* ─── EXPANDABLE AI THESIS ACCORDION (If toggled) ─── */}
      {showThesis && (
        <div 
          style={{
            background: 'rgba(18, 18, 20, 0.98)',
            border: '1px solid rgba(200, 162, 74, 0.25)',
            borderRadius: '6px',
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            fontSize: '11px',
            lineHeight: 1.4
          }}
        >
          {/* Bull Drivers */}
          <div style={{ borderLeft: '2px solid var(--color-up)', paddingLeft: '8px' }}>
            <div style={{ fontWeight: 'bold', color: 'var(--color-up)', marginBottom: '4px', fontSize: '11px' }}>
              BOĞA TEZİ & KATALİZÖRLER
            </div>
            {((aiThesis?.bull_cases || aiThesis?.bull_drivers) && (aiThesis.bull_cases?.length > 0 || aiThesis.bull_drivers?.length > 0)) ? (
              <ul style={{ margin: 0, paddingLeft: '14px', color: 'var(--text-main)' }}>
                {(aiThesis.bull_cases || aiThesis.bull_drivers).map((d, i) => (
                  <li key={i} style={{ marginBottom: '2px' }}>{d}</li>
                ))}
              </ul>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>{setup ? `${setup.decision} görüşü korunuyor (Skor: ${setup.score}/100)` : 'Analiz yükleniyor...'}</div>
            )}
          </div>

          {/* Bear Risks */}
          <div style={{ borderLeft: '2px solid var(--color-down)', paddingLeft: '8px' }}>
            <div style={{ fontWeight: 'bold', color: 'var(--color-down)', marginBottom: '4px', fontSize: '11px' }}>
              AYI RİSKLERİ & STOP GEREKÇESİ
            </div>
            {((aiThesis?.bear_cases || aiThesis?.bear_risks) && (aiThesis.bear_cases?.length > 0 || aiThesis.bear_risks?.length > 0)) ? (
              <ul style={{ margin: 0, paddingLeft: '14px', color: 'var(--text-main)' }}>
                {(aiThesis.bear_cases || aiThesis.bear_risks).map((r, i) => (
                  <li key={i} style={{ marginBottom: '2px' }}>{r}</li>
                ))}
              </ul>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>{setup?.risk_statement || 'Destek altı kapanış stop tetikler.'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
