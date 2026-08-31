import React, { useEffect, useState, useMemo, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import { sortReportsByDateDesc } from '../utils/dateUtils';
import ImageWithFallback from '../components/ImageWithFallback';
import ReportDetail from '../components/ReportDetail';
import TradingViewChart from '../components/TradingViewChart';
import TabFundamentals from '../components/TabFundamentals';
import TabDividends from '../components/TabDividends';
import TabMultiples from '../components/TabMultiples';
import TechnicalRatingsWidget from '../components/TechnicalRatingsWidget';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';

export default function StockDetail() {
  const { ticker } = useParams();
  const [activeTab, setActiveTab] = useState('ozet');
  const [stock, setStock] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [taSummary, setTaSummary] = useState(null);

  const { favorites } = useFavorites();

  useEffect(() => {
    // Fetch live price
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}`)
      .then(res => res.json())
      .then(data => {
        setStock(data);
      });

    // Fetch fundamentals
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}/fundamentals`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if(data) {
            if (data.fundamentals) setFundamentals(data.fundamentals);
            if (data.technical_analysis) setTaSummary(data.technical_analysis);
        }
      });

    // Fetch scraped recommendations
    fetch(`${import.meta.env.VITE_API_URL}/recommendations/${ticker}`)
      .then(res => res.json())
      .then(data => {
        // Filter out extreme outliers (e.g. stock splits causing >500% target difference)
        const validRecs = data.filter(r => {
            const tgt = r.hedefFiyat;
            const mev = r.mevcutFiyat;
            if (!tgt || tgt === "Bilinmiyor" || !mev || mev === "Bilinmiyor") return true;
            try {
                const tVal = parseFloat(tgt.toString().replace(',', '.'));
                const mVal = parseFloat(mev.toString().replace(',', '.'));
                if (mVal > 0 && ((tVal - mVal) / mVal * 100) > 500) return false;
            } catch {}
            return true;
        });
        const sortedRecs = sortReportsByDateDesc(validRecs);
        setRecs(sortedRecs);
        setLoading(false);
      });

    // Fetch price history for chart
    fetch(`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/stocks/${ticker}/history`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setPriceHistory(data || []))
      .catch(() => setPriceHistory([]));
  }, [ticker]);

  // Calc live potential
  const getLivePotentialVal = (target, live) => {
    if (!target || target === "Bilinmiyor" || !live || live === 0) return null;
    const tgt = parseFloat(target.toString().replace(',','.'));
    if (isNaN(tgt)) return null;
    return ((tgt - live) / live) * 100;
  };

  const getLivePotential = (target, live) => {
    const pot = getLivePotentialVal(target, live);
    if (pot === null) return "-";
    return pot >= 0 ? `+${pot.toFixed(2)}%` : `${pot.toFixed(2)}%`;
  };

  const formatPotential = (pot) => {
    if (pot === null || pot === undefined || pot === "N/A" || pot === "Bilinmiyor" || pot === "None") return "-";
    const val = parseFloat(pot);
    if (isNaN(val)) return "-";
    return val >= 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  };

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  const groupedRecs = React.useMemo(() => {
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
      // recs is already sorted by Date Desc
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
            try { targets.push(parseFloat(tgt.toString().replace(',', '.'))); } catch {}
        }
        const ratingStr = String(r.rating || r.tavsiye || "").toUpperCase();
        if (ratingStr.includes("END") && (ratingStr.includes("ÜZER") || ratingStr.includes("UZER"))) ratings.AL++;
        else if (ratingStr.includes("END") && ratingStr.includes("PARALEL")) ratings.TUT++;
        else if (ratingStr.includes("END") && ratingStr.includes("ALT")) ratings.SAT++;
        else if (ratingStr.includes("AL") || ratingStr.includes("BUY") || ratingStr.includes("EKLE") || ratingStr.includes("OUTPERFORM")) ratings.AL++;
        else if (ratingStr.includes("TUT") || ratingStr.includes("HOLD") || ratingStr.includes("NEUTRAL")) ratings.TUT++;
        else if (ratingStr.includes("SAT") || ratingStr.includes("SELL") || ratingStr.includes("AZALT") || ratingStr.includes("UNDERPERFORM")) ratings.SAT++;
        else ratings.TUT++;
    });
    
    const avgTarget = targets.length > 0 ? targets.reduce((a,b)=>a+b, 0) / targets.length : null;
    const minTarget = targets.length > 0 ? Math.min(...targets) : null;
    const maxTarget = targets.length > 0 ? Math.max(...targets) : null;
    let avgPotential = null;
    if (avgTarget && stock && stock.price) {
        avgPotential = ((avgTarget - stock.price) / stock.price) * 100;
    }
    
    return { avgTarget, avgPotential, minTarget, maxTarget, ratings, count: groupedRecs.unique.length };
  }, [groupedRecs.unique, stock]);

  // Ensure live price is appended to the chart data for the current day
  const chartData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];
    if (!stock || !stock.price) return priceHistory;
    
    // Determine the last trading day (if today is Sat/Sun, use Friday)
    const d = new Date();
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1); // Saturday -> Friday
    else if (day === 0) d.setDate(d.getDate() - 2); // Sunday -> Friday
    
    // Offset by timezone to get local YYYY-MM-DD
    const targetDateStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const lastDate = priceHistory[priceHistory.length - 1].date;
    
    if (lastDate < targetDateStr) {
      // Append a live data point
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
      // Update today's close with live price
      const updated = [...priceHistory];
      updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          close: stock.price,
          // Update high/low if current price breaks them
          high: Math.max(updated[updated.length - 1].high, stock.price),
          low: Math.min(updated[updated.length - 1].low, stock.price)
      };
      return updated;
    }
    
    return priceHistory;
  }, [priceHistory, stock]);

  // Compute performance returns from chartData (includes live price)
  const performanceReturns = useMemo(() => {
    if (!chartData || chartData.length < 2 || !stock?.price) return null;
    const currentPrice = stock.price;
    const now = new Date();
    
    const getReturn = (months, days = 0) => {
      const targetDate = new Date(now);
      if (months) targetDate.setMonth(targetDate.getMonth() - months);
      if (days) targetDate.setDate(targetDate.getDate() - days);
      
      // Find the closest price entry to targetDate
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

  // Sortable table logic
  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDir('desc');
    }
  };

  const sortedRecs = useMemo(() => {
    const rows = [...groupedRecs.unique];
    if (!sortColumn) return rows;
    
    const parseNum = (val) => {
      if (!val || val === 'Bilinmiyor' || val === 'N/A' || val === 'None') return null;
      const n = parseFloat(String(val).replace(',', '.'));
      return isNaN(n) ? null : n;
    };

    rows.sort((a, b) => {
      let vA, vB;
      if (sortColumn === 'date') {
        vA = a.tarih || '';
        vB = b.tarih || '';
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      if (sortColumn === 'reportPrice') {
        vA = parseNum(a.mevcutFiyat);
        vB = parseNum(b.mevcutFiyat);
      } else if (sortColumn === 'targetPrice') {
        vA = parseNum(a.hedefFiyat);
        vB = parseNum(b.hedefFiyat);
      } else if (sortColumn === 'originalPot') {
        vA = parseNum(a.potansiyel);
        vB = parseNum(b.potansiyel);
      } else if (sortColumn === 'livePot') {
        vA = stock?.price ? getLivePotentialVal(a.hedefFiyat, stock.price) : null;
        vB = stock?.price ? getLivePotentialVal(b.hedefFiyat, stock.price) : null;
      }
      if (vA === null && vB === null) return 0;
      if (vA === null) return 1;
      if (vB === null) return -1;
      return sortDir === 'asc' ? vA - vB : vB - vA;
    });
    return rows;
  }, [groupedRecs.unique, sortColumn, sortDir, stock]);

  // Find best and worst live potential for highlighting
  const { bestIdx, worstIdx } = useMemo(() => {
    let best = -Infinity, worst = Infinity, bestI = -1, worstI = -1;
    sortedRecs.forEach((r, i) => {
      const pot = stock?.price ? getLivePotentialVal(r.hedefFiyat, stock.price) : null;
      if (pot !== null) {
        if (pot > best) { best = pot; bestI = i; }
        if (pot < worst) { worst = pot; worstI = i; }
      }
    });
    return { bestIdx: bestI, worstIdx: worstI };
  }, [sortedRecs, stock]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '15px', flexShrink: 0 }}>
        <Link to="/" className="ticker-link text-neutral">&lt; GERİ DÖN</Link>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', flexShrink: 0 }}>
        {['ozet', 'finansallar', 'carpanlar', 'temettu'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ background: 'none', border: 'none', color: activeTab === tab ? 'var(--color-cyan)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', textTransform: 'uppercase' }}
            >
              {tab === 'ozet' ? 'Özet & Raporlar' : tab === 'finansallar' ? 'Finansallar' : tab === 'carpanlar' ? 'Çarpanlar' : 'Temettü & Sermaye'}
            </button>
        ))}
      </div>

      {activeTab === 'ozet' && (
        <>
      <div className="flex-row flex-1" style={{ minHeight: 0 }}>
        {/* Left Panel: Live Data */}
        <div className="panel" style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ color: 'var(--text-highlight)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
            <ImageWithFallback 
              src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${ticker}.png`} 
              alt={ticker} 
              fallbackName={ticker}
              size={36}
              style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fff', objectFit: 'contain', padding: '2px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FavoriteStar ticker={ticker} />
                <span style={{ fontWeight: 'bold' }}>{ticker}</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fundamentals?.sector || 'Hisse Senedi'}</span>
            </div>
          </div>
          <div className="panel-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px', minHeight: 0, gap: '7px', overflowY: 'auto' }}>
            {stock ? (
              <>
                {/* ROW 1: PRICE */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0 }}>
                  <div style={{ fontSize: '22px', color: '#fff', fontWeight: '800', lineHeight: 1 }}>
                    {stock.price ? stock.price.toFixed(2) : "N/A"}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stock.currency}</span>
                  {stock.change_pct !== undefined && stock.change_pct !== null && stock.change_pct !== 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: stock.change_pct > 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {stock.change_pct > 0 ? '\u25b2' : '\u25bc'}{Math.abs(stock.change_pct).toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* ROW 2: PERFORMANCE RETURNS */}
                {performanceReturns && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {Object.entries(performanceReturns).map(([period, val]) => (
                      <div key={period} style={{ flex: 1, textAlign: 'center', padding: '3px 2px', borderRadius: '4px', background: val !== null && val >= 0 ? 'rgba(0,200,83,0.08)' : val !== null ? 'rgba(255,50,50,0.08)' : 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '7px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{period}</div>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: val !== null ? (val >= 0 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--text-muted)' }}>
                          {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ROW 3: KEY METRICS — 2 rows of 4 */}
                {fundamentals && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', flexShrink: 0 }}>
                    {[
                      { label: 'F/K', value: fundamentals.trailingPE ? fundamentals.trailingPE.toFixed(1) : '-' },
                      { label: 'PD/DD', value: fundamentals.priceToBook ? fundamentals.priceToBook.toFixed(2) : '-' },
                      { label: 'Piy.Deg.', value: fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(1) + 'B' : '-' },
                      { label: 'Temettu', value: fundamentals.dividendYield ? fundamentals.dividendYield.toFixed(1) + '%' : '-', color: fundamentals.dividendYield ? 'var(--color-up)' : undefined },
                      { label: 'ROE', value: fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(1) + '%' : '-' },
                      { label: 'Kar Mrj.', value: fundamentals.profitMargins ? (fundamentals.profitMargins * 100).toFixed(1) + '%' : '-' },
                      { label: 'B/O', value: fundamentals.debtToEquity ? fundamentals.debtToEquity.toFixed(1) : '-' },
                      { label: 'Ileri F/K', value: fundamentals.forwardPE ? fundamentals.forwardPE.toFixed(1) : '-' },
                    ].map((m, i) => (
                      <div key={i} style={{ background: 'var(--bg-secondary)', padding: '4px 3px', borderRadius: '4px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '7px', marginBottom: '1px', textTransform: 'uppercase' }}>{m.label}</div>
                        <div style={{ color: m.color || '#fff', fontWeight: 'bold', fontSize: '10px' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ROW 4: CONSENSUS */}
                <div style={{ background: 'var(--bg-secondary)', padding: '7px 8px', borderRadius: '5px', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '10px', letterSpacing: '0.5px' }}>KONSENSUS</span>
                    <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{consensus.count} rapor</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Ort. Hedef</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{typeof consensus.avgTarget === 'number' ? consensus.avgTarget.toFixed(2) + ' TL' : '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Potansiyel</span>
                    <span style={{ fontWeight: 'bold', color: typeof consensus.avgPotential === 'number' ? (consensus.avgPotential > 0 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--text-muted)' }}>
                      {typeof consensus.avgPotential === 'number' ? `${consensus.avgPotential > 0 ? '+' : ''}${consensus.avgPotential.toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  {consensus.minTarget && consensus.maxTarget && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '9px', color: 'var(--text-muted)' }}>
                      <span>Min: {consensus.minTarget.toFixed(2)}</span>
                      <span>Max: {consensus.maxTarget.toFixed(2)}</span>
                    </div>
                  )}
                  {consensus.count > 0 && (
                    <div style={{ display: 'flex', gap: '3px', width: '100%', height: '4px', borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
                      {consensus.ratings.AL > 0 && <div style={{ background: 'var(--color-up)', flex: consensus.ratings.AL }} />}
                      {consensus.ratings.TUT > 0 && <div style={{ background: 'var(--color-warning)', flex: consensus.ratings.TUT }} />}
                      {consensus.ratings.SAT > 0 && <div style={{ background: 'var(--color-down)', flex: consensus.ratings.SAT }} />}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', fontSize: '9px', fontWeight: 'bold' }}>
                    {consensus.ratings.AL > 0 && <span style={{ color: 'var(--color-up)' }}>{consensus.ratings.AL} AL</span>}
                    {consensus.ratings.TUT > 0 && <span style={{ color: 'var(--color-warning)' }}>{consensus.ratings.TUT} TUT</span>}
                    {consensus.ratings.SAT > 0 && <span style={{ color: 'var(--color-down)' }}>{consensus.ratings.SAT} SAT</span>}
                  </div>
                </div>

                {/* ROW 5: 52-WEEK + MODEL PORTFOY + SIRKET */}
                <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                  {/* 52 Week */}
                  {fundamentals && fundamentals.fiftyTwoWeekLow && fundamentals.fiftyTwoWeekHigh && stock.price && (
                    <div style={{ flex: 1, background: 'var(--bg-secondary)', padding: '5px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--color-neutral)', fontSize: '7px', marginBottom: '3px', letterSpacing: '0.3px' }}>52 HAFTA</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                        <span>{fundamentals.fiftyTwoWeekLow.toFixed(2)}</span>
                        <span>{fundamentals.fiftyTwoWeekHigh.toFixed(2)}</span>
                      </div>
                      <div style={{ position: 'relative', width: '100%', height: '3px', background: '#333', borderRadius: '2px' }}>
                        <div style={{
                          position: 'absolute', top: '-1px', bottom: '-1px', width: '5px',
                          background: 'var(--color-cyan)', borderRadius: '3px',
                          left: `calc(${Math.min(100, Math.max(0, ((stock.price - fundamentals.fiftyTwoWeekLow) / (fundamentals.fiftyTwoWeekHigh - fundamentals.fiftyTwoWeekLow)) * 100))}% - 2px)`
                        }} />
                      </div>
                    </div>
                  )}
                  {/* Model Portfolio */}
                  <div style={{ flex: 1, background: 'var(--bg-secondary)', padding: '5px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--color-neutral)', fontSize: '7px', marginBottom: '3px', letterSpacing: '0.3px' }}>MODEL PORTFOY</div>
                    {recs.filter(r => r.is_model).length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {Array.from(new Set(recs.filter(r => r.is_model).map(r => r.kurum))).map((kurum, idx) => (
                          <span key={idx} style={{
                            background: 'rgba(0, 229, 255, 0.1)', color: 'var(--color-cyan)',
                            border: '1px solid rgba(0, 229, 255, 0.25)', padding: '1px 4px',
                            borderRadius: '3px', fontSize: '7px', fontWeight: 'bold'
                          }}>{kurum}</span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '8px', fontStyle: 'italic' }}>Yok</div>
                    )}
                  </div>
                </div>

                {/* ROW 6: TA WIDGET (COMPACT) */}
                {taSummary && (
                  <div style={{ flexShrink: 0 }}>
                    <TechnicalRatingsWidget taData={taSummary} currentPrice={stock?.price} />
                  </div>
                )}
              </>
            ) : (
              <div className="text-highlight" style={{ padding: '15px' }}>YÜKLENİYOR...</div>
            )}
          </div>
        </div>

        {/* Right Column: Chart + Reports */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0, overflowY: 'auto', paddingRight: '5px' }}>
          {/* Price Chart */}
          {chartData.length > 0 && (
            <div className="panel" style={{ flexShrink: 0 }}>
              <div className="panel-header" style={{ color: 'var(--color-neutral)' }}>
                {ticker} — FİYAT GRAFİĞİ VE KURUM RAPORLARI
              </div>
              <div className="panel-content" style={{ padding: '15px 10px' }}>
                <TradingViewChart data={chartData} reports={recs} ticker={ticker} currentPrice={stock?.price} />
              </div>
            </div>
          )}

          {/* Right Panel: Recommendations */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div className="panel-header">
            BROKERAGE TARGETS & CONSENSUS
          </div>
          <div className="panel-content">
            {loading ? (
              <div className="text-highlight">LOADING DATABASE...</div>
            ) : recs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>BROKERAGE</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>DATE {sortColumn === 'date' ? (sortDir === 'asc' ? '\u25b2' : '\u25bc') : ''}</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('reportPrice')}>REPORT PRICE {sortColumn === 'reportPrice' ? (sortDir === 'asc' ? '\u25b2' : '\u25bc') : ''}</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('targetPrice')}>TARGET PRICE {sortColumn === 'targetPrice' ? (sortDir === 'asc' ? '\u25b2' : '\u25bc') : ''}</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('originalPot')}>ORIG. POT. {sortColumn === 'originalPot' ? (sortDir === 'asc' ? '\u25b2' : '\u25bc') : ''}</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('livePot')}>LIVE POT. {sortColumn === 'livePot' ? (sortDir === 'asc' ? '\u25b2' : '\u25bc') : ''}</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecs.map((r, i) => {
                    const isExpanded = expandedRow === i;
                    const livePotVal = stock && stock.price ? getLivePotentialVal(r.hedefFiyat, stock.price) : null;
                    const livePotStr = getLivePotential(r.hedefFiyat, stock?.price);
                    const livePotColor = livePotVal !== null ? (livePotVal >= 0 ? 'text-up' : 'text-down') : 'text-muted';
                    const isUnknown = (val) => !val || val === 'Bilinmiyor' || val === 'N/A' || val === 'None';
                    
                    let reportPrice = (isUnknown(r.mevcutFiyat)) ? null : parseFloat(String(r.mevcutFiyat).replace(',', '.'));
                    let targetPrice = isUnknown(r.hedefFiyat) ? null : parseFloat(String(r.hedefFiyat).replace(',', '.'));
                    if (isNaN(reportPrice)) reportPrice = null;
                    if (isNaN(targetPrice)) targetPrice = null;
                    
                    let originalPotStr = r.potansiyel;
                    const brokerSlug = slugifyBroker(r.kurum);
                    const isBest = i === bestIdx && sortedRecs.length > 1;
                    const isWorst = i === worstIdx && sortedRecs.length > 1 && bestIdx !== worstIdx;
                    const rowBg = isBest ? 'rgba(0, 200, 83, 0.06)' : isWorst ? 'rgba(255, 50, 50, 0.06)' : undefined;
                    
                    return (
                      <Fragment key={i}>
                        <tr className="row-hoverable" onClick={() => { if(r.pdf_url) toggleRow(i) }} style={{ cursor: r.pdf_url ? 'pointer' : 'default', background: rowBg }}>
                          <td style={{ color: 'var(--text-highlight)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <ImageWithFallback 
                                src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${brokerSlug}.png`} 
                                alt={r.kurum} 
                                fallbackName={r.kurum}
                                size={24}
                                style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#fff', objectFit: 'contain', padding: '1px' }}
                              />
                              <Link to={`/kurum/${r.kurum.replace(/\s+/g, '-').toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="ticker-link text-warning" style={{ fontWeight: 'bold' }}>
                                {r.kurum} {groupedRecs.history[r.kurum] && <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '5px' }}>[+{groupedRecs.history[r.kurum].length} Eski]</span>}
                              </Link>
                            </div>
                          </td>
                          <td>
                            {r.tarih}
                          </td>
                          <td>{reportPrice !== null ? reportPrice.toFixed(2) : '-'}</td>
                          <td style={{ fontWeight: '700', color: '#fff' }}>{targetPrice !== null ? targetPrice.toFixed(2) : '-'}</td>
                          <td className="text-neutral" style={{ fontWeight: '700' }}>{formatPotential(originalPotStr)}</td>
                          <td className={livePotColor} style={{ fontWeight: '700' }}>
                            {livePotStr}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn-read" onClick={() => toggleRow(i)} style={{ marginRight: '5px', borderColor: (!r.full_text && !r.pdf_url) ? 'var(--color-up)' : 'var(--color-neutral)', color: (!r.full_text && !r.pdf_url) ? 'var(--color-up)' : 'var(--color-neutral)' }}>
                              {isExpanded ? '[X] CLOSE' : ((!r.full_text || r.full_text === "Metin bulunamadı.") && !r.pdf_url) ? 'FINTABLES' : 'DETAY'}
                            </button>
                            {r.pdf_url && (
                              <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" className="btn-read" style={{ textDecoration: 'none', display: 'inline-block', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}>
                                PDF ↗
                              </a>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="accordion-row">
                            <td colSpan="7">
                              <div className="accordion-content">
                                <div style={{ color: 'var(--text-highlight)', marginBottom: '10px', fontWeight: 'bold' }}>
                                  RAPOR TAM METNİ ({r.tarih}):
                                </div>
                                {(!r.full_text || r.full_text === "Metin bulunamadı.") && (!r.metin || r.metin === "Metin bulunamadı.") ? 
                                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Bu veri Fintables üzerinden aracı kurumun hedef fiyat ve model portföy tablolarından otomatik olarak entegre edilmiştir. Aracı kurumun detaylı PDF rapor metnine ulaşılamamaktadır.</span> : 
                                  (r.full_text || r.metin)
                                }
                                <div style={{ marginTop: '15px' }}>
                                  {r.pdf_url && (
                                    <a href={r.pdf_url} target="_blank" rel="noreferrer" className="ticker-link text-neutral">
                                      [ORİJİNAL KAYNAĞA GİT]
                                    </a>
                                  )}
                                </div>
                                
                                {groupedRecs.history[r.kurum] && (
                                  <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
                                    <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '10px' }}>
                                      {r.kurum.toUpperCase()} — ESKİ HEDEF FİYAT REVİZYONLARI (TARİHÇE)
                                    </div>
                                    <table style={{ width: '100%', fontSize: '12px', color: 'var(--text-muted)', borderCollapse: 'collapse' }}>
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                          <th style={{ padding: '5px 0', textAlign: 'left', width: '100px' }}>Tarih</th>
                                          <th style={{ padding: '5px 0', textAlign: 'left', width: '120px' }}>Hedef Fiyat</th>
                                          <th style={{ padding: '5px 0', textAlign: 'left', width: '120px' }}>Hisse Fiyatı</th>
                                          <th style={{ padding: '5px 0', textAlign: 'left' }}>Tavsiye</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {groupedRecs.history[r.kurum].map((hist, hIdx) => (
                                          <tr key={hIdx} style={{ borderBottom: '1px dotted rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '5px 0' }}>{hist.tarih}</td>
                                            <td style={{ padding: '5px 0', textDecoration: 'line-through' }}>{hist.hedefFiyat}</td>
                                            <td style={{ padding: '5px 0' }}>{hist.mevcutFiyat}</td>
                                            <td style={{ padding: '5px 0' }}>{hist.tavsiye}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-muted">NO RECOMMENDATIONS FOUND IN RECENT BATCH.</div>
            )}
          </div>
        </div>
      </div>
      </div>
      </>
      )}

      {activeTab === 'finansallar' && (
        <div className="panel flex-1">
          <div className="panel-header">KAPSAMLI FİNANSAL TABLOLAR</div>
          <div className="panel-content">
            <TabFundamentals fundamentals={fundamentals} />
          </div>
        </div>
      )}

      {activeTab === 'carpanlar' && (
        <div className="panel flex-1">
          <div className="panel-header">ÇARPANLAR VE RASYOLAR</div>
          <div className="panel-content">
            <TabMultiples fundamentals={fundamentals} />
          </div>
        </div>
      )}

      {activeTab === 'temettu' && (
        <div className="panel flex-1">
          <div className="panel-header">TEMETTÜ VE SERMAYE ARTIRIMI GEÇMİŞİ</div>
          <div className="panel-content">
            <TabDividends fundamentals={fundamentals} />
          </div>
        </div>
      )}

    </div>
  );
}
