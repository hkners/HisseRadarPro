import React, { useEffect, useState, useMemo } from 'react';
import { slugifyBroker } from '../utils/slugify';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';
import { getCachedData, setCachedData } from '../utils/apiCache';
import PageContainer from '../components/common/PageContainer';
import ScoreBreakdownWidget from '../components/ScoreBreakdownWidget';
import { tintStyle } from '../utils/format';
import { AlertTriangle } from 'lucide-react';

const BIST30 = ['AKBNK', 'ALARK', 'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'CCOMP', 'CWENE', 'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL', 'KONTR', 'KRDMD', 'MIATK', 'ODAS', 'PGSUS', 'PETKM', 'SAHOL', 'SASA', 'SISE', 'TCELL', 'THYAO', 'TOASO', 'TRALT', 'TRMET', 'TUPRS', 'YKBNK'];
const BIST100 = [
  'AGHOL', 'AKBNK', 'AKCNS', 'AKFGY', 'AKFYE', 'AKSA', 'AKSEN', 'ALARK', 'ALBRK', 'ALFAS',
  'ARCLK', 'ARDYZ', 'ASELS', 'ASTOR', 'ASUZU', 'BERA', 'BIENY', 'BIMAS', 'BIOEN', 'BOBET',
  'BRSAN', 'BRYAT', 'BUCIM', 'CANTE', 'CCOLA', 'CIMSA', 'CWENE', 'DOAS', 'DOHOL', 'ECILC',
  'ECZYT', 'EGEEN', 'EKGYO', 'ENJSA', 'ENKAI', 'EREGL', 'EUPWR', 'EUREN', 'FROTO', 'GARAN',
  'GENIL', 'GESAN', 'GLYHO', 'GUBRF', 'GWIND', 'HALKB', 'HEKTS', 'HKTM', 'ISCTR', 'ISGYO',
  'ISMEN', 'IZENR', 'KCAER', 'KCHOL', 'KLSER', 'KMPUR', 'KONTR', 'KONYA',
  'KRDMD', 'KZBGY', 'MAVI', 'MGROS', 'MIATK', 'ODAS', 'OTKAR', 'OYAKC', 'PENTA', 'PETKM',
  'PGSUS', 'PNLSN', 'QUAGR', 'SAHOL', 'SASA', 'SAYAS', 'SISE', 'SKBNK', 'SMRTG', 'SOKM',
  'TABGD', 'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TOASO', 'TRALT', 'TRMET', 'TSKB', 'TTKOM', 'TTRAK', 'TUKAS',
  'TUPRS', 'TURSG', 'ULKER', 'VAKBN', 'VESBE', 'VESTL', 'YEOTK', 'YKBNK', 'YYLGD', 'ZOREN'
];
const XBANK = ['AKBNK', 'GARAN', 'YKBNK', 'ISCTR', 'VAKBN', 'HALKB', 'TSKB', 'SKBNK', 'ALBRK', 'ICBCT', 'KLNMA', 'QNBFL'];

const getPotentialColor = (pct) => {
  if (pct > 50) return 'var(--positive)';
  if (pct > 20) return 'var(--positive)';
  if (pct > 0) return 'var(--positive)';
  if (pct < -20) return 'var(--negative)';
  if (pct < 0) return 'var(--negative)';
  return 'var(--color-neutral)';
};

export default function Stocks() {
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const stocksUrl = `${apiBase}/stocks`;
  const convictionUrl = `${apiBase}/conviction/all`;
  const cachedStocks = getCachedData(stocksUrl);
  const cachedConviction = getCachedData(convictionUrl);

  const initialConvictionMap = useMemo(() => {
    const cMap = {};
    if (Array.isArray(cachedConviction)) {
      cachedConviction.forEach(item => { cMap[item.ticker] = item; });
    }
    return cMap;
  }, []);

  const hasValidStocks = cachedStocks && Array.isArray(cachedStocks.stocks) && cachedStocks.stocks.length > 0;
  const [data, setData] = useState(hasValidStocks ? cachedStocks : { status: 'INITIALIZING', last_updated: null, stocks: [] });
  const [convictionMap, setConvictionMap] = useState(initialConvictionMap);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!hasValidStocks);
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'STRONG_BUY', 'IN_ENTRY', 'BIST30', 'BIST100', 'XBANK', 'RECOMMENDED', 'FAVORITES'
  const [sortConfig, setSortConfig] = useState({ key: 'score', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState({});
  const itemsPerPage = 50;

  const toggleRowExpand = (ticker) => {
    setExpandedRows(prev => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const { favorites } = useFavorites();

  useEffect(() => {
    // 1. Fetch stocks
    const fetchStocks = fetch(stocksUrl).then(r => r.ok ? r.json() : null).catch(() => null);
    // 2. Fetch conviction engine scores
    const fetchConviction = fetch(convictionUrl).then(r => r.ok ? r.json() : []).catch(() => []);

    Promise.all([fetchStocks, fetchConviction])
      .then(([stocksRes, convictionRes]) => {
        if (stocksRes && Array.isArray(stocksRes.stocks)) {
          setCachedData(stocksUrl, stocksRes);
          setData(stocksRes);
        }

        if (convictionRes) {
          setCachedData(convictionUrl, convictionRes);
          const cMap = {};
          if (Array.isArray(convictionRes)) {
            convictionRes.forEach(item => {
              cMap[item.ticker] = item;
            });
          }
          setConvictionMap(cMap);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Stocks fetch error:", err);
        setLoading(false);
      });
  }, [stocksUrl, convictionUrl]);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const processedData = useMemo(() => {
    if (!data.stocks) return [];
    
    // Merge conviction data into stock rows
    let merged = data.stocks.map(s => {
      const conv = convictionMap[s.ticker] || {};
      return {
        ...s,
        score: conv.score || 0,
        decision: conv.decision || 'BEKLE',
        decision_badge: conv.decision_badge || 'HOLD',
        decision_color: conv.color || 'var(--color-warning)',
        consensus_target: conv.consensus_target || null,
        stop_loss: conv.stop_loss || null,
        entry_zone: conv.entry_zone || null,
        risk_reward: conv.risk_reward || 1.0,
        is_excessive_rr: conv.is_excessive_rr || (conv.risk_reward > 10.0),
        rr_warning: conv.rr_warning || null,
        is_momentum: conv.is_momentum || false,
        is_value: conv.is_value || false,
        model_count: conv.model_count || 0,
        is_disagreeing: conv.is_disagreeing || false,
        disagreement_badge: conv.disagreement_badge || null,
        disagreement_reason: conv.disagreement_reason || null,
        alpha_score: conv.alpha_score !== undefined ? conv.alpha_score : null,
        alpha_signal: conv.alpha_signal || null
      };
    });

    // 1. Filter by Search
    let result = merged.filter(s => 
      s.ticker.toLowerCase().includes(search.toLowerCase()) || 
      s.name.toLowerCase().includes(search.toLowerCase())
    );

    // 2. Filter by Tab
    if (filter === 'STRONG_BUY') {
      result = result.filter(s => (s.decision === 'GÜÇLÜ AL' || s.decision === 'KADEMELİ AL') && !s.is_excessive_rr);
    } else if (filter === 'IN_ENTRY') {
      result = result.filter(s => s.entry_zone && s.price >= s.entry_zone.low && s.price <= s.entry_zone.high);
    } else if (filter === 'BIST30') {
      result = result.filter(s => BIST30.includes(s.ticker));
    } else if (filter === 'BIST100') {
      result = result.filter(s => BIST100.includes(s.ticker));
    } else if (filter === 'XBANK') {
      result = result.filter(s => XBANK.includes(s.ticker));
    } else if (filter === 'RECOMMENDED') {
      result = result.filter(s => s.rec_count > 0);
    } else if (filter === 'FAVORITES') {
      result = result.filter(s => favorites.includes(s.ticker));
    }

    // 3. Sort
    result.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      
      if (valA === null || valA === undefined) valA = -999999;
      if (valB === null || valB === undefined) valB = -999999;
      
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data.stocks, convictionMap, search, filter, sortConfig, favorites]);

  // Pagination logic
  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const maxVolume = useMemo(() => {
    let m = 0;
    paginatedData.forEach(s => {
      if (s.volume > m) m = s.volume;
    });
    return m;
  }, [paginatedData]);

  const formatVolume = (vol) => {
    if (vol === null || vol === undefined) return 'N/A';
    if (vol > 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol > 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol;
  };

  return (
    <PageContainer
      title="Hisseler"
      badge={{
        label: `${processedData.length} SEMBOL`,
        background: 'rgba(200, 162, 74, 0.12)',
        color: 'var(--color-neutral)',
        borderColor: 'rgba(200, 162, 74, 0.3)'
      }}
      subtitle="Giriş bölgesi, dinamik stop ve risk/ödül ile kısa–orta vade işlem kurulumları."
      statusDot={data.status === 'FETCHING' ? 'var(--color-warning)' : 'var(--color-up)'}
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
          <span style={{ 
            color: data.status === 'FETCHING' ? 'var(--color-warning)' : 'var(--color-up)',
            border: `1px solid ${data.status === 'FETCHING' ? 'var(--color-warning)' : 'var(--color-up)'}`,
            padding: '2px 6px',
            borderRadius: '3px',
            fontWeight: '600'
          }}>
            {data.status === 'FETCHING' ? 'VERİLER GÜNCELLENİYOR...' : `EŞİTLENDİ [${data.last_updated || 'LIVE'}]`}
          </span>
        </div>
      }
    >
      <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>
          {/* Controls and Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Hisse / Şirket Ara..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ 
                  width: '220px',
                  height: '28px',
                  padding: '3px 10px', 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)', 
                  color: 'var(--text-primary)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  outline: 'none'
                }}
              />
              <button 
                onClick={() => setFilter('ALL')} 
                className={`action-button ${filter === 'ALL' ? 'active' : ''}`}
              >
                Tümü
              </button>
              <button 
                onClick={() => setFilter('STRONG_BUY')} 
                className={`action-button ${filter === 'STRONG_BUY' ? 'active-green' : ''}`}
              >
                Güçlü AL
              </button>
              <button 
                onClick={() => setFilter('IN_ENTRY')} 
                className={`action-button ${filter === 'IN_ENTRY' ? 'active-cyan' : ''}`}
              >
                Alım bölgesi
              </button>
              <button 
                onClick={() => setFilter('BUY_RECOMMENDED')} 
                className={`action-button ${filter === 'BUY_RECOMMENDED' ? 'active' : ''}`}
              >
                Önerilenler
              </button>
              <button 
                onClick={() => setFilter('FAVORITES')} 
                className={`action-button ${filter === 'FAVORITES' ? 'active-warning' : ''}`}
              >
                Favoriler
              </button>
              <button 
                onClick={() => setFilter('BIST30')} 
                className={`action-button ${filter === 'BIST30' ? 'active' : ''}`}
              >
                BIST 30
              </button>
              <button 
                onClick={() => setFilter('BIST100')} 
                className={`action-button ${filter === 'BIST100' ? 'active' : ''}`}
              >
                BIST 100
              </button>
            </div>
          </div>

        <div className="table-responsive stable-scroll" style={{ flex: 1, borderBottom: '1px solid var(--border-color)' }}>
          <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
              <tr>
                <th style={{ width: '4%', textAlign: 'center' }}></th>
                <th style={{ width: '16%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('ticker')}>HİSSE {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                <th style={{ width: '9%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('price')}>FİYAT (TL) {sortConfig.key === 'price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                <th style={{ width: '7%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('change_pct')}>FARK % {sortConfig.key === 'change_pct' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                <th style={{ width: '16%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('score')}>KARAR SKORU {sortConfig.key === 'score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                <th style={{ width: '13%', textAlign: 'center' }}>ALIM BÖLGESİ</th>
                <th style={{ width: '10%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('avg_potential')}>HEDEF POT. {sortConfig.key === 'avg_potential' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                <th style={{ width: '9%', textAlign: 'center' }}>STOP-LOSS</th>
                <th style={{ width: '8%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('rec_count')}>KURUMLAR {sortConfig.key === 'rec_count' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</th>
                <th style={{ width: '8%', textAlign: 'center' }}>İŞLEM</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
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
                      <div className="skeleton-bar" style={{ width: '45px', height: '16px', marginLeft: 'auto' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton-bar" style={{ width: '65px', height: '20px', margin: '0 auto' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton-bar" style={{ width: '80px', height: '16px', margin: '0 auto' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton-bar" style={{ width: '55px', height: '20px', margin: '0 auto' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton-bar" style={{ width: '60px', height: '16px', margin: '0 auto' }} />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <div className="skeleton-bar" style={{ width: '55px', height: '16px' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton-bar" style={{ width: '55px', height: '22px', margin: '0 auto' }} />
                    </td>
                  </tr>
                ))
              ) : (
                paginatedData.map(s => (
                <React.Fragment key={s.ticker}>
                  <tr className="row-hoverable">
                    <td style={{ textAlign: 'center', width: '4.5%' }}>
                      <ImageWithFallback 
                        src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${s.ticker}.png`} 
                        alt={s.ticker} 
                        fallbackName={s.ticker}
                        size={26}
                        style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                      />
                    </td>
                    <td style={{ textAlign: 'left', width: '18%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FavoriteStar ticker={s.ticker} size={15} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Link to={`/hisse/${s.ticker}`} className="ticker-link" style={{ fontSize: '13px', fontWeight: 'bold' }}>
                            {s.ticker}
                          </Link>
                          {BIST30.includes(s.ticker) && <span className="badge badge-subtle" style={{ fontSize: '9px', padding: '1px 3px' }}>B30</span>}
                          {s.model_count > 0 && (
                            <span style={{ fontSize: '9px', color: 'var(--warning)', fontWeight: 'bold', background: 'rgba(201, 136, 58, 0.15)', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>MOD</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td style={{ fontWeight: 'bold', textAlign: 'right', color: 'var(--text-primary)', fontSize: '13px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {s.price ? s.price.toFixed(2) : 'N/A'}
                    </td>

                    {/* Change % */}
                    <td style={{ 
                      fontWeight: 'bold', 
                      textAlign: 'right', 
                      fontSize: '13px',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                      color: s.change_pct > 0 ? 'var(--color-up)' : (s.change_pct < 0 ? 'var(--color-down)' : 'var(--text-muted)') 
                    }}>
                      {s.change_pct > 0 ? '▲ +' : (s.change_pct < 0 ? '▼ ' : '')}
                      {s.change_pct !== null && s.change_pct !== undefined ? Math.abs(s.change_pct).toFixed(2) + '%' : 'N/A'}
                    </td>

                    {/* Decision & Score */}
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '150px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleRowExpand(s.ticker); }}
                          title="Karar Skoru alt bileşen dökümünü aç/kapat"
                          style={{
                            width: '128px',
                            ...tintStyle(s.decision_color || 'var(--color-warning)'),
                            fontSize: '9.5px',
                            fontWeight: '900',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            letterSpacing: '0.2px',
                            border: expandedRows[s.ticker] ? '1px solid var(--color-cyan)' : '1px solid transparent',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box'
                          }}
                        >
                          <span style={{ whiteSpace: 'nowrap', fontSize: '9px', fontWeight: '900' }}>
                            {s.decision}
                          </span>
                          <span style={{ fontSize: '9px', opacity: 0.85, fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: '4px', borderLeft: '1px solid rgba(0,0,0,0.2)', paddingLeft: '4px' }}>
                            {s.score}p {expandedRows[s.ticker] ? '▲' : '▼'}
                          </span>
                        </button>
                        {s.is_disagreeing && (
                          <span 
                            title={s.disagreement_reason || "İki motor farklı görüşte"}
                            style={{
                              position: 'absolute',
                              right: '0px',
                              color: 'var(--warning)',
                              cursor: 'help',
                              fontSize: '12px',
                              lineHeight: 1
                            }}
                          >
                            <AlertTriangle size={12} />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Entry Zone */}
                    <td style={{ textAlign: 'center', fontSize: '12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {s.entry_zone ? (
                        <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>
                          {s.entry_zone.low} - {s.entry_zone.high}
                        </span>
                      ) : '-'}
                    </td>

                    {/* Potential */}
                    <td style={{ textAlign: 'center', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {s.rec_count > 0 ? (
                        <span 
                          style={{ 
                            color: s.is_excessive_rr ? 'var(--warning)' : getPotentialColor(s.avg_potential),
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: s.is_excessive_rr ? 'rgba(201, 136, 58, 0.12)' : 'rgba(255,255,255,0.03)',
                            border: s.is_excessive_rr ? '1px solid rgba(201, 136, 58, 0.3)' : 'none',
                            fontVariantNumeric: 'tabular-nums'
                          }}
                          title={s.is_excessive_rr ? "Aşırı yüksek getiri/R:R - sermaye artırımı/bölünme sonrası hedef fiyat doğrulaması gerekebilir" : ""}
                        >
                          {s.is_excessive_rr && <span style={{ fontSize: '10px' }}><AlertTriangle size={12} /></span>}
                          {s.avg_potential > 0 ? '+' : ''}{s.avg_potential.toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--border-color)' }}>--</span>
                      )}
                    </td>

                    {/* Stop Loss */}
                    <td style={{ textAlign: 'center', fontSize: '13px', color: 'var(--color-red)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {s.stop_loss ? `${s.stop_loss.toFixed(1)} TL` : '-'}
                    </td>

                    {/* Brokers */}
                    <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '13px' }}>{s.rec_count}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '3px' }}>Kurum</span>
                    </td>

                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <Link to={`/hisse/${s.ticker}`} className="action-button" style={{ padding: '3px 8px', fontSize: '10px' }}>
                        Kokpit
                      </Link>
                    </td>
                  </tr>
                  {expandedRows[s.ticker] && (
                    <tr key={`${s.ticker}-breakdown`} style={{ background: 'rgba(18, 18, 20, 0.95)' }}>
                      <td colSpan="10" style={{ padding: '8px 14px 12px 14px', borderBottom: '1px solid var(--border-color)' }}>
                        <ScoreBreakdownWidget ticker={s.ticker} compact={true} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                ))
              )}
              {!loading && paginatedData.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Kriterlere uygun hisse bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
              <div style={{ color: 'var(--text-muted)' }}>
                Gösterilen: {processedData.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, processedData.length)} / Toplam: {processedData.length}
              </div>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                  disabled={currentPage === 1}
                  className="action-button"
                  style={{ opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  &lt; Önceki
                </button>
                <span style={{ padding: '3px 8px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
                  Sayfa {currentPage} / {totalPages || 1}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="action-button"
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