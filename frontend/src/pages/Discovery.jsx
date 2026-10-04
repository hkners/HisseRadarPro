import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteStar from '../components/common/FavoriteStar';
import PageContainer from '../components/common/PageContainer';

export default function Discovery() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [minPotential, setMinPotential] = useState(50);
    const [minCount, setMinCount] = useState(3);
    const [timeframe, setTimeframe] = useState(30);
    const [requireModel, setRequireModel] = useState(false);

    const { favorites } = useFavorites();

    useEffect(() => {
        setLoading(true);
        const query = timeframe > 0 ? `?days=${timeframe}` : '';
        fetch(`${import.meta.env.VITE_API_URL}/screener${query}`)
            .then(res => res.json())
            .then(json => {
                setData(json);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [timeframe]);

    const activeList = useMemo(() => {
        return data.filter(row => {
            const meetsPotential = typeof row.upside_potential === 'number' && row.upside_potential >= minPotential;
            const meetsCount = row.count >= minCount;
            const meetsModel = requireModel ? row.is_model === true : true;
            return meetsPotential && meetsCount && meetsModel;
        }).sort((a,b) => (b.upside_potential || 0) - (a.upside_potential || 0));
    }, [data, minPotential, minCount, requireModel]);

    return (
        <PageContainer
            title="Hisse Keşif"
            badge={{ label: `${activeList.length} EŞLEŞEN` }}
            subtitle="Potansiyeli, kurum sayısını ve model portföy üyeliğini birlikte filtrele."
        >
            <div className="flex-row" style={{ flex: 1, minHeight: 0, gap: '10px' }}>
                {/* Left Panel: Filter Controls */}
                <div className="panel" style={{ width: '380px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>FİLTRE KRİTERLERİ</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>MİN. %{minPotential} POTANSİYEL</span>
                    </div>
                    <div className="panel-content" style={{ padding: '10px', overflowY: 'auto' }}>
                        {/* Filters Section */}
                        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '10px', border: '1px solid var(--border-color)' }}>
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-highlight)' }}>RAPOR TARİHİ (ZAMAN DİLİMİ)</span>
                                </div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    {[ {label: 'SON 1 AY', val: 30}, {label: 'SON 3 AY', val: 90}, {label: 'SON 6 AY', val: 180}, {label: 'TÜMÜ', val: 0} ].map(tf => (
                                        <button 
                                            key={tf.val}
                                            onClick={() => setTimeframe(tf.val)}
                                            style={{
                                                flex: 1, padding: '4px 0', fontSize: '9.5px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px',
                                                background: timeframe === tf.val ? 'var(--color-neutral)' : 'var(--bg-secondary)',
                                                color: timeframe === tf.val ? '#000' : 'var(--text-muted)',
                                                border: timeframe === tf.val ? '1px solid var(--color-neutral)' : '1px solid var(--border-color)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {tf.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-highlight)' }}>MİNİMUM POTANSİYEL (%)</span>
                                <span style={{ color: 'var(--color-cyan)', fontWeight: 'bold', fontSize: '11px' }}>%{minPotential}</span>
                            </div>
                            <input 
                                type="range" min="10" max="200" step="5" 
                                value={minPotential} 
                                onChange={(e) => setMinPotential(Number(e.target.value))} 
                                style={{ width: '100%', cursor: 'pointer', marginBottom: '12px' }}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-highlight)' }}>MİNİMUM RAPOR SAYISI</span>
                                <span style={{ color: 'var(--color-warning)', fontWeight: 'bold', fontSize: '11px' }}>{minCount} Rapor</span>
                            </div>
                            <input 
                                type="range" min="1" max="15" step="1" 
                                value={minCount} 
                                onChange={(e) => setMinCount(Number(e.target.value))} 
                                style={{ width: '100%', cursor: 'pointer', marginBottom: '12px' }}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-highlight)' }}>SADECE MODEL PORTFÖY</span>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={requireModel}
                                        onChange={(e) => setRequireModel(e.target.checked)}
                                        style={{ display: 'none' }}
                                    />
                                    <div style={{
                                        width: '36px', height: '18px', background: requireModel ? 'var(--color-neutral)' : 'var(--bg-secondary)',
                                        borderRadius: '9px', position: 'relative', border: '1px solid var(--border-color)', transition: 'background 0.3s'
                                    }}>
                                        <div style={{
                                            width: '14px', height: '14px', background: '#fff', borderRadius: '50%',
                                            position: 'absolute', top: '1px', left: requireModel ? '19px' : '2px', transition: 'left 0.3s'
                                        }}></div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-highlight" style={{ textAlign: 'center', padding: '30px', fontSize: '11px' }}>ANALİZ YAPILIYOR...</div>
                        ) : (
                            <div style={{ padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>FİLTREYE UYGUN</div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{activeList.length} HİSSE</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Results */}
                <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>KESİŞEN HİSSELER</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{activeList.length} SONUÇ</span>
                    </div>
                    <div className="panel-content table-responsive" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                        {activeList.length === 0 ? (
                            <div className="text-muted" style={{ textAlign: 'center', padding: '50px', fontSize: '11px' }}>
                                {loading ? "BEKLENİYOR..." : "BU KESİŞİMDE HİÇBİR HİSSE BULUNAMADI."}
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '32px' }}></th>
                                        <th>TICKER</th>
                                        <th style={{ textAlign: 'right' }}>UPSIDE POTENTIAL</th>
                                        <th style={{ textAlign: 'center' }}>REPORT COUNT</th>
                                        <th style={{ textAlign: 'center' }}>DISTRIBUTION</th>
                                        <th style={{ textAlign: 'center' }}>MODEL PORTFÖY</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeList.map(row => {
                                        return (
                                            <tr key={row.ticker} className="row-hoverable">
                                                <td style={{ textAlign: 'center' }}>
                                                    <ImageWithFallback 
                                                        src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${row.ticker}.png`} 
                                                        alt={row.ticker} 
                                                        fallbackName={row.ticker}
                                                        size={24}
                                                        style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                                                    />
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <FavoriteStar ticker={row.ticker} style={{ fontSize: '12px' }} />
                                                        <Link to={`/hisse/${row.ticker}`} className="ticker-link text-highlight" style={{ fontWeight: 'bold' }}>
                                                            {row.ticker}
                                                        </Link>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        {row.company || row.ticker}
                                                    </div>
                                                </td>
                                                <td style={{ fontWeight: 'bold', color: 'var(--color-up)', textAlign: 'right' }}>
                                                    +{row.upside_potential.toFixed(2)}%
                                                </td>
                                                <td style={{ color: 'var(--color-warning)', fontWeight: 'bold', textAlign: 'center' }}>
                                                    {row.count}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                        {row.ratings?.AL > 0 && <span style={{ background: 'rgba(63, 138, 107, 0.15)', color: 'var(--positive)', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold', border: '1px solid rgba(63, 138, 107, 0.3)' }}>{row.ratings.AL} AL</span>}
                                                        {row.ratings?.TUT > 0 && <span style={{ background: 'rgba(201, 136, 58, 0.15)', color: 'var(--warning)', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold', border: '1px solid rgba(201, 136, 58, 0.3)' }}>{row.ratings.TUT} TUT</span>}
                                                        {row.ratings?.SAT > 0 && <span style={{ background: 'rgba(192, 82, 78, 0.15)', color: 'var(--negative)', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold', border: '1px solid rgba(192, 82, 78, 0.3)' }}>{row.ratings.SAT} SAT</span>}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center', color: row.is_model ? 'var(--color-up)' : 'var(--text-muted)', fontWeight: 'bold', fontSize: '10px' }}>
                                                    {row.is_model ? "EVET" : "HAYIR"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
