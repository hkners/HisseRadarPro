import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts';
import ImageWithFallback from '../components/ImageWithFallback';

const COLORS = ['#00ff66', '#00e5ff', '#ffaa00', '#ff0055', '#ff00ff', '#ffcc00', '#00ff00', '#ff3333'];

export default function Portfolio() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const saved = localStorage.getItem('hisseRadarPortfolio');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCost, setNewCost] = useState('');

  // Save holdings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('hisseRadarPortfolio', JSON.stringify(holdings));
  }, [holdings]);

  // Fetch live prices
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/stocks`)
      .then(res => res.json())
      .then(data => {
        if (data.stocks) {
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
  }, []);

  const addHolding = () => {
    const ticker = newTicker.trim().toUpperCase();
    const qty = parseFloat(newQuantity);
    const cost = parseFloat(newCost);
    if (!ticker || isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) return;

    // Check if already exists — merge
    const existing = holdings.find(h => h.ticker === ticker);
    if (existing) {
      const totalQty = existing.quantity + qty;
      const totalCost = (existing.quantity * existing.avgCost + qty * cost) / totalQty;
      setHoldings(prev => prev.map(h =>
        h.ticker === ticker
          ? { ...h, quantity: totalQty, avgCost: parseFloat(totalCost.toFixed(2)) }
          : h
      ));
    } else {
      setHoldings(prev => [...prev, {
        ticker,
        quantity: qty,
        avgCost: cost,
        addedAt: new Date().toISOString().split('T')[0],
      }]);
    }

    setNewTicker('');
    setNewQuantity('');
    setNewCost('');
    setShowAddForm(false);
  };

  const removeHolding = (ticker) => {
    setHoldings(prev => prev.filter(h => h.ticker !== ticker));
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
    <div style={{ animation: 'fadeIn 0.5s ease-in' }}>
      {/* Header */}
      <div className="panel" style={{ marginBottom: '15px' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-cyan)' }}>PORTFOLIO MANAGER // KİŞİSEL PORTFÖY YÖNETİCİSİ</span>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-read"
            style={{ fontSize: '11px' }}
          >
            {showAddForm ? '[ İPTAL ]' : '[ + HİSSE EKLE ]'}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="panel" style={{ marginBottom: '15px' }}>
          <div className="panel-header" style={{ color: 'var(--color-up)' }}>YENİ HİSSE EKLE</div>
          <div className="panel-content">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>TICKER</label>
                <input
                  type="text"
                  className="search-box"
                  placeholder="Ör: THYAO"
                  value={newTicker}
                  onChange={e => setNewTicker(e.target.value)}
                  style={{ width: '120px' }}
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
                  style={{ width: '100px' }}
                />
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>MALİYET (TRY)</label>
                <input
                  type="number"
                  className="search-box"
                  placeholder="315.50"
                  step="0.01"
                  value={newCost}
                  onChange={e => setNewCost(e.target.value)}
                  style={{ width: '120px' }}
                />
              </div>
              <button
                onClick={addHolding}
                className="btn-read"
                style={{ padding: '5px 16px', fontSize: '12px', background: 'var(--color-up)', color: '#000', border: 'none', fontWeight: 'bold' }}
              >
                EKLE
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

      {/* Main content: Table + Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '15px', alignItems: 'start' }}>
        {/* Holdings Table */}
        <div className="panel">
          <div className="panel-header" style={{ color: 'var(--text-highlight)' }}>POZİSYONLAR</div>
          <div className="panel-content">
            {holdings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '36px', marginBottom: '15px' }}>📊</div>
                <p>Portföyünüz henüz boş.</p>
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
                        <Link to={`/hisse/${r.ticker}`} className="ticker-link text-highlight">{r.ticker}</Link>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.name}</div>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{r.quantity.toLocaleString('tr-TR')}</td>
                      <td>{formatCurrency(r.avgCost)}</td>
                      <td style={{ fontWeight: 'bold' }}>
                        {formatCurrency(r.livePrice)}
                        {r.changePct !== 0 && (
                          <span style={{
                            color: r.changePct > 0 ? 'var(--color-up)' : 'var(--color-red)',
                            fontSize: '0.7rem', marginLeft: '4px'
                          }}>
                            {r.changePct > 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 'bold', color: 'var(--color-cyan)' }}>{formatCurrency(r.marketValue)}</td>
                      <td style={{
                        fontWeight: 'bold',
                        color: r.pnl >= 0 ? 'var(--color-up)' : 'var(--color-red)',
                      }}>
                        {r.pnl >= 0 ? '+' : ''}{formatCurrency(r.pnl)}
                        <div style={{ fontSize: '0.7rem' }}>
                          ({r.pnlPct >= 0 ? '+' : ''}{r.pnlPct.toFixed(2)}%)
                        </div>
                      </td>
                      <td style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>
                        {r.weight.toFixed(1)}%
                      </td>
                      <td>
                        <button
                          onClick={() => removeHolding(r.ticker)}
                          className="btn-read"
                          style={{ color: 'var(--color-red)', borderColor: 'var(--color-red)', fontSize: '10px' }}
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

        {/* Weight Distribution Chart */}
        {pieData.length > 0 && (
          <div className="panel">
            <div className="panel-header" style={{ color: 'var(--color-warning)' }}>AĞIRLIK DAĞILIMI</div>
            <div className="panel-content">
              <div style={{ width: '100%', height: '250px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={45}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px', fontSize: '11px' }}>
                {pieData.map((item, index) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: COLORS[index % COLORS.length] }}></div>
                    <span className="text-muted">{item.name}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
          Fiyat verileri yükleniyor...
        </div>
      )}
    </div>
  );
}