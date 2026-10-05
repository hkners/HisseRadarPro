import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';
import { sortReportsByDateDesc } from '../utils/dateUtils';
import StockCommandHeader from '../components/StockCommandHeader';
import AddToPortfolioModal from '../components/AddToPortfolioModal';
import StockReportsSection from '../components/StockReportsSection';
import TradingViewChart from '../components/TradingViewChart';
import TabFundamentals from '../components/TabFundamentals';
import TabDividends from '../components/TabDividends';
import TabMultiples from '../components/TabMultiples';
import AiAnalysisTab from '../components/AiAnalysisTab';
import TechnicalRatingsWidget from '../components/TechnicalRatingsWidget';
import ScoreBreakdownWidget from '../components/ScoreBreakdownWidget';
import ValuationStrip from '../components/valuation/ValuationStrip';
import ValuationTab from '../components/valuation/ValuationTab';
import { brokerTargets, buildValuationRows } from '../components/valuation/valuationModel';
import { PillTabs } from '../components/ui';
import { classifyRating } from '../utils/rating';
import TechnicalPanel from '../components/ta/TechnicalPanel';

const DETAIL_TABS = [
  { id: 'ozet', label: 'Özet & Kokpit' },
  { id: 'teknik', label: 'Teknik Analiz' },
  { id: 'degerleme', label: 'Değerleme' },
  { id: 'skor_dokumu', label: 'HisseRadar Skoru' },
  { id: 'ai_analiz', label: 'Yapay Zeka Analizi' },
  { id: 'finansallar', label: 'Finansal Tablolar' },
  { id: 'carpanlar', label: 'Çarpanlar & Rasyolar' },
  { id: 'temettu', label: 'Temettü & Sermaye' },
];

