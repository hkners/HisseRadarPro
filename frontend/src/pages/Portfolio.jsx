import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import { Upload, FileDown } from 'lucide-react';
import { exportTables } from '../utils/download';
import { WeightBar, TickerCell, PillTabs, Chip } from '../components/ui';
import ImportCsvModal from '../components/ImportCsvModal';

const ACCOUNT_KEY = 'hr.portfolio.account';
const ACCOUNT_TABS = [{ id: 'all', label: 'Tümü' }, { id: 'real', label: 'Gerçek' }, { id: 'paper', label: 'Kâğıt' }];
const ACCOUNT_LABEL = { real: 'Gerçek', paper: 'Kâğıt' };
const readAccount = () => { try { return localStorage.getItem(ACCOUNT_KEY) || 'all'; } catch { return 'all'; } };
import ImageWithFallback from '../components/ImageWithFallback';
import { getCachedData, fetchWithCache } from '../utils/apiCache';
import PageContainer from '../components/common/PageContainer';
import { fmtPct } from '../utils/format';


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

  const [account, setAccountState] = useState(readAccount);
  const setAccount = (a) => { setAccountState(a); try { localStorage.setItem(ACCOUNT_KEY, a); } catch { /* storage unavailable */ } };
  // Where new positions go: the open tab, or the real account when viewing both.
  const writeAccount = account === 'all' ? 'real' : account;
  const [newAccount, setNewAccount] = useState(writeAccount);
  const [showImport, setShowImport] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [notice, setNotice] = useState('');
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
  const [realized, setRealized] = useState(0);
  const [formError, setFormError] = useState('');
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
      body: JSON.stringify({ transactions, account: account === 'all' ? 'paper' : account })
    })
      .then(res => {
        if (!res.ok) throw new Error('Hisseler portföye eklenirken hata oluştu.');
        return res.json();
      })
      .then(data => {
        setBatchAdding(false);
        setBuilderSuccess(`${data.count || toAdd.length} hisse ${account === 'real' ? 'gerçek' : 'kâğıt'} hesaba eklendi.`);
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
    const q = account === 'all' ? '' : `?account=${account}`;
    fetch(`${import.meta.env.VITE_API_URL}/portfolio${q}`)
      .then(res => res.json())
      .then(data => {
        const mapped = data.map(item => ({
          ticker: item.ticker,
          account: item.account || 'real',
          quantity: item.quantity,
          avgCost: item.cost,
          serverPrice: item.live_price,
          priceSource: item.price_source,
          realizedPnl: item.realized_pnl || 0,
          costReal: item.cost_real_today,
          costUsd: item.cost_usd,
          usdtry: item.usdtry,
        }));
        setHoldings(mapped);
      })
      .catch(console.error);

    fetch(`${import.meta.env.VITE_API_URL}/portfolio/realized${q}`)
      .then(res => res.json())
      .then(d => setRealized(typeof d?.total === 'number' ? d.total : 0))
      .catch(() => setRealized(0));
      
    fetch(`${import.meta.env.VITE_API_URL}/portfolio/equity-curve?days=30${account === 'all' ? '' : `&account=${account}`}`)
      .then(res => res.json())
      .then(data => {
        if(data && Array.isArray(data)) setEquityCurve(data);
      })
      .catch(console.error);
  }, [account]);

  useEffect(() => {
    fetchPortfolio();
    setNewAccount(account === 'all' ? 'real' : account);
    setPendingDelete(null);
  }, [fetchPortfolio, account]);

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
    if (!ticker || isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) {
      setFormError('Hisse, sıfırdan büyük adet ve fiyat gir.');
      return;
    }
    setFormError('');

    fetch(`${import.meta.env.VITE_API_URL}/portfolio/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, tx_type: txType, quantity: qty, price: cost, tx_date: newDate, account: newAccount })
    })
    .then(async res => {
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === 'string' ? d.detail : 'İşlem kaydedilemedi.');
      }
      return res.json();
    })
    .then(() => {
      fetchPortfolio();
      setNewTicker('');
      setNewQuantity('');
      setNewCost('');
      setShowAddForm(false);
    })
    .catch(e => setFormError(e.message));
  };

  // Deleting removes every transaction of the ticker in that account, so it needs a second click.
  const removeHolding = (ticker, acc) => {
    fetch(`${import.meta.env.VITE_API_URL}/portfolio/${ticker}?account=${acc}`, {
      method: 'DELETE'
    })
    .then(() => { setPendingDelete(null); fetchPortfolio(); })
    .catch(console.error);
  };

  // Calculate portfolio metrics
  const portfolioData = useMemo(() => {
    let totalCostBasis = 0;
    let totalMarketValue = 0;
    let totalRealCost = 0;
    let totalUsdCost = 0;
    let usdtry = null;
    let altComplete = true;
    const rows = holdings.map(h => {
      const live = livePrices[h.ticker];
      // Live quote first, then the server's price (live or last stored close). A position with no
      // price at all is left out of the totals instead of being shown as a 100% loss.
      const livePrice = live?.price || h.serverPrice || 0;
      const priceStale = !live?.price && !!h.serverPrice && h.priceSource !== 'live';
      const costBasis = h.quantity * h.avgCost;
      const hasPrice = livePrice > 0;
      const marketValue = hasPrice ? h.quantity * livePrice : 0;
      const pnl = hasPrice ? marketValue - costBasis : null;
      const pnlPct = hasPrice && costBasis > 0 ? (pnl / costBasis) * 100 : null;
      if (hasPrice) {
        totalCostBasis += costBasis;
        totalMarketValue += marketValue;
        if (h.costReal != null && h.costUsd != null && h.usdtry) {
          totalRealCost += h.quantity * h.costReal;
          totalUsdCost += h.quantity * h.costUsd;
          usdtry = h.usdtry;
        } else {
          altComplete = false;
        }
      }
      return {
        ...h,
        livePrice,
        hasPrice,
        priceStale,
        changePct: live?.change_pct || 0,
        name: live?.name || h.ticker,
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

    // Against inflation (cost in today's prices) and in dollars (cost at each purchase day's USD/TRY).
    const realPnl = altComplete && totalRealCost > 0 ? totalMarketValue - totalRealCost : null;
    const usdValue = altComplete && usdtry ? totalMarketValue / usdtry : null;
    const usdPnl = usdValue != null && totalUsdCost > 0 ? usdValue - totalUsdCost : null;
    return {
      rows, totalCostBasis, totalMarketValue, totalPnl, totalPnlPct,
      realPnl, realPnlPct: realPnl != null ? (realPnl / totalRealCost) * 100 : null,
      usdPnl, usdPnlPct: usdPnl != null ? (usdPnl / totalUsdCost) * 100 : null, usdValue,
    };
  }, [holdings, livePrices]);

  // Pie chart data for weight distribution
  const pieData = useMemo(() => {
    return portfolioData.rows
      .filter(r => r.marketValue > 0)
      .map(r => ({ name: r.ticker, value: parseFloat(r.weight.toFixed(1)) }));
  }, [portfolioData]);

  const maxWeight = useMemo(() => Math.max(1, ...portfolioData.rows.map(r => r.weight || 0)), [portfolioData]);

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  return (
    <PageContainer
      title="Portföyüm"
      badge={`${holdings.length} pozisyon`}
      subtitle="Pozisyonların, ağırlıkları ve yapay zekâ risk denetimi."
      statusDot="var(--color-cyan)"
      headerRight={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <PillTabs tabs={ACCOUNT_TABS} value={account} onChange={setAccount} />
          <button className="btn" onClick={() => setShowImport(true)}>
            <Upload size={13} /> CSV içe aktar
          </button>
          <button
            className="btn"
            disabled={!portfolioData.rows.length}
            onClick={() => exportTables('portfoy', `Portföy · ${ACCOUNT_TABS.find(t => t.id === account)?.label}`, [{
              name: 'Pozisyonlar',
              columns: [
                { key: 'ticker', label: 'Hisse' }, { key: 'name', label: 'Şirket' }, { key: 'account_label', label: 'Hesap' },
                { key: 'quantity', label: 'Adet', format: 'num' }, { key: 'avgCost', label: 'Ortalama maliyet', format: 'num' },
                { key: 'livePrice', label: 'Güncel fiyat', format: 'num' }, { key: 'marketValue', label: 'Piyasa değeri', format: 'num' },
                { key: 'pnl', label: 'Kâr / zarar (TL)', format: 'num' }, { key: 'pnlPct', label: 'Kâr / zarar %', format: 'pct100' },
                { key: 'weight', label: 'Ağırlık %', format: 'pct100' },
              ],
              rows: portfolioData.rows.map(r => ({ ...r, account_label: ACCOUNT_LABEL[r.account] })),
            }]).catch(console.error)}
          >
            <FileDown size={13} /> Excel
          </button>
          <button
            onClick={() => {
              setShowBuilder(!showBuilder);
              if (showAddForm) setShowAddForm(false);
            }}
            className="btn btn-outline-gold"
          >
            {showBuilder ? 'Kapat' : 'Önerilen portföy oluştur'}
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showBuilder) setShowBuilder(false);
            }}
            className={showAddForm ? 'btn' : 'btn btn-primary'}
          >
            {showAddForm ? 'İptal' : '+ Hisse ekle'}
          </button>
        </div>
      }
      scrollable={true}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>

      {notice && (
        <div className="notice" style={{ marginBottom: 12 }}>
          <span>{notice}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setNotice('')}>Kapat</button>
        </div>
      )}

      {/* Suggested Portfolio Builder Panel */}
      {showBuilder && (
        <div className="panel" style={{ marginBottom: '15px', border: '1px solid rgba(200, 162, 74, 0.3)', background: 'linear-gradient(180deg, rgba(200, 162, 74, 0.04) 0%, rgba(18, 18, 20, 0.95) 100%)' }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-cyan)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              OTOMATİK PORTFÖY İNŞASI & ÇEŞİTLENDİRME MOTORU
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
                  <option value="conviction_score">HisseRadar skoru</option>
                </select>
              </div>

              <button
                onClick={handleGeneratePortfolio}
                disabled={builderLoading}
                className="btn-read"
                style={{
                  padding: '7px 20px',
                  fontSize: '12px',
                  background: builderLoading ? 'rgba(200, 162, 74, 0.3)' : 'var(--color-cyan)',
                  color: '#000',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: builderLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 12px rgba(200, 162, 74, 0.4)'
                }}
              >
                {builderLoading ? 'HESAPLANIYOR...' : 'PORTFÖY ÜRET '}
              </button>
            </div>

            {builderError && (
              <div style={{ padding: '8px 12px', background: 'rgba(192, 82, 78, 0.15)', border: '1px solid var(--color-red)', color: 'var(--color-red)', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
                {builderError}
              </div>
            )}

            {builderSuccess && (
              <div style={{ padding: '8px 12px', background: 'rgba(63, 138, 107, 0.15)', border: '1px solid var(--color-up)', color: 'var(--color-up)', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
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
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{formatCurrency(suggestedResult.summary.total_budget)} ₺</div>
                  </div>
                  <div style={{ background: 'rgba(63, 138, 107, 0.06)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(63, 138, 107, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-up)' }}>YATIRILAN TUTAR</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-up)' }}>{formatCurrency(suggestedResult.summary.invested_amount)} ₺</div>
                  </div>
                  <div style={{ background: 'rgba(201, 136, 58, 0.06)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(201, 136, 58, 0.2)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--warning)' }}>KALAN BOŞTA NAKİT</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--warning)' }}>{formatCurrency(suggestedResult.summary.remaining_cash)} ₺</div>
                  </div>
                  <div style={{ background: 'rgba(200, 162, 74, 0.06)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(200, 162, 74, 0.2)' }}>
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
                              background: isSelected ? 'rgba(200, 162, 74, 0.03)' : 'transparent',
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
                              <Link to={`/stock/${item.ticker}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
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
                                background: item.score >= 70 ? 'rgba(63, 138, 107, 0.15)' : 'rgba(200, 162, 74, 0.15)',
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
                      background: batchAdding || selectedTickers.size === 0 ? 'rgba(63, 138, 107, 0.2)' : 'var(--color-up)',
                      color: '#000',
                      border: 'none',
                      fontWeight: 'bold',
                      cursor: batchAdding || selectedTickers.size === 0 ? 'not-allowed' : 'pointer',
                      boxShadow: '0 0 15px rgba(63, 138, 107, 0.4)'
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
          <div className="panel-header">Yeni işlem ekle</div>
          <div className="panel-content">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>HESAP</label>
                <select className="search-box" value={newAccount} onChange={e => setNewAccount(e.target.value)} style={{ width: '110px', padding: '4px 8px' }}>
                  <option value="real">Gerçek</option>
                  <option value="paper">Kâğıt</option>
                </select>
              </div>
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
              <button onClick={addHolding} className="btn btn-primary">Kaydet</button>
            </div>
            {formError && <div className="text-down" style={{ fontSize: 12, marginTop: 8 }}>{formError}</div>}
          </div>
        </div>
      )}

      {/* Portfolio Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
        <div className="panel">
          <div className="panel-header text-muted">TOPLAM MALİYET</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
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
          <div className="panel-header text-muted">AÇIK POZİSYON KÂR / ZARAR</div>
          <div className="panel-content" style={{
            fontSize: '20px', fontWeight: 'bold',
            color: portfolioData.totalPnl >= 0 ? 'var(--color-up)' : 'var(--color-red)',
          }}>
            {portfolioData.totalPnl >= 0 ? '+' : ''}{formatCurrency(portfolioData.totalPnl)} ₺
            <span style={{ fontSize: '13px', marginLeft: '8px' }}>
              ({fmtPct(portfolioData.totalPnlPct, 2)})
            </span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header text-muted">ENFLASYONA GÖRE (REEL)</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: portfolioData.realPnl == null ? 'var(--text-muted)' : portfolioData.realPnl >= 0 ? 'var(--color-up)' : 'var(--color-red)' }}>
            {portfolioData.realPnl == null ? '—' : <>{portfolioData.realPnl >= 0 ? '+' : ''}{formatCurrency(portfolioData.realPnl)} ₺ <span style={{ fontSize: 13 }}>({fmtPct(portfolioData.realPnlPct, 2)})</span></>}
            <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>Her alımın maliyeti TÜFE ile bugüne taşınır</div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header text-muted">DOLAR BAZINDA</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: portfolioData.usdPnl == null ? 'var(--text-muted)' : portfolioData.usdPnl >= 0 ? 'var(--color-up)' : 'var(--color-red)' }}>
            {portfolioData.usdPnl == null ? '—' : <>{portfolioData.usdPnl >= 0 ? '+' : ''}${formatCurrency(portfolioData.usdPnl)} <span style={{ fontSize: 13 }}>({fmtPct(portfolioData.usdPnlPct, 2)})</span></>}
            <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>{portfolioData.usdValue != null ? `Portföy değeri $${formatCurrency(portfolioData.usdValue)}` : 'Kur verisi yok'}</div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header text-muted">GERÇEKLEŞMİŞ KÂR / ZARAR</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: realized > 0 ? 'var(--color-up)' : realized < 0 ? 'var(--color-red)' : 'var(--text-primary)' }}>
            {realized > 0 ? '+' : ''}{formatCurrency(realized)} ₺
            <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>Satışlardan, ortalama maliyet yöntemiyle</div>
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
        className="card"
        style={{ marginBottom: '12px', borderColor: 'var(--gold-border)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="card-eyebrow">Yapay zekâ denetimi</div>
            <div className="card-title">Portföy ve risk denetim raporu</div>
            <div className="card-body">
              Kurum hedeflerine ve teknik stop seviyelerine göre portföyünün beklenen getirisi ve riskleri.
            </div>
          </div>

          <button
            onClick={runPortfolioAudit}
            disabled={auditLoading || holdings.length === 0}
            className="btn btn-primary"
          >
            {auditLoading ? 'Denetleniyor…' : 'Portföyü analiz et'}
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
                  Dikkat, riskli / düşüştekiler: {auditResult.risk_holdings.join(', ')}
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
                <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '10px', color: 'var(--text-muted)' }}>Portföyünüz boş</div>
                <p>Kayıtlı hisse senedi bulunamadı.</p>
                <p style={{ fontSize: '11px', marginTop: '10px' }}>Yukarıdaki "+ Hisse ekle" butonuna tıklayarak ilk hissenizi ekleyin.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th style={{ textAlign: 'left' }}>Hisse</th>
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
                    <tr key={`${r.ticker}-${r.account}`} className="row-hoverable">
                      <td style={{ textAlign: 'center' }}>
                        <ImageWithFallback
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${r.ticker}.png`}
                          alt={r.ticker}
                          fallbackName={r.ticker}
                          size={28}
                          style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                      </td>
                      <td style={{ textAlign: 'left', maxWidth: 240 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <TickerCell ticker={r.ticker} name={r.name} />
                          {account === 'all' && <Chip tone={r.account === 'paper' ? 'default' : 'gold'}>{ACCOUNT_LABEL[r.account]}</Chip>}
                        </div>
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{r.quantity.toLocaleString('tr-TR')}</td>
                      <td style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(r.avgCost)}</td>
                      <td style={{ fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                        {r.hasPrice ? formatCurrency(r.livePrice) : <span className="text-muted">Fiyat yok</span>}
                        {r.priceStale && <div className="text-muted" style={{ fontSize: 10, fontWeight: 400 }}>son kapanış</div>}
                        {r.changePct !== 0 && (
                          <span style={{
                            color: r.changePct > 0 ? 'var(--color-up)' : 'var(--color-red)',
                            fontSize: '11px', marginLeft: '5px'
                          }}>
                            {r.changePct > 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{r.hasPrice ? formatCurrency(r.marketValue) : '—'}</td>
                      <td style={{
                        fontWeight: 'bold',
                        color: r.pnl == null ? 'var(--text-muted)' : r.pnl >= 0 ? 'var(--color-up)' : 'var(--color-red)',
                        fontSize: '13px',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {r.pnl == null ? '—' : <>
                          {r.pnl >= 0 ? '+' : ''}{formatCurrency(r.pnl)}
                          <div style={{ fontSize: '11px' }}>
                            ({fmtPct(r.pnlPct, 2)})
                          </div>
                        </>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <WeightBar value={r.weight} max={maxWeight} /> <span style={{ marginLeft: 6 }}>{r.weight.toFixed(1)}%</span>
                      </td>
                      <td>
                        {pendingDelete === `${r.ticker}-${r.account}` ? (
                          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <span className="text-muted" style={{ fontSize: 11 }}>Tüm işlemler silinsin mi?</span>
                            <button className="btn btn-sm" style={{ color: 'var(--negative)', borderColor: 'var(--negative)' }} onClick={() => removeHolding(r.ticker, r.account)}>Sil</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setPendingDelete(null)}>Vazgeç</button>
                          </span>
                        ) : (
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--negative)' }} onClick={() => setPendingDelete(`${r.ticker}-${r.account}`)}>
                            Sil
                          </button>
                        )}
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
              <div className="panel-header">Ağırlık dağılımı</div>
              <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...pieData].sort((a, b) => b.value - a.value).map(item => (
                  <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 46px', alignItems: 'center', gap: 8 }}>
                    <Link to={`/hisse/${item.name}`} className="ticker-link" style={{ fontSize: 12 }}>{item.name}</Link>
                    <span style={{ height: 6, background: 'var(--border-default)', borderRadius: 3, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(item.value / maxWeight) * 100}%`, background: 'var(--gold)', borderRadius: 3 }} />
                    </span>
                    <span className="num" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-primary)' }}>{item.value.toFixed(1)}%</span>
                  </div>
                ))}
                <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>Çubuklar en büyük pozisyona göre ölçeklenir.</div>
              </div>
            </div>
          )}

          {equityCurve.length > 0 && (
            <div className="panel">
              <div className="panel-header">Portföy değeri · son 30 gün</div>
              <div className="panel-content">
                <div style={{ width: '100%', height: '200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityCurve}>
                      <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
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
      <ImportCsvModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        defaultAccount={writeAccount}
        onImported={(count, acc) => { setNotice(`${count} işlem ${acc === 'paper' ? 'kâğıt' : 'gerçek'} hesaba aktarıldı.`); fetchPortfolio(); }}
      />
    </PageContainer>
  );
}