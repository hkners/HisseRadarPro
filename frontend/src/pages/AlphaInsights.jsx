import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import FavoriteStar from '../components/common/FavoriteStar';
import PageContainer from '../components/common/PageContainer';
import { usePolling } from '../hooks/usePolling';
import { useFavorites } from '../hooks/useFavorites';
import { BIST30, BIST100 } from '../utils/bistIndices';
import { AlertTriangle } from 'lucide-react';

export default function AlphaInsights() {
    const { data, loading: loadingScreener } = usePolling(`${import.meta.env.VITE_API_URL}/alpha/screener`, 0);
    const screenerData = data || [];
    
    const [backtestData, setBacktestData] = useState(null);
    const [loadingBacktest, setLoadingBacktest] = useState(false);
    const [view, setView] = useState('SCREENER'); 
    
    const [backtestMetric, setBacktestMetric] = useState('ALPHA');
    const [backtestCondition, setBacktestCondition] = useState('GREATER');
    const [backtestThreshold, setBacktestThreshold] = useState(70);
    const [backtestTickers, setBacktestTickers] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;
    const [expandedRows, setExpandedRows] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [quickFilter, setQuickFilter] = useState('ALL');
    const { favorites } = useFavorites();

    const filteredData = screenerData.filter(item => {
        const matchesSearch = item.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (item.company_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        if (quickFilter === 'STRONG_BUY') {
            return (item.composite_score || 0) >= 70;
        } else if (quickFilter === 'FAVORITES') {
            return favorites.includes(item.ticker);
        } else if (quickFilter === 'BIST30') {
            return BIST30.includes(item.ticker);
        } else if (quickFilter === 'BIST100') {
            return BIST100.includes(item.ticker);
        }
        return true;
    });

    const runBacktest = (days) => {
        setLoadingBacktest(true);
        setView('BACKTEST');
        const url = `${import.meta.env.VITE_API_URL}/alpha/backtest?days=${days}&metric=${backtestMetric}&condition=${backtestCondition}&threshold=${backtestThreshold}&tickers=${encodeURIComponent(backtestTickers)}`;
        fetch(url)
            .then(res => res.json())
            .then(json => {
                if (json && json.trades) {
                    setBacktestData(json);
                } else {
                    console.error("Backtest API did not return valid data:", json);
                    setBacktestData(null);
                }
                setLoadingBacktest(false);
            })
            .catch(err => {
                console.error(err);
                setBacktestData(null);
                setLoadingBacktest(false);
            });
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'var(--positive)'; 
        if (score >= 60) return 'var(--gold)'; 
        if (score >= 40) return 'var(--warning)'; 
        if (score >= 20) return 'var(--negative)'; 
        return 'var(--negative)'; 
    };

    const renderProgressBar = (score, label) => {
        const color = getScoreColor(score);
        return (
            <div style={{ width: '100%', marginBottom: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
                    <span>{label}</span>
                    <span style={{ color }}>{score.toFixed(1)}</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '2px' }}></div>
                </div>
            </div>
        );
    };

    const headerRight = (
        <div style={{ display: 'flex', gap: '6px' }}>
            <button 
                className="action-button"
                onClick={() => setView('SCREENER')}
                style={{ 
                    background: view === 'SCREENER' ? 'var(--color-neutral)' : 'transparent', 
                    color: view === 'SCREENER' ? '#000' : 'var(--text-highlight)',
                    borderColor: view === 'SCREENER' ? 'var(--color-neutral)' : 'var(--border-color)',
                    fontWeight: 'bold'
                }}
            >
                Kantitatif puanlama
            </button>
            <button 
                className="action-button"
                onClick={() => { if (!backtestData) runBacktest(30); else setView('BACKTEST'); }}
                style={{ 
                    background: view === 'BACKTEST' ? 'var(--color-neutral)' : 'transparent', 
                    color: view === 'BACKTEST' ? '#000' : 'var(--text-highlight)',
                    borderColor: view === 'BACKTEST' ? 'var(--color-neutral)' : 'var(--border-color)',
                    fontWeight: 'bold'
                }}
            >
                Geriye dönük test
            </button>
        </div>
    );

    return (
        <PageContainer 
            title="Alpha Insights"
            badge={{
                label: `${filteredData.length} HİSSE`,
                background: 'rgba(200, 162, 74, 0.15)',
                color: 'var(--color-cyan)',
                borderColor: 'rgba(200, 162, 74, 0.35)'
            }}
            subtitle="Tüm BIST'i teknik %30, temel %30 ve kurum görüşü %40 ağırlıkla sıralayan çok faktörlü skor."
            headerRight={headerRight}
        >
            <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
                <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>
                    {view === 'SCREENER' && (
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                            {/* Controls and Filters Ribbon */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Hisse / Şirket Ara..." 
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                        style={{ 
                                            width: '220px',
                                            height: '30px',
                                            padding: '4px 10px', 
                                            background: 'var(--bg-secondary)', 
                                            border: '1px solid var(--border-color)', 
                                            color: 'var(--text-primary)',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            outline: 'none'
                                        }}
                                    />
                                    <button 
                                        onClick={() => setQuickFilter('ALL')} 
                                        className={`action-button ${quickFilter === 'ALL' ? 'active' : ''}`}
                                    >
                                        Tümü
                                    </button>
                                    <button 
                                        onClick={() => setQuickFilter('STRONG_BUY')} 
                                        className={`action-button ${quickFilter === 'STRONG_BUY' ? 'active-green' : ''}`}
                                    >
                                        Güçlü AL
                                    </button>
                                    <button 
                                        onClick={() => setQuickFilter('FAVORITES')} 
                                        className={`action-button ${quickFilter === 'FAVORITES' ? 'active-warning' : ''}`}
                                    >
                                        Favoriler
                                    </button>
                                    <button 
                                        onClick={() => setQuickFilter('BIST30')} 
                                        className={`action-button ${quickFilter === 'BIST30' ? 'active' : ''}`}
                                    >
                                        BIST 30
                                    </button>
                                    <button 
                                        onClick={() => setQuickFilter('BIST100')} 
                                        className={`action-button ${quickFilter === 'BIST100' ? 'active' : ''}`}
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
                                            <th style={{ width: '17%', textAlign: 'left' }}>HİSSE</th>
                                            <th style={{ width: '9%', textAlign: 'right' }}>FİYAT (TL)</th>
                                            <th style={{ width: '12%', textAlign: 'center' }}>SİNYAL</th>
                                            <th style={{ width: '10%', textAlign: 'center' }}>ALPHA SCORE</th>
                                            <th style={{ width: '13%', textAlign: 'left' }}>TEKNİK SKOR (%30)</th>
                                            <th style={{ width: '13%', textAlign: 'left' }}>TEMEL SKOR (%30)</th>
                                            <th style={{ width: '13%', textAlign: 'left' }}>BEKLENTİ SKORU (%40)</th>
                                            <th style={{ width: '9%', textAlign: 'center' }}>İŞLEM</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingScreener ? (
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
                                                    <td style={{ textAlign: 'right' }}><div className="skeleton-bar" style={{ width: '50px', height: '16px', marginLeft: 'auto' }} /></td>
                                                    <td style={{ textAlign: 'center' }}><div className="skeleton-bar" style={{ width: '65px', height: '20px', margin: '0 auto' }} /></td>
                                                    <td style={{ textAlign: 'center' }}><div className="skeleton-bar" style={{ width: '45px', height: '20px', margin: '0 auto' }} /></td>
                                                    <td><div className="skeleton-bar" style={{ width: '100%', height: '18px' }} /></td>
                                                    <td><div className="skeleton-bar" style={{ width: '100%', height: '18px' }} /></td>
                                                    <td><div className="skeleton-bar" style={{ width: '100%', height: '18px' }} /></td>
                                                    <td style={{ textAlign: 'center' }}><div className="skeleton-bar" style={{ width: '50px', height: '20px', margin: '0 auto' }} /></td>
                                                </tr>
                                            ))
                                        ) : (
                                            filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((row) => (
                                                <tr key={row.ticker} className="row-hoverable">
                                                    <td style={{ textAlign: 'center', width: '4.5%' }}>
                                                        <ImageWithFallback 
                                                            src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${row.ticker}.png`} 
                                                            alt={row.ticker} 
                                                            fallbackName={row.ticker}
                                                            size={26}
                                                            style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'left', width: '18%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <FavoriteStar ticker={row.ticker} size={15} />
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <Link to={`/hisse/${row.ticker}`} className="ticker-link" style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                                                    {row.ticker}
                                                                </Link>
                                                                {BIST30.includes(row.ticker) && <span className="badge badge-subtle" style={{ fontSize: '9px', padding: '1px 3px' }}>B30</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                                                        {row.price !== null && row.price !== undefined ? `${Number(row.price).toFixed(2)}` : 'N/A'}
                                                    </td>
                                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '96px' }}>
                                                            <span style={{
                                                                width: '74px',
                                                                textAlign: 'center',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                background: 'rgba(0,0,0,0.3)',
                                                                border: `1px solid ${getScoreColor(row.alpha_score)}`,
                                                                color: getScoreColor(row.alpha_score),
                                                                padding: '2px 0',
                                                                borderRadius: '4px',
                                                                fontSize: '10px',
                                                                fontWeight: 'bold',
                                                                letterSpacing: '0.3px',
                                                                boxSizing: 'border-box'
                                                            }}>
                                                                {row.signal}
                                                            </span>
                                                            {row.is_disagreeing && (
                                                                <span 
                                                                    title={row.disagreement_reason || `Alpha: ${row.signal} (${row.alpha_score.toFixed(0)}p) vs Karar: ${row.conviction_decision} (${row.conviction_score}p)`}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        right: '0px',
                                                                        color: 'var(--warning)',
                                                                        fontSize: '11px',
                                                                        cursor: 'help',
                                                                        lineHeight: 1
                                                                    }}
                                                                >
                                                                    <AlertTriangle size={12} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold', color: getScoreColor(row.alpha_score), fontVariantNumeric: 'tabular-nums' }}>
                                                        {row.alpha_score.toFixed(1)}
                                                    </td>
                                                    <td>{renderProgressBar(row.ta_score, 'Teknik (RSI, MACD)')}</td>
                                                    <td>{renderProgressBar(row.fa_score, 'Temel (F/K, PD/DD, ROE)')}</td>
                                                    <td>{renderProgressBar(row.sentiment_score, 'Aracı Kurum Raporları')}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <Link 
                                                            to={`/hisse/${row.ticker}`} 
                                                            className="action-button" 
                                                            style={{ padding: '3px 8px', fontSize: '10.5px' }}
                                                        >
                                                            Kokpit
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                        {!loadingScreener && filteredData.length === 0 && (
                                            <tr>
                                                <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                                    Analiz edilecek hisse bulunamadı. Lütfen arama kriterinizi değiştirin.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                                
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
                                <div style={{ color: 'var(--text-muted)' }}>
                                    Gösterilen: {filteredData.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredData.length)} / Toplam: {filteredData.length}
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
                                        Sayfa {currentPage} / {Math.ceil(filteredData.length / itemsPerPage) || 1}
                                    </span>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.min(p + 1, Math.ceil(filteredData.length / itemsPerPage)))} 
                                        disabled={currentPage >= Math.ceil(filteredData.length / itemsPerPage)}
                                        className="action-button"
                                        style={{ opacity: currentPage >= Math.ceil(filteredData.length / itemsPerPage) ? 0.4 : 1, cursor: currentPage >= Math.ceil(filteredData.length / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                                    >
                                        Sonraki &gt;
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'BACKTEST' && (
                        loadingBacktest ? (
                            <div style={{ textAlign: 'center', padding: '50px', color: 'var(--color-cyan)' }}>Tarihsel Simülasyon Çalıştırılıyor...</div>
                        ) : backtestData && (
                            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '20px' }}>
                                <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '15px', flexShrink: 0, overflowY: 'auto' }}>
                                    <div className="panel" style={{ border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                                        <div className="panel-header text-muted">ÖZET (SON {backtestData.period_days} GÜN)</div>
                                        <div className="panel-content">
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Başarı Oranı (Kârlı İşlemler)</div>
                                            <div style={{ fontSize: '32px', fontWeight: 'bold', color: backtestData.win_rate_pct >= 50 ? 'var(--color-up)' : 'var(--color-red)' }}>
                                                {backtestData.win_rate_pct}%
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '15px', marginBottom: '5px' }}>Ortalama Getiri</div>
                                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: backtestData.avg_return_pct >= 0 ? 'var(--color-up)' : 'var(--color-red)' }}>
                                                {backtestData.avg_return_pct >= 0 ? '+' : ''}{backtestData.avg_return_pct}%
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '15px', marginBottom: '5px' }}>Toplam Sinyal Sayısı</div>
                                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-warning)' }}>
                                                {backtestData.total_trades}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="panel" style={{ border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                                        <div className="panel-header text-muted">TEST PARAMETRELERİ</div>
                                        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div>
                                                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Metrik</label>
                                                <select value={backtestMetric} onChange={e => setBacktestMetric(e.target.value)} style={{ width: '100%', padding: '5px', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                                                    <option value="ALPHA">Alpha Skoru</option>
                                                    <option value="RSI">RSI (14)</option>
                                                    <option value="SMA">Fiyat vs SMA (20) %</option>
                                                    <option value="POTENTIAL">Hedef Potansiyeli (%)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Koşul</label>
                                                <select value={backtestCondition} onChange={e => setBacktestCondition(e.target.value)} style={{ width: '100%', padding: '5px', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                                                    <option value="GREATER">Büyüktür (&gt;)</option>
                                                    <option value="LESS">Küçüktür (&lt;)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Değer (Threshold)</label>
                                                <input type="number" value={backtestThreshold} onChange={e => setBacktestThreshold(Number(e.target.value))} style={{ width: '100%', padding: '5px', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Test Edilecek Hisseler (İsteğe Bağlı)</label>
                                                <input type="text" placeholder="Örn: THYAO, ASELS, FROTO" value={backtestTickers} onChange={e => setBacktestTickers(e.target.value)} style={{ width: '100%', padding: '5px', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '3px' }}>Boş bırakırsanız tüm BIST test edilir.</div>
                                            </div>
                                        </div>
                                    </div>

                                    <button onClick={() => runBacktest(7)} className="btn-read">1 Haftalık Test Et</button>
                                    <button onClick={() => runBacktest(30)} className="btn-read">1 Aylık Test Et</button>
                                    <button onClick={() => runBacktest(90)} className="btn-read">3 Aylık Test Et</button>
                                </div>
                                
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>HİSSE / SEKTÖR</th>
                                                <th>ALIM TARİHİ</th>
                                                <th>TEST METRİK DEĞERİ</th>
                                                <th>ARACI KURUM (SAYI / POTANSİYEL)</th>
                                                <th>SON RAPOR TARİHİ</th>
                                                <th>ALIM FİYATI</th>
                                                <th>MEVCUT FİYAT</th>
                                                <th style={{ textAlign: 'right' }}>GETİRİ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {backtestData.trades.map((t, idx) => (
                                                <tr key={idx} className="row-hoverable">
                                                    <td>
                                                        <div style={{ fontWeight: 'bold' }}>{t.ticker}</div>
                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.sector}</div>
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)' }}>{t.buy_date}</td>
                                                    <td style={{ fontWeight: 'bold', color: 'var(--color-cyan)' }}>{t.hist_alpha}</td>
                                                    <td>
                                                        {t.broker_count > 0 ? (
                                                            <>
                                                                <span style={{ fontWeight: 'bold' }}>{t.broker_count} Kurum</span>
                                                                <div style={{ fontSize: '11px', color: t.avg_potential > 0 ? 'var(--color-up)' : 'var(--color-red)' }}>
                                                                    Ort. Potansiyel: %{t.avg_potential}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Rapor Yok</span>
                                                        )}
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)' }}>{t.latest_report_date}</td>
                                                    <td>{(t.buy_price || 0).toLocaleString('tr-TR')} ₺</td>
                                                    <td>{(t.sell_price || 0).toLocaleString('tr-TR')} ₺</td>
                                                    <td style={{ fontWeight: 'bold', textAlign: 'right', color: t.return_pct >= 0 ? 'var(--color-up)' : 'var(--color-red)' }}>
                                                        {t.return_pct >= 0 ? '+' : ''}{t.return_pct}%
                                                    </td>
                                                </tr>
                                            ))}
                                            {backtestData.trades.length === 0 && (
                                                <tr>
                                                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                                        Bu dönemde belirlediğiniz kriterleri sağlayan hisse bulunamadı.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        </PageContainer>
    );
}