export default function StockDetail() {
  const { ticker } = useParams();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => (DETAIL_TABS.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'ozet'));
  const [leftPanelTab, setLeftPanelTab] = useState('fundamentals'); // 'fundamentals' | 'technicals'
  const [layoutMode, setLayoutMode] = useState(() => {
    try { return localStorage.getItem('cockpit_layout_mode') || 'terminal'; } catch { return 'terminal'; }
  });
  const [stock, setStock] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [setup, setSetup] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceHistory, setPriceHistory] = useState([]);
  const [taSummary, setTaSummary] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);

  const handleToggleLayoutMode = () => {
    const next = layoutMode === 'terminal' ? 'classic' : 'terminal';
    setLayoutMode(next);
    try { localStorage.setItem('cockpit_layout_mode', next); } catch { }
  };

  useEffect(() => {
    // 1. Fetch live price
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}`)
      .then(res => res.json())
      .then(data => setStock(data))
      .catch(() => { });

    // 2. Fetch fundamentals
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}/fundamentals`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          if (data.fundamentals) setFundamentals(data.fundamentals);
          if (data.technical_analysis) setTaSummary(data.technical_analysis);
        }
      })
      .catch(() => { });

    // 3. Fetch backend Technical Analysis
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}/technical-analysis`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && !data.error) setTaSummary(data);
      })
      .catch(e => console.error("TA fetch error:", e));

    // 4. Fetch conviction setup
    fetch(`${import.meta.env.VITE_API_URL}/conviction/stock/${ticker}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setSetup(data);
      })
      .catch(() => { });

    // 5. Fetch scraped recommendations
    fetch(`${import.meta.env.VITE_API_URL}/recommendations/${ticker}`)
      .then(res => res.json())
      .then(data => {
        const validRecs = (data || []).filter(r => {
          const tgt = r.hedefFiyat;
          const mev = r.mevcutFiyat;
          if (!tgt || tgt === "Bilinmiyor" || !mev || mev === "Bilinmiyor") return true;
          try {
            const tVal = parseFloat(tgt.toString().replace(',', '.'));
            const mVal = parseFloat(mev.toString().replace(',', '.'));
            if (mVal > 0 && ((tVal - mVal) / mVal * 100) > 500) return false;
          } catch { }
          return true;
        });
        const sortedRecs = sortReportsByDateDesc(validRecs);
        setRecs(sortedRecs);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // 6. Fetch peer valuation ranges (football field)
    setValuation(null);
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}/valuation`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setValuation(data))
      .catch(() => setValuation(null));

    // 7. Fetch price history for chart
    fetch(`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/stocks/${ticker}/history`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setPriceHistory(data || []))
      .catch(() => setPriceHistory([]));
  }, [ticker]);

  // Group recommendations by broker
  const groupedRecs = useMemo(() => {
    const groups = {};
    recs.forEach(r => {
      const b = r.kurum;
      if (!groups[b]) groups[b] = [];
      groups[b].push(r);
    });
    const unique = [];
    const history = {};
    Object.keys(groups).forEach(b => {
      const arr = groups[b];
      unique.push(arr[0]);
      if (arr.length > 1) {
        history[b] = arr.slice(1);
      }
    });
    return { unique: sortReportsByDateDesc(unique), history };
  }, [recs]);

  // Compute Consensus Snapshot
  const consensus = useMemo(() => {
    let targets = [];
    let ratings = { AL: 0, TUT: 0, SAT: 0 };
    groupedRecs.unique.forEach(r => {
      const tgt = r.hedefFiyat;
      if (tgt && tgt !== "Bilinmiyor") {
        try { targets.push(parseFloat(tgt.toString().replace(',', '.'))); } catch { }
      }
      // Reports without a stated rating are left out instead of being counted as TUT.
      const cat = classifyRating(r.rating || r.tavsiye);
      if (cat !== 'OTHER') ratings[cat]++;
    });

    const avgTarget = targets.length > 0 ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    const minTarget = targets.length > 0 ? Math.min(...targets) : null;
    const maxTarget = targets.length > 0 ? Math.max(...targets) : null;
    let avgPotential = null;
    if (avgTarget && stock && stock.price) {
      avgPotential = ((avgTarget - stock.price) / stock.price) * 100;
    }

    return { avgTarget, avgPotential, minTarget, maxTarget, ratings, count: groupedRecs.unique.length };
  }, [groupedRecs.unique, stock]);

  const valuationRows = useMemo(
    () => buildValuationRows({ targets: brokerTargets(groupedRecs.unique), valuation }),
    [groupedRecs.unique, valuation]
  );
  const livePrice = stock?.price ?? valuation?.price ?? null;

  // Ensure live price is appended to the chart data for current session
  const chartData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];
    if (!stock || !stock.price) return priceHistory;

    const d = new Date();
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1);
    else if (day === 0) d.setDate(d.getDate() - 2);

    const targetDateStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const lastDate = priceHistory[priceHistory.length - 1].date;

    if (lastDate < targetDateStr) {
      const liveEntry = {
        date: targetDateStr,
        open: stock.price,
        high: stock.price,
        low: stock.price,
        close: stock.price,
        volume: 0
      };
      return [...priceHistory, liveEntry];
    } else if (lastDate === targetDateStr) {
      const updated = [...priceHistory];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        close: stock.price,
        high: Math.max(updated[updated.length - 1].high, stock.price),
        low: Math.min(updated[updated.length - 1].low, stock.price)
      };
      return updated;
    }

    return priceHistory;
  }, [priceHistory, stock]);

  // Compute performance returns
  const performanceReturns = useMemo(() => {
    if (!chartData || chartData.length < 2 || !stock?.price) return null;
    const currentPrice = stock.price;
    const now = new Date();

    const getReturn = (months, days = 0) => {
      const targetDate = new Date(now);
      if (months) targetDate.setMonth(targetDate.getMonth() - months);
      if (days) targetDate.setDate(targetDate.getDate() - days);

      let closest = null;
      let closestDiff = Infinity;
      for (const entry of chartData) {
        const entryDate = new Date(entry.date);
        const diff = Math.abs(entryDate - targetDate);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = entry;
        }
      }
      if (!closest || !closest.close) return null;
      return ((currentPrice - closest.close) / closest.close) * 100;
    };

    return {
      '1H': getReturn(0, 7),
      '1A': getReturn(1, 0),
      '3A': getReturn(3, 0),
      '6A': getReturn(6, 0),
      '1Y': getReturn(12, 0),
    };
  }, [chartData, stock]);

  // Render left panel contents
  const renderLeftPanelContent = () => (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
      {/* Sub-tab Switcher Header */}
      <div style={{
        display: 'flex',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid var(--border-color)',
        padding: '3px 5px',
        gap: '4px',
        flexShrink: 0
      }}>
        <button
          onClick={() => setLeftPanelTab('fundamentals')}
          style={{
            flex: 1,
            background: leftPanelTab === 'fundamentals' ? 'rgba(200, 162, 74, 0.15)' : 'transparent',
            color: leftPanelTab === 'fundamentals' ? 'var(--color-cyan)' : 'var(--text-muted)',
            border: `1px solid ${leftPanelTab === 'fundamentals' ? 'rgba(200, 162, 74, 0.3)' : 'transparent'}`,
            borderRadius: '3px',
            padding: '4px 0',
            fontSize: '9.5px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          TEMEL & HEDEFLER
        </button>
        <button
          onClick={() => setLeftPanelTab('technicals')}
          style={{
            flex: 1,
            background: leftPanelTab === 'technicals' ? 'rgba(200, 162, 74, 0.15)' : 'transparent',
            color: leftPanelTab === 'technicals' ? 'var(--color-cyan)' : 'var(--text-muted)',
            border: `1px solid ${leftPanelTab === 'technicals' ? 'rgba(200, 162, 74, 0.3)' : 'transparent'}`,
            borderRadius: '3px',
            padding: '4px 0',
            fontSize: '9.5px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          TEKNİK (TV)
        </button>
        <button
          onClick={() => setLeftPanelTab('breakdown')}
          style={{
            flex: 1,
            background: leftPanelTab === 'breakdown' ? 'rgba(200, 162, 74, 0.15)' : 'transparent',
            color: leftPanelTab === 'breakdown' ? 'var(--color-cyan)' : 'var(--text-muted)',
            border: `1px solid ${leftPanelTab === 'breakdown' ? 'rgba(200, 162, 74, 0.3)' : 'transparent'}`,
            borderRadius: '3px',
            padding: '4px 0',
            fontSize: '9.5px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          SKOR DÖKÜMÜ
        </button>
      </div>

      {/* Left Panel Body */}
      <div className="panel-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px', minHeight: 0, gap: '7px', overflowY: 'auto' }}>
        {leftPanelTab === 'fundamentals' ? (
          <>
            {/* Row 1: Key Metrics — 2 rows of 4 */}
            {fundamentals && (
              <div>
                <div style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-neutral)', marginBottom: '3px', letterSpacing: '0.3px' }}>
                  ÖNEMLİ RASYOLAR
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px' }}>
                  {[
                    { label: 'F/K', value: fundamentals.trailingPE ? fundamentals.trailingPE.toFixed(1) : '-' },
                    { label: 'PD/DD', value: fundamentals.priceToBook ? fundamentals.priceToBook.toFixed(2) : '-' },
                    { label: 'Piy.Deg.', value: fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(1) + 'B' : '-' },
                    { label: 'Temettü', value: fundamentals.dividendYield ? fundamentals.dividendYield.toFixed(1) + '%' : '-', color: fundamentals.dividendYield ? 'var(--color-up)' : undefined },
                    { label: 'ROE', value: fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(1) + '%' : '-' },
                    { label: 'Kâr Mrj.', value: fundamentals.profitMargins ? (fundamentals.profitMargins * 100).toFixed(1) + '%' : '-' },
                    { label: 'B/O', value: fundamentals.debtToEquity ? fundamentals.debtToEquity.toFixed(1) : '-' },
                    { label: 'İleri F/K', value: fundamentals.forwardPE ? fundamentals.forwardPE.toFixed(1) : '-' },
                  ].map((m, i) => (
                    <div key={i} style={{ background: 'var(--bg-secondary)', padding: '3px 2px', borderRadius: '3px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '8px', marginBottom: '1px', textTransform: 'uppercase', fontWeight: '600' }}>{m.label}</div>
                      <div style={{ color: m.color || 'var(--text-primary)', fontWeight: 'bold', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Row 2: Consensus Card */}
            <div style={{ background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '5px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '10px', letterSpacing: '0.4px' }}>KONSENSUS HEDEF</span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{consensus.count} kurum</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ort. Hedef:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {typeof consensus.avgTarget === 'number' ? consensus.avgTarget.toFixed(2) + ' TL' : '-'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '10px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Beklenen Getiri:</span>
                <span style={{ fontWeight: 'bold', color: typeof consensus.avgPotential === 'number' ? (consensus.avgPotential > 0 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {typeof consensus.avgPotential === 'number' ? `${consensus.avgPotential > 0 ? '+' : ''}${consensus.avgPotential.toFixed(1)}%` : '-'}
                </span>
              </div>
              {consensus.minTarget && consensus.maxTarget && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '9px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  <span>Min: {consensus.minTarget.toFixed(2)}</span>
                  <span>Max: {consensus.maxTarget.toFixed(2)}</span>
                </div>
              )}
              {consensus.count > 0 && (
                <div style={{ display: 'flex', gap: '2px', width: '100%', height: '4px', borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
                  {consensus.ratings.AL > 0 && <div style={{ background: 'var(--color-up)', flex: consensus.ratings.AL }} />}
                  {consensus.ratings.TUT > 0 && <div style={{ background: 'var(--color-warning)', flex: consensus.ratings.TUT }} />}
                  {consensus.ratings.SAT > 0 && <div style={{ background: 'var(--color-down)', flex: consensus.ratings.SAT }} />}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', fontSize: '9px', fontWeight: 'bold' }}>
                {consensus.ratings.AL > 0 && <span style={{ color: 'var(--color-up)' }}>{consensus.ratings.AL} AL</span>}
                {consensus.ratings.TUT > 0 && <span style={{ color: 'var(--color-warning)' }}>{consensus.ratings.TUT} TUT</span>}
                {consensus.ratings.SAT > 0 && <span style={{ color: 'var(--color-down)' }}>{consensus.ratings.SAT} SAT</span>}
              </div>
            </div>

            {/* Row 3: 52-Week Slider */}
            {fundamentals && fundamentals.fiftyTwoWeekLow && fundamentals.fiftyTwoWeekHigh && stock?.price && (
              <div style={{ background: 'var(--bg-secondary)', padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 'bold', color: 'var(--color-neutral)', fontSize: '8px', letterSpacing: '0.3px' }}>52 HAFTA ARALIĞI</span>
                  <span style={{ fontSize: '9px', color: 'var(--color-cyan)', fontWeight: 'bold' }}>
                    %{(((stock.price - fundamentals.fiftyTwoWeekLow) / (fundamentals.fiftyTwoWeekHigh - fundamentals.fiftyTwoWeekLow)) * 100).toFixed(0)} Seviyesinde
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '3px', fontVariantNumeric: 'tabular-nums' }}>
                  <span>{fundamentals.fiftyTwoWeekLow.toFixed(1)} TL</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{stock.price.toFixed(2)} TL</span>
                  <span>{fundamentals.fiftyTwoWeekHigh.toFixed(1)} TL</span>
                </div>
                <div style={{ position: 'relative', width: '100%', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0,
                    width: `${Math.min(100, Math.max(0, ((stock.price - fundamentals.fiftyTwoWeekLow) / (fundamentals.fiftyTwoWeekHigh - fundamentals.fiftyTwoWeekLow)) * 100))}%`,
                    background: 'linear-gradient(90deg, rgba(200, 162, 74, 0.3), var(--color-cyan))',
                    borderRadius: '2px'
                  }} />
                  <div style={{
                    position: 'absolute', top: '-2px', bottom: '-2px', width: '6px',
                    background: '#fff', borderRadius: '2px', boxShadow: '0 0 4px var(--color-cyan)',
                    left: `calc(${Math.min(100, Math.max(0, ((stock.price - fundamentals.fiftyTwoWeekLow) / (fundamentals.fiftyTwoWeekHigh - fundamentals.fiftyTwoWeekLow)) * 100))}% - 3px)`
                  }} />
                </div>
              </div>
            )}

            {/* Row 4: Ultra-Compact Circular Logos Model Portfolio Card */}
            {(() => {
              const modelReports = recs.filter(r => r.is_model);
              const modelBrokersMap = new Map();
              modelReports.forEach(r => {
                if (!modelBrokersMap.has(r.kurum)) {
                  modelBrokersMap.set(r.kurum, r);
                }
              });
              const modelBrokersList = Array.from(modelBrokersMap.values());
              const hasModel = modelBrokersList.length > 0;

              return (
                <div style={{
                  background: hasModel ? 'linear-gradient(145deg, rgba(201, 136, 58, 0.08) 0%, rgba(18, 18, 20, 0.95) 100%)' : 'var(--bg-secondary)',
                  padding: '6px 8px',
                  borderRadius: '5px',
                  border: `1px solid ${hasModel ? 'rgba(201, 136, 58, 0.35)' : 'var(--border-color)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '9px', letterSpacing: '0.4px' }}>
                        MODEL PORTFÖY
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--warning)', fontWeight: 'bold' }}>
                        ({hasModel ? `${modelBrokersList.length} Kurum` : '0'})
                      </span>
                    </div>
                    {hasModel ? (
                      <span style={{
                        background: 'rgba(201, 136, 58, 0.18)',
                        color: 'var(--warning)',
                        border: '1px solid rgba(201, 136, 58, 0.4)',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontSize: '8px',
                        fontWeight: '800',
                        letterSpacing: '0.3px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        ★ DAHİL
                      </span>
                    ) : (
                      <span style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        color: 'var(--text-muted)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontSize: '8px',
                        fontWeight: '600'
                      }}>
                        DAHİL DEĞİL
                      </span>
                    )}
                  </div>

                  {hasModel ? (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '5px',
                      padding: '2px 0'
                    }}>
                      {modelBrokersList.map((r, idx) => {
                        const brokerSlug = slugifyBroker(r.kurum);
                        const targetNum = parseFloat(String(r.hedefFiyat).replace(',', '.'));
                        const targetStr = !isNaN(targetNum) && targetNum > 0 ? `${targetNum.toFixed(1)} TL` : null;
                        const livePot = targetNum && stock?.price ? (((targetNum - stock.price) / stock.price) * 100) : null;
                        const tooltipText = `${r.kurum}${targetStr ? ` • Hedef: ${targetStr}` : ''}${livePot !== null ? ` (${livePot >= 0 ? '+' : ''}${livePot.toFixed(0)}%)` : ''}`;

                        return (
                          <Link
                            key={idx}
                            to={`/kurum/${r.kurum.replace(/\s+/g, '-').toLowerCase()}`}
                            title={tooltipText}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: '#fff',
                              border: '1.5px solid rgba(201, 136, 58, 0.45)',
                              boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                              padding: '2px',
                              cursor: 'pointer',
                              transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                              flexShrink: 0,
                              textDecoration: 'none'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'scale(1.22)';
                              e.currentTarget.style.borderColor = 'var(--warning)';
                              e.currentTarget.style.boxShadow = '0 0 8px rgba(201, 136, 58, 0.6)';
                              e.currentTarget.style.zIndex = '5';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.borderColor = 'rgba(201, 136, 58, 0.45)';
                              e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.4)';
                              e.currentTarget.style.zIndex = '1';
                            }}
                          >
                            <ImageWithFallback
                              src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${brokerSlug}.png`}
                              alt={r.kurum}
                              fallbackName={r.kurum}
                              size={20}
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain' }}
                            />
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 0' }}>
                      Model portföylerde yer almıyor.
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        ) : leftPanelTab === 'technicals' ? (
          /* Sub-tab 2: Technical Ratings */
          <div style={{ overflowY: 'auto' }}>
            {taSummary ? (
              <TechnicalRatingsWidget taData={taSummary} currentPrice={stock?.price} />
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '15px', fontSize: '11px' }}>
                Teknik analiz yükleniyor...
              </div>
            )}
          </div>
        ) : (
          /* Sub-tab 3: Conviction Score Breakdown */
          <div style={{ overflowY: 'auto' }}>
            <ScoreBreakdownWidget ticker={ticker} compact={true} showCockpitLink={false} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ─── 1. CONSOLIDATED SINGLE-ROW COMMAND RIBBON (40px) ─── */}
      <StockCommandHeader
        ticker={ticker}
        stock={stock}
        fundamentals={fundamentals}
        setup={setup}
        onOpenPortfolioModal={() => setIsPortfolioModalOpen(true)}
        layoutMode={layoutMode}
        onToggleLayoutMode={handleToggleLayoutMode}
        onOpenBreakdown={() => setLeftPanelTab('breakdown')}
      />

      {/* ─── 2. VALUATION STRIP ─── */}
      <ValuationStrip
        price={livePrice}
        rows={valuationRows}
        score={valuation?.score}
        peerGroup={valuation?.peer_group_name}
        onOpenDetail={() => setActiveTab('degerleme')}
      />

      {/* ─── 3. NAVIGATION TABS ─── */}
      <div style={{ marginBottom: '8px', flexShrink: 0, overflowX: 'auto' }}>
        <PillTabs tabs={DETAIL_TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── 3. TAB 1: ÖZET & KOKPİT ─── */}
      {activeTab === 'ozet' && (
        <>
          {layoutMode === 'terminal' ? (
            /* ─── 3-COLUMN ZERO-SCROLL TERMINAL WORKSPACE ─── */
            <div style={{
              display: 'grid',
              gridTemplateColumns: '250px minmax(0, 1fr) 380px',
              gap: '8px',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              width: '100%',
              overflow: 'hidden'
            }}>
              {/* Column 1: Fundamentals & Consensus */}
              {renderLeftPanelContent()}

              {/* Column 2: Interactive Chart (Fills 100% height) */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
                <div className="panel-header" style={{ color: 'var(--color-neutral)', padding: '5px 10px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span>{ticker} — FİYAT GRAFİĞİ</span>
                </div>
                <div className="panel-content" style={{ padding: '6px', flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <TradingViewChart data={chartData} reports={recs} ticker={ticker} currentPrice={stock?.price} fillContainer={true} />
                </div>
              </div>

              {/* Column 3: Institutional Analyst Reports Desk */}
              <div style={{ height: '100%', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
                <StockReportsSection
                  recs={recs}
                  groupedRecs={groupedRecs}
                  stock={stock}
                  loading={loading}
                  compactMode={true}
                />
              </div>
            </div>
          ) : (
            /* ─── CLASSIC 2-COLUMN STACKED LAYOUT ─── */
            <div className="flex-row flex-1" style={{ minHeight: 0, gap: '10px' }}>
              <div style={{ width: '320px', flexShrink: 0, height: '100%' }}>
                {renderLeftPanelContent()}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, overflowY: 'auto', paddingRight: '4px' }}>
                <div className="panel" style={{ flexShrink: 0 }}>
                  <div className="panel-header" style={{ color: 'var(--color-neutral)', fontSize: '11px' }}>
                    {ticker} — İNTERAKTİF FİYAT GRAFİĞİ
                  </div>
                  <div className="panel-content" style={{ padding: '8px' }}>
                    <TradingViewChart data={chartData} reports={recs} ticker={ticker} currentPrice={stock?.price} fillContainer={false} />
                  </div>
                </div>

                <StockReportsSection
                  recs={recs}
                  groupedRecs={groupedRecs}
                  stock={stock}
                  loading={loading}
                  compactMode={false}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── TAB: DEĞERLEME ─── */}
      {activeTab === 'degerleme' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 12 }}>
          <ValuationTab ticker={ticker} price={livePrice} rows={valuationRows} valuation={valuation} consensus={consensus} />
        </div>
      )}

      {/* ─── 4. TAB 2: AI ANALİZ ─── */}
      {activeTab === 'ai_analiz' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <AiAnalysisTab ticker={ticker} />
        </div>
      )}

      {/* ─── 5. TAB 3: FİNANSALLAR ─── */}
      {activeTab === 'finansallar' && (
        <div className="panel flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
          <div className="panel-header">KAPSAMLI FİNANSAL TABLOLAR (BİLANÇO & GELİR)</div>
          <div className="panel-content">
            <TabFundamentals fundamentals={fundamentals} />
          </div>
        </div>
      )}

      {/* ─── 6. TAB 4: ÇARPANLAR ─── */}
      {activeTab === 'carpanlar' && (
        <div className="panel flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
          <div className="panel-header">SEKTÖREL DEĞERLEME ÇARPANLARI VE RASYOLAR</div>
          <div className="panel-content">
            <TabMultiples fundamentals={fundamentals} />
          </div>
        </div>
      )}

      {/* ─── 7. TAB 5: TEMETTÜ ─── */}
      {activeTab === 'temettu' && (
        <div className="panel flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
          <div className="panel-header">TEMETTÜ VE SERMAYE ARTIRIMI GEÇMİŞİ</div>
          <div className="panel-content">
            <TabDividends fundamentals={fundamentals} />
          </div>
        </div>
      )}

      {activeTab === 'teknik' && (
        <div className="panel flex-1" style={{ overflowY: 'auto', minHeight: 0, padding: '12px' }}>
          <TechnicalPanel ticker={ticker} />
        </div>
      )}

      {/* ─── 8. TAB 6: SKOR DÖKÜMÜ ─── */}
      {activeTab === 'skor_dokumu' && (
        <div className="panel flex-1" style={{ overflowY: 'auto', minHeight: 0, padding: '12px' }}>
          <ScoreBreakdownWidget ticker={ticker} compact={false} />
        </div>
      )}

      {/* ─── QUICK ADD TO PORTFOLIO MODAL ─── */}
      <AddToPortfolioModal
        ticker={ticker}
        currentPrice={stock?.price}
        isOpen={isPortfolioModalOpen}
        onClose={() => setIsPortfolioModalOpen(false)}
        onSuccess={() => { }}
      />
    </div>
  );
}
