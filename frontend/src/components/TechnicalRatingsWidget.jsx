import React, { useMemo } from 'react';

const TechnicalRatingsWidget = ({ taData, currentPrice }) => {
    if (!taData || !taData.indicators) return null;

    const { summary, indicators, oscillators, moving_averages } = taData;

    // Translation maps
    const textMap = {
        "STRONG_BUY": "GÜÇLÜ AL",
        "BUY": "AL",
        "NEUTRAL": "NÖTR",
        "SELL": "SAT",
        "STRONG_SELL": "GÜÇLÜ SAT"
    };

    const colorMap = {
        "STRONG_BUY": "var(--color-up)",
        "BUY": "var(--color-up)",
        "NEUTRAL": "var(--text-muted)",
        "SELL": "var(--color-down)",
        "STRONG_SELL": "var(--color-down)"
    };

    const gaugeMap = {
        "STRONG_BUY": 100,
        "BUY": 75,
        "NEUTRAL": 50,
        "SELL": 25,
        "STRONG_SELL": 0
    };

    const overallRec = summary.RECOMMENDATION || "NEUTRAL";
    const gaugeScore = gaugeMap[overallRec];
    const rotation = (gaugeScore / 100) * 180 - 90; // -90 to 90

    // Parse counts from oscillators and MA if we can, else just display 0
    // TradingView scanner API returns Recommendation strings, not exact counts for BUY/SELL
    // So we will just show the overall text.
    
    const renderActionBadge = (action) => {
        const bg = action === 'BUY' ? 'var(--color-up)' : action === 'SELL' ? 'var(--color-down)' : 'transparent';
        const color = action === 'NEUTRAL' || action === 'NÖTR' ? 'var(--text-muted)' : '#fff';
        const text = action === 'BUY' ? 'AL' : action === 'SELL' ? 'SAT' : 'NÖTR';
        return (
            <span style={{
                background: bg, color, borderRadius: '3px', width: '28px', textAlign: 'center', 
                fontWeight: 'bold', fontSize: '9px', padding: '2px 0', display: 'inline-block'
            }}>
                {text}
            </span>
        );
    };

    const oscList = [
        { name: 'RSI (14)', key: 'RSI', valKey: 'RSI' },
        { name: 'Stokastik %K', key: 'STOCH.K', valKey: 'Stoch.K' },
        { name: 'CCI (20)', key: 'CCI', valKey: 'CCI20' },
        { name: 'MACD', key: 'MACD', valKey: 'MACD.macd' },
        { name: 'ADX (14)', key: 'ADX', valKey: 'ADX' },
        { name: 'Williams %R', key: 'W.R', valKey: 'W.R' },
        { name: 'Boğa/Ayı Gücü', key: 'BBPower', valKey: 'BBPower' },
        { name: 'Ult. Osc', key: 'UO', valKey: 'UO' }
    ];

    const maList = [5, 10, 20, 30, 50, 100, 200];

    // Helper to determine MA action (Price vs MA)
    const getMaAction = (val) => {
        if (!val || !currentPrice) return "NEUTRAL";
        return currentPrice > val ? "BUY" : "SELL";
    };

    const pivotTypes = [
        { key: 'Classic', label: 'Klasik' },
        { key: 'Fibonacci', label: 'Fibonacci' },
        { key: 'Camarilla', label: 'Camarilla' },
        { key: 'Woodie', label: 'Woodie' },
        { key: 'Demark', label: 'Demark' }
    ];

    const getPivotData = (type) => {
        return {
            name: type.label,
            S3: indicators[`Pivot.M.${type.key}.S3`],
            S2: indicators[`Pivot.M.${type.key}.S2`],
            S1: indicators[`Pivot.M.${type.key}.S1`],
            Pivot: indicators[`Pivot.M.${type.key}.Middle`],
            R1: indicators[`Pivot.M.${type.key}.R1`],
            R2: indicators[`Pivot.M.${type.key}.R2`],
            R3: indicators[`Pivot.M.${type.key}.R3`],
        };
    };

    return (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '5px', padding: '12px 10px', border: '1px solid var(--border-color)', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '15px', color: 'var(--color-neutral)', display: 'flex', alignItems: 'center', gap: '5px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                <span>🚀</span> OTO-ANALİZ (TRADINGVIEW - ÖZET)
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <div style={{ position: 'relative', width: '160px', height: '80px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '160px', height: '160px', borderRadius: '50%', border: '14px solid rgba(255,255,255,0.1)', boxSizing: 'border-box' }}></div>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '160px', height: '160px', borderRadius: '50%', border: '14px solid #ef4444', borderTopColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent', transform: 'rotate(-45deg)', transformOrigin: 'center', opacity: 0.8, boxSizing: 'border-box' }}></div>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '160px', height: '160px', borderRadius: '50%', border: '14px solid #22c55e', borderLeftColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: 'transparent', transform: 'rotate(45deg)', transformOrigin: 'center', opacity: 0.8, boxSizing: 'border-box' }}></div>
                    
                    <div style={{
                        position: 'absolute', bottom: 0, left: '50%', width: '3px', height: '60px', background: '#fff', transformOrigin: 'bottom center', borderRadius: '3px 3px 0 0',
                        transform: `translateX(-50%) rotate(${rotation}deg)`, transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 10
                    }}>
                        <div style={{ position: 'absolute', bottom: '-3px', left: '50%', width: '10px', height: '10px', background: '#fff', borderRadius: '50%', transform: 'translateX(-50%)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}></div>
                    </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '900', color: colorMap[overallRec], marginBottom: '6px' }}>{textMap[overallRec]}</div>
                </div>
            </div>

            {/* Oscillators Table */}
            <div style={{ marginTop: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>Teknik İndikatörler</div>
                    <div style={{ fontSize: '9px', color: colorMap[oscillators.RECOMMENDATION], fontWeight: 'bold' }}>
                        {textMap[oscillators.RECOMMENDATION]}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '5px', padding: '0 2px' }}>
                    <span>İsim</span>
                    <div style={{ display: 'flex', gap: '15px', width: '80px', justifyContent: 'flex-end' }}>
                        <span style={{ width: '35px', textAlign: 'right' }}>Değer</span>
                        <span style={{ width: '30px', textAlign: 'center' }}>Sinyal</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {oscList.map((osc, idx) => {
                        const val = indicators[osc.valKey];
                        const act = oscillators.COMPUTE[osc.key];
                        return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', padding: '3px 2px', borderRadius: '3px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{osc.name}</span>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', width: '80px', justifyContent: 'flex-end' }}>
                                    <span style={{ color: '#fff', fontFamily: 'var(--font-mono)', width: '35px', textAlign: 'right', fontSize: '9px' }}>{val !== undefined && val !== null ? val.toFixed(2) : '-'}</span>
                                    {renderActionBadge(act)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Moving Averages Table */}
            <div style={{ marginTop: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>Hareketli Ortalama</div>
                    <div style={{ fontSize: '9px', color: colorMap[moving_averages.RECOMMENDATION], fontWeight: 'bold' }}>
                        {textMap[moving_averages.RECOMMENDATION]}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '5px', padding: '0 2px' }}>
                    <span style={{ width: '35px' }}>İsim</span>
                    <div style={{ display: 'flex', gap: '5px', flex: 1, justifyContent: 'flex-end' }}>
                        <span style={{ width: '80px', textAlign: 'center' }}>Basit (SMA)</span>
                        <span style={{ width: '80px', textAlign: 'center' }}>Üssel (EMA)</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {maList.map((len, idx) => {
                        const sma = indicators[`SMA${len}`];
                        const ema = indicators[`EMA${len}`];
                        return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', padding: '3px 2px', borderRadius: '3px' }}>
                                <span style={{ color: 'var(--text-muted)', width: '35px', fontWeight: 'bold' }}>{len}</span>
                                <div style={{ display: 'flex', gap: '5px', flex: 1, justifyContent: 'flex-end' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '80px', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{sma ? sma.toFixed(2) : '-'}</span>
                                        {renderActionBadge(getMaAction(sma))}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '80px', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{ema ? ema.toFixed(2) : '-'}</span>
                                        {renderActionBadge(getMaAction(ema))}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Pivot Points Table */}
            <div style={{ marginTop: '25px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-highlight)', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '8px' }}>
                    Pivot Noktaları
                </div>
                <div style={{ overflowX: 'auto', width: '100%', paddingBottom: '5px' }}>
                    <table style={{ width: '100%', fontSize: '9px', color: 'var(--text-muted)', borderCollapse: 'collapse', textAlign: 'center', minWidth: '320px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '3px', textAlign: 'left' }}>İsim</th>
                                <th style={{ padding: '3px' }}>S3</th>
                                <th style={{ padding: '3px' }}>S2</th>
                                <th style={{ padding: '3px' }}>S1</th>
                                <th style={{ padding: '3px', color: '#fff' }}>Pivot</th>
                                <th style={{ padding: '3px' }}>R1</th>
                                <th style={{ padding: '3px' }}>R2</th>
                                <th style={{ padding: '3px' }}>R3</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotTypes.map((pt, idx) => {
                                const p = getPivotData(pt);
                                return (
                                    <tr key={idx} style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                        <td style={{ padding: '3px', textAlign: 'left', fontWeight: 'bold' }}>{p.name}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.S3 ? p.S3.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.S2 ? p.S2.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.S1 ? p.S1.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)', color: '#fff', fontWeight: 'bold' }}>{p.Pivot ? p.Pivot.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.R1 ? p.R1.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.R2 ? p.R2.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.R3 ? p.R3.toFixed(2) : '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TechnicalRatingsWidget;
