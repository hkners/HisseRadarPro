import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import ImageWithFallback from '../components/ImageWithFallback';
import { getCachedData, fetchWithCache } from '../utils/apiCache';
import PageContainer from '../components/common/PageContainer';

const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

export default function Portfolio() {
  const stocksUrl = `${import.meta.env.VITE_API_URL}/stocks`;
  const cachedStocks = getCachedData(stocksUrl);
  const initialLivePrices = useMemo(() => {
    const map = {};
    if (cachedStocks && cachedStocks.stocks) {
      cachedStocks.stocks.forEach(s => {
        map[s.ticker] = { price: s.price, change_pct: s.change_pct, name: s.name };
      });
    }
    return map;
  }, []);

  const [holdings, setHoldings] = useState([]);
  const [livePrices, setLivePrices] = useState(initialLivePrices);
  const [loading, setLoading] = useState(Object.keys(initialLivePrices).length === 0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState('BUY');
  const [equityCurve, setEquityCurve] = useState([]);
  const [auditResult, setAuditResult] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Portfolio Builder States
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderTopN, setBuilderTopN] = useState('15');
  const [builderUniverse, setBuilderUniverse] = useState('all');
  const [builderBudget, setBuilderBudget] = useState('100000');
  const [builderMethod, setBuilderMethod] = useState('score_proportional');
  const [builderMetric, setBuilderMetric] = useState('conviction_score');
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [builderSuccess, setBuilderSuccess] = useState('');
  const [suggestedResult, setSuggestedResult] = useState(null);
  const [selectedTickers, setSelectedTickers] = useState(new Set());
  const [batchAdding, setBatchAdding] = useState(false);

  const handleGeneratePortfolio = () => {
    setBuilderLoading(true);
    setBuilderError('');
    setBuilderSuccess('');
    setSuggestedResult(null);

    const budgetNum = parseFloat(builderBudget) || 100000;
    const topNNum = parseInt(builderTopN, 10) || 15;

    fetch(`${import.meta.env.VITE_API_URL}/portfolio/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        top_n: topNNum,
        universe: builderUniverse,
        budget_tl: budgetNum,
        method: builderMethod,
        score_metric: builderMetric
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Portföy önerisi üretilemedi.');
        return res.json();
      })
      .then(data => {
        setSuggestedResult(data);
        if (data && data.portfolio) {
          const valid = new Set(data.portfolio.filter(p => p.lots > 0).map(p => p.ticker));
          setSelectedTickers(valid);
        }
        setBuilderLoading(false);
      })
      .catch(err => {
        setBuilderError(err.message || 'Portföy üretilirken hata oluştu.');
        setBuilderLoading(false);
      });
  };

  const handleToggleTicker = (ticker) => {
    setSelectedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const handleToggleAllTickers = () => {
    if (!suggestedResult || !suggestedResult.portfolio) return;
    if (selectedTickers.size === suggestedResult.portfolio.length) {
      setSelectedTickers(new Set());
    } else {
      setSelectedTickers(new Set(suggestedResult.portfolio.map(p => p.ticker)));
    }
  };

  const handleBatchAddToPortfolio = () => {
    if (!suggestedResult || !suggestedResult.portfolio) return;
    const toAdd = suggestedResult.portfolio.filter(p => selectedTickers.has(p.ticker) && p.lots > 0);
    if (toAdd.length === 0) {
      setBuilderError('Lütfen portföye eklemek için en az bir hisse seçiniz.');
      return;
    }

    setBatchAdding(true);
    setBuilderError('');
    setBuilderSuccess('');

    const todayStr = new Date().toISOString().split('T')[0];
    const transactions = toAdd.map(p => ({
      ticker: p.ticker,
      tx_type: 'BUY',
      quantity: p.lots,
      price: p.price,
      tx_date: todayStr
    }));

    fetch(`${import.meta.env.VITE_API_URL}/portfolio/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions })
    })
      .then(res => {
        if (!res.ok) throw new Error('Hisseler portföye eklenirken hata oluştu.');
        return res.json();
      })
      .then(data => {
        setBatchAdding(false);
        setBuilderSuccess(`Tebrikler! ${data.count || toAdd.length} hisse başarıyla portföyünüze eklendi.`);
        fetchPortfolio();
      })
      .catch(err => {
        setBatchAdding(false);
        setBuilderError(err.message || 'Toplu işlem başarısız oldu.');
      });
  };

  const runPortfolioAudit = () => {
    if (!holdings || holdings.length === 0) return;
    setAuditLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/conviction/portfolio-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(holdings)
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setAuditResult(data);
        setAuditLoading(false);
      })
      .catch(err => {
        console.error("Audit error:", err);
        setAuditLoading(false);
      });
  };

  const fetchPortfolio = useCallback(() => {
    fetch(`${import.meta.env.VITE_API_URL}/portfolio`)
      .then(res => res.json())
      .then(data => {
        const mapped = data.map(item => ({
          ticker: item.ticker,
          quantity: item.quantity,
          avgCost: item.cost,
        }));
        setHoldings(mapped);
      })
      .catch(console.error);
      
    fetch(`${import.meta.env.VITE_API_URL}/portfolio/equity-curve?days=30`)
      .then(res => res.json())
      .then(data => {
        if(data && Array.isArray(data)) setEquityCurve(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  // Fetch live prices with cache
  useEffect(() => {
    fetchWithCache(stocksUrl)
      .then(data => {
        if (data && data.stocks) {
          const priceMap = {};
          data.stocks.forEach(s => {
            priceMap[s.ticker] = {
              price: s.price,
              change_pct: s.change_pct,
              name: s.name,
            };
          });
          setLivePrices(priceMap);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [stocksUrl]);

  const addHolding = () => {
    const ticker = newTicker.trim().toUpperCase();
    const qty = parseFloat(newQuantity);
    const cost = parseFloat(newCost);
    if (!ticker || isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) return;

    fetch(`${import.meta.env.VITE_API_URL}/portfolio/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, tx_type: txType, quantity: qty, price: cost, tx_date: newDate })
    })
    .then(res => res.json())
    .then(() => {
      fetchPortfolio();
      setNewTicker('');
      setNewQuantity('');
      setNewCost('');
      setShowAddForm(false);
    })
    .catch(console.error);
  };

  const removeHolding = (ticker) => {
    fetch(`${import.meta.env.VITE_API_URL}/portfolio/${ticker}`, {
      method: 'DELETE'
    })
    .then(() => fetchPortfolio())
    .catch(console.error);
  };

  // Calculate portfolio metrics
  const portfolioData = useMemo(() => {
    let totalCostBasis = 0;
    let totalMarketValue = 0;
    const rows = holdings.map(h => {
      const live = livePrices[h.ticker];
      const livePrice = live?.price || 0;
      const costBasis = h.quantity * h.avgCost;
      const marketValue = h.quantity * livePrice;
      const pnl = marketValue - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      totalCostBasis += costBasis;
      totalMarketValue += marketValue;
      return {
        ...h,
        livePrice,
        changePct: live?.change_pct || 0,
        name: live?.name || `${h.ticker} A.Ş.`,
        costBasis,
        marketValue,
        pnl,
        pnlPct,
        weight: 0, // calculated below
      };
    });

    // Calculate weights
    rows.forEach(r => {
      r.weight = totalMarketValue > 0 ? (r.marketValue / totalMarketValue) * 100 : 0;
    });

    const totalPnl = totalMarketValue - totalCostBasis;
    const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

    return { rows, totalCostBasis, totalMarketValue, totalPnl, totalPnlPct };
  }, [holdings, livePrices]);

  // Pie chart data for weight distribution
  const pieData = useMemo(() => {
    return portfolioData.rows
      .filter(r => r.marketValue > 0)
      .map(r => ({ name: r.ticker, value: parseFloat(r.weight.toFixed(1)) }));
  }, [portfolioData]);

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  return (
    <PageContainer
      title="PORTFÖY YÖNETİCİSİ"
      badge={{
        label: `${holdings.length} POZİSYON`,
        background: 'rgba(57, 197, 207, 0.15)',
        color: 'var(--color-cyan)',
        borderColor: 'rgba(57, 197, 207, 0.35)'
      }}
      subtitle="Kişisel Varlık Takibi, Portföy Ağırlıkları ve AI Risk Denetimi"
      statusDot="var(--color-cyan)"
      headerRight={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              setShowBuilder(!showBuilder);
              if (showAddForm) setShowAddForm(false);
            }}
            className="action-button"
            style={{
              background: showBuilder ? 'rgba(0, 229, 255, 0.25)' : 'rgba(0, 229, 255, 0.12)',
              color: 'var(--color-cyan)',
              borderColor: 'var(--color-cyan)',
              fontWeight: 'bold',
              fontSize: '10.5px'
            }}
          >
            {showBuilder ? '[ KAPAT ]' : '[ ⚡ ÖNERİLEN PORTFÖY OLUŞTUR ]'}
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showBuilder) setShowBuilder(false);
            }}
            className="action-button"
            style={{
              background: showAddForm ? 'rgba(248, 81, 73, 0.15)' : 'rgba(0, 230, 118, 0.15)',
              color: showAddForm ? 'var(--color-red)' : 'var(--color-up)',
              borderColor: showAddForm ? 'var(--color-red)' : 'var(--color-up)',
              fontWeight: 'bold',
              fontSize: '10.5px'
            }}
          >
            {showAddForm ? '[ İPTAL ]' : '[ + HİSSE EKLE ]'}
          </button>
        </div>
      }
      scrollable={true}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Suggested Portfolio Builder Panel */}
      {showBuilder && (
        <div className="panel" style={{ marginBottom: '15px', border: '1px solid rgba(0, 229, 255, 0.3)', background: 'linear-gradient(180deg, rgba(0, 229, 255, 0.04) 0%, rgba(13, 20, 30, 0.95) 100%)' }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-cyan)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚡</span> OTOMATİK PORTFÖY İNŞASI & ÇEŞİTLENDİRME MOTORU
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Korelasyon (&lt;0.70) • Sektör Tavanı (%30) • ADV Likidite Kısıtı (%10)
            </span>
          </div>
          <div className="panel-content">
            {/* Controls */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '15px' }}>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>HİSSE SAYISI</label>
                <select
                  className="search-box"
                  value={builderTopN}
                  onChange={e => setBuilderTopN(e.target.value)}
                  style={{ width: '90px', padding: '6px 8px' }}
                >
                  <option value="5">5 Hisse</option>
                  <option value="10">10 Hisse</option>
                  <option value="15">15 Hisse</option>
                  <option value="20">20 Hisse</option>
                </select>
              </div>

              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>HİSSE EVRENİ</label>
                <select
                  className="search-box"
                  value={builderUniverse}
                  onChange={e => setBuilderUniverse(e.target.value)}
                  style={{ width: '120px', padding: '6px 8px' }}
                >
                  <option value="all">Tüm BIST</option>
                  <option value="bist30">BIST 30</option>
                  <option value="bist100">BIST 100</option>
                </select>
              </div>

              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>YATIRIM BÜTÇESİ (TRY)</label>
                <input
                  type="number"
                  className="search-box"
                  value={builderBudget}
                  onChange={e => setBuilderBudget(e.target.value)}
                  placeholder="100000"
                  step="5000"
                  style={{ width: '130px', padding: '6px 8px' }}
                />
              </div>

              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>AĞIRLIKLANDIRMA</label>
                <select
                  className="search-box"
                  value={builderMethod}
                  onChange={e => setBuilderMethod(e.target.value)}
                  style={{ width: '150px', padding: '6px 8px' }}
                >
                  <option value="score_proportional">Skora Orantılı</option>
                  <option value="equal">Eşit Ağırlıklı</option>
                  <option value="inverse_volatility">Ters Volatilite</option>
                </select>
              </div>

              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>PUANLAMA METRİĞİ</label>
                <select
                  className="search-box"
                  value={builderMetric}
                  onChange={e => setBuilderMetric(e.target.value)}
                  style={{ width: '150px', padding: '6px 8px' }}
                >
                  <option value="conviction_score">Conviction Skoru</option>
                  <option value="alpha_score">Alpha Skoru</option>
                </select>
              </div>

              <button
                onClick={handleGeneratePortfolio}
                disabled={builderLoading}
                className="btn-read"
                style={{
                  padding: '7px 20px',
                  fontSize: '12px',
                  background: builderLoading ? 'rgba(0, 229, 255, 0.3)' : 'var(--color-cyan)',
                  color: '#000',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: builderLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 12px rgba(0, 229, 255, 0.4)'
                }}
              >
                {builderLoading ? 'HESAPLANIYOR...' : 'PORTFÖY ÜRET ⚡'}
              </button>
            </div>

            {builderError && (
              <div style={{ padding: '8px 12px', background: 'rgba(248, 81, 73, 0.15)', border: '1px solid var(--color-red)', color: 'var(--color-red)', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
                {builderError}
              </div>
            )}

            {builderSuccess && (
              <div style={{ padding: '8px 12px', background: 'rgba(0, 230, 118, 0.15)', border: '1px solid var(--color-up)', color: 'var(--color-up)', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
                {builderSuccess}
              </div>
            )}

            {/* Suggested Result Table */}
            {suggestedResult && (
              <div style={{ marginTop: '10px' }}>
                {/* Summary Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>TOPLAM BÜTÇE</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{formatCurrency(suggestedResult.summary.total_budget)} ₺</div>
                  </div>
                  <div style={{ background: 'rgba(0, 230, 118, 0.06)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0, 230, 118, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-up)' }}>YATIRILAN TUTAR</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-up)' }}>{formatCurrency(suggestedResult.summary.invested_amount)} ₺</div>
                  </div>
                  <div style={{ background: 'rgba(255, 171, 0, 0.06)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255, 171, 0, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: '#ffab00' }}>KALAN BOŞTA NAKİT</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffab00' }}>{formatCurrency(suggestedResult.summary.remaining_cash)} ₺</div>
                  </div>
                  <div style={{ background: 'rgba(0, 229, 255, 0.06)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-cyan)' }}>SEÇİLİ HİSSE SAYISI</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-cyan)' }}>
                      {suggestedResult.portfolio.filter(p => selectedTickers.has(p.ticker)).length} / {suggestedResult.portfolio.length}
                    </div>
                  </div>
                </div>

                {/* Sector Breakdown Pills */}
                {suggestedResult.summary.sector_breakdown && Object.keys(suggestedResult.summary.sector_breakdown).length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sektör Dağılımı:</span>
                    {Object.entries(suggestedResult.summary.sector_breakdown).map(([secName, secData]) => (
                      <span key={secName} style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <span style={{ color: 'var(--color-cyan)' }}>{secName}</span>: %{secData.weight_pct.toFixed(1)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Table */}
                <div style={{ overflowX: 'auto', marginBottom: '15px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.15)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 4px', width: '30px' }}>
                          <input
                            type="checkbox"
                            checked={selectedTickers.size === suggestedResult.portfolio.length && suggestedResult.portfolio.length > 0}
                            onChange={handleToggleAllTickers}
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '8px' }}>HİSSE</th>
                        <th style={{ padding: '8px' }}>SEKTÖR</th>
                        <th style={{ padding: '8px' }}>SKOR</th>
                        <th style={{ padding: '8px' }}>FİYAT</th>
                        <th style={{ padding: '8px' }}>AĞIRLIK</th>
                        <th style={{ padding: '8px' }}>LOT</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>TUTAR (TRY)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestedResult.portfolio.map(item => {
                        const isSelected = selectedTickers.has(item.ticker);
                        return (
                          <tr
                            key={item.ticker}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              background: isSelected ? 'rgba(0, 229, 255, 0.03)' : 'transparent',
                              opacity: item.lots === 0 ? 0.4 : 1
                            }}
                          >
                            <td style={{ padding: '8px 4px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={item.lots === 0}
                                onChange={() => handleToggleTicker(item.ticker)}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px', fontWeight: 'bold' }}>
                              <Link to={`/stock/${item.ticker}`} style={{ color: '#fff', textDecoration: 'none' }}>
                                {item.ticker}
                              </Link>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>{item.company_name}</span>
                            </td>
                            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.sector}</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                background: item.score >= 70 ? 'rgba(0, 230, 118, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                                color: item.score >= 70 ? 'var(--color-up)' : 'var(--color-cyan)'
                              }}>
                                {item.score}
                              </span>
                            </td>
                            <td style={{ padding: '8px' }}>{item.price.toFixed(2)} ₺</td>
                            <td style={{ padding: '8px', color: 'var(--color-cyan)', fontWeight: 'bold' }}>%{item.weight_pct.toFixed(1)}</td>
                            <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.lots.toLocaleString('tr-TR')} lot</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-up)' }}>
                              {formatCurrency(item.amount_tl)} ₺
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bulk Add Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={handleBatchAddToPortfolio}
                    disabled={batchAdding || selectedTickers.size === 0}
                    className="btn-read"
                    style={{
                      padding: '8px 24px',
                      fontSize: '12px',
                      background: batchAdding || selectedTickers.size === 0 ? 'rgba(0, 230, 118, 0.2)' : 'var(--color-up)',
                      color: '#000',
                      border: 'none',
                      fontWeight: 'bold',
                      cursor: batchAdding || selectedTickers.size === 0 ? 'not-allowed' : 'pointer',
                      boxShadow: '0 0 15px rgba(0, 230, 118, 0.4)'
                    }}
                  >
                    {batchAdding ? 'EKLENİYOR...' : `[ SEÇİLEN ${suggestedResult.portfolio.filter(p => selectedTickers.has(p.ticker)).length} HİSSEYİ PORTFÖYÜME EKLE ]`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="panel" style={{ marginBottom: '15px' }}>
          <div className="panel-header" style={{ color: 'var(--color-up)' }}>YENİ İŞLEM EKLE</div>
          <div className="panel-content">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>İŞLEM</label>
                <select 
                  className="search-box" 
                  value={txType} 
                  onChange={e => setTxType(e.target.value)}
                  style={{ width: '80px', padding: '4px 8px' }}
                >
                  <option value="BUY">AL</option>
                  <option value="SELL">SAT</option>
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>TICKER</label>
                <input
                  type="text"
                  className="search-box"
                  placeholder="Ör: THYAO"
                  value={newTicker}
                  onChange={e => setNewTicker(e.target.value)}
                  style={{ width: '100px' }}
                />
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>ADET</label>
                <input
                  type="number"
                  className="search-box"
                  placeholder="100"
                  value={newQuantity}
                  onChange={e => setNewQuantity(e.target.value)}
                  style={{ width: '90px' }}
                />
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>FİYAT (TRY)</label>
                <input
                  type="number"
                  className="search-box"
                  placeholder="315.50"
                  step="0.01"
                  value={newCost}
                  onChange={e => setNewCost(e.target.value)}
                  style={{ width: '100px' }}
                />
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>TARİH</label>
                <input
                  type="date"
                  className="search-box"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  style={{ width: '130px' }}
                />
              </div>
              <button
                onClick={addHolding}
                className="btn-read"
                style={{ padding: '5px 16px', fontSize: '12px', background: 'var(--color-up)', color: '#000', border: 'none', fontWeight: 'bold' }}
              >
                KAYDET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
        <div className="panel">
          <div className="panel-header text-muted">TOPLAM MALİYET</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
            {formatCurrency(portfolioData.totalCostBasis)} ₺
          </div>
        </div>
        <div className="panel">
          <div className="panel-header text-muted">PİYASA DEĞERİ</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--color-cyan)' }}>
            {formatCurrency(portfolioData.totalMarketValue)} ₺
          </div>
        </div>
        <div className="panel">
          <div className="panel-header text-muted">TOPLAM KÂR / ZARAR</div>
          <div className="panel-content" style={{
            fontSize: '20px', fontWeight: 'bold',
            color: portfolioData.totalPnl >= 0 ? 'var(--color-up)' : 'var(--color-red)',
          }}>
            {portfolioData.totalPnl >= 0 ? '+' : ''}{formatCurrency(portfolioData.totalPnl)} ₺
            <span style={{ fontSize: '13px', marginLeft: '8px' }}>
              ({portfolioData.totalPnlPct >= 0 ? '+' : ''}{portfolioData.totalPnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header text-muted">POZİSYON SAYISI</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--color-warning)' }}>
            {holdings.length}
          </div>
        </div>
      </div>

      {/* AI Portfolio Doctor & Action Radar */}
      <div 
        className="panel-neon" 
        style={{ 
          marginBottom: '20px', 
          padding: '14px 18px', 
          borderRadius: '8px',
          border: '1px solid #00e5ff',
          background: 'linear-gradient(90deg, rgba(0,229,255,0.06) 0%, rgba(20,24,33,0.95) 100%)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#00e5ff' }}>
              [AI DENETİMİ] PORTFÖY VE RİSK DENETİM RAPORU
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Aracı kurum hedeflerine ve teknik stop seviyelerine göre portföyünüzün beklenen getirisi ve risk analizi
            </div>
          </div>

          <button
            onClick={runPortfolioAudit}
            disabled={auditLoading || holdings.length === 0}
            className="action-button"
            style={{
              background: '#00e5ff',
              color: '#000',
              fontWeight: '900',
              padding: '6px 14px',
              fontSize: '11px',
              border: 'none',
              cursor: holdings.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {auditLoading ? 'DENETLENİYOR...' : 'PORTFÖYÜ ANALİZ ET'}
          </button>
        </div>

        {/* Audit Results */}
        {auditResult && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '8px', fontSize: '12px' }}>
              <span style={{ color: 'var(--color-up)', fontWeight: 'bold' }}>
                Beklenen Konsensüs Getiri: +%{auditResult.weighted_upside_pct}%
              </span>
              {auditResult.strong_holdings?.length > 0 && (
                <span style={{ color: 'var(--color-up)' }}>
                  Güçlü Hisseler: {auditResult.strong_holdings.join(', ')}
                </span>
              )}
              {auditResult.risk_holdings?.length > 0 && (
                <span style={{ color: 'var(--color-red)' }}>
                  [DİKKAT] Riskli / Düşüştekiler: {auditResult.risk_holdings.join(', ')}
                </span>
              )}
            </div>

            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--text-primary)', lineHeight: '1.6' }}>
              {auditResult.action_bullets?.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Main content: Table + Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '15px', alignItems: 'start' }}>
        {/* Holdings Table */}
        <div className="panel">
          <div className="panel-header" style={{ color: 'var(--text-highlight)' }}>POZİSYONLAR</div>
          <div className="panel-content">
            {holdings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '10px', color: 'var(--text-muted)' }}>[ PORTFÖYÜNÜZ BOŞ ]</div>
                <p>Kayıtlı hisse senedi bulunamadı.</p>
                <p style={{ fontSize: '11px', marginTop: '10px' }}>Yukarıdaki "[ + HİSSE EKLE ]" butonuna tıklayarak ilk hissenizi ekleyin.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>TICKER</th>
                    <th>ADET</th>
                    <th>MALİYET</th>
                    <th>GÜNCEL FİYAT</th>
                    <th>PİYASA DEĞERİ</th>
                    <th>KÂR / ZARAR</th>
                    <th>AĞIRLIK</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioData.rows.map(r => (
                    <tr key={r.ticker} className="row-hoverable">
                      <td style={{ textAlign: 'center' }}>
                        <ImageWithFallback
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${r.ticker}.png`}
                          alt={r.ticker}
                          fallbackName={r.ticker}
                          size={28}
                          style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        <Link to={`/hisse/${r.ticker}`} className="ticker-link text-highlight" style={{ fontSize: '13px' }}>{r.ticker}</Link>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{r.name}</div>
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{r.quantity.toLocaleString('tr-TR')}</td>
                      <td style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(r.avgCost)}</td>
                      <td style={{ fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(r.livePrice)}
                        {r.changePct !== 0 && (
                          <span style={{
                            color: r.changePct > 0 ? 'var(--color-up)' : 'var(--color-red)',
                            fontSize: '11px', marginLeft: '5px'
                          }}>
                            {r.changePct > 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 'bold', color: 'var(--color-cyan)', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(r.marketValue)}</td>
                      <td style={{
                        fontWeight: 'bold',
                        color: r.pnl >= 0 ? 'var(--color-up)' : 'var(--color-red)',
                        fontSize: '13px',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {r.pnl >= 0 ? '+' : ''}{formatCurrency(r.pnl)}
                        <div style={{ fontSize: '11px' }}>
                          ({r.pnlPct >= 0 ? '+' : ''}{r.pnlPct.toFixed(2)}%)
                        </div>
                      </td>
                      <td style={{ color: 'var(--color-warning)', fontWeight: 'bold', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                        {r.weight.toFixed(1)}%
                      </td>
                      <td>
                        <button
                          onClick={() => removeHolding(r.ticker)}
                          className="btn-read"
                          style={{ color: 'var(--color-red)', borderColor: 'var(--color-red)', fontSize: '11px', padding: '3px 8px' }}
                        >
                          [SİL]
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Weight Distribution and Trend Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {pieData.length > 0 && (
            <div className="panel">
              <div className="panel-header" style={{ color: 'var(--color-warning)' }}>AĞIRLIK DAĞILIMI</div>
              <div className="panel-content">
                <div style={{ width: '100%', height: '220px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        dataKey="value"
                        paddingAngle={2}
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={false}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => [`${value}%`, 'Ağırlık']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', fontSize: '11px' }}>
                  {pieData.map((item, index) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS[index % COLORS.length] }}></div>
                      <span className="text-muted">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {equityCurve.length > 0 && (
            <div className="panel">
              <div className="panel-header" style={{ color: 'var(--color-cyan)' }}>PORTFOLIO TREND (30D GERÇEK ZAMANLI)</div>
              <div className="panel-content">
                <div style={{ width: '100%', height: '200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityCurve}>
                      <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        itemStyle={{ color: 'var(--color-cyan)', fontWeight: 'bold' }}
                        formatter={(val) => [`${val.toLocaleString('tr-TR')} ₺`, 'Değer']}
                      />
                      <Line type="monotone" dataKey="value" stroke="var(--color-cyan)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '10px' }}>
                  * Portföy değeriniz geçmiş işlemlere göre hesaplanmıştır.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
          Fiyat verileri yükleniyor...
        </div>
      )}
      </div>
    </PageContainer>
  );
}